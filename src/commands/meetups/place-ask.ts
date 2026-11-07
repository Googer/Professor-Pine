import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { SAFETY_THROTTLE } from '../../components/meetup-safety.js';
import { APPEAL_THROTTLE } from '../../components/meetup-appeal.js';
import type { ComponentHandler, ControlThrottle, Guard } from '../../discord/command.js';
import { decodeCustomId, encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import type { KnownPlace } from '../../domain/geo/place.js';
import { MAX_ASK } from '../../domain/meetups/records.js';
import { PLACE_ASK_WAIT_DAYS, rulingKeyOf, type RulingKey } from '../../domain/meetups/safety.js';
import type { PlaceKind } from '../../domain/search/place-merge.js';
import { blockedAnswer, REFUSED_ACCENT } from '../../render/meetup-safety.js';
import { ASK_KIND } from '../../render/place-asks.js';
import { memberText, timestamp } from '../../render/text.js';
import { actionRow, textMessage } from '../../render/v2.js';
import type { AskDecision, AskOutcome } from '../../services/meetup-safety.js';
import { refusedWithText } from './info.js';
import { NO_MEETUPS_FOR_YOU } from './meetup.js';

/** The id of the one input of the form of an ask. */
export const ASK_INPUT = 'text';

/** What a member is told whose ask reached the moderators. */
export const ASK_SENT =
  'Your question is with the moderators. I will tell you by direct message what they decide.';

const ALREADY_OPEN = 'It is with the moderators already.';
const NOT_SENT = 'I could not send your question to the moderators. Try again later.';
const NOT_REFUSED = 'Meetups can be held there now: use `/meetup` again.';

const PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop', 'powerspot'];

/**
 * The place a control of an ask names (`mplace:<kind>:open|form:<place id>`): nothing is kept
 * for it, so that Ask the moderators works after a restart; undefined for anything else.
 */
function placeOf(id: CustomId): RulingKey | undefined {
  const kind = PLACE_KINDS.find((one) => one === id.id);
  const [placeId] = id.args;
  return kind === undefined || placeId === undefined ? undefined : { kind, id: placeId };
}

/**
 * The refusal of a place refused for good (`text`: `/meetup`'s `NO_MEETUP_HERE`; plan 8S-2), as
 * a `UserError` the router shows privately: with Ask the moderators once the refusal is
 * `PLACE_ASK_WAIT_DAYS` old (`MeetupSafety.askState`), saying it is with the moderators while an
 * ask of the place is open, plain otherwise (a ruling that cannot be read too).
 */
export async function placeRefusal(
  ctx: Pick<AppContext, 'meetupSafety'>,
  serverId: string,
  place: KnownPlace,
  memberId: string,
  text: string,
): Promise<UserError> {
  const key = rulingKeyOf(place);
  const state =
    key === undefined
      ? undefined
      : await ctx.meetupSafety.askState(serverId, key, memberId).catch(() => undefined);
  if (state?.kind === 'open') return new UserError(`${text} ${ALREADY_OPEN}`);
  if (key === undefined || state?.kind !== 'may') return new UserError(text);
  return new UserError(text, {
    answer: textMessage(
      REFUSED_ACCENT,
      [text],
      [
        actionRow([
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: 'Ask the moderators…',
            custom_id: encodeCustomId({
              kind: ASK_KIND,
              id: key.kind,
              action: 'open',
              args: [key.id],
            }),
          },
        ]),
      ],
    ),
  });
}

/** The form of an ask (plan 8S-2): one paragraph, required. */
export function askForm(key: RulingKey): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: ASK_KIND, id: key.kind, action: 'form', args: [key.id] }),
    title: 'Ask about this place',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: ASK_INPUT,
            label: 'Why should meetups be allowed here?',
            style: TextInputStyle.Paragraph,
            required: true,
            min_length: 5,
            max_length: MAX_ASK,
          },
        ],
      },
    ],
  };
}

/** What a member is told who may not ask now, or of an ask that was not sent. */
function askWords(outcome: AskOutcome): string {
  switch (outcome.kind) {
    case 'sent':
      return ASK_SENT;
    case 'open':
      return ALREADY_OPEN;
    case 'wait':
      return `You can ask about this place ${timestamp(outcome.until, 'R')}.`;
    case 'not-refused':
      return NOT_REFUSED;
    case 'not-sent':
      return NOT_SENT;
    case 'blocked':
      return NO_MEETUPS_FOR_YOU;
  }
}

