import { relativeStamp } from '../../render/duration-words.js';
import type { PostTimeStyle } from '../../domain/web/party-data.js';

/**
 * Where a time is shown: the reader's own language and zone unless a test fixes them (the page
 * leaves both out, as Discord shows a timestamp in each reader's own).
 */
export interface TimeShown {
  locale?: string | undefined;
  timeZone?: string | undefined;
}

const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');

/** Discord's styles as the browser's own formats. */
const STYLES: Readonly<Record<Exclude<PostTimeStyle, 'R'>, Intl.DateTimeFormatOptions>> = {
  t: { hour: 'numeric', minute: '2-digit' },
  T: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  d: { year: 'numeric', month: '2-digit', day: '2-digit' },
  D: { dateStyle: 'long' },
  f: { dateStyle: 'long', timeStyle: 'short' },
  F: { dateStyle: 'full', timeStyle: 'short' },
};

/** The reader's own zone: the page shows every time in it, as Discord does (plan 8M-8A). */
export function readerZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * What a form says after a time it shows in the server's zone (review 8A-11: a form's times are
 * read in it), where the reader is in another: ` (Eastern)`, the zone's generic name without
 * "Time"; nothing where they are the same.
 */
export function zoneNote(zone: string, reader: string = readerZone()): string {
  if (zone === reader) return '';
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
    .formatToParts(0)
    .find((part) => part.type === 'timeZoneName')?.value;
  return name === undefined ? ` (${zone})` : ` (${name.replace(/ Time$/u, '')})`;
}

/**
 * The hint of a form that takes a typed clock time (review N4: the raid report and change forms,
 * a new train's, a new meetup's), which the server reads in its zone: named where the reader is in
 * another, `Clock times are read in the server's zone (Eastern).`; undefined where they are the
 * same.
 */
export function zoneHint(zone: string, reader: string = readerZone()): string | undefined {
  const note = zoneNote(zone, reader);
  return note === '' ? undefined : `Clock times are read in the server's zone${note}.`;
}

/**
 * A post's time (`<t:…:style>`, a `time` node) as Discord shows it to a reader (plan 8M-8A): in
 * the reader's own language and zone, `R` as how long until or since `now` (the page keeps it
 * current). The map's other times say the server's zone (`clockTime`); a post's say the reader's,
 * as on Discord.
 */
export function postTime(
  at: number,
  style: PostTimeStyle,
  now: number,
  shown: TimeShown = {},
): string {
  // As Discord's client words its stamps (plan 8M-11A, S6): "in a day", not "in 24 hours".
  if (style === 'R') return relativeStamp(at, now, shown.locale);
  return plainSpaces(
    new Intl.DateTimeFormat(shown.locale, { ...STYLES[style], timeZone: shown.timeZone }).format(
      at,
    ),
  );
}
