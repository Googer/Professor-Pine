import type { PokemonEntry } from '../pogo/game-master.js';
import type { RaidLevel, RaidTier } from '../pogo/raid-tier.js';

/**
 * The fixed lists of `/counters` (spec 487: the legacy `data/counters.json` as typed constants)
 * and how each value is written in a request to Pokebattler.
 */

/** The levels of the attackers Pokebattler simulates with (its `attackers/levels/<n>`). */
export const ATTACKER_LEVELS = ['20', '25', '30', '35', '40', '41', '45', '50', '51'] as const;
export type AttackerLevel = (typeof ATTACKER_LEVELS)[number];

/** Level 40: the common case, shown in the answer's line of what was used and preselected in the dialog (ruling, plan 6B). */
export const DEFAULT_ATTACKER_LEVEL: AttackerLevel = '40';

export const ATTACKER_LEVEL_NAMES: Readonly<Record<AttackerLevel, string>> = {
  '20': 'Level 20',
  '25': 'Level 25',
  '30': 'Level 30',
  '35': 'Level 35',
  '40': 'Level 40',
  '41': 'Level 41 (best buddy at 40)',
  '45': 'Level 45',
  '50': 'Level 50',
  '51': 'Level 51 (best buddy at 50)',
};

export function isAttackerLevel(value: string): value is AttackerLevel {
  return (ATTACKER_LEVELS as readonly string[]).includes(value);
}

/** Pokebattler's weather conditions (`weatherCondition`). */
export const WEATHERS = [
  'NO_WEATHER',
  'CLEAR',
  'RAINY',
  'PARTLY_CLOUDY',
  'OVERCAST',
  'WINDY',
  'SNOW',
  'FOG',
] as const;
export type CounterWeather = (typeof WEATHERS)[number];

export const DEFAULT_WEATHER: CounterWeather = 'NO_WEATHER';

export const WEATHER_NAMES: Readonly<Record<CounterWeather, string>> = {
  NO_WEATHER: 'No weather',
  CLEAR: 'Sunny or clear',
  RAINY: 'Rainy',
  PARTLY_CLOUDY: 'Partly cloudy',
  OVERCAST: 'Cloudy',
  WINDY: 'Windy',
  SNOW: 'Snow',
  FOG: 'Fog',
};

export function isCounterWeather(value: string): value is CounterWeather {
  return (WEATHERS as readonly string[]).includes(value);
}

/** Friendship with the other trainers of the raid, 0 (none) to 4 (best friends). */
export const FRIENDSHIPS = ['0', '1', '2', '3', '4'] as const;
export type Friendship = (typeof FRIENDSHIPS)[number];

/** Best friends: the common case among the members of a raid group (ruling, plan 6B). */
export const DEFAULT_FRIENDSHIP: Friendship = '4';

export const FRIENDSHIP_NAMES: Readonly<Record<Friendship, string>> = {
  '0': 'Not friends',
  '1': 'Good friends',
  '2': 'Great friends',
  '3': 'Ultra friends',
  '4': 'Best friends',
};

export function isFriendship(value: string): value is Friendship {
  return (FRIENDSHIPS as readonly string[]).includes(value);
}

/**
 * Pokebattler's raid level of each tier, as its list of raids names them (checked live on
 * 2026-10-14). A mega legendary raid is its `MEGA_5`, a super mega raid its `5_MEGA_ENHANCED`.
 */
const RAID_LEVEL_NAMES: Readonly<Record<RaidLevel, string>> = {
  T1: 'RAID_LEVEL_1',
  T3: 'RAID_LEVEL_3',
  T5: 'RAID_LEVEL_5',
  Mega: 'RAID_LEVEL_MEGA',
  MegaLegendary: 'RAID_LEVEL_MEGA_5',
  SuperMega: 'RAID_LEVEL_5_MEGA_ENHANCED',
  Elite: 'RAID_LEVEL_ELITE',
};

/** The shadow raid levels Pokebattler has. */
const SHADOW_RAID_LEVEL_NAMES: Readonly<Partial<Record<RaidLevel, string>>> = {
  T1: 'RAID_LEVEL_1_SHADOW',
  T3: 'RAID_LEVEL_3_SHADOW',
  T5: 'RAID_LEVEL_5_SHADOW',
};

/**
 * Pokebattler's raid level for a tier; undefined for a tier it has none for, which is refused
 * with a sentence and never asked with a guessed level.
 */
