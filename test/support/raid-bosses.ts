import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { BossStore, StoredBoss } from '../../src/db/repositories/raid-boss-repository.js';
import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
import { parseRaidBossFeed, type FeedBoss } from '../../src/domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  effectiveBosses,
  RAID_OPS,
  replacesOverrideIn,
  type BossFamilyOps,
  type BossOverride,
  type NewBossOverride,
  type RaidBoss,
} from '../../src/domain/pogo/raid-bosses.js';
import type { RaidTier } from '../../src/domain/pogo/raid-tier.js';
import { sameRaidTier } from '../../src/domain/pogo/raid-tier.js';
import {
  RaidBossService,
  type FetchFeed,
  type RaidBossProvider,
} from '../../src/services/raid-boss-service.js';
import { catalogueFixture } from './game-data.js';
import { textAnswer } from './responses.js';
import { createTestLogger } from './test-logger.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * The raid boss feed of ScrapedDuck as downloaded on 2026-10-11: 14 bosses under four headings, among
 * them a mega, a shadow boss with a named form and a costume newer than the game-data fixture.
 */
export function readRaidBossFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'raid-boss-feed.json'), 'utf8'));
}

/**
 * A `BossStore` of one family kept in memory, for tests of a boss service's own logic. It follows
 * `RaidBossRepository` and `MaxBossRepository`, whose behaviour raid-boss-repository.db.test.ts
 * pins down (an upcoming boss stored from its start included). Set `failing`
 * to make every call reject, or put method names in `failingMethods` to make only those reject
 * (with `<method> failed`). `beforeListOverrides` runs after `listOverrides` has taken its
 * snapshot and before it returns, so a test can hold a read back and let a later one overtake it.
 */
export class MemoryBossStore<T> implements BossStore<T> {
  failing: Error | undefined;
  failingMethods = new Set<string>();
  beforeListOverrides: (() => Promise<void>) | undefined;
  private rows: (StoredBoss<T> & { active: boolean })[] = [];
  private stored: BossOverride<T>[] = [];
  /**
   * `ids` numbers the overrides; two stores of the two families given one counter number them as
   * the one table does, so that an id names one override of either.
   */
  constructor(
    private readonly ops: Pick<BossFamilyOps<T>, 'slot' | 'sameTier'>,
    private readonly ids: { next: number } = { next: 1 },
  ) {}

  private identity(boss: FeedBoss<T>): string {
    return `${boss.pokemonId}|${boss.form ?? ''}|${this.ops.slot(boss.tier)}`;
  }

  private check(method: string): void {
    if (this.failing) throw this.failing;
    if (this.failingMethods.has(method)) throw new Error(`${method} failed`);
  }

  listActive(): Promise<StoredBoss<T>[]> {
    return this.attempt('listActive', () =>
      this.rows.filter((row) => row.active).map(({ active: _active, ...boss }) => ({ ...boss })),
    );
  }

  replaceFeed(bosses: readonly FeedBoss<T>[], now: number): Promise<void> {
    return this.attempt('replaceFeed', () => {
      const from = (boss: FeedBoss<T>): number => Math.max(now, boss.startsAt ?? now);
      const listed = new Set<string>();
      for (const boss of bosses) {
        if (listed.has(this.identity(boss))) continue;
        listed.add(this.identity(boss));
        const row = this.rows.find((candidate) => this.identity(candidate) === this.identity(boss));
        if (row) {
          delete row.image;
          delete row.startsFrom;
          Object.assign(row, {
            shiny: boss.shiny,
            name: boss.name,
            ...(boss.image === undefined ? {} : { image: boss.image }),
            ...(boss.startsFrom === undefined ? {} : { startsFrom: boss.startsFrom }),
            lastSeen: now,
            firstSeen: row.active && row.firstSeen <= now ? row.firstSeen : from(boss),
            active: true,
          });
        } else {
          const { startsAt: _startsAt, ...kept } = boss;
          this.rows.push({ ...kept, firstSeen: from(boss), lastSeen: now, active: true });
        }
      }
      for (const row of this.rows) if (!listed.has(this.identity(row))) row.active = false;
    });
  }

  touchActive(now: number): Promise<void> {
    return this.attempt('touchActive', () => {
      for (const row of this.rows) if (row.active) row.lastSeen = now;
    });
  }

  lastSyncedAt(): Promise<number | undefined> {
    return this.attempt('lastSyncedAt', () => {
      const seen = this.rows.filter((row) => row.active).map((row) => row.lastSeen);
      return seen.length === 0 ? undefined : Math.max(...seen);
    });
  }

  async listOverrides(): Promise<BossOverride<T>[]> {
    const snapshot = await this.attempt('listOverrides', () =>
      this.stored.map((override) => ({ ...override })),
    );
    await this.beforeListOverrides?.();
    return snapshot;
  }

