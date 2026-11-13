import type { AppContext } from '../../app-context.js';
import type { GuardableInteraction } from '../../discord/command.js';
import { memberInfo } from '../../discord/member-info.js';
import { sharedChangeDm, type SharedChangeView } from '../../render/shared-change-dm.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';

/** How long the owner's DM about a change is worth sending: a week, as the tool request's. */
const SHARED_CHANGE_DM_MS = 7 * 24 * 3_600_000;

/** What the owner is told of a removal of a member's data (`/operator forget`, plan 19B-1). */
export const FORGET_TOLD =
  'Removed a member’s data on request, in every server (`/operator forget`).';

/**
 * Tells the bot's owner by DM that somebody changed data every server shares (`/operator`, plan
 * 19B-1): the event window (`event-window set` and `end`), the boss overrides (`boss add`, `hide`,
 * `autoset`, `shiny` and `remove`), a read of a boss feed that went through (`boss sync`) and a
 * clear of the map pictures that deleted any (`clear-image-cache`). Matt's ruling 5 of
 * 2026-11-10: such data stays trust between the servers (one server's staff change it for all),
 * and the owner hears of every change, with who (their name in the server, else their account's,
 * and their id) and from where (the server's name and id, or a direct message with the bot,
 * where an operator may use `/operator`). A job of the DM queue (`DmSender`, `normal`), one per
 * change: no interval and nothing dropped for an earlier one, unlike the owner's alerts about the
 * bot itself (`OwnerAlerts`). Called once the change is stored; it returns at once and never
 * fails the command. Nothing is sent of what the owner did themselves, nor without an owner
 * (`OWNER_ID`).
 */
export function tellOwnerOfSharedChange(
  interaction: GuardableInteraction,
  ctx: Pick<AppContext, 'config' | 'dms'>,
  change: string,
  now: number = Date.now(),
): void {
  tellOwner(interaction, ctx, { change }, now);
}

/**
 * Tells the bot's owner by DM that another operator removed a member's data (`/operator forget`,
 * plan 19B-1), as `tellOwnerOfSharedChange` tells of a shared change: who did and from where,
 * never whose data (neither their name nor their id). Called once the removal has committed.
 */
export function tellOwnerOfForget(
  interaction: GuardableInteraction,
  ctx: Pick<AppContext, 'config' | 'dms'>,
  now: number = Date.now(),
): void {
  tellOwner(interaction, ctx, { title: 'A member’s data removed', change: FORGET_TOLD }, now);
}

function tellOwner(
  interaction: GuardableInteraction,
  ctx: Pick<AppContext, 'config' | 'dms'>,
  what: Pick<SharedChangeView, 'title' | 'change'>,
  now: number,
): void {
  const ownerId = ctx.config.env.OWNER_ID.trim();
  if (ownerId === '' || interaction.user.id === ownerId) return;
  ctx.dms.send({
    userId: ownerId,
    message: sharedChangeDm({
      ...what,
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
    }),
    priority: DM_PRIORITY.normal,
    eventAt: now,
    expiresAt: now + SHARED_CHANGE_DM_MS,
  });
}
