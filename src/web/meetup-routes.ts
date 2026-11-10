import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { BLOCKED_FROM_CHANGING } from '../commands/meetups/meetup-changes.js';
import { meetupChangeWindow } from '../commands/parties/windows.js';
import {
  meetupChangeAs,
  meetupChangeCheck,
  meetupTimesCheck,
  type MeetupChangeRefused,
} from '../commands/meetups/meetup-manage.js';
import {
  ASK_ON_DISCORD,
  makeMeetupAs,
  MEETUP_THROTTLE,
  NO_INFORMATION,
  NO_MEETUP_HERE,
  NO_MEETUPS_FOR_YOU,
  refusalOf,
} from '../commands/meetups/meetup.js';
import { OPEN_PARTIES_FULL, openPartiesFull } from '../commands/parties/open-parties.js';
import { partyOver } from '../commands/parties/reply.js';
import {
  newPartyTimes,
  noForumWords,
  setTimesAs,
  timedTimeHint,
  typedNewEnd,
  typedTimedTime,
  type TimedAnswer,
} from '../commands/parties/timed.js';
import { PIN_NOT_HERE, PLACE_GONE, pickedPlace } from '../commands/place-option.js';
import type { ReportNames } from '../commands/raids/report.js';
import type { Region } from '../db/repositories/region-repository.js';
import { UserError } from '../discord/errors.js';
import type { MemberStanding } from '../discord/member-directory.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import type { Place } from '../domain/geo/place.js';
import { rulingKeyOf } from '../domain/meetups/safety.js';
import { tidyDescription } from '../domain/party/meetup.js';
import {
  isMeetup,
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  type MeetupParty,
} from '../domain/party/party.js';
import { tidyName } from '../domain/party/timed.js';
import {
  MAX_MAP_STOPS,
  MEETUP_CHANGES,
  MEETUP_NOT_YOURS,
  type MeetupAnswer,
  type MeetupChange,
  type StopsView,
} from '../domain/web/meetup-data.js';
import type { MapMeetup } from '../domain/web/party-data.js';
import { mapParty } from '../domain/web/party-view.js';
import { problemText } from '../render/activity.js';
import { forumBarred } from '../services/forum-access.js';
import { MEETUP_PLACE_KINDS } from '../services/place-finder.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  givenBackOnTheMap,
  isMapBotStaff,
  isMapStaff,
  memberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { shownAfter } from './post-drawn.js';
import { timesCountedOnTheMap } from './times-on-map.js';
import { postGuard } from './csrf.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { placesFor, placesQuerySchema } from './wayspot-box.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/**
 * What the meetups of the live map read and call (plan 8M-5M): exactly what `/meetup` and its
 * form, `/name`, `/info`, `/meet` and `/end` use (meetup safety, the timed parties, the limits of
 * words, the settings, the regions), and what names a place as `/meetup near:` names it (the
 * gyms, the kept Wayspots, the place search), so that the map shares their code paths.
 */
export type MeetupWebContext = Pick<
  AppContext,
  | 'meetupSafety'
  | 'attendance'
  | 'timedParties'
  | 'config'
  | 'regions'
  | 'gyms'
  | 'wayspots'
  | 'placeFinder'
>;

/** What the meetups of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface MeetupWebDeps {
  ctx: MeetupWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
}

/** The writes of meetups one address may send in a minute, whoever sends them. */
export const MEETUP_WRITES_PER_ADDRESS_MINUTE = 30;

/** The questions for the stops in a box one address may ask in a minute (each pan of the map). */
const STOPS_PER_MINUTE = 120;

/** The command a meetup made on the map counts as (`MEETUP_THROTTLE`, in its window). */
export const MEETUP_COMMAND = 'meetup';

/**
 * What the map answers for a place that is no gym, PokéStop or pin (Matt, 2026-10-17: never a
 * power spot; the map offers none).
 */
