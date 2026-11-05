import {
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
  type InteractionReplyOptions,
  type MessageComponentInteraction,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { MessageFile, V2Message } from './party-gateway.js';

/**
 * Late deferral (Matt, 2026-10-13). A request to Discord takes a quarter of a second from where
 * the bot runs, so a command that is acknowledged first and answered afterwards makes its
 * member wait for two of them, though its work takes a few milliseconds. A command with
 * `defer: 'late'` starts its work at once and is acknowledged (for the member alone) only when
 * it has not answered `LATE_DEFER_MS` after the interaction was made; it answers with
 * `answer`, which sends the first answer directly when nothing was acknowledged, and edits the
 * acknowledgement otherwise.
 */
export const LATE_DEFER_MS = 1_000;

/**
 * What `answer` sends: what a first answer and an edited acknowledgement both take. A
 * components-v2 answer (`v2Answer`) carries its flag; the answer is for the member alone either
 * way.
 */
export type AnswerPayload = Pick<
  InteractionReplyOptions,
  'content' | 'embeds' | 'components' | 'files' | 'allowedMentions'
> & { flags?: MessageFlags.IsComponentsV2 };

/** A components-v2 message as an answer (`answer`) or an `update`: its components and its flag. */
export function v2Answer(message: V2Message): {
  components: V2Message['components'];
  flags: MessageFlags.IsComponentsV2;
  files?: MessageFile[];
} {
  return {
    components: message.components,
    flags: MessageFlags.IsComponentsV2,
    ...(message.files === undefined ? {} : { files: [...message.files] }),
  };
}

type Answerable =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction;

interface Waiting {
  /** Stops the acknowledgement that has not begun. */
  cancel(): void;
  /** The acknowledgement, once it has begun; it never rejects (a failure is kept). */
  deferral?: Promise<void>;
  failure?: unknown;
  deferMs?: number;
}

const waiting = new WeakMap<object, Waiting>();

/** A late deferral that is under way: the router ends it when the command has run. */
export interface LateDeferral {
  /**
   * Stops the acknowledgement if it has not begun and waits for one that has: afterwards
   * `interaction.deferred` and `interaction.replied` say how it stands, and nothing of this
   * deferral is on its way. Never rejects: answers how long the acknowledgement took, if there
   * was one, or what it failed with.
   */
  settle(): Promise<{ deferMs?: number; failure?: unknown }>;
}

/**
 * Starts the wait: `afterMs` from now the interaction is acknowledged for the member alone,
 * unless `answer` came first. `setTimer` is for tests.
 */
export function deferLate(
  interaction: ChatInputCommandInteraction,
  afterMs: number,
  setTimer: (run: () => void, ms: number) => () => void = unrefTimer,
): LateDeferral {
  const state: Waiting = {
    cancel: setTimer(() => {
      if (interaction.deferred || interaction.replied) return;
      const before = performance.now();
      state.deferral = interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(
        () => {
          state.deferMs = Math.round(performance.now() - before);
        },
        (err: unknown) => {
          state.failure = err;
        },
      );
    }, afterMs),
  };
  waiting.set(interaction, state);
  return {
    async settle() {
      state.cancel();
      await state.deferral;
      waiting.delete(interaction);
      return {
        ...(state.deferMs === undefined ? {} : { deferMs: state.deferMs }),
        ...(state.failure === undefined ? {} : { failure: state.failure }),
      };
    },
  };
}

function unrefTimer(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => {
    clearTimeout(timer);
  };
}

/**
 * Answers the member alone: as the first answer when the interaction was not acknowledged (a
 * command with `defer: 'late'` whose work was quick), otherwise by editing what stands (the
 * acknowledgement, or an earlier answer). An acknowledgement that is on its way is waited for.
 * Use it in the place of `editReply` in everything a late command runs.
 */
export async function answer(interaction: Answerable, payload: AnswerPayload): Promise<void> {
  const state = waiting.get(interaction);
  state?.cancel();
  await state?.deferral;
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral | (payload.flags ?? 0) });
}

