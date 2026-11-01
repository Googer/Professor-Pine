import { describe, expect, it } from 'vitest';
import {
  EGG_PICTURE_NAMES,
  raidEggName,
  RAID_EGG_PICTURES_URL,
  type EggBoss,
} from './raid-eggs.js';

const tier = (level: Parameters<typeof raidEggName>[0]['level'], shadow = false) => ({
  level,
  shadow,
});
const boss = (key: string, cls: 'legendary' | 'ultra-beast' | null = null): EggBoss => ({
  key,
  entry: { key, class: cls },
});

describe('raidEggName', () => {
  it('shows the egg of each tier, a shadow egg as the plain one, a super mega none', () => {
    expect(raidEggName(tier('T1'), [])).toBe('raid_egg_0_icon');
    expect(raidEggName(tier('T3', true), [])).toBe('raid_egg_1_icon');
    expect(raidEggName(tier('T5'), [boss('yveltal', 'legendary')])).toBe('raid_egg_2_icon');
    expect(raidEggName(tier('Mega'), [])).toBe('raid_egg_3_icon');
    expect(raidEggName(tier('MegaLegendary'), [])).toBe('raid_egg_4_icon');
    expect(raidEggName(tier('Elite'), [])).toBe('raid_egg_extended_icon');
    expect(raidEggName(tier('SuperMega'), [])).toBeUndefined();
  });

  it('shows the wormhole when every T5 boss is an ultra beast, the primal egg for primals', () => {
    const beasts = [boss('nihilego', 'ultra-beast'), boss('buzzwole', 'ultra-beast')];
    expect(raidEggName(tier('T5'), beasts)).toBe('raid_ultra_icon');
    expect(raidEggName(tier('T5'), [...beasts, boss('yveltal', 'legendary')])).toBe(
      'raid_egg_2_icon',
    );
    expect(
      raidEggName(tier('MegaLegendary'), [boss('groudon_primal'), boss('kyogre_primal')]),
    ).toBe('raid_egg_primal_icon');
  });

  it('names only pictures of the list the bot carries', () => {
    const levels = ['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'SuperMega', 'Elite'] as const;
    const named = [
      ...levels.map((level) => raidEggName(tier(level), [])),
      raidEggName(tier('T5'), [boss('nihilego', 'ultra-beast')]),
      raidEggName(tier('MegaLegendary'), [boss('groudon_primal')]),
    ].filter((name) => name !== undefined);
    expect([...new Set(named)].sort()).toEqual([...EGG_PICTURE_NAMES].sort());
  });

  it('takes the pictures from pogo_assets at a fixed commit', () => {
    expect(RAID_EGG_PICTURES_URL).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/Raids\/$/,
    );
  });
});
