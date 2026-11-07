import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { PIN_NOT_HERE } from '../commands/place-option.js';
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
import type { StandingSpawn } from '../db/repositories/spawn-report-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { UserError } from '../discord/errors.js';
import type { WildExceptions } from '../domain/pogo/wild.js';
import type { SpawnAnswer } from '../domain/web/spawn-data.js';
import { regionsAtPoint } from '../services/region-directory.js';
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
import { spawnsView } from './spawn-view.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
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
 * point may lie in, and the place finder that names the point as a pin.
 */
export type SpawnWebContext = WildReading &
  SpawnReporting &
  Pick<AppContext, 'placeFinder' | 'regions' | 'meetupSafety'>;

/**
 * What a member blocked from meetups is told on the map (plan 8Z, `blockedAtPin`): every report
 * here is at a pin; `/wild` still takes one at a known place.
 */
export const MAP_SPAWN_BLOCKED =
  'You are blocked from making meetups in this server, so you cannot report a wild Pokémon ' +
  'from the map. Use /wild on Discord and pick a place from its list. To appeal the block, ' +
  'use /meetup there and press "Appeal…".';

/** What the spawn reports of the live map need beyond the parties' own (`PartyWebDeps`). */
export interface SpawnWebDeps {
  ctx: SpawnWebContext;
  /** A channel's name as the bot sees it now: a region's, which an answer names. */
  channelName(channelId: string): string | undefined;
  /** Whether an overwrite of the member's own keeps them out of a region's channel. */
  channels: Pick<PartyGateway, 'ownViewDenied'>;
}

/**
 * The body of a report: the Pokémon as `/wild` takes it (a value of the pick list, or typed), the
 * details (required as in `/wild`: blanks are refused in its words, so they are no malformed
 * body), the IVs when checked, the point (latitude and longitude, kept to six decimals), and the
 * region when the point lies in several. Anything else is malformed.
 */
const spawnBodySchema = z
  .object({
    pokemon: z.string().trim().min(1).max(100),
    details: z.string().max(MAX_DETAILS),
    iv: z.enum(['perfect', 'zero']).optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    region: z.number().int().positive().optional(),
  })
  .strict();

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
  const listLimiter = new RateLimiter({ uses: SPAWNS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/spawns',
    { onRequest: limitedPerAddress(listLimiter, { now: deps.now }) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const standing = await ctx.spawns.standing(guild);
      const gatesOf = (spawn: StandingSpawn): string[] => {
        const forum = ctx.regions.byChannel(spawn.channelId)?.forumChannelId ?? null;
        return forum === null ? [spawn.channelId] : [forum, spawn.channelId];
      };
      const viewer = await viewers.viewer(guild, session.userId, standing.flatMap(gatesOf), member);
      if (viewer.kind !== 'member') return sendFailure(request, reply, 403);
      const view = spawnsView({
        spawns: standing,
        shown: (spawn) => gatesOf(spawn).every((gate) => !viewer.barred.has(gate)),
        region: (channelId) => names.channel(channelId),
        guild,
        pictureOrigins: deps.pictureOrigins,
      });
      const body = JSON.stringify(view);
      const etag = etagOf(body);
      void reply.header('etag', etag);
      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
  scope.get(
    '/api/wild-options',
    { onRequest: limitedPerAddress(optionsLimiter, { now: deps.now }) },
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
  // session, CSRF token). Then who reports (`actingOnTheMap`), where: the regions of this server
  // the point lies in (none: refused as `/wild` refuses a pin outside them; several: asked which,
  // with the regions), how the member stands to the forum of the region picked (barred 403, as
  // for a raid there) and to its channel (an overwrite of their own that denies View Channel
  // 403, unless they are an administrator); then `/wild`'s readers (the Pokémon, the details) and the pin, as its guard reads them,
  // and only then `/wild`'s throttle in its own window, so that a report refused for who
  // reports, where or what is not counted; then `/wild`'s report as the member
  // (`reportSpawnAs`), the point as a pin, and the command's words (the bot shutting down 503
  // with `Retry-After`, the other reports not made 422).
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
    const point = { lat: sixDecimals(body.data.lat), lon: sixDecimals(body.data.lon) };
    const lying = row === undefined ? [] : regionsAtPoint(ctx.regions.all(), row, point);
    const [first] = lying;
    if (row === undefined || first === undefined) {
      return noted('not-here', refusal(PIN_NOT_HERE));
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
      const forum = picked.forumChannelId;
      if (forum !== null && (await parties.forums.memberAccess(forum, userId)) === 'barred') {
        return noted('barred', sendFailure(request, reply, 403), picked.id);
      }
      // The report goes into the region's channel: somebody kept out of it by an overwrite of
      // their own is not to post there from the map (a role's denial is not looked at). Discord
      // shows an administrator (the server's owner too) every channel whatever its overwrites
      // say, so theirs are not asked about.
      if (
        !acting.standing.administrator &&
        (await spawns.channels.ownViewDenied(picked.channelId, userId))
      ) {
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
    const pin = ctx.placeFinder.pin(row, point, null);
    if (!pin) return noted('not-here', refusal(PIN_NOT_HERE), picked.id);
    // Every spawn on the map is at a pin: as `/wild near:`, before its limit.
    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
    if (await blockedAtPin(ctx, guild, userId, staff, pin)) {
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
            near: pin,
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
