import { addDays, zoned } from './zoned.js';

/**
 * The date of an example, month-day (`10-25`), three days after `now` in `zone`: an example
 * that names a fixed date goes stale (plan 8X-G, M2), one that names today is no example of a
 * date.
 */
export function dateExample(now: number, zone: string): string {
  const day = addDays(zoned(now, zone), 3);
  return `${String(day.month)}-${String(day.day)}`;
}

/** A time of day as typed, optionally with a month and day. */
export interface ClockInput {
  /** 0–23, with am/pm already applied when it was given. */
  hour: number;
  minute: number;
  /** False when am/pm was omitted, so a morning hour may mean the afternoon. */
  hasMeridiem: boolean;
  month?: number;
  day?: number;
  /** Typed after "tomorrow": the day after today, never with a month and day. */
  tomorrow?: true;
}

/** "tomorrow", "tomorrow at", "tomorrow," before a time. */
const TOMORROW = /^tomorrow(?:\s*,\s*|\s+)(?:at\s+)?/i;

/** The times said in words: noon and midnight, as "12pm" and "12am" are read. */
const NAMED_TIMES: Readonly<Record<string, number>> = { noon: 12, midday: 12, midnight: 0 };

const CLOCK = new RegExp(
  '^' +
    '(?:(?<month>\\d{1,2})\\s*[-/.]\\s*(?<day>\\d{1,2})(?:\\s*,\\s*|\\s+)(?:at\\s+)?)?' + // optional "M-D ", "M-D, ", "M-D at "
    '(?:' +
    '(?<compact>\\d{3,4})' + // 330, 1530
    '|(?<hour>\\d{1,2})(?:\\s*[:.]\\s*(?<minute>\\d{1,2}))?' + // 3, 3:30, 3.30, 15:30
    ')' +
    '\\s*(?:(?<meridiem>[ap])\\.?m?)?\\.?' + // am, pm, a, p; an m needs its a or p
    '$',
  'i',
);

/**
 * Reads text such as "3:30pm", "1530", "3 pm", "10-14 6pm", "noon", "midnight" or "tomorrow
 * 6pm". Undefined when it is not a time. A dot between hours and minutes is a colon: "10.17"
 * is "10:17", morning or evening by the same rule.
 */
export function parseClockInput(text: string): ClockInput | undefined {
  const trimmed = text.trim();
  const tomorrow = TOMORROW.exec(trimmed);
  if (!tomorrow) return clockOf(trimmed);
  const clock = clockOf(trimmed.slice(tomorrow[0].length));
  // "Tomorrow" and a date say the day twice.
  if (!clock || clock.month !== undefined) return undefined;
  return { ...clock, tomorrow: true };
}

/** A month and day in front of what follows, as `CLOCK` has them. */
const DATED = /^(?<month>\d{1,2})\s*[-/.]\s*(?<day>\d{1,2})(?:\s*,\s*|\s+)(?:at\s+)?(?<rest>.+)$/i;

/** A time said in words (`NAMED_TIMES`), or undefined. */
function namedTime(text: string): ClockInput | undefined {
  const word = text.toLowerCase();
  if (!Object.hasOwn(NAMED_TIMES, word)) return undefined;
  return { hour: NAMED_TIMES[word] ?? 0, minute: 0, hasMeridiem: true };
}

/** A clock with its month and day, or undefined for a date that is none. */
function dated(clock: ClockInput, month: number, day: number): ClockInput | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { ...clock, month, day };
}

/** `parseClockInput` without "tomorrow". */
function clockOf(text: string): ClockInput | undefined {
  const named = namedTime(text);
  if (named) return named;
  // A date in front of a time in words: `11-9 midnight`, `11-9 at noon`.
  const date = DATED.exec(text)?.groups;
  const datedWord = date ? namedTime(date['rest'] ?? '') : undefined;
  if (date && datedWord) return dated(datedWord, Number(date['month']), Number(date['day']));
  const groups = CLOCK.exec(text)?.groups;
  if (!groups) return undefined;

  let hour: number;
  let minute: number;
  if (groups['compact'] !== undefined) {
    hour = Number(groups['compact'].slice(0, -2));
    minute = Number(groups['compact'].slice(-2));
  } else {
    hour = Number(groups['hour']);
    minute = groups['minute'] === undefined ? 0 : Number(groups['minute']);
  }
  if (minute > 59 || hour > 23) return undefined;

  const meridiem = groups['meridiem']?.toLowerCase();
  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;

  const clock: ClockInput = { hour, minute, hasMeridiem: meridiem !== undefined };
  if (groups['month'] !== undefined && groups['day'] !== undefined) {
    return dated(clock, Number(groups['month']), Number(groups['day']));
  }
  return clock;
}

/** [sign] [days.]hours:minutes[:seconds], the shape the legacy duration parser accepted. */
const SPAN = /^([-+])?(?:(\d*)[. ])?(\d+):(\d+)(?::(\d+)(?:\.\d*)?)?$/;

function signed(sign: string | undefined, value: number): number {
  return sign === '-' ? -value : value;
}

/** Minutes, with an optional sign and unit: "45", "-5", "30 minutes", "20m". */
const MINUTES = /^([-+])?(\d+)\s*(?:m|mins?|minutes?)?$/i;
/** Hours, which may be fractional, with a required unit: "2h", "1.5 hours". */
const HOURS = /^([-+])?(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)$/i;

/**
 * Reads a relative duration: minutes ("45", "30 minutes", "20m"), hours ("2 hours", "1.5h") or
 * hours:minutes ("1:30"). "0:00" is zero; any other span that works out to nothing is rejected,
 * as the legacy parser did. Text that merely starts with digits ("5 raids", "1e3") is not a duration.
 */
export function parseRelativeMinutes(text: string): number | undefined {
  const value = text.trim();
  if (!value.includes(':')) {
    const minutes = MINUTES.exec(value);
    if (minutes) return signed(minutes[1], Number(minutes[2]));
    const hours = HOURS.exec(value);
    return hours ? signed(hours[1], Number(hours[2]) * 60) : undefined;
  }
  if (value.split(':').every((part) => Number.parseInt(part, 10) === 0)) return 0;
  const match = SPAN.exec(value);
  if (!match) return undefined;
  const [, sign, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 1440 + Number(hours) * 60 + Number(minutes) + Number(seconds ?? 0) / 60;
  if (total === 0) return undefined;
  return signed(sign, total);
}
