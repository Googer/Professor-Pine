import { BoundedMap } from '../bounded-map.js';
import { costumedSighting } from '../domain/pogo/costumes.js';
import {
  eventPageTime,
  maxHourHeadings,
  parseEventMaxHours,
  parseEventRaidHours,
  parseEventSpawns,
  raidHourHeadings,
} from '../domain/research/leekduck.js';
import { pagedEventsNear } from '../domain/time/event-pages.js';
import { eventPageMaxHours, type MaxEvent } from '../domain/time/max-events.js';
import { eventPageRaidHours, type RaidEvent } from '../domain/time/raid-events.js';
import {
  isEventPage,
  spawnEventsAt,
  type ListedSpawn,
  type SpawnEvent,
  type SpawnSightingOf,
} from '../domain/time/spawn-events.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import type { GameDataProvider } from './game-data-service.js';
import { readLimitedText } from './limited-json.js';
import type {
  PagedEventProvider,
  SpawnEventProvider,
  StoredEventLists,
} from './raid-event-service.js';
import type { LimitedResponse } from './limited-json.js';
import { PINE_USER_AGENT } from './research-task-service.js';

/** An event page is about 200 KB; anything near this size is no event page. */
export const MAX_EVENT_PAGE_BYTES = 3 * 1024 * 1024;
const HOUR_MS = 3_600_000;
/** How long what was read from an event's page stands before it is read again (design 5). */
export const REREAD_MS = 6 * HOUR_MS;
/**
 * How many events' pages are kept: more than the events of the sixteen days whose pages are read
 * (some 20 on the feed of 2026-10-22) and those on now.
 */
const PAGES_KEPT = 100;
/** How many addresses and events the log remembers having named. */
const TOLD_KEPT = 100;
/**
 * How long the Raid Hours of an event the feed no longer lists are kept after their end: the
 * rule of the weekly Raid Hour needs the whole current week (as `RaidEventService.merged`).
 */
const REMEMBER_MS = 8 * 24 * HOUR_MS;
/**
 * How long after a failed read a page is tried again (review ER-4): 15 minutes, doubled after
 * each failure in a row, at most `REREAD_MS` (15, 30, 60, 120, 240, then 360 minutes).
 */
export const RETRY_FIRST_MS = 15 * 60_000;

/** The wait before the next try of a page after `failures` failed reads in a row. */
function retryWait(failures: number): number {
  return Math.min(RETRY_FIRST_MS * 2 ** Math.min(failures - 1, 20), REREAD_MS);
}

/** What `startAfterFeed` needs of the events feed (`RaidEventService`). */
export interface FeedReads {
  refresh(): Promise<unknown>;
  /** Calls `listener` after each good read of the feed. */
  onRead(listener: () => void): void;
}

/**
 * Starts the pages once the feed has said which events there are (`app.ts`): after the feed's
 * first read, good or failed, and from then on reads what is due after each good read of the
 * feed (review ER-1: after a failed first read, the pages are read as soon as the feed is back,
 * not within the hour). A stopped service reads nothing.
 */
export function startAfterFeed(feed: FeedReads, pages: EventPageService): Promise<void> {
  feed.onRead(() => void pages.refresh());
  return feed.refresh().then(() => pages.start());
}

/** What `/wild` and `/want`'s dialog ask of the spawns of the events on (plan 8R-4). */
export interface EventSpawnProvider {
  /**
   * The Pokémon the events on at `at` list among their spawns, placed in the catalogue, costumed
   * or not (`costumedSpawn` says whether a report is costumed). Empty for an event whose page was
   * never read.
   */
  sightingsAt(at: number, zone: string): SpawnSightingOf;
}

/**
 * A download of an event page: never followed to another address (`redirect: 'error'`, B3); the
 * address it ended at (`url`, a real fetch's) must still be an events page.
 */
export type FetchEventPage = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'error' },
) => Promise<LimitedResponse & { ok: boolean; url?: string }>;

