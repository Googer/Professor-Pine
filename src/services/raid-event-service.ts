import {
  parseBigEventFeed,
  parseMaxEventFeed,
  type BigEvent,
  type MaxEvent,
  type ParsedMaxEvents,
} from '../domain/time/max-events.js';
import {
  parseRaidEventFeed,
  withPageRaidHours,
  type RaidEvent,
} from '../domain/time/raid-events.js';
import { parsePagedEventFeed, type PagedEvent } from '../domain/time/event-pages.js';
import { mergeRead, readListedEvents, type ListedEvent } from '../domain/time/event-listing.js';
import {
  feedHasResearchFlags,
  isResearchEventKind,
  parseResearchEventFeed,
  unreadResearchTypes,
  type ResearchEvent,
} from '../domain/time/research-events.js';
import { BoundedMap } from '../bounded-map.js';
import { editionsWithoutGlobal } from '../domain/time/event-reach.js';
import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-events.js';
import { isoDate } from '../domain/time/zoned.js';
import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
import type { ListedEventStorage } from '../db/repositories/listed-event-repository.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { failureReason } from './failure-reason.js';
import { readLimitedText, type LimitedResponse, type LimitedText } from './limited-json.js';
import { fetchOnItsHost } from './same-host-fetch.js';

/** The feed is about 60,000 bytes; anything near this size is not the feed. */
const MAX_FEED_BYTES = 5_000_000;
const MINUTE_MS = 60_000;
/** How long a research event is kept after its end (a report's period outlives none of it). */
const RESEARCH_KEPT_MS = 30 * 24 * 60 * MINUTE_MS;
/** How long an event the feed no longer lists is still remembered, counted from its end. */
const REMEMBER_MS = 8 * 24 * 60 * MINUTE_MS;
/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** How many unread research types the log remembers having named (the feed has some 15 types). */
const UNREAD_TYPES_TOLD_MAX = 100;
/** How many events without `global` the log remembers having named (a few such events a year). */
const WITHOUT_GLOBAL_TOLD_MAX = 100;
/** How many event types the events forum does not know the log remembers having named. */
const UNKNOWN_KINDS_TOLD_MAX = 100;

/** One max event by its feed id, whatever the feed renamed or moved; else by kind, name, start. */
function sameMaxEvent(a: MaxEvent, b: MaxEvent): boolean {
  return a.id !== undefined && b.id !== undefined
    ? a.id === b.id
    : a.kind === b.kind && a.name === b.name && a.start === b.start;
}

/** Events in order of their start, then their name. */
function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/** Thrown inside a download that `stop` ended; not worth a warning. */
class RefreshStopped extends Error {}

/** The part of `fetch` this service needs: `fetchOnItsHost` decides where a redirect goes. */
export type FetchEvents = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'manual' },
) => Promise<LimitedResponse & { ok: boolean }>;

export interface RaidEventOptions {
  /** Address of the events feed. */
  url: string;
  /** How often the feed is read. */
  refreshMs: number;
  /** IANA zone in which the feed's local times are read (settings.timezone). */
  zone: string;
  fetch: FetchEvents;
  log: Logger;
  /** How long one download may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
  retryMs?: number;
  /** The clock, in epoch milliseconds. Default `Date.now`. */
  now?: () => number;
  /**
   * Where the events with field research of their own are kept (plan 8R-1; design 9.2), as
   * last seen: a restart, or an event dropped from the feed once it ended, loses no period.
   * Without it they are kept in memory only.
   */
  research?: ResearchEventStorage;
  /**
   * Where the max events and the big events are kept as last merged (plan 8X-F), so that a
   * restart after the feed dropped one keeps it as a read would have. Without it they are kept
   * in memory only.
   */
  maxEvents?: MaxEventStorage;
  /**
   * Where the events forum's listed events are kept as last merged (plan 8V-1), so that the
   * listing survives a restart and a feed that fails. Without it they are kept in memory only.
   */
  listed?: ListedEventStorage;
  /**
   * The Raid Hours the events' Leek Duck pages name (`EventPageService.raidHours`), given with
   * the feed's by `events()` (`withPageRaidHours`). Without it only the feed's.
   */
  pageRaidHours?: () => readonly RaidEvent[];
}

/** What handlers need: the Raid Hours and Raid Days known from the feed. */
export interface RaidEventProvider {
  /**
   * In order of time: the feed's, with the Raid Hours of the events' pages
   * (`withPageRaidHours`: a page's at the start of one of the feed's left out). Empty until
   * either was read.
   */
  events(): readonly RaidEvent[];
}