/** What a moderator who pressed Allow place or Keep refused is told. */
function decisionWords(outcome: AskDecision): string {
  switch (outcome.kind) {
    case 'gone':
      return STALE_COMPONENT;
    case 'decided-before': {
      const { ask } = outcome;
      if (ask.status === 'expired') return 'This request has expired: nobody decided in time.';
      const who =
        ask.decidedBy === null
          ? 'A moderator'
          : memberText({ id: ask.decidedBy, name: ask.decidedByName ?? undefined });
      const when = ask.decidedAt === null ? '' : ` ${timestamp(ask.decidedAt, 'R')}`;
      return `${who} decided this already${when}: ${ask.status === 'allowed' ? 'allowed' : 'kept refused'}.`;
    }
    case 'done':
      return outcome.ask.status === 'allowed'
        ? 'Allowed: meetups can be held there from now on. The member is told.'
        : `Kept refused: members can ask again in ${String(PLACE_ASK_WAIT_DAYS)} days. The ` +
            'member is told.';
    case 'not-refused':
      return (
        'No refusal of this place stands anymore (it was undone or allowed meanwhile): there is ' +
        'nothing to keep. The request stays open.'
      );
  }
}

/** Allow place and Keep refused are for staff (admins, moderators, the owner). */
const requireStaffToDecide: Guard = (interaction, ctx) => {
  if (!interaction.isButton()) return;
  const id = decodeCustomId(interaction.customId);
  if (id?.action === 'allow' || id?.action === 'keep') return requireManagement(interaction, ctx);
};

/**
 * Asks about a refused place (plan 8S-2; custom-id kind `mplace`): Ask the moderators under
 * `/meetup`'s refusal (`mplace:<kind>:open:<place id>`, the server the presser's, nothing kept, so
 * that it works after a restart) opens the form (`mplace:<kind>:form:<place id>`) unless the
 * member may not ask now (a block since: the block's refusal with Appeal); the form sends the ask
 * (`MeetupSafety.askAboutPlace`, the appeal's throttle; the presses of Ask count as reading).
 * Allow place and Keep refused on its post (`mplace:<ask id>:allow|keep`) are for staff, the
 * first press winning; the member is told by DM, the server named.
 */
export const placeAskControls: ComponentHandler = {
  kind: ASK_KIND,
  guards: [requireGuild, requireStaffToDecide],
  throttle: (_interaction, id): ControlThrottle | undefined =>
    id.action === 'form'
      ? APPEAL_THROTTLE
      : id.action === 'allow' || id.action === 'keep'
        ? SAFETY_THROTTLE
        : MEMBER_READ_THROTTLE,
  // Ask the moderators opens no form while the member's asks of the hour are used up.
  checks: (_interaction, id) => (id.action === 'open' ? APPEAL_THROTTLE : undefined),

  async button(interaction, id, ctx) {
    if (id.action === 'open') {
      const key = placeOf(id);
      if (key === undefined) throw new UserError(STALE_COMPONENT);
      const serverId = guildIdOf(interaction);
      const state = await ctx.meetupSafety.askState(serverId, key, interaction.user.id);
      if (state.kind === 'blocked') {
        throw new UserError(NO_MEETUPS_FOR_YOU, {
          answer: blockedAnswer(NO_MEETUPS_FOR_YOU, serverId),
        });
      }
      if (state.kind !== 'may') throw new UserError(askWords(state));
      await interaction.showModal(askForm(key));
      return;
    }
    if (id.action !== 'allow' && id.action !== 'keep') throw new UserError(STALE_COMPONENT);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await ctx.meetupSafety.decideAsk(
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
    const text = interaction.fields.getTextInputValue(ASK_INPUT);
    const key = placeOf(id);
    if (key === undefined) throw new UserError(refusedWithText(STALE_COMPONENT, text));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await ctx.meetupSafety.askAboutPlace({
      serverId: guildIdOf(interaction),
      nearChannelId: interaction.channelId ?? '',
      member: { id: interaction.user.id, name: memberInfo(interaction).name },
      key,
      text,
    });
    if (outcome.kind !== 'sent') {
      // One that could not reach the moderators is none of the member's doing: its use goes back.
      throw new UserError(refusedWithText(askWords(outcome), text), {
        givesBack: outcome.kind === 'not-sent',
      });
    }
    await interaction.editReply({ content: ASK_SENT });
  },
};