  saveOverride(override: NewBossOverride<T>, now: number): Promise<BossOverride<T>> {
    return this.attempt('saveOverride', () => {
      this.stored = this.stored.filter((other) => !replacesOverrideIn(this.ops, override, other));
      const saved = { ...override, id: this.ids.next++, createdAt: now };
      this.stored.push(saved);
      return { ...saved };
    });
  }

  removeOverride(id: number): Promise<boolean> {
    return this.attempt('removeOverride', () => {
      const before = this.stored.length;
      this.stored = this.stored.filter((override) => override.id !== id);
      return this.stored.length < before;
    });
  }

  removeExpiredOverrides(now: number): Promise<number> {
    return this.attempt('removeExpiredOverrides', () => {
      const before = this.stored.length;
      this.stored = this.stored.filter(
        (override) => override.expiresAt === null || override.expiresAt > now,
      );
      return before - this.stored.length;
    });
  }

  private attempt<T>(method: string, action: () => T): Promise<T> {
    try {
      this.check(method);
      return Promise.resolve(action());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/** `MemoryBossStore` of the raid bosses. */
export class MemoryRaidBossStore extends MemoryBossStore<RaidTier> {
  constructor(ids?: { next: number }) {
    super(RAID_OPS, ids);
  }
}

/**
 * A boss list the same in every zone (plan 19A-2: a test of one zone may leave the zone out; one
 * of several gives each server's list of its own, as `RaidBossService` does).
 */
export interface FixtureRaidBosses extends RaidBossProvider {
  bosses(zone?: string): readonly Readonly<RaidBoss>[];
  bossesOf(tier: RaidTier, zone?: string): RaidBoss[];
  autoset(tier: RaidTier, zone?: string): RaidBoss | undefined;
}

/** The boss list of the downloaded feed against the game-data fixture, with these overrides. */
export function raidBossesFixture(overrides: readonly BossOverride[] = []): FixtureRaidBosses {
  const feed = parseRaidBossFeed(readRaidBossFeed(), feedLookup(catalogueFixture())).bosses;
  // As `BossFeedService`: the very same list until an override runs out.
  const lasting = overrides.every((override) => override.expiresAt === null);
  let kept: RaidBoss[] | undefined;
  const bosses = () => {
    if (lasting) return (kept ??= effectiveBosses(feed, overrides, catalogueFixture(), Date.now()));
    return effectiveBosses(feed, overrides, catalogueFixture(), Date.now());
  };
  return {
    bosses,
    bossesOf: (tier) => bosses().filter((boss) => sameRaidTier(boss.tier, tier)),
    autoset: (tier) => autosetBoss(bosses(), tier),
  };
}

/** A response of the feed's address, as `RaidBossService` reads it. */
export function feedReply(status: number, body = ''): Awaited<ReturnType<FetchFeed>> {
  return textAnswer(status, body);
}

/** When the stored list of `raidBossServiceWith` was read: the fixtures' day. */
export const FEED_READ_AT = Date.UTC(2026, 9, 11, 12);

/**
 * A real `RaidBossService` over `MemoryRaidBossStore`, loaded with the downloaded feed as if it
 * had been read at `FEED_READ_AT` (unless `empty`), and with these overrides. The feed is not
 * downloaded: `respond` answers the requests of `sync()` (by default the same feed), `now` is the
 * service's clock and `requests` counts what was asked. Pass it as `raidBosses` and
 * `raidBossAdmin` to `createTestContext`.
 */
export async function raidBossServiceWith(
  options: {
    overrides?: readonly NewBossOverride[];
    empty?: boolean;
    staleAfterMs?: number;
    /** The counter of override ids, shared with a max boss store (`MemoryBossStore`). */
    ids?: { next: number };
  } = {},
) {
  const store = new MemoryRaidBossStore(options.ids);
  const { log, entries } = createTestLogger();
  const state = {
    now: FEED_READ_AT,
    requests: 0,
    respond: (() =>
      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())))) as FetchFeed,
  };
  if (!options.empty) {
    const feed = parseRaidBossFeed(readRaidBossFeed(), feedLookup(catalogueFixture())).bosses;
    await store.replaceFeed(feed, state.now);
  }
  const service = new RaidBossService({
    url: 'https://example.test/raids.min.json',
    refreshMs: 60 * 60_000,
    staleAfterMs: options.staleAfterMs ?? 48 * 60 * 60_000,
    store,
    gameData: { catalogue: catalogueFixture() },
    fetch: (url, init) => {
      state.requests += 1;
      return state.respond(url, init);
    },
    log,
    now: () => state.now,
  });
  for (const override of options.overrides ?? []) {
    await store.saveOverride(override, state.now);
  }
  await service.load();
  return { service, store, state, logged: entries };
}
