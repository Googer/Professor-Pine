import { describe, expect, it } from 'vitest';
import { pokebattlerAnswer } from '../../../test/support/pokebattler.js';
import { hasCounters, readCounterAnswer } from './pokebattler-answer.js';

describe('readCounterAnswer', () => {
  it('reads the counters per moveset of the boss and averaged', () => {
    const answer = readCounterAnswer(
      pokebattlerAnswer({
        byMove: [
          {
            move1: 'CONFUSION_FAST',
            move2: 'PSYSTRIKE',
            defenders: [
              {
                pokemonId: 'TYRANITAR',
                cp: 3670,
                byMove: [
                  {
                    move1: 'BITE_FAST',
                    move2: 'BRUTAL_SWING',
                    seconds: 120.5,
                    deaths: 4.25,
                    estimator: 2.62,
                  },
                ],
              },
            ],
          },
        ],
        average: [
          {
            pokemonId: 'DARKRAI',
            name: 'Nightmare',
            byMove: [
              {
                move1: 'SNARL_FAST',
                move2: 'SHADOW_BALL',
                move3: 'DARK_PULSE',
                legacyDate: '2023-01-01',
                seconds: 99,
              },
            ],
          },
        ],
      }),
    );
    expect(answer).toEqual({
      byMoveset: [
        {
          fast: 'CONFUSION_FAST',
          charged: 'PSYSTRIKE',
          counters: [
            {
              pokemonId: 'TYRANITAR',
              cp: 3670,
              nickname: null,
              results: [
                {
                  fast: 'BITE_FAST',
                  charged: 'BRUTAL_SWING',
                  third: null,
                  legacy: false,
                  timeMs: 120_500,
                  deaths: 4.25,
                  estimator: 2.62,
                },
              ],
            },
          ],
        },
      ],
      average: {
        fast: null,
        charged: null,
        counters: [
          {
            pokemonId: 'DARKRAI',
            cp: 3000,
            nickname: 'Nightmare',
            results: [
              {
                fast: 'SNARL_FAST',
                charged: 'SHADOW_BALL',
                third: 'DARK_PULSE',
                legacy: true,
                timeMs: 99_000,
                deaths: 5,
                estimator: null,
              },
            ],
          },
        ],
      },
    });
  });

  it('leaves out what does not fit and reads the rest', () => {
    const body = pokebattlerAnswer({
      average: [
        { pokemonId: 'TYRANITAR', byMove: [{ move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 130 }] },
        { pokemonId: 'GENGAR', byMove: [{ move1: 'LICK_FAST', move2: 'SHADOW_BALL', seconds: 1 }] },
      ],
    }) as { attackers: { randomMove: { defenders: Record<string, unknown>[] } }[] };
    const defenders = body.attackers[0]?.randomMove.defenders ?? [];
    // A counter without a name, and a result without a time.
    delete defenders[0]?.['pokemonId'];
    const gengar = defenders[1] as { byMove: { result: Record<string, unknown> }[] };
    defenders.push({ ...structuredClone(gengar), pokemonId: 'HOUNDOOM' });
    if (gengar.byMove[0]) gengar.byMove[0].result = { effectiveDeaths: 1 };
    const answer = readCounterAnswer(body);
    expect(answer?.average?.counters.map((counter) => counter.pokemonId)).toEqual(['HOUNDOOM']);
    expect(answer?.byMoveset).toEqual([]);
  });

  it('reads an answer without any counter as one, which has no counters', () => {
    const answer = readCounterAnswer(pokebattlerAnswer({ average: [] }));
    expect(answer).toEqual({ byMoveset: [], average: { fast: null, charged: null, counters: [] } });
    expect(answer && hasCounters(answer)).toBe(false);
    const some = readCounterAnswer(
      pokebattlerAnswer({
        average: [{ pokemonId: 'X', byMove: [{ move1: 'A_FAST', move2: 'B', seconds: 1 }] }],
      }),
    );
    expect(some && hasCounters(some)).toBe(true);
  });

  it('is nothing for an answer not of this shape', () => {
    expect(readCounterAnswer({ attackers: [] })).toBeUndefined();
    expect(readCounterAnswer({ error: 'no such raid' })).toBeUndefined();
    expect(readCounterAnswer('<html>')).toBeUndefined();
    expect(readCounterAnswer(null)).toBeUndefined();
  });
});
