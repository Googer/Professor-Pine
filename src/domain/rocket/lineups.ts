import type { PokemonCatalogue } from '../pogo/catalogue.js';
import { feedLookupOf } from '../pogo/feed-lookup.js';
import { identifyBoss } from '../pogo/raid-boss-feed.js';
import { POKEMON_TYPES, type PokemonType } from '../pogo/types.js';
import { leekDuckPicture } from '../research/leekduck.js';
import { whichHash } from '../short-hash.js';

/*
 * Team GO Rocket's lineups (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.1): who a
 * member can meet at a PokéStop and what they can catch from them, as ScrapedDuck's
 * `rocketLineups.json` lists it. A grunt type with two lineups (a male and a female water grunt)
 * is one choice whose catches are the union of both (design 5.1); since plan 8R-4L (design
 * `2026-10-22-costume-form-wants-design.md`, 4b and S5–S11) the choice also keeps both lineups,
 * each reported apart by its first slot. Pure: the feed is read by `RocketLineupService`.
 */

/** The three leaders. */
export const LEADERS = ['cliff', 'arlo', 'sierra'] as const;
export type Leader = (typeof LEADERS)[number];

/**
 * Which of a grunt type's two lineups (plan 8R-4L): the feed keeps them apart by the grunt's
 * gender, which is never shown (members tell them apart by the first slot).
 */
export type GruntLineup = 'male' | 'female';

const GRUNT_LINEUPS: ReadonlySet<string> = new Set<GruntLineup>(['male', 'female']);

/**
 * Who a Rocket report is of: a grunt of a type (null: the untyped grunts; `lineup` one of its two
 * lineups, absent for "not sure which" or a type of one lineup), the decoy grunt, a leader, or
 * Giovanni. The last three are hideouts: they hold their stop all day (Matt).
 */
export type RocketWho =
  | { kind: 'grunt'; type: PokemonType | null; lineup?: GruntLineup }
  | { kind: 'decoy' }
  | { kind: 'leader'; leader: Leader }
  | { kind: 'giovanni' };

/** A Pokémon that can be caught after a battle with them (`isEncounter` in the feed). */
export interface RocketCatch {
  /** The feed's name (`Alolan Grimer`). */
  name: string;
  /** The catalogue's entry where the name and picture agree (`identifyBoss`); null else. */
  key: string | null;
  dex: number | null;
  shiny: boolean;
  /** Leek Duck's picture, when the feed gives one of its CDN. */
  image: string | null;
}

/**
 * One of a grunt type's two lineups (plan 8R-4L, S5, S11): which (`lineup`), the names of its
 * first slot in the feed's order (its label), what can be caught of it, and its `fingerprint`
 * (`lineupFingerprint`, worked out from the data, never stored).
 */
export interface RocketLineupChoice {
  lineup: GruntLineup;
  first: string[];
  catches: RocketCatch[];
  fingerprint: string;
}

/**
 * A choice of `/rocket who:` (design 5.2), as the list keeps it: its key (`rocketKey`), its name
 * (`rocketName`) and the Pokémon that can be caught, in the feed's order (a type of two lineups:
 * the union of both). Plan 8R-4L: a grunt type of two lineups keeps them (`lineups`, in the
 * feed's order); a lineup taken as a choice (`lineupChoice`) has its key, its own catches and its
 * first slot in short (`lineup`).
 */
export interface RocketChoice {
  key: string;
  name: string;
  catches: RocketCatch[];
  lineups?: RocketLineupChoice[];
  lineup?: string;
}

/** What the feed gave: the choices, how many lineups were not read, the catches not known. */
export interface ParsedRocketLineups {
  choices: RocketChoice[];
  /** Lineups of a title, leader or type this version does not know. */
  skipped: number;
  /** The names of catches the game data does not know (shown by name, wanted by nobody). */
  unknown: string[];
}

const TYPES: ReadonlySet<string> = new Set(POKEMON_TYPES);
const LEADER_NAMES: ReadonlySet<string> = new Set(LEADERS);

/**
 * `grunt:<type>`, `grunt:none`, `decoy`, `leader:<name>`, `giovanni`; a lineup of a grunt type
 * (plan 8R-4L) `grunt:<type|none>:male|female`.
 */
