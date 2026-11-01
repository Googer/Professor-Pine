import type { RaidTier } from './raid-tier.js';

/**
 * The tiers of max battles (design `2026-10-20-max-battles-design.md`, section 10: one spelling
 * of the tiers): Dynamax 1 to 5 stars and Gigantamax. The same strings are a max battle's tier
 * in its state document and its history record, and `RaidBoss.level` / `RaidBossOverride.level`
 * of a max boss, where the unique key keeps them apart from the raid levels (`RaidLevel`).
 */
export const MAX_TIERS = ['D1', 'D2', 'D3', 'D4', 'D5', 'G'] as const;
export type MaxTier = (typeof MAX_TIERS)[number];

/**
 * The kinds of battle, for lobby sizes (`settings.lobbies`) and the kinds of train: only those
 * two read it; everything else reads the tier.
 */
export const BATTLE_KINDS = ['raid', 'dynamax', 'gigantamax'] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];

export function isMaxTier(value: string): value is MaxTier {
  return (MAX_TIERS as readonly string[]).includes(value);
}

/** The kind of battle of a tier: a raid tier is `raid`, `G` is `gigantamax`, a star `dynamax`. */
export function battleKindOf(tier: RaidTier | MaxTier): BattleKind {
  if (typeof tier !== 'string') return 'raid';
  return tier === 'G' ? 'gigantamax' : 'dynamax';
}

/** The stars of a Dynamax tier; undefined for Gigantamax. */
export function maxStars(tier: MaxTier): number | undefined {
  return tier === 'G' ? undefined : Number(tier.slice(1));
}

/** The tier in words: `Dynamax 2★`, `Gigantamax`. */
export function maxTierLabel(tier: MaxTier): string {
  const stars = maxStars(tier);
  return stars === undefined ? 'Gigantamax' : `Dynamax ${String(stars)}★`;
}

/** A boss as a post heads it: `Dynamax Machamp (2★)`, `Gigantamax Machamp`. */
export function maxBossTitle(name: string, tier: MaxTier): string {
  const stars = maxStars(tier);
  return stars === undefined ? `Gigantamax ${name}` : `Dynamax ${name} (${String(stars)}★)`;
}

/**
 * A boss as a list of choices offers it: `Machamp · Dynamax 2★`, `Gigantamax Machamp`, so that
 * the Dynamax and the Gigantamax battle of one Pokémon are two choices.
 */
export function maxBossChoiceName(name: string, tier: MaxTier): string {
  return tier === 'G' ? `Gigantamax ${name}` : `${name} · ${maxTierLabel(tier)}`;
}
