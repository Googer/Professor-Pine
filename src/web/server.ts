import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Settings } from '../config/settings.js';
import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
import type { Logger } from '../log.js';
import { REFUSED } from '../services/costly.js';
import { EGG_FOLDER, EGG_PATH } from '../services/egg-pictures.js';
import { LockOverdueError } from '../services/keyed-lock.js';
import { EMOJI_PATH, type EmojiPictures } from '../services/post-pictures.js';
import { PICTURE_PATH, type StopPictures } from '../services/stop-pictures.js';
import { carriesContinueScript, sendFailure } from './answers.js';
import { authRoutes } from './auth-routes.js';
import { isNearbyPeer } from './client-address.js';
import type { OAuthGateway } from './discord-oauth.js';
import type { EditorDeps } from './editor-routes.js';
import type { GeoCache } from './geo-cache.js';
import { guildRoutes } from './guild-routes.js';
import { securityHeaders, shownTiles } from './headers.js';
import type { LiveSignals } from './live-signals.js';
import type { LoginLinks } from './login-links.js';
import type { MapServers } from './map-servers.js';
import type { MaxWebDeps } from './max-routes.js';
import type { MeetupWebDeps } from './meetup-routes.js';
import { PacedMembers, type MemberPace, type PacedDirectory } from './paced-members.js';
import { HASHED_NAME, type WebAssets } from './page.js';
import type { PartyWebDeps } from './party-routes.js';
import { publicCosts, type PublicCost } from './public-costs.js';
import type { RateLimiter } from './rate-limit.js';
import type { RaidWebDeps } from './raid-routes.js';
import type { Sessions } from './sessions.js';
import type { SpawnWebDeps } from './spawn-routes.js';
import type { StopWebDeps } from './stop-routes.js';
import type { ActivityWebDeps } from './history-routes.js';
import type { RegionWebDeps } from './region-routes.js';
import type { PostWebDeps } from './post-control-routes.js';
import type { TrainWebDeps } from './train-routes.js';
import { toolFileRoutes, toolPageRoutes, type ToolWebDeps } from './tool-routes.js';
import { topRoutes } from './top-routes.js';
import type { DistanceUnits } from '../render/distance-words.js';

/** `settings.web` once it is set. */
export type WebSettings = NonNullable<Settings['web']>;

/** What the web server is built from: given explicitly, so that tests build it over fakes. */
export interface WebDeps {
  settings: WebSettings;
  /** The origins of the posts' pictures, which the pages may show (`pictureOrigins`). */
  pictureOrigins: readonly string[];
  /** `GOOGLE_MAPS_BROWSER_KEY`: Google's tiles are offered only with it and `tiles: 'google'`. */
  googleKey: string | undefined;
  /** The units distances are said in (`settings.distanceUnits`, task 7): the map's list, the region editor's fixes. */
  distanceUnits: DistanceUnits;
  /** The servers the bot is in (the client's cache): any other is not found. */
  servers: { has(guildId: string): boolean };
  /**
   * The servers with a map (plan 8M-14, the top page): those the bot is in with a region that
   * has an outline, with their names (`mapServers`), and apart by id those Discord has not made
   * available. Never shown to anybody logged out.
   */
  serversWithMap(): Promise<MapServers>;
  /** Whether somebody is a member of a server: asked per request, never kept in a session. */
  members: PacedDirectory;
  /** How fast the map's own asks may cause fresh look-ups of members (`PacedMembers`). */
  memberPace: MemberPace;
  /** The writes of a member on the map, by their id (`MAP_WRITES_PER_MINUTE`, plan 8Z). */
  mapWrites: RateLimiter;
  sessions: Sessions;
  /** "Log in with Discord": the application and Discord's side; undefined without the secret. */
  oauth: { appId: string; gateway: OAuthGateway } | undefined;
  /** The links of `/maps`, shared with the command. */
  loginLinks: LoginLinks;
  /** The public view of each server's regions and gyms. */
  geo: GeoCache;
  /** The page's bundle (`readAssets`). */
  assets: WebAssets;
  /** The region editor: who may edit, and its view of each server (plan 8M-2). */
  editor: EditorDeps;
  /** The parties on the live map, and joining them (plan 8M-3). */
  parties: PartyWebDeps;
  /** Reporting and changing raids on the live map (plan 8M-4). */
  raids: RaidWebDeps;
  /** Reporting wild Pokémon on the live map (plan 8M-4S). */
  spawns: SpawnWebDeps;
  /** Starting, arranging and moving trains on the live map (plan 8M-5). */
  trains: TrainWebDeps;
  /** Making and changing meetups on the live map (plan 8M-5M). */
  meetups: MeetupWebDeps;
  /** Max battles on the live map: power spots, the pick lists, reports (plan 8X-5). */
  maxes: MaxWebDeps;
  /** Reports at stops on the live map: today's reports, the pick lists, reports (plan 8R-3). */
  stops: StopWebDeps;
  /** The activity heatmap of the live map: the history's buckets and what places them (plan 8H-4). */
  activity: ActivityWebDeps;
  /** "Your regions" on the live map: how a member stands to the regions, joining them (plan 8M-20). */
  regions: RegionWebDeps;
  /** Staff's Delete… and reports to the moderators on the live map (plan 8M-8B). */
  posts: PostWebDeps;
  /** The Wayfarer export tool and who may have it (plan 8W-P): `/userscript`. */
  tool: ToolWebDeps;
  /**
   * The square pictures of the reports at stops (plan 8R-6, `StopPictures`): `/pictures/`, and
   * the address of a hideout's picture on the map, as the post of the stops names it.
   */
  pictures: Pick<StopPictures, 'read' | 'url'>;
  /**
   * The pictures of the application's emoji (plan 8M-8A, `EmojiPictures`): `/emoji/<id>.png`,
   * and the address a post's icon has on the map.
   */
  emoji: Pick<EmojiPictures, 'address' | 'read'>;
  /** Who has a live stream open, told of what changed (`/api/live`). */
  live: Pick<LiveSignals, 'open' | 'close'>;
  now: () => number;
  log: Logger;
}

