import { combatPower, type Ivs } from '../pogo/cp.js';
import type { PokemonEntry } from '../pogo/game-master.js';

/** The leagues of Go Battle League and the CP each allows; Master League has no limit. */
export const LEAGUES = ['little', 'great', 'ultra', 'master'] as const;
export type League = (typeof LEAGUES)[number];

export const LEAGUE_CP: Readonly<Record<League, number | undefined>> = {
  little: 500,
  great: 1500,
  ultra: 2500,
  master: undefined,
};

export const LEAGUE_NAMES: Readonly<Record<League, string>> = {
  little: 'Little Cup',
  great: 'Great League',
  ultra: 'Ultra League',
  master: 'Master League',
};

/**
 * The lowest IV a Pokémon can have by how it was got: traded between ultra or best friends, a
 * raid, research or egg catch, a lucky trade. `none` is any Pokémon.
 */
export const IV_FLOORS = ['none', 'ultra-friend', 'best-friend', 'raid', 'lucky'] as const;
export type IvFloor = (typeof IV_FLOORS)[number];

export const IV_FLOOR_VALUE: Readonly<Record<IvFloor, number>> = {
  none: 0,
  'ultra-friend': 3,
  'best-friend': 5,
  raid: 10,
  lucky: 12,
};

export const IV_FLOOR_NAMES: Readonly<Record<IvFloor, string>> = {
  none: 'None',
  'ultra-friend': 'Ultra friend trade',
  'best-friend': 'Best friend trade',
  raid: 'Raid, egg or research',
  lucky: 'Lucky trade',
};

/**
 * The highest level a Pokémon can be powered up to with XL candy (50), and with a best buddy's
 * boost (51). The legacy bot's level 40 is no longer the common cap (ruling, plan 6A). A Super
 * Mega adds levels of its own to either (`GameData.superMegas`: 52 and 53 in October 2026).
 */
export const LEVEL_CAPS = [50, 51] as const;
/** A level cap: one of `LEVEL_CAPS`, or one of them with a Super Mega's levels added. */
export type LevelCap = number;

/** The highest IV of a stat. */
export const MAX_IV = 15;

/**
 * The CP multiplier of every level from 1 to `maxLevel` in steps of a half; index `2 * level -
 * 2`. A whole level's multiplier is the game master's rounded to a 32-bit float, as the game
 * keeps it; a half level's is the root mean square of its neighbours (the legacy bot's formula,
 * which matches the game's values to the CP).
 */
export function pvpMultipliers(cpMultipliers: readonly number[], maxLevel: number): number[] {
  const whole = cpMultipliers.slice(0, maxLevel).map((value) => Math.fround(value));
  if (whole.length < maxLevel) throw new RangeError(`No CP multiplier for level ${maxLevel}`);
  const levels: number[] = [];
  whole.forEach((value, index) => {
    levels.push(value);
    const next = whole[index + 1];
    if (next !== undefined) levels.push(Math.sqrt((value * value + next * next) / 2));
  });
  return levels;
}

/** The level of an index of `pvpMultipliers`. */
const levelAt = (index: number): number => index / 2 + 1;

/** One combination of IVs at the highest level it may have in a league. */
export interface Spread {
  ivs: Ivs;
  level: number;
  cp: number;
  /** The stats in battle: attack and defense to two places, whole hit points. */
  attack: number;
  defense: number;
  hp: number;
  /** Attack × defense × hit points rounded to a whole number: what the ranking is by. */
  product: number;
  /** The product and the attack stat as pvpivs.com orders them (`siteKey`). */
  siteKey: number;
}

export interface RankOptions {
  /** The CP the league allows; undefined for none. */
  leagueCp: number | undefined;
  levelCap: LevelCap;
  /** The lowest IV of each stat; combinations below it are not ranked. */
  floor: number;
}

/**
 * Every combination of IVs from `floor` to 15, each at the highest level up to `levelCap` at
 * which its CP is within the league, best first in pvpivs.com's order (`betterFirst`). A
 * combination whose CP is above the league's already at level 1 is left out.
 * `multipliers` is `pvpMultipliers(…, levelCap)` or longer.
 */
