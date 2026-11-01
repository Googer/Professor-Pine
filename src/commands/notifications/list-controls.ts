import type { ButtonInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { parseStopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
import { LIST_ACTIONS } from '../../render/member-list.js';

/** What the controls of a member's list (`renderMemberList`) need of the list they are under. */
export interface MemberListSource {
  /** The custom-id kind of the list's controls (`wantlist`, `targetlist`). */
  kind: string;
  /** The command that shows the list, as a member types it: `/wants`. */
  command: string;
  /** The member's list as it is now, at a page (from 0; one past the end shows the last). */
  render(interaction: ButtonInteraction, ctx: AppContext, page: number): Promise<V2Message>;
  /**
   * Removes what a Remove button names, when it is the kind of thing this list holds; answers
   * false for anything else (then nothing was removed). What is gone already is no error.
   */
  remove(interaction: ButtonInteraction, ctx: AppContext, reason: NotifyReason): Promise<boolean>;
  /** "Remove all…": opens the dialog of `/unwant-all` (`/untarget-all`); the list stays. */
  askAll(interaction: ButtonInteraction, ctx: AppContext): Promise<void>;
  /**
   * The source's own actions of an item's button (plan 8R-4: `change` of `/wants`, which opens a
   * dialog), by action, with the custom id's arguments and the page shown; each answers itself.
   */
  actions?: Readonly<
    Record<
      string,
      (
        interaction: ButtonInteraction,
        ctx: AppContext,
        args: readonly string[],
        page: number,
      ) => Promise<void>
    >
  >;
}

/** The highest page a custom id may name: a list of a hundred thousand entries. */
const MAX_PAGE = 9_999;

/**
 * The handler of a member's list: Previous and Next show the page before or after the one the
 * message shows, Remove takes one entry off and shows the page again, "Remove all…" asks. The
 * list is read anew for every press (the message is never trusted), and shown with `update`.
 * The list is a private answer, so only its member can press its buttons; the server is the
 * interaction's. One throttle for all of them: the router throttles a kind as one, and the
 * throttles of reading and of writing a member's rows allow the same (30 a minute).
 */
export function memberListControls(source: MemberListSource): ComponentHandler {
  const stale = `That list is out of date. Use \`${source.command}\` again.`;
  return {
    kind: source.kind,
    guards: [requireGuild],
    // Page turns and Removes share one window of 30 a minute: a member who wants many entries
    // gone has "Remove all…" (or the `/unwant` and `/untarget` commands), not thirty presses.
    throttle: MEMBER_WRITE_THROTTLE,
    async button(interaction, id, ctx) {
      const shown = /^\d{1,4}$/.test(id.id) ? Number(id.id) : undefined;
      if (shown === undefined || shown > MAX_PAGE) throw new UserError(stale);
      let page = shown;
      switch (id.action) {
        case LIST_ACTIONS.prev:
          page = Math.max(0, shown - 1);
          break;
        case LIST_ACTIONS.next:
          page = shown + 1;
          break;
        case LIST_ACTIONS.all:
          await source.askAll(interaction, ctx);
          return;
        case LIST_ACTIONS.remove: {
          const reason = parseStopArgs(id.args);
          if (!reason || !(await source.remove(interaction, ctx, reason))) {
            throw new UserError(stale);
          }
          break;
        }
        default: {
          const own = source.actions?.[id.action];
          if (!own) throw new UserError(stale);
          await own(interaction, ctx, id.args, shown);
          return;
        }
      }
      await interaction.update(v2Answer(await source.render(interaction, ctx, page)));
    },
  };
}