/** A press on a control of an answer, or a form one of them opened. */
export type Press = MessageComponentInteraction | ModalSubmitInteraction;

/**
 * How a press on the controls of an answer is answered (plan 8B-2): `update` changes the answer
 * itself, `copy` gives the presser a private copy with the change and leaves the answer as it
 * was. A public answer (`/counters` in a post, `/rank`) is changed for everybody only by the
 * member who asked for it, `message.interactionMetadata.user` (never the deprecated
 * `interaction`); a private answer only its member sees, so a press on it always changes it.
 * `onlyPrivate`: what the press shows is for the presser alone (a Pokébox), so a public answer
 * is never changed into it, not even by its asker.
 */
export type PressAnswer = 'update' | 'copy';

export function pressAnswer(press: Press, options: { onlyPrivate?: boolean } = {}): PressAnswer {
  const message: Message | null = press.message;
  if (!message) return 'copy';
  if (message.flags.has(MessageFlags.Ephemeral)) return 'update';
  if (options.onlyPrivate === true) return 'copy';
  return message.interactionMetadata?.user.id === press.user.id ? 'update' : 'copy';
}

/**
 * Acknowledges a press whose work takes time (Pokebattler), as it will be answered: `update`
 * with `deferUpdate` (the answer stays as it is until `answerPress` edits it), `copy` with a
 * private "thinking…".
 */
export async function deferPress(press: Press, how: PressAnswer): Promise<void> {
  // A form that came from no message has no message to update: it is answered as a copy.
  const updatable = press.isMessageComponent() || press.isFromMessage();
  if (how === 'update' && updatable) await press.deferUpdate();
  else await press.deferReply({ flags: MessageFlags.Ephemeral });
}

/**
 * A read raced against what is left of a budget of `budgetMs` since `since` (an interaction's
 * `createdTimestamp`): its value when it came back in time, undefined when it did not (it goes
 * on; the caller awaits it). A read that fails passes its error on. Shared by the press of an
 * answer (`readOrDeferPress`) and `/research report`'s read before its dialog (`readOrDefer`).
 */
