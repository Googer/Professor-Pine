import { z } from 'zod';
import { isPictureSource } from '../stops/pictures.js';
import { IN_PERSON_TYPES, everyonesTimes, isForEveryoneKind } from './event-reach.js';
import { BIG_EVENT_TYPES, type BigEvent, type MaxEvent } from './max-events.js';
import { eventName, type RaidEvent } from './raid-events.js';
import { addDays, isoDate, shortDateWords, shortDayWords, shortHourWords, zoned } from './zoned.js';

/*
 * The events forum's one rule (plan 8V-1; design `2026-10-28-events-forum-design.md`, "Which
 * events, of which kinds"): which events of ScrapedDuck's feed are listed, which get a post of
 * their own, which carry the Campfire hint, how a read is merged with the events kept, and how
 * their times are said. The one path for the listing, the posts and any later reader. Pure.
 */

/** An event of the listing, as read and as kept (`ListedEvent` rows). Times are epoch ms. */
export interface ListedEvent {
  /** The feed's `eventID`. */
  id: string;
  /** The feed's name (`eventName`). Shown to members: through `plain()`. */
  name: string;
  /** The feed's `eventType`, which decides by the kinds below. */
  eventType: string;
  /** Its Leek Duck page (the feed's `link`, when on Leek Duck's site: `leekDuckLink`); else null. */
  link: string | null;
  /**
   * The feed's `image`, when on Leek Duck's CDN (`eventPicture`); else null. Pine never fetches
   * it.
   */
  image: string | null;
  start: number;
  /** The first moment after it. */
  end: number;
  /**
   * The ids it was listed under before it moved (R12: a new id of the same name and type while
   * the old one was dropped before its start), oldest first: a post made for one is its post.
   */
  formerIds: readonly string[];
}

/**
 * The kinds never listed: passes, seasons, leagues, Twitch drops, and research of every type of
 * Leek Duck's list (`research`, long Timed Research; `timed-research`, `special-research`,
 * `limited-research`, `research-breakthrough`), the app's updates (`update`) and its notices of
 * one place (`location-specific`; the review's ruling R1): they run for weeks or are no event
 * anybody meets for.
 */
export const UNLISTED_KINDS: ReadonlySet<string> = new Set([
  'go-pass',
  'season',
  'go-battle-league',
  'twitch-drops',
  'research',
  'timed-research',
  'special-research',
  'limited-research',
  'research-breakthrough',
  'update',
  'location-specific',
]);

/**
 * The kinds that get a post of their own, opened `postDaysAhead` before their start: the bigger
 * days and Leek Duck's Raid Weekends and elite raid days (`raid-weekend`, `elite-raids`, ruling R1
 * of the review). Leek Duck's type list (checked 2026-10-29, ScrapedDuck's wiki) has no Hatch Day
 * type: a Hatch Day comes as an `event`, which is posted.
 */
export const POSTED_KINDS: ReadonlySet<string> = new Set([
  'community-day',
  'raid-day',
  'raid-weekend',
  'elite-raids',
  'max-battles',
  'wild-area',
  'pokemon-go-tour',
  'pokemon-go-fest',
  'event',
]);

/**
 * The kind of a Max Battle hour an event's page names (`pageHoursListed`): Pine's own, no type of
 * Leek Duck's list. A page's Raid Hour is listed as the feed's are, `raid-hour`.
 */
export const PAGE_MAX_HOUR_KIND = 'max-battle-hour';

/**
 * The kinds listed as lines only, known: the weekly hours, a one-off raid event, and the Max
 * Battle hours of events' pages.
 */
const LINE_KINDS: ReadonlySet<string> = new Set([
  'raid-hour',
  'pokemon-spotlight-hour',
  'max-mondays',
  'raid-battles',
  PAGE_MAX_HOUR_KIND,
]);

/** The kinds whose lines and posts leave out the Campfire hint: none so far (design). */
export const NO_CAMPFIRE_KINDS: ReadonlySet<string> = new Set<string>();

