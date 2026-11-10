import { describe, expect, it } from 'vitest';
import {
  RAID_LEVELS,
  RETIRED_EX_LEVEL,
  bossStamina,
  isRaidLevel,
  raidDurationKind,
  RAID_TIER_GROUPS,
  raidTierGroup,
  raidTier,
  raidTierLabel,
  raidWords,
  sameRaidTier,
} from './raid-tier.js';

describe('raidTierGroup (plan 8M-7)', () => {
  it('puts every tier in one group: its level, Mega for every mega, Elite, Shadow for every shadow', () => {
    const groups = RAID_LEVELS.flatMap((level) =>
      [false, true].flatMap((shadow) => {
        const tier = raidTier(level, shadow);
        return tier ? [[raidWords(tier), raidTierGroup(tier)]] : [];
      }),
    );
    expect(Object.fromEntries(groups)).toEqual({
      'Level 1 raid': '1',
      'Shadow Level 1 raid': 'shadow',
      'Level 3 raid': '3',
      'Shadow Level 3 raid': 'shadow',
      'Level 5 raid': '5',
      'Shadow Level 5 raid': 'shadow',
      'Mega raid': 'mega',
      'Mega Legendary raid': 'mega',
      'Super Mega raid': 'mega',
      'Elite raid': 'elite',
    });
    expect(RAID_TIER_GROUPS).toEqual(['1', '3', '5', 'mega', 'elite', 'shadow']);
  });
});

describe('raid tiers', () => {
  it('names every level', () => {
    expect(RAID_LEVELS).toEqual(['T1', 'T3', 'T5', 'Mega', 'MegaLegendary', 'SuperMega', 'Elite']);
    // The EX tier is gone (plan 4F): what was stored with it is no level any more.
    expect(RETIRED_EX_LEVEL).toBe('EX');
    expect(isRaidLevel(RETIRED_EX_LEVEL)).toBe(false);
    expect(isRaidLevel('SuperMega')).toBe(true);
    expect(isRaidLevel('T5')).toBe(true);
    expect(isRaidLevel('T2')).toBe(false);
  });

  it('allows shadow only for T1, T3 and T5', () => {
    expect(raidTier('T5', true)).toEqual({ level: 'T5', shadow: true });
    expect(raidTier('T1')).toEqual({ level: 'T1', shadow: false });
    expect(raidTier('Mega', true)).toBeUndefined();
    expect(raidTier('Elite', true)).toBeUndefined();
    expect(raidTier('SuperMega', true)).toBeUndefined();
  });

  it('labels tiers for people', () => {
    expect(raidTierLabel({ level: 'T5', shadow: false })).toBe('T5');
    expect(raidWords({ level: 'T5', shadow: false })).toBe('Level 5 raid');
    expect(raidWords({ level: 'T1', shadow: false })).toBe('Level 1 raid');
    expect(raidWords({ level: 'T3', shadow: true })).toBe('Shadow Level 3 raid');
    expect(raidWords({ level: 'Mega', shadow: false })).toBe('Mega raid');
    expect(raidWords({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary raid');
    expect(raidWords({ level: 'SuperMega', shadow: false })).toBe('Super Mega raid');
    expect(raidWords({ level: 'Elite', shadow: false })).toBe('Elite raid');
    expect(raidTierLabel({ level: 'T3', shadow: true })).toBe('Shadow T3');
    expect(raidTierLabel({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary');
    expect(raidTierLabel({ level: 'SuperMega', shadow: false })).toBe('Super Mega');
  });

  it('knows the boss stamina of each level', () => {
    expect(RAID_LEVELS.map((level) => bossStamina({ level, shadow: false }))).toEqual([
      600, 3600, 15000, 9000, 22500, 25000, 20000,
    ]);
    expect(bossStamina({ level: 'T5', shadow: true })).toBe(15000);
    expect(bossStamina({ level: 'T1', shadow: true })).toBe(600);
    expect(bossStamina({ level: 'T3', shadow: true })).toBe(4000);
  });

  it('knows which durations apply', () => {
    expect(raidDurationKind({ level: 'T5', shadow: true })).toBe('standard');
    expect(raidDurationKind({ level: 'Mega', shadow: false })).toBe('standard');
    expect(raidDurationKind({ level: 'SuperMega', shadow: false })).toBe('standard');
    expect(raidDurationKind({ level: 'Elite', shadow: false })).toBe('elite');
  });

  it('compares tiers by level and shadow', () => {
    expect(sameRaidTier({ level: 'T5', shadow: false }, { level: 'T5', shadow: false })).toBe(true);
    expect(sameRaidTier({ level: 'T5', shadow: false }, { level: 'T5', shadow: true })).toBe(false);
  });
});
