import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { bossAtTier } from './boss-at-tier.js';
import type { PokemonEntry } from './game-master.js';
import type { RaidBoss } from './raid-bosses.js';

const catalogue = catalogueFixture();
const BOSSES = raidBossesFixture().bosses();
const entry = (key: string): PokemonEntry => {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(key);
  return found;
};
const listed = (key: string, level: RaidBoss['tier']['level'], shadow = false): RaidBoss => {
  const template = BOSSES[0];
  if (!template) throw new Error('no boss');
  const one = entry(key);
  return { ...template, key, name: one.name, entry: one, tier: { level, shadow } };
};
const T5 = { level: 'T5', shadow: false } as const;

describe('bossAtTier', () => {
  it('takes the list’s boss of that tier, and a Pokémon the list does not have at that tier', () => {
    const azelf = listed('azelf', 'T5');
    expect(bossAtTier(entry('azelf'), T5, [azelf])).toEqual({ kind: 'listed', boss: azelf });
    expect(bossAtTier(entry('azelf'), T5, [])).toEqual({ kind: 'unlisted' });
  });

  it('trusts the list over the tier: another level, or the other shadow kind of that level', () => {
    const t3 = listed('azelf', 'T3');
    expect(bossAtTier(entry('azelf'), T5, [t3])).toEqual({ kind: 'listed-elsewhere', boss: t3 });
    const shadow = listed('azelf', 'T5', true);
    expect(bossAtTier(entry('azelf'), T5, [shadow])).toEqual({
      kind: 'other-shadow-kind',
      boss: shadow,
    });
  });

  it('takes only a mega form for a mega raid', () => {
    const mega = { level: 'Mega', shadow: false } as const;
    expect(bossAtTier(entry('blastoise'), mega, [])).toEqual({ kind: 'not-a-mega' });
    expect(bossAtTier(entry('blastoise_mega'), mega, [])).toEqual({ kind: 'unlisted' });
  });
});
