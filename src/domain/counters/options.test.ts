import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { RAID_LEVELS, SHADOW_RAID_LEVELS, raidTier, type RaidTier } from '../pogo/raid-tier.js';
import {
  ATTACKER_LEVELS,
  counterPath,
  counterSiteLink,
  pokebattlerBossIds,
  pokebattlerRaidLevel,
  WEATHERS,
} from './options.js';

const catalogue = catalogueFixture();
const entry = (key: string) => {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no ${key} in the fixture`);
  return found;
};

describe('pokebattlerRaidLevel', () => {
  it('names the level of every tier as Pokebattler lists its raids', () => {
    const named = (tier: RaidTier) => pokebattlerRaidLevel(tier);
    expect(RAID_LEVELS.map((level) => named({ level, shadow: false }))).toEqual([
      'RAID_LEVEL_1',
      'RAID_LEVEL_3',
      'RAID_LEVEL_5',
      'RAID_LEVEL_MEGA',
      'RAID_LEVEL_MEGA_5',
      'RAID_LEVEL_5_MEGA_ENHANCED',
      'RAID_LEVEL_ELITE',
    ]);
    expect(SHADOW_RAID_LEVELS.map((level) => named({ level, shadow: true }))).toEqual([
      'RAID_LEVEL_1_SHADOW',
      'RAID_LEVEL_3_SHADOW',
      'RAID_LEVEL_5_SHADOW',
    ]);
  });

  it('has no level for a shadow tier the game does not have', () => {
    expect(raidTier('Mega', true)).toBeUndefined();
    expect(pokebattlerRaidLevel({ level: 'Mega', shadow: true })).toBeUndefined();
    expect(pokebattlerRaidLevel({ level: 'Elite', shadow: true })).toBeUndefined();
  });
});

describe('pokebattlerBossIds', () => {
  it('is the catalogue name of an ordinary species, a regional form and a mega', () => {
    expect(pokebattlerBossIds(entry('mewtwo'), false)).toEqual(['MEWTWO']);
    expect(pokebattlerBossIds(entry('arcanine_hisuian'), false)).toEqual(['ARCANINE_HISUIAN_FORM']);
    expect(pokebattlerBossIds(entry('charizard_mega_x'), false)).toEqual(['CHARIZARD_MEGA_X']);
  });

  it('falls back to the bare species id for a species known by its default form', () => {
    expect(pokebattlerBossIds(entry('landorus_incarnate'), false)).toEqual([
      'LANDORUS_INCARNATE_FORM',
      'LANDORUS',
    ]);
  });

  it('names a shadow boss <species>_SHADOW_FORM, and a mega never', () => {
    expect(pokebattlerBossIds(entry('landorus_incarnate'), true)).toEqual(['LANDORUS_SHADOW_FORM']);
    expect(pokebattlerBossIds(entry('mewtwo'), true)).toEqual(['MEWTWO_SHADOW_FORM']);
    expect(pokebattlerBossIds(entry('arcanine_hisuian'), true)).toEqual([
      'ARCANINE_HISUIAN_SHADOW_FORM',
    ]);
    expect(pokebattlerBossIds(entry('charizard_mega_x'), true)).toEqual([]);
  });
});

describe('counterPath', () => {
  it('is the legacy request for attackers of a level', () => {
    expect(
      counterPath({
        boss: 'MEWTWO',
        raidLevel: 'RAID_LEVEL_5',
        attackers: { kind: 'level', level: '40' },
        weather: 'WINDY',
        friendship: '4',
        shadow: false,
        mega: false,
      }),
    ).toBe(
      '/raids/defenders/MEWTWO/levels/RAID_LEVEL_5/attackers/levels/40/strategies/' +
        'CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC?sort=TIME&weatherCondition=WINDY&' +
        'dodgeStrategy=DODGE_REACTION_TIME&aggregation=AVERAGE&randomAssistants=-1&' +
        'friendLevel=FRIENDSHIP_LEVEL_4&includeShadow=false&includeMegas=false',
    );
  });

  it('asks Pokebattler to leave out shadow Pokémon and megas unless they are listed', () => {
    // Left out by Pokebattler, so that its list of thirty is not mostly what the answer drops
    // (staging 2026-10-16: 21 of Dialga's 30 were shadows or megas, and 9 counters were left).
    const path = (shadow: boolean, mega: boolean) =>
      counterPath({
        boss: 'DIALGA',
        raidLevel: 'RAID_LEVEL_5',
        attackers: { kind: 'level', level: '40' },
        weather: 'NO_WEATHER',
        friendship: '4',
        shadow,
        mega,
      });
    expect(path(true, false)).toContain('&includeShadow=true&includeMegas=false');
    expect(path(false, true)).toContain('&includeShadow=false&includeMegas=true');
  });

  it('asks for the Pokébox of a Pokebattler user', () => {
    expect(
      counterPath({
        boss: 'KOMMO-O',
        raidLevel: 'RAID_LEVEL_3',
        attackers: { kind: 'box', userId: 12345 },
        weather: 'NO_WEATHER',
        friendship: '0',
        shadow: true,
        mega: true,
      }),
    ).toContain('/raids/defenders/KOMMO-O/levels/RAID_LEVEL_3/attackers/users/12345/strategies/');
  });

  it('links the boss’s page on Pokebattler’s site, with what the answer left out', () => {
    // The site of 2026-10-21 reads only these options from the address (it sends the old long
    // address to `/raids/<boss>`, dropping every option).
    const link = (shadow: boolean, mega: boolean) =>
      counterSiteLink({
        boss: 'KOMMO-O',
        raidLevel: 'RAID_LEVEL_3',
        attackers: { kind: 'box', userId: 12345 },
        weather: 'WINDY',
        friendship: '0',
        shadow,
        mega,
      });
    expect(link(false, false)).toBe(
      'https://www.pokebattler.com/raids/KOMMO-O?includeShadow=0&includeMegas=0',
    );
    expect(link(true, false)).toBe('https://www.pokebattler.com/raids/KOMMO-O?includeMegas=0');
    expect(link(false, true)).toBe('https://www.pokebattler.com/raids/KOMMO-O?includeShadow=0');
    expect(link(true, true)).toBe('https://www.pokebattler.com/raids/KOMMO-O');
  });

  it('has the legacy lists', () => {
    expect(ATTACKER_LEVELS).toEqual(['20', '25', '30', '35', '40', '41', '45', '50', '51']);
    expect(WEATHERS).toHaveLength(8);
  });
});
