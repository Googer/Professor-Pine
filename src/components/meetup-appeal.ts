import {
  ComponentType,
  MessageFlags,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { refusedWithText } from '../commands/meetups/info.js';
import type { ComponentHandler, ControlThrottle, Guard } from '../discord/command.js';
import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
import { UserError } from '../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
import { memberInfo } from '../discord/member-info.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { MEMBER_READ_THROTTLE, type Throttle } from '../discord/throttle.js';
import { MAX_APPEAL, type MeetupAppeal } from '../domain/meetups/records.js';
import { APPEAL_KIND, APPEAL_WAIT_DAYS } from '../render/meetup-safety.js';
import { memberText, timestamp } from '../render/text.js';
import type { AppealDecision, AppealOutcome } from '../services/meetup-safety.js';
import { SAFETY_THROTTLE } from './meetup-safety.js';

/** The id of the one input of the form of an appeal. */
export const APPEAL_INPUT = 'text';

/** How often a member may send an appeal: a post in the moderators' channel each. */
export const APPEAL_THROTTLE: Throttle = { uses: 3, perSeconds: 3600 };

const NOT_BLOCKED = 'You are not blocked from creating meetups here.';
const ALREADY_OPEN =
  'Your appeal is with the moderators already. I will tell you by direct message what they decide.';
const SENT =
  'Your appeal is with the moderators. I will tell you by direct message what they decide.';
const NOT_SENT = 'I could not send your appeal to the moderators. Try again later.';

/** The form of an appeal (plan 8S-1): one paragraph, required. */
export function appealForm(serverId: string): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: APPEAL_KIND, id: serverId, action: 'form' }),
    title: 'Appeal your block',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: APPEAL_INPUT,
            label: 'Why should the block be lifted?',
            style: TextInputStyle.Paragraph,
            required: true,
            min_length: 5,
            max_length: MAX_APPEAL,
          },
        ],
      },
    ],
  };
}

/** What a member is told who may not appeal now, or of an appeal that was not sent. */
function appealWords(outcome: AppealOutcome): string {
  switch (outcome.kind) {
    case 'not-blocked':
      return NOT_BLOCKED;
    case 'open':
      return ALREADY_OPEN;
    case 'wait':
      return `You can appeal again ${timestamp(outcome.until, 'R')}.`;
    case 'not-sent':
      return NOT_SENT;
    case 'sent':
      return SENT;
  }
}

/** The member of an appeal, in a sentence. */
function memberOf(appeal: MeetupAppeal & { memberId: string }): string {
  return memberText({ id: appeal.memberId, name: appeal.memberName ?? undefined });
}

/** What a moderator who pressed Lift block or Keep block is told. */
function decisionWords(outcome: AppealDecision): string {
  switch (outcome.kind) {
    case 'gone':
      return STALE_COMPONENT;
    case 'decided-before': {
      const { appeal } = outcome;
      const who =
        appeal.decidedBy === null
          ? 'A moderator'
          : memberText({ id: appeal.decidedBy, name: appeal.decidedByName ?? undefined });
      const when = appeal.decidedAt === null ? '' : ` ${timestamp(appeal.decidedAt, 'R')}`;
      if (appeal.status === 'expired') return 'This appeal has expired: nobody decided in time.';
      return `${who} decided this already${when}: ${appeal.status === 'lifted' ? 'lifted' : 'kept'}.`;
    }
    case 'no-block':
      return `${memberOf(outcome.appeal)} is not blocked any more: the appeal is closed.`;
    case 'done':
      return outcome.appeal.status === 'lifted'
        ? `Lifted: ${memberOf(outcome.appeal)} can create meetups again. They are told.`
        : `Kept: ${memberOf(outcome.appeal)} stays blocked, and may appeal again in ` +
            `${APPEAL_WAIT_DAYS} days. They are told.`;
  }
}

/** Lift block and Keep block are for staff (admins, moderators, the owner), as for `/delete`. */
const requireStaffToDecide: Guard = (interaction, ctx) => {
  if (!interaction.isButton()) return;
  const id = decodeCustomId(interaction.customId);
  if (id?.action === 'lift' || id?.action === 'keep') return requireManagement(interaction, ctx);
};

/** The server of Appeal and its form must be the server it is pressed in. */
function ownServer(serverId: string, interaction: { guildId: string | null }): void {
  if (serverId !== guildIdOf(interaction)) throw new UserError(STALE_COMPONENT);
}

/**
 * Appeals of a meetup block (plan 8S-1; custom-id kind `mappeal`): Appeal under `/meetup`'s
 * refusal of a blocked member (`mappeal:<server>:open`) opens the form (`mappeal:<server>:form`)
 * unless the member may not appeal now; the form sends the appeal to the moderators
 * (`MeetupSafety.appeal`, three an hour; the presses of Appeal count lightly, as reading
 * does). Lift block and Keep block on the appeal's post (`mappeal:<appeal id>:lift|keep`) are
 * for staff, the first press winning; the member is told by DM, the server named.
 */
export const meetupAppealControls: ComponentHandler = {
  kind: APPEAL_KIND,
  guards: [requireGuild, requireStaffToDecide],
  throttle: (_interaction, id): ControlThrottle | undefined =>
    id.action === 'form'
      ? APPEAL_THROTTLE
      : id.action === 'lift' || id.action === 'keep'
        ? SAFETY_THROTTLE
        : MEMBER_READ_THROTTLE,
  // Appeal opens no form while the member's appeals of the hour are used up.
  checks: (_interaction, id) => (id.action === 'open' ? APPEAL_THROTTLE : undefined),

  async button(interaction, id, ctx) {
    if (id.action === 'open') {
      ownServer(id.id, interaction);
      const state = await ctx.meetupSafety.appealState(id.id, interaction.user.id);
      if (state.kind !== 'may') throw new UserError(appealWords(state));
      await interaction.showModal(appealForm(id.id));
      return;
    }
    if (id.action !== 'lift' && id.action !== 'keep') throw new UserError(STALE_COMPONENT);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await ctx.meetupSafety.decideAppeal(
      id.id,
      id.action,
      { id: interaction.user.id, name: memberInfo(interaction).name },
      guildIdOf(interaction),
      interaction.guild?.name,
    );
    await interaction.editReply({ content: decisionWords(outcome) });
  },

  async modal(interaction, id, ctx) {
    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
    ownServer(id.id, interaction);
    const text = interaction.fields.getTextInputValue(APPEAL_INPUT);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await ctx.meetupSafety.appeal({
      serverId: id.id,
      nearChannelId: interaction.channelId ?? '',
      member: { id: interaction.user.id, name: memberInfo(interaction).name },
      text,
    });
    if (outcome.kind !== 'sent') {
      // One that could not reach the moderators is none of the member's doing: its use goes back.
      throw new UserError(refusedWithText(appealWords(outcome), text), {
        givesBack: outcome.kind === 'not-sent',
      });
    }
    await interaction.editReply({ content: SENT });
  },
};