export function pokebattlerRaidLevel(tier: RaidTier): string | undefined {
  return tier.shadow ? SHADOW_RAID_LEVEL_NAMES[tier.level] : RAID_LEVEL_NAMES[tier.level];
}

/**
 * The names under which Pokebattler may know a boss, to be tried in this order (the next only
 * when the one before is unknown to it, or answers without any counter). Usually the catalogue's `pokebattlerId`. A species known
 * by its default form (`LANDORUS_INCARNATE_FORM`) falls back to the bare species id, which the
 * legacy data used for 14 of them (follow-ups: which Pokebattler takes is for staging to show).
 * A shadow boss is `<species>_SHADOW_FORM` (live, 2026-10-14: `LANDORUS_SHADOW_FORM`); for a
 * regional or other form the form's name stands for the species (`ARCANINE_HISUIAN_SHADOW_FORM`,
 * not seen live). A mega is never a shadow boss: no names.
 */
export function pokebattlerBossIds(entry: PokemonEntry, shadow: boolean): string[] {
  if (shadow) {
    if (entry.kind === 'mega') return [];
    const base =
      entry.kind === 'species' ? entry.pokemonId : entry.pokebattlerId.replace(/_FORM$/, '');
    return [`${base}_SHADOW_FORM`];
  }
  const names = [entry.pokebattlerId];
  if (entry.kind === 'species' && entry.pokebattlerId !== entry.pokemonId) {
    names.push(entry.pokemonId);
  }
  return names;
}

/** Where the attackers of a simulation come from: everybody's at a level, or one Pokébox. */
export type CounterAttackers =
  { kind: 'level'; level: AttackerLevel } | { kind: 'box'; userId: number };

/** One simulation Pokebattler is asked for. */
export interface CounterQuery {
  /** The boss's Pokebattler name (`pokebattlerBossIds`). */
  boss: string;
  /** Pokebattler's raid level (`pokebattlerRaidLevel`). */
  raidLevel: string;
  attackers: CounterAttackers;
  weather: CounterWeather;
  friendship: Friendship;
  /** Shadow Pokémon among the counters (Pokebattler leaves them out of its list otherwise). */
  shadow: boolean;
  /** Megas and primals among the counters (likewise). */
  mega: boolean;
}

/** Pokebattler's API of raid simulations. */
export const POKEBATTLER_API = 'https://fight.pokebattler.com';
/** Pokebattler's site, where the same path shows the full results. */
export const POKEBATTLER_SITE = 'https://www.pokebattler.com';

/**
 * The boss's page of full results on Pokebattler's site. The site of 2026-10-21 sends the API's
 * long path (`counterPath`) to `/raids/<boss>`, dropping every option, and reads only a few
 * options from the address (weather, level and friendship are set in the page): the shadow
 * Pokémon and megas the answer left out are left out there too.
 */
export function counterSiteLink(query: CounterQuery): string {
  const params = new URLSearchParams();
  if (!query.shadow) params.set('includeShadow', '0');
  if (!query.mega) params.set('includeMegas', '0');
  const options = params.toString();
  return (
    `${POKEBATTLER_SITE}/raids/${encodeURIComponent(query.boss)}` +
    (options === '' ? '' : `?${options}`)
  );
}

/**
 * The path and query of a simulation, as the legacy bot asked it: the attack when possible, a
 * random boss moveset mix, dodging at reaction time, averaged, any number of other trainers;
 * shadow Pokémon and megas left out by Pokebattler unless they are listed, so that its list of
 * thirty is not mostly counters the answer would drop (staging 2026-10-16: 21 of Dialga's 30
 * were, and 9 of the twelve were left). The site has a page of its own (`counterSiteLink`).
 */
export function counterPath(query: CounterQuery): string {
  const attackers =
    query.attackers.kind === 'level'
      ? `levels/${query.attackers.level}`
      : `users/${String(query.attackers.userId)}`;
  const params = new URLSearchParams({
    sort: 'TIME',
    weatherCondition: query.weather,
    dodgeStrategy: 'DODGE_REACTION_TIME',
    aggregation: 'AVERAGE',
    randomAssistants: '-1',
    friendLevel: `FRIENDSHIP_LEVEL_${query.friendship}`,
    includeShadow: String(query.shadow),
    includeMegas: String(query.mega),
  });
  return (
    `/raids/defenders/${encodeURIComponent(query.boss)}/levels/${encodeURIComponent(query.raidLevel)}` +
    `/attackers/${attackers}/strategies/CINEMATIC_ATTACK_WHEN_POSSIBLE/DEFENSE_RANDOM_MC` +
    `?${params.toString()}`
  );
}
