import type { RaidBossStore } from '../db/repositories/raid-boss-repository.js';
import { feedLookupOf } from '../domain/pogo/feed-lookup.js';
import { parseRaidBossFeed } from '../domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  effectiveBosses,
  overrideProblem,
  RAID_OPS,
  type RaidBoss,
} from '../domain/pogo/raid-bosses.js';
import { sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
import {
  BossFeedService,
  type BossAdmin,
  type BossFeedFamily,
  type BossFeedOptions,
} from './boss-feed-service.js';
import { raidManifestSource } from './raid-rotations.js';

export {
  SHRINK_FLOOR,
  type FeedChange,
  type FeedRemarks,
  type FetchFeed,
  type StaleFeed,
  type SyncFailure,
  type SyncResult,
} from './boss-feed-service.js';

/** The feed is about 30,000 characters; anything near this size is not the feed. */
const MAX_FEED_CHARS = 2_000_000;

export interface RaidBossOptions extends Omit<BossFeedOptions<RaidTier>, 'source'> {
  /**
   * Address of the raid boss feed (`raids.min.json` of ScrapedDuck): with a `manifest`, the
   * fallback.
   */
  url: string;
  store: RaidBossStore;
  /**
   * Leek Duck's raid manifest (`settings.raidBosses.manifestUrl`, plan 8B-L), read before the
   * feed, with the zone its local times are read in (`settings.timezone`); none: the feed only.
   */
  manifest?: { url: string; zone: string };
}

/** What handlers need: the boss list in effect. */
export interface RaidBossProvider {
  /** Every boss: the feed's list with the moderators' overrides applied, by tier, then name. */
  bosses(): readonly Readonly<RaidBoss>[];
  bossesOf(tier: RaidTier): RaidBoss[];
  /** What an egg of this tier hatches as when nobody says; undefined when that is not certain. */
  autoset(tier: RaidTier): RaidBoss | undefined;
}

/** What staff need of the raid boss list beyond what handlers read (`/admin boss`). */
export type RaidBossAdmin = BossAdmin<RaidTier>;

/**
 * The raid bosses: Leek Duck's rotations in force or ScrapedDuck's feed (one shape of document),
 * read with the catalogue's names and pictures.
 */
const RAID_FEED: BossFeedFamily<RaidTier> = {
  noun: 'raid boss',
  maxFeedChars: MAX_FEED_CHARS,
  ops: RAID_OPS,
  parse: (json, catalogue) => parseRaidBossFeed(json, feedLookupOf(catalogue)),
  effective: effectiveBosses,
  lastsUntilOverridesEnd: true,
  overrideProblem,
};

/**
 * Keeps the raid boss list: reads the feed on a timer, stores it, and applies the moderators'
 * overrides (`BossFeedService`). Nothing happens until `load` is called, and `load` never uses
 * the network: the bot starts with the list of the last run and the feed is read in the
 * background. With a `manifest` (plan 8B-L) a read takes the bosses of Leek Duck's rotations in
 * force (`readRaidRotations`), ScrapedDuck's feed only as the fallback, and the list is read
 * again just after the next rotation starts or ends.
 */
export class RaidBossService extends BossFeedService<RaidTier> implements RaidBossProvider {
  constructor({ manifest, ...options }: RaidBossOptions) {
    super(manifest ? { ...options, source: raidManifestSource(manifest) } : options, RAID_FEED);
  }

  bossesOf(tier: RaidTier): RaidBoss[] {
    return this.bosses().filter((boss) => sameRaidTier(boss.tier, tier));
  }

  autoset(tier: RaidTier): RaidBoss | undefined {
    return autosetBoss(this.bosses(), tier);
  }
}
