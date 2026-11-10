import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import { DELETION_PENDING, forumInDialog, mayNotDelete } from '../commands/parties/delete.js';
import type { ComponentHandler } from '../discord/command.js';
import { deferSubmit, readInTime } from '../discord/dialog.js';
import { UserError } from '../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
import { answerApart, v2Answer } from '../discord/late-reply.js';
import { memberInfo } from '../discord/member-info.js';
import { STALE_COMPONENT } from '../discord/router.js';
import type { ModerationReport, PostRemoval, ReportRemoval } from '../domain/moderation/reports.js';
import { partyWord } from '../domain/party/party.js';
import { APPROVED_ACCENT, REFUSED_ACCENT } from '../render/meetup-safety.js';
import {
  ENDING_ACTIONS,
  REPORT_ACTIONS,
  REPORT_KIND,
  removalDialog,
  removalOf,
  type ReportAction,
} from '../render/moderation.js';
import { count, memberText, timestamp } from '../render/text.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { actionRow, textMessage } from '../render/v2.js';
import type { ReportDecision } from '../services/moderation-reports.js';
import { SAFETY_THROTTLE } from './meetup-safety.js';

/** What a report's decision was, for a press that came second. */
function decidedAs(report: ModerationReport): string {
  switch (report.status) {
    case 'closed':
      return 'closed';
    case 'refused':
      return 'the place refused, and the meetup closed';
    case 'blocked':
      return 'its maker blocked, and the meetup closed';
    case 'deleted':
      return 'the message deleted';
    case 'dismissed':
      return 'dismissed';
    case 'gone':
      return 'the message was gone';
    case 'ended':
    case 'open':
      return 'it was over';
  }
}

/** What the word of a report's subject is: `meetup`, `raid`, `train`, `message`. */
function wordOf(report: ModerationReport): string {
  return report.subject.kind === 'party'
    ? partyWord({ type: report.subject.partyType })
    : 'message';
}

const REMOVED: Record<ReportRemoval, string> = {
  archive: 'archived',
  delete: 'deleted',
  denied: 'archived: Discord refused to delete it',
};

/** What the moderator who pressed is told, privately. */
export function reportDecisionWords(outcome: ReportDecision): string {
  switch (outcome.kind) {
    case 'gone':
    case 'not-offered':
      return STALE_COMPONENT;
    case 'may-not-delete':
      return mayNotDelete(outcome.forumId);
    case 'no-place':
      return (
        'The meetup’s place is now a dropped pin or none, which cannot be refused: nothing ' +
        'changed, and the report is still open.'
      );
    case 'failed': {
      const { word } = outcome;
      const done = [
        ...(outcome.placeRefused ? ['the place is refused for good'] : []),
        ...(outcome.blocked ? ['its maker is blocked'] : []),
      ];
      if (done.length === 0 && outcome.reopened) {
        return 'That could not be done: nothing changed, and the report is still open. Try again.';
      }
      const message = word === 'message';
      const but = done.length === 0 ? '' : `${done.join(' and ')}, but `;
      const left = `${but}the ${word} is not ${message ? 'deleted' : 'closed'}`;
      if (outcome.reopened) {
        return `That could not be finished: ${left}. The report is open again: try again.`;
      }
      const yourself = message ? 'Delete the message yourself.' : `Close the ${word} with /delete.`;
      return `That could not be finished: ${left}, and the report could not be opened again. ${yourself}`;
    }
    case 'may-not-delete-message':
      return `I can't delete messages in <#${outcome.channelId}>; delete it yourself.`;
    case 'decided-before': {
      const { report } = outcome;
      if (report.status === 'ended') {
        return `This ${wordOf(report)} was over before anybody decided: the report is closed.`;
      }
      const who =
        report.decidedBy === null
          ? 'A moderator'
          : memberText({ id: report.decidedBy, name: report.decidedByName ?? undefined });
      const when = report.decidedAt === null ? '' : ` ${timestamp(report.decidedAt, 'R')}`;
      return `${who} decided this already${when}: ${decidedAs(report)}.`;
    }
    case 'done': {
      const { report } = outcome;
      const word = wordOf(report);
      // "its post is archived for now: …" where the network failed the deletion (review r1 C1).
      const post = outcome.refusedDeletion
        ? 'archived: Discord refused to delete it; delete it yourself'
        : outcome.deletionPending
          ? `is archived for now: ${DELETION_PENDING}`
          : REMOVED[report.removal ?? 'archive'];
      switch (report.status) {
        case 'closed':
          return `Closed: the ${word} is over, and its post ${post}.`;
        case 'refused':
          return (
            `Refused: no meetup can be held at this place from now on. The meetup is closed, ` +
            `and its post ${post}.`
          );
        case 'blocked': {
          const closed = `The meetup is closed, and its post ${post}.`;
          if (outcome.newBlock === false) return `Its maker was blocked already. ${closed}`;
          const others = outcome.closed ?? 0;
          const withdrawn = outcome.withdrawn ?? 0;
          const meetups = others === 0 ? 'no other meetup' : count(others, 'other meetup');
          const requests = withdrawn === 0 ? 'no request' : count(withdrawn, 'request');
          return (
            `Blocked: its maker can no longer create meetups here (${meetups} closed, ` +
            `${requests} withdrawn). ${closed} They are told, and may appeal.`
          );
        }
        case 'deleted':
          return 'Deleted: the message is gone.';
        case 'gone':
          return 'The message was gone already.';
        default:
          return 'Dismissed: nothing else changes.';
      }
    }
  }
}

