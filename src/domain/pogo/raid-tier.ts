import type { RaidKind } from '../time/party-time.js';

/**
 * The kinds of raid. Shadow raids are a flag on top of T1, T3 and T5. In the game a mega
 * legendary raid is tier 6 and a super mega raid tier 7. There is no EX tier any more (plan 4F;
 * Matt, 2026-10-13): the game has had no EX raid since early 2020 and turned EX gyms into elite
 * raid gyms. What was stored with it is read as elite or left alone (`RETIRED_EX_LEVEL`).
 */
export const RAID_LEVELS = [
  'T1',
  'T3',
  'T5',
  'Mega',
  'MegaLegendary',
  'SuperMega',
  'Elite',
] as const;
export type RaidLevel = (typeof RAID_LEVELS)[number];

export interface RaidTier {
  level: RaidLevel;
  shadow: boolean;
}

/**
 * How the EX tier was stored while it existed: in the state document of a raid, which is read
 * as an elite raid (`party-state.ts`), and in the `RaidBoss` and `RaidBossOverride` tables,
 * whose rows with it are no boss this version can show.
 */
export const RETIRED_EX_LEVEL = 'EX';

/** Levels that also exist as shadow raids. */
export const SHADOW_RAID_LEVELS: readonly RaidLevel[] = ['T1', 'T3', 'T5'];

const LABELS: Readonly<Record<RaidLevel, string>> = {
  T1: 'T1',
  T3: 'T3',
  T5: 'T5',
  Mega: 'Mega',
  MegaLegendary: 'Mega Legendary',
  SuperMega: 'Super Mega',
  Elite: 'Elite',
};

/**
 * Stamina the game gives a boss of each level, which sets the CP shown on the boss. A super mega
 * raid has 25,000 whether or not its boss is legendary (Bulbapedia, "Raid Battle (GO)").
 */
const BOSS_STAMINA: Readonly<Record<RaidLevel, number>> = {
  T1: 600,
  T3: 3600,
  T5: 15000,
  Mega: 9000,
  MegaLegendary: 22500,
  SuperMega: 25000,
  Elite: 20000,
};

/** Which incubation and hatched durations apply (see `RaidKind` in domain/time). */
const DURATION_KIND: Readonly<Record<RaidLevel, RaidKind>> = {
  T1: 'standard',
  T3: 'standard',
  T5: 'standard',
  Mega: 'standard',
  MegaLegendary: 'standard',
  SuperMega: 'standard',
  Elite: 'elite',
};

export function isRaidLevel(value: string): value is RaidLevel {
  return (RAID_LEVELS as readonly string[]).includes(value);
}

/** A tier, or undefined when the level has no shadow raids and `shadow` was asked for. */
export function raidTier(level: RaidLevel, shadow = false): RaidTier | undefined {
  if (shadow && !SHADOW_RAID_LEVELS.includes(level)) return undefined;
  return { level, shadow };
}

const WORDS: Readonly<Record<RaidLevel, string>> = {
  T1: 'Level 1',
  T3: 'Level 3',
  T5: 'Level 5',
  Mega: 'Mega',
  MegaLegendary: 'Mega Legendary',
  SuperMega: 'Super Mega',
  Elite: 'Elite',
};

/**
 * What a raid of a tier is called in its post and in a direct message, as the legacy bot said
 * it: `Level 5 raid`, `Shadow Level 3 raid`, `Mega Legendary raid` (a primal's too).
 */
export function raidWords(tier: RaidTier): string {
  return `${tier.shadow ? 'Shadow ' : ''}${WORDS[tier.level]} raid`;
}

/**
 * The groups of tiers the map tells apart (plan 8M-7: the ring of a raid's marker, a named color
 * of `theme.css` each): the plain levels 1, 3 and 5, every mega (Mega, Mega Legendary, Super
 * Mega), elite, and every shadow raid.
 */
export const RAID_TIER_GROUPS = ['1', '3', '5', 'mega', 'elite', 'shadow'] as const;
export type RaidTierGroup = (typeof RAID_TIER_GROUPS)[number];

const TIER_GROUPS: Readonly<Record<RaidLevel, RaidTierGroup>> = {
  T1: '1',
  T3: '3',
  T5: '5',
  Mega: 'mega',
  MegaLegendary: 'mega',
  SuperMega: 'mega',
  Elite: 'elite',
};

/** The group of a tier: shadow for any shadow raid, else its level's. */
export function raidTierGroup(tier: RaidTier): RaidTierGroup {
  return tier.shadow ? 'shadow' : TIER_GROUPS[tier.level];
}

/** `T5`, `Shadow T5`, `Mega Legendary`. */
export function raidTierLabel(tier: RaidTier): string {
  return `${tier.shadow ? 'Shadow ' : ''}${LABELS[tier.level]}`;
}

/** A shadow T3 boss has more stamina than a plain one; shadow T1 and T5 have the same. */
const SHADOW_T3_STAMINA = 4000;

export function bossStamina(tier: RaidTier): number {
  return tier.shadow && tier.level === 'T3' ? SHADOW_T3_STAMINA : BOSS_STAMINA[tier.level];
}

export function raidDurationKind(tier: RaidTier): RaidKind {
  return DURATION_KIND[tier.level];
}

/**
 * Whether an egg of this tier is made only with its hatch time (review 8E-1 of plan 8E, plan
 * 8F-1): without it an Elite egg would stand its whole incubation, about a day, and keep every
 * other report off its gym. `/raid`, the map, the screenshot readers and a change of tier ask it.
 */
export function eggNeedsHatchTime(tier: RaidTier): boolean {
  return raidDurationKind(tier) === 'elite';
}

export function sameRaidTier(a: RaidTier, b: RaidTier): boolean {
  return a.level === b.level && a.shadow === b.shadow;
}
