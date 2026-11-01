import { distance } from 'fastest-levenshtein';

/** Letters the Unicode decomposition leaves alone, with the plain letters people type instead. */
const PLAIN_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
};

/** Lower case, without accents: `Flabébé` becomes `flabebe`. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, (letter) => PLAIN_LETTERS[letter] ?? letter);
}

/**
 * The words of a text as they are indexed and searched: folded, apostrophes dropped (`O'Hara`
 * is `ohara`, `Farfetch'd` is `farfetchd`), split at everything that is not a letter or a digit.
 * A custom emoji (`<:mewtwo:123>`) counts as its name, and the signs in `Nidoran♀` and `Nidoran♂`
 * as the words female and male.
 */
export function searchTokens(text: string): string[] {
  return foldText(text.replace(/<a?:(\w+):\d+>/g, ' $1 '))
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
}

/** The folded text in one piece, words separated by single spaces. */
export function searchText(text: string): string {
  return searchTokens(text).join(' ');
}

/** How many words of a text a search goes by: more than a name has. */
export const MAX_SEARCH_WORDS = 16;
/** How much of a word a search goes by: longer than any word of a name. */
const MAX_SEARCH_WORD_LETTERS = 40;

/**
 * The text a search goes by: as it is, unless it has more than `MAX_SEARCH_WORDS` words or a word
 * longer than `MAX_SEARCH_WORD_LETTERS`; then its first words, cut to that. Searches run on the
 * thread that holds the gateway, whose every typed word costs something for every hit, and what
 * an option's list is asked has no throttle: 500 short words took seconds over a city's stops.
 */
export function firstWords(text: string): string {
  const words = searchTokens(text);
  const fits =
    words.length <= MAX_SEARCH_WORDS &&
    words.every((word) => word.length <= MAX_SEARCH_WORD_LETTERS);
  if (fits) return text;
  return words
    .slice(0, MAX_SEARCH_WORDS)
    .map((word) => word.slice(0, MAX_SEARCH_WORD_LETTERS))
    .join(' ');
}

/**
 * How many letters of a word may be wrong and still match: none up to three letters, one up to
 * five, two beyond. Two letters typed in the wrong order count as two.
 */
export function allowedTypos(term: string): number {
  if (term.length <= 3) return 0;
  return term.length <= 5 ? 1 : 2;
}

/**
 * How much a word counts when it is only the beginning of the word found, or a misspelling of
 * it, against 1 for the word itself. A beginning counts more: it is what a member who is still
 * typing has.
 */
export const MATCH_WEIGHTS = { prefix: 0.5, fuzzy: 0.3 } as const;

/** What a word that only begins a word found costs in `typoCost`: less than a wrong letter. */
const BEGINNING_COST = 0.25;
/** The most letters any search reads as wrong in one word (`allowedTypos`, the gyms' search). */
const MAX_TYPOS = 2;

/**
 * How far the words found are from the words typed: for each typed word, nothing when it is a
 * word found, `BEGINNING_COST` when it only begins one (a word over a part of one), else the
 * fewest letters wrong to any word found (a typed word no word found is within two letters of
 * found nothing, and counts nothing here: `reading` counts it as `missed`, and a guess is ordered by that
 * first). The indexes' scores weigh a rare word high (BM25), so a two-letter correction to a rare
 * word ("Vicary" for "libary") would outscore a one-letter one to a common word ("library");
 * this puts the nearer reading first.
 */
export function typoCost(typed: readonly string[], found: readonly string[]): number {
  return reading(typed, found).typos;
}

/**
 * What a typed word found only outside a hit's names (in its places, description or street)
 * costs in `namedReading`: more than any misspelling of a name (two letters at most).
 */
const OUTSIDE_NAMES_COST = 3;

/**
 * `reading` of a hit of an index, its misspellings read by the words found in its names
 * (`names`: the fields that name it) alone: a typed word found only in another field costs
 * `OUTSIDE_NAMES_COST`, so that "libary" read as "Library" of the places beside "Vicary House"
 * does not tie with a gym named "Library". `match` is MiniSearch's: each word found, with the
 * fields it was found in; `missed` counts the words found nowhere.
 */
export function namedReading(
  typed: readonly string[],
  match: Readonly<Record<string, readonly string[]>>,
  names: readonly string[],
): { typos: number; missed: number } {
  const all = reading(typed, Object.keys(match));
  const named = reading(
    typed,
    Object.keys(match).filter((term) => match[term]?.some((field) => names.includes(field))),
  );
  return {
    typos: named.typos + (named.missed - all.missed) * OUTSIDE_NAMES_COST,
    missed: all.missed,
  };
}

/**
 * `typoCost` of a hit, and how many typed words it `missed`: found nothing (no word found is it,
 * begins with it, or is within two letters of it); a guess that found more of them comes first,
 * whatever its misspellings.
 */
export function reading(
  typed: readonly string[],
  found: readonly string[],
): { typos: number; missed: number } {
  let typos = 0;
  let missed = 0;
  for (const word of typed) {
    if (found.includes(word)) continue;
    if (found.some((term) => term.startsWith(word))) {
      typos += BEGINNING_COST;
      continue;
    }
    const nearest =
      found.length === 0 ? Infinity : Math.min(...found.map((term) => distance(word, term)));
    if (nearest <= MAX_TYPOS) typos += nearest;
    else missed++;
  }
  return { typos, missed };
}

/**
 * Whether every typed word reads in `names` (the words of a name, `searchTokens`): as typed, as
 * the beginning of a word, or misspelt by no more letters than the word may have wrong
 * (`allowedTypos`: none up to three letters, so "art" is not "park"); a word too common to search
 * by (`STOP_WORDS`) asks nothing. The live map's Find keeps a guess only where it does (plan
 * 8M-12): a filter misses no word, but a misspelling is read.
 */
export function readsEvery(typed: readonly string[], names: readonly string[]): boolean {
  return typed.every(
    (word) =>
      STOP_WORDS.has(word) ||
      names.some((name) => name.startsWith(word) || distance(word, name) <= allowedTypos(word)),
  );
}

/** Words too common to search by: the legacy bot's list. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a able about across after all almost also am among an and any are as at be been but by can ' +
    'cannot could dear did do does either else ever every for from get got had has have he her ' +
    'hers him his how however i if in into is it its just least let like likely may me might ' +
    'most must my neither no nor not of off often on only or other our own rather said say says ' +
    'she should since so some than that the their them then there these they this tis to too ' +
    'twas us wants was we were what when where which while who whom why will with would yet ' +
    'you your'
  ).split(' '),
);
