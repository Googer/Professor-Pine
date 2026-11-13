import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { partyOver } from '../commands/parties/reply.js';
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import {
  bossMoves,
  raidChangeAs,
  type RaidChangeAnswer,
  type RaidChanging,
} from '../commands/raids/raid-changes.js';
import { reportedBoss, reportedTime, type ReportedBoss } from '../commands/raids/raid-input.js';
import {
  RAID_COMMAND,
  RAID_THROTTLE,
  REPORT_BARRED,
  mayJoinNoting,
  reportBarred,
  reportRaidAs,
  reportWords,
  type RaidReporting,
  type ReportAccess,
  type ReportNames,
} from '../commands/raids/report.js';
import type { Region } from '../db/repositories/region-repository.js';
import { UserError } from '../discord/errors.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import { isRaid, type RaidParty } from '../domain/party/party.js';
import type { MapRaid } from '../domain/web/party-data.js';
import { mapParty } from '../domain/web/party-view.js';
import {
  RAID_CHANGES,
  type RaidAnswer,
  type RaidChange,
  type RaidMovesView,
} from '../domain/web/raid-options-data.js';
import type { RaidChangeAsked } from '../domain/web/raid-manage.js';
import { raidChangeWindow } from '../commands/parties/windows.js';
import { forumBarred } from '../services/forum-access.js';
import { gymRegionsInGuild } from '../services/region-directory.js';
import {
  actingOnTheMap,
  givenBackOnTheMap,
  isMapStaff,
  memberOrFailure as mapMemberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { shownAfter } from './post-drawn.js';
import { postGuard } from './csrf.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { requestZone } from './request-zone.js';
import { raidOptions } from '../commands/raids/raid-options.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/** The requests for the pick lists one address may make in a minute (a form asks once). */
const OPTIONS_PER_MINUTE = 30;

/** The reports and changes of raids one address may send in a minute, whoever sends them. */
export const RAID_WRITES_PER_ADDRESS_MINUTE = 30;

/**
 * What reporting and changing raids on the map read and call (plan 8M-4): exactly what `/raid`,
 * `/hatch`, `/end`, `/boss` and `/moveset` use (the readers' sources, the members' settings, the
 * party and raid services, the gyms and regions), so that the map shares their code paths.
 */
export type RaidWebContext = RaidChanging &
  RaidReporting &
  Pick<AppContext, 'gyms' | 'regions' | 'servers'>;

/** What the raids of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface RaidWebDeps {
  ctx: RaidWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
}

/**
 * The body of a report: the gym (by id, as `/api/geo` lists it), the region when the gym lies in
 * several, the boss or egg as `/raid` takes it (a value of the pick list, or typed), and the time
 * as `/raid` takes it (minutes from now, or a clock time). Anything else is malformed.
 */
const reportBodySchema = z
  .object({
    gym: z.number().int().positive(),
    region: z.number().int().positive().optional(),
    boss: z.string().trim().min(1).max(100),
    time: z.string().max(40).optional(),
  })
  .strict();

/** What a report answers for a gym that lies in several regions without one picked. */
export const SEVERAL_REGIONS =
  'This gym lies in several regions: pick the one to report the raid in.';

/** The status of each outcome of a report. */
const REPORT_STATUS = {
  created: 200,
  exists: 409,
  'gym-gone': 422,
  'no-region': 422,
  'no-forum': 422,
  'no-post': 422,
  barred: 403,
  'none-there': 404,
} as const;

/** A text a command's option takes: trimmed, not empty, within the option's length. */
const optionText = (max: number) => z.string().trim().min(1).max(max);

/** The bodies of the changes, as the commands' options are: anything else is malformed. */
const timeBodySchema = z.object({ time: optionText(40) }).strict();
const bossBodySchema = z.object({ boss: optionText(100) }).strict();
const movesBodySchema = z
  .object({ quick: optionText(100).optional(), charge: optionText(100).optional() })
  .strict();

/** A change of a raid with what it sets, as its command's options give it. */
type ChangeInput = RaidChangeAsked;

/** The change a body asks for; undefined for a malformed body. */
function changeInput(change: RaidChange, body: unknown): ChangeInput | undefined {
  switch (change) {
    case 'hatch':
    case 'end': {
      const parsed = timeBodySchema.safeParse(body);
      return parsed.success ? { change, time: parsed.data.time } : undefined;
    }
    case 'boss': {
      const parsed = bossBodySchema.safeParse(body);
      return parsed.success ? { change, boss: parsed.data.boss } : undefined;
    }
    case 'moves': {
      const parsed = movesBodySchema.safeParse(body);
      return parsed.success
        ? { change, quick: parsed.data.quick ?? null, charge: parsed.data.charge ?? null }
        : undefined;
    }
  }
}

function isRaidChange(value: string): value is RaidChange {
  return (RAID_CHANGES as readonly string[]).includes(value);
}

/** The status of each outcome of a change. */
const CHANGE_STATUS: Readonly<Record<RaidChangeAnswer['kind'], number>> = {
  ok: 200,
  refused: 422,
  gone: 409,
};

/** What the moves of a raid answer while it has no boss whose moves are known. */
const NO_MOVES = 'This raid has no boss whose moves I know yet.';

/** The address of a raid's change or moves: `/api/raids/<party id>/<change>`. */
type ChangeRequest = FastifyRequest<{ Params: { guild: string; party: string; change: string } }>;

/**
 * The raids of the live map (spec 3.5, 3.6): the pick lists of a report for members of the server
 * (`/s/<guild>/api/raid-options`: `raidOptions`, an ETag of its JSON, `private, no-cache`, 304
 * when the page has it), and a report (`POST /s/<guild>/api/raids`), which is `/raid` as the
 * member: the same reader, the same report, the same throttle, the command's words.
 */
export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { sessions, raids, parties } = deps;
  const { ctx } = raids;

  /** The words of a command as text of the page, in the zone of the request's server. */
  const words = (text: string, request: FastifyRequest): string =>
    pageWords(text, requestZone(request), deps.now());

  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
    raids.channelName(region.channelId) ?? `Region ${region.id}`;

  /** A region in a sentence: `#west` as its channel reads, else `Region 5` (`regionName`). */
  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string =>
    raids.channelName(region.channelId) === undefined
      ? regionName(region)
      : `#${regionName(region)}`;

  /** How the map's answers name a post (not at all: the page opens the raid) and a region. */
  const names: ReportNames = {
    post: () => undefined,
    channel: (channelId) => {
      const region = ctx.regions.byChannel(channelId);
      return region ? regionInWords(region) : `#${raids.channelName(channelId) ?? 'unknown'}`;
    },
  };

  /** How the member stands to a forum; rejects while Discord cannot say. */
  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);

  /**
   * What `/raid`'s check of a report's forums (`reportBarred`) asks, on the map's deps; made per
   * report, as the raids' deps are read only when used (a server without them still starts).
   */
  const reportAccess = (): ReportAccess => ({
    partyService: ctx.partyService,
    parties: parties.store,
    memberAccess: (forumId, memberId) => parties.forums.memberAccess(forumId, memberId),
  });

  /** A raid as the member sees it on the map now (`mapParty`): none without its post yet. */
  const viewOf = (
    guildId: string,
    guildRow: number,
    party: RaidParty,
    userId: string,
    staff: boolean,
    /** The request whose server's zone the view is in (`requestZone`). */
    request: FastifyRequest,
  ): MapRaid | undefined => {
    const shown = mapParty(party, {
      guildId,
      guildRow,
      parties: [],
      memberId: userId,
      barred: new Set(),
      now: deps.now(),
      zone: requestZone(request),
      readOnly: false,
      staff,
      look: (raid) => parties.look(raid),
      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
      pictureOrigins: deps.pictureOrigins,
    });
    return shown?.kind === 'raid' ? shown : undefined;
  };

  /** Discord could not say how the member stands to a forum: nothing is written. */
  const unreachable = (
    reply: FastifyReply,
    err: unknown,
    guild: string,
    userId: string,
    doing: string,
  ) => unreachableOnTheMap(deps, reply, err, guild, userId, doing);

  /** Whether somebody is a member who counts on the map, for a GET; the answer sent if not. */
  const memberOrFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    guild: string,
    userId: string,
  ) => mapMemberOrFailure(deps, request, reply, guild, userId);

  /** The active raid of this server by id, as the store has it (an ended one is not there). */
  const activeRaid = async (guild: string, partyId: string) => {
    const row = await parties.guilds.idFor(guild);
    const party = parties.store.get(partyId);
    return row !== undefined && party?.guildId === row && party.status === 'active' && isRaid(party)
      ? { row, party }
      : undefined;
  };

  const optionsRead = limitedRead(OPTIONS_PER_MINUTE, deps);
  scope.get(
    '/api/raid-options',
    { onRequest: optionsRead },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const refused = await memberOrFailure(request, reply, request.params.guild, session.userId);
      if (refused) return refused;
      const zone = requestZone(request);
      const body = JSON.stringify(raidOptions(ctx.raidBosses.bosses(zone), zone));
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  // A report (spec 3.6): before the body is read (`onRequest`), at most
  // `RAID_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST (Origin,
  // session, CSRF token). Then who reports (`actingOnTheMap`), the gym (one of a region of this
  // server, else 404: nobody learns of other servers' gyms), the region when it lies in several
  // (asked for with the regions), how the member stands to the forum the raid would go to and to
  // that of a raid already at the gym, which the report would join (barred 403, as
  // `AccessService` would not let them in), and only then `/raid`'s throttle in
  // its own window, so that a report refused for who reports or where is not counted; then
  // `/raid`'s reader and report as the member (`reportRaidAs`), and the command's words.
  const writeLimiter = new RateLimiter({ uses: RAID_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];
  scope.post('/api/raids', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = reportBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, 'reported a raid');
    if ('sent' in acting) return acting.sent;
    /** What came of the report, logged as a command is, a refusal too (plan 8S-3); never a text. */
    const noted = <T>(outcome: string, sent: T): T => {
      deps.log.info(
        { user: userId, guild, gym: body.data.gym, outcome },
        'a raid was reported on the map',
      );
      return sent;
    };
    const row = await parties.guilds.idFor(guild);
    const gym = ctx.gyms.get(body.data.gym);
    const lying =
      gym === undefined || row === undefined
        ? []
        : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, row);
    const [first] = lying;
    if (gym === undefined || row === undefined || first === undefined) {
      return noted('no-gym', sendFailure(request, reply, 404));
    }
    const picked =
      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
    if (picked === undefined) {
      const ask: RaidAnswer = {
        ok: false,
        text: SEVERAL_REGIONS,
        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
      };
      return noted('several-regions', reply.code(422).send(ask));
    }
    const regionChannelId = picked.channelId;
    const forum = ctx.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
    // The forum the raid would go to, and that of a raid already at the gym, which the report
    // would join and which may stand in another forum of the server: `/raid`'s own check.
    try {
      if (await reportBarred(reportAccess(), gym, regionChannelId, row, userId, deps.now())) {
        return noted('barred', reply.code(403).send({ error: REPORT_BARRED }));
      }
    } catch (err) {
      return noted('unreachable', unreachable(reply, err, guild, userId, 'reported a raid'));
    }
    const throttled = throttledOnTheMap(
      deps,
      reply,
      { command: RAID_COMMAND },
      userId,
      RAID_THROTTLE,
    );
    if (throttled) return noted('throttled', throttled);
    const countedAt = deps.now();
    let reported: ReportedBoss;
    let time: ReturnType<typeof reportedTime>;
    try {
      reported = reportedBoss(ctx, body.data.boss, requestZone(request));
      time = reportedTime(ctx, reported, body.data.time ?? null, deps.now(), requestZone(request));
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      const refused: RaidAnswer = { ok: false, text: words(err.message, request) };
      return noted('refused', reply.code(422).send(refused));
    }
    // A raid reported at the gym since the check above, in a forum it did not see, is asked
    // about where the report would join it.
    const joining = mayJoinNoting(reportAccess(), userId);
    let result: Awaited<ReturnType<typeof reportRaidAs>>;
    try {
      result = await reportRaidAs(ctx, acting.member, gym, {
        reported,
        time,
        regionChannelId,
        mayJoin: joining.mayJoin,
      });
    } catch (err) {
      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
      givenBackOnTheMap(deps, RAID_COMMAND, userId, RAID_THROTTLE, countedAt);
      throw err;
    }
    const failed = joining.failure();
    if (failed) {
      return noted('unreachable', unreachable(reply, failed.err, guild, userId, 'reported a raid'));
    }
    const { outcome } = result;
    // None of the member's doing (the bot may not make posts in the forum, the post was lost
    // while it was made): given back too.
    if (outcome.kind === 'no-post') {
      givenBackOnTheMap(deps, RAID_COMMAND, userId, RAID_THROTTLE, countedAt);
    }
    let raid: MapRaid | undefined;
    if (outcome.kind === 'created' || outcome.kind === 'exists') {
      // A raid already there may be in another forum of the server: shown only when the
      // member is not kept out of it.
      let shown = outcome.party.forumChannelId === forum;
      if (!shown) {
        try {
          shown = (await accessTo(outcome.party.forumChannelId, userId)) !== 'barred';
        } catch {
          shown = false;
        }
      }
      const staff = isMapStaff(acting.standing, userId, parties.ownerId);
      if (shown) raid = viewOf(guild, row, outcome.party, userId, staff, request);
    }
    // The region picked has no forum: the raid went to another region of the gym, said by name.
    const postedIn =
      outcome.kind === 'created' &&
      outcome.party.regionId !== null &&
      outcome.party.regionId !== picked.id
        ? ctx.regions.byId(outcome.party.regionId)
        : undefined;
    const answer: RaidAnswer = {
      ok: outcome.kind === 'created',
      text:
        words(reportWords(result, gym, reported.label, names), request) +
        (postedIn ? ` It was posted in ${regionInWords(postedIn)}.` : ''),
      ...(raid ? { raid } : {}),
    };
    return noted(outcome.kind, reply.code(REPORT_STATUS[outcome.kind]).send(answer));
  });

  // The moves the raid's boss can have, for the form of a change (as `/moveset` lists them):
  // members only, an active raid of this server (409 otherwise) in a forum the member is not
  // kept out of (403; 503 while Discord cannot say).
  scope.get(
    '/api/raids/:party/moves',
    { onRequest: optionsRead },
    async (request: ChangeRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild, party: partyId } = request.params;
      const refused = await memberOrFailure(request, reply, guild, session.userId);
      if (refused) return refused;
      const found = await activeRaid(guild, partyId);
      if (!found) return reply.code(409).send({ error: partyOver({ type: 'raid' }) });
      // Nothing of a raid in a forum the member is kept out of, as the list leaves it out.
      try {
        if (await forumBarred(accessTo, found.party.forumChannelId, session.userId)) {
          return sendFailure(request, reply, 403);
        }
      } catch (err) {
        deps.log.warn(
          { err, guild, user: session.userId },
          "could not ask Discord about a raid's forum on the web pages",
        );
        return sendFailure(request, reply, 503);
      }
      const moves = bossMoves(ctx, found.party);
      if (!moves) return reply.code(422).send({ error: NO_MOVES });
      const view: RaidMovesView = moves;
      return view;
    },
  );

  // A change of a raid (spec 3.6), as its command makes it: before the body is read, the
  // per-address limit, the guard of every POST and a change the map knows (404 otherwise). Then
  // the body (400), who changes it (`actingOnTheMap`), the raid as the store has it (an active raid
  // of this server; anything else 409 "This raid is over.", as the post's buttons answer), how
  // the member stands to its forum (barred 403; anybody else may change it, as anybody in its
  // post may on Discord: plan 8M-8B), and only then the command's own throttle in its window; then the command's code path (`changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`)
  // and its words as text.
  const knownChange = async (request: ChangeRequest, reply: FastifyReply) => {
    if (!isRaidChange(request.params.change)) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/raids/:party/:change',
    { onRequest: [...writeGuards, knownChange] },
    async (request: ChangeRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const { guild, party: partyId, change } = request.params;
      const input = isRaidChange(change) ? changeInput(change, request.body ?? {}) : undefined;
      if (!input) return sendFailure(request, reply, 400);
      const { userId } = session;
      const doing = 'changed a raid';
      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
      if ('sent' in acting) return acting.sent;
      const found = await activeRaid(guild, partyId);
      if (!found) {
        const gone: RaidAnswer = { ok: false, text: partyOver({ type: 'raid' }) };
        return reply.code(409).send(gone);
      }
      const { row, party } = found;
      try {
        // The rule of the post's Manage… too (review M10).
        if (await forumBarred(accessTo, party.forumChannelId, userId)) {
          return sendFailure(request, reply, 403);
        }
      } catch (err) {
        return unreachable(reply, err, guild, userId, doing);
      }
      // Anybody the map shows the raid to may change it, as anybody in its post may on Discord
      // (plan 8M-8B, Matt's ruling): a member barred from its forum was refused above.
      const staff = isMapStaff(acting.standing, userId, parties.ownerId);
      const throttled = throttledOnTheMap(
        deps,
        reply,
        { command: raidChangeWindow(input.change).command },
        userId,
        CHANGE_THROTTLE,
      );
      if (throttled) return throttled;
      const countedAt = deps.now();
      const { member } = acting;
      // The map links no post: a refusal for a gym another raid holds names none.
      const noPost = () => undefined;
      let answer: RaidChangeAnswer;
      try {
        answer = await raidChangeAs(ctx, party, member, input, deps.now(), noPost);
      } catch (err) {
        // None of the member's doing (the store failed): the use goes back, as the router gives
        // back the command's (plan 8S-4). A refusal is the member's and stays counted.
        if (!(err instanceof UserError) || err.givesBack) {
          givenBackOnTheMap(
            deps,
            raidChangeWindow(input.change).command,
            userId,
            CHANGE_THROTTLE,
            countedAt,
          );
        }
        if (!(err instanceof UserError)) throw err;
        const refused: RaidAnswer = { ok: false, text: words(err.message, request) };
        return reply.code(422).send(refused);
      }
      deps.log.info(
        { user: userId, guild, party: partyId, change, outcome: answer.kind },
        'a raid was changed on the map',
      );
      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
      const raid =
        answer.kind === 'ok' ? viewOf(guild, row, answer.party, userId, staff, request) : undefined;
      const sent: RaidAnswer = {
        ok: answer.kind === 'ok',
        text: words(answer.text, request),
        ...(raid ? { raid } : {}),
      };
      return reply.code(CHANGE_STATUS[answer.kind]).send(sent);
    },
  );
}