/**
 * The events with a Leek Duck page (`parsePagedEventFeed`) of the last good read, whose pages
 * `EventPageService` reads for their Raid Hours.
 */
export interface PagedEventProvider {
  /** In order of their start; empty until the feed was read once. */
  pagedEvents(): readonly PagedEvent[];
}

/**
 * The max events of the same feed (plan 8X-2): Max Mondays and Max Battle Days and Weekends, kept
 * apart from the raid events, for the featured boss of the max boss list (`featuredAt`) and a max
 * battle's default end (`maxEventAt`, plan 8X-3).
 */
export interface MaxEventProvider {
  /** In order of their start; empty until the feed was read once. */
  maxEvents(): readonly MaxEvent[];
  /**
   * The big events with Gigantamax battles all day (plan 8X-3: Wild Area, GO Tour, GO Fest; the
   * editions for everyone, at local times), of the last good read with those on now that the feed has dropped since
   * (`mergedBig`), in order of their start: a max battle's default end.
   */
  bigEvents(): readonly BigEvent[];
}

/**
 * The events with field research of their own (plan 8R-1): the research periods are worked out
 * from them (`periodAt`).
 */
export interface ResearchEventProvider {
  /** Those kept and those read since, in order of their start; empty until either. */
  researchEvents(): readonly ResearchEvent[];
  /**
   * Calls `listener` whenever the research events change (a read, the kept ones loaded): the
   * posts' timer and their periods follow (review A5). A listener must not throw.
   */
  onResearchChange?(listener: () => void): void;
}

/**
 * The global events with spawns (plan 8R-4, design 5): a spawn report is costumed where one on
 * now lists it costumed (`EventPageService`).
 */
export interface SpawnEventProvider {
  /** Those of the last good read, with those on now that the feed has dropped since. */
  spawnEvents(): readonly SpawnEvent[];
}

/**
 * The events of the events forum (plan 8V-1): those listed (`isListed`) of the last good read
 * merged with those kept (`mergeListed`), from the same read as the raid and max events (R4).
 */
export interface ListedEventProvider {
  /** In order of their start; empty until the feed was read or the kept ones loaded. */
  listedEvents(): readonly ListedEvent[];
  /**
   * Calls `listener` after each good read and after the kept ones are loaded, changed or not:
   * the forum draws after each read (an unchanged message is not edited). Must not throw.
   */
  onListedChange(listener: () => void): void;
  /**
   * Whether the listing is known (review V1): the kept events were loaded, or a read succeeded.
   * Until then an empty or stale listing says nothing of what was dropped, and the forum neither
   * drops nor makes a post.
   */
  listingKnown(): boolean;
  /**
   * The ids of the events a read dropped before their start (`mergeListed`'s `dropped`), each
   * until that start (review V1): only those are said to be dropped in their post. Not kept
   * across a restart.
   */
  droppedIds(): ReadonlySet<string>;
}

export type RefreshResult =
  | { status: 'updated'; events: number }
  /** The feed could not be read or was not valid; the events in use are unchanged. */
  | { status: 'failed'; reason: string };

/**
 * Keeps the Raid Hours and Raid Days of the events feed in memory. They are not stored: after a
 * restart the weekly Raid Hour of the settings applies until the first download succeeds, which
 * `start` attempts at once (an event the feed dropped before the restart is lost: a follow-up of
 * plan 8X-F). A feed that cannot be read never fails anything: the events of the last good read
 * stay in use. The feed may drop an event once it is over, but the rule for the weekly Raid Hour
 * needs the whole current week, so an event that has begun and ended less than eight days ago is
 * kept after a read that no longer lists it. One that has not begun yet and is no longer listed
 * was moved or cancelled, and is dropped. The max events and the big events are merged by the
 * same rules and kept in the database (`maxEvents`, plan 8X-F; loaded by `loadMax`), as are the
 * events with field research (`research`, `loadResearch`). The events with spawns (plan 8R-4)
 * are kept in memory only, from the same read as the research events.
 */