export const MAP_PLACE_KINDS_ONLY = 'A meetup can be at a gym, a PokéStop or a pin.';

/**
 * What a member blocked from making meetups is told on the map: the map has no Appeal button, so
 * it points them to `/meetup` (8S-1's follow-up).
 */
export const MAP_BLOCKED = `${NO_MEETUPS_FOR_YOU} To appeal, use /meetup on Discord and press "Appeal…".`;

/** `/name` and `/info`'s refusal of a blocked maker, on the map, which has no Appeal button. */
export const MAP_BLOCKED_FROM_CHANGING = `${BLOCKED_FROM_CHANGING} To appeal, use /meetup on Discord and press "Appeal…".`;

/** What the map's answer adds after a meetup is made: how to change it there. */
export const MANAGE_IN_POPUP =
  'To change its name, information or times, use Manage… in its popup.';

/** A place picked on the map: a gym or stop by kind and id, or a pin dropped by a click. */
const placeSchema = z.union([
  z.object({ kind: z.string().min(1).max(20), id: z.string().min(1).max(60) }).strict(),
  z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict(),
]);

/**
 * The body of a new meetup: the region (by id, as `/api/geo` lists it), the name as `/meetup`
 * takes it (blanks allowed so that they are refused in its words), the place, the start and the
 * end as its options take them (up to 100; the end optional, left out by a page from before), the
 * information as its form takes it. Anything else is malformed.
 */
const makeBodySchema = z
  .object({
    region: z.number().int().positive(),
    name: z.string().max(MAX_PARTY_NAME),
    place: placeSchema,
    start: z.string().max(100),
    end: z.string().max(100).optional(),
    info: z.string().max(MAX_MEETUP_DESCRIPTION),
  })
  .strict();

/** A point kept to six decimals (about 10 cm), as the map's outlines and pins are. */
const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;

/** The Wayfarer kinds a pick on the map may name: a gym or a PokéStop (`MEETUP_PLACE_KINDS`). */
function isMeetupKind(kind: string): boolean {
  return (MEETUP_PLACE_KINDS as readonly string[]).includes(kind);
}

/**
 * The meetups of the live map (spec 3.7): making one (`POST /s/<guild>/api/meetups`), which is
 * `/meetup` and its form as the member in the region picked, at a gym, a PokéStop or a pin picked
 * on the map, through meetup safety; and the PokéStops of a box of the map, to pick a place from
 * (`GET /s/<guild>/api/stops`).
 */
