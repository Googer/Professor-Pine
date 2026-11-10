import {
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, managementRoleIds, requireGuild, requireParty } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { REPORT_COMMAND, REPORT_WINDOW } from './report-limit.js';
import { MAX_REPORT_REASON } from '../../domain/moderation/reports.js';
import { partyWord, type Party } from '../../domain/party/party.js';
import type { ReportOutcome } from '../../services/moderation-reports.js';
import { submitMessageReport } from './report-message.js';
import { commandParty, partyOver } from './reply.js';

export { REPORT_COMMAND, REPORT_THROTTLE } from './report-limit.js';

/**
 * The custom-id kind of a report's form (plan 8S-2): `report:<party id>:party` (`/report`, and
 * the Apps menu on a party's post, a copy or its link line), `report:<token>:message` (the Apps
 * menu on any other message, the message kept under the token).
 */
export const REPORT_FORM_KIND = 'report';

/** The id of the one input of a report's form: why (as the form of the old `/delete` had it). */
export const REPORT_REASON_INPUT = 'reason';

/** What a member is told whose report reached the moderators (the design's words). */
export const REPORT_SENT = 'Sent to the moderators.';
/** What a member is told who reported the same party or message before (the design's words). */
export const REPORT_ALREADY = 'You already reported this.';
/** Said of a message reported where the server has no moderators' channel (the design's words). */
export const NO_MODERATORS = "This server has no moderators' channel.";
const REPORT_NOT_SENT = 'I could not send your report to the moderators. Try again later.';
/** What a reason of white space alone is told (by the forms' guard, and on the map). */
export const NO_REASON = 'Say what is wrong, so that the moderators know what to look at.';

/**
 * The words of the form that asks why, for a party (`what`: `raid`, `train`, `meetup`, `max
 * battle`) or a message: the form's on Discord, and the map's (plan 8M-8B, `MapReport`).
 */
export function reportFormWords(what: string): {
  title: string;
  label: string;
  placeholder: string;
  maxLength: number;
} {
  return {
    // A title has at most 45 characters: "Report this meetup to the moderators" has 36.
    title: `Report this ${what} to the moderators`,
    label: 'What is wrong?',
    placeholder: 'Only the moderators read this.',
    maxLength: MAX_REPORT_REASON,
  };
}

/** The form that asks why, for a party (`what`: `raid`, `train`, `meetup`) or a message. */
function reasonForm(customId: string, what: string): APIModalInteractionResponseCallbackData {
  const words = reportFormWords(what);
  return {
    custom_id: customId,
    title: words.title,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: REPORT_REASON_INPUT,
            label: words.label,
            style: TextInputStyle.Paragraph,
            required: true,
            max_length: words.maxLength,
            placeholder: words.placeholder,
          },
        ],
      },
    ],
  };
}

/** The form of a report of a party. */
export function partyReportForm(
  party: Pick<Party, 'id' | 'type'>,
): APIModalInteractionResponseCallbackData {
  return reasonForm(
    encodeCustomId({ kind: REPORT_FORM_KIND, id: party.id, action: 'party' }),
    partyWord(party),
  );
}

/** The form of a report of a message, its message kept under `token`. */
export function messageReportForm(token: string): APIModalInteractionResponseCallbackData {
  return reasonForm(
    encodeCustomId({ kind: REPORT_FORM_KIND, id: token, action: 'message' }),
    'message',
  );
}

/**
 * The answer to a report, or the refusal it is (`UserError`). `word` names the party for an
 * answer of the old way, without a moderators' channel.
 */
export function reportAnswer(outcome: ReportOutcome, word: string): string {
  switch (outcome.kind) {
    case 'sent':
      return REPORT_SENT;
    case 'already':
      return REPORT_ALREADY;
    case 'asked':
      return 'I have put your report into the post, for the moderators.';
    case 'asked-before':
      return `You have already asked the moderators about this ${word}.`;
    case 'gone':
      throw new UserError(partyOver());
    case 'no-reason':
      throw new UserError(NO_REASON);
    case 'not-sent':
      // None of the member's doing: the use goes back (plan 8S-3).
      throw new UserError(REPORT_NOT_SENT, { givesBack: true });
    case 'no-channel':
      throw new UserError(NO_MODERATORS);
  }
}

