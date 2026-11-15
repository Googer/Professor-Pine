import { BoundedMap } from '../bounded-map.js';
import type { BossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { diffBossesIn, type SeenChange } from '../domain/pogo/boss-diff.js';
import type { FeedBoss, ParsedFeed } from '../domain/pogo/raid-boss-feed.js';
import {
  diffFeedIn,
  replacesOverrideIn,
  type Boss,
  type BossFamilyOps,
  type BossListChange,
  type BossOverride,
  type NewBossOverride,
} from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { failureReason } from './failure-reason.js';
import type { GameDataProvider } from './game-data-service.js';
import { readLimitedText, type LimitedResponse } from './limited-json.js';
import { fetchOnItsHost } from './same-host-fetch.js';

/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;
const MINUTE_MS = 60_000;
/** Consecutive failed attempts that are followed by a quick retry. */
const QUICK_RETRIES = 3;
/** A list shorter than this is not judged for shrinking: a few bosses come and go each week. */
export const SHRINK_FLOOR = 4;
/** How long after a source's next change the list is read again. */
export const AFTER_CHANGE_MS = 5_000;
/** How many zones' lists are kept worked out (`bosses`): far more than the zones in use. */
const ZONES_KEPT = 100;

/**
 * What one family of bosses is to the service that keeps its list (plan 8X-2): the raid bosses of
 * ScrapedDuck's feed (`RaidBossService`) and the max bosses of Pokebattler's (`MaxBossService`).
 * The reading, storing, scheduling, retrying, overrides and warnings are the same for both.
 */
export interface BossFeedFamily<T> {
  /** What the log lines and errors call one of its bosses: `raid boss`, `max boss`. */
  readonly noun: string;
  /** A document longer than this is not the feed. */
  readonly maxFeedChars: number;
  readonly ops: BossFamilyOps<T>;
  /** Reads a downloaded document; throws when it is not the feed. */
  parse(json: unknown, catalogue: PokemonCatalogue, now: number): ParsedFeed<T>;
  /** The list in effect at `now` from the stored feed and the overrides. */
  effective(
    feed: readonly StoredBoss<T>[],
    overrides: readonly BossOverride<T>[],
    catalogue: PokemonCatalogue,
    now: number,
  ): Boss<T>[];
  /**
   * Whether `effective` reads the clock only for which overrides have run out, so that its list can
   * be kept (`bosses`): a raid's. Not a max battle's, whose rows are offered from their own day.
   */
  readonly lastsUntilOverridesEnd?: boolean;
  /** What is wrong with an override staff asked for; undefined when it can be stored. */
  overrideProblem(override: NewBossOverride<T>, now: number): string | undefined;
  /**
   * The feed's rows as they are in `zone` (plan 19A-2: an upcoming max boss from the start of its
   * day there); none: the rows are the same in every zone.
   */
  inZone?(feed: readonly StoredBoss<T>[], zone: string): readonly StoredBoss<T>[];
}

/**
 * What a download of the feed gave: a 304 for the list stored, or the bosses of a valid feed with
 * its validators and the catalogue it was read with.
 */
type FeedRead<T> =
  | { notModified: true }
  | {
      notModified: false;
      bosses: FeedBoss<T>[];
      /** The bosses of the other zones whose list differs (`SourceRead.byZone`), parsed. */
      byZone?: ReadonlyMap<string, FeedBoss<T>[]>;
      /**
       * The other zones whose own list could not be read (`SourceRead.unreadZones`), or whose
       * document does not parse (fix round 3, Q3).
       */
      unreadZones?: ReadonlySet<string>;
      validators: { etag?: string; lastModified?: string };
      catalogue: PokemonCatalogue;
    };

/**
 * Whether a source's failure may pass by itself: no answer in time, none at all, or a server
 * error (5xx). A 404, a body that is not the document or no boss is structural.
 */
function isPassing(cause: unknown): cause is FeedFailure {
  if (!(cause instanceof FeedFailure)) return false;
  if (cause.kind === 'timeout' || cause.kind === 'unreachable') return true;
  return cause.kind === 'status' && (cause.httpStatus ?? 0) >= 500;
}

/** Thrown inside a sync that `stop` ended; never leaves the service. */
class SyncStopped extends Error {}

/**
 * Why a read of the feed failed, for an answer to staff that never shows an address or a database
 * message: `status` (the feed answered with an HTTP status that is no feed, `httpStatus`),
 * `timeout`, `unreachable` (no answer at all), `unreadable` (an answer that is not the feed),
 * `storing` (the database failed), `stopped` (the service was stopped).
 */
export type SyncFailure =
  'status' | 'timeout' | 'unreachable' | 'unreadable' | 'storing' | 'stopped';

/** A failure of the read itself, with its kind; anything else thrown in a sync is `storing`. */
class FeedFailure extends Error {
  constructor(
    message: string,
    readonly kind: Exclude<SyncFailure, 'storing' | 'stopped'>,
    readonly httpStatus?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** The part of `fetch` this service needs: `fetchOnItsHost` decides where a redirect goes. */
export type FetchFeed = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'manual' },
) => Promise<LimitedResponse & { ok: boolean }>;

/**
 * A download for a `FeedSource`: the body of a 2xx answer of at most `maxChars` characters.
 * Rejects otherwise (an answer of another status, a body too long, no answer in time, none at
 * all), and when the service is stopped.
 */
export type GetText = (url: string, init: { accept: string; maxChars: number }) => Promise<string>;

/** What a `FeedSource` read gave: the family's document, or why the feed at `url` is to be read. */
export type SourceRead =
  | {
      /** The document the family's `parse` reads, as if the feed at `url` had sent it. */
      json: unknown;
      /** What the source left out that the parse does not see, added to the parse's count. */
      skipped?: number;
      /** When what the source lists next changes: the list is read again just after it. */
      nextChange?: number;
      /** What the log line that names the source says beside it. */
      detail?: Record<string, unknown>;
      /**
       * Plan 19A-2: the document of each other zone in use whose list is not `json`'s (a raid
       * rotation starts at 10:00 on each zone's clock); a zone not here has `json`'s.
       */
      byZone?: ReadonlyMap<string, unknown>;
      /**
       * The other zones whose own document could not be made, and why (fix round 1, L2): each is
       * warned of, keeps the list it had (the stored one as it was before the read when it had
       * none of its own; fix round 2, P2, fix round 3, Q2) and is told no change, and the read is
       * made again as after a failed one (`retryMs` for the first three in a row, then
       * `refreshMs`; fix round 2, P5). A zone of `byZone` whose document does not parse is
       * unread as well (fix round 3, Q3). While the feed's own reads fail, their count decides
       * when the next is made (fix round 3, Q1).
       */
      unreadZones?: ReadonlyMap<string, string>;
    }
  | {
      fallback: string;
      nextChange?: number;
      /**
       * What `get` rejected with, when a download failed: a failure that may pass by itself (no
       * answer, a 5xx) keeps a list the source gave for the quick retries (review R2 of 8B-L).
       */
      cause?: unknown;
    };

/**
 * A source tried before the feed at `url`, which stays the fallback (plan 8B-L: Leek Duck's raid
 * manifest before ScrapedDuck's `raids.json`). A document the family cannot parse is a fallback
 * too. Its downloads go through `get`, without validators: a 304 never vouches for its list.
 */
export interface FeedSource {
  /** What the log calls it: `Leek Duck's raid manifest`. */
  readonly name: string;
  /** Never rejects but when `get` does because the service was stopped. */
  read(get: GetText, now: number): Promise<SourceRead>;
}

export interface BossFeedOptions<T> {
  /** Address of the feed; with a `source`, the fallback. */
  url: string;
  /** A source read before the feed at `url`; none for a family that has only the feed. */
  source?: FeedSource;
  /** How often the feed is read. */
  refreshMs: number;
  /** How long without a successful read before `onStale` listeners are told, once. */
  staleAfterMs: number;
  store: BossStore<T>;
  /** Bosses are matched to the catalogue in use at the moment they are asked for. */
  gameData: GameDataProvider;
  fetch: FetchFeed;
  log: Logger;
  now?: () => number;
  /** How long one download may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  /**
   * The zones in use (plan 19A-2, `ServerSettings.zonesInUse`, the instance's default among
   * them): a change of the list is worked out and told per zone (`FeedChange.zone`). Without it
   * one list, told once without a zone.
   */
  zones?: () => readonly string[];
  /**
   * The zone whose list is the stored one (the instance's default; with a source that gives the
   * other zones' own, `SourceRead.byZone`). Until the first read after a start only its change
   * is told: what the other zones had before is not known (fix round 1, L1).
   */
  defaultZone?: string;
  /**
   * How long to wait after a failed attempt before the next, for the first three failures in a
   * row; from the fourth on the next attempt comes after `refreshMs`, so a feed that stays down is
   * not tried (and logged) every few minutes for ever. Default: 5 minutes, or `refreshMs` if shorter.
   */
  retryMs?: number;
}

/** What a read of the feed says beyond its bosses; each part only when there is something to say. */
export interface FeedRemarks {
  /**
   * The headings of the feed that Pine has no tier for (as `ParsedFeed.unknownLevels`): their
   * bosses were left out. The only sign that a tier vanished because the feed renamed it.
   */
  unknownLevels?: string[];
  /**
   * The list has fewer than half the bosses it had (it had at least `SHRINK_FLOOR`): the feed may
   * be broken in a way its checks do not see. The list is taken all the same.
   */
  shrank?: { before: number; after: number };
}

/**
 * A change of the feed's list: the feed's own rows that came and went (`BossListChange`), and
 * what members see change, the list in effect before and after with the overrides in force
 * (`seen`): a boss an override hides or adds does not come or go for them.
 */
export interface FeedChange<T = RaidTier> extends BossListChange<T> {
  seen: SeenChange<Boss<T>>;
  /**
   * The zone whose list changed (plan 19A-2, with `BossFeedOptions.zones`): told to the servers in
   * it. None: the one list of every server.
   */
  zone?: string;
}

export type SyncResult<T = RaidTier> =
  /** The feed lists other bosses than before. */
  | ({ status: 'updated'; change: FeedChange<T> } & FeedRemarks)
  /** The feed was read and lists the same bosses. */
  | ({ status: 'unchanged' } & FeedRemarks)
  /**
   * The feed could not be read or was not valid; the list in use is unchanged. `reason` is for the
   * log (it may hold the address or a database message); `kind` is what may be said.
   */
  | { status: 'failed'; kind: SyncFailure; httpStatus?: number; reason: string };

/** What staff need of a boss list beyond what handlers read (`/operator boss`). */
export interface BossAdmin<T> {
  /**
   * The bosses the feed listed at the last successful read, as stored; with a zone, as they are
   * in that zone (plan 19A-2: its rotations in force, an upcoming max boss's day there).
   */
  feedBosses(zone?: string): StoredBoss<T>[];
  /** The overrides in force, oldest first. */
  overrides(): BossOverride<T>[];
  addOverride(override: NewBossOverride<T>): Promise<BossOverride<T>>;
  removeOverride(id: number): Promise<boolean>;
  sync(): Promise<SyncResult<T>>;
  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
  readonly lastSyncedAt: number | undefined;
  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
  readonly unknownLevels: readonly string[];
}

export interface StaleFeed {
  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
  lastSyncedAt: number | undefined;
  /** Why the latest attempt failed. */
  reason: string;
}

type Listener<T> = (event: T) => void | Promise<void>;

/**
 * Keeps the boss list of a family: reads its feed on a timer, stores it, and applies the
 * moderators' overrides. Nothing happens until `load` is called, and `load` never uses the
 * network: the bot starts with the list of the last run and the feed is read in the background.
 */
export class BossFeedService<T> implements BossAdmin<T> {
  private feed: StoredBoss<T>[] = [];
  /**
   * The feed of each other zone in use whose list the last read found differs from the stored one
   * (plan 19A-2: `SourceRead.byZone`); in memory only. A zone not here has the stored feed.
   */
  private zoneFeeds: ReadonlyMap<string, StoredBoss<T>[]> = new Map();
  /**
   * Whether `zoneFeeds` holds what a read of this process found (fix round 1, L1): false after
   * `load` (only the default zone's list is stored), true after the first successful read.
   * While false a change is told for the default zone only.
   */
  private zoneFeedsKnown = false;
  /** The zones in use changed during a sync: one more is made once it ends (fix round 1, L3). */
  private zonesAgain = false;
  private overrideList: BossOverride<T>[] = [];
  /**
   * The list as last worked out, per zone asked (a raid's post asked for
   * it three times, the map once per raid per ask): the very same list until the feed or the
   * overrides change or an override runs out, so that whoever keeps what follows from it may
   * compare it by identity.
   */
  private readonly effective = new BoundedMap<
    string,
    {
      feed: unknown;
      overrides: unknown;
      catalogue: unknown;
      list: Boss<T>[];
      until: number;
    }
  >(ZONES_KEPT);
  private loaded = false;
  private syncedAt: number | undefined;
  private attemptedAt: number | undefined;
  protected readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private failures = 0;
  /**
   * Reads in a row that left another zone's own list unread (`SourceRead.unreadZones`; fix round
   * 2, P5): the next read is `retryMs` after the attempt for the first three, as after the feed's
   * own failures, then the refresh decides.
   */
  private zoneFailures = 0;
  /** Whether `startAutoSync` runs the reads (until `stop`): a catch-up schedules the next. */
  private autoSyncing = false;
  private overrideReads = 0;
  private overrideReadApplied = 0;
  private controller: AbortController | undefined;
  // In memory only, on purpose: after a restart the first read is unconditional, which also fills
  // the columns a later migration added (a 304 would leave them empty).
  private validators: { etag?: string; lastModified?: string } = {};
  // The catalogue the feed behind `validators` was parsed with: a 304 would keep the ids worked out
  // with it, so after a game data refresh the next request is unconditional.
  private validatorsCatalogue: PokemonCatalogue | undefined;
  private inFlight: Promise<SyncResult<T>> | undefined;
  /** The tail of `exclusive`'s queue; never rejects. */
  private queue: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | undefined;
  /** When the source said its list changes next (the next rotation); undefined when unknown. */
  private nextChange: number | undefined;
  /** When the scheduled read is due (epoch ms), while one is scheduled. */
  private dueAt: number | undefined;
  /** The source the last read took its list from (the source's name, or `fallback`), for the log. */
  private sourceUsed: string | undefined;
  private stopped = false;
  private staleReported = false;
  private reportedSkipped = 0;
  private lastUnknownLevels: readonly string[] = [];
  private readonly reportedLevels = new Set<string>();
  private readonly reportedIds = new Set<string>();
  private readonly changeListeners = new Set<Listener<FeedChange<T>>>();
  private readonly staleListeners = new Set<Listener<StaleFeed>>();
  private readonly notLoaded: string;

  constructor(
    private readonly options: BossFeedOptions<T>,
    protected readonly family: BossFeedFamily<T>,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = options.retryMs ?? Math.min(options.refreshMs, 5 * MINUTE_MS);
    this.notLoaded = `The ${family.noun} list has not been loaded yet`;
  }

  /** Reads the stored list and overrides. Does not download anything. */
  async load(): Promise<void> {
    const { store } = this.options;
    [this.feed, , this.syncedAt] = await Promise.all([
      store.listActive(),
      this.reloadOverrides(),
      store.lastSyncedAt(),
    ]);
    this.loaded = true;
  }

  /**
   * Re-reads the overrides. Each read is numbered when it starts and its result is applied only
   * if no later read has been applied, so a slow older read cannot put back an older list.
   */
  private async reloadOverrides(): Promise<void> {
    const read = ++this.overrideReads;
    const list = await this.options.store.listOverrides();
    if (read > this.overrideReadApplied) {
      this.overrideReadApplied = read;
      this.overrideList = list;
    }
  }

  /**
   * Every boss in `zone` (plan 19A-2: a server's zone; the list of the rotations in force on its
   * clock, `feedIn`): the feed's list with the moderators' overrides applied, by tier, then name.
   * The zone is required (fix round 1, L7): the stored list is the instance's default zone's, and
   * only `feedBosses` reads it without one.
   */
  bosses(zone: string): readonly Readonly<Boss<T>>[] {
    if (!this.loaded) throw new Error(this.notLoaded);
    const { catalogue } = this.options.gameData;
    const now = this.now();
    const feed = this.feedIn(zone);
    const kept = this.effective.get(zone);
    if (
      kept?.feed === feed &&
      kept.overrides === this.overrideList &&
      kept.catalogue === catalogue &&
      now < kept.until
    ) {
      return kept.list;
    }
    const list = this.family.effective(feed, this.overrideList, catalogue, now);
    if (this.family.lastsUntilOverridesEnd !== true) return list;
    this.effective.set(zone, {
      feed,
      overrides: this.overrideList,
      catalogue,
      list,
      until: Math.min(
        Infinity,
        ...this.overrideList.flatMap((one) =>
          one.expiresAt !== null && one.expiresAt > now ? [one.expiresAt] : [],
        ),
      ),
    });
    return list;
  }

  /**
   * The feed's rows in `zone` (plan 19A-2): the zone's own where the last read found its list
   * differs (`zoneFeeds`), else the stored feed, as the family has them there (`inZone`). The
   * stored feed itself without a zone.
   */
  protected feedIn(
    zone: string | undefined,
    feed: readonly StoredBoss<T>[] = this.feed,
    zoneFeeds: ReadonlyMap<string, StoredBoss<T>[]> = this.zoneFeeds,
  ): readonly StoredBoss<T>[] {
    if (zone === undefined) return feed;
    const own = zoneFeeds.get(zone) ?? feed;
    return this.family.inZone?.(own, zone) ?? own;
  }

  /**
   * The changes of each zone in use (`BossFeedOptions.zones`) between the feeds before a read and
   * now, as members of a server there see them; none for a zone whose feed is the same.
   */
  private zoneChanges(
    feedBefore: readonly StoredBoss<T>[],
    zoneFeedsBefore: ReadonlyMap<string, StoredBoss<T>[]>,
    unread: ReadonlySet<string>,
    now: number,
  ): FeedChange<T>[] {
    const { catalogue } = this.options.gameData;
    const { ops } = this.family;
    const { defaultZone } = this.options;
    // After a start, what another zone had before is not known (fix round 1, L1); a zone whose
    // own list this read could not make is told nothing (fix round 2, P2).
    const known = (zone: string) =>
      !unread.has(zone) &&
      (this.zoneFeedsKnown || defaultZone === undefined || zone === defaultZone);
    return (this.options.zones?.() ?? []).filter(known).flatMap((zone) => {
      const before = this.feedIn(zone, feedBefore, zoneFeedsBefore);
      const after = this.feedIn(zone);
      const change = diffFeedIn(ops, before, after);
      if (change.added.length === 0 && change.removed.length === 0) return [];
      const seen = diffBossesIn(
        ops,
        this.family.effective(before, this.overrideList, catalogue, now),
        this.family.effective(after, this.overrideList, catalogue, now),
      );
      return [{ ...change, seen, zone }];
    });
  }

  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
  get lastSyncedAt(): number | undefined {
    return this.syncedAt;
  }

  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
  get unknownLevels(): readonly string[] {
    return this.lastUnknownLevels;
  }

  /**
   * The bosses the feed listed at the last successful read, as stored; with a zone, as they are
   * there (`feedIn`, plan 19A-2).
   */
  feedBosses(zone?: string): StoredBoss<T>[] {
    if (!this.loaded) throw new Error(this.notLoaded);
    return this.feedIn(zone).map((boss) => structuredClone(boss));
  }

  /** The overrides in force, oldest first. */
  overrides(): BossOverride<T>[] {
    const now = this.now();
    return this.overrideList.filter((o) => o.expiresAt === null || o.expiresAt > now);
  }

  /**
   * Stores an override; it applies at once. One with the same action for the same Pokémon and
   * tier replaces the earlier one, and an `autoset` replaces every earlier `autoset` of its tier
   * (`replacesOverride`). Throws a RangeError for an override that makes no sense.
   */
  async addOverride(override: NewBossOverride<T>): Promise<BossOverride<T>> {
    const now = this.now();
    const problem = this.family.overrideProblem(override, now);
    if (problem) throw new RangeError(problem);
    return this.exclusive(async () => {
      const saved = await this.options.store.saveOverride(override, now);
      await this.reloadAfterWrite(() => {
        // The store replaced the overrides that this one replaces.
        this.overrideList = [
          ...this.overrideList.filter((o) => !replacesOverrideIn(this.family.ops, saved, o)),
          saved,
        ];
      });
      return saved;
    });
  }

  /** Whether there was such an override. */
  removeOverride(id: number): Promise<boolean> {
    return this.exclusive(async () => {
      const removed = await this.options.store.removeOverride(id);
      await this.reloadAfterWrite(() => {
        this.overrideList = this.overrideList.filter((o) => o.id !== id);
      });
      return removed;
    });
  }

  /**
   * Runs `work` after everything `exclusive` was given before it has finished, failed or not:
   * the writes of overrides and the part of a sync from storing the feed to working out what
   * members see change. A write in the middle of that part would count as in force before the
   * sync as well as after it, and members would not be told of a boss it made them see.
   */
  private exclusive<R>(work: () => Promise<R>): Promise<R> {
    const result = this.queue.then(work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Re-reads the overrides after a write that succeeded. If only the re-read fails, the write
   * still stands (and applies at the next sync), so the caller is not told it failed: the warning
   * is logged and `patch` brings the list in memory up to date.
   */
  private async reloadAfterWrite(patch: () => void): Promise<void> {
    try {
      await this.reloadOverrides();
    } catch (err) {
      this.safely(() =>
        this.options.log.warn({ err }, `could not re-read the ${this.family.noun} overrides`),
      );
      // The patch is newer than any read still in flight: none of those may overwrite it.
      this.overrideReadApplied = this.overrideReads;
      patch();
    }
  }

  /**
   * Called after a sync in which the feed's bosses changed. Not called for the first sync of a
   * new database, where there is nothing to compare with. Returns a function that unsubscribes.
   */
  onChange(listener: Listener<FeedChange<T>>): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Called once when the feed has not been read successfully for `staleAfterMs`, and again only
   * after it has worked in between. Returns a function that unsubscribes.
   */
  onStale(listener: Listener<StaleFeed>): () => void {
    this.staleListeners.add(listener);
    return () => this.staleListeners.delete(listener);
  }

  /**
   * Reads the feed and, if it is valid, stores it as the list. Never rejects: a feed that cannot
   * be read or is not valid leaves the list as it is. Calls made while one is running share its
   * result. The one way it throws is when `load` has not been called.
   */
  sync(): Promise<SyncResult<T>> {
    if (!this.loaded) throw new Error(this.notLoaded);
    // A stopped service (shutdown) asks the feed nothing more.
    if (this.stopped && !this.inFlight) {
      return Promise.resolve({ status: 'failed', kind: 'stopped', reason: 'stopped' });
    }
    this.inFlight ??= this.syncOnce().finally(() => {
      this.inFlight = undefined;
      // The zones in use changed while it ran: one more read, for them (fix round 1, L3).
      if (this.zonesAgain) {
        this.zonesAgain = false;
        this.zonesChanged();
      }
    });
    return this.inFlight;
  }

  /** Resolves once no sync is in flight (at once when none is). Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /**
   * Reads the feed `refreshMs` after the last attempt (at once when the stored list is older
   * than that or there is none; with a `source`, the first read of a run is at once, review R3
   * of 8B-L), and again after every attempt. Calling it again while a sync is
   * scheduled changes nothing. After a failed attempt the next one is `retryMs` later (see
   * the option for how long that lasts). Throws
   * when `load` has not been called.
   */
  startAutoSync(): void {
    if (!this.loaded) throw new Error(this.notLoaded);
    this.stopped = false;
    this.autoSyncing = true;
    if (this.timer) return;
    this.schedule();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R1): when the last attempt
   * failed, the feed is read now instead of at the retry, through `sync`'s guard (a sync the
   * timer started meanwhile is waited for first, and decides), and the next read scheduled from
   * this one; else nothing is owed and nothing is asked. Never rejects.
   */
  async catchUp(): Promise<CatchUpOutcome> {
    if (!this.loaded || this.stopped) return 'not-owed';
    await this.whenIdle();
    if (this.failures === 0) return 'not-owed';
    // The scheduled read is this one: cleared, then set again from it.
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const result = await this.sync();
    if (this.autoSyncing && !this.stopped && !this.timer) this.schedule();
    return result.status === 'failed' ? 'failed' : 'done';
  }

  /**
   * The zones in use changed (plan 19A-2: a server's zone; a server that joins or leaves): with a
   * source, the list is read again in the background, so that a new zone has its own list and
   * the next change among the zones now in use is known; the timer is set again from that read.
   * During a sync, one more once it ends, never the one in flight, which began with the zones
   * before (fix round 1, L3). Nothing while the service does not read by itself.
   */
  zonesChanged(): void {
    if (!this.autoSyncing || this.stopped || !this.options.source) return;
    if (this.inFlight) {
      this.zonesAgain = true;
      return;
    }
    void this.sync().finally(() => {
      if (this.autoSyncing && !this.stopped) this.schedule();
    });
  }

  /**
   * Cancels the scheduled sync and ends a download in flight (that sync reports `stopped`).
   * Writes to the database are not interrupted.
   */
  stop(): void {
    this.autoSyncing = false;
    this.stopped = true;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const quick = this.failures > 0 && this.failures <= QUICK_RETRIES;
    const interval = quick ? this.retryMs : this.options.refreshMs;
    // With a source the first read of a run is at once (review R3 of 8B-L): its next change is
    // not stored, so a restart at 09:55 would otherwise miss a rotation at 10:00.
    const last = this.attemptedAt ?? (this.options.source ? undefined : this.syncedAt);
    const now = this.now();
    let due = last === undefined ? 0 : last + interval - now;
    // Just after the source's next change (a rotation that starts or ends), if that comes first.
    // It is the last read's, always later than that read began: one that passed during the read
    // is read again at once, never twice.
    if (this.nextChange !== undefined) {
      due = Math.min(due, this.nextChange + AFTER_CHANGE_MS - now);
    }
    const zoneRetry = this.zoneRetryAt();
    if (zoneRetry !== undefined) due = Math.min(due, zoneRetry - now);
    // Never longer than the interval: a stored time in the future must not postpone syncing.
    const delay = Math.min(Math.max(due, 0), interval, MAX_TIMER_MS);
    this.dueAt = now + delay;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.sync().finally(() => {
        if (!this.stopped) this.schedule();
      });
    }, delay);
    this.timer.unref();
  }

  /**
   * After a read the timer did not start (`/operator boss sync`, a catch-up), the timer is set
   * again when that read learned a change that comes before it (review R3 of 8B-L).
   */
  private followChange(): void {
    if (!this.autoSyncing || this.stopped || !this.timer) return;
    const soonest = Math.min(
      this.nextChange === undefined ? Infinity : this.nextChange + AFTER_CHANGE_MS,
      this.zoneRetryAt() ?? Infinity,
    );
    if (soonest === Infinity) return;
    if (this.dueAt === undefined || soonest < this.dueAt) this.schedule();
  }

  /**
   * When another zone's list that the last read could not make is read again (fix round 2, P5):
   * `retryMs` after that attempt for the first three reads in a row, as after the feed's own
   * failures; after that none of its own, the refresh decides. None while the feed's own reads
   * fail (fix round 3, Q1): its own count of failures decides then (`retryMs`, then `refreshMs`).
   */
  private zoneRetryAt(): number | undefined {
    if (this.failures > 0) return undefined;
    if (this.zoneFailures === 0 || this.zoneFailures > QUICK_RETRIES) return undefined;
    return this.attemptedAt === undefined ? undefined : this.attemptedAt + this.retryMs;
  }

  private async syncOnce(): Promise<SyncResult<T>> {
    const now = this.now();
    const attemptedBefore = this.attemptedAt;
    this.attemptedAt = now;
    const before = this.feed.length;
    const feedBefore = this.feed;
    const zoneFeedsBefore = this.zoneFeeds;
    const { noun, ops } = this.family;
    let change: BossListChange<T>;
    let seen: SeenChange<Boss<T>> | undefined;
    let zoneChanges: FeedChange<T>[] = [];
    try {
      const read = await this.readFeed(now);
      // No override is written from storing the feed until what members see is worked out.
      ({ change, seen } = await this.exclusive<{
        change: BossListChange<T>;
        seen?: SeenChange<Boss<T>>;
      }>(async () => {
        const stored = await this.storeFeed(read, now);
        const unread: ReadonlySet<string> = read.notModified
          ? new Set()
          : (read.unreadZones ?? new Set());
        this.zoneFailures = unread.size === 0 ? 0 : this.zoneFailures + 1;
        // Each zone in use its own change (plan 19A-2), worked out under the same exclusion.
        if (this.options.zones) {
          zoneChanges = this.zoneChanges(feedBefore, zoneFeedsBefore, unread, now);
        }
        this.zoneFeedsKnown = true;
        if (stored.added.length === 0 && stored.removed.length === 0) return { change: stored };
        // What members see: the lists in effect before and after, with the same overrides.
        const { catalogue } = this.options.gameData;
        return {
          change: stored,
          seen: diffBossesIn(
            ops,
            this.family.effective(feedBefore, this.overrideList, catalogue, now),
            this.family.effective(this.feed, this.overrideList, catalogue, now),
          ),
        };
      }));
    } catch (err) {
      if (err instanceof SyncStopped) {
        // Nothing was read, so a later `startAutoSync` must not wait for this attempt.
        this.attemptedAt = attemptedBefore;
        return { status: 'failed', kind: 'stopped', reason: 'stopped' };
      }
      this.failures++;
      const reason = err instanceof Error ? err.message : String(err);
      // A feed out of reach (the network away, or a 5xx that passes by itself, review V1 of 8B-L)
      // is retried by itself: a warning (plan 8X-H). A feed it cannot read, or a store that
      // failed, needs a person.
      const offline = isPassing(err);
      this.safely(() =>
        offline
          ? this.options.log.warn({ err }, `could not sync the ${noun}es`)
          : this.options.log.error({ err }, `could not sync the ${noun}es`),
      );
      this.reportIfStale(now, reason);
      if (err instanceof FeedFailure) {
        return {
          status: 'failed',
          kind: err.kind,
          ...(err.httpStatus === undefined ? {} : { httpStatus: err.httpStatus }),
          reason,
        };
      }
      return { status: 'failed', kind: 'storing', reason };
    }
    const first = this.syncedAt === undefined;
    this.failures = 0;
    this.syncedAt = now;
    this.staleReported = false;
    this.followChange();
    const remarks = this.remarks(before, this.feed.length);
    // With zones in use, each zone's change is told to the servers in it (plan 19A-2).
    if (!first) for (const one of zoneChanges) this.emit(this.changeListeners, one);
    if (!seen) {
      // So that a read can be seen to have run (plan 8X-H: after an outage).
      this.safely(() =>
        this.options.log.debug({ bosses: this.feed.length }, `${noun}es read, unchanged`),
      );
      return { status: 'unchanged', ...remarks };
    }
    this.safely(() =>
      this.options.log.info(
        {
          added: change.added.map((boss) => boss.name),
          removed: change.removed.map((boss) => boss.name),
        },
        `${noun}es updated`,
      ),
    );
    const feedChange: FeedChange<T> = { ...change, seen };
    if (!first && !this.options.zones) this.emit(this.changeListeners, feedChange);
    return { status: 'updated', change: feedChange, ...remarks };
  }

  /** What to say of a read beyond its bosses; a list that shrank by more than half is logged. */
  private remarks(before: number, after: number): FeedRemarks {
    const remarks: FeedRemarks = {};
    if (this.lastUnknownLevels.length > 0) remarks.unknownLevels = [...this.lastUnknownLevels];
    if (before >= SHRINK_FLOOR && after * 2 < before) {
      remarks.shrank = { before, after };
      this.safely(() =>
        this.options.log.warn(
          { before, after },
          `the ${this.family.noun} feed lists fewer than half the bosses it did`,
        ),
      );
    }
    return remarks;
  }

  /**
   * Downloads and checks the feed; stores nothing. Throws when anything fails. With a `source`,
   * that is read first, and the feed at `url` only when it falls back.
   */
  private async readFeed(now: number): Promise<FeedRead<T>> {
    const controller = new AbortController();
    this.controller = controller;
    // The next change is the one this read learns, or none.
    this.nextChange = undefined;
    try {
      const catalogue = this.options.gameData.catalogue;
      return (
        (await this.readSource(controller, catalogue, now)) ??
        (await this.readFallback(controller, catalogue, now))
      );
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  /**
   * One request of a read, with its own time limit, ended by `stop` through `controller`, its
   * body read up to `maxChars` bytes. Throws `SyncStopped` when stopped, a `FeedFailure` when no
   * answer came or the body is longer or no text; any other status is returned.
   */
  private async download(
    url: string,
    headers: Record<string, string>,
    controller: AbortController,
    maxChars: number,
  ): Promise<{ status: number; body: string; validators: BossFeedService<T>['validators'] }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([timeout, controller.signal]);
    try {
      const response = await fetchOnItsHost(this.options.fetch, url, {
        signal,
        headers,
        redirect: 'manual',
      });
      if (!response.ok) return { status: response.status, body: '', validators: {} };
      const read = await readLimitedText(response, maxChars);
      if (!read.ok) {
        const said = read.reason === 'too-large' ? `more than ${maxChars} bytes` : 'no text';
        throw new FeedFailure(`${url} sent ${said}`, 'unreadable');
      }
      return {
        status: response.status,
        body: read.text,
        validators: {
          etag: response.headers.get('etag') ?? undefined,
          lastModified: response.headers.get('last-modified') ?? undefined,
        },
      };
    } catch (err) {
      if (err instanceof FeedFailure) throw err;
      if (controller.signal.aborted) throw new SyncStopped();
      if (timeout.aborted) {
        throw new FeedFailure(
          `${url}: timed out after ${this.timeoutMs} ms`,
          'timeout',
          undefined,
          {
            cause: err,
          },
        );
      }
      throw new FeedFailure(`${url}: ${failureReason(err)}`, 'unreachable', undefined, {
        cause: err,
      });
    }
  }

  /**
   * Reads the `source`, when there is one: its parsed document, or undefined when the feed at
   * `url` is to be read instead (the source said so, or its document could not be parsed). The
   * source in use is logged when it changes, with why it fell back.
   */
  private async readSource(
    controller: AbortController,
    catalogue: PokemonCatalogue,
    now: number,
  ): Promise<FeedRead<T> | undefined> {
    const { source } = this.options;
    if (!source) return undefined;
    const get: GetText = async (url, { accept, maxChars }) => {
      const { status, body } = await this.download(url, { Accept: accept }, controller, maxChars);
      if (status < 200 || status > 299) {
        throw new FeedFailure(`${url} answered ${status}`, 'status', status);
      }
      return body;
    };
    const read = await source.read(get, now);
    if (controller.signal.aborted) throw new SyncStopped();
    this.nextChange = read.nextChange;
    let parsed: ParsedFeed<T> | undefined;
    let reason = '';
    if ('fallback' in read) {
      // A source out of reach for a while (review R2 of 8B-L) keeps the list it gave: a failed
      // sync, retried quickly. The fallback is read for a structural cause, when the list stored
      // is the fallback's or there is none, or once the quick retries are spent.
      if (
        isPassing(read.cause) &&
        this.feed.length > 0 &&
        this.sourceUsed !== 'fallback' &&
        this.failures < QUICK_RETRIES
      ) {
        throw read.cause;
      }
      reason = read.fallback;
    } else {
      try {
        const document = this.family.parse(read.json, catalogue, now);
        parsed = { ...document, skipped: document.skipped + (read.skipped ?? 0) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reason = `${source.name} gave no usable list: ${message}`;
      }
    }
    if (parsed === undefined || 'fallback' in read) {
      this.noteSource('fallback', { reason }, `${this.family.noun}es read from the fallback feed`);
      return undefined;
    }
    this.noteSource(
      source.name,
      read.detail ?? {},
      `${this.family.noun}es read from ${source.name}`,
    );
    const bosses = this.accepted(parsed);
    const { byZone, unparsed } = this.zoneBosses(read, catalogue, now);
    const unreadZones = new Set([...(read.unreadZones?.keys() ?? []), ...unparsed]);
    return {
      notModified: false,
      bosses,
      byZone,
      ...(unreadZones.size === 0 ? {} : { unreadZones }),
      validators: {},
      catalogue,
    };
  }

  /**
   * The bosses of the documents a source gave the other zones (plan 19A-2, `SourceRead.byZone`),
   * and the zones whose document does not parse (`unparsed`): those are unread as the source's
   * own (fix round 3, Q3: each keeps its list, and the read is made again soon), and the log
   * says so.
   */
  private zoneBosses(
    read: { byZone?: ReadonlyMap<string, unknown>; unreadZones?: ReadonlyMap<string, string> },
    catalogue: PokemonCatalogue,
    now: number,
  ): { byZone: ReadonlyMap<string, FeedBoss<T>[]>; unparsed: ReadonlySet<string> } {
    const parsed = new Map<string, FeedBoss<T>[]>();
    const unparsed = new Set<string>();
    // A zone whose own document the source could not make (fix round 1, L2).
    for (const [zone, reason] of read.unreadZones ?? []) {
      this.safely(() =>
        this.options.log.warn(
          { zone, reason },
          `a zone's ${this.family.noun} list could not be read`,
        ),
      );
    }
    for (const [zone, json] of read.byZone ?? []) {
      try {
        parsed.set(zone, this.family.parse(json, catalogue, now).bosses);
      } catch (err) {
        unparsed.add(zone);
        this.safely(() =>
          this.options.log.warn(
            { err, zone },
            `a zone's ${this.family.noun} list could not be read`,
          ),
        );
      }
    }
    return { byZone: parsed, unparsed };
  }

  /** Logs which source a read took its list from, once each time that changes (information). */
  private noteSource(source: string, detail: Record<string, unknown>, message: string): void {
    if (this.sourceUsed === source) return;
    this.sourceUsed = source;
    this.safely(() => this.options.log.info(detail, message));
  }

  /** Downloads and checks the feed at `url` (conditionally when it can); stores nothing. */
  private async readFallback(
    controller: AbortController,
    catalogue: PokemonCatalogue,
    now: number,
  ): Promise<FeedRead<T>> {
    const { url } = this.options;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.validatorsCatalogue === catalogue) {
      if (this.validators.etag) headers['If-None-Match'] = this.validators.etag;
      if (this.validators.lastModified) headers['If-Modified-Since'] = this.validators.lastModified;
    }

    const conditional = 'If-None-Match' in headers || 'If-Modified-Since' in headers;
    const { status, body, validators } = await this.download(
      url,
      headers,
      controller,
      this.family.maxFeedChars,
    );

    if (status === 304) {
      if (!conditional) {
        throw new FeedFailure(`${url} answered 304 to a request without validators`, 'status', 304);
      }
      return { notModified: true };
    }
    if (status < 200 || status > 299) {
      throw new FeedFailure(`${url} answered ${status}`, 'status', status);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new FeedFailure(`${url} did not send JSON`, 'unreadable');
    }
    let parsed: ParsedFeed<T>;
    try {
      parsed = this.family.parse(json, catalogue, now);
    } catch (err) {
      throw new FeedFailure(
        err instanceof Error ? err.message : String(err),
        'unreadable',
        undefined,
        {
          cause: err,
        },
      );
    }
    return { notModified: false, bosses: this.accepted(parsed), validators, catalogue };
  }

  /** The bosses of a parsed document, after logging what it says beyond them. */
  private accepted(parsed: ParsedFeed<T>): FeedBoss<T>[] {
    const { noun } = this.family;
    const { bosses, unknownLevels, skipped, unknownIds = [] } = parsed;
    this.lastUnknownLevels = unknownLevels;
    for (const level of unknownLevels) {
      if (this.reportedLevels.has(level)) continue;
      this.reportedLevels.add(level);
      this.safely(() =>
        this.options.log.warn({ level }, `the ${noun} feed has a level Pine does not know`),
      );
    }
    // Each once while the bot runs: listed by a name made of the id until the game data knows it.
    for (const id of unknownIds) {
      if (this.reportedIds.has(id)) continue;
      this.reportedIds.add(id);
      this.safely(() =>
        this.options.log.warn(
          { id },
          `the ${noun} feed names a Pokémon the game data does not know`,
        ),
      );
    }
    // Reported when the number changes, whether or not the list does; a feed read whole resets it.
    if (skipped !== this.reportedSkipped) {
      this.reportedSkipped = skipped;
      if (skipped > 0) {
        this.safely(() => this.options.log.warn({ skipped }, `${noun} feed entries were left out`));
      }
    }
    return bosses;
  }

  /** Stores what `readFeed` read; returns what changed. Throws when anything fails. */
  private async storeFeed(read: FeedRead<T>, now: number): Promise<BossListChange<T>> {
    const { store } = this.options;
    if (read.notModified) {
      await store.touchActive(now);
      this.feed = await store.listActive();
      this.zoneFeeds = new Map();
      await this.housekeeping(now);
      return { added: [], removed: [] };
    }
    const change = diffFeedIn(this.family.ops, this.feed, read.bosses);
    // Forgotten before the list is replaced: if anything after that fails, the next request is
    // unconditional and repairs the list, instead of a 304 vouching for one the feed does not have.
    this.validators = {};
    const feedBefore = this.feed;
    await store.replaceFeed(read.bosses, now);
    this.feed = await store.listActive();
    this.zoneFeeds = this.storedIn(read.byZone, read.unreadZones, feedBefore, now);
    await this.housekeeping(now);
    // Remembered only for a feed that was accepted: a 304 must never vouch for a rejected one.
    this.validators = read.validators;
    this.validatorsCatalogue = read.catalogue;
    return change;
  }

  /**
   * The other zones' bosses as rows of the stored feed (`zoneFeeds`): a boss that zone listed at
   * the read before keeps its times there (fix round 1, L5), else one the stored feed has keeps
   * those; one new to both is first seen now (plan 19A-2). A zone whose own list the read could
   * not make (`unread`) keeps what it had (fix round 2, P2: a page failing once does not flip its
   * list to the default's and back): its own where it had one, else the stored feed as it was
   * before this read (`feedBefore`; fix round 3, Q2), never the new one, unless there was none
   * (a new database: a feed's list is never empty, and nothing serves nobody).
   */
  private storedIn(
    byZone: ReadonlyMap<string, FeedBoss<T>[]> | undefined,
    unread: ReadonlySet<string> | undefined,
    feedBefore: StoredBoss<T>[],
    now: number,
  ): ReadonlyMap<string, StoredBoss<T>[]> {
    const { ops } = this.family;
    const identity = (boss: FeedBoss<T>): string =>
      `${boss.pokemonId}|${boss.form ?? ''}|${ops.slot(boss.tier)}`;
    const stored = new Map(this.feed.map((boss) => [identity(boss), boss]));
    const before = this.zoneFeeds;
    const zones = new Map<string, StoredBoss<T>[]>();
    const had = feedBefore.length > 0 ? feedBefore : this.feed;
    for (const zone of unread ?? []) zones.set(zone, before.get(zone) ?? had);
    for (const [zone, bosses] of byZone ?? []) {
      zones.set(
        zone,
        bosses.map((boss) => {
          const known =
            before.get(zone)?.find((one) => identity(one) === identity(boss)) ??
            stored.get(identity(boss));
          return {
            ...boss,
            firstSeen: known?.firstSeen ?? Math.max(now, boss.startsAt ?? now),
            lastSeen: now,
          };
        }),
      );
    }
    return zones;
  }

  /** Deletes expired overrides and re-reads the rest; a failure is logged, never fails the sync. */
  private async housekeeping(now: number): Promise<void> {
    try {
      await this.options.store.removeExpiredOverrides(now);
      await this.reloadOverrides();
    } catch (err) {
      this.safely(() =>
        this.options.log.warn({ err }, `could not tidy the ${this.family.noun} overrides`),
      );
    }
  }

  /**
   * Tells the listeners once that the list is out of date: `staleAfterMs` after the last
   * successful read, which is stored and so survives a restart; when the feed has never been
   * read (a new database), at the second failure in a row, so that one failed first attempt
   * does not count as staleness.
   */
  private reportIfStale(now: number, reason: string): void {
    if (this.staleReported) return;
    if (
      this.syncedAt === undefined
        ? this.failures < 2
        : now - this.syncedAt < this.options.staleAfterMs
    ) {
      return;
    }
    this.staleReported = true;
    this.safely(() =>
      this.options.log.warn(
        {
          lastSyncedAt: this.syncedAt === undefined ? null : new Date(this.syncedAt).toISOString(),
        },
        `the ${this.family.noun} list is out of date`,
      ),
    );
    this.emit(this.staleListeners, { lastSyncedAt: this.syncedAt, reason });
  }

  /** A listener that throws or rejects must not stop the others or the sync; none is waited for. */
  private emit<E>(listeners: ReadonlySet<Listener<E>>, event: E): void {
    const failed = (err: unknown): void =>
      this.safely(() => this.options.log.error({ err }, `a ${this.family.noun} listener failed`));
    for (const listener of listeners) {
      try {
        void Promise.resolve(listener(event)).catch(failed);
      } catch (err) {
        failed(err);
      }
    }
  }

  /** A broken logger must not turn a finished sync into a rejected one. */
  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Nothing useful can be done about a logger that throws.
    }
  }
}
