import type { PokemonEntry } from './game-master.js';
import { pokebattlerId } from './pokebattler.js';
import type { TempEvolution } from './types.js';

const MEGA_NAME = /^(mega|primal)\s+(.+?)(?:\s+([xy]))?$/iu;

function tempEvolutionOf(word: string, letter: string | undefined): TempEvolution | undefined {
  if (word.toLowerCase() === 'primal') return letter === undefined ? 'PRIMAL' : undefined;
  if (letter === undefined) return 'MEGA';
  return letter.toUpperCase() === 'X' ? 'MEGA_X' : 'MEGA_Y';
}

/**
 * A mega or primal the feeds name before the game master has it (`Mega Chandelure`, 2026-10-31),
 * read from its name over its species: what the game master would call it and Pokebattler's name
 * for it. Its types, stats and moves are not known, and no species' stand in for them. Undefined
 * for any other name; `speciesNamed` is the caller's exact look-up of a name.
 */
export function unlistedMega(
  name: string,
  speciesNamed: (name: string) => PokemonEntry | undefined,
): PokemonEntry | undefined {
  const read = MEGA_NAME.exec(name.trim());
  if (!read) return undefined;
  const [, word = '', speciesName = '', letter] = read;
  const tempEvolution = tempEvolutionOf(word, letter);
  const species = speciesNamed(speciesName);
  if (tempEvolution === undefined || species?.kind !== 'species') return undefined;
  const prefix = tempEvolution === 'PRIMAL' ? 'Primal' : 'Mega';
  const suffix = letter === undefined ? '' : ` ${letter.toUpperCase()}`;
  return {
    key: `${species.pokemonId}_${tempEvolution}`.toLowerCase(),
    dex: species.dex,
    pokemonId: species.pokemonId,
    form: null,
    kind: 'mega',
    tempEvolution,
    class: species.class,
    name: `${prefix} ${species.name}${suffix}`,
    types: [],
    stats: { attack: 0, defense: 0, stamina: 0 },
    fastMoves: [],
    chargedMoves: [],
    eliteFastMoves: [],
    eliteChargedMoves: [],
    family: species.family,
    evolutions: [],
    shadow: false,
    pokebattlerId: pokebattlerId(species.pokemonId, null, tempEvolution),
  };
}
