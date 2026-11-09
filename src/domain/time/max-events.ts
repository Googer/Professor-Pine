import { z } from 'zod';
import { everyonesTimes } from './event-reach.js';
import { eventName, placePageDays, type PageSource } from './raid-events.js';
import { addDays, feedTime, sameDay, zoned } from './zoned.js';

/**
 * The max events of ScrapedDuck's events feed (plan 8X-2; design section 10, the featured boss),
 * kept apart from the raid events (`RAID_EVENT_KINDS`, which set raid durations): a Max Monday
 * (`max-mondays`) and a Max Battle Day or Weekend (`max-battles`).
 */
const FEED_KINDS = { 'max-mondays': 'max-monday', 'max-battles': 'max-battle' } as const;
export type MaxEventKind = (typeof FEED_KINDS)[keyof typeof FEED_KINDS];

/** The bosses an event's name features: their names as written, and whether they are Gigantamax. */
export interface FeaturedNames {
  gigantamax: boolean;
  names: string[];
}

/** A max event. Times are epoch milliseconds. */
export interface MaxEvent {
  kind: MaxEventKind;
  /** The feed's name, e.g. `Dynamax Sneasel during Max Monday`. Shown to members: escape it. */
  name: string;
  /** The feed's own start and end (or those assumed, `hoursAssumed`); `end` is the first moment after it. */
  start: number;
  end: number;
  /**
   * Within one day of the zone and shorter than `SHORT_EVENT_MS`: a Max Battle Day, whose
   * battles rotate about every 30 minutes. Otherwise all day (a Max Monday, a weekend over
   * several days, on from its start to its end, nights included: battles stop at the last battle
   * time of the settings anyway), whose battles last about an hour.
   */
  short: boolean;
  /**
   * The feed gave no hours; they are those of the nearest event of its kind that has them, on the
   * date of the event's id (Matt, 2026-10-20).
   */
  hoursAssumed: boolean;
  /** What its name features; undefined when it names no boss ("Pokémon to be announced"). */
  featured: FeaturedNames | undefined;
  /** The feed's `eventID` (`max-mondays-2026-10-26`), which stays when it renames or moves it. */
  id: string | undefined;
  /**
   * The event whose Leek Duck page named it (`eventPageMaxHours`); none for the feed's own. Such
   * an event is never kept in the database (`MaxEventStorage`).
   */
  page?: PageSource;
  /**
   * The event window staff set (`eventWindowMaxEvent`, `/admin event-window`): `short` over several days,
   * featuring nothing; a Max Battle Day or Weekend on at the same time wins (`maxEventAt`). Never
   * kept in the database.
   */
  eventWindow?: true;
}

/** An event shorter than this, within one day, is short (`MaxEvent.short`). */
export const SHORT_EVENT_MS = 6 * 60 * 60_000;
/** A max event longer than this is none, whatever the feed says. */
const MAX_EVENT_MS = 8 * 24 * 60 * 60_000;
const FEATURE =
  /^(Dynamax|Gigantamax)\s+(.+?)\s+(during\s+(?:a\s+)?Max\s+Monday|Max\s+Battle\s+(?:Day|Weekend))$/i;

/**
 * What sort of event a name says: `monday`, `day` (a Max Battle Day) or `weekend`, from its last
 * words as `FEATURE` reads them; undefined for a name of another shape.
 */
function sortOf(name: string): 'monday' | 'day' | 'weekend' | undefined {
  const ending = FEATURE.exec(name.trim())?.[3]?.toLowerCase();
  if (ending === undefined) return undefined;
  return ending.endsWith('monday') ? 'monday' : ending.endsWith('weekend') ? 'weekend' : 'day';
}

/**
 * The bosses an event's name features: `Dynamax Sneasel during Max Monday`, `Dynamax Uxie,
 * Mesprit, and Azelf Max Battle Day`, `Dynamax Lugia Max Battle Weekend`, `Gigantamax Machamp Max
 * Battle Day`. Undefined for a name of another shape: it features nothing.
 */
export function featuredNames(name: string): FeaturedNames | undefined {
  const match = FEATURE.exec(name.trim());
  if (!match?.[1] || !match[2]) return undefined;
  const names = match[2]
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
    .map((one) => one.trim())
    .filter((one) => one !== '');
  if (names.length === 0) return undefined;
  return { gigantamax: match[1].toLowerCase() === 'gigantamax', names };
}

const feedItem = z.object({
  eventID: z.string().max(200).optional(),
  eventType: z.enum(Object.keys(FEED_KINDS) as [keyof typeof FEED_KINDS]),
  name: eventName,
  start: z.string().max(40).nullable().optional(),
  end: z.string().max(40).nullable().optional(),
});
type FeedItem = z.output<typeof feedItem>;

