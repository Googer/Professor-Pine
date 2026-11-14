import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isSnowflake } from '../db/snowflake.js';
import { REFUSED } from '../services/costly.js';
import { sendFailure, shortPage } from './answers.js';
import { editorRoutes } from './editor-routes.js';
import { findRoutes } from './find-routes.js';
import { etagMatches } from './geo-cache.js';
import { liveRoutes } from './live-routes.js';
import { mapMemberRole } from '../config/server-settings.js';
import { countsOnTheMap, mapMembers } from './map-members.js';
import { maxRoutes } from './max-routes.js';
import { meetupRoutes } from './meetup-routes.js';
import { shownTiles } from './headers.js';
import type { PacedMembers } from './paced-members.js';
import { historyRoutes } from './history-routes.js';
import { historyPage, mapPage, mePage } from './page.js';
import { partyRoutes } from './party-routes.js';
import { postControlRoutes } from './post-control-routes.js';
import { PartyViewers } from './party-viewers.js';
import { raidRoutes } from './raid-routes.js';
import { regionRoutes } from './region-routes.js';
import type { CostOf } from './public-costs.js';
import { limitedRead } from './rate-limit.js';
import { mayEditRegions } from './region-staff.js';
import { spawnRoutes } from './spawn-routes.js';
import { takeZone } from './request-zone.js';
import { stopRoutes } from './stop-routes.js';
import type { WebDeps } from './server.js';
import { trainRoutes } from './train-routes.js';

/** The requests for a server's regions and gyms one address may make in a minute (spec 5). */
const GEO_PER_MINUTE = 60;
/** The requests for who is asking one address may make in a minute (each page load asks once). */
const ME_PER_MINUTE = 60;

/** The request of an address of one server, `/s/<guild>/…`. */
export type GuildRequest = FastifyRequest<{ Params: { guild: string } }>;

/**
 * The addresses of one Discord server, `/s/<guild>/…` (spec 2.1): a server the bot is not in,
 * or no snowflake at all, is not found before anything else is looked at.
 */
/** The map's member role where the bot cannot name it: `you need the map member role`. */
export const MAP_ROLE_UNNAMED = 'map member';

/**
 * The addresses of a server in setup that its staff may use (plan 19C-2): the region editor
 * (`editorRoutes`) and the map it draws on, with the two answers the map needs to open it (who is
 * asking, the regions and gyms). Each by its route, under `/s/:guild`.
 */
const SETUP_ROUTES: ReadonlySet<string> = new Set([
  '/regions/edit',
  '/api/regions/edit',
  '/api/regions/preview',
  '/api/regions/save',
  '/map',
  '/api/me',
  '/api/geo',
]);

/** The prefix of a server's routes (`buildWebServer`). */
const GUILD_PREFIX = '/s/:guild';

/**
 * Whether a request to a server in setup is let through (plan 19C-2): one of `SETUP_ROUTES`, by
 * somebody logged in whom the member directory finds staff who may edit the server's regions
 * (`mayEditRegions`, as the map's hint of the editor reads them: kept a minute, never a fresh
 * look-up for every request); the editor's own routes then ask Discord afresh, as anywhere. Not
 * where the directory cannot say.
 */
async function editsInSetup(
  request: GuildRequest,
  reply: FastifyReply,
  deps: WebDeps,
): Promise<boolean> {
  const route = request.routeOptions.url;
  if (route === undefined || !route.startsWith(GUILD_PREFIX)) return false;
  if (!SETUP_ROUTES.has(route.slice(GUILD_PREFIX.length))) return false;
  const session = await deps.sessions.of(request, reply);
  if (!session) return false;
  try {
    const found = await deps.members.find(request.params.guild, session.userId);
    return (
      found?.standing !== undefined &&
      mayEditRegions(found.standing, session.userId, deps.parties.ownerId)
    );
  } catch (err) {
    deps.log.warn(
      { err, guild: request.params.guild, user: session.userId },
      'could not ask whether somebody on the web pages is staff of a server in setup',
    );
    return false;
  }
}