export function rankedSpreads(
  stats: PokemonEntry['stats'],
  multipliers: readonly number[],
  options: RankOptions,
): Spread[] {
  const top = Math.min(multipliers.length, options.levelCap * 2 - 1) - 1;
  const spreads: Spread[] = [];
  for (let attack = options.floor; attack <= MAX_IV; attack += 1) {
    for (let defense = options.floor; defense <= MAX_IV; defense += 1) {
      for (let stamina = options.floor; stamina <= MAX_IV; stamina += 1) {
        const ivs = { attack, defense, stamina };
        const index = highestLevel(stats, ivs, multipliers, top, options.leagueCp);
        if (index === undefined) continue;
        const multiplier = multipliers[index] ?? 0;
        const spreadAttack = (stats.attack + attack) * multiplier;
        const spreadDefense = (stats.defense + defense) * multiplier;
        const hp = Math.max(10, Math.floor((stats.stamina + stamina) * multiplier));
        // Rounded to a whole number as pvpivs.com rounds it, so that the ranks are the same.
        const product = Math.round(spreadAttack * spreadDefense * hp);
        spreads.push({
          ivs,
          level: levelAt(index),
          cp: combatPower(stats, ivs, multiplier),
          attack: spreadAttack,
          defense: spreadDefense,
          hp,
          product,
          siteKey: siteKey(product, spreadAttack),
        });
      }
    }
  }
  return spreads.sort(betterFirst);
}

/**
 * The order of the ranking, pvpivs.com's (Matt, 2026-10-23: the ranks must be the site's): the
 * stat product in whole numbers and the attack stat to five places as the site's key (`siteKey`),
 * then the hit points, the CP and the stamina IV, each higher first. Negative when `a` is better
 * than `b`, zero when equal.
 */
function betterFirst(a: Spread, b: Spread): number {
  return b.siteKey - a.siteKey || b.hp - a.hp || b.cp - a.cp || b.ivs.stamina - a.ivs.stamina;
}

/**
 * pvpivs.com's key of a combination as its `calculate.js` makes it (2026-10-23): the product, a
 * point, the attack stat × 100,000 rounded, read as one number. An attack below 100 has a digit
 * fewer after the point and so reads higher than one of 100 or more (99.9957 is `.9999570`,
 * above 105.8778's `.10587780`), a flaw of the site that the ranks copy so that they are the
 * site's; reported to the site on 2026-10-23. When the site fixes it, compare the attack stat
 * itself after the product.
 */
const siteKey = (product: number, attack: number): number =>
  Number(`${String(product)}.${String(Math.round(100_000 * attack))}`);

