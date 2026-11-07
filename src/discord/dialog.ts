import {
  ComponentType,
  TextInputStyle,
  MessageFlags,
  type APIMessageComponentEmoji,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Logger } from '../log.js';
import { buttonEmojiOf } from '../render/party-controls.js';
import { plain, truncate } from '../render/text.js';
import { textDisplay } from '../render/v2.js';
import { UserError } from './errors.js';

/*
 * Dialogs as one-shot questions (plans 8T-H, 8Q; design `2026-10-18-one-shot-dialogs-design.md`):
 * a question asked once ("Remove all your wants?", "Close this raid?") is a Discord dialog, the
 * first answer of the command or press (nothing is deferred before `showModal`), with Discord's
 * own Submit and Cancel. What the question needs from the database is read within
 * `DIALOG_READ_MS` of the interaction (`readInTime`), since Discord takes no dialog after three
 * seconds; its Submit is deferred privately at once (`deferSubmit`) and decides everything
 * again.
 */

/** Discord's limits of a dialog: its title, and a text display. */
const TITLE_ROOM = 45;
export const TEXT_ROOM = 4_000;

/** How long what a dialog needs may take to read: Discord's three seconds, less a margin. */
export const DIALOG_READ_MS = 2_000;

/** What a member is told when what a dialog needs took longer than `DIALOG_READ_MS`. */
export const SLOW_READ = 'That took me too long to look up: try again in a moment.';

/** A choice of a dialog's radio group: a label, the value it submits, and what it does, if said. */
export interface DialogOption {
  value: string;
  label: string;
  description?: string;
  /**
   * A character shown before the label of a menu's option (a radio group shows none), or a
   * custom emoji as message text (`<:pinedmax:…>`, the application's).
   */
  emoji?: string;
}

/** A choice of a dialog: a required radio group, or a menu where it has more than ten. */
export interface DialogChoice {
  id: string;
  label: string;
  options: readonly DialogOption[];
  /**
   * The value of the choice picked to start with (plan 8X-1B: Discord's `default`), undefined
   * for none. It goes first in `options` too, where the order allows (Android picks the first of
   * a radio group by itself, whatever is marked; iPhone picks only what is marked). A value
   * that is none of the options picks nothing.
   */
  picked?: string;
  /**
   * A string select (a dropdown) in the place of the radio group, for a list of more than ten
   * (Discord's most in a radio group): up to 25 options, one to be chosen, read at Submit with
   * `fields.getStringSelectValues(id)`.
   */
  menu?: true;
}

/** A line of text a dialog asks for besides its choice, which may be left empty. */
export interface DialogField {
  id: string;
  label: string;
  maxLength: number;
  /** What the empty line shows of what it takes. */
  placeholder?: string;
  /** What the line holds to start with (Discord's `value`): the value stored, to change. */
  value?: string;
}

/** What a dialog asks: its custom id, title, text, and a choice between ways when it has one. */
export interface DialogContent {
  customId: string;
  /** The act (`Remove a region`), cut to Discord's 45 characters. */
  title: string;
  /**
   * The question, as Markdown (a dialog's text displays show it); none for a dialog that is its
   * choice alone (Discord adds a box of its own at the top of every dialog: keep it short).
   */
  text?: string;
  /**
   * A choice between ways (archive or delete a post): a required radio group with nothing
   * picked unless `picked` says, so that Submit never does the harsher one by default; `id` is
   * read at Submit with `fields.getRadioGroup(id, true)`.
   */
  choice?: DialogChoice;
  /**
   * Several choices, each under its label after `choice` (plan 8X-G: Manage…, the route as a
   * radio group and two menus): Discord takes five components in a dialog, the text included.
   */
  choices?: readonly DialogChoice[];
  /** A line of text under the choice, optional (`fields.getTextInputValue(id)`, '' when empty). */
  field?: DialogField;
}

/** An option as Discord takes it, the one picked to start with marked as its `default`. */
interface ShownOption {
  value: string;
  label: string;
  description?: string;
  emoji?: APIMessageComponentEmoji;
  default?: true;
}

/**
 * The options of a choice, the one picked to start with marked as Discord's `default`; a
 * menu's with their emoji.
 */
function choiceOptions(choice: DialogChoice): ShownOption[] {
  return choice.options.map(({ emoji, ...option }) => ({
    ...option,
    ...(choice.menu && emoji !== undefined
      ? { emoji: buttonEmojiOf(emoji) ?? { name: emoji } }
      : {}),
    ...(option.value === choice.picked ? { default: true as const } : {}),
  }));
}

/** A choice as a label holding its radio group or menu. */
function choiceComponent(choice: DialogChoice) {
  return {
    type: ComponentType.Label as const,
    label: choice.label,
    component: choice.menu
      ? {
          type: ComponentType.StringSelect as const,
          custom_id: choice.id,
          required: true,
          min_values: 1,
          max_values: 1,
          options: choiceOptions(choice),
        }
      : {
          type: ComponentType.RadioGroup as const,
          custom_id: choice.id,
          required: true,
          options: choiceOptions(choice),
        },
  };
}

