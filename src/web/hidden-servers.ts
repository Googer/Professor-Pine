import type { FastifyReply, FastifyRequest } from 'fastify';
import { isSnowflake } from '../db/snowflake.js';
import { mayEditRegions } from './region-staff.js';
import type { WebSession } from './session-model.js';
import type { WebDeps } from './server.js';

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

/**
 * Whether a request to a server in setup is let through (plan 19C-2): to one of `SETUP_ROUTES`
 * (`route`, the route's path under `/s/:guild`), by somebody logged in (`session`) whom the member
 * directory finds staff who may edit the server's regions (`mayEditRegions`, as the map's hint of
 * the editor reads them: kept a minute, never a fresh look-up for every request); the editor's
 * own routes then ask Discord afresh, as anywhere. Not where the directory cannot say. The
 * directory is asked at those routes alone (fix round 1, R1): elsewhere a request to a server in
 * setup does no more than one to a server Pine is not in.
 */
async function editsInSetup(
  session: WebSession | undefined,
  deps: WebDeps,
  guild: string,
  route: string | undefined,
): Promise<boolean> {
  if (route === undefined || !SETUP_ROUTES.has(route)) return false;
  if (!session) return false;
  try {
    const found = await deps.members.find(guild, session.userId);
    return (
      found?.standing !== undefined &&
      mayEditRegions(found.standing, session.userId, deps.parties.ownerId)
    );
  } catch (err) {
    deps.log.warn(
      { err, guild, user: session.userId },
      'could not ask whether somebody on the web pages is staff of a server in setup',
    );
    return false;
  }
}

/**
 * Whether a server's address answers a request exactly as a server Pine is not in (plan 19C-4;
 * spec "The web"), by `route`, the route's path under `/s/:guild` (`/map`, `/api/geo`): no
 * snowflake, or a server the bot is not in (or left, plan 19C-1); a server in setup to anybody
 * but its staff at its region editor (plan 19C-2); and a server whose map is closed to visitors
 * who are not logged in (`openToVisitors`, its `publicMap`) to such a visitor, whatever the
 * route: the pages, `/api/me`, the public view of `/api/geo`, and every answer that would say
 * "log in first". Somebody logged in is answered by the session's own rules. Nothing it does
 * shows in the answer (a session read sends a cookie only for a session there is), nor in its
 * time (fix round 1, R1): the session is read first, for every request alike, whatever the
 * server (a well-formed cookie costs a database read), so that a server Pine is in does no more
 * work than a snowflake it is not in.
 */
export async function hiddenFrom(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: WebDeps,
  guild: string,
  route: string | undefined,
): Promise<boolean> {
  const session = await deps.sessions.of(request, reply);
  if (!isSnowflake(guild) || !deps.servers.has(guild)) return true;
  if (deps.servers.inSetup(guild)) return !(await editsInSetup(session, deps, guild, route));
  if (deps.servers.openToVisitors(guild)) return false;
  return session === undefined;
}
