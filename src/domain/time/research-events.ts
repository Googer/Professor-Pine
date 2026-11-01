import { z } from 'zod';
import { IN_PERSON_TYPES, isForEveryone, isForEveryoneKind } from './event-reach.js';
import { eventName } from './raid-events.js';
import { feedTime } from './zoned.js';

/**
 * An event of ScrapedDuck's events feed with field research of its own (plan 8R-1; design 4.2,
 * 9.2: `extraData.generic.hasFieldResearchTasks`), as it is kept (`ResearchEvent`): the feed's
 * `eventID`, name and `eventType`, and its start and end (epoch milliseconds; `end` is the first
 * moment after it). Kept as last seen, so that a restart or an event the feed dropped once it
 * ended cannot lose a period.
 */
export interface ResearchEvent {
  id: string;
  name: string;
  eventType: string;
  start: number;
  end: number;
}

/** A research event longer than this is none, whatever the feed says (a season is no event). */
const MAX_RESEARCH_EVENT_MS = 31 * 24 * 60 * 60_000;

/**
 * The event types whose field research is everyone's (plan 8R-7; Matt's R2, 2026-10-24): an
 * allow list, so that a type the feed adds later stays out until it is known (`unreadResearchTypes`
 * names it for the log). A Wild Area, GO Tour and GO Fest count at local times (`isForEveryone`;
 * Matt, 2026-10-24, in place of the Global edition only); a City Safari, a season and every other
 * type are out.
 */
export const RESEARCH_EVENT_TYPES: ReadonlySet<string> = new Set([
  'event',
  'community-day',
  'research-day',
  'pokemon-go-tour',
  'wild-area',
  'pokemon-go-fest',
]);

/**
 * Whether an event of this kind can be a research event, its times aside: its type on the list
 * and no in-person type. For the events kept without their times (`ResearchEvent` rows: one kept
 * before plan 8R-7 may be a City Safari; a Wild Area, GO Tour or GO Fest was kept only at local
 * times, which are enough since Matt's rule of 2026-10-24).
 */
export function isResearchEventKind(
  event: Pick<ResearchEvent, 'id' | 'eventType' | 'name'>,
): boolean {
  return RESEARCH_EVENT_TYPES.has(event.eventType) && isForEveryoneKind(event.eventType);
}

const researchItem = z.object({
  eventID: z.string().min(1).max(200),
  eventType: z.string().min(1).max(40),
  name: eventName,
  start: z.string().max(40).nullable().optional(),
  end: z.string().max(40).nullable().optional(),
  extraData: z
    .object({
      generic: z.object({ hasFieldResearchTasks: z.literal(true) }).loose(),
    })
    .loose(),
});

/**
 * Whether the feed says of its events whether they have field research at all: some item has
 * `extraData.generic.hasFieldResearchTasks`. `events.min.json` had it on 2026-10-21; a feed that
 * lost it is read again as `events.json` (design 9.2).
 */
export function feedHasResearchFlags(json: unknown): boolean {
  if (!Array.isArray(json)) return false;
  return (json as unknown[]).some((item) => {
    const generic = (item as { extraData?: { generic?: unknown } } | null)?.extraData?.generic;
    return typeof generic === 'object' && generic !== null && 'hasFieldResearchTasks' in generic;
  });
}

/**
 * The events of the feed with field research of their own (design 4.2): those whose
 * `extraData.generic.hasFieldResearchTasks` is true, with an id and hours, of a type of
 * `RESEARCH_EVENT_TYPES` and everyone's (`isForEveryone`, plan 8R-7: no City Safari, nothing at
 * the fixed times of another zone, as a city's Wild Area, GO Tour or GO Fest). The feed gives local
 * wall-clock times, read in `zone`. One that ends before it starts, or lasts more than a month, is
 * left out. In order of their start.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it had.
 */
export function parseResearchEventFeed(json: unknown, zone: string): ResearchEvent[] {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  const events: ResearchEvent[] = [];
  for (const value of json as unknown[]) {
    const parsed = researchItem.safeParse(value);
    if (!parsed.success) continue;
    const { eventID: id, eventType, name, start: from, end: to } = parsed.data;
    if (!RESEARCH_EVENT_TYPES.has(eventType) || !isForEveryone(parsed.data)) continue;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    const start = feedTime(from, zone)?.epochMilliseconds;
    const end = feedTime(to, zone)?.epochMilliseconds;
    if (start === undefined || end === undefined) continue;
    const length = end - start;
    if (length <= 0 || length > MAX_RESEARCH_EVENT_MS) continue;
    events.push({ id, name, eventType, start, end });
  }
  return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/**
 * The types of the feed's events with field research that `parseResearchEventFeed` does not read
 * because they are not on `RESEARCH_EVENT_TYPES` (an in-person type, `IN_PERSON_TYPES`, is known
 * and left out on purpose: not named), each once with the first such event's id, in the feed's
 * order: the log says so, so that a new type is noticed (Matt's R2). None for a document that is
 * no list.
 */
export function unreadResearchTypes(json: unknown): { eventType: string; id: string }[] {
  if (!Array.isArray(json)) return [];
  const unread = new Map<string, string>();
  for (const value of json as unknown[]) {
    const parsed = researchItem.safeParse(value);
    if (!parsed.success) continue;
    const { eventType, eventID } = parsed.data;
    if (RESEARCH_EVENT_TYPES.has(eventType) || IN_PERSON_TYPES.has(eventType)) continue;
    if (!unread.has(eventType)) unread.set(eventType, eventID);
  }
  return [...unread].map(([eventType, id]) => ({ eventType, id }));
}
