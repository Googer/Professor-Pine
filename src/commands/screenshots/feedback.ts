import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextInputStyle,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInMessageActionRow,
  type APIModalInteractionResponseCallbackData,
  type ButtonInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import {
  MAX_CORRECTION,
  MAX_FEEDBACK_ELEMENTS,
  RAID_FEEDBACK_ELEMENTS,
  type Feedback,
  type FeedbackElement,
  type StoredDecision,
  type StoredMaxReport,
} from '../../domain/ocr/screenshot-record.js';
import {
  maxRefusalWords,
  maxScreenshotMessage,
  MAX_TIER_UNKNOWN,
  placeName,
  refusalWords,
  screenshotMessage,
  type BattleTimes,
} from '../../render/screenshot-reading.js';
import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
import { gymNamerOf } from './gym-question.js';
import { cancelShot, chooseShotGym, chooseShotSpot, confirmShot } from './mention.js';
import { SHOT_KIND } from './shot-kind.js';

/** The ids of the form's two inputs. */
const ELEMENTS_INPUT = 'elements';
const CORRECTION_INPUT = 'correction';

export const GONE = 'That screenshot is no longer kept.';

const ELEMENT_LABELS: Readonly<Record<FeedbackElement, string>> = {
  gym: 'Gym',
  time: 'Time',
  stage: 'Egg or hatched',
  tier: 'Tier',
  boss: 'Boss',
  spot: 'Power Spot',
};

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

function shotButton(
  id: string,
  action: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger,
  args: string[] = [],
) {
  return {
    type: ComponentType.Button as const,
    custom_id: encodeCustomId({ kind: SHOT_KIND, id, action, args }),
    label,
    style,
  };
}

/**
 * The argument that marks the feedback of a max battle's screenshot (`shot:<id>:wrong:max`,
 * `shot:<id>:form:max`; plan 8X-S, review R6): its form offers a max battle's elements. A button
 * without it (every one made before) is a raid's.
 */
const MAX_ARG = 'max';

/** "All right" and "Something is wrong" under what was read; `max` for a max battle's screenshot. */
export function feedbackButtons(screenshotId: string, max = false): APIButtonComponent[] {
  return [
    shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
    shotButton(
      screenshotId,
      'wrong',
      'Something is wrong…',
      ButtonStyle.Secondary,
      max ? [MAX_ARG] : [],
    ),
  ];
}

/** The same in a row of a plain-text message (the refusals of `/raid` and `/max`). */
export function feedbackRow(screenshotId: string, max = false): Row {
  return { type: ComponentType.ActionRow, components: feedbackButtons(screenshotId, max) };
}

/** The button of the reporter's private answer that shows the screenshot. */
export function showRow(screenshotId: string): Row {
  return {
    type: ComponentType.ActionRow,
    components: [shotButton(screenshotId, 'show', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary)],
  };
}

/** The elements a form offers: a max battle's screen's, or a raid's. */
const elementsOf = (max: boolean): readonly FeedbackElement[] =>
  max ? MAX_FEEDBACK_ELEMENTS : RAID_FEEDBACK_ELEMENTS;

/**
 * The form of "Something is wrong": which elements (a max battle's screen's with `max`: Power
 * Spot, time, tier, boss), and what they should be.
 */
export function feedbackForm(
  screenshotId: string,
  max = false,
): APIModalInteractionResponseCallbackData {
  const elements = elementsOf(max);
  return {
    custom_id: encodeCustomId({
      kind: SHOT_KIND,
      id: screenshotId,
      action: 'form',
      args: max ? [MAX_ARG] : [],
    }),
    title: 'What did I read wrong?',
    components: [
      {
        type: ComponentType.Label,
        label: 'Which parts are wrong?',
        component: {
          type: ComponentType.StringSelect,
          custom_id: ELEMENTS_INPUT,
          min_values: 1,
          max_values: elements.length,
          options: elements.map((element) => ({
            label: ELEMENT_LABELS[element],
            value: element,
          })),
        },
      },
      {
        type: ComponentType.Label,
        label: 'What should they be?',
        component: {
          type: ComponentType.TextInput,
          custom_id: CORRECTION_INPUT,
          style: TextInputStyle.Paragraph,
          required: false,
          max_length: MAX_CORRECTION,
          placeholder: 'For example: the gym is Old Stone Fountain, the boss is Yveltal',
        },
      },
    ],
  };
}

/** What Pine did, or would do, with a screenshot, in one sentence. */
export function decisionWords(decision: StoredDecision, passive = false): string {
  switch (decision.kind) {
    case 'report':
      return 'With a screenshot like this, I report the raid as above.';
    case 'ask':
      return 'With a screenshot like this, I ask which gym it is before I report the raid.';
    case 'refuse':
      return refusalWords(decision.reason, passive);
  }
}

/**
 * What Pine did, or would do, with a max battle's screenshot (plan 8X-S), in one sentence: its
 * refusal in the words a mention or `/max` would say (`report` for the Power Spot read).
 */
