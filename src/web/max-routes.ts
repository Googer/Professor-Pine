import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import {
  maxEndInput,
  readMaxBoss,
  reportedEnd,
  spotAt,
  UnknownMaxBoss,
  WHICH_TIER,
  type MaxReading,
  type ReadMaxBoss,
  type SpotReading,
} from '../commands/max/max-input.js';
import {
  blockedAtPin,
  ENDED_MEANWHILE,
  MAX_BARRED,
  MAX_COMMAND,
  MAX_THROTTLE,
  maxBarred,
  maxReportWords,
  otherBoss,
  reportMaxAs,
  takenWords,
  type MaxAccess,
  type MaxNames,
  type MaxReportResult,
  type MaxReporting,
} from '../commands/max/max-report.js';
import { mayJoinNoting } from '../commands/raids/report.js';
import type { Region } from '../db/repositories/region-repository.js';
import { UserError } from '../discord/errors.js';
import type { MemberStanding } from '../discord/member-directory.js';
import type { MaxParty, MaxSpot } from '../domain/party/party.js';
import { MAX_TIERS } from '../domain/pogo/max-tier.js';
import { maxBossPicture } from '../domain/pogo/pokemon-icons.js';
import { endsSoon, nextRotationEnd } from '../domain/time/max-end.js';
import {
  MAX_MAP_SPOTS,
  type MaxAnswer,
  type MaxNeed,
  type PowerSpotsView,
  type SpotAddressView,
} from '../domain/web/max-data.js';
import type { MapMax } from '../domain/web/party-data.js';
import { mapParty } from '../domain/web/party-view.js';
import { ENDING_SOON, endingSoonQuestion, NEXT_ROTATION } from '../render/max-dialog.js';
import { currentMaxBossChoices } from '../services/max-boss-service.js';
import type { MaxReportOutcome } from '../services/party-service.js';
import { regionsAtPoint } from '../services/region-directory.js';
import {
  actingOnTheMap,
  givenBackOnTheMap,
  isMapBotStaff,
  isMapStaff,
  memberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { postGuard } from './csrf.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { maxOptions } from './max-options.js';
import { pageWords } from './page-words.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { placesFor, placesQuerySchema } from './wayspot-box.js';

/**
 * What the max battles of the live map read and call (plan 8X-5): exactly what `/max` uses (its
 * readers' sources: the settings, the max bosses, the events, the Pokémon search, the game data;
 * the members' settings, the party service, the moderators' notices and the log of its report;
 * the gyms, kept Wayspots and place search that name a spot; meetup safety's blocks; the regions;
 * the active parties), so that the map shares its code paths.
 */
export type MaxWebContext = MaxReading &
  MaxReporting &
  SpotReading &
  Pick<AppContext, 'meetupSafety' | 'regions' | 'parties' | 'wayspotAddresses' | 'servers'>;

/** What the max battles of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface MaxWebDeps {
  ctx: MaxWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
}

/** The requests for the pick lists one address may make in a minute (a form asks once). */
const OPTIONS_PER_MINUTE = 30;

/** The questions for the power spots in a box one address may ask in a minute (each pan). */
const SPOTS_PER_MINUTE = 120;

/** The longest Power Spot id a question of its address may name (as a report's `spot`). */
const MAX_SPOT_ID = 60;

/** A question of a Power Spot's address: the server and the spot's Wayfarer id. */
type SpotAddressRequest = FastifyRequest<{ Params: { guild: string; spot: string } }>;

/** The reports of max battles one address may send in a minute, whoever sends them. */
export const MAX_WRITES_PER_ADDRESS_MINUTE = 30;

/** What a report answers for a place that lies in several regions without one picked. */
export const SEVERAL_REGIONS_FOR_MAX =
  'This place lies in several regions: pick the one to report the max battle in.';

/**
 * The body of a report: where (a power spot by its Wayfarer id, `spot`, or a point, `lat` and
 * `lon`, kept to six decimals: the nearest power spot within 50 metres, else an unlisted power
 * spot), the region when the place lies in several, the boss as `/max` takes it (a value of the
 * pick list, or typed), its tier for a boss on no list, the end as `/max`'s `end:` takes it, and
 * the answer to the ending-soon question (`soon`: a choice's value and the end it was offered
 * with), never with a typed end. Anything else is malformed.
 */
const reportBodySchema = z
  .object({
    spot: z.string().min(1).max(60).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    region: z.number().int().positive().optional(),
    boss: z.string().trim().min(1).max(100),
    tier: z.enum(MAX_TIERS).optional(),
    end: z.string().max(40).optional(),
    soon: z
      .object({ value: z.enum([NEXT_ROTATION, ENDING_SOON]), end: z.number().int() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((body) => (body.lat === undefined) === (body.lon === undefined))
  .refine((body) => (body.spot === undefined) !== (body.lat === undefined))
  .refine((body) => body.soon === undefined || (body.end ?? '').trim() === '');

/**
 * What the map says where `/max` names itself or its options (plan 8X-5): the words of
 * `WHICH_TIER` (the option `tier:`), `MAX_PIN_BLOCKED` and `NOT_HERE` (the list of power spots),
 * `UnknownMaxBoss` (the list that appears while one types), `MAX_ENDED` (`/max` again) and the
 * hint of `/boss` after another boss's battle (the post is not named on the map). `/max` keeps
 * its own.
 */
export const MAP_WHICH_TIER = 'Which tier? Pick the tier of this boss.';
export const MAP_PIN_BLOCKED =
  'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
  'unlisted power spot. Pick a Power Spot on the map.';
export const MAP_MAX_ENDED = 'The max battle there has just ended: report it again.';
/** After another boss's battle is named: what a member on the map can do about it. */
export const MAP_BOSS_HINT = ' Open its post and use /boss there to change its boss.';
/**
 * A typed boss that names no Pokémon (`UnknownMaxBoss`, whose words name the list that appears
 * while one types in Discord), on the map: `shown` as typed, made plain.
 */
export const mapUnknownBoss = (shown: string): string =>
  `I know no Pokémon called "${shown}". Pick a boss from the list.`;
/** `NOT_HERE` names `/max`'s list: a spot no region's outline holds any more, on the map. */
export const MAP_NOT_HERE =
  'That place is not in a region of this server. Pick a Power Spot on the map.';

/** The status of each outcome of a report. */
const REPORT_STATUS: Readonly<Record<MaxReportOutcome['kind'], number>> = {
  created: 200,
  exists: 409,
  taken: 409,
  ended: 422,
  barred: 403,
  'pin-blocked': 403,
  'no-region': 422,
  'no-forum': 422,
  'no-post': 503,
};

/** A coordinate to six decimals (about 10 cm), as the map's pins and places are. */
const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * The max battles of the live map (plan 8X-5; design 7): the power spots of a box of the map
 * (`GET /s/<guild>/api/powerspots`), as `/api/stops` gives the PokéStops; the pick lists of a
 * report (`GET /s/<guild>/api/max-options`, as `/max` lists its bosses), for members of the
 * server; and a report (`POST /s/<guild>/api/maxes`), which is `/max` as the member: the same
 * readers, the same checks, the same report, the same throttle, the command's words, and its
 * ending-soon question as an answer the page sends the report again with.
 */
export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { sessions, parties, maxes } = deps;
  const { ctx } = maxes;

  /** The words of a command as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
    maxes.channelName(region.channelId) ?? `Region ${region.id}`;

  /** A region in a sentence: `#west` as its channel reads, else `Region 5` (`regionName`). */
  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string =>
    maxes.channelName(region.channelId) === undefined
      ? regionName(region)
      : `#${regionName(region)}`;

  /**
   * How the map's answers name a post (not at all: the page opens the battle) and a region, and
   * say in the map's words what `/max` says by its own name.
   */
  const names: MaxNames = {
    post: () => undefined,
    channel: (channelId) => {
      const region = ctx.regions.byChannel(channelId);
      return region ? regionInWords(region) : `#${maxes.channelName(channelId) ?? 'unknown'}`;
    },
    ended: MAP_MAX_ENDED,
    bossHint: MAP_BOSS_HINT,
    pinBlocked: MAP_PIN_BLOCKED,
    // The map names no post: none being made either (review r0 of 8X-F, X5-5).
    postPending: '',
  };

  /** `/max`'s check of a report's forums (`maxBarred`), on the map's deps. */
  const access = (): MaxAccess => ({
    partyService: ctx.partyService,
    memberAccess: (forumId, memberId) => parties.forums.memberAccess(forumId, memberId),
  });

  /** A max battle as the member sees it on the map now (`mapParty`): none without its post yet. */
  const viewOf = (
    guildId: string,
    guildRow: number,
    party: MaxParty,
    userId: string,
    standing: MemberStanding,
  ): MapMax | undefined => {
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
    return shown?.kind === 'max' ? shown : undefined;
  };

  /**
   * The battle as the member sees it, when they are not kept out of its forum: the one a report
   * made or joined, or the one of another boss that refused it. Asked of Discord unless it is in
   * `forum`, the forum the report would go to once `maxBarred` has let the member in it
   * (undefined before: always asked); none while Discord cannot say.
   */
  const shownTo = async (
    guildId: string,
    guildRow: number,
    party: MaxParty,
    userId: string,
    standing: MemberStanding,
    forum: string | null | undefined,
  ): Promise<MapMax | undefined> => {
    let shown = party.forumChannelId === forum;
    if (!shown && party.forumChannelId !== null) {
      try {
        shown = (await parties.forums.memberAccess(party.forumChannelId, userId)) !== 'barred';
      } catch {
        shown = false;
      }
    }
    return shown ? viewOf(guildId, guildRow, party, userId, standing) : undefined;
  };

  /**
   * A refusal in the command's words, as text of the page, with the battle it names, if any, and
   * what the page should ask for (`needs`).
   */
  const refuse = (
    reply: FastifyReply,
    status: number,
    text: string,
    more: { max?: MapMax | undefined; needs?: MaxNeed } = {},
  ) => {
    const answer: MaxAnswer = {
      ok: false,
      text: words(text),
      ...(more.max ? { max: more.max } : {}),
      ...(more.needs ? { needs: more.needs } : {}),
    };
    return reply.code(status).send(answer);
  };

  // The power spots of a box of the map (plan 8X-5): members only (as the pick lists), those in a
  // region of this server with a title, the nearest to the box's middle first, at most
  // `MAX_MAP_SPOTS` (`more` says there were more: the page asks to zoom in).
  scope.get(
    '/api/powerspots',
    { onRequest: limitedRead(SPOTS_PER_MINUTE, deps) },
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
      const { found, more } = placesFor(ctx, row, box.data, 'powerspot', MAX_MAP_SPOTS);
      const view: PowerSpotsView = { spots: found, more };
      return view;
    },
  );

  // A Power Spot's address (design `2026-11-04-power-spot-address-design.md`), asked as the page
  // opens its popup: members only, limited per address as the list of the Power Spots is (its
  // own count); a titled Power Spot of a region of this server, else 404; its address as every
  // reader words it, looked up of Google when none is known and the budget and the member's day
  // leave room (`WayspotAddresses.ask`), else null.
  scope.get(
    '/api/powerspots/:spot/address',
    { onRequest: limitedRead(SPOTS_PER_MINUTE, deps) },
    async (request: SpotAddressRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild, spot: id } = request.params;
      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
      if (refused) return refused;
      const row = await parties.guilds.idFor(guild);
      const spot = id.length > MAX_SPOT_ID ? undefined : ctx.wayspots.byId(id);
      const ours =
        row !== undefined &&
        spot?.kind === 'powerspot' &&
        spot.title.trim() !== '' &&
        ctx.wayspots.regionsOf(spot.id).some((channel) => {
          return ctx.regions.byChannel(channel)?.guildId === row;
        });
      if (!spot || !ours) return sendFailure(request, reply, 404);
      const answer: SpotAddressView = {
        address: await ctx.wayspotAddresses.ask(spot, { guildId: guild, userId: session.userId }),
      };
      return answer;
    },
  );

  // The pick lists of a report (plan 8X-5): `/max`'s bosses of the moment in its order, with the
  // values its choices have and the post's pictures, and the tiers of a boss on no list; for
  // members of the server, an ETag of its JSON, `private, no-cache`, 304 when the page has it.
  scope.get(
    '/api/max-options',
    { onRequest: limitedRead(OPTIONS_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const refused = await memberOrFailure(
        deps,
        request,
        reply,
        request.params.guild,
        session.userId,
      );
      if (refused) return refused;
      const { catalogue, icons } = ctx.gameData;
      const choices = currentMaxBossChoices(
        {
          maxBosses: ctx.maxBosses,
          maxEvents: ctx.raidEvents,
          pokemon: ctx.pokemon,
          gameData: ctx.gameData,
          zone: parties.zone,
        },
        deps.now(),
      );
      // The picture a post of the boss would show (`shownMaxBoss`): the game's icon, else the list's.
      const picture = (boss: (typeof choices)[number]['boss']) =>
        maxBossPicture(boss.entry, boss.tier, { catalogue, icons }) ?? boss.image;
      const body = JSON.stringify(maxOptions(choices, parties.zone, picture, deps.pictureOrigins));
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  // A report (plan 8X-5), as `/max` makes it: before the body is read (`onRequest`), at most
  // `MAX_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST. Then the session
  // (403) and the body (400), who reports (`actingOnTheMap`), the spot (`spotAt`, as `/max` names
  // it), the region when the place lies in several (asked for with the regions), `/max`'s readers
  // (the boss, the end), another boss at the spot (409, the battle named), a member blocked from
  // meetups at a pin (403), the forums (`maxBarred`: barred 403, Discord away 503), and the
  // ending-soon question (422 with its choices, `soon`; the page sends the report again with the
  // one picked, decided anew), unless `/max`'s window is full (429, nothing counted); only then
  // `/max`'s throttle in its window, so that a report refused for who reports, where or what is
  // not counted; then `/max`'s report as the member (`reportMaxAs`; a block at a pin found only
  // there is given back, 403), and the command's words.
  const writeLimiter = new RateLimiter({ uses: MAX_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];
  scope.post('/api/maxes', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = reportBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'reported a max battle';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    const { member, standing } = acting;
    const where: { spot?: string; pin?: true } = {};
    /**
     * What came of the report, logged as a command is, a refusal too: the spot by its id once it
     * is known, or that it is a pin; never a text or the point.
     */
    const noted = <T>(outcome: string, sent: T): T => {
      deps.log.info(
        { user: userId, guild, ...where, outcome },
        'a max battle was reported on the map',
      );
      return sent;
    };
    const row = await parties.guilds.idFor(guild);
    if (row === undefined) return noted('no-spot', sendFailure(request, reply, 404));
    const now = deps.now();
    let spot: MaxSpot;
    try {
      const { spot: id, lat, lon } = body.data;
      spot =
        id !== undefined
          ? spotAt(ctx, row, { spot: id })
          : spotAt(ctx, row, { lat: sixDecimals(lat ?? 0), lon: sixDecimals(lon ?? 0) });
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      return noted('refused', refuse(reply, 422, err.message));
    }
    if (spot.kind === 'pin') where.pin = true;
    else where.spot = spot.id;
    const lying = regionsAtPoint(ctx.regions.all(), row, spot);
    const [first] = lying;
    const picked =
      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
    // `spotAt` names only places in a region of this server; outlines changed meanwhile.
    if (first === undefined) return noted('no-region', refuse(reply, 422, MAP_NOT_HERE));
    if (picked === undefined) {
      const ask: MaxAnswer = {
        ok: false,
        text: SEVERAL_REGIONS_FOR_MAX,
        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
      };
      return noted('several-regions', reply.code(422).send(ask));
    }
    const regionChannelId = picked.channelId;
    let boss: ReadMaxBoss;
    let end: number;
    const typed = (body.data.end ?? '').trim();
    try {
      boss = readMaxBoss(ctx, body.data.boss, body.data.tier ?? null, now);
      end = reportedEnd(
        ctx,
        boss.tier,
        typed === '' ? null : typed,
        now,
        ctx.servers.zoneOf(guild),
      );
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      // `/max`'s `tier:` option is no part of the map: its words, and what the page asks for.
      if (err.message === WHICH_TIER) {
        return noted('refused', refuse(reply, 422, MAP_WHICH_TIER, { needs: 'tier' }));
      }
      // Nor is the list that appears while one types in Discord.
      if (err instanceof UnknownMaxBoss) {
        return noted('refused', refuse(reply, 422, mapUnknownBoss(err.shown), { needs: 'boss' }));
      }
      return noted('refused', refuse(reply, 422, err.message));
    }
    // The end the ending-soon question offered has passed meanwhile: as the dialog's Submit.
    const { soon } = body.data;
    if (soon !== undefined && soon.end <= now) {
      return noted('refused', refuse(reply, 422, ENDED_MEANWHILE));
    }
    const there = ctx.parties.maxAt(row, spot, now);
    if (there && otherBoss(there, boss)) {
      // Before the forums are asked (`maxBarred`): the forum the report would go to is asked as
      // well (final review F1), so a member kept out of it is not shown its battle.
      const shown = await shownTo(guild, row, there, userId, standing, undefined);
      const text = takenWords(ctx, there, boss.tier, names);
      return noted('taken', refuse(reply, 409, text, { max: shown }));
    }
    // A new battle only: joining the one there is what its Join button does.
    const staff = isMapStaff(standing, userId, parties.ownerId);
    if (there === undefined && (await blockedAtPin(ctx, guild, userId, staff, spot))) {
      return noted('blocked', refuse(reply, 403, MAP_PIN_BLOCKED, { needs: 'listed-spot' }));
    }
    try {
      if (await maxBarred(access(), { spot, regionChannelId, joins: there }, userId)) {
        return noted('barred', reply.code(403).send({ error: MAX_BARRED }));
      }
    } catch (err) {
      return noted('unreachable', unreachableOnTheMap(deps, reply, err, guild, userId, doing));
    }
    // The ending-soon question, where `/max` opens its dialog: a new battle whose end, not typed,
    // is less than five minutes away. Answered with its choices, uncounted (`/max` counts one use
    // for the dialog and its Submit); the report sent again with a choice still offered now takes
    // its end, one no longer offered is asked again.
    const counted = { command: MAX_COMMAND };
    if (there === undefined && typed === '' && endsSoon(end, now)) {
      // Discord refuses `/max` for a full window before its dialog opens (final review F2).
      const full = throttledOnTheMap(deps, reply, counted, userId, MAX_THROTTLE, { count: false });
      if (full) return noted('throttled', full);
      const next = nextRotationEnd(
        end,
        maxEndInput(ctx, boss.tier, now, ctx.servers.zoneOf(guild)),
      );
      const question = endingSoonQuestion({ end, next, now, zone: parties.zone });
      const chosen = question.choices.find(
        (choice) => choice.value === soon?.value && choice.end === soon.end,
      );
      if (chosen === undefined) {
        const ask: MaxAnswer = {
          ok: false,
          text: words(question.text),
          soon: { choices: question.choices },
        };
        return noted('ends-soon', reply.code(422).send(ask));
      }
      end = chosen.end;
    }
    const throttled = throttledOnTheMap(deps, reply, counted, userId, MAX_THROTTLE);
    if (throttled) return noted('throttled', throttled);
    const countedAt = deps.now();
    // A battle reported at the spot since the check above, in a forum it did not see, is asked
    // about where the report would join it.
    const joining = mayJoinNoting(access(), userId);
    const ask = { boss, spot, end, regionChannelId };
    let result: MaxReportResult;
    try {
      result = await reportMaxAs(ctx, member, guild, ask, { mayJoin: joining.mayJoin, staff });
    } catch (err) {
      // No fault of the member's (the store failed): the use is given back, as on Discord.
      givenBackOnTheMap(deps, MAX_COMMAND, userId, MAX_THROTTLE, countedAt);
      throw err;
    }
    const failed = joining.failure();
    if (failed) {
      return noted(
        'unreachable',
        unreachableOnTheMap(deps, reply, failed.err, guild, userId, doing),
      );
    }
    const { outcome } = result;
    // None of the member's doing (the bot may not make posts there, the battle there ended
    // twice while the report waited), or a block at a pin found only now (final review F4, as
    // the check above counts nothing): given back, as `/max` gives it back.
    if (outcome.kind === 'no-post' || outcome.kind === 'ended' || outcome.kind === 'pin-blocked') {
      givenBackOnTheMap(deps, MAX_COMMAND, userId, MAX_THROTTLE, countedAt);
    }
    if (outcome.kind === 'pin-blocked') {
      return noted('blocked', refuse(reply, 403, MAP_PIN_BLOCKED, { needs: 'listed-spot' }));
    }
    const battle =
      outcome.kind === 'created' || outcome.kind === 'exists' || outcome.kind === 'taken'
        ? outcome.party
        : undefined;
    const max =
      battle && (await shownTo(guild, row, battle, userId, standing, picked.forumChannelId));
    // The region picked has no forum: the battle went to another region of the spot, by name.
    const postedIn =
      outcome.kind === 'created' &&
      outcome.party.regionId !== null &&
      outcome.party.regionId !== picked.id
        ? ctx.regions.byId(outcome.party.regionId)
        : undefined;
    const answer: MaxAnswer = {
      ok: outcome.kind === 'created',
      text:
        words(maxReportWords(ctx, outcome, ask, result.autoStatus, names)) +
        (postedIn ? ` It was posted in ${regionInWords(postedIn)}.` : ''),
      ...(max ? { max } : {}),
    };
    return noted(outcome.kind, reply.code(REPORT_STATUS[outcome.kind]).send(answer));
  });
}
