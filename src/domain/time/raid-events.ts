import { z } from 'zod';
import { feedTime, localTime, zoned } from './zoned.js';

/** The kinds of event during which a raid boss stays for another time than usual. */
export const RAID_EVENT_KINDS = ['raid-hour', 'raid-day'] as const;
export type RaidEventKind = (typeof RAID_EVENT_KINDS)[number];

/** An event from the events feed, or the weekly Raid Hour. Times are epoch milliseconds. */
export interface RaidEvent {
  kind: RaidEventKind;
  /** The feed's name of the event, e.g. `Dialga Raid Hour`. Shown to members: escape it. */
  name: string;
  start: number;
  /** The first moment after the event. */
  end: number;
}

/** An event longer than this is not a Raid Hour or a Raid Day, whatever the feed calls it. */
const MAX_EVENT_MS = 24 * 60 * 60_000;

/**
 * The name of an event of the feed as it is kept and shown: control and format characters as
 * spaces, runs of white space as one, at most 100 characters.
 */
export const eventName = z
  .string()
  .transform((name) =>
    name
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(1))
  .transform((name) => Array.from(name).slice(0, 100).join('').trimEnd());

const feedEvent = z.object({
  eventType: z.enum(RAID_EVENT_KINDS),
  name: eventName,
  start: z.string().max(40),
  end: z.string().max(40),
});

/**
 * Reads the events feed of ScrapedDuck (`events.json`: Leek Duck's event list) and keeps the Raid
 * Hours and Raid Days. The feed gives most times as local wall-clock times without a zone
 * (`2026-10-14T18:00:00.000`): those are read in `zone`. A time with a zone keeps its own.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it
 * had. A single raid event that cannot be read is left out.
 */
export function parseRaidEventFeed(json: unknown, zone: string): RaidEvent[] {
  const typed = z.object({ eventType: z.string() }).loose();
  const list = z.array(z.unknown()).safeParse(json);
  const items = list.success ? list.data.filter((item) => typed.safeParse(item).success) : [];
  if (items.length === 0) throw new Error('The events feed is not a list of events');

  const events: RaidEvent[] = [];
  for (const item of items) {
    const parsed = feedEvent.safeParse(item);
    if (!parsed.success) continue;
    const start = feedTime(parsed.data.start, zone)?.epochMilliseconds;
    const end = feedTime(parsed.data.end, zone)?.epochMilliseconds;
    if (start === undefined || end === undefined) continue;
    const length = end - start;
    if (length <= 0 || length > MAX_EVENT_MS) continue;
    events.push({
      kind: parsed.data.eventType,
      name: parsed.data.name,
      start,
      end,
    });
  }
  return inOrder(events);
}

/** Events in order of their start, then their name. */
function inOrder(events: RaidEvent[]): RaidEvent[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** A Raid Hour an event page names by its day (`parseEventRaidHours`, `leekduck.ts`). */
export interface PageRaidHourDay {
  /** 1 to 12. */
  month: number;
  day: number;
  bosses: readonly string[];
}

/** The time of a Raid Hour where the settings have no weekly one: 18:00, for an hour. */
const STANDARD_RAID_HOUR: { hour: number; minute?: number; minutes: number } = {
  hour: 18,
  minutes: 60,
};

/**
 * The Raid Hours an event's page names (Matt, 2026-11-07: "Into the Wild" has two that only its
 * Leek Duck page lists; real Raid Hours, under the standard rules), as raid events: on each day,
 * at `time`, the page's own (`eventPageTime`, read from the Raids section's sentence) or else the
 * weekly Raid Hour's of the settings (18:00 for 60 minutes where it is null), named by the bosses
 * listed under it ("Zacian (Crowned Sword) Raid Hour", "Raid Hour" without any). The page gives
 * no year: it is the one in which the day falls within the event (`span`, from its start's day to
 * its end's day in `zone`, an end at midnight the day before's); a day outside it, or a day the
 * page names twice, is dropped. In order of their start.
 */
export function eventPageRaidHours(
  hours: readonly PageRaidHourDay[],
  span: { start: number; end: number },
  time: { hour: number; minute?: number; minutes: number } | null,
  zone: string,
): RaidEvent[] {
  if (span.end <= span.start) return [];
  const { hour, minute = 0, minutes } = time ?? STANDARD_RAID_HOUR;
  const first = zoned(span.start, zone).toPlainDate();
  const last = zoned(span.end - 1, zone).toPlainDate();
  const within = (date: Temporal.PlainDate): boolean =>
    Temporal.PlainDate.compare(date, first) >= 0 && Temporal.PlainDate.compare(date, last) <= 0;
  const events: RaidEvent[] = [];
  for (const { month, day, bosses } of hours) {
    // An event spans at most the turn of one year.
    const start = [first.year, first.year + 1]
      .filter((year) => year <= last.year)
      .map((year) => localTime({ year, month, day, hour, minute }, zone))
      .find((time) => time !== undefined && within(time.toPlainDate()));
    if (start === undefined || events.some((one) => one.start === start.epochMilliseconds)) {
      continue;
    }
    const named = eventName.safeParse(
      bosses.length === 0 ? 'Raid Hour' : `${bosses.join(' and ')} Raid Hour`,
    );
    events.push({
      kind: 'raid-hour',
      name: named.success ? named.data : 'Raid Hour',
      start: start.epochMilliseconds,
      end: start.add({ minutes }).epochMilliseconds,
    });
  }
  return inOrder(events);
}

/**
 * The raid events of the feed with the Raid Hours of the events' pages (`eventPageRaidHours`), in
 * order: one path for every reader of the raid events (`RaidEventProvider.events()`). A page's
 * Raid Hour that starts when one of the feed does is dropped (the feed's wins), as is a second
 * one of the pages at the same start. `feed` itself when the pages add nothing.
 */
export function withPageRaidHours(
  feed: readonly RaidEvent[],
  pages: readonly RaidEvent[],
): readonly RaidEvent[] {
  const taken = new Set(feed.filter((event) => event.kind === 'raid-hour').map((e) => e.start));
  const added: RaidEvent[] = [];
  for (const hour of pages) {
    if (hour.kind !== 'raid-hour' || taken.has(hour.start)) continue;
    taken.add(hour.start);
    added.push(hour);
  }
  return added.length === 0 ? feed : inOrder([...feed, ...added]);
}
