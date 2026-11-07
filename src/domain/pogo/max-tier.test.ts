import { describe, expect, it } from 'vitest';
import {
  BATTLE_KINDS,
  battleKindOf,
  isEternamax,
  isEternamaxForm,
  isMaxTier,
  maxBattleWord,
  maxBossTierLabel,
  MAX_TIERS,
  maxBossChoiceName,
  maxBossTitle,
  maxStars,
  maxTierLabel,
  type MaxTier,
} from './max-tier.js';

describe('max battle tiers', () => {
  it('are the five Dynamax tiers and Gigantamax, in that order', () => {
    expect(MAX_TIERS).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'G']);
  });

  it('are told from other text, raid levels included', () => {
    for (const tier of MAX_TIERS) expect(isMaxTier(tier)).toBe(true);
    for (const other of ['T5', 'd2', 'D6', 'G1', 'Mega', '']) expect(isMaxTier(other)).toBe(false);
  });

  it('fit the level column of the boss tables (16 characters)', () => {
    for (const tier of MAX_TIERS) expect(tier.length).toBeLessThanOrEqual(16);
  });

  it('count their stars; Gigantamax has none', () => {
    expect(MAX_TIERS.map(maxStars)).toEqual([1, 2, 3, 4, 5, undefined]);
  });
});

describe('the kind of battle', () => {
  it('is raid, dynamax or gigantamax', () => {
    expect(BATTLE_KINDS).toEqual(['raid', 'dynamax', 'gigantamax']);
  });

  it('of a raid tier is raid, whatever its level', () => {
    expect(battleKindOf({ level: 'T5', shadow: true })).toBe('raid');
    expect(battleKindOf({ level: 'SuperMega', shadow: false })).toBe('raid');
  });

  it('of a max tier is dynamax for the stars and gigantamax for G', () => {
    const kinds = MAX_TIERS.map((tier) => battleKindOf(tier));
    expect(kinds).toEqual(['dynamax', 'dynamax', 'dynamax', 'dynamax', 'dynamax', 'gigantamax']);
  });
});

describe('the words of a max tier', () => {
  const tiers: MaxTier[] = ['D2', 'G'];

  it('name the tier', () => {
    expect(tiers.map(maxTierLabel)).toEqual(['Dynamax 2★', 'Gigantamax']);
  });

  it('name a boss as a post heads it', () => {
    expect(tiers.map((tier) => maxBossTitle({ name: 'Machamp', key: 'machamp' }, tier))).toEqual([
      'Dynamax Machamp (2★)',
      'Gigantamax Machamp',
    ]);
  });

  it('name a boss as a list of choices offers it: two entries for one Pokémon', () => {
    expect(
      tiers.map((tier) => maxBossChoiceName({ name: 'Machamp', key: 'machamp' }, tier)),
    ).toEqual(['Machamp · Dynamax 2★', 'Gigantamax Machamp']);
  });
});

describe('Eternatus, the one Eternamax boss', () => {
  const species = { name: 'Eternatus', key: 'eternatus' };
  const form = { name: 'Eternatus (Eternamax)', key: 'eternatus_eternamax' };

  it('is named Eternamax where a Gigantamax battle would be, in every label of a boss', () => {
    for (const boss of [species, form]) {
      expect(isEternamax(boss, 'G')).toBe(true);
      expect(maxBattleWord(boss, 'G')).toBe('Eternamax');
      expect(maxBossTitle(boss, 'G')).toBe('Eternamax Eternatus');
      expect(maxBossChoiceName(boss, 'G')).toBe('Eternamax Eternatus');
      expect(maxBossTierLabel(boss, 'G')).toBe('Eternamax');
    }
  });

  it('is decided by the catalogue key, not by the name', () => {
    expect(isEternamax({ key: 'eternatusish' }, 'G')).toBe(false);
    expect(maxBossTitle({ name: 'Eternatus' }, 'G')).toBe('Gigantamax Eternatus');
    expect(maxBossTitle({ name: 'Eternatus', key: 'eternatus' }, 'D5')).toBe(
      'Dynamax Eternatus (5★)',
    );
  });

  it('leaves every other boss, and a Dynamax tier, as they were', () => {
    const machamp = { name: 'Machamp', key: 'machamp' };
    expect(maxBattleWord(machamp, 'G')).toBe('Gigantamax');
    expect(maxBattleWord(species, 'D5')).toBe('Dynamax');
    expect(maxBossTierLabel(machamp, 'G')).toBe('Gigantamax');
    expect(maxBossTierLabel(species, 'D5')).toBe('Dynamax 5★');
  });

  it('knows the Eternamax form among the entries', () => {
    expect(isEternamaxForm({ form: 'ETERNATUS_ETERNAMAX' })).toBe(true);
    expect(isEternamaxForm({ form: null })).toBe(false);
    expect(isEternamaxForm(undefined)).toBe(false);
  });
});
