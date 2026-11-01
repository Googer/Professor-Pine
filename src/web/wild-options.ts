import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { appearsInWild } from '../domain/pogo/wild.js';
import type { WildOptionsView } from '../domain/web/spawn-data.js';

/**
 * The pick list of a spawn report on the map (spec 3.8): every entry of the catalogue `/wild`
 * takes (`appearsInWild` with the settings' exceptions, `exceptions`: the species of
 * `wildExceptionsOf`), a form as that form, in the catalogue's order, each as its key and name.
 * Pure.
 */
export function wildOptions(
  catalogue: Pick<PokemonCatalogue, 'all'>,
  exceptions: ReadonlySet<string>,
): WildOptionsView {
  return {
    pokemon: catalogue.all
      .filter((entry) => appearsInWild(entry, exceptions))
      .map((entry): [string, string] => [entry.key, entry.name]),
  };
}
