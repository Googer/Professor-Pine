import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import type { Move, PokemonEntry } from './game-master.js';
import { findMoves, parseMoveset } from './move-search.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`The fixture has no ${key}`);
  return found;
}

/** Machamp: Bullet Punch, Counter, Karate Chop (elite); Heavy Slam, Dynamic Punch, Close Combat, … */
const machamp = entry('machamp');
const machampMoves = [
  ...machamp.fastMoves,
  ...machamp.eliteFastMoves,
  ...machamp.chargedMoves,
  ...machamp.eliteChargedMoves,
]
  .map((id) => catalogue.move(id))
  .filter((move): move is Move => move !== undefined);

const ids = (moves: readonly Move[]) => moves.map((move) => move.id);

describe('findMoves', () => {
  it('finds a move by its name, with or without the space', () => {
    expect(ids(findMoves(machampMoves, 'dynamic punch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'DynamicPunch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'counter'))).toEqual(['COUNTER_FAST']);
  });

  it('finds a move by the beginning of its name or of its words', () => {
    expect(ids(findMoves(machampMoves, 'dyn'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'close'))).toEqual(['CLOSE_COMBAT']);
    expect(ids(findMoves(machampMoves, 'punch'))).toEqual(['BULLET_PUNCH_FAST', 'DYNAMIC_PUNCH']);
  });

  it('forgives a misspelling', () => {
    expect(ids(findMoves(machampMoves, 'dinamic punch'))).toEqual(['DYNAMIC_PUNCH']);
    expect(ids(findMoves(machampMoves, 'conter'))).toEqual(['COUNTER_FAST']);
  });

  it('gives nothing for a move that is not in the list', () => {
    expect(findMoves(machampMoves, 'hydro pump')).toEqual([]);
    expect(findMoves(machampMoves, '')).toEqual([]);
  });
});

describe('parseMoveset', () => {
  it('reads a fast and a charged move in either order', () => {
    for (const text of [
      'counter / dynamic punch',
      'Dynamic Punch/Counter',
      'counter, dynamic punch',
      'dynamicpunch / count',
    ]) {
      const moveset = parseMoveset(catalogue, machamp, text);
      expect([moveset.fast?.id, moveset.charged?.id, moveset.unknown], text).toEqual([
        'COUNTER_FAST',
        'DYNAMIC_PUNCH',
        [],
      ]);
    }
  });

  it('reads a single move', () => {
    const fast = parseMoveset(catalogue, machamp, 'counter');
    expect([fast.fast?.id, fast.charged, fast.unknown]).toEqual(['COUNTER_FAST', undefined, []]);
    const charged = parseMoveset(catalogue, machamp, 'close combat');
    expect([charged.fast, charged.charged?.id]).toEqual([undefined, 'CLOSE_COMBAT']);
  });

  it('accepts elite moves', () => {
    expect(machamp.eliteFastMoves).toContain('KARATE_CHOP_FAST');
    expect(parseMoveset(catalogue, machamp, 'karate chop').fast?.id).toBe('KARATE_CHOP_FAST');
  });

  it('reports what is not a move of the Pokémon', () => {
    const moveset = parseMoveset(catalogue, machamp, 'counter / hydro pump');
    expect([moveset.fast?.id, moveset.charged, moveset.unknown]).toEqual([
      'COUNTER_FAST',
      undefined,
      ['hydro pump'],
    ]);
    expect(parseMoveset(catalogue, machamp, 'xyzzy').unknown).toEqual(['xyzzy']);
  });

  it('lets the last of two moves of one kind count', () => {
    const moveset = parseMoveset(catalogue, machamp, 'cross chop / dynamic punch');
    expect([moveset.fast, moveset.charged?.id, moveset.unknown]).toEqual([
      undefined,
      'DYNAMIC_PUNCH',
      [],
    ]);
  });

  it('reads a move from the first letter and a word, not from a joined abbreviation', () => {
    const spaced = parseMoveset(catalogue, machamp, 'd punch');
    expect([spaced.fast, spaced.charged?.id, spaced.unknown]).toEqual([
      undefined,
      'DYNAMIC_PUNCH',
      [],
    ]);
    expect(parseMoveset(catalogue, machamp, 'dpunch').unknown).toEqual(['dpunch']);
  });

  it('reads nothing from empty text', () => {
    for (const text of ['', ' / ', ',,']) {
      expect(parseMoveset(catalogue, machamp, text)).toEqual({
        fast: undefined,
        charged: undefined,
        unknown: [],
      });
    }
  });
});
