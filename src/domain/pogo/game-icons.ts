import { POKEMON_TYPES, type PokemonType, type Weather } from './types.js';

/**
 * The names of the emoji that show the game's icons for types, weather and teams, and those of
 * a post's controls. They are the names the legacy bot looked up among a server's own emoji, so a
 * server that uploaded them for it keeps showing its own where the bot's application has none.
 */

/** A type's emoji has the type's name: `rock`, `electric`. */
export const TYPE_ICON_NAMES: readonly PokemonType[] = POKEMON_TYPES;

/**
 * The emoji of each weather of the game master. The game's clear weather is shown by the sunny
 * icon; the night-time clear icon is uploaded under `clear` for the legacy names, but not shown.
 */
export const WEATHER_ICON: Readonly<Record<Weather, string>> = {
  clear: 'sunny',
  rainy: 'rain',
  partly_cloudy: 'partlycloudy',
  overcast: 'cloudy',
  windy: 'windy',
  snow: 'snow',
  fog: 'fog',
};

/** Every weather emoji, in the legacy bot's names. */
export const WEATHER_ICON_NAMES = [
  'sunny',
  'clear',
  'rain',
  'partlycloudy',
  'cloudy',
  'windy',
  'snow',
  'fog',
] as const;

/** The teams' emoji; `teamless` is for a member without a team. */
export const TEAM_ICON_NAMES = ['instinct', 'mystic', 'valor', 'teamless'] as const;

/**
 * The emoji of the leagues of Go Battle League (2026-10-23): the game's own icons, on `/rank`'s
 * buttons and before the league's name in its answer; the words where the application has none.
 */
export const LEAGUE_ICON = {
  little: 'leaguelittle',
  great: 'leaguegreat',
  ultra: 'leagueultra',
  master: 'leaguemaster',
} as const;

export const LEAGUE_ICON_NAMES = Object.values(LEAGUE_ICON);

/**
 * The emoji of the controls of a post (plan 8D-G): legacy Pine's reaction icons, made from the
 * game's (a shoe for Join, the location arrow for Here, the medallion for Done, the remote raid
 * pass, the trash can for Leave). Where none of a name exists the button shows a plain emoji.
 * `pinemeet` is the game's Select Time icon on Meet… (plan 8X-1B), cropped from a raid screen
 * (2026-10-25: PokeMiners' assets have none), the blue made transparent and an outline added as
 * the others have; ⏰ until the application has it. `pinetrain` is Pine's own train C3b (plan
 * 8M-11A, Matt 2026-10-28), in front of a train's name in the summary's lists and the new-train DMs,
 * never on a button; those lines read as before until the application has it. `pinedmax` and
 * `pinegmax` are the game's Dynamax and Gigantamax icons (the web's `pictures/icons/`, filled
 * with their color and outlined), before the max kinds in Manage…'s menu of a train; 🔴 and 🌋
 * until the application has them.
 */
export const CONTROL_ICON_NAMES = [
  'pinejoin',
  'pinehere',
  'pinedone',
  'pineremote',
  'pineleave',
  'pinemeet',
  'pinetrain',
  'pinedmax',
  'pinegmax',
] as const;
export type ControlIconName = (typeof CONTROL_ICON_NAMES)[number];

/** Every emoji of the game's icons that the bot looks for, as the upload script makes them. */
export const GAME_ICON_NAMES: readonly string[] = [
  ...TYPE_ICON_NAMES,
  ...WEATHER_ICON_NAMES,
  ...TEAM_ICON_NAMES,
  ...LEAGUE_ICON_NAMES,
  ...CONTROL_ICON_NAMES,
];

/** A weather in words where no emoji shows it: as the game names it, in sentence case. */
const WEATHER_WORDS: Readonly<Record<Weather, string>> = {
  clear: 'Sunny',
  rainy: 'Rainy',
  partly_cloudy: 'Partly cloudy',
  overcast: 'Cloudy',
  windy: 'Windy',
  snow: 'Snow',
  fog: 'Fog',
};

export function weatherWord(weather: Weather): string {
  return WEATHER_WORDS[weather];
}

/** A type in words where no emoji shows it: `Rock`. */
export function typeWord(type: PokemonType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
