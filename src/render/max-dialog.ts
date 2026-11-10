import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { dialog } from '../discord/dialog.js';
import { clockText, count } from './text.js';

/*
 * The ending-soon question of `/max` (plan 8X-3; Matt, 2026-10-21): a max battle whose end is less
 * than `ENDING_SOON_MINUTES` away is asked about before it is made, in a dialog: until the next
 * rotation (one rotation later, first and picked: Android picks the first by itself) or until the
 * end about to pass; where no later rotation is left (the last battle time), only whether to
 * report it. Discord's Submit reports, its Cancel makes nothing.
 */

/** The custom-id kind of `/max`'s controls (its dialog's Submit). */
export const MAX_KIND = 'max';
/** The radio group of the ending-soon dialog, and its values. */
export const MAX_END_INPUT = 'end';
export const NEXT_ROTATION = 'next';
export const ENDING_SOON = 'soon';

/** `in 1 minute`, `in 4 minutes`: how far off an end is, to the minute (at least one). */
function inMinutes(end: number, now: number): string {
  return `in ${count(Math.max(1, Math.round((end - now) / 60_000)), 'minute')}`;
}

/** A choice of the ending-soon question: its value, its words, and the end it reports. */
export interface EndingSoonChoice {
  value: typeof NEXT_ROTATION | typeof ENDING_SOON;
  label: string;
  end: number;
}

/**
 * The ending-soon question as words, for the dialog and the live map (plan 8X-5): the question,
 * and its choices: with `next`, until the next rotation ("Until the next rotation, 3:00 PM",
 * first) or until the end about to pass ("Until 2:30 PM (in 1 minute)"); without, only the end
 * about to pass, and the question whether to report it anyway.
 */
export function endingSoonQuestion(input: {
  end: number;
  next: number | undefined;
  now: number;
  zone: string;
}): { text: string; choices: EndingSoonChoice[] } {
  const { end, next, now, zone } = input;
  const at = clockText(end, zone);
  const question = `This max battle ends at ${at}, ${inMinutes(end, now)}.`;
  const soon: EndingSoonChoice = {
    value: ENDING_SOON,
    label: `Until ${at} (${inMinutes(end, now)})`,
    end,
  };
  if (next === undefined) return { text: `${question} Report it anyway?`, choices: [soon] };
  return {
    text: `${question} Report it until the next rotation?`,
    choices: [
      {
        value: NEXT_ROTATION,
        label: `Until the next rotation, ${clockText(next, zone)}`,
        end: next,
      },
      soon,
    ],
  };
}

/**
 * The dialog asked before a max battle that ends soon is reported (`customId` carries the
 * report): with `next`, a choice of that end ("Until the next rotation, 3:00 PM", first and
 * picked) or the one about to pass ("Until 2:30 PM (in 1 minute)"); without, the plain question.
 */
export function endingSoonDialog(input: {
  customId: string;
  end: number;
  next: number | undefined;
  now: number;
  zone: string;
}): APIModalInteractionResponseCallbackData {
  const { customId, next } = input;
  const asked = endingSoonQuestion(input);
  if (next === undefined) {
    return dialog({
      customId,
      title: 'Report a max battle',
      text: `${asked.text}\n\nSubmit reports it.`,
    });
  }
  return dialog({
    customId,
    title: 'Report a max battle',
    text: asked.text,
    choice: {
      id: MAX_END_INPUT,
      label: 'Until when?',
      picked: NEXT_ROTATION,
      options: asked.choices.map(({ value, label }) => ({ value, label })),
    },
  });
}