export function maxDecisionWords(
  decision: StoredDecision,
  report: StoredMaxReport,
  times: BattleTimes,
  passive = false,
): string {
  switch (decision.kind) {
    case 'report':
      return 'With a screenshot like this, I report the max battle as above.';
    case 'ask':
      // A spot not clear is asked first; asked with the spot clear, only the tier is missing.
      return decision.doubts.includes('spot-unclear')
        ? 'With a screenshot like this, I ask which Power Spot it is before I report the battle.'
        : MAX_TIER_UNKNOWN;
    case 'refuse':
      return maxRefusalWords(decision.reason, times, report.spot.read, passive);
  }
}

/**
 * Shows a member privately the kept screenshot itself (so they can read what Pine could not),
 * what was read and what Pine made of it, with "All right" and "Something is wrong". For the
 * post's "Screenshot feedback" button and the reporter's.
 */
export async function showScreenshot(
  interaction: ButtonInteraction,
  ctx: AppContext,
  screenshotId: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const kept = await ctx.screenshots.get(screenshotId);
  // A screenshot of another server is none here: a custom id can be sent from anywhere.
  if (!kept || kept === 'gone' || kept.record.guildId !== interaction.guildId) {
    // Plain: the deferral of a message that is still nothing becomes what it is answered with.
    await interaction.editReply({ content: GONE });
    return;
  }
  const { record } = kept;
  const shown = kept.path === undefined || record.file === null ? undefined : record.file;
  const shot = {
    question:
      record.file === null
        ? 'Is this what the picture shows?'
        : 'Is this what the screenshot shows?',
    picture: shown === undefined ? undefined : `attachment://${shown}`,
    // A pane of a split screenshot (plan 7P): its own reading, named by its place; the picture
    // is the whole screenshot.
    ...(record.pane ? { pane: { place: placeName(record.pane.side), of: 1 } } : {}),
  };
  // A max battle's screenshot shows its own reading, and its feedback is a max battle's.
  const message = record.max
    ? maxScreenshotMessage({
        ...shot,
        report: record.max,
        decision: maxDecisionWords(
          record.decision,
          record.max,
          ctx.config.settings.maxBattles,
          ctx.config.settings.ocr.passive && ctx.features.ocrPassive,
        ),
        buttons: feedbackButtons(screenshotId, true),
      })
    : screenshotMessage({
        ...shot,
        report: record.report,
        gymName: gymNamerOf(ctx),
        decision: decisionWords(
          record.decision,
          ctx.config.settings.ocr.passive && ctx.features.ocrPassive,
        ),
        buttons: feedbackButtons(screenshotId),
      });
  await interaction.editReply({
    ...v2Answer(message),
    files:
      shown === undefined || kept.path === undefined
        ? []
        : [{ attachment: kept.path, name: shown }],
  });
}

const THANKS = 'Thank you: this helps me read screenshots better.';

/**
 * Records a member's feedback on a kept screenshot of the interaction's own server; a screenshot
 * of another server is none here, as in `showScreenshot` (a custom id can be sent from anywhere).
 */
async function feedbackHere(
  ctx: AppContext,
  screenshotId: string,
  guildId: string | null,
  memberId: string,
  feedback: Feedback,
): Promise<string> {
  const kept = await ctx.screenshots.get(screenshotId);
  if (!kept || kept === 'gone' || kept.record.guildId !== guildId) return GONE;
  const done = await ctx.screenshots.feedback(screenshotId, memberId, feedback);
  return done === 'gone' ? GONE : THANKS;
}

/** The controls of a screenshot: its feedback, and showing it. */
export const screenshotControls: ComponentHandler = {
  kind: SHOT_KIND,
  guards: [requireGuild],
  throttle: MEMBER_WRITE_THROTTLE,

  async button(interaction, id, ctx) {
    switch (id.action) {
      case 'show':
        return showScreenshot(interaction, ctx, id.id);
      case 'right': {
        const content = await feedbackHere(ctx, id.id, interaction.guildId, interaction.user.id, {
          verdict: 'right',
        });
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }
      case 'wrong':
        await interaction.showModal(feedbackForm(id.id, id.args[0] === MAX_ARG));
        return;
      case 'cancel':
        return cancelShot(interaction, id.id);
      case 'yes':
        return confirmShot(interaction, id.id, ctx);
      default:
        throw new UserError(STALE_COMPONENT);
    }
  },

  /**
   * The menu of the question about a screenshot posted with a mention of the bot: its gym, or a
   * max battle's Power Spot (plan 8X-S).
   */
  async select(interaction, id, ctx) {
    if (!interaction.isStringSelectMenu()) throw new UserError(STALE_COMPONENT);
    if (id.action === 'gym') return chooseShotGym(interaction, id.id, ctx);
    if (id.action === 'spot') return chooseShotSpot(interaction, id.id, ctx);
    throw new UserError(STALE_COMPONENT);
  },

  async modal(interaction, id, ctx) {
    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
    const offered = elementsOf(id.args[0] === MAX_ARG) as readonly string[];
    const elements = interaction.fields
      .getStringSelectValues(ELEMENTS_INPUT)
      .filter((value): value is FeedbackElement => offered.includes(value));
    if (elements.length === 0) throw new UserError('Choose what was wrong.');
    const correction = interaction.fields
      .getTextInputValue(CORRECTION_INPUT)
      .trim()
      .slice(0, MAX_CORRECTION);
    const content = await feedbackHere(ctx, id.id, interaction.guildId, interaction.user.id, {
      verdict: 'wrong',
      elements,
      correction,
    });
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