export interface ParsedMaxEvents {
  /** In order of their start. */
  events: MaxEvent[];
  /** The names of the events whose hours were assumed (`MaxEvent.hoursAssumed`). */
  assumed: string[];
  /**
   * The events without hours that could not be assumed (no date in the id, or no event of its
   * kind with hours): they are left out. `date` is the date of the id, when it has one.
   */
  unhoured: { name: string; date: string | undefined }[];
}

/** The date an event's id carries, as `max-mondays-2026-10-19` does. */
function idDate(item: FeedItem): string | undefined {
  return /(\d{4}-\d{2}-\d{2})/.exec(item.eventID ?? '')?.[1];
}

interface Hours {
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
}

/** An item's own hours (`everyonesTimes`, the one reader of an item's times; plan 8V-1, R4). */
function hoursOf(item: FeedItem, zone: string): Hours | undefined {
  const times = everyonesTimes(item, zone);
  return times.kind === 'times' ? { start: times.start, end: times.end } : undefined;
}

/**
 * Whether two events of one `eventType` are of one sort for `assumedHours`: every Max Monday is
 * (a name that names no boss, "Max Monday: Pokémon to be announced", has no sort); otherwise
 * when either name has no sort, or both have the same.
 */
function sameSort(a: FeedItem, b: FeedItem): boolean {
  if (a.eventType === 'max-mondays') return true;
  const one = sortOf(a.name);
  const other = sortOf(b.name);
  return one === undefined || other === undefined || one === other;
}

/**
 * The hours of an event the feed gives none: those of the nearest event of its kind (its
 * `eventType`, and a Max Battle Day for a day, a Weekend for a weekend: `sameSort`; by the date of
 * the id against the other's start) that has them, at the same clock times on the id's date, over
 * as many days as that one.
 */
function assumedHours(
  date: string,
  item: FeedItem,
  houred: readonly ({ item: FeedItem } & Hours)[],
  zone: string,
): Hours | undefined {
  const day = feedTime(date, zone);
  if (!day) return undefined;
  const apart = (time: Temporal.ZonedDateTime): number =>
    Math.abs(time.startOfDay().epochMilliseconds - day.epochMilliseconds);
  const nearest = houred
    .filter((one) => one.item.eventType === item.eventType && sameSort(one.item, item))
    .sort(
      (a, b) =>
        apart(a.start) - apart(b.start) || a.start.epochMilliseconds - b.start.epochMilliseconds,
    )[0];
  if (!nearest) return undefined;
  // Calendar days between the local dates, a day of a change of the clocks counting as one.
  const days = nearest.start.toPlainDate().until(nearest.end.toPlainDate()).days;
  const at = (time: Temporal.ZonedDateTime, plus: number): Temporal.ZonedDateTime =>
    addDays(day, plus).with({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });
  return { start: at(nearest.start, 0), end: at(nearest.end, days) };
}

/**
 * Reads the max events of ScrapedDuck's events feed (`events.json`). The feed gives local
 * wall-clock times without a zone, read in `zone`; an event's hours are always the feed's own. An
 * item with a time of a zone of its own (`hasOwnZone`, plan 8R-7: an in-person event's) is left
 * out, and lends no hours to another.
 * An event without hours whose id carries a date takes the hours of the nearest event of its kind
 * (`assumedHours`); one that cannot is left out and listed in `unhoured`. An event that ends
 * before it starts, or lasts longer than eight days, is left out.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it had.
 */
export function parseMaxEventFeed(json: unknown, zone: string): ParsedMaxEvents {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  // An item at the fixed times of another zone is no event of ours, nor a pattern for hours.
  const items = (json as unknown[]).flatMap((value) => {
    const parsed = feedItem.safeParse(value);
    if (!parsed.success) return [];
    return everyonesTimes(parsed.data, zone).kind === 'elsewhere' ? [] : [parsed.data];
  });
  const houred = items.flatMap((item) => {
    const hours = hoursOf(item, zone);
    return hours ? [{ item, ...hours }] : [];
  });

  const events: MaxEvent[] = [];
  const assumed: string[] = [];
  const unhoured: ParsedMaxEvents['unhoured'] = [];
  for (const item of items) {
    let hours = hoursOf(item, zone);
    const missing = item.start == null || item.end == null;
    if (!hours && missing) {
      const date = idDate(item);
      hours = date === undefined ? undefined : assumedHours(date, item, houred, zone);
      if (!hours) {
        unhoured.push({ name: item.name, date });
        continue;
      }
      assumed.push(item.name);
    }
    if (!hours) continue;
    const start = hours.start.epochMilliseconds;
    const end = hours.end.epochMilliseconds;
    const length = end - start;
    if (length <= 0 || length > MAX_EVENT_MS) continue;
    events.push({
      kind: FEED_KINDS[item.eventType],
      name: item.name,
      start,
      end,
      short:
        length < SHORT_EVENT_MS && sameDay(hours.start, hours.end.subtract({ milliseconds: 1 })),
      hoursAssumed: missing,
      id: item.eventID,
      featured: featuredNames(item.name),
    });
  }
  events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
  return { events, assumed, unhoured };
}

