import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { storedReport } from '../../domain/ocr/screenshot-record.js';
import {
  maxScreenshotMessage,
  placeName,
  reportBothWords,
  screenshotMessage,
  SHOT_COLOUR,
} from '../../render/screenshot-reading.js';
import { textMessage } from '../../render/v2.js';
import {
  unreadWords,
  type PanesOutcome,
  type ReadOutcome,
  type ScreenshotOutcome,
  type ScreenshotSource,
  type ScreenshotWhere,
} from '../../services/screenshot-service.js';
import { decisionWords, feedbackButtons, maxDecisionWords } from './feedback.js';
import { gymNamerOf } from './gym-question.js';

/**
 * A screenshot whose turn in the reader comes later than this after its interaction is given up
 * as busy: the reading and the answer must fit into the fifteen minutes Discord allows.
 */
const START_BY_MS = 13 * 60_000;

/** What `onQueued` says while a screenshot waits for the ones ahead of it. */
export function waitingWords(ahead: number): string {
  return ahead === 1
    ? 'One screenshot is being read before yours. Yours is next.'
    : `${ahead} screenshots are ahead of yours. I read them one at a time.`;
}

/**
 * How the line that says a screenshot waits is sent: as the answer will be, since an answer
 * that was plain text does not become a components-v2 message (`/raid` answers plain, `/read-
 * screenshot` v2).
 */
export type WaitAs = 'plain' | 'v2';

/**
 * `readAttached` for a command that reports one kind of screen (`screen`: `/raid` a raid's,
 * `/max` a max battle's), answering a screenshot that could not be read at all rather than
 * throwing. Of a split screenshot (plan 7P) the pane of that kind; a pane of the other kind beside
 * it is told to `beside` (the command names it with `sayBeside` once it has answered); two of
 * that kind are refused with a pointer to the mention (Matt's Q1). Without a pane of that kind,
 * the other kind's (which the command refuses).
 */
export async function readAttachedOutcome(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  source: ScreenshotSource,
  more: Pick<ScreenshotWhere, 'use'> &
    Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped'>> & {
      screen: 'raid' | 'max';
      beside?: (screen: 'raid' | 'max') => void;
    },
  waitAs: WaitAs = 'plain',
): Promise<ScreenshotOutcome> {
  const { beside: _beside, ...where } = more;
  const outcome = await readAttachedPanes(interaction, ctx, source, where, waitAs);
  if (outcome.kind !== 'panes') return outcome;
  const mine = outcome.panes.filter((pane) => pane.screen === more.screen);
  const other = outcome.panes.find((pane) => pane.screen !== more.screen);
  if (mine.length > 1) throw new UserError(severalWords(ctx, more.screen));
  const [one] = mine;
  if (!one) return other ?? { kind: 'two-screens' };
  if (other) more.beside?.(other.screen);
  return one;
}

/**
 * Names the pane of the other kind beside the one a command reported (`besideWords`), in a
 * private follow-up. Only once the command's deferred answer is edited: a first follow-up
 * would take that answer's place, and the answer's edit would overwrite it.
 */
export async function sayBeside(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  screen: 'raid' | 'max',
): Promise<void> {
  await interaction
    .followUp({ content: besideWords(ctx, screen), flags: MessageFlags.Ephemeral })
    .catch((err: unknown) => {
      ctx.log.warn({ err }, 'could not name the screen beside a screenshot');
    });
}

/** A command's refusal of two screens of its kind in one picture (plan 7P, Matt's Q1). */
export function severalWords(
  ctx: Pick<AppContext, 'config' | 'features'>,
  screen: 'raid' | 'max',
): string {
  const what = screen === 'raid' ? 'two raids' : 'two max battles';
  return `This screenshot shows ${what}: ${reportBothWords('it', passiveIn(ctx))}.`;
}

/** What a command says of the pane of the other kind beside the one it reported (plan 7P). */
export function besideWords(
  ctx: Pick<AppContext, 'config' | 'features'>,
  screen: 'raid' | 'max',
): string {
  const what = screen === 'raid' ? 'The raid' : 'The max battle';
  return `${what} beside it was not reported: ${reportBothWords('the screenshot', passiveIn(ctx))}.`;
}

/** Whether screenshots are read passively (`reportBothWords`' pointer). */
export function passiveIn(ctx: Pick<AppContext, 'config' | 'features'>): boolean {
  return ctx.config.settings.ocr.passive && ctx.features.ocrPassive;
}

