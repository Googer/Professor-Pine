import {
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { channelContext } from '../../discord/channel-context.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, requireGuild, requireMeetup } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MAX_MEETUP_DESCRIPTION, type MeetupParty } from '../../domain/party/party.js';
import { LIMITS, truncate } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import { commandMeetup, partyOver } from '../parties/reply.js';
import { timedAnswer, type TimedAnswer, type TimedChanging } from '../parties/timed.js';
import { CHANGE_THROTTLE, changingMember } from '../raids/change.js';

/** The custom-id kind of the form `/info` opens. */
export const INFO_KIND = 'info';
/** The id of the one input of that form. */
export const INFO_INPUT = 'text';

/**
 * The form of `/info`: one paragraph, with what the post says now already in it, so that a
 * member corrects a word without typing the rest again. Sent back empty, it removes the text.
 */
export function infoForm(party: MeetupParty): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: INFO_KIND, id: party.id, action: 'set' }),
    title: 'About this meetup',
    components: [
      infoInput({
        required: false,
        placeholder: 'Where to meet, what to bring. Leave it empty to remove what is there.',
        value: party.meetup.description,
      }),
    ],
  };
}

/**
 * The one input of a meetup's information, as `/info` and `/meetup` ask for it: a paragraph of
 * at most `MAX_MEETUP_DESCRIPTION` characters (at least one where it is required), labelled
 * "Information", with `value` in it.
 */
export function infoInput(input: {
  required: boolean;
  placeholder: string;
  value?: string | null;
}): APIModalInteractionResponseCallbackData['components'][number] {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.TextInput,
        custom_id: INFO_INPUT,
        label: 'Information',
        style: TextInputStyle.Paragraph,
        required: input.required,
        ...(input.required ? { min_length: 1 } : {}),
        max_length: MAX_MEETUP_DESCRIPTION,
        placeholder: input.placeholder,
        ...(input.value === undefined || input.value === null ? {} : { value: input.value }),
      },
    ],
  };
}

/**
 * A refusal of the form, with what the member typed given back to them: a form that was
 * refused is gone, and a paragraph is not typed twice gladly. The text is in a code block, cut
 * to what one message holds; a run of backticks in it cannot end the block.
 */
export function refusedWithText(refusal: string, text: string): string {
  const typed = text.trim().replace(/`{3,}/g, (run) => run.split('').join('\u200b'));
  if (typed === '') return refusal;
  const frame = `${refusal}\nWhat you wrote:\n\`\`\`\n\n\`\`\``;
  return `${refusal}\nWhat you wrote:\n\`\`\`\n${truncate(typed, LIMITS.content - frame.length)}\n\`\`\``;
}

/**
 * `/info` (spec 4.2): what the post of a meetup says about it, under "Meeting Information". It
 * opens a form with the text as it is; anybody in the post may change it, and the post says who
 * did.
 * Of two members who have the form open at once the later one wins, with the text they started
 * from: nothing tells them that it changed meanwhile.
 */
export const info: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Write what there is to know about this meetup, in a form'),
  help: {
    category: 'meetup',
    details:
      'Use it in the post of the meetup. A form opens with the text as it is now: where to ' +
      'meet, what to bring, how long it goes.\n\nWhat you send is shown in the post under ' +
      '"Meeting Information"; sent back empty, it removes the text. The post says who changed it.',
    examples: ['/info'],
  },
  guards: [requireMeetup],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    await interaction.showModal(infoForm(commandMeetup(interaction, ctx)));
  },
};

/** What a member is told with their text when the form failed for a reason nobody foresaw. */
const FAILED = 'Something went wrong, and the post was not changed.';

/**
 * The form of `/info`. It has no limit of its own: a form that is held back is gone with the
 * paragraph typed into it, and every form was opened by a use of `/info`, which has the limit.
 */
export const infoControls: ComponentHandler = {
  kind: INFO_KIND,
  guards: [requireGuild],

  async modal(interaction, id, ctx) {
    if (id.action !== 'set') throw new UserError(STALE_COMPONENT);
    const text = interaction.fields.getTextInputValue(INFO_INPUT);
    try {
      await submitted(interaction, id.id, ctx, text);
    } catch (err) {
      // A refusal carries the text already. Anything else is the router's to log and report,
      // but the form is gone either way: the member gets the text back first, in the form's
      // one answer, and the router's report then follows it (it never answers a second time).
      const back = refusedWithText(FAILED, text);
      if (!(err instanceof UserError) && back !== FAILED) {
        const payload = { content: back, flags: MessageFlags.Ephemeral } as const;
        const answered = interaction.replied || interaction.deferred;
        await (answered ? interaction.followUp(payload) : interaction.reply(payload)).catch(
          (replyErr: unknown) => {
            ctx.log.warn({ err: replyErr }, 'could not give the text of a failed form back');
          },
        );
      }
      throw err;
    }
  },
};

/** What the form of `/info` does with the text that was sent. */
async function submitted(
  interaction: ModalSubmitInteraction,
  partyId: string,
  ctx: AppContext,
  text: string,
): Promise<void> {
  const refuse = (refusal: string): UserError => new UserError(refusedWithText(refusal, text));
  // The form opens only in the meetup's own post, and its answer belongs there: a custom id
  // can be sent from anywhere, for any party. A post without a party is the post of a meetup
  // that ended while the form was open: only a meetup has this form.
  const here = partyOf(interaction, ctx);
  if (!here) {
    // In a channel that is known to be no post, the form was never opened.
    const { isThread, baseChannelId } = channelContext(interaction);
    if (!isThread && baseChannelId !== undefined) throw new UserError(STALE_COMPONENT);
    throw refuse(partyOver({ type: 'meetup' }));
  }
  if (here.id !== partyId) throw new UserError(STALE_COMPONENT);
  const meetup = { id: partyId, type: 'meetup' } as const;
  const answer = await describeAs(ctx, meetup, changingMember(interaction), text);
  if (answer.kind !== 'ok') throw refuse(answer.text);
  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
}

/**
 * `/info` as the member: what the post of a meetup says about it (anybody in the post may; a
 * text of nothing but white space removes it), in its words. `drawn`: the information the change
 * was drawn from (the live map), refused when the meetup has other by now.
 */
export async function describeAs(
  ctx: TimedChanging,
  party: Pick<MeetupParty, 'id' | 'type'>,
  member: Member,
  text: string,
  drawn?: string | null,
): Promise<TimedAnswer> {
  const outcome = await ctx.timedParties.setDescription(party.id, member, text, drawn);
  return timedAnswer(ctx, party, outcome, (ok) =>
    !ok.changed
      ? 'Nothing changed: that is what the post says already.'
      : ok.party.meetup.description === null
        ? 'The post of this meetup has no information any more.'
        : 'The post of this meetup shows what you wrote, under "Meeting Information".',
  );
}
