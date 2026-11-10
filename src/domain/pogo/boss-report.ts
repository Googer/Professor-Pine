import type { PokemonCatalogue } from './catalogue.js';
import type { PokemonEntry } from './game-master.js';
import { titleCase } from './names.js';
import type { FeedBoss } from './raid-boss-feed.js';
import {
  effectiveBosses,
  familyBossKey,
  familyOverrideKeys,
  RAID_OPS,
  tierMoves,
  type Boss,
  type BossFamilyOps,
  type BossIds,
  type BossOverride,
} from './raid-bosses.js';
import type { RaidTier } from './raid-tier.js';

/** An override this old is marked as one to look at (`/admin boss list`). */
export const OLD_OVERRIDE_MS = 30 * 24 * 60 * 60 * 1000;

/** An override in force, with what it is for. */
export interface ReportedOverride<T = RaidTier> {
  override: BossOverride<T>;
  /** The `RaidBoss.key` of the Pokémon it is for. */
  key: string;
  /** Its catalogue entry; undefined for a Pokémon the game master does not know. */
  entry: PokemonEntry | undefined;
  /** How it is named: the entry's name, or the title-cased id. */
  name: string;
  /**
   * Why it may be time to remove it: `age` (older than `OLD_OVERRIDE_MS`), `feed-lists-it` (an
   * `add` for a boss the feed lists in that tier anyway), `feed-dropped-it` (a `hide` or a
   * `shiny` for a Pokémon the feed does not list in that tier, or in any tier). Empty when none.
   */
  old: ('age' | 'feed-lists-it' | 'feed-dropped-it')[];
  /**
   * For an `add` or `autoset`: the tiers of its group the feed lists its boss at that it leaves
   * out (plan 8X-J, `tierMoves`), lowest first; empty when it moves nothing.
   */
  moved: T[];
  /**
   * The names the list had for its boss at the `moved` tiers (the catalogue's, or the feed's for a
   * Pokémon the game master does not know): how a running battle of it may be stored (review J6).
   */
  movedNames: string[];
}

/** A boss of the list in effect, with where it came from. */
export interface ReportedBoss<R extends FeedBoss<T>, T = RaidTier> {
  boss: Boss<T>;
  /** The feed rows it was made of; empty for a boss that only an override adds. */
  rows: R[];
  /** The overrides in force that add it, chose it for eggs, or set its shiny flag. */
  overrides: ReportedOverride<T>[];
}

export interface BossReport<R extends FeedBoss<T>, T = RaidTier> {
  /** The list in effect, in its order (`effectiveBosses`). */
  bosses: ReportedBoss<R, T>[];
  /** The `hide` overrides in force, oldest first. */
  hidden: ReportedOverride<T>[];
  /**
   * The other overrides in force that touch no boss of the list: an `add` or `autoset` whose
   * boss is hidden, a `shiny` for a Pokémon that is no boss now. Oldest first.
   */
  idle: ReportedOverride<T>[];
}

/**
 * The raid boss list in effect at `now`, as staff look at it: every boss with the feed rows it
 * came from and the overrides that act on it, the hidden ones apart, and the overrides that act
 * on nothing. Expired overrides are left out, as `effectiveBosses` leaves them out.
 */
export function bossReport<R extends FeedBoss>(
  feed: readonly R[],
  overrides: readonly BossOverride[],
  catalogue: PokemonCatalogue,
  now: number,
): BossReport<R> {
  return familyReport(RAID_OPS, effectiveBosses, feed, overrides, catalogue, now);
}

/**
 * `bossReport` for the list of any family (plan 8X-2: the max bosses), whose list in effect is
 * `effective`.
 */
