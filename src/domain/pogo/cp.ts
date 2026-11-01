import type { PokemonEntry } from './game-master.js';

export interface Ivs {
  attack: number;
  defense: number;
  stamina: number;
}

const PERFECT: Ivs = { attack: 15, defense: 15, stamina: 15 };
/** The lowest IVs a raid catch can have. */
const RAID_FLOOR: Ivs = { attack: 10, defense: 10, stamina: 10 };
/** Level of a raid catch (and a max battle's), and of one boosted by the weather. */
const RAID_CATCH_LEVEL = 20;
const RAID_BOOSTED_LEVEL = 25;

/**
 * The CP multiplier for a level from 1 up, in steps of a half. The game master lists whole
 * levels only; a half level is the root mean square of its neighbours.
 */
export function cpMultiplierAt(multipliers: readonly number[], level: number): number {
  const lower = multipliers[Math.floor(level) - 1];
  if (lower === undefined || level < 1 || (level * 2) % 1 !== 0) {
    throw new RangeError(`No CP multiplier for level ${level}`);
  }
  if (Number.isInteger(level)) return lower;
  const upper = multipliers[Math.floor(level)];
  if (upper === undefined) throw new RangeError(`No CP multiplier for level ${level}`);
  return Math.sqrt((lower * lower + upper * upper) / 2);
}

/** Combat power of a Pokémon with these base stats and IVs at the given CP multiplier. */
export function combatPower(stats: PokemonEntry['stats'], ivs: Ivs, multiplier: number): number {
  const cp =
    ((stats.attack + ivs.attack) *
      Math.sqrt(stats.defense + ivs.defense) *
      Math.sqrt(stats.stamina + ivs.stamina) *
      multiplier *
      multiplier) /
    10;
  return Math.max(10, Math.floor(cp));
}

export interface RaidCatchCp {
  min: number;
  max: number;
  minBoosted: number;
  maxBoosted: number;
}

/** A Pokémon caught from a shadow raid has IVs of at least 6, not 10. */
const SHADOW_RAID_FLOOR: Ivs = { attack: 6, defense: 6, stamina: 6 };

/**
 * The CP range of a Pokémon caught from a raid, without and with a weather boost. A shadow raid
 * has a lower minimum.
 */
export function raidCatchCp(
  stats: PokemonEntry['stats'],
  multipliers: readonly number[],
  shadow = false,
): RaidCatchCp {
  const floor = shadow ? SHADOW_RAID_FLOOR : RAID_FLOOR;
  const normal = cpMultiplierAt(multipliers, RAID_CATCH_LEVEL);
  const boosted = cpMultiplierAt(multipliers, RAID_BOOSTED_LEVEL);
  return {
    min: combatPower(stats, floor, normal),
    max: combatPower(stats, PERFECT, normal),
    minBoosted: combatPower(stats, floor, boosted),
    maxBoosted: combatPower(stats, PERFECT, boosted),
  };
}

export interface MaxCatchCp {
  min: number;
  max: number;
}

/**
 * The CP range of a Pokémon caught from a max battle (plan 8F-1): IVs 10/10/10 to 15/15/15 at
 * level 20, as a raid's, but never boosted by the weather (checked 2026-10-29: no source shows
 * a boosted max catch).
 */
export function maxCatchCp(
  stats: PokemonEntry['stats'],
  multipliers: readonly number[],
): MaxCatchCp {
  const level = cpMultiplierAt(multipliers, RAID_CATCH_LEVEL);
  return {
    min: combatPower(stats, RAID_FLOOR, level),
    max: combatPower(stats, PERFECT, level),
  };
}

/** The CP shown on a raid boss, which depends on the stamina the raid level gives it. */
export function raidBossCp(stats: PokemonEntry['stats'], bossStamina: number): number {
  return Math.floor(
    ((stats.attack + 15) * Math.sqrt(stats.defense + 15) * Math.sqrt(bossStamina)) / 10,
  );
}
