import type { TempEvolution } from './types.js';

export type FormKind = 'species' | 'regional' | 'form' | 'mega';

const REGION_ADJECTIVES: Readonly<Record<string, string>> = {
  ALOLA: 'Alolan',
  GALARIAN: 'Galarian',
  HISUIAN: 'Hisuian',
  PALDEA: 'Paldean',
};

/** Species whose form texts are filed under the key of another species, or a misspelt one. */
const FORM_TEXT_PREFIX: Readonly<Record<string, string>> = {
  SCATTERBUG: 'form_vivillon_',
  SPEWPA: 'form_vivillon_',
  WORMADAM: 'form_burmy_',
  MINIOR: 'form_core_',
  SQUAWKABILLY: 'form_squakabilly_',
};

/** Generic `form_<suffix>` texts that belong to one species only (Kyurem, Castform). */
const SPECIES_ONLY_FORM_TEXTS = new Set(['white', 'black', 'sun', 'rain', 'snow', 'normal']);

/** Names the text file cannot supply. Keyed by game-master form id. */
const FORM_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  MEWTWO_A: 'Armored Mewtwo',
  UNOWN_EXCLAMATION_POINT: 'Unown (!)',
  UNOWN_QUESTION_MARK: 'Unown (?)',
  ZYGARDE_COMPLETE_TEN_PERCENT: 'Zygarde (10% Forme, Power Construct)',
  ZYGARDE_COMPLETE_FIFTY_PERCENT: 'Zygarde (50% Forme, Power Construct)',
};

const TEMP_EVOLUTION_TEXT_INDEX: Readonly<Record<TempEvolution, number>> = {
  MEGA: 1,
  MEGA_X: 2,
  MEGA_Y: 3,
  PRIMAL: 4,
};

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

export function titleCase(id: string): string {
  return id
    .toLowerCase()
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Species the text file may not name yet whose id runs two words together. */
const SPECIES_NAME_FALLBACKS: Readonly<Record<string, string>> = {
  WALKINGWAKE: 'Walking Wake',
  IRONLEAVES: 'Iron Leaves',
  GOUGINGFIRE: 'Gouging Fire',
  RAGINGBOLT: 'Raging Bolt',
  IRONBOULDER: 'Iron Boulder',
  IRONCROWN: 'Iron Crown',
};

/** The English name of a species; a fallback when the text file does not have it yet. */
export function speciesName(pokemonId: string, dex: number, texts: Map<string, string>): string {
  return (
    texts.get(`pokemon_name_${pad4(dex)}`) ??
    SPECIES_NAME_FALLBACKS[pokemonId] ??
    titleCase(pokemonId)
  );
}

/** The text describing a form, e.g. `Origin Forme`; undefined when the text file has none. */
function formText(
  pokemonId: string,
  suffix: string,
  texts: Map<string, string>,
): string | undefined {
  const lower = suffix.toLowerCase();
  const keys = [`form_${pokemonId.toLowerCase()}_${lower}`];
  const prefix = FORM_TEXT_PREFIX[pokemonId];
  if (prefix) keys.push(`${prefix}${lower}`);
  if (!SPECIES_ONLY_FORM_TEXTS.has(lower)) keys.push(`form_${lower}`);
  for (const key of keys) {
    const found = texts.get(key)?.trim();
    if (found) return found;
  }
  return undefined;
}

export interface NameInput {
  pokemonId: string;
  dex: number;
  /** Result of `speciesName`. */
  species: string;
  kind: FormKind;
  /** The form id without the species prefix, e.g. `ALOLA`, `ORIGIN`; null for species and megas. */
  suffix: string | null;
  form: string | null;
  tempEvolution: TempEvolution | null;
  texts: Map<string, string>;
}

/** English display name: `Alolan Rattata`, `Giratina (Origin Forme)`, `Mega Charizard X`. */
export function displayName(input: NameInput): string {
  const { pokemonId, dex, species, kind, suffix, form, tempEvolution, texts } = input;
  const override = form ? FORM_NAME_OVERRIDES[form] : undefined;
  if (override) return override;

  if (kind === 'mega' && tempEvolution) {
    const fromText = texts.get(
      `pokemon_name_${pad4(dex)}_${pad4(TEMP_EVOLUTION_TEXT_INDEX[tempEvolution])}`,
    );
    if (fromText) return fromText;
    const [stage, variant] = tempEvolution.split('_');
    return `${titleCase(stage ?? '')} ${species}${variant ? ` ${variant}` : ''}`;
  }
  if (suffix === null || kind === 'species') return species;

  if (kind === 'regional') {
    const [region, ...rest] = suffix.split('_');
    const regional = `${REGION_ADJECTIVES[region ?? ''] ?? titleCase(region ?? '')} ${species}`;
    if (rest.length === 0) return regional;
    const remainder = rest.join('_');
    const described =
      formText(pokemonId, remainder, texts) ??
      formText(pokemonId, suffix, texts) ??
      titleCase(remainder);
    return `${regional} (${described})`;
  }
  const described = formText(pokemonId, suffix, texts) ?? titleCase(suffix);
  return described.toLowerCase().includes(species.toLowerCase())
    ? described
    : `${species} (${described})`;
}
