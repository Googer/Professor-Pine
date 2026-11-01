import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { combatPower } from '../pogo/cp.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { cappedRanks, pvpMultipliers, pvpRank, rankedSpreads, type RankOptions } from './rank.js';

const catalogue = catalogueFixture();
const multipliers = pvpMultipliers(catalogue.cpMultipliers, 51);

function stats(key: string): PokemonEntry['stats'] {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found.stats;
}

const GREAT: RankOptions = { leagueCp: 1500, levelCap: 50, floor: 0 };

describe('pvpMultipliers', () => {
  it('has every level from 1 to the cap in steps of a half', () => {
    expect(multipliers).toHaveLength(101);
    expect(pvpMultipliers(catalogue.cpMultipliers, 50)).toHaveLength(99);
  });

  it('rounds whole levels to 32-bit floats and takes half levels from those', () => {
    const [first = 0, second = 0] = catalogue.cpMultipliers;
    expect(multipliers[0]).toBe(Math.fround(first));
    expect(multipliers[2]).toBe(Math.fround(second));
    expect(multipliers[1]).toBe(
      Math.sqrt((Math.fround(first) ** 2 + Math.fround(second) ** 2) / 2),
    );
  });

  it('refuses a level the game master does not list', () => {
    expect(() => pvpMultipliers([0.1, 0.2], 3)).toThrow(RangeError);
  });
});

describe('rankedSpreads', () => {
  const spreads = rankedSpreads(stats('mewtwo'), multipliers, GREAT);

  it('ranks all 4,096 combinations', () => {
    expect(spreads).toHaveLength(4096);
  });

  it('puts each combination at the highest level within the league and the level cap', () => {
    for (const spread of spreads) {
      expect(spread.cp).toBeLessThanOrEqual(1500);
      expect(spread.level).toBeLessThanOrEqual(50);
      const above = multipliers[spread.level * 2 - 1];
      if (spread.level < 50 && above !== undefined) {
        expect(combatPower(stats('mewtwo'), spread.ivs, above)).toBeGreaterThan(1500);
      }
    }
  });

  it('computes CP and the stats in battle as the game does', () => {
    const [best] = spreads;
    if (!best) throw new Error('no spread');
    const multiplier = multipliers[best.level * 2 - 2] ?? 0;
    const base = stats('mewtwo');
    expect(best.cp).toBe(combatPower(base, best.ivs, multiplier));
    expect(best.attack).toBe((base.attack + best.ivs.attack) * multiplier);
    expect(best.defense).toBe((base.defense + best.ivs.defense) * multiplier);
    expect(best.hp).toBe(Math.floor((base.stamina + best.ivs.stamina) * multiplier));
    // In whole numbers, as pvpivs.com has it.
    expect(best.product).toBe(Math.round(best.attack * best.defense * best.hp));
  });

  it('gives no less than 10 hit points, as the game does', () => {
    const frail = { attack: 400, defense: 400, stamina: 1 };
    const ranked = rankedSpreads(frail, multipliers, { ...GREAT, leagueCp: 40 });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((spread) => spread.hp === 10)).toBe(true);
  });

  it('orders by stat product, then attack, hit points, CP and stamina IV, as pvpivs.com', () => {
    for (let i = 1; i < spreads.length; i += 1) {
      const [a, b] = [spreads[i - 1], spreads[i]];
      if (!a || !b) continue;
      expect(a.product).toBeGreaterThanOrEqual(b.product);
      if (a.product !== b.product) continue;
      // Mewtwo's attack in Great League is above 100 throughout, out of the way of the key's flaw.
      expect(a.attack).toBeGreaterThanOrEqual(b.attack);
      if (a.attack !== b.attack) continue;
      expect(a.hp).toBeGreaterThanOrEqual(b.hp);
      if (a.hp !== b.hp) continue;
      expect(a.cp).toBeGreaterThanOrEqual(b.cp);
      if (a.cp === b.cp) expect(a.ivs.stamina).toBeGreaterThanOrEqual(b.ivs.stamina);
    }
  });

  it('ranks only the combinations at or above the floor', () => {
    const raid = rankedSpreads(stats('mewtwo'), multipliers, { ...GREAT, floor: 10 });
    expect(raid).toHaveLength(216);
    const lowest = ({ attack, defense, stamina }: (typeof raid)[number]['ivs']) =>
      Math.min(attack, defense, stamina);
    expect(raid.every((spread) => lowest(spread.ivs) >= 10)).toBe(true);
  });

  it('leaves out what is above the league already at level 1', () => {
    expect(rankedSpreads(stats('mewtwo'), multipliers, { ...GREAT, leagueCp: 10 })).toEqual([]);
  });

  it('ranks 4,096 combinations in well under 100 ms', () => {
    rankedSpreads(stats('azumarill'), multipliers, { ...GREAT, levelCap: 51 });
    const started = performance.now();
    for (const key of ['mewtwo', 'azumarill', 'medicham', 'registeel']) {
      rankedSpreads(stats(key), multipliers, { ...GREAT, levelCap: 51 });
    }
    expect((performance.now() - started) / 4).toBeLessThan(100);
  });
});

