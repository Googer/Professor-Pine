import MiniSearch from 'minisearch';
import { addressText } from '../geo/geodata.js';
import { firstWords, MATCH_WEIGHTS, namedReading, STOP_WORDS, searchTokens } from './text.js';

/** What the search needs to know of a gym (`Gym` of the gym repository has all of it). */
export interface SearchableGym {
  id: number;
  name: string;
  nickname: string | null;
  description: string | null;
  keywords: readonly string[];
  /** Stored geocoding result, a JSON string (see `addressText`). */
  geodata: string | null;
  /** Names of places near the gym. */
  places: string | null;
}

export interface GymMatch<G> {
  gym: G;
  /**
   * Higher is better. Comparable only between matches of one search with the same `corrected`
   * value: a corrected match never outranks one as typed, whatever the numbers say.
   */
  score: number;
  /** False when the gym has only some of the words typed. */
  allWords: boolean;
  /** True when a word had to be read as a misspelling to match. */
  corrected: boolean;
  /**
   * How far what was found is from what was typed (`typoCost`): 0 as typed; a corrected match
   * of one letter wrong before one of two. Corrected matches are ordered by it, then by score.
   */
  typos: number;
  /**
   * How many typed words the gym does not have (`missed` of `reading`): 0 with `allWords`; guesses come
   * by it first.
   */
  missed: number;
}

export interface GymSearchOptions {
  /** Look only at these gyms (a region's). Default: all. */
  within?: ReadonlySet<number>;
  /** Look only at names and keywords: for text read from a screenshot. */
  nameOnly?: boolean;
  /**
   * `all`: every word must match. `any`: one is enough. `best` (the default): every word, and
   * only when no gym has them all, any. Either way, matches as typed come before corrected ones.
   */
  words?: 'all' | 'any' | 'best';
  /** At most this many matches. Default: all. */
  limit?: number;
}

interface GymDocument {
  id: number;
  name: string;
  nickname: string;
  description: string;
  keywords: string;
  address: string;
  places: string;
  number: string;
}

type Field = Exclude<keyof GymDocument, 'id'>;

const FIELDS: readonly Field[] = [
  'name',
  'nickname',
  'description',
  'keywords',
  'address',
  'places',
  'number',
];
const NAME_FIELDS: readonly Field[] = ['name', 'keywords'];
/** The fields that name a gym: misspellings are read by the words found in these (`namedReading`). */
const NAMING_FIELDS: readonly Field[] = ['name', 'nickname', 'keywords'];

/**
 * How much a match in each field counts. Tuned on the production gyms of 2026-10 so that a gym
 * searched by its own name comes first: the texts of nearby places repeat the names of other
 * gyms, so they count least.
 */
const FIELD_WEIGHTS: Readonly<Partial<Record<Field, number>>> = {
  name: 8,
  nickname: 8,
  keywords: 3,
  description: 2,
  places: 0.5,
};

/**
 * Gym names are everyday words, so the search forgives more than `allowedTypos`: two wrong
 * letters from five letters on, which covers two letters typed in the wrong order ("mapel").
 */
function typos(term: string): number {
  if (term.length <= 3 || isNumber(term)) return 0;
  return term.length === 4 ? 1 : 2;
}

/**
 * A number may be typed in part (a beginning), but is never read as a misspelling: 1235 is not
 * 1234.
 */
function isNumber(term: string): boolean {
  return /^\p{N}+$/u.test(term);
}

function toDocument(gym: SearchableGym): GymDocument {
  return {
    id: gym.id,
    name: gym.name,
    nickname: gym.nickname ?? '',
    description: gym.description ?? '',
    keywords: gym.keywords.join(' '),
    address: addressText(gym.geodata),
    places: gym.places ?? '',
    number: String(gym.id),
  };
}

/** The words the gym search ignores, as it compares them: the common words and these, folded. */
function ignoredTokens(ignoredWords: Iterable<string>): Set<string> {
  return new Set([...STOP_WORDS, ...[...ignoredWords].flatMap(searchTokens)]);
}

/**
 * The words of a text the gym search goes by: its words as they are indexed, without those the
 * search ignores (the common English words and `ignoredWords`, settings.blacklistWords). A gym
 * whose name has none can be found by its name no more than a gym without one.
 */
export function searchedWords(text: string, ignoredWords: Iterable<string>): string[] {
  const ignored = ignoredTokens(ignoredWords);
  return searchTokens(text).filter((token) => !ignored.has(token));
}

/**
 * Finds gyms by what members type. It is lenient on purpose: a word of two letters or more may
 * be the beginning of a longer one, a longer word may be slightly misspelt, and it may match the
 * name, nickname, description, keywords, address, nearby places or the gym's number (which may
 * be typed in part but is never read as a misspelling). Matches in the name and nickname count
 * most, exact words more than beginnings and misspellings, so the best fit comes first and the
 * member picks. Every word must match something; only when no gym has every word, gyms with some
 * of them are returned as guesses (`allWords` false). Words in `ignoredWords`
 * (settings.blacklistWords: "gym", "raid", …) and common English words are ignored, both in the
 * gyms' texts and in what is typed.
 */