/**
 * The max event that is on at `time` (its own hours, `start` included, `end` not), with its kind
 * and hours (8X-3 sets a max battle's default end from it); a Max Battle Day before a Max Monday
 * that is on at the same time, then the earliest. An event window (`eventWindow`, staff's) comes
 * after a Max Battle Day or Weekend of the feed or a page (the game's own event knows its
 * rotation) and before a Max Monday (Matt saw half-hour rotations all through Into the Wild).
 * Undefined when none is on.
 */
export function maxEventAt(events: readonly MaxEvent[], time: number): MaxEvent | undefined {
  const on = events.filter((event) => event.start <= time && time < event.end);
  return (
    on.find((event) => event.kind === 'max-battle' && event.eventWindow !== true) ??
    on.find((event) => event.eventWindow === true) ??
    on.find((event) => event.kind === 'max-monday')
  );
}

/**
 * The events whose bosses are featured (listed first) at `time` (Matt, 2026-10-20): a Max Battle
 * Day or Weekend during its own hours, first; then the Max Monday of the week, whose boss stays
 * the most common Dynamax boss all week: from that Monday's start until the next Max Monday starts
 * (one that names no boss included), or a week of `zone`'s clock (the same hour seven days on),
 * whichever is sooner. Only events that name bosses; `until` is when the event stops being
 * featured.
 */
export function featuredAt(
  events: readonly MaxEvent[],
  time: number,
  zone: string,
): { event: MaxEvent; until: number }[] {
  const battles = events
    .filter((event) => event.kind === 'max-battle' && event.start <= time && time < event.end)
    .map((event) => ({ event, until: event.end }));
  const mondays = events.filter((event) => event.kind === 'max-monday');
  const weeks = mondays.flatMap((monday) => {
    const next = mondays.find((other) => other.start > monday.start);
    const week = addDays(zoned(monday.start, zone), 7).epochMilliseconds;
    const until = Math.min(next?.start ?? Infinity, week);
    return monday.start <= time && time < until ? [{ event: monday, until }] : [];
  });
  return [...battles, ...weeks].filter(({ event }) => event.featured !== undefined);
}

/** A Max Battle hour an event page names by its day (`parseEventMaxHours`, `leekduck.ts`). */
export interface PageMaxHourDay {
  /** 1 to 12. */
  month: number;
  day: number;
  bosses: readonly string[];
  gigantamax: boolean;
}

/**
 * The Max Battle hours an event's page names (Matt's decision of 2026-10-25: "Into the Wild"
 * features Registeel, Regidrago, then Latias and Latios in Max Battles from 6 to 7 p.m. on three
 * days, on its page only), as max events of the kind a Max Battle Day is (`max-battle`): each day
 * placed at the page's `time` (`eventPageTime`) as its Raid Hours are (`placePageDays`), short
 * where it is (`SHORT_EVENT_MS`, within one day), featuring the bosses listed under it (a
 * `Dynamax ` or `Gigantamax ` before a name dropped), nothing without any; named "Dynamax
 * Registeel Max Battle Hour" ("Gigantamax …" for a Gigantamax day, bosses joined with "and",
 * "Max Battle Hour" without any). No feed id; each carries `page`, where given. In order of
 * their start.
 */