export function rocketKey(who: RocketWho): string {
  switch (who.kind) {
    case 'grunt':
      return `grunt:${who.type ?? 'none'}${who.lineup === undefined ? '' : `:${who.lineup}`}`;
    case 'leader':
      return `leader:${who.leader}`;
    default:
      return who.kind;
  }
}

/**
 * Who a key names (`rocketKey`); undefined for any other text. A third part is read only for a
 * grunt, and only as `male` or `female` (plan 8R-4L); four parts are nothing.
 */
export function parseRocketKey(key: string): RocketWho | undefined {
  if (key === 'decoy' || key === 'giovanni') return { kind: key };
  const [head, value, lineup, ...more] = key.split(':');
  if (value === undefined || more.length > 0) return undefined;
  if (head === 'grunt') {
    if (lineup !== undefined && !GRUNT_LINEUPS.has(lineup)) return undefined;
    const side = lineup === undefined ? {} : { lineup: lineup as GruntLineup };
    if (value === 'none') return { kind: 'grunt', type: null, ...side };
    return TYPES.has(value) ? { kind: 'grunt', type: value as PokemonType, ...side } : undefined;
  }
  if (lineup !== undefined) return undefined;
  if (head === 'leader' && LEADER_NAMES.has(value)) {
    return { kind: 'leader', leader: value as Leader };
  }
  return undefined;
}

/**
 * The key of the grunt type a report's key is of (plan 8R-4L, S7): a lineup's type
 * (`grunt:water:male` is `grunt:water`), any other key as it is. Wants, the hour a type is quiet
 * and the notifier's line are by type.
 */
export function typeKeyOf(subjectKey: string): string {
  const who = parseRocketKey(subjectKey);
  return who?.kind === 'grunt' && who.lineup !== undefined
    ? rocketKey({ kind: 'grunt', type: who.type })
    : subjectKey;
}

/**
 * A lineup's fingerprint (plan 8R-4L, S11, B13): `whichHash` of its first slot's names, `|`, and
 * its catches' keys (a name where the catalogue has none), in order. A choice made before a
 * rotation changed the lineup no longer matches it.
 */
export function lineupFingerprint(lineup: Pick<RocketLineupChoice, 'first' | 'catches'>): string {
  return whichHash([...lineup.first, '|', ...lineup.catches.map((one) => one.key ?? one.name)]);
}

/**
 * One lineup of a grunt type taken as a choice of its own (plan 8R-4L): its key
 * (`grunt:water:male`), the type's name (the gender is never shown), its own catches, and its
 * first slot in short as `lineup` (`Magikarp, Feebas`), which names it beside the type.
 */
export function lineupChoice(choice: RocketChoice, lineup: RocketLineupChoice): RocketChoice {
  const who = parseRocketKey(choice.key);
  const type = who?.kind === 'grunt' ? who.type : null;
  return {
    key: rocketKey({ kind: 'grunt', type, lineup: lineup.lineup }),
    name: choice.name,
    catches: lineup.catches,
    lineup: catchesInShort(lineup.first.map((name) => ({ name }))),
  };
}

/**
 * The value a lineup is picked by (plan 8R-4L, S11): its key and its fingerprint,
 * `grunt:water:male#<fingerprint>`, so that a pick made before a rotation changed the lineup is
 * told from one of now (`/rocket report who:`, the map's options).
 */
export function lineupValue(choice: RocketChoice, lineup: RocketLineupChoice): string {
  return `${lineupChoice(choice, lineup).key}#${lineup.fingerprint}`;
}

/** Whether it holds its stop all day (a leader, Giovanni, the decoy), not for half an hour. */
export function isHideout(who: RocketWho): boolean {
  return who.kind !== 'grunt';
}

/**
 * Whether a key names a leader or Giovanni (`parseRocketKey`; review W5): the hideouts that get a
 * line in the region's channel and a DM's button by name, unlike a grunt or the decoy.
 */
export function isLeaderOrGiovanni(key: string): boolean {
  const who = parseRocketKey(key);
  return who?.kind === 'leader' || who?.kind === 'giovanni';
}

