import { readFileSync } from 'node:fs';
import path from 'node:path';
import { zonedAt } from './time.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Pokebattler's `GET https://fight.pokebattler.com/raids` as downloaded on 2026-10-20 at 21:54
 * (America/New_York), trimmed to every max tier with its `_FUTURE` and `_LEGACY` twins, the raid
 * tier `RAID_LEVEL_5` and `dynamaxPokemon`; every entry kept as the feed had it. Today's max
 * bosses: 36 of `RAID_LEVEL_1_MAX`, 6 of `_2_MAX`, 13 of `_3_MAX`, 2 of `_4_MAX` (Duraludon,
 * Toxtricity) and 3 of `_5_MAX` (Azelf, Mesprit, Uxie, upcoming from 2026-10-24T21:00Z), none of
 * `RAID_LEVEL_6_MAX`.
 */
export function readPokebattlerFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'pokebattler-raids.json'), 'utf8'));
}

/** The zone of the test settings. */
export const MAX_ZONE = 'America/New_York';

/** When the Pokebattler fixture was downloaded. */
export const MAX_FEED_READ_AT = zonedAt('2026-10-20T21:54', MAX_ZONE);

/** A time of the test zone, as epoch ms: `at('2026-10-24T14:00')`. */
export function at(local: string): number {
  return zonedAt(local, MAX_ZONE);
}

/** A feed of Pokebattler's shape with these tiers, each a list of entries (`pokemonId` given). */
export function pokebattlerFeed(tiers: Record<string, Record<string, unknown>[]>): unknown {
  return {
    tiers: Object.entries(tiers).map(([tier, raids]) => ({
      tier,
      raids: raids.map((raid) => ({
        pokemon: raid['pokemonId'],
        shiny: false,
        verified: false,
        ...raid,
      })),
    })),
  };
}
