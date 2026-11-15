import type { GuildStore } from '../db/repositories/guild-repository.js';
import type { Logger } from '../log.js';

/**
 * Makes sure every guild the bot is in has a Guild row: in chunks (`GuildStore.ensureAll`; a
 * shard's ready names up to 2,500 servers, 19D fix round 1, F3). Never rejects: a failure is
 * logged with how many servers it was about.
 */
export async function syncGuilds(
  store: GuildStore,
  guildIds: readonly string[],
  log: Logger,
): Promise<void> {
  if (guildIds.length === 0) return;
  try {
    await store.ensureAll(guildIds);
  } catch (err) {
    log.error({ err, guilds: guildIds.length }, 'could not record the servers');
  }
}