export interface EventPageOptions {
  /**
   * The global events with spawns of the events feed, and its events with a Leek Duck page
   * (`RaidEventService`): in a zone in use, or as kept, in the default zone (`StoredEventLists`,
   * fix round 2, P6).
   */
  events: SpawnEventProvider & PagedEventProvider & StoredEventLists;
  gameData: Pick<GameDataProvider, 'catalogue'>;
  fetch: FetchEventPage;
  log: Logger;
  /**
   * IANA zone of the pages' days: the instance's default (`instanceZone`), in which the feed's
   * lists are kept; a page's hours are wall-clock time, a moment in each server's zone.
   */
  zone: string;
  /**
   * The zones in use (plan 19A-2, `ServerSettings.zonesInUse`): an event's page is read once the
   * event is on in any of them (one at local times begins first in the zones furthest east).
   * Without it the default zone's alone.
   */
  zones?: () => readonly string[];
  /**
   * The weekly Raid Hour of the settings (`raidEvents.weeklyRaidHour`): a page's Raid Hour is at
   * its hour and lasts as long where the page's Raids section gives no one time of its own
   * (`eventPageTime`); 18:00 for an hour when it is null.
   */
  weeklyRaidHour: { hour: number; minutes: number } | null;
  /** How long one page may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  now?: () => number;
  /**
   * Called after a round of reads that changed the pages' Raid Hours or Max Battle hours (the
   * events forum lists them: `RaidEventService.pagesChanged` in `app.ts`). Must not throw.
   */
  onHoursChange?: () => void;
}

/** What one read of an event's page gave. */
interface PageRead {
  url: string;
  readAt: number;
  spawns: ListedSpawn[];
  raidHours: RaidEvent[];
  maxHours: MaxEvent[];
}

/** A page due to be read: whose, where, and the event's span and start for spawns. */
interface PageToRead {
  url: string;
  span: { start: number; end: number };
  /** The start of an event with spawns: a read made before it is made again then. */
  spawnsFrom?: number;
}

/**
 * When to look again at the events: at the next start of an event with spawns, so that its page
 * is read as it begins, and at the latest in an hour (a page due to be read again, an event the
 * feed has added).
 */
export function nextReadIn(events: readonly SpawnEvent[], now: number): number {
  return events.reduce(
    (soonest, event) => (event.start > now ? Math.min(soonest, event.start - now) : soonest),
    HOUR_MS,
  );
}

/** Thrown inside a download that `stop` ended; not worth a warning. */
class ReadStopped extends Error {}

/**
 * What the events' Leek Duck pages say and the feed does not, one download of a page serving all
 * of it, read again every six hours (`REREAD_MS`) and kept in memory by event:
 *
 * - The spawns of the events on now (plan 8R-4, design 5): a community day's and a spotlight
 *   hour's from the feed itself, any other event's from the Spawns section of its page, read
 *   when the event is on (again as it begins, if read before).
 * - The Raid Hours of the Raids section (Matt, 2026-11-07: "Into the Wild"'s are on its page
 *   only), of every event with a page from eight days ago to eight days ahead
 *   (`pagedEventsNear`), so that the week's rule of the weekly Raid Hour knows of them before the
 *   week starts; `raidHours()` gives them to `RaidEventService.events()`.
 * - The Max Battle hours of the Max Battles section (Matt's decision of 2026-10-25), of the same
 *   pages, at the time the section's sentence gives; `maxHours()` gives them to
 *   `RaidEventService.maxEvents()`.
 *
 * Only Leek Duck's events pages are read (F11): another address is skipped and said once. A page
 * that cannot be read keeps what its last good read gave; one never read gives nothing.
 */
export class EventPageService implements EventSpawnProvider {
  private readonly pages = new BoundedMap<string, PageRead>(PAGES_KEPT);
  private readonly told = new BoundedMap<string, true>(TOLD_KEPT);
  /** What was said once per event of its Raid Hours (`<event>:unread`, `<event>:outside`). */
  private readonly hoursTold = new BoundedMap<string, true>(TOLD_KEPT);
  /** The pages whose last reads failed, by event: when, and how many in a row (ER-4). */
  private readonly failures = new BoundedMap<string, { at: number; count: number }>(PAGES_KEPT);
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private controller: AbortController | undefined;
  private inFlight: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  /** Set by `stop`: a `start` after it (a shutdown before the first read) does nothing. */
  private closed = false;