export async function inTime<T>(
  work: Promise<T>,
  budgetMs: number,
  since: number,
): Promise<{ value: T } | undefined> {
  const left = Math.max(0, budgetMs - Math.max(0, Date.now() - since));
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), left);
  });
  try {
    return await Promise.race([work.then((value) => ({ value })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The read of a press on an answer's controls (plan 8H-5, P5): back within what is left of
 * `LATE_DEFER_MS` since the press, the press is answered at once; else it is acknowledged as it
 * will be answered (`deferPress`) and the read awaited.
 */
export async function readOrDeferPress<T>(
  press: Press,
  how: PressAnswer,
  work: Promise<T>,
): Promise<T> {
  const first = await inTime(work, LATE_DEFER_MS, press.createdTimestamp);
  if (first !== undefined) return first.value;
  await deferPress(press, how);
  return work;
}

/**
 * Shows `message` as the answer to a press, as `how` says: the answer itself changed, or a
 * private copy. After `deferPress` it edits what that acknowledged.
 */
export async function answerPress(
  press: Press,
  how: PressAnswer,
  message: V2Message,
): Promise<void> {
  const payload = v2Answer(message);
  if (press.deferred || press.replied) {
    await press.editReply(payload);
    return;
  }
  if (how === 'update') {
    if (press.isMessageComponent()) {
      await press.update(payload);
      return;
    }
    if (press.isFromMessage()) {
      await press.update(payload);
      return;
    }
  }
  await press.reply({ ...payload, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}

/**
 * Whether the message a control is on (or the message whose control opened a form) is
 * components v2. False for a form a command opened: it has no message.
 */
export function onV2Message(press: Press): boolean {
  return press.message?.flags.has(MessageFlags.IsComponentsV2) === true;
}

/**
 * Whether a press on a message was answered in a private message of its own (a reply, or
 * `deferReply`): an edit then goes to that answer. discord.js marks those by setting
 * `ephemeral`, and leaves it null for `update` and `deferUpdate`. A form a command opened has
 * no message, and its deferral is its only answer.
 */
export function answeredApart(press: Press): boolean {
  const fromMessage = press.isMessageComponent() || press.isFromMessage();
  return fromMessage && (press.deferred || press.replied) && press.ephemeral !== null;
}

/** What a message made before it was components v2 says once its answer follows below it. */
export const ANSWERED_BELOW = 'This message was replaced by the one below.';

/**
 * Shows `message` in the place of the message a control is on (the question it answers, the
 * view it changes): `update`, or an edit after `deferUpdate`. Its files replace the message's
 * (`attachments: []`), so that a map of the earlier message does not stay behind.
 *
 * A message made before it was components v2 (plan 8B-4) is not changed into one in place:
 * whether Discord takes a v2 interaction update of a classic message is not known and is not
 * tried (8B-3's ruling). It is closed with `oldLine`, plain, without controls, and `message`
 * follows privately below it. A form a command opened has no message: it is answered with a
 * private reply, or an edit of its deferral.
 */
export async function showInPlace(
  press: Press,
  message: V2Message,
  oldLine: string = ANSWERED_BELOW,
): Promise<void> {
  // After `deferReply` an edit goes to that private answer, not to the message the control is
  // on: an answer of its own is `answerApart`'s. discord.js marks a reply or `deferReply` by
  // setting `ephemeral`, and leaves it null for `update` and `deferUpdate`.
  if (answeredApart(press)) {
    throw new Error('showInPlace after a reply or deferReply: use answerApart');
  }
  const payload = { ...v2Answer(message), files: [...(message.files ?? [])], attachments: [] };
  const acknowledged = press.deferred || press.replied;
  if (!press.isMessageComponent() && !press.isFromMessage()) {
    if (acknowledged) await press.editReply(payload);
    else
      await press.reply({
        ...payload,
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    return;
  }
  const fresh = onV2Message(press)
    ? payload
    : { content: oldLine, embeds: [], components: [], attachments: [] };
  if (acknowledged) await press.editReply(fresh);
  else await press.update(fresh);
  if (onV2Message(press)) return;
  await press.followUp({
    ...v2Answer(message),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

/**
 * Answers with `message` in a private message of its own, never in the place of the message a
 * control is on: the reply, or the edit of what `deferReply` acknowledged (a command, Move… and
 * Delete… of the view of `/gym show`, a form a command opened).
 */
export async function answerApart(interaction: Answerable, message: V2Message): Promise<void> {
  if (interaction.deferred || interaction.replied) await interaction.editReply(v2Answer(message));
  else {
    await interaction.reply({
      ...v2Answer(message),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}

/**
 * Says `text` in the place of the message a control is on (an expired question, a cancelled
 * one, a refusal): as a components-v2 message of one container on a v2 message, as plain text,
 * without controls, on a classic one (a message stays what it is).
 */
export async function sayInPlace(press: Press, text: string, accent: number): Promise<void> {
  const said: V2Message = {
    v2: true,
    components: [
      {
        type: ComponentType.Container,
        accent_color: accent,
        components: [{ type: ComponentType.TextDisplay, content: text }],
      },
    ],
  };
  // A press answered in a message of its own says it there.
  if (answeredApart(press)) {
    await answerApart(press, said);
    return;
  }
  const fromMessage = press.isMessageComponent() || press.isFromMessage();
  if (!fromMessage || onV2Message(press)) {
    await showInPlace(press, said);
    return;
  }
  const plain = { content: text, embeds: [], components: [], attachments: [] };
  if (press.deferred || press.replied) await press.editReply(plain);
  else await press.update(plain);
}
