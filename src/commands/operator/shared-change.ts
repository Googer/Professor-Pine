import type { ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { memberInfo } from '../../discord/member-info.js';
import { sharedChangeDm } from '../../render/shared-change-dm.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';

/** How long the owner's DM about a change is worth sending: a week, as the tool request's. */
const SHARED_CHANGE_DM_MS = 7 * 24 * 3_600_000;

/**
 * Tells the bot's owner by DM that a member of staff changed data every server shares: the event
 * window (`/operator event-window set` and `end`) and the boss overrides (`/operator boss add`, `hide`,
 * `autoset`, `shiny` and `remove`). Matt's ruling 5 of 2026-11-10: such data stays trust between
 * the servers (one server's staff change it for all), and the owner hears of every change, with
 * who and where. A job of the DM queue (`DmSender`, `normal`), one per change: no interval and
 * nothing dropped for an earlier one, unlike the owner's alerts about the bot itself
 * (`OwnerAlerts`). Called once the change is stored; it returns at once and never fails the
 * command. Nothing is sent of what the owner did themselves, nor without an owner (`OWNER_ID`).
 */
export function tellOwnerOfSharedChange(
  interaction: ChatInputCommandInteraction,
  ctx: Pick<AppContext, 'config' | 'dms'>,
  change: string,
  now: number = Date.now(),
): void {
  const ownerId = ctx.config.env.OWNER_ID.trim();
  if (ownerId === '' || interaction.user.id === ownerId) return;
  ctx.dms.send({
    userId: ownerId,
    message: sharedChangeDm({
      // Their name in the server; in a DM, their account's (plan 19B-1).
      by: {
        id: interaction.user.id,
        name:
          memberInfo(interaction).name ?? interaction.user.globalName ?? interaction.user.username,
      },
      // None from a direct message with the bot (`/operator` there, plan 19B-1).
      server:
        interaction.guildId === null
          ? undefined
          : { id: interaction.guildId, name: interaction.guild?.name },
      change,
    }),
    priority: DM_PRIORITY.normal,
    eventAt: now,
    expiresAt: now + SHARED_CHANGE_DM_MS,
  });
}
