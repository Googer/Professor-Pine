/**
 * The one place Pine makes and reads zoned times (plan 8Y: Temporal in place of Luxon). Times
 * are epoch milliseconds in data; while computing they are `Temporal.ZonedDateTime` in
 * `settings.timezone` (or a feed's fixed zone), made here and changed with Temporal's own
 * methods (`add`, `with`, `startOfDay`, `since`). Never `Temporal.Now`: the clock is `Date.now()`
 * or an injected `now`, so tests that fake `Date` keep working. A zone never comes from member
 * text: Temporal throws on a zone it does not know.
 */

/** The farthest moment from 1970 Temporal holds, either way (a hundred million days). */
const MOMENT_LIMIT_MS = 8.64e15;

/**
 * Whether `ms` is a moment `zoned` takes: a finite number of milliseconds within Temporal's range
 * (a fraction is floored). A number from a feed is checked with it first.
 */
export function isMoment(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MOMENT_LIMIT_MS;
}

/**
 * A moment seen in `zone`; `.epochMilliseconds` gives it back. A fraction of a millisecond is
 * floored, as Luxon tolerated one (a time stored before plan 8Y may hold one). Throws a
 * `RangeError` for what is no moment (`isMoment`: NaN, an infinity, beyond Temporal's range),
 * where Luxon gave an invalid `DateTime`: a feed's number is checked first.
 */
export function zoned(ms: number, zone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(Math.floor(ms)).toZonedDateTimeISO(zone);
}

/**
 * The start of the hour of `time` on the wall clock. In the hour the fall repeats, the hour
 * of the time itself (its offset is kept, as Luxon's `startOf('hour')`).
 */
export function startOfHour(time: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  return time.with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
}

/** The local midnight that began the month of `time`. */
export function startOfMonth(time: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  return time.with({ day: 1 }).startOfDay();
}

/**
 * The start of a local month (`month` 1–12 of `year`) in `zone`: its first day's start (the
 * first moment of it where midnight does not exist). Throws a `RangeError` for a month that is
 * none.
 */
export function monthStart(year: number, month: number, zone: string): Temporal.ZonedDateTime {
  return Temporal.PlainDate.from({ year, month, day: 1 }, { overflow: 'reject' })
    .toZonedDateTime(zone)
    .startOfDay();
}

/** Whether two zoned times fall on the same local date (Luxon's `hasSame(…, 'day')`). */
export function sameDay(a: Temporal.ZonedDateTime, b: Temporal.ZonedDateTime): boolean {
  return a.toPlainDate().equals(b.toPlainDate());
}

function mondayOf(time: Temporal.ZonedDateTime): Temporal.PlainDate {
  return time.toPlainDate().subtract({ days: time.dayOfWeek - 1 });
}

/** Whether two zoned times fall in the same ISO week, which starts on Monday (as Luxon's). */
export function sameWeek(a: Temporal.ZonedDateTime, b: Temporal.ZonedDateTime): boolean {
  return mondayOf(a).equals(mondayOf(b));
}

/** The local date of a moment in `zone`, `yyyy-mm-dd` (Luxon's `toISODate()`). */
export function isoDate(ms: number, zone: string): string {
  return zoned(ms, zone).toPlainDate().toString();
}

/** The fields of a wall-clock time; those left out are 0. */
export interface LocalFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  readonly millisecond?: number;
}

/**
 * `time` moved by whole calendar days (`-1` the day before, `7` a week on) at the same wall-clock
 * time, keeping its offset where that offset is valid on the new day: from the second 01:30 of
 * the night the clocks fall back, a day on and back again is that second 01:30, as Luxon's
 * `plus({ days })` kept it. Temporal's own `add({ days })` would take the earlier of the two.
 * Elsewhere as `add`: a time in the spring gap moves forward by the gap.
 */
export function addDays(time: Temporal.ZonedDateTime, days: number): Temporal.ZonedDateTime {
  const date = time.toPlainDate().add({ days });
  // `with` keeps the offset where it is valid (its option `offset: 'prefer'`).
  return time.with({ year: date.year, month: date.month, day: date.day });
}

/**
 * A wall-clock time in `zone`: a time in the spring gap moves forward by the gap (02:30 is
 * 03:30). A time in the fall overlap takes `offset` where that is one of its two (a member's
 * typed time: the offset of now, so that after the clocks fell back "1:30am" is the second 01:30,
 * as Luxon read it by the offset of the moment it ran), else the earlier of the two
 * (`disambiguation: 'compatible'`). Nothing for a date or time that does not exist (February 30,
 * hour 24), where Luxon gave an invalid `DateTime`.
 */