export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { sessions, parties, meetups } = deps;
  const { ctx } = meetups;

  /** The words of a command as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /** A region in a sentence: `#west` as its channel reads, else `Region 5`. */
  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string => {
    const name = meetups.channelName(region.channelId);
    return name === undefined ? `Region ${region.id}` : `#${name}`;
  };

  /** How the map's answers name a post (not at all: the page shows the meetup) and a region. */
  const names: ReportNames = {
    post: () => undefined,
    channel: (channelId) => {
      const region = ctx.regions.byChannel(channelId);
      return region ? regionInWords(region) : `#${meetups.channelName(channelId) ?? 'unknown'}`;
    },
  };

  /** How the member stands to a forum; rejects while Discord cannot say. */
  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);

  /** A meetup as the member sees it on the map now (`mapParty`): none without its post yet. */
  const viewOf = (
    guildId: string,
    guildRow: number,
    party: MeetupParty,
    userId: string,
    standing: MemberStanding,
  ): MapMeetup | undefined => {
    const shown = mapParty(party, {
      guildId,
      guildRow,
      parties: [],
      memberId: userId,
      barred: new Set(),
      now: deps.now(),
      zone: parties.zone,
      readOnly: false,
      staff: isMapStaff(standing, userId, parties.ownerId),
      botStaff: isMapBotStaff(standing, userId, parties.ownerId),
      look: (raid) => parties.look(raid),
      ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
      pictureOrigins: deps.pictureOrigins,
    });
    return shown?.kind === 'meetup' ? shown : undefined;
  };

  /** A refusal in the command's words, as text of the page. */
  const refuse = (reply: FastifyReply, status: number, text: string, meetup?: MapMeetup) => {
    const answer: MeetupAnswer = { ok: false, text: words(text), ...(meetup ? { meetup } : {}) };
    return reply.code(status).send(answer);
  };

  /**
   * The place a body names, as `/meetup near:` would name it (`pickedPlace`, `PlaceFinder.pin`
   * with `MEETUP_PLACE_KINDS`, the same snapshots), or the refusal: a kind that is no gym or
   * PokéStop, a gym or stop gone or of no region of the server, a pin outside its regions.
   */
  const placeOf = (
    row: number,
    body: z.infer<typeof placeSchema>,
  ): { place: Place } | { refusal: string } => {
    if ('kind' in body) {
      if (!isMeetupKind(body.kind)) return { refusal: MAP_PLACE_KINDS_ONLY };
      const place = pickedPlace(ctx, row, `${body.kind}:${body.id}`);
      return place ? { place } : { refusal: PLACE_GONE };
    }
    const point = { lat: sixDecimals(body.lat), lon: sixDecimals(body.lon) };
    const pin = ctx.placeFinder.pin(row, point, null, MEETUP_PLACE_KINDS);
    return pin ? { place: pin } : { refusal: PIN_NOT_HERE };
  };

  const writeLimiter = new RateLimiter({ uses: MEETUP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];

  // A new meetup (spec 3.7): before the body is read (`onRequest`), the per-address limit and the
  // guard of every POST. Then the session (403) and the body (400), who makes it
  // (`actingOnTheMap`), the region (one of this server, else 404), its forum (none: `/meetup`'s
  // words; barred 403; Discord unreachable 503), then what `/meetup`'s guards and form refuse, in
  // their order and words (a bad name; a member blocked, 403 pointed to `/meetup`; the place; the
  // start; the place refused for good, or a start too soon for the moderators; no information),
  // and only then `/meetup`'s throttle in its window; then its code path as the member
  // (`makeMeetupAs` over `MeetupSafety.make`), the request marked as the map's.
  scope.post('/api/meetups', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = makeBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'made a meetup';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    /**
     * What came of the request, logged as a command is, a refusal too (plan 8S-3), with the
     * region once it is one of the server's; never a text or the place.
     */
    const note = (outcome: string, region?: number): void => {
      deps.log.info(
        { user: userId, guild, ...(region === undefined ? {} : { region }), outcome },
        'a meetup was made on the map',
      );
    };
    const noted = <T>(outcome: string, sent: T, region?: number): T => {
      note(outcome, region);
      return sent;
    };
    const row = await parties.guilds.idFor(guild);
    const region = ctx.regions.byId(body.data.region);
    if (row === undefined || region === undefined || region.guildId !== row) {
      return noted('no-region', sendFailure(request, reply, 404));
    }
    /** A refusal in `/meetup`'s words, logged as `refused` (or `outcome`). */
    const refused = (status: number, text: string, outcome = 'refused') =>
      noted(outcome, refuse(reply, status, text), region.id);
    if (region.forumChannelId === null) {
      return refused(422, noForumWords(regionInWords(region)), 'no-forum');
    }
    try {
      if (await forumBarred(accessTo, region.forumChannelId, userId)) {
        return noted('barred', sendFailure(request, reply, 403), region.id);
      }
    } catch (err) {
      return noted(
        'unreachable',
        unreachableOnTheMap(deps, reply, err, guild, userId, doing),
        region.id,
      );
    }
    if (tidyName(body.data.name) === undefined) {
      return refused(422, problemText('bad-name', ctx.attendance.limits(), 'meetup'));
    }
    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
    // Before the place and the start, as `/meetup` asks it: a blocked member hears of the block.
    if (await ctx.meetupSafety.blocked(guild, userId, staff)) {
      return refused(403, MAP_BLOCKED, 'blocked');
    }
    const where = placeOf(row, body.data.place);
    if ('refusal' in where) return refused(422, where.refusal);
    const now = deps.now();
    let startTime: number;
    let endTime: number | undefined;
    try {
      const typed = typedTimedTime(ctx, newPartyTimes('meetup', now), 'meet', body.data.start, now);
      if (typed === 'unset') {
        return refused(
          422,
          `Give the time the meetup starts. ${timedTimeHint(now, ctx.config.settings.timezone)}`,
        );
      }
      startTime = typed.at;
      // As `/meetup end:` reads it (`typedNewEnd`): one path, the same words.
      endTime = typedNewEnd(ctx, 'meetup', startTime, body.data.end ?? null, now);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      return refused(422, err.message);
    }
    // The block is read above: not again.
    const verdict = await ctx.meetupSafety.verdict({
      serverId: guild,
      place: where.place,
      makerId: userId,
      staff,
      blocked: false,
    });
    const refusal = refusalOf(verdict, startTime, now);
    if (refusal === NO_MEETUP_HERE) {
      // The map has no Ask the moderators: it says where to find it (plan 8S-2).
      const key = rulingKeyOf(where.place);
      const state =
        key === undefined
          ? undefined
          : await ctx.meetupSafety.askState(guild, key, userId).catch(() => undefined);
      return refused(422, state?.kind === 'may' ? `${refusal} ${ASK_ON_DISCORD}` : refusal);
    }
    if (refusal !== undefined) return refused(422, refusal);
    if (tidyDescription(body.data.info) === null) return refused(422, NO_INFORMATION);
    if (
      await openPartiesFull(
        { parties: parties.store, guilds: parties.guilds, meetupSafety: ctx.meetupSafety },
        guild,
        userId,
        staff,
      )
    ) {
      return refused(422, OPEN_PARTIES_FULL, 'open-parties');
    }
    const throttled = throttledOnTheMap(
      deps,
      reply,
      { command: MEETUP_COMMAND },
      userId,
      MEETUP_THROTTLE,
    );
    if (throttled) return noted('throttled', throttled, region.id);
    const countedAt = deps.now();
    let answer: Awaited<ReturnType<typeof makeMeetupAs>>;
    try {
      answer = await makeMeetupAs(
        ctx,
        {
          serverId: guild,
          regionChannelId: region.channelId,
          maker: acting.member,
          place: where.place,
          name: body.data.name,
          startTime,
          ...(endTime === undefined ? {} : { endTime }),
          description: body.data.info,
          staff,
          source: 'map',
        },
        names,
      );
    } catch (err) {
      // No fault of the member's (a post Discord refused): the use is given back, as on Discord.
      givenBackOnTheMap(deps, MEETUP_COMMAND, userId, MEETUP_THROTTLE, countedAt);
      throw err;
    }
    note(answer.kind, region.id);
    switch (answer.kind) {
      case 'blocked':
        return refuse(reply, 403, MAP_BLOCKED);
      case 'refused':
        // None of the member's doing (the post could not be made): given back, as on Discord.
        if (answer.givesBack === true) {
          givenBackOnTheMap(deps, MEETUP_COMMAND, userId, MEETUP_THROTTLE, countedAt);
        }
        return refuse(reply, 422, answer.text);
      case 'held': {
        const held: MeetupAnswer = { ok: true, outcome: 'held', text: words(answer.text) };
        return reply.send(held);
      }
      case 'posted': {
        const party = parties.store.get(answer.party.id);
        const meetup =
          party?.type === 'meetup' ? viewOf(guild, row, party, userId, acting.standing) : undefined;
        const posted: MeetupAnswer = {
          ok: true,
          outcome: 'posted',
          text: words(`${answer.text} ${MANAGE_IN_POPUP}`),
          ...(meetup ? { meetup } : {}),
        };
        return reply.send(posted);
      }
    }
  });

  /** The active meetup of this server by id, as the store has it (an ended one is not there). */
  const activeMeetup = async (guild: string, partyId: string) => {
    const row = await parties.guilds.idFor(guild);
    const party = parties.store.get(partyId);
    return row !== undefined &&
      party?.guildId === row &&
      party.status === 'active' &&
      isMeetup(party)
      ? { row, party }
      : undefined;
  };

  /**
   * What a change of a meetup answers: 200 when it was made; 409 when the meetup has ended, or
   * the change was drawn from what it no longer is; 422 for any other refusal; the words as text,
   * and the meetup as the member sees it now (not once it has ended).
   */
  const changed = (
    reply: FastifyReply,
    guild: string,
    row: number,
    partyId: string,
    userId: string,
    standing: MemberStanding,
    answer: TimedAnswer,
  ) => {
    const status =
      answer.kind === 'ok'
        ? 200
        : answer.kind === 'gone' || answer.reason === 'changed-meanwhile'
          ? 409
          : 422;
    const party = answer.kind === 'gone' ? undefined : parties.store.get(partyId);
    const meetup =
      party?.status === 'active' && isMeetup(party)
        ? viewOf(guild, row, party, userId, standing)
        : undefined;
    const sent: MeetupAnswer = {
      ok: answer.kind === 'ok',
      text: words(answer.text),
      ...(meetup ? { meetup } : {}),
      ...(answer.kind === 'refused' && answer.went?.length ? { went: answer.went } : {}),
    };
    return reply.code(status).send(sent);
  };

  // A change of a meetup (spec 3.7), as its command makes it: before the body is read, the
  // per-address limit, the guard of every POST and a change the map knows (404 otherwise). Then
  // the session (403) and the body (400), who changes it (`actingOnTheMap`), the meetup (an
  // active meetup of this server as the store has it; anything else 409 as the commands answer
  // it), its forum (barred 403; Discord unreachable 503), whether the member may change it here
  // (its maker or staff, a maker blocked from meetups refused, for its times as for its text: 403,
  // with the meetup), a change drawn from what the meetup no longer is
  // (409 with the meetup as it is now; the service checks it again inside the store), and what
  // `/meet`'s guard refuses of a start (a time it cannot read, 422); only then
  // the command's throttle in its window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE`; a start in
  // `/meet`'s, `START_THROTTLE`); then its code path as the member, with the value drawn.
  /**
   * What every change of a meetup asks after its body: who changes it, the meetup and its forum;
   * whether the member may change it is `meetupChangeCheck`'s and `meetupTimesCheck`'s (plan
   * 8M-21: the checks of the post's Manage… too).
   */
  const meetupWrite = async (
    request: FastifyRequest,
    reply: FastifyReply,
    guild: string,
    partyId: string,
    userId: string,
  ) => {
    const doing = 'changed a meetup';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return { sent: acting.sent };
    const found = await activeMeetup(guild, partyId);
    if (!found) return { sent: refuse(reply, 409, partyOver({ type: 'meetup' })) };
    const { row, party } = found;
    try {
      if (await forumBarred(accessTo, party.forumChannelId, userId)) {
        return { sent: sendFailure(request, reply, 403) };
      }
    } catch (err) {
      return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
    }
    const { member, standing } = acting;
    const meetupNow = () => viewOf(guild, row, party, userId, standing);
    return { row, party, member, standing, meetupNow };
  };

  /** A change refused by its checks, before anything counted: its status and the map's words. */
  const refusedChange = (
    reply: FastifyReply,
    refused: MeetupChangeRefused,
    meetup: MapMeetup | undefined,
  ) => {
    const limits = ctx.attendance.limits();
    switch (refused.reason) {
      case 'not-yours':
        return refuse(reply, 403, NOT_YOURS, meetup);
      case 'blocked':
        return refuse(reply, 403, MAP_BLOCKED_FROM_CHANGING, meetup);
      case 'changed-meanwhile':
        return refuse(reply, 409, problemText('changed-meanwhile', limits, 'meetup'), meetup);
      case 'unread':
        return refuse(reply, 422, refused.text, meetup);
    }
  };

  const knownChange = async (request: MeetupRequest, reply: FastifyReply) => {
    if (!isMeetupChange(request.params.change)) return sendFailure(request, reply, 404);
  };
  scope.post(
    '/api/meetups/:party/:change',
    { onRequest: [...writeGuards, knownChange] },
    async (request: MeetupRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const { guild, party: partyId, change } = request.params;
      if (!isMeetupChange(change)) return sendFailure(request, reply, 404);
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const input = changeInput(change, request.body ?? {});
      if (!input) return sendFailure(request, reply, 400);
      const { userId } = session;
      const writing = await meetupWrite(request, reply, guild, partyId, userId);
      if ('sent' in writing) return writing.sent;
      const { row, party, member, standing, meetupNow } = writing;
      const now = deps.now();
      // The checks of the post's Manage… too (plan 8M-21), uncounted; the drawn value is checked
      // again inside the store, for a change on its way meanwhile.
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const checked = await meetupChangeCheck(ctx, guild, party, userId, staff, input, now);
      if ('refused' in checked) return refusedChange(reply, checked.refused, meetupNow());
      const { start } = checked;
      // The command's window (`meetupChangeWindow`), as the post's Manage… counts it.
      const window = meetupChangeWindow(input.change);
      const counted = { command: window.command, ...(window.varies ? { varies: true } : {}) };
      const { throttle } = window;
      const throttled = throttledOnTheMap(deps, reply, counted, userId, throttle);
      if (throttled) return throttled;
      let answer: TimedAnswer;
      try {
        answer = await countedOnTheMap(deps, counted, userId, throttle, () =>
          meetupChangeAs(ctx, guild, party, member, staff, input, start, now),
        );
      } catch (err) {
        // `/end`'s reader, after its limit as in the command.
        if (!(err instanceof UserError)) throw err;
        return refuse(reply, 422, err.message, meetupNow());
      }
      deps.log.info(
        { user: userId, guild, party: party.id, change, outcome: answer.kind },
        'a meetup was changed on the map',
      );
      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
      return changed(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  // Both times of a meetup in one request: guarded as a change is, each drawn value checked, `/meet`'s
  // guard, both read before anything counts (`readTimes`: unreadable or out of order 422, nothing
  // changed), each counted in its own command's window, and set in the order that lets them stand
  // (`setTimesAs`, shared with a train's Manage…). A time refused gives its use back.
  scope.post(
    '/api/meetups/:party/times',
    { onRequest: writeGuards },
    async (request: FastifyRequest<{ Params: { guild: string; party: string } }>, reply) => {
      void reply.header('cache-control', 'no-store');
      const { guild, party: partyId } = request.params;
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = TIMES_BODY.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const { start, end } = body.data;
      const { userId } = session;
      const writing = await meetupWrite(request, reply, guild, partyId, userId);
      if ('sent' in writing) return writing.sent;
      const { row, party, member, standing, meetupNow } = writing;
      const now = deps.now();
      const staff = isMapStaff(standing, userId, parties.ownerId);
      const checked = await meetupTimesCheck(ctx, guild, party, userId, staff, { start, end }, now);
      if ('refused' in checked) return refusedChange(reply, checked.refused, meetupNow());
      const { read } = checked;
      const counting = timesCountedOnTheMap(deps, reply, userId, read);
      if ('full' in counting) return counting.full;
      let answer: TimedAnswer;
      try {
        answer = await counting.run(() =>
          setTimesAs(ctx, guild, party, { member, staff }, read, now, {
            start: start.drawn,
            end: end.drawn,
          }),
        );
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        counting.givenBack();
        return refuse(reply, 422, err.message, meetupNow());
      }
      if (answer.kind === 'refused') counting.givenBack(answer.went);
      deps.log.info(
        { user: userId, guild, party: party.id, change: 'times', outcome: answer.kind },
        'a meetup was changed on the map',
      );
      const wrote =
        answer.kind === 'ok' || (answer.kind === 'refused' && (answer.went ?? []).length > 0);
      await shownAfter(parties.drawn, party.id, wrote);
      return changed(reply, guild, row, party.id, userId, standing, answer);
    },
  );

  // The PokéStops of a box of the map, to pick a meetup's place from (plan 8M-5M): members only
  // (as the pick lists), those in a region of this server with a title, the nearest to the box's
  // middle first, at most `MAX_MAP_STOPS` (`more` says there were more: the page asks to zoom
  // in). Gyms are on the map already; power spots are offered by `/api/powerspots` (plan 8X-5),
  // for max battles, never for a meetup.
  scope.get(
    '/api/stops',
    { onRequest: limitedRead(STOPS_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      // A box of the map, or the nearest of a point (plan 8M-11A: the Report button's step 2).
      const box = placesQuerySchema.safeParse(request.query ?? {});
      if (!box.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
      if (refused) return refused;
      const row = await parties.guilds.idFor(guild);
      const { found, more } = placesFor(ctx, row, box.data, 'stop', MAX_MAP_STOPS);
      const view: StopsView = { stops: found, more };
      return view;
    },
  );
}

/** What the map answers a member who may not change a meetup there (spec 3.7). */
export const NOT_YOURS = MEETUP_NOT_YOURS;

/** A time as `/meet` and `/end` take it. */
const time = z.string().max(40);
/** A start or end as the view gave it. */
const drawnTime = z.number().int().nullable();

/** The body of each change, as its command's option is, with the value drawn. */
const CHANGE_BODIES = {
  name: z.object({ drawn: z.string().max(MAX_PARTY_NAME), name: z.string().max(MAX_PARTY_NAME) }),
  info: z.object({
    drawn: z.string().max(MAX_MEETUP_DESCRIPTION).nullable(),
    info: z.string().max(MAX_MEETUP_DESCRIPTION),
  }),
  start: z.object({ drawn: drawnTime, time }),
  end: z.object({ drawn: drawnTime, time }),
} as const;

/** The body of both times in one request, each as its change's. */
const TIMES_BODY = z
  .object({ start: CHANGE_BODIES.start.strict(), end: CHANGE_BODIES.end.strict() })
  .strict();

/** A change with what it carries. */
type ChangeInput =
  | ({ change: 'name' } & z.infer<typeof CHANGE_BODIES.name>)
  | ({ change: 'info' } & z.infer<typeof CHANGE_BODIES.info>)
  | ({ change: 'start' } & z.infer<typeof CHANGE_BODIES.start>)
  | ({ change: 'end' } & z.infer<typeof CHANGE_BODIES.end>);

/** The change a body asks for; undefined for a malformed body. */
function changeInput(change: MeetupChange, body: unknown): ChangeInput | undefined {
  switch (change) {
    case 'name': {
      const parsed = CHANGE_BODIES.name.strict().safeParse(body);
      return parsed.success ? { change, ...parsed.data } : undefined;
    }
    case 'info': {
      const parsed = CHANGE_BODIES.info.strict().safeParse(body);
      return parsed.success ? { change, ...parsed.data } : undefined;
    }
    case 'start': {
      const parsed = CHANGE_BODIES.start.strict().safeParse(body);
      return parsed.success ? { change, ...parsed.data } : undefined;
    }
    case 'end': {
      const parsed = CHANGE_BODIES.end.strict().safeParse(body);
      return parsed.success ? { change, ...parsed.data } : undefined;
    }
  }
}

function isMeetupChange(value: string): value is MeetupChange {
  return (MEETUP_CHANGES as readonly string[]).includes(value);
}

/** The address of a meetup's change. */
type MeetupRequest = FastifyRequest<{ Params: { guild: string; party: string; change: string } }>;