/** The question of the dialog before an action that ends a party, by the action. */
function questionOf(action: ReportAction, word: string): string {
  switch (action) {
    case 'refuse':
      return `Refuse this place for good, and close this ${word}?`;
    case 'block':
      return `Block its maker from creating meetups here, and close this ${word}?`;
    default:
      return `Close this ${word}?`;
  }
}

/** The title of the dialog of an action that ends a party: the act. */
function titleOf(action: ReportAction, word: string): string {
  switch (action) {
    case 'refuse':
      return 'Refuse this place';
    case 'block':
      return 'Block the maker';
    default:
      return `Close this ${word}`;
  }
}

/**
 * Decides the report as the moderator chose and answers them privately: after a Submit in the
 * edit of its private acknowledgement, after the Archive post of a refused deletion in the place
 * of that answer. Where Discord's permissions refuse the deletion (`may-not-delete`, which the
 * dialog did not foresee: the bot lost Manage Threads since), the answer keeps Archive post,
 * which archives at once.
 */
async function decideAndAnswer(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  reportId: string,
  action: ReportAction,
  removal: PostRemoval | null,
): Promise<void> {
  const outcome = await ctx.reports.decide(
    reportId,
    action,
    removal,
    { id: interaction.user.id, name: memberInfo(interaction).name },
    guildIdOf(interaction),
    interaction.guild?.name,
  );
  const words = reportDecisionWords(outcome);
  if (outcome.kind === 'may-not-delete') {
    await answerApart(
      interaction,
      textMessage(
        REFUSED_ACCENT,
        [words],
        [
          actionRow([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Archive post',
              custom_id: encodeCustomId({
                kind: REPORT_KIND,
                id: reportId,
                action,
                args: ['archive'],
              }),
            },
          ]),
        ],
      ),
    );
    return;
  }
  if (removal !== null) {
    const accent = outcome.kind === 'done' ? APPROVED_ACCENT : REFUSED_ACCENT;
    await interaction.editReply(v2Answer(textMessage(accent, [words])));
  } else {
    await interaction.editReply({ content: words });
  }
}

/**
 * The buttons of a report's post in the moderators' channel (plan 8S-2; custom-id kind
 * `mreport`): `mreport:<report id>:close|refuse|block|delete|dismiss`. An action that ends a
 * party asks first in a dialog (plan 8Q, `removalDialog`: archive or delete the post, or archive
 * only where the bot may not delete there), the report read within `DIALOG_READ_MS` and one
 * decided already said at once, privately, without a dialog; its Submit
 * (`mreport:<report id>:<action>[:archive]:~<token>`, the token left out by `removalOf`) decides. A deletion refused at Submit is answered
 * with Archive post, `mreport:<report id>:<action>:archive`, which decides at once. For staff
 * alone (`requireManagement`; others are refused privately, uncounted), with the throttle of the
 * moderators' posts for presses and Submits alike. The report is read from the database, so a
 * post from before a restart works; the decision is the service's (`ModerationReports.decide`,
 * the first one wins), which edits the post for everybody; the moderator is told privately.
 */
export const reportDecisionControls: ComponentHandler = {
  kind: REPORT_KIND,
  guards: [requireGuild, requireManagement],
  throttle: SAFETY_THROTTLE,

  async button(interaction, id, ctx) {
    const action = REPORT_ACTIONS.find((one) => one === id.action);
    if (action === undefined) throw new UserError(STALE_COMPONENT);
    const [chosen] = id.args;
    const ending = ENDING_ACTIONS.includes(action);
    if (ending && chosen === undefined) {
      // The dialog first: nothing changes until the moderator submits.
      const report = await readInTime(ctx.log, interaction, () => ctx.reports.reportOf(id.id));
      if (!report || report.serverId !== guildIdOf(interaction))
        throw new UserError(STALE_COMPONENT);
      // Decided already: said at once, no dialog.
      if (report.status !== 'open') {
        throw new UserError(reportDecisionWords({ kind: 'decided-before', report }));
      }
      const word = wordOf(report);
      const partyId = report.subject.kind === 'party' ? report.subject.partyId : undefined;
      const forumId = (partyId === undefined ? undefined : ctx.parties.get(partyId))
        ?.forumChannelId;
      const customId = (args: string[]) =>
        encodeCustomId({ kind: REPORT_KIND, id: id.id, action, args });
      await interaction.showModal(
        removalDialog({
          customId,
          opened: Date.now(),
          title: titleOf(action, word),
          question: questionOf(action, word),
          mayDelete: partyId === undefined || ctx.partyService.mayDeletePost(partyId),
          forum: forumInDialog(interaction, forumId ?? null),
        }),
      );
      return;
    }
    // Archive post of a deletion refused at Submit; Delete post of a question from before the
    // dialog is no control any more.
    if (ending ? chosen !== 'archive' : chosen !== undefined) throw new UserError(STALE_COMPONENT);
    // Ending a party and editing posts take longer than Discord waits for an answer.
    if (ending) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await decideAndAnswer(interaction, ctx, id.id, action, ending ? 'archive' : null);
  },

  /** The Submit of the dialog of an action that ends a party: acknowledged privately at once. */
  async modal(interaction, id, ctx) {
    const action = REPORT_ACTIONS.find((one) => one === id.action);
    if (action === undefined || !ENDING_ACTIONS.includes(action)) {
      throw new UserError(STALE_COMPONENT);
    }
    const removal = removalOf(interaction, id.args);
    if (removal === undefined) throw new UserError(STALE_COMPONENT);
    await deferSubmit(interaction);
    await decideAndAnswer(interaction, ctx, id.id, action, removal);
  },
};