export function eventPageMaxHours(
  hours: readonly PageMaxHourDay[],
  span: { start: number; end: number },
  time: { hour: number; minute?: number; minutes: number },
  zone: string,
  page?: PageSource,
): MaxEvent[] {
  const events = placePageDays(hours, span, time, zone).map(
    ({ day: { bosses, gigantamax }, start, end }): MaxEvent => {
      const names = bosses
        .map((boss) => boss.replace(/^(?:dynamax|gigantamax)\s+/i, '').trim())
        .filter((boss) => boss !== '');
      const kind = gigantamax ? 'Gigantamax' : 'Dynamax';
      const named = eventName.safeParse(
        names.length === 0 ? 'Max Battle Hour' : `${kind} ${names.join(' and ')} Max Battle Hour`,
      );
      return {
        kind: 'max-battle',
        name: named.success ? named.data : 'Max Battle Hour',
        start,
        end,
        short: end - start < SHORT_EVENT_MS && sameDay(zoned(start, zone), zoned(end - 1, zone)),
        hoursAssumed: false,
        featured: names.length === 0 ? undefined : { gigantamax, names },
        id: undefined,
        ...(page === undefined ? {} : { page }),
      };
    },
  );
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/**
 * The max events of the feed with the Max Battle hours of the events' pages
 * (`eventPageMaxHours`), in order: one path for every reader of the max events
 * (`MaxEventProvider.maxEvents()`), as `withPageRaidHours` is for the raid events. A page's hour
 * that starts when a Max Battle Day or Weekend of the feed does is dropped (the feed's wins), as
 * is a second one of the pages at the same start; but a Max Battle event of the feed whose hours
 * were assumed (`hoursAssumed`) on the local day (`zone`) of a page's hour gives way to it (review
 * of `event-pages-more`: the page knows that day's hours, the assumption does not). `feed` itself
 * when the pages change nothing.
 */
export function withPageMaxHours(
  feed: readonly MaxEvent[],
  pages: readonly MaxEvent[],
  zone: string,
): readonly MaxEvent[] {
  const day = (time: number): string => zoned(time, zone).toPlainDate().toString();
  const pageDays = new Set(
    pages.filter((hour) => hour.kind === 'max-battle').map((hour) => day(hour.start)),
  );
  const replaced = (event: MaxEvent): boolean =>
    event.kind === 'max-battle' && event.hoursAssumed && pageDays.has(day(event.start));
  const kept = feed.filter((event) => !replaced(event));
  const taken = new Set(kept.filter((event) => event.kind === 'max-battle').map((e) => e.start));
  const added: MaxEvent[] = [];
  for (const hour of pages) {
    if (hour.kind !== 'max-battle' || taken.has(hour.start)) continue;
    taken.add(hour.start);
    added.push(hour);
  }
  if (added.length === 0 && kept.length === feed.length) return feed;
  return [...kept, ...added].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/**
 * The kinds of ScrapedDuck's events that bring Gigantamax battles nearly all day, over a day or
 * two, sometimes several bosses at once (Matt, 2026-10-21): Wild Area, GO Tour, and GO Fest,
 * whose kind is not in the feed of 2026-10-20 (`pokemon-go-fest`, the kind GO Fest 2025's Max
 * Finale had in the feed, review W1 of 8R-7). Raids act as usual during them; for a Gigantamax battle they are all-day events
 * (`maxRotation`). Their names name no boss: they feature nothing.
 */
export const BIG_EVENT_TYPES = ['wild-area', 'pokemon-go-tour', 'pokemon-go-fest'] as const;

/** A big event (`BIG_EVENT_TYPES`) for everyone (local times). Times are epoch milliseconds. */
export interface BigEvent {
  /** The feed's `eventID` (`pokemon-go-wild-area-2026-global`). */
  id: string;
  /** The feed's name. Shown to members: escape it. */
  name: string;
  start: number;
  /** The first moment after it. */
  end: number;
}

const bigItem = z.object({
  eventID: z.string().max(200),
  eventType: z.enum(BIG_EVENT_TYPES),
  name: eventName,
  start: z.string().max(40).nullable().optional(),
  end: z.string().max(40).nullable().optional(),
});

/**
 * The big events of the events feed (plan 8X-3), the editions for everyone only: the in-person
 * city editions (Sendai, Mexico City, Kaohsiung, Los Angeles) are in another city until one comes
 * to a region Pine serves; the feed gives them UTC times (`Z`). Everyone's by the one rule of the
 * readers (`isForEveryone`): local times, whatever the name says (Matt, 2026-10-24, in place of
 * the Global edition only of 2026-10-21: GO Fest 2025's Max Finale said no `global`). Those
 * times are read in `zone`. One without hours, or that ends before it starts or lasts longer than eight days, is
 * left out. In order of their start.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it had.
 */
export function parseBigEventFeed(json: unknown, zone: string): BigEvent[] {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  const events: BigEvent[] = [];
  for (const value of json as unknown[]) {
    const parsed = bigItem.safeParse(value);
    if (!parsed.success) continue;
    // Everyone's, with hours (`everyonesTimes`, the one reader of an item's times; plan 8V-1).
    const times = everyonesTimes(parsed.data, zone);
    if (times.kind !== 'times') continue;
    const { eventID: id, name } = parsed.data;
    const start = times.start.epochMilliseconds;
    const end = times.end.epochMilliseconds;
    const length = end - start;
    if (length <= 0 || length > MAX_EVENT_MS) continue;
    events.push({ id, name, start, end });
  }
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** The big event on at `time` (its start included, its end not); undefined when none is. */
export function bigEventAt(events: readonly BigEvent[], time: number): BigEvent | undefined {
  return events.find((event) => event.start <= time && time < event.end);
}
