import type { PokemonEntry } from '../pogo/game-master.js';

/**
 * Why a Pokémon's IVs start where they do when no filter is given: a shadow legendary or mythical
 * (`shadow`), a legendary or mythical that cannot be traded (`untradable`), or nothing (`none`).
 */
export type FloorReason = 'shadow' | 'untradable' | 'none';

/** The lowest IV of each stat a Pokémon can have by itself, and why. */
export interface AutoFloor {
  floor: number;
  reason: FloorReason;
}

/** What the floor is read from: whether the game lets an entry be traded, and its species. */
export interface TradeFacts {
  isTradable(entry: PokemonEntry): boolean;
  species(dex: number): PokemonEntry | undefined;
}

/**
 * Whether a Pokémon is ranked as a shadow: one was asked for (`/rank shadow:`) and the game master
 * has a shadow of it (`PokemonEntry.shadow`; never a mega). The one place this is decided: the
 * command's refusal, the head's "Shadow", the family and the menu all ask it.
 */
export function rankedAsShadow(entry: Pick<PokemonEntry, 'shadow'>, asked: boolean): boolean {
  return asked && entry.shadow;
}

/**
 * The lowest IV a Pokémon can have, worked out from the game master when the member picks no
 * filter (Matt, 2026-10-29: no list kept by hand), in this order:
 *
 * 1. ranked as a shadow (`rankedAsShadow`) and legendary, mythical or an Ultra Beast: 6, from a
 *    raid or Giovanni, and no shadow can be traded (a shadow Darkrai is 6, not 10);
 * 2. a legendary or mythical that cannot be traded, of a species that cannot either: 10, from a
 *    raid, research or a max battle (Mew, Zarude, Deoxys, Diancie and Mega Diancie, Eternatus,
 *    Zygarde);
 * 3. anything else: 0. Legendaries and Ultra Beasts have come wild (GO Tour Johto's dogs, the
 *    Galarian birds), Meltan, Melmetal and Pecharunt can be traded, and the fusions and form
 *    changes of a tradable species (Kyurem Black, Crowned Zacian) keep the IVs of the Pokémon they
 *    were made from.
 */
export function autoFloor(facts: TradeFacts, entry: PokemonEntry, shadow: boolean): AutoFloor {
  if (entry.class === null) return { floor: 0, reason: 'none' };
  if (rankedAsShadow(entry, shadow)) return { floor: 6, reason: 'shadow' };
  const species = facts.species(entry.dex) ?? entry;
  if (!facts.isTradable(entry) && !facts.isTradable(species)) {
    return { floor: 10, reason: 'untradable' };
  }
  return { floor: 0, reason: 'none' };
}