/** A word with its first letter upper case. */
function capital(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** `Water-type grunt`, `Grunt (no type)`, `Decoy grunt`, `Cliff`, `Giovanni`. */
export function rocketName(who: RocketWho): string {
  switch (who.kind) {
    case 'grunt':
      return who.type === null ? 'Grunt (no type)' : `${capital(who.type)}-type grunt`;
    case 'decoy':
      return 'Decoy grunt';
    case 'leader':
      return capital(who.leader);
    case 'giovanni':
      return 'Giovanni';
  }
}

/** The longest name of a catch that is kept. */
const MAX_CATCH_NAME = 100;

/** A text of the feed as one plain line, or '' for none. */
function line(value: unknown, room: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, room);
}

/** Who a lineup of the feed is of, by its title, name and type; undefined for one not known. */
function whoOf(lineup: Record<string, unknown>): RocketWho | undefined {
  const title = line(lineup.title, 100).toLowerCase();
  const name = line(lineup.name, 100).toLowerCase();
  if (title.endsWith('boss') || name === 'giovanni') return { kind: 'giovanni' };
  if (title.endsWith('leader')) {
    return LEADER_NAMES.has(name) ? { kind: 'leader', leader: name as Leader } : undefined;
  }
  if (!title.endsWith('grunt')) return undefined;
  if (name.includes('decoy')) return { kind: 'decoy' };
  const type = line(lineup.type, 20).toLowerCase();
  if (type === '') return { kind: 'grunt', type: null };
  return TYPES.has(type) ? { kind: 'grunt', type: type as PokemonType } : undefined;
}

/** The order of the choices: grunt types by name, the untyped, the decoy, the leaders, Giovanni. */
function rank(who: RocketWho): number {
  switch (who.kind) {
    case 'grunt':
      return who.type === null ? 1 : 0;
    case 'decoy':
      return 2;
    case 'leader':
      return 3 + LEADERS.indexOf(who.leader);
    case 'giovanni':
      return 6;
  }
}

/** The slots of a lineup in the feed. */
const SLOTS = ['firstPokemon', 'secondPokemon', 'thirdPokemon'] as const;

/**
 * Which lineup a grunt of the feed is by its name (plan 8R-4L, S5): "female" before "male", each
 * only as a word; undefined for a name with neither.
 */
function lineupOf(lineup: Record<string, unknown>): GruntLineup | undefined {
  const name = line(lineup.name, 100).toLowerCase();
  if (/\bfemale\b/.test(name)) return 'female';
  return /\bmale\b/.test(name) ? 'male' : undefined;
}

/** The names of a lineup's first slot, in the feed's order. */
function firstSlotOf(lineup: Record<string, unknown>): string[] {
  const pokemon: unknown = lineup.firstPokemon;
  if (!Array.isArray(pokemon)) return [];
  return (pokemon as unknown[]).flatMap((one) => {
    if (typeof one !== 'object' || one === null) return [];
    const name = line((one as Record<string, unknown>).name, MAX_CATCH_NAME);
    return name === '' ? [] : [name];
  });
}

/** Whether two catches are one: by the catalogue's entry, else by name. */
function sameCatch(one: RocketCatch, other: RocketCatch): boolean {
  return one.key === null ? other.key === null && other.name === one.name : other.key === one.key;
}

/** A lineup of the feed as read, before it is known whether its type keeps lineups apart. */
interface ReadLineup {
  lineup: GruntLineup | undefined;
  first: string[];
  catches: RocketCatch[];
}

/**
 * The lineups a grunt type keeps apart (plan 8R-4L, S11): exactly two, of the two genders, whose
 * first slots differ and are not empty, in the feed's order; anything else (no gender word, one
 * gender twice, the same first slot, an empty one, three lineups) none, and the type is its
 * merged choice only.
 */
