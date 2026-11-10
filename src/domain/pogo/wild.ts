import { searchText } from '../search/text.js';
import type { PokemonCatalogue } from './catalogue.js';
import { feedLookupOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';

/**
 * The species that appear in the wild although the game calls them legendary, mythical or an
 * ultra beast, as the settings name them (`wildSpawnExceptions`), read against a catalogue.
 */
export interface WildExceptions {
  /** Game-master species ids (`PokemonEntry.pokemonId`). */
  species: ReadonlySet<string>;
  /** The names of those species, in the order of the settings, each once: for the help. */
  names: readonly string[];
  /** What the settings name that the catalogue does not know: ignored, and to be said once. */
  unknown: readonly string[];
}

/**
 * Reads the settings' list against a catalogue. A species is named by its catalogue key, its
 * game-master id or its name (`uxie`, `UXIE`, `Uxie`), without regard to case, accents and
 * signs; an entry of one of its forms names the species too (`giratina_origin`), since the
 * exception is a species'. A text the catalogue does not know is left out and reported.
 */
export function wildExceptions(
  catalogue: PokemonCatalogue,
  listed: readonly string[],
): WildExceptions {
  const byText = new Map<string, PokemonEntry>();
  for (const entry of catalogue.all) {
    for (const text of [entry.key, entry.pokemonId, entry.name]) {
      const folded = searchText(text);
      if (folded !== '' && !byText.has(folded)) byText.set(folded, entry);
    }
  }
  const species = new Set<string>();
  const names: string[] = [];
  const unknown: string[] = [];
  for (const text of listed) {
    const entry = catalogue.byKey(text.trim()) ?? byText.get(searchText(text));
    if (!entry) {
      unknown.push(text);
      continue;
    }
    if (species.has(entry.pokemonId)) continue;
    species.add(entry.pokemonId);
    names.push(feedLookupOf(catalogue).speciesName(entry.pokemonId) ?? entry.name);
  }
  return { species, names, unknown };
}

/**
 * Whether a Pokémon can be met in the wild at all, so that a spawn of it can be reported: not a
 * mega or primal, and no legendary, mythical or ultra beast but the species of `exceptions`
 * (the settings' `wildSpawnExceptions`: by default the lake trio; Matt, 2026-10-13). Everything
 * else the game gives a class is met in raids, research or events only; that includes the
 * Galarian birds and the fusions, which are forms of legendary species. A Pokémon that spawns
 * only in parts of the world counts as wild: the game master does not say where, and a server
 * may be anywhere.
 */
export function appearsInWild(
  entry: Pick<PokemonEntry, 'kind' | 'class' | 'pokemonId'>,
  exceptions: ReadonlySet<string>,
): boolean {
  if (entry.kind === 'mega') return false;
  return entry.class === null || exceptions.has(entry.pokemonId);
}
