import type { ServerChannelRole } from '../config/server-settings.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { ServerSettingsLookup } from './server-settings.js';

/**
 * The channel of a role (bot updates, the copies' channels, Unown sightings, the moderators') in
 * the server of `nearChannelId` (a region's channel, a post), by the id its staff set (plan 19A-1,
 * `servers.md`), where the bot may post in it (`PartyGateway.findChannel`); undefined where the
 * server has none set, it is gone, or the bot may not post there. What `findChannel` did by the
 * file's name before 2.1.
 */
export function serverChannel(
  gateway: Pick<PartyGateway, 'findChannel' | 'serverOf'>,
  servers: ServerSettingsLookup,
  nearChannelId: string,
  role: ServerChannelRole,
): string | undefined {
  const server = gateway.serverOf(nearChannelId);
  const id = server === undefined ? undefined : servers.of(server).channels[role];
  return id === undefined ? undefined : gateway.findChannel(nearChannelId, id);
}
