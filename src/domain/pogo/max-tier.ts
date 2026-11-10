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

/** A max boss as its labels name it: its name, and its catalogue key where it has one. */
export interface MaxBossNaming {
  name: string;
  key?: string | undefined;
}

/** The species of the one Eternamax boss, as its catalogue keys begin. */
const ETERNAMAX_SPECIES = 'eternatus';

/**
 * Whether a catalogue key is Eternatus's (`eternatus`, the form `eternatus_eternamax`): the one
 * Eternamax boss, a Gigantamax battle in all but the name (its screen says "Eternamax").
 */
function isEternatusKey(key: string | undefined): boolean {
  return key === ETERNAMAX_SPECIES || key?.startsWith(`${ETERNAMAX_SPECIES}_`) === true;
}

/**
 * Whether a catalogue entry is the Eternamax form itself (`ETERNATUS_ETERNAMAX`): the one an
 * Eternamax screen shows, where the boss list may have both of Eternatus's entries.
 */
export function isEternamaxForm(entry: { form?: string | null } | undefined): boolean {
  return entry?.form?.endsWith('_ETERNAMAX') === true;
}

/**
 * Whether a boss at a tier is an Eternamax battle: Eternatus, by either catalogue entry, at `G`
 * (Matt, 2026-10-22). The one decision every label of a max boss reads (`maxBattleWord`).
 */
export function isEternamax(boss: { key?: string | undefined }, tier: MaxTier): boolean {
  return tier === 'G' && isEternatusKey(boss.key);
}

/**
 * The word of a boss's battle, as the game's screen says it: `Dynamax` for the stars,
 * `Gigantamax` for `G`, and `Eternamax` for Eternatus at `G`.
 */
export function maxBattleWord(
  boss: { key?: string | undefined },
  tier: MaxTier,
): 'Dynamax' | 'Gigantamax' | 'Eternamax' {
  if (tier !== 'G') return 'Dynamax';
  return isEternamax(boss, tier) ? 'Eternamax' : 'Gigantamax';
}

/** The tier in words beside a boss: `maxTierLabel`, but `Eternamax` for Eternatus's battle. */
export function maxBossTierLabel(boss: { key?: string | undefined }, tier: MaxTier): string {
  return isEternamax(boss, tier) ? 'Eternamax' : maxTierLabel(tier);
}

/**
 * A battle at `G` named by its word: `Gigantamax Machamp`, `Eternamax Eternatus` (its form's
 * name, `Eternatus (Eternamax)`, without the form, which the word says).
 */
function gigantamaxName(boss: MaxBossNaming): string {
  const word = maxBattleWord(boss, 'G');
  return word === 'Eternamax'
    ? `${word} ${boss.name.replace(/ \(Eternamax\)$/, '')}`
    : `${word} ${boss.name}`;
}

/**
 * A boss as a post heads it: `Dynamax Machamp (2★)`, `Gigantamax Machamp`, `Eternamax
 * Eternatus`.
 */
export function maxBossTitle(boss: MaxBossNaming, tier: MaxTier): string {
  const stars = maxStars(tier);
  return stars === undefined ? gigantamaxName(boss) : `Dynamax ${boss.name} (${String(stars)}★)`;
}

/**
 * A boss as a list of choices offers it: `Machamp · Dynamax 2★`, `Gigantamax Machamp`, so that
 * the Dynamax and the Gigantamax battle of one Pokémon are two choices; Eternatus's is
 * `Eternamax Eternatus`.
 */
export function maxBossChoiceName(boss: MaxBossNaming, tier: MaxTier): string {
  return tier === 'G' ? gigantamaxName(boss) : `${boss.name} · ${maxTierLabel(tier)}`;
}
