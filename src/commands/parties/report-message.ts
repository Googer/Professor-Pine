import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import { channelContext } from '../../discord/channel-context.js';
import type { MessageCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Party } from '../../domain/party/party.js';
import type { MessageReportAsk } from '../../services/moderation-reports.js';
import type { PartyProvider } from '../../services/party-store.js';
import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
import {
  messageReportForm,
  NO_MODERATORS,
  partyReportForm,
  refuseReportedBefore,
  REPORT_REASON_INPUT,
  reportAnswer,
} from './report.js';
import { REPORT_WINDOW } from './report-limit.js';

/** The name of the entry in the Apps menu of a message (the design's words). */
export const REPORT_MESSAGE_NAME = 'Report to moderators';

/** What a member is told who uses it on a message of the bot that is no party's (the design's words). */
export const NOTHING_TO_REPORT = 'Nothing to report there.';

/** How long the form of a message's report may stay open: the message is kept that long. */
const FORM_MS = 30 * 60_000;

/** A reported message, kept between the Apps menu and its form. */
type PendingMessage = Omit<MessageReportAsk, 'reporter' | 'reason'>;

const pending = new PendingRequests<PendingMessage>({ ttlMs: FORM_MS });

/**
 * By member: the token of the message they are about to report. One each: a member's newer form
 * replaces the older, so that one member cannot push everybody else's out of `pending`.
 */
const tokens = new BoundedMap<string, string>(1_000);

/**
 * The party a message stands for: the first message of its post (whose id is the post's), a
 * copy of it in another channel (`mirrorMessages`), or the line in its region's channel that
 * links to it. Undefined for any other message.
 */
export function partyOfMessage(
  parties: Pick<PartyProvider, 'active'>,
  channelId: string,
  messageId: string,
): Party | undefined {
  return parties
    .active()
    .find(
      (party) =>
        (party.forumPostId === messageId && channelId === messageId) ||
        party.regionLinkMessageId === messageId ||
        party.mirrorMessages.some(
          (copy) => copy.channelId === channelId && copy.messageId === messageId,
        ),
    );
}

/**
 * "Report to moderators" in the Apps menu of a message (plan 8S-2): on a party's post, a copy of
 * it or its link line, the party's report (`/report`'s form); on any other message of the bot,
 * `NOTHING_TO_REPORT`; on anybody else's (also a member's in a party's post), a report of that
 * message alone, kept for its form under a token for half an hour. Discord sends the message,
 * text included, with the interaction: no intent is needed. Without a moderators' channel a
 * message cannot be reported (`NO_MODERATORS`). Counted on the form's submit, in `/report`'s
 * window (`reportControls`).
 */
export const reportMessageCommand: MessageCommand = {
  target: 'message',
  data: new ContextMenuCommandBuilder()
    .setName(REPORT_MESSAGE_NAME)
    .setType(ApplicationCommandType.Message),
  help: {
    category: 'raid-crud',
    alsoIn: ['train', 'meetup'],
    description:
      'Tell the moderators privately about a message, or about a raid, max battle, train or meetup',
    details:
      'On the post of a raid, max battle, train or meetup (or its copy, or its line in the region channel) ' +
      'it reports that raid, max battle, train or meetup, as `/report` does.\n\nOn any other message it reports that message ' +
      'alone: the moderators see who wrote it, where and when, and a copy of what it said. A ' +
      'form asks what is wrong; only the moderators read it.',
  },
  guards: [requireGuild],
  // `/report`'s window, which its form counts in: checked before the form, counting nothing.
  checks: REPORT_WINDOW,
  async run(interaction, ctx) {
    const target = interaction.targetMessage;
    const reporterId = interaction.user.id;
    const serverId = guildIdOf(interaction);
    const party = partyOfMessage(ctx.parties, target.channelId, target.id);
    if (party) {
      await refuseReportedBefore(ctx, serverId, { kind: 'party', partyId: party.id }, reporterId);
      await interaction.showModal(partyReportForm(party));
      return;
    }
    if (target.author.id === interaction.client.user.id) throw new UserError(NOTHING_TO_REPORT);
    if (!ctx.reports.on(serverId)) throw new UserError(NO_MODERATORS);
    await refuseReportedBefore(
      ctx,
      serverId,
      { kind: 'message', channelId: target.channelId, messageId: target.id },
      reporterId,
    );
    const inPost = ctx.parties.byPost(target.channelId);
    const where = channelContext(interaction);
    // The member's older form, if any, expires.
    const older = tokens.get(interaction.user.id);
    if (older !== undefined) pending.take(older, interaction.user.id);
    // A forward has no text or files of its own: what it forwards is in its first snapshot.
    const forwarded =
      target.content === '' && target.attachments.size === 0
        ? target.messageSnapshots.first()
        : undefined;
    const shown = forwarded ?? target;
    const token = pending.put(interaction.user.id, {
      serverId: guildIdOf(interaction),
      message: {
        channelId: target.channelId,
        messageId: target.id,
        authorId: target.author.id,
        authorName:
          target.member?.displayName ?? target.author.globalName ?? target.author.username,
        sentAt: target.createdTimestamp,
        text: shown.content ?? '',
        attachments: [...(shown.attachments?.values() ?? [])].map((attachment) => attachment.name),
        ...(forwarded === undefined ? {} : { forwarded: true }),
      },
      partyTitle: inPost ? ctx.partyService.postTitle(inPost) : null,
      nearChannelId: regionChannelOf(interaction, ctx) ?? where.baseChannelId ?? target.channelId,
    });
    tokens.set(interaction.user.id, token);
    await interaction.showModal(messageReportForm(token));
  },
};

/** The form of a message's report: the message kept under its token goes to the moderators. */
export async function submitMessageReport(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  token: string,
): Promise<void> {
  const reason = interaction.fields.getTextInputValue(REPORT_REASON_INPUT);
  const taken = pending.take(token, interaction.user.id);
  if (taken === 'expired' || taken === 'not-yours') throw new UserError(EXPIRED);
  // A custom id can be sent from anywhere: a message of another server is none here.
  if (taken.value.serverId !== guildIdOf(interaction)) throw new UserError(EXPIRED);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const outcome = await ctx.reports.reportMessage({
    ...taken.value,
    reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
    reason,
  });
  await interaction.editReply({ content: reportAnswer(outcome, 'message') });
}
