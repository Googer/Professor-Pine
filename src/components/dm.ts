import { ComponentType, MessageFlags, type ButtonInteraction, type Message } from 'discord.js';
import type { AppContext } from '../app-context.js';
import { SCOPE_WORDS } from '../commands/notifications/want-input.js';
import { rewardLabel } from '../commands/notifications/want-boxes.js';
import type { ComponentHandler } from '../discord/command.js';
import { isSnowflake } from '../db/snowflake.js';
import { UserError } from '../discord/errors.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
import { wantTargetLabel, wantToken } from '../domain/pogo/wants.js';
import {
  CHANGE_ACTION,
  DM_KIND,
  STOP_ACTION,
  withoutButton,
  withStopped,
  type ControlRows,
} from '../render/notify-dm.js';
import { gymName } from '../render/raid-post.js';
import { plain } from '../render/text.js';
import { dialogName, scopeOf } from '../commands/notifications/want-boxes.js';
import {
  NOT_A_MEMBER,
  WANTS_OFF,
  rocketDialogOf,
  rocketWhosOf,
  wantDialogFor,
} from '../commands/notifications/wants.js';
import { TEAM_ROCKET } from '../commands/notifications/want-boxes.js';
import { readInTime } from '../discord/dialog.js';
import type { BoxSubject } from '../domain/pogo/want-boxes.js';
import { dmMessages } from './dm-messages.js';

/**
 * Stops one reason for the member who pressed, in the server the button names: removes the
 * want or the gym target, or switches the setting off. Gives the sentence that says what came
 * of it. Safe to repeat: what is gone already is said to be gone.
 */
async function stop(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  reason: Exclude<NotifyReason, { kind: 'subject' }>,
): Promise<string> {
  switch (reason.kind) {
    case 'want': {
      const name = plain(wantTargetLabel(ctx.gameData.catalogue, reason.target));
      // What it was for, read before it goes: a want for raids and spawns ends both, which
      // the member who pressed under a message about a raid may not expect.
      const token = wantToken(reason.target);
      const had = (await ctx.wants.list(memberId, guildId)).wants.find(
        (want) => wantToken(want.target) === token,
      );
      const removed = await ctx.wants.remove(memberId, guildId, reason.target);
      const both = had?.scope === 'both' ? ` (${SCOPE_WORDS.both})` : '';
      return removed
        ? `Removed **${name}**${both} from your list for that server. \`/want\` there adds it again.`
        : `**${name}** was already removed from your list for that server.`;
    }
    case 'gym': {
      const name = plain(gymName(ctx.gyms.get(reason.gymId)));
      const removed = await ctx.gymTargets.remove(memberId, guildId, reason.gymId);
      return removed
        ? `Removed **${name}** from your gyms for that server. \`/target\` there adds it again.`
        : `**${name}** was already removed from your gyms for that server.`;
    }
    case 'boss-set': {
      const { bossSetNotification } = await ctx.users.get(memberId);
      if (!bossSetNotification) {
        return 'That was off already: I do not tell you when an egg you are signed up for gets its boss.';
      }
      await ctx.users.update(memberId, { bossSetNotification: false });
      return (
        'Stopped: I will no longer tell you when an egg you are signed up for gets its boss. ' +
        '`/settings` turns it back on.'
      );
    }
    case 'new-train': {
      // Per server, like the wants: the button names the server of the train.
      const stopped = await ctx.newTrains.set(memberId, guildId, false, Date.now());
      return stopped
        ? 'Stopped: I will no longer tell you about new trains in that server. ' +
            '`/settings` there turns it back on.'
        : 'That was off already: I do not tell you about new trains in that server.';
    }
    case 'target': {
      // A box of `/want`'s dialog, or a research reward (plan 8R-1): that one alone.
      const name = plain(rewardLabel(ctx, reason.want));
      const removed = await ctx.targetWants.remove(memberId, guildId, reason.want);
      return removed
        ? `Removed **${name}** from your list for that server. \`/want\` there adds it again.`
        : `**${name}** was already removed from your list for that server.`;
    }
  }
}

/** The rows of controls of a message, as Discord's API has them. */
function rowsOf(message: Pick<Message, 'components'>): ControlRows {
  return message.components.flatMap((row) =>
    row.type === ComponentType.ActionRow ? [row.toJSON()] : [],
  );
}

/** The name of a server the bot is in, for a press from a DM, which has none. */
export function serverNameOf(
  interaction: { client: { guilds: { cache: { get(id: string): { name: string } | undefined } } } },
  guildId: string,
): string {
  return interaction.client.guilds.cache.get(guildId)?.name ?? 'that server';
}

/** Manage… of Team GO Rocket (plan 8R-4, design 4b): its one dialog for the server, as `openChange`. */
async function openRocketChange(
  interaction: ButtonInteraction,
  ctx: AppContext,
  guildId: string,
): Promise<void> {
  const held = await readForChange(interaction, ctx, guildId, async () =>
    rocketWhosOf(await ctx.targetWants.list(interaction.user.id, guildId)),
  );
  if (held.size === 0) {
    throw new UserError('**Team GO Rocket** is not on your list; `/want` adds it.');
  }
  const server = { id: guildId, name: serverNameOf(interaction, guildId) };
  await interaction.showModal(rocketDialogOf(held, { server, openedAt: Date.now() }));
}

