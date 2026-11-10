import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { cappedRanks, rankedSpreads, type RankOptions } from '../../domain/pvp/rank.js';
import { SpreadMemo } from './spread-memo.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

/** A memo that counts how often it really ranks. */
function counted(max?: number) {
  const computed: string[] = [];
  const memo = new SpreadMemo(max, (stats, multipliers, options) => {
    computed.push(`${String(options.leagueCp)}|${String(options.floor)}|${options.levelCap}`);
    return rankedSpreads(stats, multipliers, options);
  });
  return { memo, computed };
}

const GREAT = { leagueCp: 1500, floor: 0 };

describe('SpreadMemo', () => {
  it('ranks a Pokémon in a league once, whatever IVs are asked about', () => {
    const { memo, computed } = counted();
    const medicham = entry('medicham');
    const rank = (ivs: { attack: number; defense: number; stamina: number }) =>
      cappedRanks(
        medicham.stats,
        catalogue.cpMultipliers,
        ivs,
        GREAT,
        memo.ranking(catalogue, medicham),
      );
    const first = rank({ attack: 0, defense: 15, stamina: 15 });
    const second = rank({ attack: 15, defense: 15, stamina: 15 });
    expect(computed).toEqual(['1500|0|50', '1500|0|51']);
    expect(first).toEqual(
      cappedRanks(
        medicham.stats,
        catalogue.cpMultipliers,
        { attack: 0, defense: 15, stamina: 15 },
        GREAT,
      ),
    );
    expect(second.level50?.spread.ivs).toEqual({ attack: 15, defense: 15, stamina: 15 });
  });

  it('ranks anew for another Pokémon, league, floor or catalogue', () => {
    const { memo, computed } = counted();
    const options: RankOptions = { leagueCp: 1500, floor: 0, levelCap: 50 };
    const multipliers = [...catalogue.cpMultipliers];
    const ask = (of: object, key: string, asked: RankOptions) =>
      memo.ranking(of, entry(key))(asked, multipliers);
    ask(catalogue, 'medicham', options);
    ask(catalogue, 'medicham', options);
    ask(catalogue, 'mewtwo', options);
    ask(catalogue, 'medicham', { ...options, leagueCp: 2500 });
    ask(catalogue, 'medicham', { ...options, leagueCp: undefined });
    ask(catalogue, 'medicham', { ...options, floor: 10 });
    ask(catalogue, 'medicham', { ...options, levelCap: 51 });
    ask({}, 'medicham', options);
    expect(computed).toHaveLength(7);
  });

  it('keeps no more rankings than it may, the oldest out', () => {
    const { memo, computed } = counted(2);
    const multipliers = [...catalogue.cpMultipliers];
    const ask = (key: string) =>
      memo.ranking(catalogue, entry(key))({ leagueCp: 1500, floor: 0, levelCap: 50 }, multipliers);
    ask('medicham');
    ask('mewtwo');
    ask('eevee');
    ask('mewtwo');
    expect(computed).toHaveLength(3);
    ask('medicham');
    expect(computed).toHaveLength(4);
  });
});