  constructor(private readonly options: EventPageOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  sightingsAt(at: number, zone: string): SpawnSightingOf {
    const { catalogue } = this.options.gameData;
    return spawnEventsAt(this.options.events.spawnEvents(zone), at).flatMap((event) =>
      (event.spawns ?? this.pages.get(event.id)?.spawns ?? []).flatMap((spawn) => {
        const sighting = costumedSighting(catalogue, spawn.name, spawn.image);
        return sighting === undefined ? [] : [sighting];
      }),
    );
  }

  /**
   * The Raid Hours the pages read name (`eventPageRaidHours`), in no order: all of an event the
   * feed still lists; of one it no longer lists, those that have begun and ended less than eight
   * days ago (one not begun was moved or canceled), as `RaidEventService` keeps the feed's.
   */
  raidHours(): RaidEvent[] {
    return this.pagesHours((read) => read.raidHours);
  }

  /**
   * The Max Battle hours the pages read name (`eventPageMaxHours`), in no order, by the rule of
   * `raidHours()`; `RaidEventService.maxEvents()` gives them with the feed's.
   */
  maxHours(): MaxEvent[] {
    return this.pagesHours((read) => read.maxHours);
  }

  /**
   * What `of` gives of each page read: all of an event the feed still lists; of one it no longer
   * lists, those that have begun and ended less than eight days ago (one not begun was moved or
   * canceled), as `RaidEventService` keeps the feed's.
   */
  private pagesHours<T extends { start: number; end: number }>(of: (read: PageRead) => T[]): T[] {
    const { events } = this.options;
    const now = this.now();
    const listed = new Set(
      [...events.storedPagedEvents(), ...events.storedSpawnEvents()].map((event) => event.id),
    );
    return this.pages.keys().flatMap((id) => {
      const read = this.pages.get(id);
      const hours = read === undefined ? [] : of(read);
      return listed.has(id)
        ? hours
        : hours.filter((hour) => hour.start <= now && hour.end > now - REMEMBER_MS);
    });
  }

  /** Reads the pages that are due; nothing once stopped. Never rejects; calls share one run. */
  refresh(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.inFlight ??= this.readAndTell().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Reads the pages that are due, and tells `onHoursChange` when their hours changed. */
  private async readAndTell(): Promise<void> {
    const before = this.hoursKnown();
    await this.readDue();
    if (this.closed || this.hoursKnown() === before) return;
    try {
      this.options.onHoursChange?.();
    } catch (err) {
      this.options.log.error({ err }, 'a listener of the events’ pages failed');
    }
  }

  /**
   * The hours of every page read, as one text to compare (`readAndTell`): by event id, whatever
   * the order of the reads (a page read again becomes the newest), and without the pages that
   * have none (review).
   */
  private hoursKnown(): string {
    return JSON.stringify(
      this.pages
        .keys()
        .sort()
        .flatMap((id) => {
          const read = this.pages.get(id);
          if (read === undefined || read.raidHours.length + read.maxHours.length === 0) return [];
          return [[id, read.raidHours, read.maxHours]];
        }),
    );
  }

  /** Resolves once no read is in flight. Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /** Reads now, then at the next start of an event or within the hour. */
  start(): void {
    if (!this.stopped || this.closed) return;
    this.stopped = false;
    this.tick();
  }

  /** The zones whose events are looked at: the default zone and every zone in use. */
  private zones(): string[] {
    return [...new Set([this.options.zone, ...(this.options.zones?.() ?? [])])];
  }

  /** Cancels the next look and ends a read in flight. */
  stop(): void {
    this.stopped = true;
    this.closed = true;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    void this.refresh().then(() => {
      if (this.stopped) return;
      const now = this.now();
      const wait = Math.min(
        ...this.zones().map((zone) => nextReadIn(this.options.events.spawnEvents(zone), now)),
      );
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.tick();
      }, wait);
      this.timer.unref();
    });
  }

