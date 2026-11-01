import { BoundedMap } from '../bounded-map.js';
import { costumedSighting } from '../domain/pogo/costumes.js';
import { parseEventSpawns } from '../domain/research/leekduck.js';
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
import type { SpawnEventProvider } from './raid-event-service.js';
import type { LimitedResponse } from './limited-json.js';
import { PINE_USER_AGENT } from './research-task-service.js';

/** An event page is about 200 KB; anything near this size is no event page. */
export const MAX_EVENT_PAGE_BYTES = 3 * 1024 * 1024;
const HOUR_MS = 3_600_000;
/** How long the spawns read from an event's page stand before it is read again (design 5). */
export const REREAD_MS = 6 * HOUR_MS;
/** How many events' pages are kept: more than are ever on at once. */
const PAGES_KEPT = 50;
/** How many addresses that are not Leek Duck's events pages are remembered as told. */
const TOLD_KEPT = 100;

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

export interface EventSpawnOptions {
  /** The global events with spawns of the events feed (`RaidEventService`). */
  events: SpawnEventProvider;
  gameData: Pick<GameDataProvider, 'catalogue'>;
  fetch: FetchEventPage;
  log: Logger;
  /** How long one page may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  now?: () => number;
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
 * The spawns of the events on now (plan 8R-4, design 5): a community day's and a spotlight hour's
 * from the feed itself, any other event's from the Spawns section of its Leek Duck page, read
 * when the event is on and again every six hours (`REREAD_MS`), kept in memory by event. Only
 * Leek Duck's events pages are read (F11): another address is skipped and said once. A page that
 * cannot be read keeps the spawns of its last good read; one never read gives none.
 */
export class EventSpawnService implements EventSpawnProvider {
  private readonly pages = new BoundedMap<string, { readAt: number; spawns: ListedSpawn[] }>(
    PAGES_KEPT,
  );
  private readonly told = new BoundedMap<string, true>(TOLD_KEPT);
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private controller: AbortController | undefined;
  private inFlight: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  /** Set by `stop`: a `start` after it (a shutdown before the first read) does nothing. */
  private closed = false;

  constructor(private readonly options: EventSpawnOptions) {
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

  /** Reads the pages of the events on now that are due. Never rejects; calls share one run. */
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

  private async readDue(): Promise<void> {
    const { log } = this.options;
    const now = this.now();
    for (const event of spawnEventsAt(this.options.events.spawnEvents(), now)) {
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
      const kept = this.pages.get(event.id);
      if (kept !== undefined && now - kept.readAt < REREAD_MS) continue;
      try {
        const spawns = parseEventSpawns(await this.download(page));
        this.pages.set(event.id, { readAt: now, spawns });
        log.info({ event: event.id, spawns: spawns.length }, 'the spawns of an event read');
      } catch (err) {
        if (err instanceof ReadStopped) return;
        log.warn({ err, event: event.id }, 'could not read the spawns of an event');
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