describe('pvpRank', () => {
  // The ranks pvpivs.com gives (its calculate.js of 2026-10-23, run on the same base stats).
  it('breaks a tie of the stat product by hit points, then CP, as pvpivs.com does', () => {
    // Carkol's two best have the same product, attack and CP; 0/13/14 has 171 HP, 0/14/13 170.
    const rankOf = (attack: number, defense: number, stamina: number) =>
      pvpRank(stats('carkol'), multipliers, { attack, defense, stamina }, GREAT)?.rank;
    expect(rankOf(0, 13, 14)).toBe(1);
    expect(rankOf(0, 14, 13)).toBe(2);
    expect(rankOf(0, 12, 15)).toBe(3);
    expect(rankOf(0, 15, 12)).toBe(4);
  });

  it('ranks by the stat product in whole numbers, as pvpivs.com does', () => {
    const rankOf = (league: number, attack: number, defense: number, stamina: number) =>
      pvpRank(
        stats('bulbasaur'),
        multipliers,
        { attack, defense, stamina },
        { ...GREAT, leagueCp: league },
      )?.rank;
    expect(rankOf(1500, 12, 6, 13)).toBe(676);
    expect(rankOf(1500, 12, 7, 12)).toBe(677);
    expect(rankOf(500, 0, 6, 12)).toBe(94);
    expect(rankOf(500, 0, 9, 9)).toBe(95);
    expect(rankOf(500, 0, 9, 8)).toBe(96);
  });

  it('puts an attack below 100 above one of 100 or more in a tie, as pvpivs.com does', () => {
    // Both 1,270,479; pvpivs.com's key "1270479.9999570" (attack 99.9957) reads higher than
    // "1270479.10587780" (attack 105.8778).
    const rankOf = (attack: number, defense: number, stamina: number) =>
      pvpRank(stats('bulbasaur'), multipliers, { attack, defense, stamina }, GREAT)?.rank;
    expect(rankOf(1, 15, 15)).toBe(625);
    expect(rankOf(8, 8, 15)).toBe(626);
    expect(rankOf(8, 9, 14)).toBe(627);
    expect(rankOf(2, 15, 14)).toBe(628);
  });

  it('in Master League, puts 15/15/15 first at the level cap', () => {
    const master = { leagueCp: undefined, levelCap: 50, floor: 0 } as const;
    const perfect = { attack: 15, defense: 15, stamina: 15 };
    const ranked = pvpRank(stats('dragonite'), multipliers, perfect, master);
    expect(ranked).toMatchObject({ rank: 1, of: 4096, percent: 100 });
    expect(ranked?.spread.level).toBe(50);
    expect(
      pvpRank(stats('dragonite'), multipliers, perfect, { ...master, levelCap: 51 })?.spread.level,
    ).toBe(51);
  });

  it('gives the rank, the share of the best product and the best combination', () => {
    const ivs = { attack: 10, defense: 12, stamina: 13 };
    const ranked = pvpRank(stats('mewtwo'), multipliers, ivs, GREAT);
    const spreads = rankedSpreads(stats('mewtwo'), multipliers, GREAT);
    const index = spreads.findIndex((spread) => JSON.stringify(spread.ivs) === JSON.stringify(ivs));
    expect(ranked?.rank).toBe(index + 1);
    expect(ranked?.best).toEqual(spreads[0]);
    expect(ranked?.percent).toBeCloseTo(
      ((spreads[index]?.product ?? 0) / (spreads[0]?.product ?? 1)) * 100,
      10,
    );
    expect(pvpRank(stats('mewtwo'), multipliers, spreads[0]?.ivs ?? ivs, GREAT)?.rank).toBe(1);
  });

  it('counts among the combinations of the floor only', () => {
    const ranked = pvpRank(
      stats('mewtwo'),
      multipliers,
      { attack: 10, defense: 12, stamina: 13 },
      { ...GREAT, floor: 10 },
    );
    expect(ranked?.of).toBe(216);
  });

  it('refuses IVs below the floor', () => {
    expect(() =>
      pvpRank(
        stats('mewtwo'),
        multipliers,
        { attack: 9, defense: 12, stamina: 13 },
        { ...GREAT, floor: 10 },
      ),
    ).toThrow(RangeError);
  });

  it('is undefined for a combination that cannot be in the league', () => {
    expect(
      pvpRank(
        stats('mewtwo'),
        multipliers,
        { attack: 15, defense: 15, stamina: 15 },
        { ...GREAT, leagueCp: 10 },
      ),
    ).toBeUndefined();
  });
});

