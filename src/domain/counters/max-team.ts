import { z } from 'zod';
import type { PokemonCatalogue } from '../pogo/catalogue.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { MAX_FEED_TIERS, maxBossOf } from '../pogo/max-bosses.js';
import type { MaxTier } from '../pogo/max-tier.js';
import { titleCase } from '../pogo/names.js';
import {
  POKEBATTLER_SITE,
  pokebattlerBossIds,
  type AttackerLevel,
  type CounterWeather,
  type Friendship,
} from './options.js';

/*
 * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
 * three for a max battle, `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=a&
 * heal=h&shield=s&charge=c&meterCharge=m&level=n&weatherCondition=w&friendLevel=f` (explored on
 * 2026-10-21: the five counts must add to 3, else 400; `level`, `weatherCondition` and
 * `friendLevel` are honoured, a Pokébox is not). One slot per Pokémon, each with its role, moves,
 * level and ten alternatives. The endpoint is not among Pokebattler's documented ones
 * (www.pokebattler.com/developers) and may change.
 */

/**
 * What a member's three Pokémon are for: how many attack, charge the meter (`meterCharge`, a
 * charger), shield (Max Guard, a shielder), heal (Max Spirit, a healer), and `charge` (a
 * defender in Pokebattler's Lobby: it charges the meter and takes hits).
 */
export interface MaxRoleTeam {
  /** The role as `/counters` offers it. */
  name: string;
  /** The team in words, for the answer. */
  team: string;
  attack: number;
  meterCharge: number;
  shield: number;
  heal: number;
  charge: number;
}

/**
 * The roles a member plays in a max battle: Pokebattler's party definitions (Matt, 2026-10-24,
 * for consistency with its Lobby: "an Attacker brings 2 Chargers and 1 Attacker, a Defensive
 * trainer brings 2 Defenders and 1 Attacker, a Healer brings 1 Healer and 2 Defenders, a
 * Shielder brings 3 Shielders"), in its order, its first role the default as the Lobby's "Your
 * role" is. They replace Matt's five of 2026-10-21 (plan 8X-I).
 */
export const MAX_ROLES = {
  attacker: {
    name: 'Attacker',
    team: 'an attacker and two chargers',
    attack: 1,
    meterCharge: 2,
    shield: 0,
    heal: 0,
    charge: 0,
  },
  defensive: {
    name: 'Defensive',
    team: 'an attacker and two defenders',
    attack: 1,
    meterCharge: 0,
    shield: 0,
    heal: 0,
    charge: 2,
  },
  healer: {
    name: 'Healer',
    team: 'a healer and two defenders',
    attack: 0,
    meterCharge: 0,
    shield: 0,
    heal: 1,
    charge: 2,
  },
  shielder: {
    name: 'Shielder',
    team: 'three shielders',
    attack: 0,
    meterCharge: 0,
    shield: 3,
    heal: 0,
    charge: 0,
  },
} as const satisfies Record<string, MaxRoleTeam>;

export type MaxRole = keyof typeof MAX_ROLES;

/**
 * The roles before plan 8X-I that are no key now, as the nearest of Pokebattler's: a command not
 * yet deployed again sends the old keys (Discord sends the choices it was given). (A dialog
 * opened before cannot: its options were kept in memory, and after the restart its submit is told
 * they are no longer kept.) `shielder` and `healer` kept their keys.
 */
const ROLES_BEFORE: Readonly<Record<string, MaxRole>> = {
  charger: 'attacker',
  balanced: 'attacker',
  attackers: 'attacker',
};

/** A role by its key, or by a key before 8X-I (`ROLES_BEFORE`); undefined for another. */
export function maxRoleNamed(value: string): MaxRole | undefined {
  if (Object.hasOwn(MAX_ROLES, value)) return value as MaxRole;
  return Object.hasOwn(ROLES_BEFORE, value) ? ROLES_BEFORE[value] : undefined;
}

/**
 * The boss's Lobby on Pokebattler's site (`/max/<boss>/PARTY`), for the boss as Pokebattler knew
 * it: the page that builds its suggested team with the very endpoint Pine asks (`maxTeamPath`;
 * plan 8X-I, `utilities.md`), whatever the role. The role pages under `/max/<boss>` rank single
 * Pokémon by another measure and are not the team Pine shows.
 */