/** A `raid-battles` item shorter than this is a one-off raid event; longer, a boss rotation. */
export const ONE_OFF_RAID_MS = 24 * 60 * 60_000;

/** The max events' feed kinds, whose times the max events give (R4). */
const MAX_KINDS: ReadonlySet<string> = new Set(['max-mondays', 'max-battles']);
const BIG_KINDS: ReadonlySet<string> = new Set(BIG_EVENT_TYPES);

/** Whether a kind is one this module decides on knowingly; an unknown one is logged once. */
export function isKnownKind(eventType: string): boolean {
  return (
    UNLISTED_KINDS.has(eventType) ||
    POSTED_KINDS.has(eventType) ||
    LINE_KINDS.has(eventType) ||
    IN_PERSON_TYPES.has(eventType)
  );
}

/**
 * Whether an event is listed: everyone's kind (`isForEveryoneKind`; zoned times are never read),
 * outside `UNLISTED_KINDS`, and a `raid-battles` item only when it lasts less than a day (ruling
 * B: the boss rotations stay out). A kind not known is listed.
 */
export function isListed(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
  if (!isForEveryoneKind(event.eventType) || UNLISTED_KINDS.has(event.eventType)) return false;
  if (event.eventType === 'raid-battles') {
    return event.end > event.start && event.end - event.start < ONE_OFF_RAID_MS;
  }
  return event.end > event.start;
}

/** Whether a listed event gets a post of its own (`POSTED_KINDS`). */
export function isPosted(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
  return isListed(event) && POSTED_KINDS.has(event.eventType);
}

/** Whether a listed event carries the Campfire hint (every listed kind but `NO_CAMPFIRE_KINDS`). */
export function hasCampfireHint(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
  return isListed(event) && !NO_CAMPFIRE_KINDS.has(event.eventType);
}

/**
 * Whether an event's own post says "Official meetups, if any: Campfire" (plan 8M-15, V1; Matt
 * 2026-10-30): only for an event shorter than a day (`ONE_OFF_RAID_MS`; a midnight-to-midnight
 * day, exactly 24 hours, gets none) whose kind has the hint (`hasCampfireHint`). The listing names
 * Campfire once at its foot instead.
 */
export function hasCampfirePostHint(
  event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>,
): boolean {
  return hasCampfireHint(event) && event.end - event.start < ONE_OFF_RAID_MS;
}

/** An address of the web a member may follow or Discord may load. */
const webAddress = z
  .string()
  .max(500)
  .regex(/^https:\/\/[^\s<>]+$/u);

/** Where every page of Leek Duck is: the host ends at this slash, so nothing else begins so. */
const LEEK_DUCK_SITE = 'https://leekduck.com/';

/**
 * An event's page as the forum links it: an address of the web on Leek Duck's site, whose pages
 * the feed's links are (all 64 of the kept feed of 2026-10-22); null for anything else, so that
 * a feed in other hands leads members nowhere (plan 8Z-2). Its event is listed all the same.
 */
export function leekDuckLink(link: unknown): string | null {
  const address = webAddress.safeParse(link).data;
  return address?.startsWith(LEEK_DUCK_SITE) === true ? address : null;
}

/**
 * An event's picture as the forum shows it: an address of the feeds' picture hosts
 * (`isPictureSource`, Leek Duck's CDN, where all of the kept feed's are); null for anything
 * else, so that Discord loads no picture from elsewhere for a post (plan 8Z-2).
 */
export function eventPicture(image: unknown): string | null {
  const address = webAddress.safeParse(image).data;
  return address !== undefined && isPictureSource(address) ? address : null;
}

const listedItem = z.object({
  eventID: z.string().min(1).max(200),
  eventType: z.string().min(1).max(40),
  name: eventName,
  link: z.unknown().optional(),
  image: z.unknown().optional(),
  start: z.string().max(40).nullable().optional(),
  end: z.string().max(40).nullable().optional(),
});

