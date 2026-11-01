/** The 18 types, in the order the game master lists defenders in `typeEffective.attackScalar`. */
export const POKEMON_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export const WEATHER_CONDITIONS = [
  'clear',
  'rainy',
  'partly_cloudy',
  'overcast',
  'windy',
  'snow',
  'fog',
] as const;
export type Weather = (typeof WEATHER_CONDITIONS)[number];

/** `POKEMON_TYPE_GRASS` → `grass`. Undefined for anything that is not one of the 18 types. */
export function parseType(raw: unknown): PokemonType | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.replace(/^POKEMON_TYPE_/, '').toLowerCase();
  return (POKEMON_TYPES as readonly string[]).includes(name) ? (name as PokemonType) : undefined;
}

export function parseWeather(raw: unknown): Weather | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.toLowerCase();
  return (WEATHER_CONDITIONS as readonly string[]).includes(name) ? (name as Weather) : undefined;
}

/** A temporary evolution: a mega evolution or a primal reversion. */
export type TempEvolution = 'MEGA' | 'MEGA_X' | 'MEGA_Y' | 'PRIMAL';