export function maxTeamLink(boss: string): string {
  return `${POKEBATTLER_SITE}/max/${encodeURIComponent(boss)}/PARTY`;
}

/** The roles in the order `/counters` offers them. */
export const MAX_ROLE_KEYS = Object.keys(MAX_ROLES) as MaxRole[];

/** A member who says nothing is Pokebattler's Attacker, as its Lobby's "Your role" defaults. */
export const DEFAULT_MAX_ROLE: MaxRole = 'attacker';

/**
 * The levels a team is simulated at (Matt, 2026-10-21): the raid counters' levels in steps of
 * five, without the best buddy levels 41 and 51 (only one Pokémon at a time is a best buddy, so a
 * team of three at 51 makes no sense).
 */
export const MAX_TEAM_LEVELS = [
  '20',
  '25',
  '30',
  '35',
  '40',
  '45',
  '50',
] as const satisfies readonly AttackerLevel[];
export type MaxTeamLevel = (typeof MAX_TEAM_LEVELS)[number];

/** The raid counters' default level (`DEFAULT_ATTACKER_LEVEL`), which is one of the team's. */
export const DEFAULT_MAX_TEAM_LEVEL: MaxTeamLevel = '40';

export function isMaxTeamLevel(value: string): value is MaxTeamLevel {
  return (MAX_TEAM_LEVELS as readonly string[]).includes(value);
}

const LEVEL_OF_TIER = new Map<MaxTier, string>(
  Object.entries(MAX_FEED_TIERS).map(([level, tier]) => [tier, level]),
);

/** Pokebattler's level of a max tier, as its boss list names it: `RAID_LEVEL_6_MAX` for `G`. */
export function pokebattlerMaxLevel(tier: MaxTier): string {
  const level = LEVEL_OF_TIER.get(tier);
  if (level === undefined) throw new Error(`no Pokebattler level for the max tier ${tier}`);
  return level;
}

const GIGANTAMAX_SUFFIX = '_GIGANTAMAX';

/**
 * The names under which Pokebattler may know a max boss, to be tried in this order (as
 * `pokebattlerBossIds` for a raid): a Dynamax boss by its Pokebattler name; a Gigantamax boss by
 * that name without `_FORM` and with `_GIGANTAMAX`, as the max boss feed writes it
 * (`MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`). A mega never battles in a max battle: no
 * names.
 */
export function pokebattlerMaxDefenders(entry: PokemonEntry, tier: MaxTier): string[] {
  if (entry.kind === 'mega' || entry.tempEvolution !== null) return [];
  const names = pokebattlerBossIds(entry, false);
  if (tier !== 'G') return names;
  return [...new Set(names.map((name) => `${name.replace(/_FORM$/, '')}${GIGANTAMAX_SUFFIX}`))];
}

/**
 * The names under which Pokebattler may know a Gigantamax boss, to be tried in this order: the
 * Pokémon's own (`pokebattlerMaxDefenders`) where the game master has it Gigantamax, then those of
 * its species' forms that it has so (Toxtricity: the species and both forms answer; Urshifu: only
 * its forms Gigantamax). None for a Pokémon the game master never has Gigantamax, which is refused
 * before Pokebattler is asked.
 */
export function gigantamaxDefenders(
  entry: PokemonEntry,
  catalogue: Pick<PokemonCatalogue, 'canGigantamax' | 'byDex'>,
): string[] {
  if (entry.kind === 'mega' || entry.tempEvolution !== null) return [];
  const own = catalogue.canGigantamax(entry) ? [entry] : [];
  // A species stands for its forms; a form named is that form alone.
  const forms =
    entry.kind === 'species'
      ? catalogue
          .byDex(entry.dex)
          .filter(
            (other) =>
              other.kind !== 'species' && other.kind !== 'mega' && catalogue.canGigantamax(other),
          )
      : [];
  const names = [...own, ...forms].flatMap((one) => pokebattlerMaxDefenders(one, 'G'));
  return [...new Set(names)];
}

/** One request of a team. */
export interface MaxTeamQuery {
  /** The boss's Pokebattler name (`pokebattlerMaxDefenders`). */
  boss: string;
  /** Pokebattler's level of the tier (`pokebattlerMaxLevel`). */
  maxLevel: string;
  role: MaxRole;
  /** The level of the member's Pokémon. */
  level: MaxTeamLevel;
  /** Pokebattler's weather (`weatherCondition`, which the endpoint honours; `weather` it ignores). */
  weather: CounterWeather;
  /** Friendship with the others in the battle (`friendLevel`; friendship 0 without it). */
  friendship: Friendship;
}

