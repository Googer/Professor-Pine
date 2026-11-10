import type { PokemonEntry } from '../pogo/game-master.js';
import type {
  BossMovesetCounters,
  Counter,
  CounterAnswer,
  CounterResult,
} from './pokebattler-answer.js';

/** How many counters the answer lists (the legacy bot's twelve). */
export const SHOWN_COUNTERS = 12;

/** One line of the answer: a counter with one of its movesets. */
export interface CounterRow {
  counter: Counter;
  result: CounterResult;
}

/** A shadow Pokémon, as Pokebattler names it. */
export const isShadowCounter = (pokemonId: string): boolean => pokemonId.endsWith('_SHADOW_FORM');

/** A mega or primal Pokémon, as Pokebattler names it. */
export const isMegaCounter = (pokemonId: string): boolean =>
  /_MEGA(?:_[XY])?$/.test(pokemonId) || pokemonId.endsWith('_PRIMAL');

export interface RowOptions {
  /** Shadow counters too (left out by default, as the legacy bot did). */
  shadow: boolean;
  /** Megas and primals too (left out by default). */
  mega: boolean;
  /** Every moveset a line of its own; by default a counter's best moveset only. */
  single: boolean;
  limit?: number;
}

/** Fastest first; of two as fast, the one that faints less. */
function faster(a: CounterRow, b: CounterRow): number {
  return a.result.timeMs - b.result.timeMs || a.result.deaths - b.result.deaths;
}

/**
 * The lines of the answer: the counters' movesets, fastest first; by default the best
 * moveset of each counter only (a counter of a Pokébox is one Pokémon of it, so two of one
 * species are two counters), and every moveset a line of its own with `single`. Shadow
 * Pokémon and megas only when asked for.
 */
export function counterRows(set: BossMovesetCounters, options: RowOptions): CounterRow[] {
  const rows: CounterRow[] = [];
  for (const counter of set.counters) {
    if (!options.shadow && isShadowCounter(counter.pokemonId)) continue;
    if (!options.mega && isMegaCounter(counter.pokemonId)) continue;
    const own = counter.results.map((result) => ({ counter, result })).sort(faster);
    rows.push(...(options.single ? own : own.slice(0, 1)));
  }
  return rows.sort(faster).slice(0, options.limit ?? SHOWN_COUNTERS);
}

/** Of one boss moveset, the counters and their movesets that `counterRows` can show. */
function keptSet(
  set: BossMovesetCounters,
  kinds: Pick<RowOptions, 'shadow' | 'mega'>,
): BossMovesetCounters {
  const shown = new Set<CounterResult>();
  for (const single of [false, true]) {
    for (const row of counterRows(set, { ...kinds, single })) shown.add(row.result);
  }
  const counters: Counter[] = [];
  for (const counter of set.counters) {
    const results = counter.results.filter((result) => shown.has(result));
    if (results.length > 0) counters.push({ ...counter, results });
  }
  return { ...set, counters };
}

/**
 * What is kept of an answer (plan 8X-G): of each boss moveset and of the average only the
 * counters and movesets the answer can show with the shadow Pokémon and megas asked for, with
 * `single` or without (the best moveset of the first twelve counters, and the twelve fastest
 * movesets): `counterRows` of the kept answer is that of the whole one. Pokebattler's answer for
 * Mew is 14.7 MB of JSON (100 boss movesets of 30 counters); what is kept of it is at most 24
 * movesets per boss moveset, so the cache holds answers of tens of kilobytes, not megabytes.
 */
export function keptAnswer(
  answer: CounterAnswer,
  kinds: Pick<RowOptions, 'shadow' | 'mega'>,
): CounterAnswer {
  return {
    byMoveset: answer.byMoveset.map((set) => keptSet(set, kinds)),
    average: answer.average && keptSet(answer.average, kinds),
  };
}

/** `CONFUSION_FAST` as `Confusion`, for a move or Pokémon the catalogue does not know. */
export function titleCase(id: string): string {
  return id
    .replace(/_FAST$/, '')
    .split(/[_\s]+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * The names of Pokémon by what Pokebattler calls them: the catalogue's entry of that
 * `pokebattlerId` (a species before its forms, where two share one; also with or without
 * `_FORM`, and a bare species id as its default form), a shadow Pokémon as
 * "Shadow" and the name of what it is a shadow of, anything else by Pokebattler's name in
 * words.
 */
export function pokebattlerNames(entries: readonly PokemonEntry[]): (pokemonId: string) => string {
  const byId = new Map<string, PokemonEntry>();
  for (const entry of entries) {
    const known = byId.get(entry.pokebattlerId);
    if (!known || (known.kind !== 'species' && entry.kind === 'species')) {
      byId.set(entry.pokebattlerId, entry);
    }
  }
  // A bare species id (`LANDORUS`) for a species known by its default form
  // (`LANDORUS_INCARNATE_FORM`): only where exactly one species entry fits.
  const bySpecies = new Map<string, PokemonEntry | null>();
  for (const entry of entries) {
    if (entry.kind !== 'species') continue;
    const match = /^(.+?)_[A-Z0-9]+_FORM$/.exec(entry.pokebattlerId);
    if (!match?.[1] || byId.has(match[1])) continue;
    bySpecies.set(match[1], bySpecies.has(match[1]) ? null : entry);
  }
  const nameOf = (id: string): string | undefined =>
    (
      byId.get(id) ??
      byId.get(`${id}_FORM`) ??
      // Pokebattler adds _FORM where the game master has none (`KYUREM_WHITE_FORM`).
      (id.endsWith('_FORM') ? byId.get(id.slice(0, -'_FORM'.length)) : undefined) ??
      bySpecies.get(id) ??
      undefined
    )?.name;
  return (pokemonId) => {
    if (isShadowCounter(pokemonId)) {
      const base = pokemonId.slice(0, -'_SHADOW_FORM'.length);
      return `Shadow ${nameOf(base) ?? titleCase(base)}`;
    }
    return nameOf(pokemonId) ?? titleCase(pokemonId);
  };
}