  /**
   * The pages to look at now, by event: those of the events with spawns on now, then those of
   * the events near (`pagedEventsNear`, on now first). Another address than an events page is
   * said once and left out.
   */
  private pagesNow(now: number): Map<string, PageToRead> {
    const { events, log } = this.options;
    const due = new Map<string, PageToRead>();
    // On now in any zone in use (plan 19A-2), each event once, as the default zone has it (its
    // span, from which a page's days are placed, the days of its feed's own times).
    const kept = new Map(events.storedSpawnEvents().map((event) => [event.id, event]));
    // Each event's earliest start among the zones it is on in now (fix round 1, M5): its page,
    // read since then, is not read again at every look until the default zone's start.
    const begun = new Map<string, number>();
    const onNow = new Map(
      this.zones()
        .flatMap((zone) => spawnEventsAt(events.spawnEvents(zone), now))
        .map((event) => {
          begun.set(event.id, Math.min(begun.get(event.id) ?? event.start, event.start));
          return [event.id, kept.get(event.id) ?? event] as const;
        }),
    );
    for (const event of onNow.values()) {
      const { page } = event;
      if (page === undefined || event.spawns !== undefined) continue;
      if (!isEventPage(page)) {
        if (!this.told.has(page)) {
          this.told.set(page, true);
          log.warn(
            { event: event.id, url: page },
            'an event page that is not Leek Duck’s is not read',
          );
        }
        continue;
      }
      due.set(event.id, { url: page, span: event, spawnsFrom: begun.get(event.id) ?? event.start });
    }
    for (const event of pagedEventsNear(events.storedPagedEvents(), now)) {
      if (!due.has(event.id)) due.set(event.id, { url: event.page, span: event });
    }
    return due;
  }

  /**
   * The Raid Hours of a page just read, at the time its Raids section's sentence gives
   * (`eventPageTime`), else the weekly one's; those of the last read where it gives none (review
   * ER-2: a page cut short or changed must not take away Raid Hours already known). Logged.
   */
  private readRaidHours(
    id: string,
    url: string,
    html: string,
    span: PageToRead['span'],
    kept: PageRead | undefined,
  ): RaidEvent[] {
    const { log, zone, weeklyRaidHour } = this.options;
    const read = parseEventRaidHours(html);
    const raidTime = eventPageTime(html, 'raids', read);
    if (raidTime.kind === 'unclear' && read.length > 0) {
      this.tellOnce(`${id}:raid-time`, () =>
        log.warn(
          { event: id, url },
          'the time of an event page’s Raid Hours could not be read; the weekly one’s taken',
        ),
      );
    }
    const time = raidTime.kind === 'time' ? raidTime.time : weeklyRaidHour;
    const placed = eventPageRaidHours(read, span, time, zone, { event: id, link: url });
    const headings = raidHourHeadings(html);
    if (read.length < headings) {
      // The page's shape changed (review ER-3).
      this.tellOnce(`${id}:unread`, () =>
        log.warn(
          { event: id, url, headings, read: read.length },
          'an event page names Raid Hours that could not be read',
        ),
      );
    }
    if (placed.length < read.length) {
      this.tellOnce(`${id}:outside`, () =>
        log.warn(
          { event: id, url, read: read.length, placed: placed.length },
          'Raid Hours of an event page fall outside the event or come twice',
        ),
      );
    }
    const keepOld = placed.length === 0 && (kept?.raidHours.length ?? 0) > 0;
    const raidHours = keepOld ? (kept?.raidHours ?? []) : placed;
    if (keepOld) {
      log.warn(
        { event: id, url, raidHours: raidHours.length },
        'an event page gave no Raid Hours; those of its last read kept',
      );
    } else if (raidHours.length > 0) {
      log.info({ event: id, raidHours: raidHours.length }, 'the Raid Hours of an event page read');
    }
    return raidHours;
  }

  /**
   * The Max Battle hours of a page just read (Matt's decision of 2026-10-25), at the time its Max
   * Battles section's sentence gives (`eventPageTime`); without one (none, or unclear) they are
   * left out, warned of once per event (a wrong hour would end the day's battles early). Those of
   * the last read where it gives none, as the Raid Hours (ER-2), but not where it names hours at
   * an unclear time (review): those of the last read go too. Logged as the Raid Hours are.
   */
  private readMaxHours(
    id: string,
    url: string,
    html: string,
    span: PageToRead['span'],
    kept: PageRead | undefined,
  ): MaxEvent[] {
    const { log, zone } = this.options;
    const read = parseEventMaxHours(html);
    const maxTime = eventPageTime(html, 'max-battles', read);
    if (maxTime.kind !== 'time' && read.length > 0) {
      this.tellOnce(`${id}:max-time`, () =>
        log.warn(
          { event: id, url, read: read.length },
          'the time of an event page’s Max Battle hours could not be read; they are left out',
        ),
      );
    }
    const placed =
      maxTime.kind === 'time'
        ? eventPageMaxHours(read, span, maxTime.time, zone, { event: id, link: url })
        : [];
    const headings = maxHourHeadings(html);
    if (read.length < headings) {
      this.tellOnce(`${id}:max-unread`, () =>
        log.warn(
          { event: id, url, headings, read: read.length },
          'an event page names Max Battle hours that could not be read',
        ),
      );
    }
    if (maxTime.kind === 'time' && placed.length < read.length) {
      this.tellOnce(`${id}:max-outside`, () =>
        log.warn(
          { event: id, url, read: read.length, placed: placed.length },
          'Max Battle hours of an event page fall outside the event or come twice',
        ),
      );
    }
    // A page that names its hours at a time now unclear has them no more (review): only a page
    // that names none keeps those of its last read.
    const unclear = maxTime.kind === 'unclear' && read.length > 0;
    const keepOld = !unclear && placed.length === 0 && (kept?.maxHours.length ?? 0) > 0;
    const maxHours = keepOld ? (kept?.maxHours ?? []) : placed;
    if (keepOld) {
      log.warn(
        { event: id, url, maxHours: maxHours.length },
        'an event page gave no Max Battle hours; those of its last read kept',
      );
    } else if (maxHours.length > 0) {
      log.info(
        { event: id, maxHours: maxHours.length },
        'the Max Battle hours of an event page read',
      );
    }
    return maxHours;
  }

