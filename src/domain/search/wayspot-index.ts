import MiniSearch from 'minisearch';
import { wayfarerAddressParts } from '../geo/wayfarer-address.js';
import { firstWords, MATCH_WEIGHTS, namedReading, STOP_WORDS, searchTokens } from './text.js';

/**
 * Finding a kind of kept Wayspot (PokéStops, power spots) by what members type (plan 8W-2; Matt,
 * 2026-10-15, "Search over stops and power spots"): one index per kind, never one mixed index, as
 * the gyms have `GymIndex`. Pure.
 *
 * A Wayspot is found by its title and, counting little, by its street (and town) from the
 * address and by the places Google gave around it (plan 8W-6). Every typed word must match, as typed or as the beginning of a word; only when no
 * Wayspot has every word as typed is one letter read as wrong (`corrected`: about 900 stops a
 * region, so "church" or "park" hit dozens as typed, and a looser reading would bury them); only
 * when that found nothing either, Wayspots with some of the words are guesses (`allWords` false).
 * Common words weigh little by MiniSearch's BM25 (a word in thousands of titles scores far below
 * a rare one) and the legacy bot's common English words are not searched at all.
 */

/** What the search needs of a Wayspot (`Wayspot` of the kept Wayspots has it). */
export interface SearchableWayspot {
  id: string;
  title: string;
  address: string | null;
}

export interface WayspotMatch<W> {
  wayspot: W;
  /** Higher is better; comparable only within one search's matches of the same kind. */
  score: number;
  /** False for a guess: only some of the words matched. */
  allWords: boolean;
  /** True when a word was read as a misspelling (one letter). */
  corrected: boolean;
  /** How far what was found is from what was typed (`typoCost`); 0 as typed. */
  typos: number;
  /** How many typed words it does not have (`missed` of `reading`): 0 with `allWords`. */
  missed: number;
}

/**
 * A word as typed looks misspelt when a word one letter off is in at least this many titles, and
 * in this many times as many as the word itself ("Little Free Libary" beside dozens of
 * "Library"): its corrections are then offered after its hits as typed.
 */
const MISSPELT_TITLES = 3;

export interface WayspotSearchOptions {
  /** Look only at these Wayspots (the server's). Default: all. */
  within?: ReadonlySet<string>;
  /** Whether to guess by some of the words when none has all of them. Default true. */
  guesses?: boolean;
}

interface WayspotDocument {
  id: string;
  title: string;
  street: string;
  places: string;
}

type Field = Exclude<keyof WayspotDocument, 'id'>;

const FIELDS: readonly Field[] = ['title', 'street', 'places'];

/**
 * A title word counts eight times a street word (the gyms' name against their address), and the
 * names of the places Google gave around it (plan 8W-6) half a street word, as a gym's places.
 */
const FIELD_WEIGHTS: Readonly<Record<Field, number>> = { title: 8, street: 1, places: 0.5 };

/** One letter wrong at most, and only in a word of five letters or more ("libary"). */
function oneTypo(term: string): number {
  return term.length >= 5 && !/^\p{N}+$/u.test(term) ? 1 : 0;
}

/** The street and the town of an address as Wayfarer writes it, for the search. */
export function streetOf(address: string | null): string | undefined {
  if (address === null) return undefined;
  return wayfarerAddressParts(address).route;
}

function toDocument(wayspot: SearchableWayspot, places: string | null): WayspotDocument {
  const parts = wayspot.address === null ? {} : wayfarerAddressParts(wayspot.address);
  return {
    id: wayspot.id,
    title: wayspot.title,
    street: [parts.premise, parts.route, parts.locality].filter((part) => part).join(' '),
    places: places ?? '',
  };
}

/** The names of the places Google gave around a Wayspot (`WayspotPlaces.placesOf`), or null. */
export type PlacesOf = (id: string) => string | null;

export class WayspotIndex<W extends SearchableWayspot> {
  private readonly index: MiniSearch<WayspotDocument>;
  private readonly wayspots = new Map<string, W>();

