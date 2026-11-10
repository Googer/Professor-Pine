import { searchText } from '../search/text.js';
import type { PokemonCatalogue } from './catalogue.js';
import type { PokemonEntry } from './game-master.js';
import type { FeedLookup } from './raid-boss-feed.js';

/** The ids under which the feed, and so the tables, name a catalogue entry. */
export function bossIdsOf(entry: PokemonEntry): { pokemonId: string; form: string | null } {
  return {
    pokemonId: entry.pokemonId,
    form: entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : entry.form,
  };
}

/** A name without its last parenthesis: `Landorus (Incarnate Forme)` is `Landorus`. */
function withoutParenthesis(name: string): string {
  return name.replace(/ \([^()]*\)$/, '');
}

/**
 * Other ways to write the name of an entry: `X (Y)` as `X (Y Forme)` and `Y X`, `X (Y Forme)` as
 * `X (Y)`, and `<words> <Species>` as `<Species> (<words>)` and `<Species> (<words> Forme)`
 * (`Black Kyurem`, `Alolan Raichu`).
 */
function respellings(entry: PokemonEntry, species: string | undefined): string[] {
  const parenthesised = /^(.+) \((.+)\)$/.exec(entry.name);
  if (parenthesised?.[1] && parenthesised[2]) {
    const [, head, inside] = parenthesised;
    const short = inside.replace(/ (?:Forme|Form|Mode)$/i, '');
    return [`${head} (${short})`, `${head} (${short} Forme)`, `${short} ${head}`];
  }
  if (species && entry.name !== species && entry.name.endsWith(` ${species}`)) {
    const words = entry.name.slice(0, -species.length - 1);
    return [`${species} (${words})`, `${species} (${words} Forme)`];
  }
  return [];
}

type Index = Map<string, PokemonEntry | null>;

function addTo(index: Index, text: string, entry: PokemonEntry): void {
  const key = searchText(text);
  if (key === '') return;
  const known = index.get(key);
  index.set(key, known === undefined || known === entry ? entry : null);
}

/**
 * The English name of a species. The game data keeps no name of the species itself, only of its
 * entries; a species known by its default form (Giratina, Landorus) has the form's name, with a
 * parenthesis (`Giratina (Altered Forme)`), which is cut. Hoopa's default entry is named `Hoopa
 * Confined`, without a parenthesis; there the words that its entry and its other forms (`Hoopa
 * Unbound`) start with are the species' name.
 */
function speciesNameIn(catalogue: PokemonCatalogue, pokemonId: string): string | undefined {
  const species = catalogue.byGameMasterId(pokemonId);
  if (!species) return undefined;
  const cut = withoutParenthesis(species.name);
  if (cut !== species.name || species.form === null) return cut;
  let words = cut.split(' ');
  for (const sibling of catalogue.byDex(species.dex)) {
    if (sibling === species || sibling.pokemonId !== pokemonId || sibling.kind !== 'form') continue;
    const other = withoutParenthesis(sibling.name).split(' ');
    let common = 0;
    while (common < words.length && words[common] === other[common]) common += 1;
    if (common > 0) words = words.slice(0, common);
  }
  return words.join(' ');
}

/**
 * What the costume test (`isCostumed`, costumes.ts) asks of the game data: the feed's look-ups,
 * and whether a form id is a costume the game data knows (`PokemonCatalogue.isCostume`).
 */
export interface CostumeLookup extends FeedLookup {
  isCostume(formId: string): boolean;
}

const costumeLookups = new WeakMap<PokemonCatalogue, CostumeLookup>();

/** `feedLookupOf` with the costume set, built once per catalogue. */
export function costumeLookupOf(catalogue: PokemonCatalogue): CostumeLookup {
  let lookup = costumeLookups.get(catalogue);
  if (!lookup) {
    lookup = { ...feedLookupOf(catalogue), isCostume: (id) => catalogue.isCostume(id) };
    costumeLookups.set(catalogue, lookup);
  }
  return lookup;
}

const lookups = new WeakMap<PokemonCatalogue, FeedLookup>();

/** `feedLookup` of a catalogue, built once per catalogue. */
export function feedLookupOf(catalogue: PokemonCatalogue): FeedLookup {
  let lookup = lookups.get(catalogue);
  if (!lookup) {
    lookup = feedLookup(catalogue);
    lookups.set(catalogue, lookup);
  }
  return lookup;
}

/**
 * The look-ups `parseRaidBossFeed` needs, answered by a catalogue: the species of a Pokédex
 * number, the entry an English name stands for, and the kind of the entry some ids name.
 *
 * A name is matched as the catalogue spells it (`Landorus (Incarnate Forme)`), then by one of its
 * usual respellings (`respellings`: `Landorus (Incarnate)`, `Dusk Mane Necrozma`, `Kyurem
 * (Black)`, `Shadow Rider Calyrex`, `Raichu (Alolan)`), then as the species (`Mewtwo (Normal)`,
 * and the bare `Landorus` for the form that species is known by), then by the first words of a
 * form's text (`Wormadam (Plant)` for `Wormadam (Plant Cloak)`). Only a name that fits one entry
 * counts at its step: a name shared by several entries finds none of them. The ids returned are
 * the ones a feed row carries, so a mega comes back as `BLASTOISE_MEGA`.
 */
export function feedLookup(catalogue: PokemonCatalogue): FeedLookup {
  const names = new Map<string, string | undefined>();
  const speciesNameOf = (pokemonId: string): string | undefined => {
    if (!names.has(pokemonId)) names.set(pokemonId, speciesNameIn(catalogue, pokemonId));
    return names.get(pokemonId);
  };
  const exact: Index = new Map();
  const respelled: Index = new Map();
  const asSpecies: Index = new Map();
  const startsWith: Index = new Map();
  for (const entry of catalogue.all) {
    const species = speciesNameOf(entry.pokemonId);
    addTo(exact, entry.name, entry);
    for (const spelling of respellings(entry, species)) addTo(respelled, spelling, entry);
    if (entry.kind === 'species' && species !== undefined) {
      addTo(asSpecies, species, entry);
      addTo(asSpecies, `${species} (Normal)`, entry);
    }
    const parenthesised = /^(.+) \((.+)\)$/.exec(entry.name);
    if (parenthesised?.[1] && parenthesised[2]) {
      const words = parenthesised[2].split(' ');
      for (let count = 1; count < words.length; count += 1) {
        addTo(startsWith, `${parenthesised[1]} (${words.slice(0, count).join(' ')})`, entry);
      }
    }
  }
  return {
    speciesId: (dex) => catalogue.species(dex)?.pokemonId,
    speciesName: speciesNameOf,
    findByName: (name) => {
      const key = searchText(name);
      for (const index of [exact, respelled, asSpecies, startsWith]) {
        if (!index.has(key)) continue;
        const entry = index.get(key);
        return entry ? bossIdsOf(entry) : undefined;
      }
      return undefined;
    },
    kindOf: (pokemonId, form) => catalogue.byGameMasterId(pokemonId, form)?.kind,
    keyOf: (pokemonId, form) => catalogue.byGameMasterId(pokemonId, form)?.key,
  };
}
