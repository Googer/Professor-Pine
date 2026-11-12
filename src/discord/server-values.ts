import type { AppContext } from '../app-context.js';
import type { ServerValues } from '../config/server-settings.js';

/**
 * The values of the server an interaction came from (plan 19A-1, `servers.md`); in a DM, the
 * file's defaults (`ServerSettingsService.defaults`), which is what a server without a row has.
 */
export function serverValuesOf(
  interaction: { guildId: string | null },
  ctx: Pick<AppContext, 'servers'>,
): ServerValues {
  return interaction.guildId === null
    ? ctx.servers.defaults()
    : ctx.servers.of(interaction.guildId);
}
