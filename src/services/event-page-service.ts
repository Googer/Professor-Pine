import { BoundedMap } from '../bounded-map.js';
import { costumedSighting } from '../domain/pogo/costumes.js';
import {
  namesRaidHours,
  parseEventRaidHours,
  parseEventSpawns,
} from '../domain/research/leekduck.js';
import { pagedEventsNear } from '../domain/time/event-pages.js';
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
import type { PagedEventProvider, SpawnEventProvider } from './raid-event-service.js';
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

/** What `/wild` and `/want`'s dialog ask of the spawns of the events on (plan 8R-4). */
export interface EventSpawnProvider {
  /**
   * The Pokémon the events on at `at` list among their spawns, placed in the catalogue, costumed
   * or not (`costumedSpawn` says whether a report is costumed). Empty for an event whose page was
   * never read.
   */
  sightingsAt(at: number): SpawnSightingOf;
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
   * (`RaidEventService`).
   */
  events: SpawnEventProvider & PagedEventProvider;
  gameData: Pick<GameDataProvider, 'catalogue'>;
  fetch: FetchEventPage;
  log: Logger;
  /** IANA zone of the pages' days (settings.timezone). */
  zone: string;
  /**
   * The weekly Raid Hour of the settings (`raidEvents.weeklyRaidHour`): a page's Raid Hour is at
   * its hour and lasts as long; 18:00 for an hour when it is null.
   */
  weeklyRaidHour: { hour: number; minutes: number } | null;
  /** How long one page may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  now?: () => number;
}

/** What one read of an event's page gave. */
interface PageRead {
  url: string;
  readAt: number;
  spawns: ListedSpawn[];
  raidHours: RaidEvent[];
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
 *
 * Only Leek Duck's events pages are read (F11): another address is skipped and said once. A page
 * that cannot be read keeps what its last good read gave; one never read gives nothing.
 */
export class EventPageService implements EventSpawnProvider {
  private readonly pages = new BoundedMap<string, PageRead>(PAGES_KEPT);
  private readonly told = new BoundedMap<string, true>(TOLD_KEPT);
  /** The events whose page names Raid Hours that could not be read, said once each. */
  private readonly unreadHoursTold = new BoundedMap<string, true>(TOLD_KEPT);
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

  sightingsAt(at: number): SpawnSightingOf {
    const { catalogue } = this.options.gameData;
    return spawnEventsAt(this.options.events.spawnEvents(), at).flatMap((event) =>
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
    const { events } = this.options;
    const now = this.now();
    const listed = new Set(
      [...events.pagedEvents(), ...events.spawnEvents()].map((event) => event.id),
    );
    return this.pages.keys().flatMap((id) => {
      const hours = this.pages.get(id)?.raidHours ?? [];
      return listed.has(id)
        ? hours
        : hours.filter((hour) => hour.start <= now && hour.end > now - REMEMBER_MS);
    });
  }

  /** Reads the pages that are due. Never rejects; calls share one run. */
  refresh(): Promise<void> {
    this.inFlight ??= this.readDue().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
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
      const wait = nextReadIn(this.options.events.spawnEvents(), this.now());
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
    for (const event of spawnEventsAt(events.spawnEvents(), now)) {
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
      due.set(event.id, { url: page, span: event, spawnsFrom: event.start });
    }
    for (const event of pagedEventsNear(events.pagedEvents(), now)) {
      if (!due.has(event.id)) due.set(event.id, { url: event.page, span: event });
    }
    return due;
  }

  private async readDue(): Promise<void> {
    const { log, zone, weeklyRaidHour } = this.options;
    const now = this.now();
    for (const [id, { url, span, spawnsFrom }] of this.pagesNow(now)) {
      const kept = this.pages.get(id);
      if (
        kept !== undefined &&
        kept.url === url &&
        now - kept.readAt < REREAD_MS &&
        (spawnsFrom === undefined || kept.readAt >= spawnsFrom)
      ) {
        continue;
      }
      try {
        const html = await this.download(url);
        const spawns = parseEventSpawns(html);
        const raidHours = eventPageRaidHours(parseEventRaidHours(html), span, weeklyRaidHour, zone);
        this.pages.set(id, { url, readAt: now, spawns, raidHours });
        if (spawnsFrom !== undefined) {
          log.info({ event: id, spawns: spawns.length }, 'the spawns of an event read');
        }
        if (raidHours.length > 0) {
          log.info(
            { event: id, raidHours: raidHours.length },
            'the Raid Hours of an event page read',
          );
        } else if (namesRaidHours(html) && !this.unreadHoursTold.has(id)) {
          // The page's shape changed, or its days fall outside the event.
          this.unreadHoursTold.set(id, true);
          log.warn({ event: id, url }, 'an event page names Raid Hours that could not be read');
        }
      } catch (err) {
        if (err instanceof ReadStopped) return;
        log.warn({ err, event: id }, 'could not read an event page');
      }
    }
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