  private async readDue(): Promise<void> {
    const { log } = this.options;
    const now = this.now();
    for (const [id, target] of this.pagesNow(now)) {
      const kept = this.pages.get(id);
      if (!this.isDue(id, target, kept, now)) continue;
      const { url, span, spawnsFrom } = target;
      try {
        const html = await this.download(url);
        this.failures.delete(id);
        const spawns = parseEventSpawns(html);
        const raidHours = this.readRaidHours(id, url, html, span, kept);
        const maxHours = this.readMaxHours(id, url, html, span, kept);
        this.pages.set(id, { url, readAt: now, spawns, raidHours, maxHours });
        if (spawnsFrom !== undefined) {
          log.info({ event: id, spawns: spawns.length }, 'the spawns of an event read');
        }
      } catch (err) {
        if (err instanceof ReadStopped) return;
        const count = (this.failures.get(id)?.count ?? 0) + 1;
        this.failures.set(id, { at: now, count });
        log.warn(
          { err, event: id, retryInMinutes: retryWait(count) / 60_000 },
          'could not read an event page',
        );
      }
    }
  }

  /**
   * Whether a page is to be read now (review ER-4): never again once its event has ended and it
   * was read; after a failed read, once the retry's wait is up (`retryWait`); else when never
   * read, read at another address, read before the start of an event with spawns now on, or read
   * six hours ago (`REREAD_MS`).
   */
  private isDue(id: string, target: PageToRead, kept: PageRead | undefined, now: number): boolean {
    const same = kept !== undefined && kept.url === target.url;
    if (same && target.span.end <= now && target.spawnsFrom === undefined) return false;
    const failed = this.failures.get(id);
    if (failed !== undefined) return now - failed.at >= retryWait(failed.count);
    if (!same) return true;
    if (target.spawnsFrom !== undefined && kept.readAt < target.spawnsFrom) return true;
    return now - kept.readAt >= REREAD_MS;
  }

  /** Logs `say` once per `key` while the bot runs. */
  private tellOnce(key: string, say: () => void): void {
    if (this.hoursTold.has(key)) return;
    this.hoursTold.set(key, true);
    say();
  }

  private async download(url: string): Promise<string> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await this.options.fetch(url, {
        signal: AbortSignal.any([timeout, controller.signal]),
        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
      // Never another page than Leek Duck's events pages (F11, B3).
      if (response.url !== undefined && response.url !== '' && !isEventPage(response.url)) {
        throw new Error(`${url}: ended at an address that is no events page`);
      }
      const body = await readLimitedText(response, MAX_EVENT_PAGE_BYTES);
      if (!body.ok) throw new Error(`${url}: the page is ${body.reason}`);
      return body.text;
    } catch (err) {
      if (controller.signal.aborted) throw new ReadStopped('stopped', { cause: err });
      if (timeout.aborted) {
        throw new Error(`${url}: timed out after ${String(this.timeoutMs)} ms`, { cause: err });
      }
      if (err instanceof Error && err.message.startsWith(url)) throw err;
      throw new Error(`${url}: ${failureReason(err)}`, { cause: err });
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}