/** A reason of white space alone is refused before the report counts against the limit. */
const requireReason: Guard = (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.fields.getTextInputValue(REPORT_REASON_INPUT).trim() === '') {
    throw new UserError(NO_REASON);
  }
};

/**
 * A report of a party from its form (`/report`, the Apps menu, and a form of the old `/delete`
 * opened before it was for staff only): the party by its id, in the presser's server only, the
 * reason to the moderators (`ModerationReports.reportParty`), the member told privately.
 */
export async function submitPartyReport(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = ctx.parties.get(partyId);
  const serverId = guildIdOf(interaction);
  if (!party) throw new UserError(partyOver());
  // A custom id can be sent from anywhere: a party of another server is none here.
  if ((await ctx.guilds.idFor(serverId)) !== party.guildId) throw new UserError(STALE_COMPONENT);
  const reason = interaction.fields.getTextInputValue(REPORT_REASON_INPUT);
  // Acknowledged first: the report is a message to Discord, which can take its time.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const outcome = await ctx.reports.reportParty({
    serverId,
    partyId,
    reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
    reason,
    roleIds: managementRoleIds(interaction),
  });
  await interaction.editReply({ content: reportAnswer(outcome, partyWord(party)) });
}

/**
 * `/report` (plan 8S-2): a member tells the moderators privately what is wrong with the raid,
 * train or meetup of the post it is used in. It opens a form for the reason; the report goes to
 * the moderators' channel, where reports of the same party gather on one post, and nothing is
 * said in the party's post (without that channel, the reason goes into the post and the staff
 * roles are pinged once, as a member's `/delete` did). Every member may use it, staff and the
 * party's maker too; it counts on the form's submit, five an hour (`REPORT_THROTTLE`).
 */
export const report: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName(REPORT_COMMAND)
    .setDescription(
      'Tell the moderators privately what is wrong with this raid, max battle, train or meetup',
    ),
  help: {
    category: 'raid-crud',
    alsoIn: ['train', 'meetup'],
    details:
      'Use it in the post of the raid, max battle, train or meetup. A form asks what is wrong (a meetup at ' +
      "somebody's home, a duplicate raid, something hurtful); only the moderators read it, and " +
      'they decide what to do.\n\nTo report one message, use **Report to moderators** in the Apps ' +
      'menu of the message.\n\nOnly moderators can close a post (`/delete`). A raid, max battle, train or ' +
      'meetup that nobody comes to needs no report: its post goes away by itself after it ends.',
    examples: ['/report'],
  },
  guards: [requireParty],
  // Before the form: nobody types a reason only to be told the hour's reports are used up.
  checks: REPORT_WINDOW,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    await refuseReportedBefore(ctx, { kind: 'party', partyId: party.id }, interaction.user.id);
    await interaction.showModal(partyReportForm(party));
  },
};

/**
 * Refuses, before its form opens, a report by a member whose reason is on the open report of the
 * party or message already (plan 8S-3: a quick read; when it fails, the form opens and its
 * submit says it).
 */
export async function refuseReportedBefore(
  ctx: Pick<AppContext, 'reports'>,
  subject: Parameters<AppContext['reports']['reportedBefore']>[0],
  reporterId: string,
): Promise<void> {
  if (await ctx.reports.reportedBefore(subject, reporterId)) throw new UserError(REPORT_ALREADY);
}

/**
 * The forms of reports (kind `report`): a party's (`report:<party id>:party`) and a message's
 * (`report:<token>:message`). Five an hour,
 * counted in `/report`'s window whichever way the form was opened (`as`); a reason of white
 * space alone is refused uncounted.
 */
export const reportControls: ComponentHandler = {
  kind: REPORT_FORM_KIND,
  guards: [requireGuild, requireReason],
  throttle: () => REPORT_WINDOW,
  async modal(interaction, id, ctx) {
    if (id.action === 'party') return submitPartyReport(interaction, ctx, id.id);
    if (id.action === 'message') return submitMessageReport(interaction, ctx, id.id);
    throw new UserError(STALE_COMPONENT);
  },
};