  constructor(wayspots: Iterable<W>, placesOf: PlacesOf = () => null) {
    this.index = new MiniSearch<WayspotDocument>({
      fields: [...FIELDS],
      tokenize: searchTokens,
      processTerm: (term) => (STOP_WORDS.has(term) ? null : term),
    });
    const documents: WayspotDocument[] = [];
    for (const wayspot of wayspots) {
      if (this.wayspots.has(wayspot.id)) continue;
      this.wayspots.set(wayspot.id, wayspot);
      documents.push(toDocument(wayspot, placesOf(wayspot.id)));
    }
    this.index.addAll(documents);
  }

  get size(): number {
    return this.wayspots.size;
  }

  /**
   * The matches as typed; else those with one letter wrong; else the guesses. Ties: by id. A
   * word as typed that looks misspelt (`looksMisspelt`) does not hide the corrections: they
   * follow its hits as typed. A long text goes by its first words (`firstWords`).
   */
  search(wholeText: string, options: WayspotSearchOptions = {}): WayspotMatch<W>[] {
    const text = firstWords(wholeText);
    const typed = this.run(text, 'AND', false, options);
    if (typed.length > 0) {
      if (!this.looksMisspelt(text, options)) return typed;
      const seen = new Set(typed.map((match) => match.wayspot.id));
      const corrected = this.run(text, 'AND', true, options).filter(
        (match) => !seen.has(match.wayspot.id),
      );
      return [...typed, ...corrected];
    }
    const corrected = this.run(text, 'AND', true, options);
    if (corrected.length > 0 || options.guesses === false) return corrected;
    return this.run(text, 'OR', false, options);
  }

  /**
   * Whether a word of the text, as typed, looks like a misspelling of another: a word one letter
   * off is in at least `MISSPELT_TITLES` titles (of those looked at), and in that many times as
   * many as the word itself.
   */
  private looksMisspelt(text: string, options: WayspotSearchOptions): boolean {
    const { within } = options;
    return searchTokens(text)
      .filter((word) => !STOP_WORDS.has(word) && oneTypo(word) > 0)
      .some((word) => {
        const titles = new Map<string, number>();
        const found = this.index.search(word, {
          fields: ['title'],
          prefix: false,
          fuzzy: oneTypo,
          filter: within ? (result) => within.has(result.id as string) : undefined,
        });
        for (const result of found) {
          for (const term of result.terms) titles.set(term, (titles.get(term) ?? 0) + 1);
        }
        const asTyped = titles.get(word) ?? 0;
        return [...titles].some(
          ([term, count]) =>
            term !== word &&
            count >= MISSPELT_TITLES &&
            count >= MISSPELT_TITLES * Math.max(1, asTyped),
        );
      });
  }

  private run(
    text: string,
    combineWith: 'AND' | 'OR',
    corrected: boolean,
    options: WayspotSearchOptions,
  ): WayspotMatch<W>[] {
    const { within } = options;
    const typed = searchTokens(text).filter((word) => !STOP_WORDS.has(word));
    const matches = this.index
      .search(text, {
        fields: [...FIELDS],
        combineWith,
        boost: { ...FIELD_WEIGHTS },
        // A single letter begins too many words to mean anything.
        prefix: (term) => term.length > 1,
        fuzzy: corrected ? oneTypo : false,
        weights: { ...MATCH_WEIGHTS },
        filter: within ? (result) => within.has(result.id as string) : undefined,
      })
      .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
      .flatMap((result): WayspotMatch<W>[] => {
        const wayspot = this.wayspots.get(result.id as string);
        const read = namedReading(typed, result.match, ['title']);
        return wayspot
          ? [
              {
                wayspot,
                score: result.score,
                allWords: combineWith === 'AND',
                corrected,
                typos: corrected ? read.typos : 0,
                missed: combineWith === 'AND' ? 0 : read.missed,
              },
            ]
          : [];
      });
    // A guess that found more of the typed words first; then a whole word before a part of one
    // (one letter wrong at most here).
    return corrected || combineWith === 'OR'
      ? matches.sort((a, b) => a.missed - b.missed || a.typos - b.typos)
      : matches;
  }
}
