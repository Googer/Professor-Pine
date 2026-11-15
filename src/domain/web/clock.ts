/**
 * Times as the live map writes them, in the page and in the server's answers alike. No import:
 * the page's bundle takes it.
 */

/** Spaces the formatter writes as narrow or no-break ones (every space separator), as plain. */
const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');

/** `2:30 PM` in the server's zone, with the day (`Wed, Oct 14, 2:00 PM`) when it is not today. */
export function clockTime(at: number, zone: string, now: number): string {
  const day = (time: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(time);
  const sameDay = day(at) === day(now);
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(at),
  );
}

/**
 * The zone a time is said in, after it: ` (Eastern)`, the zone's generic name without "Time" (its
 * id where it has none in English). The map adds it where the reader is in another zone
 * (`zoneNote`); a Discord dialog, which cannot know the reader's zone, always (review M3).
 */
export function zoneLabel(zone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
    .formatToParts(0)
    .find((part) => part.type === 'timeZoneName')?.value;
  return name === undefined ? ` (${zone})` : ` (${name.replace(/ Time$/u, '')})`;
}

/**
 * A day and time in the server's zone as Discord shows a member a timestamp of style `f`
 * (`<t:…:f>`, what the DMs write), with the zone's short name, since a page is read from
 * anywhere and does not show it in the reader's zone as Discord does: `November 19, 2026 at
 * 2:27 PM EST` (a zone without a short name in English as `GMT+1`). For a page, which cannot
 * show Discord's timestamps.
 */
export function dateTime(at: number, zone: string): string {
  return zoned(at, zone, 'long');
}

/** The same, short, for a page's table: `Nov 19, 2026, 2:27 PM EST`. */
export function shortDateTime(at: number, zone: string): string {
  return zoned(at, zone, 'short');
}

/** A day and time with the zone's short name (Intl takes no `dateStyle` beside `timeZoneName`). */
function zoned(at: number, zone: string, month: 'long' | 'short'): string {
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      month,
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(at),
  );
}
