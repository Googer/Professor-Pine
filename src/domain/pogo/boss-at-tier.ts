import type { PokemonEntry } from './game-master.js';
import type { RaidBoss } from './raid-bosses.js';
import { sameRaidTier, type RaidLevel, type RaidTier } from './raid-tier.js';

/** The levels whose raids are against a mega form only. */
export const MEGA_LEVELS: readonly RaidLevel[] = ['Mega', 'MegaLegendary'];

/**
 * What a Pokémon is as the boss of a raid of a tier (Matt, 2026-10-25: `/raid` and the screenshot
 * reader decide it alike):
 * - `listed`: the list has it in that tier (`boss`);
 * - `unlisted`: the list does not have it at all, so it is that Pokémon at that tier;
 * - `other-shadow-kind`: the list has it in that level as the other kind, a shadow raid where a
 *   plain one was asked for or the other way round (`boss`);
 * - `listed-elsewhere`: the list has it in another level, and the list is right (`boss`);
 * - `not-a-mega`: a mega raid's boss is a mega form, never the plain Pokémon.
 */
export type BossAtTier =
  | { kind: 'listed'; boss: RaidBoss }
  | { kind: 'unlisted' }
  | { kind: 'other-shadow-kind'; boss: RaidBoss }
  | { kind: 'listed-elsewhere'; boss: RaidBoss }
  | { kind: 'not-a-mega' };

/**
 * A Pokémon as the boss of a raid of `tier`, by the boss list in effect (`BossAtTier`). An unlisted
 * mega of a legendary or mythical Pokémon would be a Mega Legendary raid, but nothing here tells
 * it from an ordinary mega: the tier asked for stands.
 */
export function bossAtTier(
  entry: PokemonEntry,
  tier: RaidTier,
  bosses: readonly RaidBoss[],
): BossAtTier {
  if (MEGA_LEVELS.includes(tier.level) && entry.kind !== 'mega') return { kind: 'not-a-mega' };
  const other = bosses.find(
    (boss) =>
      boss.key === entry.key && boss.tier.level === tier.level && boss.tier.shadow !== tier.shadow,
  );
  if (other) return { kind: 'other-shadow-kind', boss: other };
  const here = bosses.find((boss) => boss.key === entry.key && sameRaidTier(boss.tier, tier));
  if (here) return { kind: 'listed', boss: here };
  const elsewhere = bosses.find((boss) => boss.key === entry.key);
  if (elsewhere) return { kind: 'listed-elsewhere', boss: elsewhere };
  return { kind: 'unlisted' };
}