/** What a read of the feed gives the listing. */
export interface FeedListing {
  /** The listed events with times, in order of their start, then their name. */
  read: ListedEvent[];
  /** The ids of the items listed without times (R3): not seen, neither news nor a drop. */
  untimed: string[];
  /** Each kind not known (`isKnownKind`), once with the first such item's id, in feed order. */
  unknownKinds: { eventType: string; id: string }[];
}

/** Events in order of their start, then their name. */
function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/**
 * Reads the listed events of ScrapedDuck's feed (one read: `max` and `big` are the max and big
 * events of the same document as the caller merged them with those it kept, R4, review V10). An item of a max kind takes its times from the max event of its id (so
 * assumed hours too, as `maxEventAt` has them), a Wild Area, GO Tour or GO Fest from its big
 * event; every other item through `everyonesTimes`, the one reader of an item's times. An item
 * without times is `untimed`; one of somebody else's, or whose times cannot be read, is nothing.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it had.
 */
export function readListedEvents(
  json: unknown,
  zone: string,
  parsed: { max: readonly MaxEvent[]; big: readonly BigEvent[] },
): FeedListing {
  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
  const read: ListedEvent[] = [];
  const untimed: string[] = [];
  const unknown = new Map<string, string>();
  for (const value of json as unknown[]) {
    const item = listedItem.safeParse(value);
    if (!item.success) continue;
    const { eventID: id, eventType, name } = item.data;
    if (!isKnownKind(eventType) && !unknown.has(eventType)) unknown.set(eventType, id);
    const times = everyonesTimes(item.data, zone);
    if (times.kind === 'elsewhere' || times.kind === 'unreadable') continue;
    // A max or big kind takes its times from its parsed event, which the caller may have kept
    // from earlier reads (assumed hours, a big event on now; review V10): with or without times
    // in this item.
    const own = MAX_KINDS.has(eventType)
      ? parsed.max.find((one) => one.id === id)
      : BIG_KINDS.has(eventType)
        ? parsed.big.find((one) => one.id === id)
        : undefined;
    let start: number;
    let end: number;
    if (own) {
      ({ start, end } = own);
    } else if (times.kind === 'none') {
      // Not seen (R3).
      untimed.push(id);
      continue;
    } else if (MAX_KINDS.has(eventType) || BIG_KINDS.has(eventType)) {
      // Those parsers left it out (too long, of no shape of theirs): so does the listing.
      continue;
    } else {
      start = times.start.epochMilliseconds;
      end = times.end.epochMilliseconds;
    }
    const event: ListedEvent = {
      id,
      name,
      eventType,
      link: leekDuckLink(item.data.link),
      image: eventPicture(item.data.image),
      start,
      end,
      formerIds: [],
    };
    if (isListed(event)) read.push(event);
  }
  return {
    read: inOrder(read),
    untimed,
    unknownKinds: [...unknown].map(([eventType, id]) => ({ eventType, id })),
  };
}

/**
 * The hours events' pages named, as lines of the listing (2026-11-07): each Raid Hour of `raid`
 * and Max Battle hour of `max` that carries the event whose page named it (`page`), so from the
 * very lists every reader gets (`RaidEventProvider.events()`, `maxEvents()`), where the feed's
 * own already won at the same start (`withPageRaidHours`, `withPageMaxHours`). A Raid Hour is a
 * `raid-hour` line, a Max Battle hour a `PAGE_MAX_HOUR_KIND` line: lines only, never a post
 * (`isPosted`). Its id is the event's, the kind and the local day
 * (`into-the-wild-2026:raid-hour:2026-11-09`; no feed id has a colon), linked to the event's page,
 * without a picture. In order of their start, then their name.
 */