/** The index of the highest level up to `top` within the league's CP; CP grows with the level. */
function highestLevel(
  stats: PokemonEntry['stats'],
  ivs: Ivs,
  multipliers: readonly number[],
  top: number,
  leagueCp: number | undefined,
): number | undefined {
  const fits = (index: number): boolean =>
    leagueCp === undefined || combatPower(stats, ivs, multipliers[index] ?? 0) <= leagueCp;
  if (fits(top)) return top;
  if (!fits(0)) return undefined;
  let low = 0;
  let high = top;
  // fits(low) and not fits(high)
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** Where one combination of IVs stands among all of a Pokémon's in a league. */
export interface PvpRank {
  /** 1 is the best; combinations equal in everything ranked by share a rank. */
  rank: number;
  /** How many combinations were ranked: 4,096 without a floor. */
  of: number;
  /** The combination's stat product as a share of the best's, in percent. */
  percent: number;
  spread: Spread;
  best: Spread;
}

/**
 * The rank of `ivs` among the combinations `rankedSpreads` ranks; undefined when the
 * combination cannot be in the league at any level (its CP is too high already at level 1).
 * The IVs must not be below the floor. `spreads` is `rankedSpreads(stats, multipliers,
 * options)` when the caller has it already (the ranking does not depend on the IVs asked).
 */
export function pvpRank(
  stats: PokemonEntry['stats'],
  multipliers: readonly number[],
  ivs: Ivs,
  options: RankOptions,
  spreads: readonly Spread[] = rankedSpreads(stats, multipliers, options),
): PvpRank | undefined {
  if (Math.min(ivs.attack, ivs.defense, ivs.stamina) < options.floor) {
    throw new RangeError('The IVs are below the floor');
  }
  const index = spreads.findIndex(
    (spread) =>
      spread.ivs.attack === ivs.attack &&
      spread.ivs.defense === ivs.defense &&
      spread.ivs.stamina === ivs.stamina,
  );
  const spread = spreads[index];
  const best = spreads[0];
  if (!spread || !best) return undefined;
  return {
    // Competition ranking: combinations equal in everything `betterFirst` compares share a rank.
    rank: 1 + spreads.filter((other) => betterFirst(other, spread) < 0).length,
    of: spreads.length,
    percent: (spread.product / best.product) * 100,
    spread,
    best,
  };
}

/** The rank of one combination with each level cap. */
export interface CappedRanks {
  /** Up to level 50; undefined when the combination cannot be in the league. */
  level50: PvpRank | undefined;
  /**
   * Up to level 51 (a best buddy), when the rank, the count or the best combination differs
   * from level 50: a higher CP alone (always so in Master League) is no reason for a second
   * column.
   */
  level51?: PvpRank | undefined;
  /** For a Super Mega: 50 with the levels it adds (52), the cap of `superMega`. */
  superMegaCap?: number;
  /**
   * Up to `superMegaCap`, when that differs from the cap shown before it (level 51 when shown,
   * else 50), as level 51 differs from 50.
   */
  superMega?: PvpRank | undefined;
  /**
   * Up to `superMegaCap` + 1 (a Super Mega that is a best buddy), when that differs from the cap
   * shown before it.
   */
  superMegaBuddy?: PvpRank | undefined;
}

/** Whether one cap says something another does not: another rank, count or best. */
function differs(shown: PvpRank | undefined, next: PvpRank | undefined): boolean {
  if (!shown || !next) return shown !== next;
  const best = (ranked: PvpRank): string => JSON.stringify(ranked.best.ivs);
  return shown.rank !== next.rank || shown.of !== next.of || best(shown) !== best(next);
}

/**
 * Where the ranking of the Pokémon whose stats are given comes from: `rankedSpreads` of those
 * stats with these multipliers and options, or a copy of it that was kept (the ranking costs
 * thousands of CP computations and depends only on the Pokémon, the league, the floor and the
 * level cap).
 */
export type SpreadRanking = (
  options: RankOptions,
  multipliers: readonly number[],
) => readonly Spread[];

/**
 * The rank of `ivs` up to level 50 and, when that changes the standing, up to level 51; for a
 * Super Mega (`superMegaLevels`, `catalogue.superMegaLevels(entry)`) also up to those levels
 * more, each when it changes the standing again (a game master without multipliers that high
 * leaves them out). `cpMultipliers` are the game master's (`PokemonCatalogue.cpMultipliers`);
 * `ranking` is asked once per level cap, `rankedSpreads` itself when none is given.
 */
export function cappedRanks(
  stats: PokemonEntry['stats'],
  cpMultipliers: readonly number[],
  ivs: Ivs,
  options: Omit<RankOptions, 'levelCap'> & { superMegaLevels?: number },
  ranking: SpreadRanking = (asked, multipliers) => rankedSpreads(stats, multipliers, asked),
): CappedRanks {
  const { superMegaLevels = 0, ...rankOptions } = options;
  const added = cpMultipliers.length >= 51 + superMegaLevels ? superMegaLevels : 0;
  const multipliers = pvpMultipliers(cpMultipliers, 51 + added);
  const rankAt = (levelCap: LevelCap): PvpRank | undefined => {
    const capped = { ...rankOptions, levelCap };
    return pvpRank(stats, multipliers, ivs, capped, ranking(capped, multipliers));
  };
  const level50 = rankAt(50);
  const ranks: CappedRanks = { level50 };
  let shown = level50;
  const level51 = rankAt(51);
  if (differs(shown, level51)) {
    ranks.level51 = level51;
    shown = level51;
  }
  if (added === 0) return ranks;
  const superMega = rankAt(50 + added);
  const superMegaBuddy = rankAt(51 + added);
  if (differs(shown, superMega)) {
    ranks.superMega = superMega;
    shown = superMega;
  }
  if (differs(shown, superMegaBuddy)) ranks.superMegaBuddy = superMegaBuddy;
  if ('superMega' in ranks || 'superMegaBuddy' in ranks) ranks.superMegaCap = 50 + added;
  return ranks;
}