export function localTime(
  fields: LocalFields,
  zone: string,
  offset?: string,
): Temporal.ZonedDateTime | undefined {
  try {
    return Temporal.ZonedDateTime.from(
      { ...fields, timeZone: zone, ...(offset === undefined ? {} : { offset }) },
      { offset: 'prefer', disambiguation: 'compatible', overflow: 'reject' },
    );
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/**
 * The shapes the feeds write (ScrapedDuck, Leek Duck), in ISO's extended format as Luxon's
 * `fromISO` read it: a date, then a time to the hour, minute, second or fraction of one (`T` or
 * `t`), then an offset or `Z` (or `z`). Temporal reads more that Luxon refused (a space for the
 * `T`, annotations in brackets, a 60th second), and Luxon read shapes no feed writes (the basic
 * format, week and ordinal dates, a year and month alone); all of those are refused.
 */
const FEED_TIME =
  /^(\d{4}-\d{2}-\d{2})(?:[Tt](\d{2})(?::(\d{2})(?::([0-5]\d)(?:\.(\d{1,9}))?)?)?([Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * A feed's time as the feeds mean it: one with an offset or `Z` is that moment, seen in `zone`;
 * one without is a wall-clock time in `zone`; a date alone is its midnight there; `24:00` is the
 * next day's midnight. Anything else, empty or malformed, is nothing, never a throw. A wall-clock
 * time in the fall overlap is the earlier of the two (`disambiguation: 'compatible'`), whenever
 * Pine reads it: a feed's time is not decided by our clock. Luxon's `fromISO` took the offset
 * of the moment it ran there (the earlier in summer, the later after the clocks fell back).
 */
export function feedTime(text: string, zone: string): Temporal.ZonedDateTime | undefined {
  const shape = FEED_TIME.exec(text);
  if (!shape) return undefined;
  const [, date = '', hour, minute = '00', second = '00', fraction = '0', offset] = shape;
  try {
    // Temporal refuses hour 24; Luxon read 24:00 as the end of the day (and nothing after it).
    const endOfDay = hour === '24' && /^0+$/.test(minute + second + fraction);
    const day = endOfDay ? Temporal.PlainDate.from(date).add({ days: 1 }).toString() : date;
    const time =
      hour === undefined ? '' : `T${endOfDay ? '00' : hour}:${minute}:${second}.${fraction}`;
    const iso = `${day}${time}`;
    return offset === undefined
      ? Temporal.PlainDateTime.from(iso, { overflow: 'reject' }).toZonedDateTime(zone, {
          disambiguation: 'compatible',
        })
      : Temporal.Instant.from(`${iso}${offset.toUpperCase()}`).toZonedDateTimeISO(zone);
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The clock time as `h:mm a`: "3:05 PM", with a plain space. Built from the fields, not `Intl`,
 * whose newer ICU puts a narrow no-break space (U+202F) before AM and PM.
 */
export function clockWords(time: Temporal.ZonedDateTime): string {
  return `${String(time.hour % 12 || 12)}:${two(time.minute)} ${time.hour < 12 ? 'AM' : 'PM'}`;
}

/** The day as `cccc, LLLL d`: "Wednesday, October 28". */
export function dayWords(time: Temporal.ZonedDateTime): string {
  return `${WEEKDAYS[time.dayOfWeek - 1] ?? ''}, ${MONTHS[time.month - 1] ?? ''} ${String(time.day)}`;
}

/** The weekday as `ccc`: "Sat" (plan 8V-1, the events forum). */
export function shortDayWords(time: Temporal.ZonedDateTime): string {
  return (WEEKDAYS[time.dayOfWeek - 1] ?? '').slice(0, 3);
}

/** The date as `LLL d`: "Nov 21" (plan 8V-1). */
export function shortDateWords(time: Temporal.ZonedDateTime): string {
  return `${(MONTHS[time.month - 1] ?? '').slice(0, 3)} ${String(time.day)}`;
}

/**
 * The hour as the events forum says it (plan 8V-1): "2" on the hour, "5:30" otherwise, and its
 * half of the day apart, so that "2–5 PM" says it once.
 */
export function shortHourWords(time: Temporal.ZonedDateTime): { hour: string; half: 'AM' | 'PM' } {
  const hour = String(time.hour % 12 || 12);
  return {
    hour: time.minute === 0 ? hour : `${hour}:${two(time.minute)}`,
    half: time.hour < 12 ? 'AM' : 'PM',
  };
}

/** The minute as `yyyy-MM-dd HH:mm`: "2026-10-28 15:05". */
export function minuteStamp(time: Temporal.ZonedDateTime): string {
  return (
    `${String(time.year).padStart(4, '0')}-${two(time.month)}-${two(time.day)} ` +
    `${two(time.hour)}:${two(time.minute)}`
  );
}
