/**
 * One wording of times on the live map (plan 8M-11A, S6, S19, S28), two kinds of them. Import-free,
 * so that the web page bundles it; the web's words only: Discord's own sentences are its own.
 *
 * - `relativeStamp`: a stamp of Discord's (`<t:…:R>`) nearly as Discord's client words it, where a
 *   post drawn on the map shows one, or the bot's words on the map name one: Discord's thresholds
 *   (a minute from 45 seconds, a day from 22 hours) but for hours, which begin at 90 minutes where
 *   Discord says "in an hour" from 45 (Matt, 2026-10-31), in the reader's language
 *   (`Intl.RelativeTimeFormat`), "in a day" rather than "in 24 hours".
 * - `durationWords`: a time left Pine composes (a marker's badge, the list, the stop popups, a
 *   countdown): exact hours and minutes, "17 min", "1 h 05 min", the minutes rounded to the nearest
 *   as Discord rounds them, so that the list's "29 min left" and the post's "in 29 minutes" agree.
 *   Minutes are never "m", which is meters (`distanceWords`).
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Below this a span is said in minutes. */
const MINUTES_BEFORE_HOURS = 90;

/**
 * Discord's steps (moment.js's): the unit of a span and how many of it. Each count is the span
 * rounded in that unit, and the unit is chosen by those rounded counts, as moment.js chooses it
 * (review fix F3): 44.6 seconds rounds to 45 and is "a minute"; 90 minutes rounds to 2 hours, so
 * no span is "an hour".
 */
function step(ms: number): [Intl.RelativeTimeFormatUnit, number] {
  const span = Math.abs(ms);
  const seconds = Math.round(span / SECOND);
  const minutes = Math.round(span / MINUTE);
  const hours = Math.round(span / HOUR);
  const days = Math.round(span / DAY);
  if (seconds < 45) return ['second', seconds];
  if (minutes < MINUTES_BEFORE_HOURS) return ['minute', Math.max(1, minutes)];
  if (hours < 22) return ['hour', hours];
  if (days < 26) return ['day', Math.max(1, days)];
  const months = Math.max(1, Math.round(span / (30.4 * DAY)));
  if (months < 11) return ['month', months];
  return ['year', Math.max(1, Math.round(span / (365 * DAY)))];
}

/**
 * How long until `at`, or since, as Discord's client says a relative stamp but for minutes up to 90 (`<t:…:R>`) to a reader
 * of `locale` (the browser's own when left out): `in a day`, `in 29 minutes`, `2 hours ago`, `in a
 * few seconds`. English says one of a unit as "a" and under 45 seconds "a few seconds", as
 * Discord does; other languages as `Intl.RelativeTimeFormat` words them.
 */
export function relativeStamp(at: number, now: number, locale?: string): string {
  const [unit, count] = step(at - now);
  // Discord's past starts at the moment itself: "a few seconds ago".
  const future = at > now;
  const signed = future ? count : -count;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const english = format.resolvedOptions().locale.startsWith('en');
  if (!english) return format.format(signed, unit);
  const few = unit === 'second';
  // The number's parts given Discord's words: "a few", "a", "an".
  const parts = format.formatToParts(few ? (future ? 2 : -2) : signed, unit);
  return parts
    .map((part) => {
      if (part.type !== 'integer') return part.value;
      if (few) return 'a few';
      if (count === 1) return 'a';
      return part.value;
    })
    .join('')
    .replace(/\p{Zs}/gu, ' ');
}

/**
 * A span of time Pine composes (a time left, a countdown): `17 min`, `1 h 05 min`, `2 h`, the
 * minutes rounded to the nearest and never to nothing (a few seconds left is `1 min`); `compact`
 * leaves "min" out after hours (`1 h 05`), for a marker's badge.
 */
export function durationWords(ms: number, options: { compact?: boolean } = {}): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${String(hours)} h`;
  const padded = String(rest).padStart(2, '0');
  return options.compact === true
    ? `${String(hours)} h ${padded}`
    : `${String(hours)} h ${padded} min`;
}
