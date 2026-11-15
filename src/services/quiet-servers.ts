import type { ServerSettingsService } from './server-settings.js';
import type { LeftServers, ServerStandings } from './server-standings.js';

/**
 * Whether Pine does nothing for a server outside its interactions (`servers.md`, "What stops for
 * a quiet server"): no post drawn, edited or swept, nobody told, nothing announced or deleted by
 * a clock. A server is quiet while Pine is not serving it (`unservedServers`: Pine has left it,
 * plan 19C-1, `ServerStandings.isLeft`, or it may not have this Pine, `ServerStandings.mayHave`,
 * though Pine is still in it, final review R4-3) and while it is in setup (plan 19C-2,
 * `ServerSettings.inSetup`). The one question the few places that act on a server outside its
 * interactions ask.
 */
export interface QuietServers {
  isQuiet(serverId: string): boolean;
}

/**
 * The servers Pine does not serve (final review R4-3): those it left, and those it is still in
 * that may not have this Pine (blocked by an operator, a leave that failed and is tried again;
 * refused in rehearsal mode, which leaves no server; a new install's server waiting for the
 * owner's word), each asked at every call. What `ServerNotices` tells nothing.
 */
export function unservedServers(
  standings: Pick<ServerStandings, 'isLeft' | 'mayHave'>,
): LeftServers {
  return { isLeft: (serverId) => standings.isLeft(serverId) || !standings.mayHave(serverId) };
}

/** The quiet servers: those not served (`unservedServers`), and those in setup, each asked at every call. */
export function quietServers(
  standings: Pick<ServerStandings, 'isLeft' | 'mayHave'>,
  servers: Pick<ServerSettingsService, 'inSetup'>,
): QuietServers {
  const unserved = unservedServers(standings);
  return { isQuiet: (serverId) => unserved.isLeft(serverId) || servers.inSetup(serverId) };
}