/** The largest body of any request (spec 5); a route that takes more says so itself. */
export const BODY_LIMIT = 16 * 1024;

/**
 * The web server (spec 2.1): Fastify without its own logger, every request logged at debug by
 * its route pattern (never its address, which may carry a token), the security headers on every
 * answer, failures answered briefly. `/s/<guild>/…` serves only a server the bot is in.
 * Listening is `startWebServer`'s; tests use `inject`.
 */
export function buildWebServer(deps: WebDeps): FastifyInstance {
  const { settings, log } = deps;
  const app = Fastify({
    logger: false,
    bodyLimit: BODY_LIMIT,
    // Forwarding headers are believed only from a peer on this machine or a private network.
    trustProxy: settings.trustProxy ? (address: string) => isNearbyPeer(address) : false,
    return503OnClosing: true,
  });
  const policy = {
    tiles: shownTiles(settings.tiles, deps.googleKey),
    pictureOrigins: deps.pictureOrigins,
  };
  const headers = securityHeaders(policy);
  // The one answer with an inline script, a login link's page in a browser that is not logged
  // in, lets it in by its hash; no other answer does (plan 8Z-2).
  const scriptedHeaders = securityHeaders({ ...policy, continueScript: true });

  void app.register(fastifyCookie);
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers(carriesContinueScript(reply) ? scriptedHeaders : headers);
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    log.debug(
      {
        method: request.method,
        route: request.routeOptions.url ?? '(none)',
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'web request',
    );
  });
  // Before the server closes, which waits for open answers: the shutdown never waits on a stream.
  const pacedMembers = new PacedMembers(deps.members, {
    ...deps.memberPace,
    now: deps.now,
    log,
  });
  app.addHook('preClose', (done) => {
    deps.live.close();
    pacedMembers.close();
    done();
  });
  app.setErrorHandler((err: Error & { statusCode?: number }, request, reply) => {
    // A change that waited too long for an earlier one (a save that does not answer): logged
    // where the lock is held, once; the page is told to try again, as the router tells a member.
    if (err instanceof LockOverdueError) return sendFailure(request, reply, 503);
    const status =
      err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
    if (status === 500) {
      log.error(
        { err, method: request.method, route: request.routeOptions.url ?? '(none)' },
        'the web server failed',
      );
    }
    return sendFailure(request, reply, status);
  });
  app.setNotFoundHandler((request, reply) => sendFailure(request, reply, 404));

  // The top page (plan 8M-14): the login, or the servers of whoever is logged in.
  topRoutes(app, deps);
  // The bundle: no index, no listing; a hashed name is kept for good, anything else asked again.
  void app.register(fastifyStatic, {
    root: deps.assets.dir,
    prefix: '/assets/',
    index: false,
    list: false,
    cacheControl: false,
    dotfiles: 'deny',
    // The bundle is one flat folder: anything but a plain file name in it is not found.
    allowedPath: (pathName) => /^\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(pathName),
    setHeaders(reply, file) {
      void reply.header(
        'cache-control',
        HASHED_NAME.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  // The work that costs without a session, counted for all such visitors together (plan 8Z-2).
  const costOf = publicCosts(deps);
  eggRoutes(app);
  iconRoutes(app);
  pictureRoutes(app, deps.pictures, costOf);
  emojiRoutes(app, deps.emoji, costOf);
  toolFileRoutes(app, deps);
  toolPageRoutes(app, deps);
  void app.register((instance, _options, done) => {
    authRoutes(instance, deps);
    done();
  });
  void app.register(
    (scope, _options, done) => {
      guildRoutes(scope, deps, pacedMembers, costOf);
      done();
    },
    { prefix: '/s/:guild' },
  );
  return app;
}

/** How long a browser or Discord's media proxy may keep an egg picture: thirty days. */
const EGG_CACHE = 'public, max-age=2592000';

/**
 * The square egg pictures (plan 8D-F) that posts of eggs show by address (`eggPictures`):
 * public, `GET /eggs/<name>.png` for the names `raidEggName` gives and nothing else, read once
 * from `EGG_FOLDER` and kept.
 */
function eggRoutes(app: FastifyInstance): void {
  const names = new Set(EGG_PICTURE_NAMES.map((name) => `${name}.png`));
  const kept = new Map<string, Buffer>();
  app.get<{ Params: { file: string } }>(`${EGG_PATH}:file`, async (request, reply) => {
    const { file } = request.params;
    if (!names.has(file)) return sendFailure(request, reply, 404);
    let picture = kept.get(file);
    if (picture === undefined) {
      picture = await readFile(path.join(EGG_FOLDER, file));
      kept.set(file, picture);
    }
    return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
  });
}

/** Where the icons are served: the page's `ICON_PATH` (`report-icons.test.ts` holds the two). */
export const ICON_PATH = '/icons/';

/** The game's pictures Pine keeps for the map (plan 8M-11A, S14): `pictures/icons/`. */
export const ICON_FOLDER = fileURLToPath(new URL('../../pictures/icons/', import.meta.url));

/**
 * The pictures of `ICON_FOLDER` the map shows (the masks of Dynamax and Gigantamax), and no other.
 */
const ICON_NAMES: ReadonlySet<string> = new Set(['dynamax.png', 'gigantamax.png']);

/**
 * The icons Pine keeps (plan 8M-11A, S14): public, `GET /icons/<name>.png` for `ICON_NAMES` and
 * nothing else, read once and kept, the eggs' thirty days; the page never loads them from the
 * wiki, and the Content Security Policy is unchanged (`'self'`). As the eggs (`eggRoutes`).
 */
function iconRoutes(app: FastifyInstance): void {
  const kept = new Map<string, Buffer>();
  app.get<{ Params: { file: string } }>(`${ICON_PATH}:file`, async (request, reply) => {
    const { file } = request.params;
    if (!ICON_NAMES.has(file)) return sendFailure(request, reply, 404);
    let picture = kept.get(file);
    if (picture === undefined) {
      picture = await readFile(path.join(ICON_FOLDER, file));
      kept.set(file, picture);
    }
    return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
  });
}

/**
 * The pictures of the application's emoji (plan 8M-8A): public, as Discord's CDN has them, `GET
 * /emoji/<id>.png` for an emoji of the application alone (`EmojiPictures`; anything else 404),
 * fetched once and kept for good (an emoji's picture never changes under its id), in memory
 * once read (`EmojiPictures`). No limit per address; the first read of each costs, and counts
 * against the overall limit for a visitor who is not logged in (`publicCosts`, plan 8Z-2: 429
 * once that is spent, a picture in memory answered all the same).
 */
function emojiRoutes(
  app: FastifyInstance,
  emoji: WebDeps['emoji'],
  costOf: (request: FastifyRequest) => PublicCost,
): void {
  app.get<{ Params: { file: string } }>(`${EMOJI_PATH}:file`, async (request, reply) => {
    const id = /^(\d{17,20})\.png$/u.exec(request.params.file)?.[1];
    const cost = costOf(request);
    const picture = id === undefined ? undefined : await emoji.read(id, cost.mayCost);
    if (picture === REFUSED) return cost.refuse(reply);
    if (picture === undefined) return sendFailure(request, reply, 404);
    return reply
      .type(picture.type)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(picture.bytes);
  });
}

/**
 * The square pictures of the reports at stops (plan 8R-6): public, `GET /pictures/<key>.png` for
 * the pictures `StopPictures` made and nothing else, kept as long as the eggs (their address
 * carries `?v=` of what they show), in memory once read (`StopPictures`). The read from the
 * folder counts against the overall limit for a visitor who is not logged in, as the emoji's
 * (`publicCosts`, plan 8Z-2); Discord's media proxy, which fetches a post's pictures, is one.
 */
function pictureRoutes(
  app: FastifyInstance,
  pictures: WebDeps['pictures'],
  costOf: (request: FastifyRequest) => PublicCost,
): void {
  app.get<{ Params: { file: string } }>(`${PICTURE_PATH}:file`, async (request, reply) => {
    const key = /^([0-9a-f]{32})\.png$/.exec(request.params.file)?.[1];
    const cost = costOf(request);
    const picture = key === undefined ? undefined : await pictures.read(key, cost.mayCost);
    if (picture === REFUSED) return cost.refuse(reply);
    if (picture === undefined) return sendFailure(request, reply, 404);
    return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
  });
}
