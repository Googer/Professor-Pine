import type { ServerSettingsService } from './server-settings.js';
import type { LeftServers } from './server-standings.js';

/**
 * Whether Pine does nothing for a server outside its interactions (`servers.md`, "What stops for
 * a quiet server"): no post drawn, edited or swept, nobody told, nothing announced or deleted by
 * a clock. A server is quiet while Pine has left it (plan 19C-1, `ServerStandings.isLeft`) and
 * while it is in setup (plan 19C-2, `ServerSettings.inSetup`). The one question the few places
 * that act on a server outside its interactions ask.
 */
export interface QuietServers {
  isQuiet(serverId: string): boolean;
}

/** The quiet servers: those left, and those in setup, each asked at every call. */
export function quietServers(
  left: LeftServers,
  servers: Pick<ServerSettingsService, 'inSetup'>,
): QuietServers {
  return { isQuiet: (serverId) => left.isLeft(serverId) || servers.inSetup(serverId) };
}
