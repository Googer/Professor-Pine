import { Routes, type REST } from 'discord.js';
import type { Logger } from '../log.js';

/**
 * Whether the bot's application is public (the portal's **Public Bot**: anybody with Manage
 * Server may add it to a server), read from `GET /applications/@me` (`bot_public`). A new install
 * reads it before its login to know which servers it may adopt (plan 19C-1, `ServerAdoption`).
 * Undefined where it could not be read (logged at warn), which the caller takes for public.
 */
export async function botIsPublic(
  rest: Pick<REST, 'get'>,
  log: Logger,
): Promise<boolean | undefined> {
  try {
    const application = (await rest.get(Routes.currentApplication())) as { bot_public?: unknown };
    if (typeof application.bot_public === 'boolean') return application.bot_public;
    log.warn('the application does not say whether it is public');
  } catch (err) {
    log.warn({ err }, 'could not read whether the application is public');
  }
  return undefined;
}
