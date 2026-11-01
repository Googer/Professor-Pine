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
}

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

/** Reads text such as "3:30pm", "1530", "3 pm" or "10-14 6pm". Undefined when it is not a time. */
export function parseClockInput(text: string): ClockInput | undefined {
  const groups = CLOCK.exec(text.trim())?.groups;
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
    const month = Number(groups['month']);
    const day = Number(groups['day']);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    clock.month = month;
    clock.day = day;
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