export function guildRoutes(
  scope: FastifyInstance,
  deps: WebDeps,
  pacedMembers: PacedMembers,
  costOf: CostOf,
): void {
  const { sessions } = deps;
  // Who counts as a member on the map (the map's member role of the server's values, plan
  // 19A-1): the parties (`/api/me` judges it by `countsOnTheMap` itself, to tell a member without
  // the role which role it is); the region editor asks its own question (staff) and is not
  // affected.
  const memberRoleOf = (guildId: string) => mapMemberRole(deps.serverSettings.of(guildId));
  const judged = mapMembers(deps.members, memberRoleOf);
  const map: WebDeps = {
    ...deps,
    members: {
      find: (guildId, userId) => judged.find(guildId, userId),
      holds: (guildId, userId) => deps.members.holds(guildId, userId),
    },
  };
  scope.addHook('onRequest', async (request: GuildRequest, reply) => {
    const { guild } = request.params;
    if (!isSnowflake(guild) || !deps.servers.has(guild)) return sendFailure(request, reply, 404);
    // A server in setup (plan 19C-2) is one Pine is not in, but for its staff's region editor.
    if (deps.servers.inSetup(guild) && !(await editsInSetup(request, reply, deps))) {
      return sendFailure(request, reply, 404);
    }
    // The server's zone, once for the whole answer (plan 19A-2, `requestZone`).
    takeZone(request, deps.serverSettings.zoneOf(guild));
  });

  // The map page (spec 3.1): the static template, told the server, the tiles and how to log in.
  scope.get('/map', async (request: GuildRequest, reply) => {
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
    const { manifest } = deps.assets;
    if (!manifest) {
      return reply
        .code(503)
        .send(shortPage('The map has not been built yet: run npm run web:build.'));
    }
    const tiles = shownTiles(deps.settings.tiles, deps.googleKey);
    return reply.send(
      mapPage(
        {
          guildId: request.params.guild,
          tiles,
          googleKey: tiles === 'google' ? deps.googleKey : undefined,
          login: deps.oauth ? 'discord' : 'links',
          // The units of the server it shows (plan 19A-1).
          distanceUnits: deps.serverSettings.of(request.params.guild).distanceUnits,
        },
        manifest,
      ),
    );
  });

  // The history page (plan 8H-5): the static template, told the server and how to log in; its
  // data (`/api/stats/regions`) is for members only.
  scope.get('/history', async (request: GuildRequest, reply) => {
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
    const { manifest } = deps.assets;
    if (!manifest) {
      return reply
        .code(503)
        .send(shortPage('The history page has not been built yet: run npm run web:build.'));
    }
    return reply.send(
      historyPage(
        { guildId: request.params.guild, login: deps.oauth ? 'discord' : 'links' },
        manifest,
      ),
    );
  });

  // "Your history" (plan 8H-6): the history page's bundle drawing the member's own numbers; its
  // data (`/api/stats/me`) is the member's alone.
  scope.get('/me', async (request: GuildRequest, reply) => {
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
    const { manifest } = deps.assets;
    if (!manifest) {
      return reply
        .code(503)
        .send(shortPage('This page has not been built yet: run npm run web:build.'));
    }
    return reply.send(
      mePage({ guildId: request.params.guild, login: deps.oauth ? 'discord' : 'links' }, manifest),
    );
  });

  // Who is asking (spec 2.5): the page's header, whether they are a member of this server (one
  // login for every server: membership is asked per server, from Discord, kept a minute by the
  // directory; without the map's member role a member is none here, and is told the role's name,
  // `missingRole`: they are in the server, whose roles they see on Discord), and the CSRF token
  // its POSTs carry. When Discord cannot say, the page is read-only. Every request counts against
  // the address, as it may ask Discord. Somebody logged in whom the directory finds not in the
  // server is given the server's invite where the settings have one (`invite`, plan 8M-11B):
  // nobody logged out (they may be a member), no member without the role, nobody while read-only.
  scope.get(
    '/api/me',
    { onRequest: limitedRead(ME_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return { loggedIn: false };
      let member = false;
      let missingRole: string | undefined;
      let readOnly = false;
      let mayEdit = false;
      let invite: string | undefined;
      const { guild } = request.params;
      const memberRole = memberRoleOf(guild);
      try {
        const found = await deps.members.find(guild, session.userId);
        // The server's invite (plan 19A-1: its values).
        if (found === undefined) invite = deps.serverSettings.of(guild).invite;
        member = found !== undefined && countsOnTheMap(found.standing, memberRole);
        // Its name as the server has it now (a role the bot cannot see: by what it is for).
        if (found !== undefined && !member && memberRole !== undefined) {
          missingRole = deps.roleName(guild, memberRole) ?? MAP_ROLE_UNNAMED;
        }
        // Whether to offer "Edit regions" (plan 8M-10): a hint by the member as the directory
        // keeps them, never asked of Discord for it; the editor's data asks fresh and decides.
        mayEdit =
          found?.standing !== undefined &&
          mayEditRegions(found.standing, session.userId, deps.parties.ownerId);
      } catch (err) {
        deps.log.warn(
          { err, guild: request.params.guild, user: session.userId },
          'could not ask whether somebody on the web pages is a member',
        );
        readOnly = true;
      }
      return {
        loggedIn: true,
        name: session.userName,
        // Whose staged region edits the page counts in "Edit regions" (plan 8M-11C, S31): the
        // browser keeps them per server and member. The member's own id, to themselves alone.
        userId: session.userId,
        member,
        csrf: sessions.csrfToken(session),
        readOnly,
        mayEditRegions: mayEdit,
        // A server in setup (plan 19C-2, S11), which only its staff's region editor reaches: the
        // page starts no live layer.
        ...(deps.servers.inSetup(guild) ? { inSetup: true } : {}),
        ...(missingRole === undefined ? {} : { missingRole }),
        ...(invite === undefined ? {} : { invite }),
      };
    },
  );

  // Who sees which parties and reports at stops on the map (spec 2.5): one for both, so that what
  // Discord said of a member and a forum serves the two lists a page polls, and the regions and
  // gyms' question who is a member.
  const viewers = new PartyViewers({
    members: map.members,
    asks: mapMembers(pacedMembers, memberRoleOf),
    forums: deps.parties.forums,
    log: deps.log,
    now: deps.now,
  });

  // The regions and gyms of the server (spec 3.1): for anybody, kept until they change, answered
  // with 304 when the page has them already; every request counts against the address, and
  // against the member where somebody is logged in. A member of the server (as the lists ask it,
  // `askedMembership`: the map's role counted, a member Discord said lately one still) gets every
  // region; anybody else, logged in or not, and whoever Discord cannot say of, the public view,
  // without the regions whose channel neither everybody in the server nor a member holding one
  // self-assignable role can view and the gyms that lie in those alone (Matt's ruling 8, plan
  // 8Z-2, F-B10; `GeoCache`, `publicRegions`). So the answer is
  // the asker's (`private`, `Vary: Cookie`), and an ETag of one view never matches the other.
  // Building a view anew is work that costs: for a visitor who is not logged in it counts
  // against the views' overall budget, for somebody logged in against their account
  // (`publicCosts`, plan 8Z-2, F-B3), 429 once that is spent; the view as kept is answered all
  // the same.
  scope.get(
    '/api/geo',
    { onRequest: limitedRead(GEO_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-cache').header('vary', 'Cookie');
      const { guild } = request.params;
      const session = await sessions.of(request, reply);
      const member =
        session === undefined ? undefined : await viewers.askedMembership(guild, session.userId);
      const cost = costOf(request, 'geo');
      const view = await deps.geo.view(
        guild,
        member?.kind === 'member' ? 'members' : 'public',
        cost.mayCost,
      );
      if (view === REFUSED) return cost.refuse(reply);
      void reply.header('etag', view.etag);
      if (etagMatches(request.headers['if-none-match'], view.etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(view.body);
    },
  );

  // The region editor (plan 8M-2): its data for the server's staff.
  editorRoutes(scope, deps);

  // The parties on the live map, and joining them (plan 8M-3): for members of the server (with
  // the map's member role, when the settings name one).
  partyRoutes(scope, map, viewers);

  // The post's controls that open a dialog on Discord, as forms of the map (plan 8M-8B).
  postControlRoutes(scope, map);

  // Reporting and changing raids on the live map (plan 8M-4): for the same members.
  raidRoutes(scope, map);

  // Wild Pokémon on the live map: reporting them (plan 8M-4S) and those that stand, for the same
  // members, through the same viewers.
  spawnRoutes(scope, map, viewers);

  // Starting, arranging and moving trains on the live map (plan 8M-5): for the same members.
  trainRoutes(scope, map);

  // Making and changing meetups on the live map (plan 8M-5M): for the same members.
  meetupRoutes(scope, map);

  // Max battles on the live map (plan 8X-5): the power spots, the pick lists and reports, for the
  // same members.
  maxRoutes(scope, map);

  // Reports at stops on the live map (plan 8R-3): today's reports, for the same members.
  stopRoutes(scope, map, viewers);

  // The activity heatmap of the party history (plan 8H-4): for the same members, the regions
  // they are barred from left out by the same viewers.
  historyRoutes(scope, map, viewers);

  // "Your regions" on the live map (plan 8M-20): how the member stands to each region, and the
  // roles that open them, for the same members, through the same viewers.
  regionRoutes(scope, map, viewers);

  // Find's places by name on the live map (plan 8M-12): for the same members.
  findRoutes(scope, map);

  // The stream that says a list changed (live updates): for the same members.
  liveRoutes(scope, map, viewers);
}