/**
 * Manage… (plan 8R-4, design 4, R15–R20): the dialog of a species, a form beyond the Which field
 * or a tier for the server of the button, with the member's rows as stored, read in time
 * (`readInTime`) before anything is answered (the dialog must be the first answer). It never
 * writes (S2): nothing held is said, and so is a member no longer in that server and wants
 * switched off.
 */
async function openChange(
  interaction: ButtonInteraction,
  ctx: AppContext,
  guildId: string,
  subject: BoxSubject,
): Promise<void> {
  const memberId = interaction.user.id;
  const scope = scopeOf(ctx, subject);
  const held = await readForChange(interaction, ctx, guildId, () =>
    ctx.wantBoxes.held(memberId, guildId, scope),
  );
  if (held.length === 0) {
    throw new UserError(
      `**${plain(dialogName(ctx, subject))}** is not on your list; \`/want\` adds it.`,
    );
  }
  const server = { id: guildId, name: serverNameOf(interaction, guildId) };
  const zone = ctx.servers.zoneOf(guildId);
  await interaction.showModal(
    wantDialogFor(ctx, subject, held, { server, openedAt: Date.now(), zone }),
  );
}

/**
 * The one check of a press of Manage… (B9): wants switched off, or a member no longer in the
 * server of the button, refused as a `UserError` (answered privately); else what `read` reads,
 * with the member, in time (`readInTime`), before any answer.
 */
async function readForChange<T>(
  interaction: ButtonInteraction,
  ctx: AppContext,
  guildId: string,
  read: () => Promise<T>,
): Promise<T> {
  if (!ctx.servers.of(guildId).features.notifications) throw new UserError(WANTS_OFF);
  const [member, value] = await readInTime(ctx.log, interaction, () =>
    Promise.all([ctx.members.find(guildId, interaction.user.id), read()]),
  );
  if (!member) throw new UserError(NOT_A_MEMBER);
  return value;
}

/**
 * The buttons under a direct message of the notifier (custom-id kind `dm`; the id is the
 * server's snowflake, see `custom-id.ts`). "Stop" stops that one reason for whoever pressed
 * it: nothing is looked up about the message or its recipient, so a press works after a
 * restart and removes only what the presser has themself. The answer comes in the DM, and the
 * button becomes a disabled "Stopped" while the rest of the message stays (`withStopped`: a
 * section must keep its accessory); under a classic message sent before the DMs were
 * components v2 the button goes from its row (`withoutButton`). The message is read anew for
 * that (`fetchReply`: after `deferUpdate` the reply is the message the button is on), one press
 * after the other, so that a button another press changed meanwhile stays changed. What was
 * stopped is stopped by then, so the answer is given whatever becomes of the button: when the
 * message cannot be read anew its components are those the press carries, and when it cannot be
 * changed the button stays (pressing it again says that it was removed already).
 *
 * It has no guards: a press comes from a DM, where there is no server and no member. Manage… (plan
 * 8R-4, `dm:<server>:change:sp:<dex>[:<form>]`, `…:st:<level>`) opens `/want`'s dialog instead
 * (`openChange`); its Submit is `wantBoxControls`'.
 */
export const dmControls: ComponentHandler = {
  kind: DM_KIND,
  throttle: MEMBER_WRITE_THROTTLE,
  async button(interaction, id, ctx) {
    if (id.action === CHANGE_ACTION) {
      if (id.args.length === 1 && id.args[0] === TEAM_ROCKET && isSnowflake(id.id)) {
        await openRocketChange(interaction, ctx, id.id);
        return;
      }
      const asked = parseStopArgs(id.args);
      if (asked?.kind !== 'subject' || !isSnowflake(id.id)) throw new UserError(STALE_COMPONENT);
      await openChange(interaction, ctx, id.id, asked.subject);
      return;
    }
    const reason = id.action === STOP_ACTION ? parseStopArgs(id.args) : undefined;
    // The id of a stop button is the snowflake of a server. A species or tier has Manage…
    // since plan 8R-4; its Stop of before was only ever on the test server (Matt): refused.
    if (!reason || reason.kind === 'subject' || !isSnowflake(id.id)) {
      throw new UserError(STALE_COMPONENT);
    }
    // The database first: the button goes only once it is known what came of it.
    await interaction.deferUpdate();
    const said = await stop(ctx, interaction.user.id, id.id, reason);
    await dmMessages.run(interaction.message.id, async () => {
      let now: Pick<Message, 'components' | 'flags'> = interaction.message;
      try {
        now = await interaction.fetchReply();
      } catch (err) {
        ctx.log.warn({ err }, 'could not read a direct message anew to take a button off');
      }
      try {
        const components = now.components.map((component) => component.toJSON());
        // A message of the notifier since 8B-1 is components v2: the button stays, as Stopped.
        // One sent before is a classic one with a row of buttons, and the button goes.
        await interaction.editReply(
          now.flags.has(MessageFlags.IsComponentsV2)
            ? {
                components: withStopped(components, interaction.customId),
                flags: MessageFlags.IsComponentsV2,
              }
            : { components: withoutButton(rowsOf(now), interaction.customId) },
        );
      } catch (err) {
        ctx.log.warn({ err }, 'could not take a button off a direct message');
      }
    });
    await interaction.followUp({ content: said });
  },
};
