import type { PokemonCatalogue } from '../pogo/catalogue.js';
import { keyForLegacyName } from '../pogo/legacy-names.js';
import { PokemonSearch } from '../pogo/pokemon-search.js';
import { PartyStatus } from '../party/status.js';
import {
  historyBoss,
  stopsByRoute,
  withoutMembers,
  type HistoryAttendee,
  type HistoryBoss,
  type HistoryGroup,
  type HistoryKind,
  type HistoryRecord,
  type HistoryStatus,
  type HistoryStop,
  type HistoryTier,
} from './party-history.js';

/*
 * The legacy bot's parties, as its `parties/` folder kept them (node-persist: a file per key,
 * `{ key, value }`), read into records of the party history. `complete/` holds one file per gym
 * whose value is the list of every raid that ended there; `active/` a file per party that had
 * not ended (raids, trains, meetups). The fields came and went from 2018 to 2026; what this
 * reads is listed in docs/architecture/history.md. Nothing of a member is kept: the history of
 * the legacy bot serves counts only (everyone starts from zero; Matt, 2026-10-16).
 */

/** Why a party of the files is not imported. */
export const LEGACY_SKIPS = [
  'not-a-party',
  'unknown-kind',
  'no-creation-time',
  'no-channel',
  'no-creator',
  'no-attendees',
  'no-server',
] as const;
export type LegacySkip = (typeof LEGACY_SKIPS)[number];

export interface LegacyContext {
  /** Which folder the party is from: `complete` (ended) or `active` (going on at the cutover). */
  part: 'active' | 'complete';
  /** The region, and its server's snowflake, of a region channel by its snowflake. */
  regionOf(channelId: string): { regionId: number; serverId: string } | undefined;
  /**
   * The server of a party whose region is not known (`--server`, or the one server of every
   * region the files named that is known); undefined when there is none.
   */
  fallbackServerId: string | undefined;
  /**
   * Whether the gym list still has a gym of this id: the legacy bot's ids, on a database taken
   * over from it; never on another one, whose ids are not the files'.
   */
  gymExists(id: number): boolean;
  /** The boss of a raid from what the file kept of it (`legacyBossResolver`). */
  boss(pokemon: unknown): HistoryBoss | null;
  /** When the import runs: a train still going on had started when its start time was past. */
  now: number;
}

/** A record of the files; `byFallback`: its server is the fallback, not its region's. */
export type LegacyRead =
  { ok: true; record: HistoryRecord; byFallback: boolean } | { ok: false; reason: LegacySkip };

type Raw = Record<string, unknown>;

/** A Discord id as the files wrote it (the domain does not reach for `src/db`'s check). */
const SNOWFLAKE = /^\d{15,20}$/u;
const isSnowflake = (value: string): boolean => SNOWFLAKE.test(value);

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A whole number from 0 up, also from a string of digits (both were written); else none. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d{1,15}$/u.test(value.trim())) return Number(value.trim());
  return undefined;
}

function timeOf(value: unknown): number | null {
  const time = numberOf(value);
  return time !== undefined && time > 0 ? time : null;
}

/**
 * Text of the files (a name, a description, a label), tidied and cut to `room`, with every
 * member it names written `@member` (`withoutMembers`): the legacy history keeps nobody.
 */
function textOf(value: unknown, room = 100): string | null {
  if (typeof value !== 'string') return null;
  const text = withoutMembers(value).trim();
  return text === '' ? null : [...text].slice(0, room).join('');
}

const KINDS: Readonly<Record<string, HistoryKind>> = {
  raid: 'raid',
  'raid train': 'train',
  'meet-up': 'meetup',
};

const STATUS_WORDS: Readonly<Record<number, HistoryStatus>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'joined',
  [PartyStatus.Present]: 'here',
  [PartyStatus.CompletePending]: 'here',
  [PartyStatus.Complete]: 'done',
};

/**
 * The tier of a legacy raid: EX and elite by the raid's flags, a mega by its flags (tier 6 a
 * mega legendary), otherwise the number, tier 1 to 5 (the game had 2 and 4 until 2020). What the
 * files hold besides (`????` of a raid whose tier was not set, 7) is no tier.
 */
function tierOf(raid: Raw, pokemon: Raw): HistoryTier | null {
  if (raid.isExclusive === true || pokemon.exclusive === true) return 'EX';
  if (raid.isElite === true || pokemon.elite === true) return 'Elite';
  const level = numberOf(pokemon.tier) ?? numberOf(pokemon.backupTier);
  if (raid.isMega === true || pokemon.mega === true) return level === 6 ? 'MegaLegendary' : 'Mega';
  if (level === 6) return 'MegaLegendary';
  if (level !== undefined && level >= 1 && level <= 5) return `T${String(level)}` as HistoryTier;
  return null;
}