/** The path and query of a team's request (explored 2026-10-21). */
export function maxTeamPath(query: MaxTeamQuery): string {
  const { attack, heal, shield, charge, meterCharge } = MAX_ROLES[query.role];
  const params = new URLSearchParams({
    attack: String(attack),
    heal: String(heal),
    shield: String(shield),
    // Every count is sent, also those of none.
    charge: String(charge),
    meterCharge: String(meterCharge),
    level: query.level,
    weatherCondition: query.weather,
    friendLevel: `FRIENDSHIP_LEVEL_${query.friendship}`,
  });
  return (
    `/max/parties/suggested/defenders/${encodeURIComponent(query.boss)}` +
    `/levels/${encodeURIComponent(query.maxLevel)}?${params.toString()}`
  );
}

/** A Pokémon of a team: Pokebattler's name of it, its moves and level. */
export interface MaxPick {
  /** Pokebattler's name (`ZACIAN_CROWNED_SWORD_FORM`, `RILLABOOM_GIGANTAMAX`). */
  pokemonId: string;
  /** Move ids as the game master writes them. */
  fast: string;
  /** Null where Pokebattler names none (`MOVE_NONE`): the max moves are the point. */
  charged: string | null;
  /** The level Pokebattler simulated it at; null when not given. */
  level: string | null;
}

/** The levels of the max moves Pokebattler assumed. */
export interface MaxMoveLevels {
  /** Max Attack (`maxPowerLevel`). */
  attack: number;
  /** Max Guard (`maxShieldLevel`). */
  guard: number;
  /** Max Spirit (`maxHealLevel`). */
  spirit: number;
}

/** One of the three Pokémon of a team, with the alternatives Pokebattler gives for its place. */
export interface MaxSlot {
  /** Pokebattler's role: `ATTACK`, `METER_CHARGE`, `SHIELD`, `HEAL`, `CHARGE` (`slotRoleWords`). */
  role: string;
  pick: MaxPick;
  alternatives: MaxPick[];
  /** Undefined when the answer does not give them. */
  maxMoves: MaxMoveLevels | undefined;
}

export interface MaxTeamAnswer {
  slots: MaxSlot[];
  /** How many slots and alternatives did not fit and were left out; absent when none. */
  dropped?: { slots: number; alternatives: number };
}

const pickSchema = z.object({
  // Pokebattler's words only (`ATTACK`, `METER_CHARGE`): a role it adds is shown in words.
  role: z.string().regex(/^[A-Z_]{1,40}$/),
  pokemonId: z.string().min(1).max(100),
  quickMove: z.string().min(1).max(100),
  cinematicMove: z.string().max(100).nullish(),
  level: z.union([z.string().max(10), z.number().finite()]).nullish(),
  maxPowerLevel: z.number().int().nonnegative().nullish(),
  maxShieldLevel: z.number().int().nonnegative().nullish(),
  maxHealLevel: z.number().int().nonnegative().nullish(),
});

const slotSchema = pickSchema.extend({ alternatives: z.array(z.unknown()).nullish() });

const answerSchema = z.object({ slots: z.array(z.unknown()) });

/** The charged move Pokebattler writes where a Pokémon has none. */
const NO_MOVE = 'MOVE_NONE';

function pickOf(raw: z.infer<typeof pickSchema>): MaxPick {
  const charged = raw.cinematicMove ?? '';
  return {
    pokemonId: raw.pokemonId,
    fast: raw.quickMove,
    charged: charged === '' || charged === NO_MOVE ? null : charged,
    level: raw.level === null || raw.level === undefined ? null : String(raw.level),
  };
}

function slotOf(value: unknown, dropped: { alternatives: number }): MaxSlot | undefined {
  const parsed = slotSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const raw = parsed.data;
  const alternatives: MaxPick[] = [];
  for (const other of raw.alternatives ?? []) {
    const read = pickSchema.safeParse(other);
    if (read.success) alternatives.push(pickOf(read.data));
    else dropped.alternatives += 1;
  }
  const { maxPowerLevel, maxShieldLevel, maxHealLevel } = raw;
  return {
    role: raw.role,
    pick: pickOf(raw),
    alternatives,
    maxMoves:
      typeof maxPowerLevel === 'number' &&
      typeof maxShieldLevel === 'number' &&
      typeof maxHealLevel === 'number'
        ? { attack: maxPowerLevel, guard: maxShieldLevel, spirit: maxHealLevel }
        : undefined,
  };
}