/** The dialog, as `showModal` takes it. */
export function dialog(content: DialogContent): APIModalInteractionResponseCallbackData {
  const { choice, choices = [], field, text } = content;
  return {
    custom_id: content.customId,
    title: truncate(content.title, TITLE_ROOM),
    components: [
      ...(text === undefined ? [] : [textDisplay(truncate(text, TEXT_ROOM))]),
      ...[...(choice === undefined ? [] : [choice]), ...choices].map(choiceComponent),
      ...(field === undefined
        ? []
        : [
            {
              type: ComponentType.Label as const,
              label: field.label,
              component: {
                type: ComponentType.TextInput as const,
                custom_id: field.id,
                style: TextInputStyle.Short,
                required: false,
                max_length: field.maxLength,
                ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
                ...(field.value === undefined ? {} : { value: field.value }),
              },
            },
          ]),
    ],
  };
}

/**
 * A channel as a dialog names it: `#oakland` by its name, `a deleted channel` for one the bot
 * cannot find. A dialog does not mention channels (`<#id>`): whether Discord shows a mention
 * inside a dialog is not checked yet (design, "Channels in a dialog's text are named").
 */
export function channelInDialog(name: string | undefined): string {
  return name === undefined ? 'a deleted channel' : `#${plain(name)}`;
}

/** What begins a per-open token: no other argument of a dialog's custom id begins so. */
const OPEN_MARK = '~';

/**
 * The last argument of the custom id of a dialog that picks a value to start with (Meet…, the
 * which-group dialog, Group…; plan 8X-F), or of a radio dialog that starts with nothing picked
 * (the split's, `removalDialog`, `/region remove`; 2026-10-22): when it was opened, in base 36 behind `~`. Discord's
 * client keeps what was submitted in a dialog per custom id and shows it again in place of the
 * value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so
 * every opening gets a custom id of its own. Its Submit leaves it out (`withoutOpenToken`), so a
 * dialog opened before the token was added submits as before.
 */
export function openToken(now: number): string {
  return `${OPEN_MARK}${Math.max(0, Math.floor(now)).toString(36)}`;
}

/**
 * A dialog's custom id arguments without its per-open token (`openToken`): the last argument
 * where it begins with `~`; the others as they are (review r0, F-A5).
 */
export function withoutOpenToken(args: readonly string[]): string[] {
  return args.at(-1)?.startsWith(OPEN_MARK) === true ? args.slice(0, -1) : [...args];
}

/**
 * What a dialog needs, read within `DIALOG_READ_MS` of when the interaction was made (`since`,
 * its `createdTimestamp`: Discord counts its three seconds from then, not from when the read
 * began, as the router's late deferral does): past it the member is refused with `SLOW_READ` (a
 * `UserError` that gives the use back: none of their doing) and no dialog opens, since a
 * `showModal` after Discord's three seconds fails for good. A refusal of the read itself (a raid
 * at the gym), also one thrown at once, passes on as it is; a read that fails after it was given
 * up is logged. A read that comes back after the budget by the clock is refused as well, also
 * when the timer has not run yet.
 */
export function readInTime<T>(
  log: Logger,
  since: { createdTimestamp: number },
  work: () => Promise<T>,
): Promise<T> {
  const age = Math.max(0, Date.now() - since.createdTimestamp);
  return new Promise<T>((resolve, reject) => {
    let late = false;
    const timer = setTimeout(
      () => {
        late = true;
        reject(new UserError(SLOW_READ, { givesBack: true }));
      },
      Math.max(0, DIALOG_READ_MS - age),
    );
    let reading: Promise<T>;
    try {
      reading = work();
    } catch (err) {
      // Thrown before it was a promise: no timer may stay behind.
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    reading.then(
      (value) => {
        clearTimeout(timer);
        // Past the budget by the clock although the timer has not run yet (a busy event loop):
        // as late as if it had.
        if (Date.now() - since.createdTimestamp > DIALOG_READ_MS) {
          reject(new UserError(SLOW_READ, { givesBack: true }));
        } else resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        if (late) log.warn({ err }, 'a slow read failed');
        else reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Acknowledges a dialog's Submit privately, at once: what follows decides everything again and
 * may take longer than Discord waits (a post ended, a forum deleted). The answer is the edit of
 * this acknowledgement (`editReply`, `answerApart`), and the router's refusals follow it.
 */
export async function deferSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

/**
 * The choice a Submit picked in the radio group `id`, when it is one of `values`; undefined for
 * anything else: a Submit without that group (a dialog of an older shape, a forged one), which
 * discord.js would refuse with `ModalSubmitInteractionFieldNotFound` whatever `required` says, or
 * a value that is none of the choices.
 */
export function pickedOf<V extends string>(
  interaction: ModalSubmitInteraction,
  id: string,
  values: readonly V[],
): V | undefined {
  if (!interaction.fields.fields.has(id)) return undefined;
  const picked = interaction.fields.getRadioGroup(id);
  return values.find((value) => value === picked);
}

/**
 * The option a Submit chose in the menu `id` (a choice with `menu: true`), when it is one of
 * `values`; undefined for anything else, as `pickedOf` for a radio group.
 */
export function selectedOf<V extends string>(
  interaction: ModalSubmitInteraction,
  id: string,
  values: readonly V[],
): V | undefined {
  if (!interaction.fields.fields.has(id)) return undefined;
  const [chosen] = interaction.fields.getStringSelectValues(id);
  return values.find((value) => value === chosen);
}
