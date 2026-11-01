import type { TempEvolution } from './types.js';

/**
 * Pokémon whose Pokebattler name does not follow the rule in `pokebattlerId`. Values are the
 * names the legacy bot used (data/pokemon.json `pbName`), keyed by catalogue key.
 */
export const POKEBATTLER_EXCEPTIONS: Readonly<Record<string, string>> = {
  // Pokebattler names the species by its NORMAL form.
  arceus: 'ARCEUS_NORMAL_FORM',
  // Forms Pokebattler names without the _FORM suffix.
  kyurem_white: 'KYUREM_WHITE',
  kyurem_black: 'KYUREM_BLACK',
  pumpkaboo_small: 'PUMPKABOO_SMALL',
  pumpkaboo_average: 'PUMPKABOO_AVERAGE',
  pumpkaboo_large: 'PUMPKABOO_LARGE',
  pumpkaboo_super: 'PUMPKABOO_SUPER',
  gourgeist_small: 'GOURGEIST_SMALL',
  gourgeist_average: 'GOURGEIST_AVERAGE',
  gourgeist_large: 'GOURGEIST_LARGE',
  gourgeist_super: 'GOURGEIST_SUPER',
  hoopa_confined: 'HOOPA_CONFINED',
  hoopa_unbound: 'HOOPA_UNBOUND',
  // Forms Pokebattler does not tell apart from the species.
  cherrim_overcast: 'CHERRIM',
  cherrim_sunny: 'CHERRIM',
  oinkologne_female: 'OINKOLOGNE',
  maushold_family_of_three: 'MAUSHOLD',
  maushold_family_of_four: 'MAUSHOLD',
  palafin_hero: 'PALAFIN',
  palafin_zero: 'PALAFIN',
  // Different word order.
  darmanitan_galarian_standard: 'DARMANITAN_GALARIAN_FORM',
  darmanitan_galarian_zen: 'DARMANITAN_ZEN_GALARIAN_FORM',
  // Hyphenated names.
  jangmo_o: 'JANGMO-O',
  hakamo_o: 'HAKAMO-O',
  kommo_o: 'KOMMO-O',
};

/**
 * The name Pokebattler uses: the species id, `<species>_MEGA[_X|_Y]` for megas, and
 * `<form>_FORM` for any other form, except for the entries in `POKEBATTLER_EXCEPTIONS`.
 */
export function pokebattlerId(
  pokemonId: string,
  form: string | null,
  tempEvolution: TempEvolution | null,
): string {
  const key = (tempEvolution ? `${pokemonId}_${tempEvolution}` : (form ?? pokemonId)).toLowerCase();
  const exception = POKEBATTLER_EXCEPTIONS[key];
  if (exception) return exception;
  if (tempEvolution) return `${pokemonId}_${tempEvolution}`;
  return form ? `${form}_FORM` : pokemonId;
}
