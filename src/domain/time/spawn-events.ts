import { z } from 'zod';
import { isForEveryone } from './event-reach.js';
import { eventName } from './raid-events.js';
import { localsOf } from './feed-times.js';
import { momentIn, readFeedTime } from './zoned.js';

/*
 * The events whose spawns can be costumed (plan 8R-4; design `2026-10-22-costume-form-wants-
 * design.md`, section 5, "Spawns"; F11): a spawn report is costumed when an event on now lists
 * that Pokémon costumed. Pure: `EventPageService` reads the pages and keeps what they list.
 */

/** A Pokémon an event lists among its spawns, by its English name and picture. */
export interface ListedSpawn {
  name: string;
  image?: string;
}

/**
 * An event of ScrapedDuck's feed with spawns (`SpawnEvent`): its id, name and type, its start
 * and end (epoch milliseconds, `end` the first moment after it), and where its spawns are: in
 * the feed itself (`spawns`: a community day's `extraData.communityday.spawns`, a spotlight
 * hour's `extraData.spotlight.list`), or on its Leek Duck page (`page`, read by the service).
 */
export interface SpawnEvent {
  id: string;
  name: string;
  eventType: string;
  start: number;
  end: number;
  /** The start as wall-clock time, where it is one (`FeedTimed`, plan 19A-2). */
  startLocal?: string;
  /** The end as wall-clock time, where it is one. */
  endLocal?: string;
  spawns?: ListedSpawn[];
  page?: string;
}

/**
 * The event types whose spawns are every member's (Matt's R-M5 and Q2, 2026-10-22): an
 * allowlist, so that a type the feed adds later stays out until it is known. A Wild Area, GO
 * Tour and GO Fest count at local times (`isForEveryone`; Matt, 2026-10-24, which replaces Q2's
 * Global edition only); city Wild Areas, GO Tours and GO Fests (zoned times), City Safaris,
 * seasons (their spawns stand for three months: a costume listed there would mark every report
 * until the next season) and every other type are out.
 */
export const SPAWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'event',
  'community-day',
  'pokemon-spotlight-hour',
  'pokemon-go-tour',
  'wild-area',
  'pokemon-go-fest',
]);

/** The only pages read (F11): Leek Duck's events pages. */
const EVENT_PAGE = /^https:\/\/leekduck\.com\/events\/[A-Za-z0-9._~-]{1,200}\/?$/;

/** Whether an address is a Leek Duck events page, the only pages read (F11). */
export function isEventPage(url: string): boolean {
  return EVENT_PAGE.test(url);
}

/** An event longer than this lists no spawns of a moment (a season, whatever its type). */
const MAX_SPAWN_EVENT_MS = 31 * 24 * 60 * 60_000;

const listed = z
  .array(
    z.object({ name: z.string().min(1).max(100), image: z.string().max(300).optional() }).loose(),
  )
  .max(100);

const spawnItem = z.object({
  eventID: z.string().min(1).max(200),
  eventType: z.string().min(1).max(40),
  name: eventName,
  link: z.string().max(300).optional(),
  start: z.string().max(40).nullable().optional(),
  end: z.string().max(40).nullable().optional(),
  extraData: z
    .object({
      generic: z.object({ hasSpawns: z.boolean().optional() }).loose().optional(),
      communityday: z.object({ spawns: listed.optional() }).loose().optional(),
      spotlight: z.object({ list: listed.optional() }).loose().optional(),
    })
    .loose()
    .optional(),
});

/**
 * The events of the feed with spawns (design 5, F11): a community day's and a spotlight hour's
 * from the feed, any other the feed marks `generic.hasSpawns` from its Leek Duck page; only the
 * types of `SPAWN_EVENT_TYPES` and everyone's (`isForEveryone`: never an event at a fixed time of
 * another zone, times with a `Z`: Pokémon Night Out, a city's Wild Area, GO Tour or GO Fest),
 * never one without hours, one that ends before it starts or lasts over a month.
 * An event's `page` is its feed link as it stands: whoever reads it reads only a Leek Duck
 * events page (`isEventPage`). In order of their start.
 *
 * Throws when the document is not a list at all, so that the caller keeps what it had.
 */
export function parseSpawnEventFeed(json: unknown, zone: string): SpawnEvent[] {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  const events: SpawnEvent[] = [];
  for (const value of json as unknown[]) {
    const parsed = spawnItem.safeParse(value);
    if (!parsed.success) continue;
    const { eventID: id, eventType, name, link, start: from, end: to, extraData } = parsed.data;
    if (!SPAWN_EVENT_TYPES.has(eventType) || !isForEveryone(parsed.data)) continue;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    const fromTime = readFeedTime(from);
    const toTime = readFeedTime(to);
    if (fromTime === undefined || toTime === undefined) continue;
    const start = momentIn(fromTime, zone).epochMilliseconds;
    const end = momentIn(toTime, zone).epochMilliseconds;
    const length = end - start;
    if (length <= 0 || length > MAX_SPAWN_EVENT_MS) continue;
    const fromFeed = extraData?.communityday?.spawns ?? extraData?.spotlight?.list;
    const spawns = fromFeed?.map((one) => ({
      name: one.name,
      ...(one.image === undefined ? {} : { image: one.image }),
    }));
    const hasPage = extraData?.generic?.hasSpawns === true && link !== undefined;
    if (!(spawns && spawns.length > 0) && extraData?.generic?.hasSpawns !== true) continue;
    events.push({
      id,
      name,
      eventType,
      start,
      end,
      ...localsOf(fromTime, toTime),
      ...(spawns && spawns.length > 0 ? { spawns } : {}),
      ...(!(spawns && spawns.length > 0) && hasPage ? { page: link } : {}),
    });
  }
  return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/** The events on at a moment. */
export function spawnEventsAt(events: readonly SpawnEvent[], at: number): SpawnEvent[] {
  return events.filter((event) => event.start <= at && at < event.end);
}

/** The spawns events list, as the catalogue places them (`costumedSighting`). */
export type SpawnSightingOf = readonly { key: string; dex: number; costumed: boolean }[];

/**
 * Whether a report of an entry is costumed (design 5): an event on lists that very entry
 * costumed (the species' entry for a species, the form's for a form: Galarian Corsola's costume
 * is no plain Corsola's), whether or not it lists it plain beside it (a costume hunter would
 * rather a false alarm than a miss; a plain want fires either way).
 */
export function costumedSpawn(sightings: SpawnSightingOf, entry: { key: string }): boolean {
  return sightings.some((sighting) => sighting.costumed && sighting.key === entry.key);
}