function attendeesOf(raw: Raw): HistoryAttendee[] {
  const attendees = isRaw(raw.attendees) ? Object.values(raw.attendees) : [];
  return attendees.flatMap((value): HistoryAttendee[] => {
    if (!isRaw(value)) return [];
    const status = STATUS_WORDS[numberOf(value.status) ?? -1];
    if (status === undefined) return [];
    const number = numberOf(value.number) ?? 1;
    return [
      {
        memberId: null,
        status,
        furthest: status,
        groupId: typeof value.group === 'string' ? value.group.slice(0, 1) : null,
        extras: Math.min(255, Math.max(0, number - 1)),
        remote: value.remote === true,
        team: null,
        signedUpAt: null,
        joinedAt: null,
        hereAt: null,
        doneAt: null,
        leftAt: null,
      },
    ];
  });
}

/** The groups of a party, each id once (the first of a name: two ids can cut to one letter). */
function groupsOf(raw: Raw, attendees: readonly HistoryAttendee[]): HistoryGroup[] {
  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  const seen = new Set<string>();
  return groups.flatMap((group): HistoryGroup[] => {
    if (!isRaw(group) || typeof group.id !== 'string' || group.id === '') return [];
    const groupId = group.id.slice(0, 1);
    if (seen.has(groupId)) return [];
    seen.add(groupId);
    const members = attendees.filter((attendee) => attendee.groupId === groupId);
    return [
      {
        groupId,
        label: textOf(group.label),
        // Both spellings were written.
        meetingTime: timeOf(group.startTime) ?? timeOf(group.start_time),
        members: members.length,
        heads: members.reduce((sum, attendee) => sum + 1 + attendee.extras, 0),
      },
    ];
  });
}

/**
 * The stops a legacy train made, as far as its route and current stop say (`currentGym`, past
 * the end once finished), without times: as for a live train of which no step was seen. A skip
 * cannot be told from a stop made: the files keep only where the train was.
 */
function stopsOf(raw: Raw, context: LegacyContext): HistoryStop[] {
  const route = (Array.isArray(raw.route) ? raw.route : [])
    .map(numberOf)
    .filter((id): id is number => id !== undefined);
  const at = numberOf(raw.currentGym) ?? 0;
  const made = stopsByRoute(route, at, timeOf(raw.startTime), context.now);
  return made.map((id) => ({
    gymId: context.gymExists(id) ? id : null,
    legacyGymId: id,
    // The legacy bot knew no power spots.
    wayspotId: null,
    arrivedAt: null,
    leftAt: null,
  }));
}

/**
 * What the import's first pass reads of a party: its key (as `legacyRecord` makes it), when it
 * was deleted (0 when the file does not say: of two copies of a party the later deletion wins)
 * and its region channel. Undefined for what has no key.
 */
export function legacyIdentity(
  raw: unknown,
): { key: string; deletionTime: number; sourceChannelId: string | null } | undefined {
  if (!isRaw(raw)) return undefined;
  const createdAt = timeOf(raw.creationTime);
  const channelId = typeof raw.channelId === 'string' ? raw.channelId : '';
  if (createdAt === null || !isSnowflake(channelId)) return undefined;
  const source = typeof raw.sourceChannelId === 'string' ? raw.sourceChannelId : '';
  return {
    key: `${channelId}:${String(createdAt)}`,
    deletionTime: timeOf(raw.deletionTime) ?? 0,
    sourceChannelId: isSnowflake(source) ? source : null,
  };
}

/**
 * The record of a party of the legacy files, or why it is skipped. Its key is its channel and
 * creation time (`<channel>:<ms>`): a raid the files hold twice is one raid, and a second import
 * finds it there already.
 */