describe('cappedRanks', () => {
  const ivs = { attack: 15, defense: 15, stamina: 15 };

  it('gives level 51 only where the rank, the count or the best combination differs', () => {
    const lowStats = cappedRanks(stats('mewtwo'), catalogue.cpMultipliers, ivs, {
      leagueCp: 1500,
      floor: 0,
    });
    expect(lowStats).not.toHaveProperty('level51');
    // In Master League level 51 only raises the CP: 15/15/15 is the best at either cap.
    const master = cappedRanks(stats('mewtwo'), catalogue.cpMultipliers, ivs, {
      leagueCp: undefined,
      floor: 0,
    });
    expect(master.level50?.spread.level).toBe(50);
    expect(master).not.toHaveProperty('level51');
    const medicham = cappedRanks(stats('medicham'), catalogue.cpMultipliers, ivs, {
      leagueCp: 1500,
      floor: 0,
    });
    expect(medicham.level51?.rank).not.toBe(medicham.level50?.rank);
  });

  it('takes the ranking from the source it is given, once per level cap', () => {
    const asked: RankOptions[] = [];
    const ranking = (options: RankOptions, given: readonly number[]) => {
      asked.push(options);
      return rankedSpreads(stats('medicham'), given, options);
    };
    const options = { leagueCp: 1500, floor: 0 };
    const withSource = cappedRanks(
      stats('medicham'),
      catalogue.cpMultipliers,
      ivs,
      options,
      ranking,
    );
    expect(asked).toEqual([
      { ...options, levelCap: 50 },
      { ...options, levelCap: 51 },
    ]);
    expect(withSource).toEqual(
      cappedRanks(stats('medicham'), catalogue.cpMultipliers, ivs, options),
    );
  });

  it('ranks a Super Mega up to the levels it adds too, where that differs', () => {
    const asked: number[] = [];
    const ranking = (options: RankOptions, given: readonly number[]) => {
      asked.push(options.levelCap);
      return rankedSpreads(stats('malamar_mega'), given, options);
    };
    // In Master League every combination is at the cap, and the hit points' rounding moves it.
    const master = { leagueCp: undefined, floor: 0, superMegaLevels: 2 };
    const ranks = cappedRanks(
      stats('malamar_mega'),
      catalogue.cpMultipliers,
      { attack: 10, defense: 12, stamina: 13 },
      master,
      ranking,
    );
    expect(asked).toEqual([50, 51, 52, 53]);
    expect(ranks.superMegaCap).toBe(52);
    expect(
      [ranks.level50, ranks.level51, ranks.superMega, ranks.superMegaBuddy].map((r) => [
        r?.rank,
        r?.spread.level,
      ]),
    ).toEqual([
      [280, 50],
      [214, 51],
      [217, 52],
      [229, 53],
    ]);
  });

  it('shows the levels a Super Mega adds only where they change the standing', () => {
    // In Great League Mega Malamar is at 1,500 CP long before level 50.
    const great = cappedRanks(stats('malamar_mega'), catalogue.cpMultipliers, ivs, {
      leagueCp: 1500,
      floor: 0,
      superMegaLevels: 2,
    });
    expect(great).not.toHaveProperty('superMega');
    expect(great).not.toHaveProperty('superMegaBuddy');
    // In Master League 15/15/15 is the best at every cap; another combination's rank moves.
    const master = { leagueCp: undefined, floor: 0, superMegaLevels: 2 };
    const best = cappedRanks(stats('malamar_mega'), catalogue.cpMultipliers, ivs, master);
    expect(best).not.toHaveProperty('superMega');
    const other = cappedRanks(
      stats('malamar_mega'),
      catalogue.cpMultipliers,
      { attack: 10, defense: 12, stamina: 13 },
      master,
    );
    expect(other.superMega?.spread.level).toBe(52);
  });

  it('ranks a mega that is no Super Mega as any Pokémon', () => {
    const asked: number[] = [];
    cappedRanks(
      stats('venusaur_mega'),
      catalogue.cpMultipliers,
      ivs,
      { leagueCp: undefined, floor: 0 },
      (options, given) => {
        asked.push(options.levelCap);
        return rankedSpreads(stats('venusaur_mega'), given, options);
      },
    );
    expect(asked).toEqual([50, 51]);
  });

  it('ranks the nine of the line of Eevee in Master League in well under half a second', () => {
    const eevee = catalogue.byKey('eevee');
    if (!eevee) throw new Error('no eevee');
    const line = catalogue.evolutionLine(eevee);
    expect(line).toHaveLength(9);
    const started = performance.now();
    for (const member of line) {
      cappedRanks(member.stats, catalogue.cpMultipliers, ivs, { leagueCp: undefined, floor: 0 });
    }
    expect(performance.now() - started).toBeLessThan(500);
  });
});
