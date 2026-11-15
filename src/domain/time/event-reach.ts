/*
 * Which events of ScrapedDuck's feed are every member's, wherever they play (plan 8R-7, F1), one
 * rule for the readers of research events, big events, spawn events and max events. The feed has
 * no field that says "in-person": the rule goes by the type and the times' zone. Pure.
 */
import { momentIn, readFeedTime, type FeedTime } from './zoned.js';

/**
 * The types of which every edition is in a city (Matt, 2026-10-22): a City Safari, and the
 * Safari Zone, Leek Duck's older type for the same thing, should it come back. Never everyone's,
 * whatever the times or the name say (the staging of 8R-6 read the Boston City Safari, local times
 * and research flag, as everyone's research event).
 */
export const IN_PERSON_TYPES: ReadonlySet<string> = new Set(['city-safari', 'safari-zone']);

/**
 * The types with city editions and editions for everyone (Wild Area, GO Tour, GO Fest). Since
 * Matt's rule of 2026-10-24 (review W1 of 8R-7), which replaces the Global rule of 8X-3 (Matt,
 * 2026-10-21) and 8R-4's Q2, an edition at local times is everyone's whatever its name says:
 * every city edition the feed has listed came with zoned times, and GO Fest 2025's Max Finale,
 * everyone's, said no "global". Those whose id and name say no "global" are named for the log
 * (`editionsWithoutGlobal`), so that a city edition that ever comes at local times is seen.
 */
export const CITY_OR_GLOBAL_TYPES: ReadonlySet<string> = new Set([
  'wild-area',
  'pokemon-go-tour',
  'pokemon-go-fest',
]);

/** The word `global` as one of an id's words (`pokemon-go-wild-area-2026-global`). */
const GLOBAL_ID = /(^|-)global(-|$)/i;
/** The word `Global` in a name ("Pokémon GO Wild Area 2026: Global"). */
const GLOBAL_NAME = /\bglobal\b/i;
/** A time with a zone of its own (`Z`, `+09:00`, `-0500`): an in-person edition's, in a city. */
const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Whether an edition says it is the Global one: the word `global` in its id or in its name, in
 * any case. No longer a condition of being read (Matt, 2026-10-24); what lacks it is logged.
 */
export function isGlobalEdition(id: string, name: string): boolean {
  return GLOBAL_ID.test(id) || GLOBAL_NAME.test(name);
}

/**
 * Whether a time of the feed carries a zone of its own. The feed gives everyone's events in
 * local wall-clock time; an event at a fixed moment of a city (Pokémon Night Out, a city's Wild
 * Area or GO Tour) has UTC times.
 */
export function hasOwnZone(time: string): boolean {
  return ZONED_TIME.test(time);
}

/**
 * Whether an event's kind is everyone's, its times aside: never an in-person type
 * (`IN_PERSON_TYPES`); every other type is. For an event kept without the feed's times (a stored
 * research event: one with zoned times was never stored).
 */
export function isForEveryoneKind(eventType: string): boolean {
  return !IN_PERSON_TYPES.has(eventType);
}

/** What `isForEveryone` reads of a feed item. */
export interface EventReach {
  eventID: string;
  eventType: string;
  name: string;
  start?: string | null | undefined;
  end?: string | null | undefined;
}

/**
 * Whether an event of the feed is everyone's: its kind is (`isForEveryoneKind`) and neither of
 * its times has a zone of its own. A time the feed leaves out says nothing here (whoever reads
 * the event decides what an event without hours is).
 */
export function isForEveryone(event: EventReach | TimedItem): boolean {
  const zoned = [event.start, event.end].some(
    (time) => typeof time === 'string' && hasOwnZone(time),
  );
  return !zoned && isForEveryoneKind(event.eventType);
}

/** What `everyonesTimes` reads of a feed item: its type and its times, as the feed gives them. */
export interface TimedItem {
  eventType: string;
  start?: string | null | undefined;
  end?: string | null | undefined;
}

/**
 * The times of a feed item as everyone's events are read (plan 8V-1, R4: one reader for the max
 * events, the big events and the events forum's listing):
 * - `elsewhere`: no event of every member's (`isForEveryone`: an in-person type, or a time with a
 *   zone of its own), whatever its times;
 * - `none`: the feed left a time out (`null`, or no field): an event on now or just past, which
 *   each reader decides on (assumed hours, "not seen");
 * - `unreadable`: a time the feed wrote in a shape `feedTime` does not read;
 * - `times`: its start and end as the feed gave them (`feed`, plan 19A-2: wall-clock times), and
 *   seen in `zone`.
 */
export type ItemTimes =
  | {
      kind: 'times';
      start: Temporal.ZonedDateTime;
      end: Temporal.ZonedDateTime;
      feed: { start: FeedTime; end: FeedTime };
    }
  | { kind: 'none' }
  | { kind: 'elsewhere' }
  | { kind: 'unreadable' };

export function everyonesTimes(item: TimedItem, zone: string): ItemTimes {
  if (!isForEveryone(item)) return { kind: 'elsewhere' };
  if (typeof item.start !== 'string' || typeof item.end !== 'string') return { kind: 'none' };
  const start = readFeedTime(item.start);
  const end = readFeedTime(item.end);
  return start && end
    ? {
        kind: 'times',
        start: momentIn(start, zone),
        end: momentIn(end, zone),
        feed: { start, end },
      }
    : { kind: 'unreadable' };
}

/** A Wild Area, GO Tour or GO Fest of the feed whose id and name say no "global". */
export interface EditionWithoutGlobal {
  eventType: string;
  id: string;
  name: string;
}

/**
 * The feed's items of `CITY_OR_GLOBAL_TYPES` whose id and name both lack the word `global`
 * (`isGlobalEdition`), in the feed's order, whatever their times: whoever logs them keeps those a
 * reader took. None for a document that is no list.
 */
export function editionsWithoutGlobal(json: unknown): EditionWithoutGlobal[] {
  if (!Array.isArray(json)) return [];
  const found: EditionWithoutGlobal[] = [];
  for (const value of json as unknown[]) {
    if (typeof value !== 'object' || value === null) continue;
    const { eventID: id, eventType, name } = value as Record<string, unknown>;
    if (typeof id !== 'string' || typeof eventType !== 'string' || typeof name !== 'string') {
      continue;
    }
    if (CITY_OR_GLOBAL_TYPES.has(eventType) && !isGlobalEdition(id, name)) {
      found.push({ eventType, id, name });
    }
  }
  return found;
}