export class RaidEventService
  implements
    RaidEventProvider,
    MaxEventProvider,
    ResearchEventProvider,
    SpawnEventProvider,
    ListedEventProvider,
    PagedEventProvider
{
  private current: readonly RaidEvent[] = [];
  private research: readonly ResearchEvent[] = [];
  private readonly researchListeners: (() => void)[] = [];
  /** Told after each good read (`onRead`). */
  private readonly readListeners: (() => void)[] = [];
  /** Whether the log has said that the feed lacks the research flags (once until they return). */
  private researchFlagsMissingTold = false;
  /** The event types with research the log has said are not read (`tellOfUnreadTypes`). */
  private readonly unreadTypesTold = new BoundedMap<string, true>(UNREAD_TYPES_TOLD_MAX);
  /** The events without `global` the log has said are read (`tellOfEditionsWithoutGlobal`). */
  private readonly withoutGlobalTold = new BoundedMap<string, true>(WITHOUT_GLOBAL_TOLD_MAX);
  private currentMax: readonly MaxEvent[] = [];
  private currentBig: readonly BigEvent[] = [];
  private currentSpawns: readonly SpawnEvent[] = [];
  private currentPaged: readonly PagedEvent[] = [];
  private currentListed: readonly ListedEvent[] = [];
  private readonly listedListeners: (() => void)[] = [];
  /** Whether the listing is known (`listingKnown`). */
  private listedKnown = false;
  /** The events dropped before their start, by id (`droppedIds`). */
  private readonly dropped = new Map<string, ListedEvent>();
  /** The event types the events forum does not know that the log has named (once each). */
  private readonly unknownKindsTold = new BoundedMap<string, true>(UNKNOWN_KINDS_TOLD_MAX);
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private controller: AbortController | undefined;
  private inFlight: Promise<RefreshResult> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  /** Whether the last read failed (not for a stop): the catch-up reads it again. */
  private owed = false;

  constructor(private readonly options: RaidEventOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = Math.min(options.retryMs ?? 15 * MINUTE_MS, options.refreshMs);
  }

  events(): readonly RaidEvent[] {
    return withPageRaidHours(this.current, this.options.pageRaidHours?.() ?? []);
  }

  pagedEvents(): readonly PagedEvent[] {
    return this.currentPaged;
  }

  /**
   * The max events of the last good read, with those of the last eight days the feed has dropped
   * since (`mergedMax`), in order of their start.
   */
  maxEvents(): readonly MaxEvent[] {
    return this.currentMax;
  }

  bigEvents(): readonly BigEvent[] {
    return this.currentBig;
  }

  researchEvents(): readonly ResearchEvent[] {
    return this.research;
  }

  spawnEvents(): readonly SpawnEvent[] {
    return this.currentSpawns;
  }

  onResearchChange(listener: () => void): void {
    this.researchListeners.push(listener);
  }

  listedEvents(): readonly ListedEvent[] {
    return this.currentListed;
  }

  onListedChange(listener: () => void): void {
    this.listedListeners.push(listener);
  }

  listingKnown(): boolean {
    return this.listedKnown;
  }

  droppedIds(): ReadonlySet<string> {
    const now = (this.options.now ?? Date.now)();
    for (const [id, event] of this.dropped) {
      if (event.start <= now) this.dropped.delete(id);
    }
    return new Set(this.dropped.keys());
  }

  /**
   * Takes the listed events kept by the last run (plan 8V-1; no network), before the first read,
   * as `loadMax`: it must stay before `start()` in `app.ts`, or a read would merge without them.
   * An event a read has given meanwhile stays as read; what cannot be read is logged, and the
   * service starts without them. The listeners are told.
   */
  async loadListed(): Promise<void> {
    let kept: ListedEvent[] | undefined;
    try {
      kept = await this.options.listed?.all();
    } catch (err) {
      this.safely(() => this.options.log.warn({ err }, 'could not read the kept listed events'));
      return;
    }
    if (!kept) return;
    this.listedKnown = true;
    const read = new Set(this.currentListed.map((event) => event.id));
    this.currentListed = inOrder([
      ...kept.filter((old) => !read.has(old.id)),
      ...this.currentListed,
    ]);
    const events = kept.length;
    this.safely(() => this.options.log.info({ events }, 'listed events loaded'));
    this.tellListed();
  }

  /** Tells the listeners of the listed events; one that throws is logged. */
  private tellListed(): void {
    for (const listener of this.listedListeners) {
      try {
        listener();
      } catch (err) {
        this.safely(() =>
          this.options.log.error({ err }, 'a listener of the listed events failed'),
        );
      }
    }
  }

  /**
   * The listed events of a read (plan 8V-1): read from the same document, the max and big events
   * as just parsed (R4), merged with those known (`mergeListed`), kept in the database; a move
   * and a drop before the start said, a kind not known said once at warn. What fails here is
   * logged; the raid events of the read stand.
   */
  private async keepListed(json: unknown, max: readonly MaxEvent[], big: readonly BigEvent[]) {
    const { log, zone, listed } = this.options;
    try {
      const listing = readListedEvents(json, zone, { max, big });
      for (const { eventType, id } of listing.unknownKinds) {
        if (this.unknownKindsTold.has(eventType)) continue;
        this.unknownKindsTold.set(eventType, true);
        this.safely(() =>
          log.warn({ eventType, event: id }, 'an event type the events forum does not know'),
        );
      }
      const now = (this.options.now ?? Date.now)();
      // A short or empty read (BR-1) drops nothing; what it brings still lands (RR-1).
      const merged = mergeRead(this.currentListed, listing, now);
      if (merged.short) {
        const counts = { read: listing.read.length, kept: this.currentListed.length };
        this.safely(() => log.warn(counts, 'a short read of the events feed; the listing kept'));
      }
      this.currentListed = merged.events;
      // A short read alone does not make the listing known (V1): it may say nothing at all.
      if (!merged.short) this.listedKnown = true;
      for (const event of merged.dropped) this.dropped.set(event.id, event);
      // An id listed again is no longer dropped.
      for (const event of merged.events) this.dropped.delete(event.id);
      for (const { from, to } of merged.moved) {
        this.safely(() => log.info({ from, to }, 'a listed event moved to a new id'));
      }
      for (const { id } of merged.dropped) {
        this.safely(() => log.info({ event: id }, 'a listed event was dropped before its start'));
      }
    } catch (err) {
      this.safely(() => log.warn({ err }, 'could not read the listed events of the feed'));
      return;
    }
    try {
      await listed?.replace(this.currentListed);
    } catch (err) {
      this.safely(() => log.warn({ err }, 'could not keep the listed events of the feed'));
    }
  }

  /**
   * Takes the max events and the big events kept by the last run (plan 8X-F; no network), before
   * the first read: the week's featured boss and a max battle's default end come from them until
   * then. An event a read has given meanwhile stays as read. One that cannot be read is logged,
   * and the service starts without them, as before 8X-F. It must stay before `start()` in
   * `app.ts` (review r0, X5-6): a read that came first would merge without the kept events and
   * replace them in the database, so an event the feed dropped would be lost after all.
   */
  async loadMax(): Promise<void> {
    let kept: KeptMaxEvents | undefined;
    try {
      kept = await this.options.maxEvents?.all();
    } catch (err) {
      this.safely(() => this.options.log.warn({ err }, 'could not read the kept max events'));
      return;
    }
    if (!kept) return;
    const read = this.currentMax;
    this.currentMax = inOrder([
      ...kept.max.filter((old) => !read.some((event) => sameMaxEvent(event, old))),
      ...read,
    ]);
    const readBig = this.currentBig;
    this.currentBig = inOrder([
      ...kept.big.filter((old) => !readBig.some((event) => event.id === old.id)),
      ...readBig,
    ]);
    const counts = { max: kept.max.length, big: kept.big.length };
    this.safely(() => this.options.log.info(counts, 'max events loaded'));
  }

  /**
   * Keeps the max events and the big events as merged now (`maxEvents`). What fails is logged:
   * the events of the read stand.
   */
  private async keepMax(): Promise<void> {
    try {
      await this.options.maxEvents?.replace({
        max: [...this.currentMax],
        big: [...this.currentBig],
      });
    } catch (err) {
      this.safely(() =>
        this.options.log.warn({ err }, 'could not keep the max events of the feed'),
      );
    }
  }

  /**
   * Takes the research events kept by the last run (no network), those of a kind that can be one
   * only (`isResearchEventKind`, plan 8R-7, review R1): a row kept before the fix may be a City
   * Safari, which would cut the day's research until it ends. Such a row stays stored, unused,
   * until `removeEnded` forgets it a month after its end; what a read keeps is read by the same
   * rule (`parseResearchEventFeed`).
   */
  async loadResearch(): Promise<void> {
    const kept = await this.options.research?.all();
    if (kept) this.useResearch(this.withSeen(kept.filter(isResearchEventKind), this.research));
  }

  /** Makes `events` the research events, and tells the listeners when they differ. */
  private useResearch(events: readonly ResearchEvent[]): void {
    const changed = JSON.stringify(events) !== JSON.stringify(this.research);
    this.research = events;
    if (!changed) return;
    for (const listener of this.researchListeners) {
      try {
        listener();
      } catch (err) {
        this.safely(() =>
          this.options.log.error({ err }, 'a listener of the research events failed'),
        );
      }
    }
  }

  /** `kept` with `seen` in the place of the same events, in order of their start. */
  private withSeen(
    kept: readonly ResearchEvent[],
    seen: readonly ResearchEvent[],
  ): ResearchEvent[] {
    const ids = new Set(seen.map((event) => event.id));
    return [...kept.filter((event) => !ids.has(event.id)), ...seen].sort(
      (a, b) => a.start - b.start || a.id.localeCompare(b.id),
    );
  }

  /**
   * Reads the feed. Never rejects. Calls made while one is running share its result.
   */
  refresh(): Promise<RefreshResult> {
    this.inFlight ??= this.refreshOnce()
      .then((result) => {
        this.owed = result.status === 'failed' && result.reason !== 'stopped';
        return result;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  /** Resolves once no download is in flight (at once when none is). Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /** Reads the feed now and again every `refreshMs`. Calling it again changes nothing. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last read
   * failed, the feed is read now instead of at the retry, through `refresh`'s guard (a read the
   * timer started meanwhile is waited for first, and decides), and the next read scheduled
   * from this one; else nothing is owed and nothing is asked. Never rejects.
   */
  async catchUp(): Promise<CatchUpOutcome> {
    if (this.stopped) return 'not-owed';
    await this.whenIdle();
    if (!this.owed) return 'not-owed';
    // The scheduled read is this one: cleared, then set again from it.
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const result = await this.refresh();
    const failed = result.status === 'failed';
    if (!this.stopped && !this.timer) {
      this.schedule(failed ? this.retryMs : this.options.refreshMs);
    }
    return failed ? 'failed' : 'done';
  }

  /** Cancels the scheduled download and ends one in flight. */
  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.refresh().then((result) => {
          if (this.stopped) return;
          this.schedule(result.status === 'failed' ? this.retryMs : this.options.refreshMs);
        });
      },
      Math.min(delayMs, MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  private async refreshOnce(): Promise<RefreshResult> {
    const { log } = this.options;
    try {
      const read = await this.readFeed();
      this.current = this.merged(read.raid);
      this.currentPaged = read.paged;
      this.currentMax = this.mergedMax(read.max.events);
      this.currentBig = this.mergedBig(read.big);
      this.tellOfEditionsWithoutGlobal(read.json, read.big);
      await this.keepMax();
      // The max and big events as merged (review V10, ruling R5): one path for their times.
      await this.keepListed(read.json, this.currentMax, this.currentBig);
      this.tellOfHours(read.max);
      await this.keepResearch(read.json);
    } catch (err) {
      if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
      const reason = err instanceof Error ? err.message : String(err);
      this.safely(() => log.warn({ err }, 'could not read the events feed'));
      return { status: 'failed', reason };
    }
    const events = this.current.length;
    const counts = { events, max: this.currentMax.length, big: this.currentBig.length };
    this.safely(() => log.info(counts, 'raid events read'));
    // After the read, so that a listener reads the listing of this very read.
    this.tellListed();
    for (const listener of this.readListeners) {
      try {
        listener();
      } catch (err) {
        this.safely(() => log.error({ err }, 'a listener of the reads failed'));
      }
    }
    return { status: 'updated', events };
  }

  /**
   * Calls `listener` after each good read of the feed (the catch-up's too), never after a failed
   * one: the events' pages are read then (`startAfterFeed`, review ER-1). Must not throw.
   */
  onRead(listener: () => void): void {
    this.readListeners.push(listener);
  }

  /** The events just read, plus the recent ones known before that the feed no longer lists. */
  private merged(read: RaidEvent[]): RaidEvent[] {
    const now = (this.options.now ?? Date.now)();
    const same = (a: RaidEvent, b: RaidEvent): boolean =>
      a.kind === b.kind && a.start === b.start && a.end === b.end;
    // One that has not begun and is no longer listed was moved or cancelled: it goes.
    const dropped = this.current.filter(
      (old) =>
        old.start <= now && old.end > now - REMEMBER_MS && !read.some((event) => same(event, old)),
    );
    return [...read, ...dropped].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
  }

  /**
   * The max events just read, plus those known before that the feed no longer lists but that have
   * begun and started less than eight days ago: ScrapedDuck, once an event is over, drops it or
   * lists it without hours (then its hours are assumed, `parseMaxEventFeed`: the feed of
   * 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end), and a Max Monday's
   * boss is featured for its whole week (`featuredAt`). One that has not begun and is no longer
   * listed was moved or cancelled: it goes. Kept in the database (`keepMax`, plan 8X-F: the
   * staging of 8X lost the week's boss to a restart after the feed dropped its Monday), so the
   * events known before are also those of the last run (`loadMax`).
   */
  private mergedMax(read: readonly MaxEvent[]): MaxEvent[] {
    const now = (this.options.now ?? Date.now)();
    const dropped = this.currentMax.filter(
      (old) =>
        old.start <= now &&
        old.start > now - REMEMBER_MS &&
        !read.some((event) => sameMaxEvent(event, old)),
    );
    return inOrder([...read, ...dropped]);
  }

  /**
   * The big events just read, plus those known before that have begun and not ended, which the
   * feed no longer lists (review A of 8X-3: as `mergedMax`, by the feed's id): a Wild Area dropped
   * on its second day is still on. One that has not begun and is no longer listed was moved or
   * cancelled, and one that is over is of no use: they go. Kept in the database with the max
   * events (`keepMax`, plan 8X-F).
   */
  private mergedBig(read: readonly BigEvent[]): BigEvent[] {
    const now = (this.options.now ?? Date.now)();
    const kept = this.currentBig.filter(
      (old) => old.start <= now && now < old.end && !read.some((event) => event.id === old.id),
    );
    return inOrder([...read, ...kept]);
  }

  /**
   * Each read: the max events whose hours were assumed, as information, and those without hours
   * that feature nothing although their date is today or later, as a warning, so that a feed
   * that drops the hours of coming events is noticed.
   */
  private tellOfHours(max: ParsedMaxEvents): void {
    const { log, zone } = this.options;
    if (max.assumed.length > 0) {
      this.safely(() => log.info({ events: max.assumed }, 'max event hours assumed'));
    }
    const today = isoDate((this.options.now ?? Date.now)(), zone);
    const coming = max.unhoured
      .filter((event) => event.date !== undefined && event.date >= today)
      .map((event) => event.name);
    if (coming.length > 0) {
      this.safely(() => log.warn({ events: coming }, 'max events without hours feature nothing'));
    }
  }

  /**
   * Warns of each event type with field research that the research events leave out
   * (`unreadResearchTypes`, plan 8R-7; Matt's R2), once per type while the bot runs, so that a type
   * new to the feed is noticed and can be judged.
   */
  private tellOfUnreadTypes(json: unknown): void {
    for (const { eventType, id } of unreadResearchTypes(json)) {
      if (this.unreadTypesTold.has(eventType)) continue;
      this.unreadTypesTold.set(eventType, true);
      this.safely(() =>
        this.options.log.warn(
          { eventType, event: id },
          'an event type with field research is not read',
        ),
      );
    }
  }

  /**
   * Says once per event, while the bot runs, that a reader took a Wild Area, GO Tour or GO Fest
   * whose id and name both say no `global` (`editionsWithoutGlobal` of the document, kept to the
   * ids of `taken`): since Matt's rule of 2026-10-24 (review W1 of 8R-7) local times are enough
   * for those types, so a city edition that ever comes at local times would be read as everyone's,
   * and the log shows it. Information: such an event is mostly everyone's (GO Fest 2025's Max
   * Finale).
   */
  private tellOfEditionsWithoutGlobal(json: unknown, taken: readonly { id: string }[]): void {
    const ids = new Set(taken.map((event) => event.id));
    for (const { eventType, id, name } of editionsWithoutGlobal(json)) {
      if (!ids.has(id) || this.withoutGlobalTold.has(id)) continue;
      this.withoutGlobalTold.set(id, true);
      this.safely(() =>
        this.options.log.info(
          { eventType, event: id, name },
          'a Wild Area, GO Tour or GO Fest without global in its name is read',
        ),
      );
    }
  }

  /**
   * The events with field research of a read (plan 8R-1): kept as seen (`saveSeen`), the kept
   * ones ended a month ago forgotten, one not begun that the read no longer lists dropped (moved
   * or cancelled, as the raid events': review A4); the listeners told of a change. A feed
   * without the flags (`events.min.json` may lose them) is read once more as `events.json`; a
   * read that still has none keeps what is stored as it is (review R1). What fails here is
   * logged; the raid events of the read stand.
   */
  private async keepResearch(json: unknown): Promise<void> {
    const { log, url, zone, research } = this.options;
    try {
      let flagged = json;
      if (!feedHasResearchFlags(json) && url.endsWith('events.min.json')) {
        flagged = await this.download(url.replace(/events\.min\.json$/, 'events.json'));
      }
      // A read without the flags says nothing of research (review R1): what is stored stays as
      // it is, nothing is saved or dropped, and the log says so once until the flags come back.
      if (!feedHasResearchFlags(flagged)) {
        if (!this.researchFlagsMissingTold) {
          this.researchFlagsMissingTold = true;
          this.safely(() => log.warn('the events feed has no research flags; kept'));
        }
        return;
      }
      this.researchFlagsMissingTold = false;
      // The events with spawns (plan 8R-4) need the same flags; kept before the database's part.
      this.currentSpawns = this.mergedSpawns(parseSpawnEventFeed(flagged, zone));
      const seen = parseResearchEventFeed(flagged, zone);
      this.tellOfUnreadTypes(flagged);
      this.tellOfEditionsWithoutGlobal(flagged, [...seen, ...this.currentSpawns]);
      const now = (this.options.now ?? Date.now)();
      const listed = new Set(seen.map((event) => event.id));
      await research?.saveSeen(seen, now);
      await research?.removeEnded(now - RESEARCH_KEPT_MS);
      await research?.removeNotSeen([...listed], now);
      this.useResearch(
        this.withSeen(this.research, seen).filter(
          (event) =>
            event.end >= now - RESEARCH_KEPT_MS && (event.start <= now || listed.has(event.id)),
        ),
      );
    } catch (err) {
      if (err instanceof RefreshStopped) throw err;
      this.safely(() => log.warn({ err }, 'could not keep the research events of the feed'));
    }
  }

  /**
   * The events with spawns just read, plus those on now that the read no longer lists (as
   * `mergedBig`): one not begun and no longer listed was moved or cancelled, one over is of no
   * use.
   */
  private mergedSpawns(read: readonly SpawnEvent[]): SpawnEvent[] {
    const now = (this.options.now ?? Date.now)();
    const kept = this.currentSpawns.filter(
      (old) => old.start <= now && now < old.end && !read.some((event) => event.id === old.id),
    );
    return [...read, ...kept].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  }

  private async readFeed(): Promise<{
    raid: RaidEvent[];
    max: ParsedMaxEvents;
    big: BigEvent[];
    paged: PagedEvent[];
    json: unknown;
  }> {
    const json = await this.download(this.options.url);
    return {
      raid: parseRaidEventFeed(json, this.options.zone),
      max: parseMaxEventFeed(json, this.options.zone),
      big: parseBigEventFeed(json, this.options.zone),
      paged: parsePagedEventFeed(json, this.options.zone),
      json,
    };
  }

  /** One address of the feed, read and parsed as JSON. */
  private async download(url: string): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    this.controller = controller;
    let status: number;
    let read: LimitedText | undefined;
    try {
      const response = await fetchOnItsHost(this.options.fetch, url, {
        signal: AbortSignal.any([timeout, controller.signal]),
        headers: { Accept: 'application/json' },
        redirect: 'manual',
      });
      status = response.status;
      if (response.ok) read = await readLimitedText(response, MAX_FEED_BYTES);
    } catch (err) {
      if (controller.signal.aborted) throw new RefreshStopped('stopped', { cause: err });
      const reason = timeout.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
      throw new Error(`${url}: ${reason}`, { cause: err });
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
    if (status < 200 || status > 299) throw new Error(`${url} answered ${status}`);
    if (read?.ok === false && read.reason === 'too-large') {
      throw new Error(
        `${url} sent more than ${MAX_FEED_BYTES} bytes, which is not the events feed`,
      );
    }
    if (!read?.ok) throw new Error(`${url} did not send JSON`);
    try {
      return JSON.parse(read.text) as unknown;
    } catch {
      throw new Error(`${url} did not send JSON`);
    }
  }

  /** A broken logger must not turn a finished download into a rejected one. */
  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Nothing useful can be done about a logger that throws.
    }
  }
}
