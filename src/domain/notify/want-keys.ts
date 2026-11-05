import type { StoredNotification } from '../pogo/notification-target.js';
import { formAsStored, readWants, wantToken, type FormReader } from '../pogo/wants.js';
import { parseTargetWantToken, targetWantToken } from './target-wants.js';

/*
 * What a want is counted as in the daily want counts (plan 8H-3; design Part A, "Want counts",
 * Part D's "Boards of things": `WantCountDay`): a stable text per thing wanted, of every kind of
 * want Pine has, so that a board of the most wanted and a trend over days read the same keys. The
 * one path for these keys: the repository that counts calls these alone.
 *
 * - A Pokémon, a tier, perfect or zero IVs (`PokemonNotification`): the want token
 *   (`wantToken`: `pokemon:<dex>[:<form>]`, `pokemon:<dex>:[<form>]:shadow`, `tier:<level>[:shadow]`,
 *   `iv:perfect|zero`), and for a Pokémon that is no shadow want its scope after `@` (`raid`,
 *   `spawn`, `both`); a tier is always raids and IVs always spawns, a shadow want always raids.
 *   Costumed is the row's, never part of the key.
 * - A target want (`TargetWant`: research, Dynamax and Gigantamax, Team GO Rocket): its token as
 *   it is (`targetWantToken`), costumed again left out.
 * - A gym target: `gym:<id>`. New trains: `trains`.
 * - Beside those, a species: `species:<dex>`, the members with any want of a Pokémon of that
 *   Pokédex number (a Pokémon want of any form, scope or shadow, a research encounter, Dynamax,
 *   Gigantamax; never Mega Energy, a tier or a Rocket target), each once (review P1): what a
 *   board of the most wanted reads, since a member with several keys of one species would be
 *   counted for each by a sum of its keys, and the counts keep no member to tell them apart.
 *
 * A row that cannot be read is no want, and is not counted.
 */

/** New trains, as one key. */
export const NEW_TRAINS_KEY = 'trains';

/**
 * The keys of one member's `PokemonNotification` rows of a server, each want once: rows are read
 * as `/wants` reads them (`readWants`: legacy duplicates of a target are one want in every scope
 * any of them has, two keys of one entry one want by `reader`); a row it cannot read is skipped.
 */
export function pokemonWantKeys(
  rows: readonly StoredNotification[],
  reader: FormReader = formAsStored,
): string[] {
  return readWants(rows, reader).wants.map(({ target, scope }) =>
    target.kind === 'pokemon' && target.shadow !== true
      ? `${wantToken(target)}@${scope}`
      : wantToken(target),
  );
}

/** The key of a `TargetWant` row's token; undefined for one that cannot be read. */
export function targetWantKey(token: string): string | undefined {
  const want = parseTargetWantToken(token);
  return want && targetWantToken(want);
}

/** The key of a gym target. */
export function gymWantKey(gymId: number): string {
  return `gym:${String(gymId)}`;
}

/** A key that wants a Pokémon: its kind, then its Pokédex number (`dynamax:6:…`). */
const SPECIES_OF = /^(?:pokemon|research:pokemon|dynamax|gigantamax):(\d+)(?::|@|$)/u;

/** The species key of a key that wants a Pokémon (`species:<dex>`); undefined for another. */
export function speciesKeyOf(key: string): string | undefined {
  const dex = SPECIES_OF.exec(key)?.[1];
  return dex === undefined ? undefined : `species:${dex}`;
}

/**
 * How many members want each key, and each species (`speciesKeyOf`): pairs of a member and a
 * key, each member counted once per key and once per species. A member is one id across the
 * pairs that may share a species (`PokemonNotification` and `TargetWant` by their `User` row).
 */
export function countWants(pairs: Iterable<readonly [string, string]>): Map<string, number> {
  const members = new Map<string, Set<string>>();
  const add = (key: string, member: string): void => {
    const known = members.get(key);
    if (known) known.add(member);
    else members.set(key, new Set([member]));
  };
  for (const [member, key] of pairs) {
    add(key, member);
    const species = speciesKeyOf(key);
    if (species !== undefined) add(species, member);
  }
  return new Map([...members].map(([key, of]) => [key, of.size]));
}
