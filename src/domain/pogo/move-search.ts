import { matchNamed } from '../search/word-match.js';
import type { PokemonCatalogue } from './catalogue.js';
import type { Move, PokemonEntry } from './game-master.js';

/** Moves by what a member typed ("hydro can", "hydrocannon", "shadow bal"), best fit first. */
export function findMoves(moves: readonly Move[], text: string): Move[] {
  return matchNamed(
    moves.map((move) => ({ value: move, names: [move.name, move.id.replace(/_FAST$/, '')] })),
    text,
  );
}

export interface Moveset {
  fast: Move | undefined;
  charged: Move | undefined;
  /** Parts of the text that are no move of this Pokémon. */
  unknown: string[];
}

function movesOf(catalogue: PokemonCatalogue, ids: readonly string[]): Move[] {
  return ids.map((id) => catalogue.move(id)).filter((move): move is Move => move !== undefined);
}

/**
 * Reads a moveset as members write it: one or two moves separated by `/` or `,`, in either
 * order ("counter / dynamic punch", "d punch"). Only moves the Pokémon can have are accepted,
 * elite moves included. When a second move of the same kind is named, the last one counts.
 */
export function parseMoveset(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  text: string,
): Moveset {
  const fastMoves = movesOf(catalogue, [...entry.fastMoves, ...entry.eliteFastMoves]);
  const chargedMoves = movesOf(catalogue, [...entry.chargedMoves, ...entry.eliteChargedMoves]);
  const moveset: Moveset = { fast: undefined, charged: undefined, unknown: [] };
  for (const part of text.split(/[/,]/).map((piece) => piece.trim())) {
    if (part === '') continue;
    const move = findMoves([...fastMoves, ...chargedMoves], part)[0];
    if (!move) moveset.unknown.push(part);
    else if (move.fast) moveset.fast = move;
    else moveset.charged = move;
  }
  return moveset;
}
