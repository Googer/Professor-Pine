import { describe, expect, it } from 'vitest';
import { gameDataFixture } from '../../../test/support/game-data.js';
import { combatPower, cpMultiplierAt, maxCatchCp, raidBossCp, raidCatchCp } from './cp.js';

const multipliers = gameDataFixture().cpMultipliers;
const MEWTWO = { attack: 300, defense: 182, stamina: 214 };
const PERFECT = { attack: 15, defense: 15, stamina: 15 };

describe('cpMultiplierAt', () => {
  it('returns the listed multiplier for a whole level', () => {
    expect(cpMultiplierAt(multipliers, 1)).toBe(0.094);
    expect(cpMultiplierAt(multipliers, 20)).toBe(0.5974);
    expect(cpMultiplierAt(multipliers, 40)).toBeCloseTo(0.7903, 6);
  });

  it('derives half levels from their neighbours', () => {
    expect(cpMultiplierAt(multipliers, 1.5)).toBeCloseTo(0.13513743, 7);
    expect(cpMultiplierAt(multipliers, 40.5)).toBeCloseTo(0.79280394, 7);
  });

  it('rejects levels that do not exist', () => {
    expect(() => cpMultiplierAt(multipliers, 0)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, 20.25)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, 500)).toThrow(RangeError);
    expect(() => cpMultiplierAt(multipliers, multipliers.length + 0.5)).toThrow(RangeError);
  });
});

describe('combatPower', () => {
  it('matches known values', () => {
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 20))).toBe(2387);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 25))).toBe(2984);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 40))).toBe(4178);
    expect(combatPower(MEWTWO, PERFECT, cpMultiplierAt(multipliers, 50))).toBe(4724);
  });

  it('never goes below 10', () => {
    expect(
      combatPower(
        { attack: 1, defense: 1, stamina: 1 },
        { attack: 0, defense: 0, stamina: 0 },
        0.094,
      ),
    ).toBe(10);
  });
});

describe('raid CP', () => {
  it('gives the catch range at level 20 and weather-boosted level 25', () => {
    expect(raidCatchCp(MEWTWO, multipliers)).toEqual({
      min: 2294,
      max: 2387,
      minBoosted: 2868,
      maxBoosted: 2984,
    });
  });

  it('gives a max battle’s catch range at level 20 only: never boosted (plan 8F-1)', () => {
    expect(maxCatchCp(MEWTWO, multipliers)).toEqual({ min: 2294, max: 2387 });
  });

  it('gives the CP shown on the boss from the stamina of its raid level', () => {
    expect(raidBossCp(MEWTWO, 15000)).toBe(54148);
  });
});
