import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { answer } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { NOTIFICATION_THROTTLE } from './shared.js';

/** What a "remove all of them?" question is about. */
export interface RemoveAllOptions {
  /** The custom-id kind of its dialog; it belongs to this question alone. */
  kind: string;
  /** The dialog's title: `Remove all your wants`. */
  title: string;
  /** How many there are to remove for a member in a server. */
  count(ctx: AppContext, memberId: string, guildId: string): Promise<number>;
  /** Removes them all and gives how many went. */
  removeAll(ctx: AppContext, memberId: string, guildId: string): Promise<number>;
  /** What the member is told when there is nothing to remove. */
  none: string;
  /** The question, for `n` of them. */
  question(n: number): string;
  /** What the member is told once `n` are gone. */
  removed(n: number): string;
}

/** The action of the dialog's custom id: `<kind>:all:remove`. */
const REMOVE = 'remove';

/** What a Submit answers when the removal failed. */
const NOTHING_REMOVED = 'Nothing was removed.';

/**
 * A command that removes everything a member has of one kind in a server, after asking (plan
 * 8Q): a dialog with the question and `Submit removes them.` (`… removes it.` for one), Discord's
 * Cancel closing it; with nothing to remove the member is told so, privately, and nothing opens.
 * The count is read within `DIALOG_READ_MS` (`readInTime`). The dialog's custom id is
 * `<kind>:all:remove` (the server is the Submit's own, and only the asker can submit a dialog);
 * its Submit is acknowledged privately and removes whatever the list holds then, as the press
 * of the old question did. Gives the command's `execute` (declare no `defer`: the dialog is the
 * first answer) and the handler of the Submit. `ask` also answers "Remove all…" under a member's
 * list (`/wants`, `/targets`), which stays as it was.
 */
export function removeAllQuestion(options: RemoveAllOptions): {
  ask(interaction: ChatInputCommandInteraction | ButtonInteraction, ctx: AppContext): Promise<void>;
  controls: ComponentHandler;
} {
  return {
    async ask(interaction, ctx) {
      const guildId = guildIdOf(interaction);
      const n = await readInTime(ctx.log, interaction, () =>
        options.count(ctx, interaction.user.id, guildId),
      );
      if (n === 0) {
        await answer(interaction, { content: options.none });
        return;
      }
      await interaction.showModal(
        dialog({
          customId: encodeCustomId({ kind: options.kind, id: 'all', action: REMOVE }),
          title: options.title,
          text: `${options.question(n)}\n\nSubmit removes ${n === 1 ? 'it' : 'them'}.`,
        }),
      );
    },
    controls: {
      kind: options.kind,
      guards: [requireGuild],
      // Each Submit writes: the limit of the command, in the Submit's own window (the dialog's
      // custom id is the same every time, so nothing else holds it back).
      throttle: NOTIFICATION_THROTTLE,
      async modal(interaction, id, ctx) {
        if (id.action !== REMOVE) throw new UserError(STALE_COMPONENT);
        await deferSubmit(interaction);
        let content: string;
        try {
          const n = await options.removeAll(ctx, interaction.user.id, guildIdOf(interaction));
          content = n === 0 ? options.none : options.removed(n);
        } catch (err) {
          // Said before the router says what went wrong; an answer that cannot be given is
          // logged, so that the router gets the removal's own failure.
          await interaction.editReply({ content: NOTHING_REMOVED }).catch((noteErr: unknown) => {
            ctx.log.warn({ err: noteErr }, 'could not say that nothing was removed');
          });
          throw err;
        }
        await interaction.editReply({ content });
      },
    },
  };
}
