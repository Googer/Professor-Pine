import type { GuildStore } from '../db/repositories/guild-repository.js';
import type { Logger } from '../log.js';

/** Makes sure every guild the bot is in has a Guild row. */
export async function syncGuilds(
  store: GuildStore,
  guildIds: readonly string[],
  log: Logger,
): Promise<void> {
  const results = await Promise.allSettled(guildIds.map((id) => store.ensure(id)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error(
        { err: result.reason as unknown, guild: guildIds[index] },
        'could not record guild',
      );
    }
  });
}
