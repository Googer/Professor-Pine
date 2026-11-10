import { nearerFirst } from './nearest.js';
import { STOP_WORDS, searchTokens } from './text.js';

/**
 * Gyms, PokéStops and power spots in one list of choices (plan 8W-2; Matt, 2026-10-15, "Search
 * over stops and power spots"): each kind has its own index, whose scores do not compare with
 * another's, so the lists are merged by how well each hit fits what was typed, then by where it
 * is, then by its kind, and only then by its index's score. Pure.
 */

/** What a place is: a gym, or a kept Wayspot of another kind. */
export type PlaceKind = 'gym' | 'stop' | 'powerspot';

/**
 * How well the typed words fit a hit, best first:
 *
 * - `exact`: the words of a name are the typed words (`pnc park` for "PNC Park");
 * - `word`: every typed word is a whole word of a name;
 * - `beginning`: every typed word is at least the beginning of a word of a name;
 * - `loose`: every word was found as typed, but not all in a name (in the street, a gym's
 *   description, keywords or places);
 * - `guess`: a word was read as a misspelling, or only some of the words were found.
 */
export type PlaceFit = 'exact' | 'word' | 'beginning' | 'loose' | 'guess';

const FIT_ORDER: Readonly<Record<PlaceFit, number>> = {
  exact: 0,
  word: 1,
  beginning: 2,
  loose: 3,
  guess: 4,
};

const KIND_ORDER: Readonly<Record<PlaceKind, number>> = { gym: 0, stop: 1, powerspot: 2 };

/** The words that count, as the indexes compare them: folded, without common words. */
function counted(text: string): string[] {
  return searchTokens(text).filter((token) => !STOP_WORDS.has(token));
}

/**
 * How the typed text fits a hit with these names (a title; a gym's name and nickname), given
 * how its index found it.
 */
export function placeFit(
  text: string,
  names: readonly (string | null)[],
  found: { allWords: boolean; corrected: boolean },
): PlaceFit {
  return placeFitBy(text, names, found).fit;
}

/**
 * `placeFit`, and the name the fit came from (the words beyond those typed, `extraWords`, are
 * counted in it): the first name that fits best; the first name of all where none fits better
 * than `loose`. Undefined only without a name.
 */
export function placeFitBy(
  text: string,
  names: readonly (string | null)[],
  found: { allWords: boolean; corrected: boolean },
): { fit: PlaceFit; name: string | undefined } {
  const first = names.find((name): name is string => name !== null);
  if (!found.allWords || found.corrected) return { fit: 'guess', name: first };
  const typed = counted(text);
  if (typed.length === 0) return { fit: 'guess', name: first };
  let best: { fit: PlaceFit; name: string | undefined } = { fit: 'loose', name: first };
  for (const name of names) {
    if (name === null) continue;
    const words = counted(name);
    const set = new Set(words);
    let fit: PlaceFit;
    if (typed.every((word) => set.has(word))) {
      fit = new Set(typed).size === set.size ? 'exact' : 'word';
    } else if (typed.every((word) => words.some((one) => one.startsWith(word)))) {
      fit = 'beginning';
    } else continue;
    if (FIT_ORDER[fit] < FIT_ORDER[best.fit]) best = { fit, name };
  }
  return best;
}

/**
 * How many words of a title the typed words do not account for (neither are they nor begin
 * them; common words aside): "Riverview Park" has one beyond `park`, "Mammoth Park Skate Park"
 * two. Of hits that fit alike, the one with fewer is nearer to what was typed (tuned on
 * Pittsburgh's export, 2026-10-16: by score alone, a title that repeats a word came first).
 */
export function extraWords(text: string, title: string): number {
  const typed = counted(text);
  return counted(title).filter((word) => !typed.some((one) => word.startsWith(one))).length;
}

/** A hit of one of the indexes, ready to be merged. */
export interface PlaceHit<T> {
  item: T;
  kind: PlaceKind;
  title: string;
  fit: PlaceFit;
  /** In the member's region (the channel's), when the search was made from one. */
  local: boolean;
  /** The index's score: compared only within one kind. */
  score: number;
  /** The words of its title beyond those typed (`extraWords`); 0 when not given. */
  extra?: number;
  /** How plausible a guess is (`guessRank`), lower first; 0 when not given. */
  guess?: number;
  /**
   * How far it lies from the nearest of the places named before it (`anchorMetres`: the other
   * stops of `/research`, a train's last stop), in meters; undefined without any.
   */
  distance?: number;
}

/**
 * What a typed word a guess does not have weighs in `guessRank`: more than all the misspellings
 * of a text can (two letters a word, at most a few words).
 */
const MISSED_WORD = 100;

/**
 * How plausible a guess is, lower first: more of the typed words found (`missed`) before fewer,
 * whatever the misspellings; then the fewest letters read as wrong (`typos`: "library" for
 * "libary" before "Vicary").
 */
export function guessRank(found: { missed: number; typos: number }): number {
  return found.missed * MISSED_WORD + found.typos;
}

/**
 * The hits in the order Matt asked for: by fit (guesses by how plausible they are, `guessRank`,
 * across kinds), then the member's region before others, then gym, stop, power spot; within
 * those, fewer words beyond the typed ones (`extraWords`), then the nearer to the places named
 * before (`distance`, `nearerFirst`; Matt, 2026-10-27: nearby stops first; without any, the
 * order is as before), then by score (within one kind), then by title. `kindsFirst` puts those
 * kinds first, in its order, in the place of gym, stop, power spot (plan 8X-4: a max battle
 * train offers power spots before gyms among hits as good); a better hit still comes first,
 * whatever its kind.
 */
export function mergePlaces<T>(
  hits: readonly PlaceHit<T>[],
  kindsFirst?: readonly PlaceKind[],
): PlaceHit<T>[] {
  const rank = (kind: PlaceKind): number => {
    const index = kindsFirst?.indexOf(kind) ?? -1;
    return index >= 0 ? index - 3 : KIND_ORDER[kind];
  };
  return [...hits].sort(
    (a, b) =>
      FIT_ORDER[a.fit] - FIT_ORDER[b.fit] ||
      (a.fit === 'guess' ? (a.guess ?? 0) - (b.guess ?? 0) : 0) ||
      Number(b.local) - Number(a.local) ||
      rank(a.kind) - rank(b.kind) ||
      // A guess accounts for no word of its title: by score alone.
      (a.fit === 'guess' ? 0 : (a.extra ?? 0) - (b.extra ?? 0)) ||
      nearerFirst(a.distance, b.distance) ||
      b.score - a.score ||
      a.title.localeCompare(b.title),
  );
}

/**
 * The hit a typed text means beyond doubt, which a command may act on: the only hit, of every
 * kind and region, whose every word matched exactly (`exact` or `word`). Undefined otherwise
 * (none, or several, though one names it outright): the member picks from the list.
 */
export function clearPlace<T>(hits: readonly PlaceHit<T>[]): PlaceHit<T> | undefined {
  const exact = hits.filter((hit) => hit.fit === 'exact' || hit.fit === 'word');
  return exact.length === 1 ? exact[0] : undefined;
}