function apart(read: readonly ReadLineup[]): RocketLineupChoice[] | undefined {
  const [one, other] = read;
  if (read.length !== 2 || !one || !other) return undefined;
  if (one.lineup === undefined || other.lineup === undefined || one.lineup === other.lineup) {
    return undefined;
  }
  // A first slot is what tells them apart: neither may be empty (L-2), nor both the same.
  if (one.first.length === 0 || other.first.length === 0) return undefined;
  if (one.first.join('\n') === other.first.join('\n')) return undefined;
  const kept = (each: ReadLineup, lineup: GruntLineup): RocketLineupChoice => ({
    lineup,
    first: each.first,
    catches: each.catches,
    fingerprint: lineupFingerprint(each),
  });
  return [kept(one, one.lineup), kept(other, other.lineup)];
}

/**
 * Reads ScrapedDuck's Rocket lineups (design 5.1). Throws when it holds no lineup this version
 * can place (not a list, another feed), so that a broken read never replaces a good list. The
 * catchable Pokémon are those marked `isEncounter`, in any slot; one named twice (two lineups of
 * a type, two slots) is kept once. A grunt type of two lineups keeps both apart (`lineups`, plan
 * 8R-4L) where `apart` allows it; a decoy, a leader and Giovanni never do.
 */
export function parseRocketLineups(raw: unknown, catalogue: PokemonCatalogue): ParsedRocketLineups {
  if (!Array.isArray(raw)) throw new Error('The Rocket lineups feed holds no lineup');
  const lookup = feedLookupOf(catalogue);
  const byKey = new Map<string, { who: RocketWho; choice: RocketChoice; read: ReadLineup[] }>();
  const unknown = new Set<string>();
  let skipped = 0;
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      skipped += 1;
      continue;
    }
    const lineup = item as Record<string, unknown>;
    const who = whoOf(lineup);
    if (!who) {
      skipped += 1;
      continue;
    }
    const key = rocketKey(who);
    let known = byKey.get(key);
    if (!known) {
      known = { who, choice: { key, name: rocketName(who), catches: [] }, read: [] };
      byKey.set(key, known);
    }
    const own: RocketCatch[] = [];
    for (const slot of SLOTS) {
      const pokemon: unknown = lineup[slot];
      if (!Array.isArray(pokemon)) continue;
      for (const one of pokemon as unknown[]) {
        if (typeof one !== 'object' || one === null) continue;
        const shown = one as Record<string, unknown>;
        if (shown.isEncounter !== true) continue;
        const name = line(shown.name, MAX_CATCH_NAME);
        if (name === '') continue;
        const image = typeof shown.image === 'string' ? shown.image : undefined;
        const ids = identifyBoss(name, image, lookup)?.resolved;
        const entryKey = ids && lookup.keyOf(ids.pokemonId, ids.form);
        const entry = entryKey === undefined ? undefined : catalogue.byKey(entryKey);
        if (!entry) unknown.add(name);
        const caught: RocketCatch = {
          name,
          key: entry?.key ?? null,
          dex: entry?.dex ?? null,
          shiny: shown.canBeShiny === true,
          image: leekDuckPicture(image),
        };
        if (!own.some((other) => sameCatch(caught, other))) own.push(caught);
      }
    }
    const { catches } = known.choice;
    for (const caught of own) {
      if (!catches.some((other) => sameCatch(caught, other))) catches.push(caught);
    }
    known.read.push({ lineup: lineupOf(lineup), first: firstSlotOf(lineup), catches: own });
  }
  if (byKey.size === 0) throw new Error('The Rocket lineups feed holds no lineup');
  const choices = [...byKey.values()]
    .sort((a, b) => rank(a.who) - rank(b.who) || a.choice.name.localeCompare(b.choice.name))
    .map(({ who, choice, read }) => {
      const lineups = who.kind === 'grunt' ? apart(read) : undefined;
      return lineups === undefined ? choice : { ...choice, lineups };
    });
  return { choices, skipped, unknown: [...unknown] };
}

/**
 * The catches of a list in short, as a choice and a line show them: `Mudkip, Tentacool, Krabby
 * +2`, the first `most` and "+N" for the rest.
 */
export function catchesInShort(catches: readonly Pick<RocketCatch, 'name'>[], most = 3): string {
  const names = catches.map((one) => one.name);
  const shown = names.slice(0, most).join(', ');
  return names.length > most ? `${shown} +${String(names.length - most)}` : shown;
}
