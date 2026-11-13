import { z } from 'zod';
import { isForEveryone } from './event-reach.js';
import { eventName } from './raid-events.js';
import { isEventPage } from './spawn-events.js';
import { localsOf } from './feed-times.js';
import { momentIn, readFeedTime } from './zoned.js';

/*
 * The events of ScrapedDuck's feed whose Leek Duck page is read for what only the page says
 * (Matt, 2026-11-07: "Into the Wild" has its Raid Hours on its page alone; `EventPageService`
 * reads the pages, `eventPageRaidHours` turns what they name into raid events). Pure.
 */

/** An event of the feed with a Leek Duck events page (`page`). Times are epoch milliseconds. */
export interface PagedEvent {
  id: string;
  name: string;
  eventType: string;
  start: number;
  /** The first moment after it. */
  end: number;
  /** The start as wall-clock time, where it is one (`FeedTimed`, plan 19A-2). */
  startLocal?: string;
  /** The end as wall-clock time, where it is one. */
  endLocal?: string;
  page: string;
}

/** An event longer than this has no Raid Hours of its own (a season, whatever its type). */
const MAX_PAGED_EVENT_MS = 31 * 24 * 60 * 60_000;
/**
 * How far back and ahead the pages are read: the week's rule for the weekly Raid Hour
 * (`raid-durations.ts`) must know of an event's Raid Hour before the week starts and for the
 * whole of it.
 */
export const PAGE_WINDOW_MS = 8 * 24 * 60 * 60_000;

const pagedItem = z.object({
  eventID: z.string().min(1).max(200),
  eventType: z.string().min(1).max(40),
  name: eventName,
  link: z.string().max(300),
  start: z.string().max(40),
  end: z.string().max(40),
});

/**
 * The events of the feed with a Leek Duck events page (`isEventPage`, the only pages read), of
 * any type: everyone's at local times (`isForEveryone`: never a city's edition or a City
 * Safari), with hours, lasting at most 31 days. In order of their start.
 *
 * Throws when the document is not a list at all, so that the caller keeps what it had.
 */
export function parsePagedEventFeed(json: unknown, zone: string): PagedEvent[] {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  const events: PagedEvent[] = [];
  for (const value of json as unknown[]) {
    const parsed = pagedItem.safeParse(value);
    if (!parsed.success) continue;
    const { eventID: id, eventType, name, link: page } = parsed.data;
    if (!isEventPage(page) || !isForEveryone(parsed.data)) continue;
    const from = readFeedTime(parsed.data.start);
    const to = readFeedTime(parsed.data.end);
    if (from === undefined || to === undefined) continue;
    const start = momentIn(from, zone).epochMilliseconds;
    const end = momentIn(to, zone).epochMilliseconds;
    const length = end - start;
    if (length <= 0 || length > MAX_PAGED_EVENT_MS) continue;
    events.push({ id, name, eventType, start, end, ...localsOf(from, to), page });
  }
  return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/**
 * The events whose pages are read at `now`: those that overlap the time from eight days ago to
 * eight days ahead (`PAGE_WINDOW_MS`), those on now first, then by their start.
 */
export function pagedEventsNear(events: readonly PagedEvent[], now: number): PagedEvent[] {
  const on = (event: PagedEvent): boolean => event.start <= now && now < event.end;
  return events
    .filter((event) => event.start <= now + PAGE_WINDOW_MS && event.end > now - PAGE_WINDOW_MS)
    .sort((a, b) => Number(on(b)) - Number(on(a)) || a.start - b.start);
}