export function legacyRecord(raw: unknown, context: LegacyContext): LegacyRead {
  if (!isRaw(raw)) return { ok: false, reason: 'not-a-party' };
  const kind = typeof raw.type === 'string' ? KINDS[raw.type] : undefined;
  if (kind === undefined) return { ok: false, reason: 'unknown-kind' };
  const createdAt = timeOf(raw.creationTime);
  if (createdAt === null) return { ok: false, reason: 'no-creation-time' };
  const channelId = typeof raw.channelId === 'string' ? raw.channelId : '';
  if (!isSnowflake(channelId)) return { ok: false, reason: 'no-channel' };
  const attendees = attendeesOf(raw);
  if (context.part === 'active') {
    const creator = raw.createdById;
    if (!(typeof creator === 'string' && isSnowflake(creator)) && typeof creator !== 'number') {
      return { ok: false, reason: 'no-creator' };
    }
    if (attendees.length === 0) return { ok: false, reason: 'no-attendees' };
  }
  const source = typeof raw.sourceChannelId === 'string' ? raw.sourceChannelId : '';
  const region = isSnowflake(source) ? context.regionOf(source) : undefined;
  const serverId = region?.serverId ?? context.fallbackServerId;
  if (serverId === undefined) return { ok: false, reason: 'no-server' };

  const pokemon = isRaw(raw.pokemon) ? raw.pokemon : {};
  const raid = kind === 'raid';
  const tier = raid ? tierOf(raw, pokemon) : null;
  const legacyGymId = raid ? (numberOf(raw.gymId) ?? null) : null;
  const ended =
    context.part === 'active'
      ? 'cutover'
      : attendees.some((attendee) => attendee.status === 'done')
        ? 'completed'
        : 'unknown';
  return {
    ok: true,
    byFallback: region === undefined,
    record: {
      source: 'legacy',
      partyId: null,
      legacyKey: `${channelId}:${String(createdAt)}`,
      kind,
      serverId,
      regionId: region?.regionId ?? null,
      gymId: legacyGymId !== null && context.gymExists(legacyGymId) ? legacyGymId : null,
      legacyGymId,
      // The legacy bot knew no max battles.
      wayspotId: null,
      name:
        kind === 'train'
          ? textOf(raw.trainName)
          : kind === 'meetup'
            ? textOf(raw.meetupName)
            : null,
      description: kind === 'meetup' ? textOf(raw.description, 4000) : null,
      tier,
      shadow: false,
      mega: tier === 'Mega' || tier === 'MegaLegendary',
      elite: tier === 'Elite',
      ex: tier === 'EX',
      shiny: pokemon.shiny === true ? true : null,
      boss: raid || isRaw(raw.pokemon) ? context.boss(raw.pokemon) : null,
      fastMove: textOf(raw.quickMove, 64),
      chargedMove: textOf(raw.cinematicMove, 64),
      createdAt,
      hatchTime: raid ? timeOf(raw.hatchTime) : null,
      startTime: raid ? null : timeOf(raw.startTime),
      endTime: timeOf(raw.endTime),
      endedAt:
        context.part === 'active'
          ? null
          : (timeOf(raw.deletionTime) ?? timeOf(raw.lastPossibleTime)),
      ending: ended,
      createdById: null,
      conductorId: null,
      anonymous: false,
      routeStops: kind === 'train' ? (Array.isArray(raw.route) ? raw.route.length : 0) : null,
      // The legacy bot's trains were all raid trains.
      trainKind: kind === 'train' ? 'raid' : null,
      // The legacy bot split no trains.
      splitFromId: null,
      attendees,
      groups: groupsOf(raw, attendees),
      stops: kind === 'train' ? stopsOf(raw, context) : [],
    },
  };
}

/** Names the legacy bot gave an egg or a raid whose boss nobody had named. */
const NO_BOSS = new Set(['pokemon', 'egg', 'mega', 'elite']);

/**
 * The boss of a legacy raid, from what its file kept (`pokemon`: a name as the bot spelled it in
 * its year, a form word, the Pokédex number): by number and form where both are there, else by
 * the name as members search for it, the legacy name, and the number; a name none of these finds
 * is kept as it was. An egg has none. The answers are remembered: the files name a few hundred
 * bosses a quarter of a million times.
 */
export function legacyBossResolver(
  catalogue: PokemonCatalogue,
): (pokemon: unknown) => HistoryBoss | null {
  const search = new PokemonSearch(catalogue);
  const known = new Map<string, HistoryBoss | null>();
  const find = (name: string, form: string | null, dex: number | undefined): HistoryBoss => {
    if (dex !== undefined && form !== null && form !== 'normal') {
      const entry = catalogue
        .byDex(dex)
        .find((e) => e.form?.toLowerCase() === `${e.pokemonId}_${form}`.toLowerCase());
      if (entry) return historyBoss(entry);
    }
    const entry =
      search.exact(name) ??
      catalogue.byKey(keyForLegacyName(name).replace(/[^a-z0-9]+/gu, '_')) ??
      catalogue.byKey(keyForLegacyName(name)) ??
      (dex === undefined ? undefined : catalogue.species(dex));
    return entry ? historyBoss(entry) : { name: [...name].slice(0, 100).join('') };
  };
  return (pokemon) => {
    if (!isRaw(pokemon) || typeof pokemon.name !== 'string') return null;
    const name = pokemon.name.trim();
    if (name === '' || NO_BOSS.has(name.toLowerCase())) return null;
    const form = typeof pokemon.form === 'string' ? pokemon.form.trim().toLowerCase() : null;
    const dex = numberOf(pokemon.number);
    const memo = `${name}|${form ?? ''}|${String(dex ?? '')}`;
    if (!known.has(memo)) known.set(memo, find(name, form, dex));
    return known.get(memo) ?? null;
  };
}