export function familyReport<T, R extends FeedBoss<T>>(
  ops: BossFamilyOps<T>,
  effective: (
    feed: readonly R[],
    overrides: readonly BossOverride<T>[],
    catalogue: PokemonCatalogue,
    now: number,
  ) => Boss<T>[],
  feed: readonly R[],
  overrides: readonly BossOverride<T>[],
  catalogue: PokemonCatalogue,
  now: number,
): BossReport<R, T> {
  const touches = (override: BossOverride<T>, tier: T): boolean =>
    override.tier === null || ops.sameTier(override.tier, tier);
  const active = overrides
    .filter((override) => override.expiresAt === null || override.expiresAt > now)
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const rows = feed.map((row) => {
    const { key, entry } = familyBossKey(ops, row, catalogue);
    return { row, key, name: entry?.name ?? row.name };
  });
  const listed = (key: string, tier: T | null): boolean =>
    rows.some((one) => one.key === key && (tier === null || ops.sameTier(one.row.tier, tier)));
  const keyOf = familyOverrideKeys(ops, feed, catalogue);
  const targets = active.map((override) => ({ override, ...keyOf(override) }));
  const costumed = (ids: BossIds & { name?: string; image?: string }): boolean =>
    ops.costumed?.(catalogue, ids) === true;
  const moves = tierMoves(ops, targets, costumed);
  // As in the list in effect: a boss of a tier is costumed when a row of it there is.
  const costumedAt = (key: string, tier: T): boolean =>
    rows.some((one) => one.key === key && ops.sameTier(one.row.tier, tier) && costumed(one.row));
  const groupOf = (tier: T): string | undefined => ops.oneTierAmong?.(tier);
  const reported = targets.map(({ override, key, entry }): ReportedOverride<T> => {
    const old: ReportedOverride['old'] = [];
    if (now - override.createdAt > OLD_OVERRIDE_MS) old.push('age');
    const moved: T[] = [];
    const movedNames: string[] = [];
    for (const { row, key: rowKey, name: rowName } of rows) {
      if (
        rowKey !== key ||
        !moves
          .moversFrom(key, row.tier, costumedAt(key, row.tier))
          .some((one) => one.override.id === override.id)
      ) {
        continue;
      }
      if (!moved.some((tier) => ops.sameTier(tier, row.tier))) moved.push(row.tier);
      if (!movedNames.includes(rowName)) movedNames.push(rowName);
    }
    moved.sort((a, b) => ops.rank(a) - ops.rank(b));
    const elsewhere = (tier: T): boolean => {
      const group = groupOf(tier);
      return (
        group !== undefined &&
        rows.some(
          (one) =>
            one.key === key &&
            groupOf(one.row.tier) === group &&
            !ops.sameTier(one.row.tier, tier) &&
            // A costume is a boss of its own (review J7), as `tierMoves` has it.
            !costumedAt(key, one.row.tier),
        )
      );
    };
    if (
      override.action === 'add' &&
      override.tier !== null &&
      listed(key, override.tier) &&
      !elsewhere(override.tier)
    ) {
      old.push('feed-lists-it');
    }
    if (
      (override.action === 'hide' || override.action === 'shiny') &&
      !listed(key, override.tier)
    ) {
      old.push('feed-dropped-it');
    }
    const name = entry?.name ?? titleCase(override.form ?? override.pokemonId);
    return { override, key, entry, name, old, moved, movedNames };
  });

  const used = new Set<number>();
  const bosses = effective(feed, overrides, catalogue, now).map((boss) => {
    const acting = reported.filter(
      ({ override, key }) =>
        override.action !== 'hide' && key === boss.key && touches(override, boss.tier),
    );
    for (const one of acting) used.add(one.override.id);
    return {
      boss,
      rows: rows
        .filter((one) => one.key === boss.key && ops.sameTier(one.row.tier, boss.tier))
        .map((one) => one.row),
      overrides: acting,
    };
  });
  return {
    bosses,
    hidden: reported.filter(({ override }) => override.action === 'hide'),
    idle: reported.filter(({ override }) => override.action !== 'hide' && !used.has(override.id)),
  };
}
