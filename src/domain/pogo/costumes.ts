import type { PokemonCatalogue } from './catalogue.js';
import { costumeLookupOf, type CostumeLookup } from './feed-lookup.js';
import {
  identifyBoss,
  isCostumeForm,
  pictureIds,
  pictureSaysCostume,
  wornBy,
  type Ids,
} from './raid-boss-feed.js';

/*
 * Whether a sighting is costumed (plan 8R-4, design 5): a raid boss, a research reward, a spawn
 * an event lists. "Costumed" is any costume, never one in particular; a costume belongs to the
 * form it copies (`GameData.aliases`), so a costumed sighting is matched under that form.
 */

/** What the costume test knows of a sighting beside its name and picture. */
export interface CostumeEvidence {
  /**
   * The ids the sighting stands for: a feed's boss as stored (`FeedBoss.pokemonId` / `form`), or
   * what a picture names (`pictureIds`); undefined when nothing names them.
   */
  ids: Ids | undefined;
  lookup: CostumeLookup;
}

/**
 * The costume test, in this order, the first that holds:
 * - the form id is a costume the game data knows (`GameData.costumes`: `PIKACHU_PXP_2026`,
 *   `CORSOLA_SPRING_2026`; never `RAIKOU_S` nor a form with stats of its own);
 * - a form id the game data does not know yet that `isCostumeForm` calls a costume (Astronaut
 *   Pikachu's `PIKACHU_GLASS_HELMET_2026`);
 * - the picture says a costume by its own part (`.c<COSTUME>`, an older picture's third number);
 * - last, the name says what it wears ("Zubat wearing a top hat", Leek Duck's name for a costume
 *   before the game data has it, with a picture named by hand).
 */
export function isCostumed(name: string, image: unknown, evidence: CostumeEvidence): boolean {
  const { ids, lookup } = evidence;
  if (ids?.form != null) {
    if (lookup.isCostume(ids.form)) return true;
    const species = lookup.speciesName(ids.pokemonId);
    if (
      species !== undefined &&
      lookup.kindOf(ids.pokemonId, ids.form) === undefined &&
      isCostumeForm({ pokemonId: ids.pokemonId, form: ids.form, name }, species)
    ) {
      return true;
    }
  }
  if (pictureSaysCostume(image)) return true;
  return wornBy(name) !== undefined;
}

/**
 * The costume test of a Pokémon a page names by its English name and picture (a research reward,
 * an event's spawn): the picture's ids as the ids.
 */
export function costumedByName(
  catalogue: PokemonCatalogue,
  name: string,
  image?: unknown,
): boolean {
  const lookup = costumeLookupOf(catalogue);
  return isCostumed(name, image, { ids: pictureIds(image, lookup), lookup });
}

/** A sighting of a name and picture as the matchers take it. */
export interface CostumedSighting {
  key: string;
  dex: number;
  costumed: boolean;
}

/**
 * A Pokémon a page or feed names by its English name and picture (an event's spawn, a research
 * reward): its catalogue entry where name and picture agree (`identifyBoss`, a name-only costume
 * as the Pokémon that wears it), and whether it is costumed by its picture's ids. Undefined where
 * the game data does not know it.
 */
export function costumedSighting(
  catalogue: PokemonCatalogue,
  name: string,
  image?: unknown,
): CostumedSighting | undefined {
  const lookup = costumeLookupOf(catalogue);
  const resolved = identifyBoss(name, image, lookup)?.resolved;
  const key = resolved && lookup.keyOf(resolved.pokemonId, resolved.form);
  const entry = key === undefined ? undefined : catalogue.byKey(key);
  if (!entry) return undefined;
  return { key: entry.key, dex: entry.dex, costumed: costumedByName(catalogue, name, image) };
}
