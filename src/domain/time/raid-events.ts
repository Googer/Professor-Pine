import { z } from 'zod';
import { feedTime } from './zoned.js';

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
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}
