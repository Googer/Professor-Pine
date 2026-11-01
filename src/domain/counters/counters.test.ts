import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { mewtwoAnswer } from '../../../test/support/pokebattler.js';
import {
  counterRows,
  isMegaCounter,
  isShadowCounter,
  keptAnswer,
  pokebattlerNames,
  SHOWN_COUNTERS,
  titleCase,
  type CounterRow,
} from './counters.js';
import type { BossMovesetCounters, CounterAnswer } from './pokebattler-answer.js';

const answer = mewtwoAnswer();
const average = answer.average as BossMovesetCounters;
const lines = (rows: CounterRow[]) =>
  rows.map((row) => `${row.counter.pokemonId} ${row.result.charged}`);

describe('counterRows', () => {
  it('lists the best moveset of each counter, fastest first, without shadows and megas', () => {
    expect(lines(counterRows(average, { shadow: false, mega: false, single: false }))).toEqual([
      'TYRANITAR BRUTAL_SWING',
      'DARKRAI SHADOW_BALL',
    ]);
  });

  it('lists every moveset with single, and shadows and megas when asked', () => {
    expect(lines(counterRows(average, { shadow: true, mega: true, single: true }))).toEqual([
      'TYRANITAR_SHADOW_FORM BRUTAL_SWING',
      'GENGAR_MEGA SHADOW_BALL',
      'TYRANITAR BRUTAL_SWING',
      'DARKRAI SHADOW_BALL',
      'TYRANITAR CRUNCH',
    ]);
    expect(
      lines(counterRows(average, { shadow: true, mega: false, single: false, limit: 2 })),
    ).toEqual(['TYRANITAR_SHADOW_FORM BRUTAL_SWING', 'TYRANITAR BRUTAL_SWING']);
  });

  it('keeps two Pokémon of one species in a Pokébox apart', () => {
    const box: BossMovesetCounters = {
      fast: null,
      charged: null,
      counters: [
        { ...average.counters[2]!, cp: 3500, nickname: 'Rocky' },
        { ...average.counters[2]!, cp: 2900, nickname: null },
      ],
    };
    expect(counterRows(box, { shadow: false, mega: false, single: false })).toHaveLength(2);
  });
});

/** A large answer made in the test: `movesets` boss movesets, 30 counters of 6 movesets each. */
function largeAnswer(movesets: number): CounterAnswer {
  let seed = 7;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const set = (fast: string | null, charged: string | null): BossMovesetCounters => ({
    fast,
    charged,
    counters: Array.from({ length: 30 }, (_unused, c) => ({
      pokemonId:
        c % 7 === 0
          ? `P${String(c)}_SHADOW_FORM`
          : c % 11 === 0
            ? `P${String(c)}_MEGA`
            : `P${String(c)}`,
      cp: 3000,
      nickname: null,
      results: Array.from({ length: 6 }, (_none, r) => ({
        fast: `F${String(r)}_FAST`,
        charged: `C${String(r)}`,
        third: null,
        legacy: false,
        // Some ties, as Pokebattler's rounded times have.
        timeMs: Math.round(random() * 40) * 1000 + 100_000,
        deaths: Math.round(random() * 4),
        estimator: 2.5,
      })),
    })),
  });
  return {
    byMoveset: Array.from({ length: movesets }, (_unused, m) => set(`B${String(m)}_FAST`, 'BC')),
    average: set(null, null),
  };
}

describe('keptAnswer', () => {
  it('keeps of each boss moveset only what the answer can show, for single or not', () => {
    const answer = largeAnswer(100);
    for (const kinds of [
      { shadow: false, mega: false },
      { shadow: true, mega: false },
      { shadow: true, mega: true },
    ]) {
      const kept = keptAnswer(answer, kinds);
      expect(kept.byMoveset.map((set) => set.fast)).toEqual(
        answer.byMoveset.map((set) => set.fast),
      );
      for (const [i, set] of [...answer.byMoveset, answer.average!].entries()) {
        const keptSet = i < kept.byMoveset.length ? kept.byMoveset[i]! : kept.average!;
        for (const single of [false, true]) {
          expect(lines(counterRows(keptSet, { ...kinds, single }))).toEqual(
            lines(counterRows(set, { ...kinds, single })),
          );
        }
        // At most a best moveset of twelve counters and twelve movesets more.
        const results = keptSet.counters.reduce((sum, counter) => sum + counter.results.length, 0);
        expect(results).toBeLessThanOrEqual(2 * SHOWN_COUNTERS);
        expect(results).toBeGreaterThanOrEqual(SHOWN_COUNTERS);
      }
    }
    // Shadows and megas left out are not kept.
    const plain = keptAnswer(answer, { shadow: false, mega: false });
    const ids = plain.byMoveset.flatMap((set) => set.counters.map((counter) => counter.pokemonId));
    expect(ids.some((id) => isShadowCounter(id) || isMegaCounter(id))).toBe(false);
  });

  it('keeps an answer without an average without one', () => {
    const kept = keptAnswer({ byMoveset: [], average: undefined }, { shadow: false, mega: false });
    expect(kept).toEqual({ byMoveset: [], average: undefined });
  });
});

describe('the kinds of counters', () => {
  it('tells shadows and megas by Pokebattler name', () => {
    expect(isShadowCounter('MACHAMP_SHADOW_FORM')).toBe(true);
    expect(isShadowCounter('MACHAMP')).toBe(false);
    expect(isMegaCounter('RAYQUAZA_MEGA')).toBe(true);
    expect(isMegaCounter('CHARIZARD_MEGA_Y')).toBe(true);
    expect(isMegaCounter('KYOGRE_PRIMAL')).toBe(true);
    expect(isMegaCounter('MEGANIUM')).toBe(false);
  });
});

describe('pokebattlerNames', () => {
  const name = pokebattlerNames(catalogueFixture().all);

  it('names a Pokémon by the catalogue, a shadow as such', () => {
    expect(name('TYRANITAR')).toBe('Tyranitar');
    expect(name('RAYQUAZA_MEGA')).toBe('Mega Rayquaza');
    expect(name('RATTATA_ALOLA_FORM')).toBe('Alolan Rattata');
    expect(name('MACHAMP_SHADOW_FORM')).toBe('Shadow Machamp');
    expect(name('RATTATA_ALOLA_SHADOW_FORM')).toBe('Shadow Alolan Rattata');
    expect(name('GIRATINA_ORIGIN_FORM')).toBe('Giratina (Origin Forme)');
  });

  it('names a form that Pokebattler calls with or without _FORM, and a bare species by its default form', () => {
    // The game master's id is KYUREM_WHITE; Pokebattler answers KYUREM_WHITE_FORM.
    expect(name('KYUREM_WHITE_FORM')).toBe('White Kyurem');
    // The game master's id is LANDORUS_INCARNATE_FORM; Pokebattler answers LANDORUS.
    expect(name('LANDORUS')).toBe('Landorus (Incarnate Forme)');
    expect(name('LANDORUS_SHADOW_FORM')).toBe('Shadow Landorus (Incarnate Forme)');
  });

  it('names what the catalogue does not know by Pokebattler name in words', () => {
    expect(name('NEWMON_SPECIAL')).toBe('Newmon Special');
    expect(titleCase('DYNAMIC_PUNCH')).toBe('Dynamic Punch');
    expect(titleCase('COUNTER_FAST')).toBe('Counter');
  });
});