/**
 * Reads Pokebattler's answer of a team, checked for the fields used: a slot or alternative that
 * does not fit is left out and the rest is read, and counted (`dropped`); undefined for an
 * answer not of this shape (an error body) and for one with slots none of which fit (a field
 * renamed: that is no empty team). An answer may have no slot at all. A team is three Pokémon (a
 * trainer's): the slots after the first three that fit are left out and counted too.
 */
export function readMaxTeam(body: unknown): MaxTeamAnswer | undefined {
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const dropped = { slots: 0, alternatives: 0 };
  const slots: MaxSlot[] = [];
  for (const value of parsed.data.slots) {
    const slot = slots.length < MAX_TEAM_SIZE ? slotOf(value, dropped) : undefined;
    if (slot) slots.push(slot);
    else dropped.slots += 1;
  }
  if (slots.length === 0 && dropped.slots > 0) return undefined;
  return dropped.slots + dropped.alternatives === 0 ? { slots } : { slots, dropped };
}

/** The Pokémon of a team: a trainer's three. */
export const MAX_TEAM_SIZE = 3;

/** A slot's role in words. */
export interface SlotRoleWords {
  /** The role of one Pokémon: `Charger`. */
  one: string;
  /** The head of its alternatives: `Other chargers`. */
  others: string;
  /** What the role does, as Pokebattler's Lobby says it; absent for a role Pine does not know. */
  does?: string;
}

/**
 * The words of Pokebattler's roles of a slot as its Lobby names and describes them (seen on
 * 2026-10-24: "Attacker · Max phase only", "Charger · Fills the Max Meter fast"; `CHARGE` is its
 * Defender, `METER_CHARGE` its Charger).
 */
const SLOT_ROLES: Readonly<Record<string, Required<SlotRoleWords>>> = {
  ATTACK: { one: 'Attacker', others: 'Other attackers', does: 'max phase only' },
  METER_CHARGE: { one: 'Charger', others: 'Other chargers', does: 'fills the Max Meter' },
  SHIELD: { one: 'Shielder', others: 'Other shielders', does: 'shields and taunts' },
  HEAL: { one: 'Healer', others: 'Other healers', does: 'heals the team' },
  CHARGE: { one: 'Defender', others: 'Other defenders', does: 'charges the meter, takes hits' },
};

/**
 * A slot's role in words: `Attacker` (one), `Other attackers` (the head of its alternatives) and
 * what it does (`max phase only`); another in Pokebattler's words, its alternatives just
 * `Others`, without a description.
 */
export function slotRoleWords(role: string): SlotRoleWords {
  // The role is a word of Pokebattler's answer: only the table's own names (plan 8Z-2).
  const known = Object.hasOwn(SLOT_ROLES, role) ? SLOT_ROLES[role] : undefined;
  return known ?? { one: titleCase(role), others: 'Others' };
}

/** A Pokémon of a team as the answer shows it. */
export interface MaxTeamMember {
  /** `Zacian (Crowned Sword)`, `Gigantamax Rillaboom`, or Pokebattler's name in words. */
  name: string;
  /** Undefined for a Pokémon the game data does not know. */
  entry?: PokemonEntry;
  gigantamax: boolean;
}

/**
 * A Pokémon of a team by Pokebattler's name, mapped as the max boss feed is (`maxBossOf`): a
 * Gigantamax name (`RILLABOOM_GIGANTAMAX`) is the Pokémon it names, called `Gigantamax Rillaboom`;
 * a name the game data does not know is Pokebattler's in words (`entry` undefined: the caller
 * logs it).
 */
export function maxTeamMember(pokemonId: string, catalogue: PokemonCatalogue): MaxTeamMember {
  const { entry, gigantamax } = maxBossOf(pokemonId, catalogue);
  const base = gigantamax ? pokemonId.slice(0, -GIGANTAMAX_SUFFIX.length) : pokemonId;
  const name = entry?.name ?? titleCase(base.replace(/-/g, '_'));
  return {
    name: gigantamax ? `Gigantamax ${name}` : name,
    ...(entry ? { entry } : {}),
    gigantamax,
  };
}