/** A screenshot a command was given, read pane by pane (plan 7P): `readAttached`'s reading. */
export async function readAttachedPanes(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  source: ScreenshotSource,
  more: Pick<ScreenshotWhere, 'use'> &
    Partial<Pick<ScreenshotWhere, 'typed' | 'maxTyped' | 'screen'>>,
  waitAs: WaitAs = 'plain',
): Promise<PanesOutcome> {
  const guildId = guildIdOf(interaction);
  const guildRow = await ctx.guilds.idFor(guildId);
  if (guildRow === undefined) throw new UserError('This server is not set up for raids yet.');
  // The line that says it waits is sent before the answer, never after it.
  let waiting: Promise<unknown> = Promise.resolve();
  const outcome = await ctx.screenshots.readPanes(source, {
    guildId,
    guildRow,
    channelId: regionChannelOf(interaction, ctx) ?? null,
    uploadedAt: interaction.createdTimestamp,
    senderId: interaction.user.id,
    // Read later than this, the interaction could no longer be answered (fifteen minutes).
    startBy: interaction.createdTimestamp + START_BY_MS,
    onQueued: (ahead) => {
      const words = waitingWords(ahead);
      const line =
        waitAs === 'v2' ? v2Answer(textMessage(SHOT_COLOUR, [words])) : { content: words };
      waiting = interaction.editReply(line).catch((err: unknown) => {
        ctx.log.warn({ err }, 'could not say that a screenshot waits');
      });
    },
    ...more,
  });
  await waiting;
  return outcome;
}

export const readScreenshot: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('read-screenshot')
    .setDescription(
      'Show what I read on a raid or max battle screenshot, without reporting anything',
    )
    .addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription('A screenshot of a raid, an egg or a max battle, as the game shows it')
        .setRequired(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'Reads the screenshot and tells you, privately, what I read on it and what I make of it: ' +
      'the gym, the time, egg or hatched, the tier and the boss, each as read and as ' +
      'understood; of a max battle the Power Spot, the time, the tier and the boss. Nothing is ' +
      'reported.\n\nTell me with the buttons whether I read it right: ' +
      'screenshots with your answer are kept for a while to improve the reader.\n\nOutside a ' +
      'region channel the gym is looked for among all of this server’s gyms.',
    examples: ['/read-screenshot screenshot:(a raid screenshot)'],
  },
  enabled: (config) => config.settings.ocr.enabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: { uses: 10, perSeconds: 600 },

  async execute(interaction, ctx) {
    const attachment = interaction.options.getAttachment('screenshot', true);
    const outcome = await readAttachedPanes(
      interaction,
      ctx,
      attachment,
      { use: 'read-screenshot' },
      'v2',
    );
    if (outcome.kind !== 'panes') {
      // The line that said it waits stands as the answer: it becomes the refusal, in kind (a
      // v2 message does not become plain text again). Without it the refusal goes as usual.
      if (!interaction.replied) throw new UserError(unreadWords(outcome));
      await interaction.editReply(v2Answer(textMessage(SHOT_COLOUR, [unreadWords(outcome)])));
      return;
    }
    // The member's own upload, beside what was read of it. A split screenshot (plan 7P) shows
    // each pane's reading in a container of its own, named by its place, the thumbnail the
    // whole picture, each in its share of the message's room.
    const picture = attachment.url.startsWith('https://') ? attachment.url : undefined;
    const messages = outcome.panes.map((pane) =>
      paneMessage(ctx, pane, picture, outcome.panes.length),
    );
    await interaction.editReply(
      v2Answer({ v2: true, components: messages.flatMap((message) => message.components) }),
    );
  },
};

/** The answer of `/read-screenshot` for one screen (of `of` in the picture). */
function paneMessage(
  ctx: AppContext,
  outcome: ReadOutcome,
  picture: string | undefined,
  of: number,
): V2Message {
  const question = outcome.id === undefined ? undefined : 'Did I read it right?';
  const pane = outcome.pane ? { place: placeName(outcome.pane.side), of } : undefined;
  if (outcome.screen === 'max') {
    // A max battle's screenshot (plan 8X-S): its own reading, what a mention or `/max` would do
    // with it (nobody is told of a Power Spot only shown), and a max battle's feedback.
    const { decision } = outcome;
    const stored =
      decision.kind === 'report'
        ? { kind: 'report' as const }
        : decision.kind === 'ask'
          ? { kind: 'ask' as const, doubts: decision.doubts }
          : { kind: 'refuse' as const, reason: decision.reason };
    return maxScreenshotMessage({
      report: outcome.report,
      decision: maxDecisionWords(
        stored,
        outcome.report,
        ctx.config.settings.maxBattles,
        passiveIn(ctx),
      ),
      question,
      picture,
      buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id, true),
      ...(pane ? { pane } : {}),
    });
  }
  const decision =
    outcome.decision.kind === 'report'
      ? { kind: 'report' as const }
      : outcome.decision.kind === 'ask'
        ? { kind: 'ask' as const, doubts: outcome.decision.doubts }
        : outcome.decision;
  return screenshotMessage({
    report: storedReport(outcome.report),
    gymName: gymNamerOf(ctx),
    decision: decisionWords(decision, passiveIn(ctx)),
    question,
    picture,
    buttons: outcome.id === undefined ? [] : feedbackButtons(outcome.id),
    ...(pane ? { pane } : {}),
  });
}
