import type { Boss, BossFamilyOps, RaidBoss } from './raid-bosses.js';
import { RAID_OPS } from './raid-bosses.js';

/** What members see change between two boss lists in effect. */
export interface SeenChange<T extends Boss<unknown> = RaidBoss> {
  /** Bosses of the later list that the earlier did not have (by key and tier), in its order. */
  added: T[];
  /** Bosses of the earlier list that the later does not have, in its order. */
  removed: T[];
}

/**
 * The bosses that came and went between two lists in effect (`effectiveBosses`), compared as
 * members see them: by key and tier. A boss the feed renamed (one costume id for the next) has
 * the same key and is no change; a boss an override hides or adds counts as the list shows it.
 */
export function diffBosses(before: readonly RaidBoss[], after: readonly RaidBoss[]): SeenChange {
  return diffBossesIn(RAID_OPS, before, after);
}

/** `diffBosses` for the lists of any family. */
export function diffBossesIn<T>(
  ops: Pick<BossFamilyOps<T>, 'sameTier'>,
  before: readonly Boss<T>[],
  after: readonly Boss<T>[],
): SeenChange<Boss<T>> {
  const same = (a: Boss<T>, b: Boss<T>): boolean => a.key === b.key && ops.sameTier(a.tier, b.tier);
  return {
    added: after.filter((boss) => !before.some((other) => same(boss, other))),
    removed: before.filter((boss) => !after.some((other) => same(boss, other))),
  };
}