export function pageHoursListed(
  raid: readonly RaidEvent[],
  max: readonly MaxEvent[],
  zone: string,
): ListedEvent[] {
  const line = (hour: RaidEvent | MaxEvent, eventType: string): ListedEvent[] => {
    if (hour.page === undefined) return [];
    return [
      {
        id: `${hour.page.event}:${eventType}:${isoDate(hour.start, zone)}`,
        name: hour.name,
        eventType,
        link: leekDuckLink(hour.page.link),
        image: null,
        start: hour.start,
        end: hour.end,
        formerIds: [],
      },
    ];
  };
  return inOrder([
    ...raid.flatMap((hour) => (hour.kind === 'raid-hour' ? line(hour, 'raid-hour') : [])),
    ...max.flatMap((hour) => line(hour, PAGE_MAX_HOUR_KIND)),
  ]);
}

/** A name as compared for a move: without "(Rescheduled)", its spaces and case aside. */
function nameKey(name: string): string {
  return name
    .replace(/\(\s*rescheduled\s*\)/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Whether two names are one event's (R12): a "(Rescheduled)" mark, spaces and case aside. */
export function sameEventName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** A merge of the kept events with a read (`mergeListed`). */
export interface ListingMerge {
  /** The events kept from now on, in order of their start, then their name. */
  events: ListedEvent[];
  /** The events that moved to a new id (R12). */
  moved: { from: string; to: string }[];
  /** The events dropped before their start, not moved: moved or canceled. */
  dropped: ListedEvent[];
}

/**
 * The kept events merged with a read, by the max events' rules: the read's events in the place of
 * the kept ones of their ids (carrying their `formerIds`); a kept event the read lists without
 * times (R3) kept as it is; one the read no longer lists kept to its end where it has begun, and
 * removed where it has not (`dropped`), unless the read has a new id of the same name
 * (`sameEventName`) and type that no kept event had: then it moved, and the new one carries its
 * ids (`moved`, R12). What has ended is forgotten.
 */
export function mergeListed(
  kept: readonly ListedEvent[],
  listing: FeedListing,
  now: number,
): ListingMerge {
  const keptById = new Map(kept.map((event) => [event.id, event]));
  const readIds = new Set(listing.read.map((event) => event.id));
  const untimed = new Set(listing.untimed);
  const read = listing.read.map((event) => ({
    ...event,
    formerIds: keptById.get(event.id)?.formerIds ?? event.formerIds,
  }));
  const stays: ListedEvent[] = [];
  const moved: ListingMerge['moved'] = [];
  const dropped: ListedEvent[] = [];
  const taken = new Set<string>();
  for (const old of kept) {
    if (readIds.has(old.id) || old.end <= now) continue;
    if (untimed.has(old.id) || old.start <= now) {
      stays.push(old);
      continue;
    }
    const at = read.findIndex(
      (event) =>
        !keptById.has(event.id) &&
        !taken.has(event.id) &&
        event.eventType === old.eventType &&
        sameEventName(event.name, old.name),
    );
    const target = read[at];
    if (target) {
      taken.add(target.id);
      read[at] = { ...target, formerIds: [...old.formerIds, old.id] };
      moved.push({ from: old.id, to: target.id });
      continue;
    }
    dropped.push(old);
  }
  return {
    events: inOrder([...read, ...stays].filter((event) => event.end > now)),
    moved,
    dropped,
  };
}

/**
 * Whether a read is too short to be news of drops (branch review BR-1): it lists no event at all,
 * or it would drop every kept event not yet started (`mergeListed`'s `dropped`), as a feed cut
 * short would. Such a read drops nothing (`mergeRead`). A read that keeps one coming event, or
 * drops only what has begun, is a read.
 */
export function isShortRead(
  kept: readonly ListedEvent[],
  listing: FeedListing,
  now: number,
): boolean {
  if (listing.read.length === 0) return true;
  const coming = kept.filter((event) => event.start > now && event.end > now);
  if (coming.length === 0) return false;
  return mergeListed(kept, listing, now).dropped.length === coming.length;
}

/**
 * The kept events merged with a read (`mergeListed`), and whether the read was a short one
 * (`isShortRead`): a short read is merged all the same, so that its new events, changed times,
 * moves and ends land, but the events it would drop are kept, as those it lists without times
 * are, and nothing is dropped (re-review RR-1).
 */
export function mergeRead(
  kept: readonly ListedEvent[],
  listing: FeedListing,
  now: number,
): ListingMerge & { short: boolean } {
  const merged = mergeListed(kept, listing, now);
  if (!isShortRead(kept, listing, now)) return { ...merged, short: false };
  return {
    events: inOrder([...merged.events, ...merged.dropped]),
    moved: merged.moved,
    dropped: [],
    short: true,
  };
}

/**
 * An event's times as plain local text (ruling A: events run at local time everywhere, so no
 * Discord stamp converted to the reader's zone): a day's event as "Sat, Nov 21, 2–5 PM" ("6 AM–9
 * PM" across noon, "10 AM–midnight" to the day's end); one of several days as "Nov 9 – Nov 13",
 * an end at midnight being the day before's.
 */
export function eventTimeWords(start: number, end: number, zone: string): string {
  const from = zoned(start, zone);
  const to = zoned(end, zone);
  const atMidnight = to.hour === 0 && to.minute === 0 && end > start;
  const lastDay = atMidnight ? addDays(to, -1) : to;
  if (!from.toPlainDate().equals(lastDay.toPlainDate())) {
    return `${shortDateWords(from)} – ${shortDateWords(lastDay)}`;
  }
  const day = `${shortDayWords(from)}, ${shortDateWords(from)}`;
  const first = shortHourWords(from);
  if (atMidnight) return `${day}, ${first.hour} ${first.half}–midnight`;
  const last = shortHourWords(to);
  const hours =
    first.half === last.half
      ? `${first.hour}–${last.hour} ${last.half}`
      : `${first.hour} ${first.half}–${last.hour} ${last.half}`;
  return `${day}, ${hours}`;
}

/** The listing's sections, each in order of its start. */
export interface ListingSections {
  /** On now. */
  now: ListedEvent[];
  /** Starting within seven days. */
  week: ListedEvent[];
  /** Starting later, within `horizonDays`. */
  coming: ListedEvent[];
}

/**
 * The listed events (`isListed`) by section: on now, starting within seven days (by the local
 * calendar, the same hour a week on), starting later within `horizonDays`. What ended is in none.
 */
export function listingSections(
  events: readonly ListedEvent[],
  now: number,
  zone: string,
  horizonDays: number,
): ListingSections {
  const here = zoned(now, zone);
  const weekEnd = addDays(here, WEEK_DAYS).epochMilliseconds;
  const horizon = addDays(here, horizonDays).epochMilliseconds;
  const listed = inOrder(events.filter((event) => isListed(event) && event.end > now));
  return {
    now: listed.filter((event) => event.start <= now),
    week: listed.filter((event) => event.start > now && event.start < weekEnd),
    coming: listed.filter((event) => event.start >= weekEnd && event.start < horizon),
  };
}

/** How many days ahead This week reaches (`listingSections`). */
const WEEK_DAYS = 7;

/**
 * The moments an event's line changes section (branch review BR-9), by the same local calendar as
 * `listingSections`: its start (into Now), its end (out of the listing), a week before its start
 * (into This week) and `horizonDays` before it (into Coming up). The forum's timer is set at the
 * next of them.
 */
export function sectionChangesAt(
  event: Pick<ListedEvent, 'start' | 'end'>,
  horizonDays: number,
  zone: string,
): number[] {
  const start = zoned(event.start, zone);
  return [
    event.start,
    event.end,
    addDays(start, -WEEK_DAYS).epochMilliseconds,
    addDays(start, -horizonDays).epochMilliseconds,
  ];
}

/** When an event's post opens: `postDaysAhead` days before its start, by the local calendar. */
export function postOpensAt(event: Pick<ListedEvent, 'start'>, days: number, zone: string): number {
  return addDays(zoned(event.start, zone), -days).epochMilliseconds;
}
