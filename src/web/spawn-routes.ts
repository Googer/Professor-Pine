import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { chosenPlace, NOT_HERE, PIN_NOT_HERE, PLACE_GONE } from '../commands/place-option.js';
import type { KnownPlace, Place } from '../domain/geo/place.js';
import { readPlaceValue } from '../services/place-finder.js';
import {
  reportSpawnAs,
  SpawnNotMade,
  type SpawnNames,
  type SpawnReporting,
} from '../commands/notifications/spawn-report.js';
import {
  MAX_DETAILS,
  readSpawn,
  WILD_COMMAND,
  WILD_THROTTLE,
  wildExceptionsOf,
  type WildReading,
} from '../commands/notifications/wild.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import { UserError } from '../discord/errors.js';
import type { WildExceptions } from '../domain/pogo/wild.js';
import type { SpawnAnswer } from '../domain/web/spawn-data.js';
import { regionsAtPoint } from '../services/region-directory.js';
import { spawnGates, spawnKeptOut } from '../domain/regions/spawn-access.js';
import { blockedAtPin } from '../commands/max/max-report.js';
import {
  actingOnTheMap,
  isMapStaff,
  memberOrFailure,
  countedOnTheMap,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { postGuard } from './csrf.js';
import { etagMatches, etagOf } from './geo-cache.js';
import type { GuildRequest } from './guild-routes.js';
import { pageWords } from './page-words.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { gatesOf, seenBy } from './spawn-seen.js';
import { spawnsView } from './spawn-view.js';
import { limitedPerAddress, limitedRead, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { wildOptions } from './wild-options.js';

/** The requests for the pick list one address may make in a minute (a form asks once). */
const OPTIONS_PER_MINUTE = 30;

/**
 * The requests for a server's spawns one address may make in a minute: a page asks as often as it
 * asks for the reports at stops (`STOP_REPORTS_PER_MINUTE`).
 */
export const SPAWNS_PER_MINUTE = 120;

/** The spawn reports one address may send in a minute, whoever sends them. */
export const SPAWN_WRITES_PER_ADDRESS_MINUTE = 30;

/**
 * What reporting a spawn on the map reads and calls (plan 8M-4S): exactly what `/wild` uses (the
 * game data, the settings' exceptions, the Pokémon search, the spawn service), the regions the
 * point may lie in, the gyms and kept Wayspots a place named is one of, and the place finder that
 * names a point as a pin and a place as `/wild near:` names it.
 */
export type SpawnWebContext = WildReading &
  SpawnReporting &
  Pick<AppContext, 'placeFinder' | 'regions' | 'meetupSafety' | 'gyms' | 'wayspots'>;

/**
 * What a member blocked from meetups is told of a report at a point of the map (plan 8Z,
 * `blockedAtPin`): a pin; a gym, PokéStop or Power Spot is still theirs to report at, on the map
 * as with `/wild`.
 */
export const MAP_SPAWN_BLOCKED =
  'You are blocked from making meetups in this server, so you cannot report a wild Pokémon at a ' +
  "point of the map. Use \"Report spawn here\" in a gym's, PokéStop's or Power Spot's popup " +
  'instead. To appeal the block, use /meetup on Discord and press "Appeal…".';

/** What the spawn reports of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface SpawnWebDeps {
  ctx: SpawnWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
}

/** What the map says of a place named in no region of the server (`/wild`'s `NOT_HERE`). */
export const MAP_PLACE_NOT_HERE = 'That place is not in a region of this server.';

/** What the map says of a place named that is gone or of another kind now (`PLACE_GONE`). */
export const MAP_PLACE_GONE = 'That place is gone from the map: close its popup and pick it again.';

/** What every report's body holds, wherever the spawn is. */
const spawnBodyBase = {
  pokemon: z.string().trim().min(1).max(100),
  details: z.string().max(MAX_DETAILS),
  iv: z.enum(['perfect', 'zero']).optional(),
  region: z.number().int().positive().optional(),
};

/**
 * The body of a report: the Pokémon as `/wild` takes it (a value of the pick list, or typed), the
 * details (required as in `/wild`: blanks are refused in its words, so they are no malformed
 * body), the IVs when checked, where: a point (latitude and longitude, kept to six decimals: a
 * press on the map, a pin of the Report button) or a place (a gym, PokéStop or Power Spot by its
 * kind and id, as a choice of `/wild near:` names it: "Report spawn here" in its popup, Matt
 * 2026-11-07), one of the two; and the region when where it is lies in several. Anything else is
 * malformed.
 */
const spawnBodySchema = z.union([
  z
    .object({
      ...spawnBodyBase,
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .strict(),
  z
    .object({
      ...spawnBodyBase,
      // Only an id a choice of `/wild near:` may have (`readPlaceValue`'s own rule).
      place: z
        .object({
          kind: z.enum(['gym', 'stop', 'powerspot']),
          id: z.string().min(1).max(60),
        })
        .strict()
        .refine((place) => readPlaceValue(`${place.kind}:${place.id}`) !== undefined),
    })
    .strict(),
]);

/** How long a report that came while the bot shut down asks the page to wait (`Retry-After`). */
const RESTART_RETRY_SECONDS = 60;

/** What a report answers for a point that lies in several regions without one picked. */
export const SEVERAL_REGIONS_HERE =
  'This point lies in several regions: pick the one to report the spawn in.';

/** A coordinate to six decimals (about 10 cm), as the page sends it and the map shows places. */
const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;

/** The pick list's JSON and ETag, by the exceptions read against a catalogue (each its own). */
const optionsCache = new WeakMap<WildExceptions, { body: string; etag: string }>();

/**
 * Wild Pokémon on the live map (spec 3.5, 3.8): the pick list of a report for members of the
 * server (`/s/<guild>/api/wild-options`: `wildOptions`, kept per catalogue and settings, an ETag
 * of its JSON, `private, no-cache`, 304 when the page has it), and a report at a point
 * (`POST /s/<guild>/api/spawns`), which is `/wild` as the member: the same readers, the same
 * report, the same throttle, the command's words.
 */
export function spawnRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, spawns, parties } = deps;
  const { ctx } = spawns;

  /** The words of a command as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
    spawns.channelName(region.channelId) ?? `Region ${region.id}`;

  /** How the map's answers name a report (not at all) and a region's channel (`#west`). */
  const names: SpawnNames = {
    report: () => undefined,
    channel: (channelId) => {
      const seen = spawns.channelName(channelId);
      if (seen !== undefined) return `#${seen}`;
      const region = ctx.regions.byChannel(channelId);
      return region ? `Region ${region.id}` : '#unknown';
    },
  };

  // The spawns that stand (Matt, 2026-11-07: wild spawns on the map): read once and kept until a
  // report is recorded or forgotten (`SpawnService.standing`), each ask leaving out by its clock
  // what is due; for members only, asked before anything of the server is read (`membership`);
  // a report shown unless its region's forum or its channel, where its message stands, keeps the
  // member out (the parties' `PartyViewers`, barred only); an ETag of the member's JSON,
  // `private, no-cache`, 304 when the page has it.
  scope.get(
    '/api/spawns',
    { onRequest: limitedRead(SPAWNS_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const standing = await ctx.spawns.standing(guild);
      const viewer = await viewers.viewer(
        guild,
        session.userId,
        standing.flatMap((spawn) => gatesOf(ctx, spawn)),
        member,
      );
      if (viewer.kind !== 'member') return sendFailure(request, reply, 403);
      const view = spawnsView({
        spawns: standing,
        shown: seenBy(ctx, viewer),
        region: (channelId) => names.channel(channelId),
        guild,
        pictureOrigins: deps.pictureOrigins,
        picture: (source) => deps.pictures.url(source),
        // A place's picture by Pine's address, as a post's Where names it (`placePictures`).
        placePicture: (url) => {
          const key = parties.places.keyOf(url);
          return key === undefined ? undefined : `/s/${guild}/pictures/${key}`;
        },
      });
      const body = JSON.stringify(view);
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  scope.get(
    '/api/wild-options',
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
      const exceptions = wildExceptionsOf(ctx);
      let kept = optionsCache.get(exceptions);
      if (!kept) {
        const body = JSON.stringify(wildOptions(ctx.gameData.catalogue, exceptions.species));
        kept = { body, etag: etagOf(body) };
        optionsCache.set(exceptions, kept);
      }
      void reply.header('etag', kept.etag);
      if (etagMatches(request.headers['if-none-match'], kept.etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(kept.body);
    },
  );

  // A report (spec 3.8): before the body is read (`onRequest`), at most
  // `SPAWN_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST (Origin,
  // session, CSRF token). Then who reports (`actingOnTheMap`), where: a place named, as
  // `/wild near:` takes a choice (`chosenPlace`: gone or of another kind 422 in its words), or a
  // point; the regions of this server its point lies in (none: refused as `/wild` refuses a pin
  // outside them; several: asked which, with the regions), how the member stands to the forum of
  // the region picked and to its channel (barred from either 403, unless they are an
  // administrator: `spawnKeptOut`, the rule the map's view of the spawns follows); then `/wild`'s
  // readers (the Pokémon, the details) and the pin of a point, as its guard reads them (a pin of a
  // member blocked from meetups refused), and only then `/wild`'s throttle in its own window, so
  // that a report refused for who reports, where or what is not counted; then `/wild`'s report as
  // the member (`reportSpawnAs`), at the place or the pin, and the command's words (the bot
  // shutting down 503 with `Retry-After`, the other reports not made 422).
  const writeLimiter = new RateLimiter({ uses: SPAWN_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const writeGuards = [
    limitedPerAddress(writeLimiter, { now: deps.now }),
    postGuard(sessions, deps.settings.publicUrl),
  ];
  scope.post('/api/spawns', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
    void reply.header('cache-control', 'no-store');
    const session = await sessions.of(request, reply);
    if (!session) return sendFailure(request, reply, 403);
    const body = spawnBodySchema.safeParse(request.body ?? {});
    if (!body.success) return sendFailure(request, reply, 400);
    const { guild } = request.params;
    const { userId } = session;
    const doing = 'reported a spawn';
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting.sent;
    const refusal = (text: string) => {
      const refused: SpawnAnswer = { ok: false, text: words(text) };
      return reply.code(422).send(refused);
    };
    /**
     * What came of the report, logged as a command is, a refusal too (plan 8S-3), with the
     * region once it is known; never a text or the point.
     */
    const noted = <T>(outcome: string, sent: T, region?: number): T => {
      deps.log.info(
        { user: userId, guild, ...(region === undefined ? {} : { region }), outcome },
        'a spawn was reported on the map',
      );
      return sent;
    };
    const row = await parties.guilds.idFor(guild);
    if (row === undefined) return noted('not-here', refusal(PIN_NOT_HERE));
    // A place named is the place itself, as `/wild near:` takes a choice (`chosenPlace`, its
    // refusals in its words); its point decides the region as a pin's does.
    let place: KnownPlace | undefined;
    if ('place' in body.data) {
      try {
        place = chosenPlace(ctx, row, body.data.place);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        // `/wild`'s words point to its list; the map's to the place's popup.
        if (err.message === NOT_HERE) return noted('not-here', refusal(MAP_PLACE_NOT_HERE));
        if (err.message === PLACE_GONE) return noted('gone', refusal(MAP_PLACE_GONE));
        return noted('refused', refusal(err.message));
      }
    }
    const point = place
      ? { lat: place.lat, lon: place.lon }
      : 'lat' in body.data
        ? { lat: sixDecimals(body.data.lat), lon: sixDecimals(body.data.lon) }
        : undefined;
    if (point === undefined) return sendFailure(request, reply, 400);
    const lying = regionsAtPoint(ctx.regions.all(), row, point);
    const [first] = lying;
    if (first === undefined) {
      return noted('not-here', refusal(place ? MAP_PLACE_NOT_HERE : PIN_NOT_HERE));
    }
    const picked =
      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
    if (picked === undefined) {
      const ask: SpawnAnswer = {
        ok: false,
        text: SEVERAL_REGIONS_HERE,
        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
      };
      return noted('several-regions', reply.code(422).send(ask));
    }
    try {
      // Who may report a region's spawn is who sees it on the map (review S2, `spawnKeptOut`):
      // not somebody barred from the region's forum or from its channel, where the report goes.
      // Discord shows an administrator (the server's owner too) every channel whatever its
      // overwrites say, so theirs are not asked about.
      const { administrator } = acting.standing;
      const standings: Array<MemberAccess | undefined> = [];
      if (!administrator) {
        for (const gate of spawnGates(picked)) {
          standings.push(await parties.forums.memberAccess(gate, userId));
        }
      }
      if (spawnKeptOut(standings, administrator)) {
        return noted('barred', sendFailure(request, reply, 403), picked.id);
      }
    } catch (err) {
      return noted(
        'unreachable',
        unreachableOnTheMap(deps, reply, err, guild, userId, doing),
        picked.id,
      );
    }
    let read: ReturnType<typeof readSpawn>;
    try {
      read = readSpawn(ctx, body.data.pokemon, body.data.details);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      return noted('refused', refusal(err.message), picked.id);
    }
    const near: Place | undefined = place ?? ctx.placeFinder.pin(row, point, null);
    if (!near) return noted('not-here', refusal(PIN_NOT_HERE), picked.id);
    // A pin of a member blocked from meetups is refused, a place is not: as `/wild near:`, before
    // its limit.
    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
    if (await blockedAtPin(ctx, guild, userId, staff, near)) {
      const blocked: SpawnAnswer = { ok: false, text: words(MAP_SPAWN_BLOCKED) };
      return noted('blocked', reply.code(403).send(blocked), picked.id);
    }
    const counted = { command: WILD_COMMAND };
    const throttled = throttledOnTheMap(deps, reply, counted, userId, WILD_THROTTLE);
    if (throttled) return noted('throttled', throttled, picked.id);
    let text: string;
    try {
      // A report not made (`SpawnNotMade`) is a refusal and stays counted, as for /wild.
      text = await countedOnTheMap(deps, counted, userId, WILD_THROTTLE, () =>
        reportSpawnAs(
          ctx,
          {
            guildId: guild,
            regionChannelId: picked.channelId,
            read,
            iv: body.data.iv,
            reporter: { id: userId, name: acting.member.name },
            near,
          },
          names,
        ),
      );
    } catch (err) {
      if (!(err instanceof SpawnNotMade)) throw err;
      // The bot shutting down is no refusal: the page may try again once it is back.
      if (err.kind === 'closed') {
        return noted(
          'closed',
          reply
            .code(503)
            .header('retry-after', String(RESTART_RETRY_SECONDS))
            .send({ error: words(err.message) }),
          picked.id,
        );
      }
      return noted('not-made', refusal(err.message), picked.id);
    }
    const answer: SpawnAnswer = { ok: true, text: words(text) };
    return noted('posted', answer, picked.id);
  });
}
