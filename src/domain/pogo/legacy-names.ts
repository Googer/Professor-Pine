/**
 * Names in the legacy bot's data (data/pokemon.json and the `Pokemon.name` column) that are not
 * the catalogue key. Most were typed by hand and never matched the game master, so those
 * Pokémon had no stats in the legacy bot.
 */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, string>> = {
  'nidoran♀': 'nidoran_female',
  'nidoran♂': 'nidoran_male',
  'mr. mime': 'mr_mime',
  'mr. mime_galarian': 'mr_mime_galarian',
  'mime jr.': 'mime_jr',
  'mr. rime': 'mr_rime',
  castform_rainy_form: 'castform_rainy',
  castform_snowy_form: 'castform_snowy',
  castform_sunny_form: 'castform_sunny',
  basculin_white_stripe: 'basculin_white_striped',
  // The legacy data listed the normal form of these species separately.
  deoxys_normal: 'deoxys',
  obstagoon_normal: 'obstagoon',
  perrserker_normal: 'perrserker',
  runerigus_normal: 'runerigus',
  oinkologne_normal: 'oinkologne',
  // The catalogue knows these species by their default form (one identity per form); the legacy
  // data listed them under the bare species name.
  darmanitan: 'darmanitan_standard',
  tornadus: 'tornadus_incarnate',
  thundurus: 'thundurus_incarnate',
  landorus: 'landorus_incarnate',
  meloetta: 'meloetta_aria',
  aegislash: 'aegislash_shield',
  pumpkaboo: 'pumpkaboo_small',
  gourgeist: 'gourgeist_small',
  hoopa: 'hoopa_confined',
  oricorio: 'oricorio_baile',
  lycanroc: 'lycanroc_midday',
  wishiwashi: 'wishiwashi_solo',
  eiscue: 'eiscue_ice',
  indeedee: 'indeedee_male',
  morpeko: 'morpeko_full_belly',
  enamorus: 'enamorus_incarnate',
  palafin: 'palafin_zero',
  koraidon: 'koraidon_apex',
  miraidon: 'miraidon_ultimate',
  // The legacy data has these six only under the form's name, but the `Pokemon` table may hold a
  // row under the bare species name (production has `zacian`): it is the same Pokémon.
  giratina: 'giratina_altered',
  shaymin: 'shaymin_land',
  cherrim: 'cherrim_overcast',
  wormadam: 'wormadam_plant',
  zacian: 'zacian_hero',
  zamazenta: 'zamazenta_hero',
};

/**
 * The name written to `Pokemon.name` for keys where the aliases alone do not give the legacy
 * spelling. The legacy bot matches rows to its data by exact string, so case matters: the data
 * has no `deoxys`, only `deoxys_normal`, and spells the female Oinkologne in upper case. The
 * four other species the data lists under both names (obstagoon, perrserker, runerigus,
 * oinkologne) are not here: they use the plain name. The last four are default forms the data
 * lists under the form's name as well as the species name: the form's name is the exact match.
 */
const PREFERRED_LEGACY_NAMES: Readonly<Record<string, string>> = {
  deoxys: 'deoxys_normal',
  oinkologne_female: 'OINKOLOGNE_FEMALE',
  pumpkaboo_small: 'pumpkaboo_small',
  gourgeist_small: 'gourgeist_small',
  hoopa_confined: 'hoopa_confined',
  palafin_zero: 'palafin_zero',
  // The data has only the form's name for these; the bare name is a stray row at most.
  giratina_altered: 'giratina_altered',
  shaymin_land: 'shaymin_land',
  cherrim_overcast: 'cherrim_overcast',
  wormadam_plant: 'wormadam_plant',
  zacian_hero: 'zacian_hero',
  zamazenta_hero: 'zamazenta_hero',
};

/** Every alias, grouped by the key it stands for, in the order of `LEGACY_NAME_ALIASES`. */
const ALIASES_BY_KEY = new Map<string, string[]>();
for (const [legacyName, key] of Object.entries(LEGACY_NAME_ALIASES)) {
  ALIASES_BY_KEY.set(key, [...(ALIASES_BY_KEY.get(key) ?? []), legacyName]);
}

/** The catalogue key for a name used by the legacy bot. */
export function keyForLegacyName(name: string): string {
  const lower = name.trim().toLowerCase();
  return LEGACY_NAME_ALIASES[lower] ?? lower;
}

/**
 * Every name under which the legacy data may hold a row for a catalogue key, the preferred one
 * first. The aliases that end in `_normal` are game-master form ids; the plain name comes after
 * them only for `deoxys`, whose preferred name is `deoxys_normal`.
 */
export function legacyNamesForKey(key: string): string[] {
  const aliases = ALIASES_BY_KEY.get(key) ?? [];
  const plain = aliases.find((alias) => !alias.endsWith('_normal'));
  const preferred = PREFERRED_LEGACY_NAMES[key] ?? plain ?? key;
  return [...new Set([preferred, ...aliases, key])];
}

/**
 * The name the new bot writes to `Pokemon.name` for a catalogue key, exactly as the legacy data
 * spells it: the one alias a key has (`nidoran♀`), the plain name for species the data lists
 * twice, `deoxys_normal` and `OINKOLOGNE_FEMALE` where the data uses those, otherwise the key.
 */
export function legacyNameForKey(key: string): string {
  return legacyNamesForKey(key)[0] ?? key;
}
