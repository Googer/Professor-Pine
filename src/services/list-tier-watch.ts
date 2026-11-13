import { BoundedMap } from '../bounded-map.js';
import {
  LIST_TIER_WINDOW_MS,
  listTierDoubt,
  sightingKey,
  type ListTierObservation,
  type ListTierSighting,
} from '../domain/ocr/list-tier-doubt.js';
import type { StoredBoss } from '../db/repositories/raid-boss-repository.js';
import { familyReport } from '../domain/pogo/boss-report.js';
import { MAX_OPS, maxBossesAt } from '../domain/pogo/max-bosses.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import {
  effectiveBosses,
  RAID_OPS,
  type Boss,
  type BossFamilyOps,
  type BossOverride,
} from '../domain/pogo/raid-bosses.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import type { ListTierNotice } from '../render/moderation.js';
import type { BossAdmin } from './boss-feed-service.js';
import type { GameDataProvider } from './game-data-service.js';
import type { ModerationReports } from './moderation-reports.js';

/** The servers whose observations are kept, and how many of one server's. */
const SERVERS = 1_000;
const PER_SERVER = 500;

export interface ListTierWatchOptions {
  /** The boss lists as staff see them (`familyReport`): the boss and the add that put it there. */
  raidBossAdmin: Pick<BossAdmin<RaidTier>, 'feedBosses' | 'overrides'>;
  maxBossAdmin: Pick<BossAdmin<MaxTier>, 'feedBosses' | 'overrides'>;
  gameData: GameDataProvider;
  reports: Pick<ModerationReports, 'listTier'>;
  /**
   * A server's zone (`ServerSettings.zoneOf`): the list is read as its members see it, its
   * rotations in force and an upcoming max boss's day there (fix round 1, L6). Without it the
   * stored list.
   */
  zoneOf?: (serverId: string) => string;
  now?: () => number;
}

/** Where a screenshot came from: the server, its channel (null outside a region's), who, which place, when. */
export type ListTierWhere = Omit<ListTierObservation, keyof ListTierSighting> & {
  serverId: string;
  channelId: string | null;
};

/**
 * Screenshots that keep disagreeing with the boss list (plan 8X-J, design section 2): every
 * screenshot's sighting (`maxTierObservation`, `raidTierObservation`) is kept in memory for a day
 * per server (a `BoundedMap`), and once `listTierDoubt` says enough screenshots show it, the
 * moderators are told (`ModerationReports.listTier`, which tells them once a week) with the boss
 * as the list has it now. A boss the list no longer has at that tier tells nothing (staff fixed
 * it). Member ids are only counted.
 */
export class ListTierWatch {
  private readonly now: () => number;
  private readonly seen = new BoundedMap<string, ListTierObservation[]>(SERVERS);

  constructor(private readonly options: ListTierWatchOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Keeps a screenshot's sighting, and tells the moderators when it is time. */
  observe(where: ListTierWhere, sighting: ListTierSighting): void {
    const now = this.now();
    const { serverId, channelId, ...who } = where;
    const kept = (this.seen.get(serverId) ?? []).filter(
      (one) => one.at > now - LIST_TIER_WINDOW_MS,
    );
    kept.push({ ...who, ...sighting });
    this.seen.set(serverId, kept.slice(-PER_SERVER));
    if (channelId === null) return;
    const doubt = listTierDoubt(kept, now).find(
      (one) => sightingKey(one) === sightingKey(sighting),
    );
    if (!doubt) return;
    const notice = this.noticeOf(doubt, serverId, channelId);
    if (notice) this.options.reports.listTier(notice);
  }

  /** The note's facts of the boss as the list has it now; undefined when it no longer has it so. */
  private noticeOf(
    doubt: ListTierSighting & { count: number },
    serverId: string,
    channelId: string,
  ): ListTierNotice | undefined {
    const { options } = this;
    const { catalogue } = options.gameData;
    const zone = options.zoneOf?.(serverId);
    const listed =
      doubt.family === 'max'
        ? listedWithAdd(
            MAX_OPS,
            maxBossesAt,
            options.maxBossAdmin,
            catalogue,
            doubt,
            this.now(),
            zone,
          )
        : listedWithAdd(
            RAID_OPS,
            effectiveBosses,
            options.raidBossAdmin,
            catalogue,
            doubt,
            this.now(),
            zone,
          );
    if (!listed) return undefined;
    const { boss: found, overrideId } = listed;
    const pokemon = found.entry
      ? found.entry.key
      : `ids:${found.pokemonId}${found.form === null ? '' : `:${found.form}`}`;
    return {
      serverId,
      channelId,
      family: doubt.family,
      bossKey: doubt.bossKey,
      listTier: doubt.listTier,
      headsTier: doubt.headsTier,
      name: found.name,
      pokemon,
      count: doubt.count,
      ...(overrideId === undefined ? {} : { overrideId }),
    };
  }
}

/**
 * The boss of a family's list in effect with the sighting's key at its list tier (a tier of the
 * family's own: the sighting's family says which), and the `add` or `autoset` in force that acts
 * on it there (review M7), both as `familyReport` gives them to `/admin boss list` (review J8).
 */
function listedWithAdd<T, R extends StoredBoss<T>>(
  ops: BossFamilyOps<T>,
  effective: Parameters<typeof familyReport<T, R>>[1],
  admin: { feedBosses(zone?: string): R[]; overrides(): BossOverride<T>[] },
  catalogue: GameDataProvider['catalogue'],
  sighting: ListTierSighting,
  now: number,
  zone: string | undefined,
): { boss: Boss<T>; overrideId?: number } | undefined {
  const tier = sighting.listTier as T;
  const report = familyReport(
    ops,
    effective,
    admin.feedBosses(zone),
    admin.overrides(),
    catalogue,
    now,
  );
  const found = report.bosses.find(
    ({ boss }) => boss.key === sighting.bossKey && ops.sameTier(boss.tier, tier),
  );
  if (!found) return undefined;
  const add =
    found.boss.source === 'override'
      ? found.overrides.find(
          ({ override }) => override.action === 'add' || override.action === 'autoset',
        )
      : undefined;
  return add ? { boss: found.boss, overrideId: add.override.id } : { boss: found.boss };
}