export class GymIndex<G extends SearchableGym> {
  private readonly index: MiniSearch<GymDocument>;
  private readonly gyms = new Map<number, G>();
  private readonly ignored: ReadonlySet<string>;

  constructor(gyms: Iterable<G>, ignoredWords: Iterable<string> = []) {
    const ignored = ignoredTokens(ignoredWords);
    this.ignored = ignored;
    this.index = new MiniSearch<GymDocument>({
      fields: [...FIELDS],
      tokenize: searchTokens,
      processTerm: (term) => (ignored.has(term) ? null : term),
    });
    for (const gym of gyms) this.put(gym);
  }

  get size(): number {
    return this.gyms.size;
  }

  get(id: number): G | undefined {
    return this.gyms.get(id);
  }

  all(): G[] {
    return [...this.gyms.values()];
  }

  /** Adds a gym, or replaces the one with the same id. */
  put(gym: G): void {
    const document = toDocument(gym);
    if (this.gyms.has(gym.id)) this.index.replace(document);
    else this.index.add(document);
    this.gyms.set(gym.id, gym);
  }

  /** Returns false when there was no such gym. */
  remove(id: number): boolean {
    if (!this.gyms.delete(id)) return false;
    this.index.discard(id);
    return true;
  }

  /**
   * Searches in up to three steps. First the gyms that have every word as typed (as the word or
   * its beginning), best first. Then the gyms that have every word only if misspellings are
   * allowed (`corrected`), best first, after the first. When those found nothing and the text
   * has a single letter beside other words ("pinewood l", an unfinished word), the same two
   * steps are made again without the single letters. Only when all of that found nothing, the
   * gyms that have some of the words as typed (`allWords` false), again as typed first and
   * corrected after. Ties go to the lower id. Empty when no word is left to search by. A long
   * text goes by its first words (`firstWords`).
   */
  search(typed: string, options: GymSearchOptions = {}): GymMatch<G>[] {
    const text = firstWords(typed);
    const { limit, words = 'best' } = options;
    let matches: GymMatch<G>[] = [];
    if (words !== 'any') {
      matches = this.stepsFor(text, 'AND', options);
      const trimmed = this.withoutSingleLetters(text);
      if (matches.length === 0 && trimmed !== undefined) {
        matches = this.stepsFor(trimmed, 'AND', options);
      }
    }
    if (matches.length === 0 && words !== 'all') matches = this.stepsFor(text, 'OR', options);
    return limit === undefined ? matches : matches.slice(0, limit);
  }

  /**
   * The text without its single letters, when it has some beside other words that count (not
   * ignored): "pinewood l" is an unfinished word, but "at&t" and "lot b" have real one-letter
   * words. A digit stays ("station 4"). Undefined when there is nothing to take out.
   */
  private withoutSingleLetters(text: string): string | undefined {
    const counted = searchTokens(text).filter((token) => !this.ignored.has(token));
    const kept = counted.filter((token) => !/^\p{L}$/u.test(token));
    return kept.length > 0 && kept.length < counted.length ? kept.join(' ') : undefined;
  }

  /** The matches as typed, then those that need a correction. */
  private stepsFor(text: string, combineWith: 'AND' | 'OR', options: GymSearchOptions) {
    const typed = this.run(text, combineWith, false, options);
    const seen = new Set(typed.map((match) => match.gym.id));
    const corrected = this.run(text, combineWith, true, options).filter(
      (match) => !seen.has(match.gym.id),
    );
    return [...typed, ...corrected];
  }

  private run(
    text: string,
    combineWith: 'AND' | 'OR',
    corrected: boolean,
    options: GymSearchOptions,
  ): GymMatch<G>[] {
    const { within } = options;
    const found = this.index
      .search(text, {
        fields: [...(options.nameOnly ? NAME_FIELDS : FIELDS)],
        combineWith,
        boost: { ...FIELD_WEIGHTS },
        // A single letter begins too many words to mean anything, and is slow to look up; a
        // single digit is the start of a number, as in "station 1" for "Station 12".
        prefix: (term) => term.length > 1 || isNumber(term),
        fuzzy: corrected ? typos : false,
        weights: { ...MATCH_WEIGHTS },
        filter: within ? (result) => within.has(result.id as number) : undefined,
      })
      .sort((a, b) => b.score - a.score || (a.id as number) - (b.id as number));
    const typed = searchTokens(text).filter((token) => !this.ignored.has(token));
    const matches: GymMatch<G>[] = [];
    for (const result of found) {
      const gym = this.gyms.get(result.id as number);
      if (!gym) continue;
      const read = namedReading(typed, result.match, NAMING_FIELDS);
      matches.push({
        gym,
        score: result.score,
        allWords: combineWith === 'AND',
        corrected,
        typos: corrected ? read.typos : 0,
        missed: combineWith === 'AND' ? 0 : read.missed,
      });
    }
    // A guess that found more of the typed words first; then a nearer reading: one letter wrong
    // before two, a whole word before a part of one (the score alone puts a rare word read with
    // two letters wrong first, or a rare word alone before two common ones).
    return corrected || combineWith === 'OR'
      ? matches.sort((a, b) => a.missed - b.missed || a.typos - b.typos)
      : matches;
  }
}
