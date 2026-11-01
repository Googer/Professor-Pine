import { distance } from 'fastest-levenshtein';
import MiniSearch from 'minisearch';
import {
  MATCH_WEIGHTS,
  allowedTypos,
  firstWords,
  searchText,
  searchTokens,
} from '../search/text.js';
import type { PokemonCatalogue } from './catalogue.js';
import { feedLookupOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';

export interface PokemonSearchOptions {
  /** At most this many results. Default: all. */
  limit?: number;
  /** Consider only these entries (raid bosses, Pokémon with a mega, …). */
  filter?: (entry: PokemonEntry) => boolean;
  /**
   * Without the preference for legendary and mythical Pokémon and ultra beasts: where the
   * class says nothing about what is likelier meant (shadow raids, which few of them have).
   */
  plain?: boolean;
}

/**
 * How well a text fits an entry it found, best first:
 *
 * - `exact`: the text names this entry outright (`PokemonSearch.exact`);
 * - `word`: every typed word is a word of its name or of a nickname;
 * - `beginning`: every typed word is at least the beginning of such a word (`gira`);
 * - `loose`: a proper match, but a typed word is found only in the key or in an id that stands
 *   for the entry (`zygarde fifty percent`, `pikachu copy`), or is or begins its number;
 * - `guess`: a typed word had to be read as a misspelling (`meadow` for `shadow`).
 */
export type PokemonMatch = 'exact' | 'word' | 'beginning' | 'loose' | 'guess';

export interface PokemonHit {
  entry: PokemonEntry;
  match: PokemonMatch;
  /**
   * Whether the text leads to the entry by its name (`PokemonSearch`): it names it outright,
   * or its first word begins the entry's or the species' name. False for what a word of a
   * form, a type or a style found (`for` and every Forme), a key, a number or a guess. A list
   * that puts some Pokémon first for being named (the current bosses) asks this.
   */
  named: boolean;
  /**
   * For a guess: the words of the entry that typed words were read as misspellings of. Whoever
   * offers a guess can show these, so that the reader sees why it is there.
   */
  guessed: readonly string[];
}

const MATCH_ORDER: Readonly<Record<PokemonMatch, number>> = {
  exact: 0,
  word: 1,
  beginning: 2,
  loose: 3,
  guess: 4,
};

interface PokemonDocument {
  id: string;
  name: string;
  nicknames: string;
  /**
   * The key, and with it the ids that stand for the entry (the bare species id, costumes,
   * appearance-only forms): one field, as it always was, so that an entry with many such ids
   * scores as it always did. Which of its words are the key's own is kept beside the index
   * (`ownWords`).
   */
  key: string;
  dex: string;
}

type Field = Exclude<keyof PokemonDocument, 'id'>;

/** How one typed word was found in an entry, in the order of `MATCH_ORDER`. */
const WORD_FITS = ['word', 'beginning', 'loose', 'guess'] as const;
type WordFit = (typeof WORD_FITS)[number];

const KIND_ORDER: Readonly<Record<PokemonEntry['kind'], number>> = {
  species: 0,
  regional: 1,
  form: 2,
  mega: 3,
};

/**
 * How far the index looks on the second try: two letters, which is what two neighbouring
 * letters typed in the wrong order count as. What it finds is then held to `swapped`.
 */
const SWAP_TYPOS = (term: string): number => (isNumber(term) || term.length < 2 ? 0 : 2);

/** Whether a word is another with two neighbouring letters in the wrong order (`lugai`). */
function swapped(typed: string, word: string): boolean {
  if (typed.length !== word.length || typed === word) return false;
  let first = 0;
  while (typed[first] === word[first]) first += 1;
  return (
    typed[first] === word[first + 1] &&
    typed[first + 1] === word[first] &&
    typed.slice(first + 2) === word.slice(first + 2)
  );
}

/**
 * As many entries of one species as its class puts before the ordinary Pokémon, the best of
 * them: with all of them lifted, the eighteen types of Arceus and of Silvally filled a list
 * for `ar` and `sil` and left no room for Arcanine and Silcoon.
 */
const CLASS_LIFTS = 3;

/** Whether a typed word may be read as a misspelling of a word of an entry. */
type Misspelt = (typed: string, word: string) => boolean;

/**
 * The first try: as many wrong letters as the length of the word allows (`allowedTypos`). A
 * word of up to five letters must keep its first letter, as in the short lists
 * (`word-match.ts`): one wrong letter in four finds a Pokémon for nearly any short word
 * otherwise (`lake` is not Walking Wake, `ttar` not Furfrou's Star Trim).
 */
const MISSPELT: Misspelt = (typed, word) =>
  distance(typed, word) <= FIRST_TYPOS(typed) && (typed.length > 5 || typed[0] === word[0]);

/**
 * The second try, when the first found nothing: besides what the first allows, two
 * neighbouring letters in the wrong order, in a word of any length (`lugai`, which is two
 * wrong letters in five). Nothing wider: two free wrong letters in a short word found a
 * Pokémon for nearly any word (`none`, `lake`, `hundo`).
 */
const MISSPELT_OR_SWAPPED: Misspelt = (typed, word) =>
  MISSPELT(typed, word) || (!isNumber(typed) && swapped(typed, word));

/** A number may be typed in part (a beginning) but is never a misspelling: 1000 is not 1002. */
function isNumber(term: string): boolean {
  return /^\p{N}+$/u.test(term);
}

const FIRST_TYPOS = (term: string): number => (isNumber(term) ? 0 : allowedTypos(term));

function sameBattler(a: PokemonEntry, b: PokemonEntry): boolean {
  const facts = (entry: PokemonEntry) =>
    JSON.stringify([
      entry.stats,
      entry.types,
      entry.fastMoves,
      entry.chargedMoves,
      entry.eliteFastMoves,
      entry.eliteChargedMoves,
    ]);
  return facts(a) === facts(b);
}

/**
 * The nicknames of several sources (the curated list, the moderators' from the database) put
 * together under the key of the catalogue entry each one means. Keys the catalogue does not know
 * (the legacy table also holds `ex`, `perfect`, `zero`) are left out; an alias such as `giratina`
 * lands on its entry.
 */
export function mergeNicknames(
  catalogue: PokemonCatalogue,
  ...sources: (
    ReadonlyMap<string, readonly string[]> | Readonly<Record<string, readonly string[]>>
  )[]
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const source of sources) {
    const pairs = source instanceof Map ? [...source] : Object.entries(source);
    for (const [key, nicknames] of pairs as [string, readonly string[]][]) {
      const entry = catalogue.byKey(key);
      if (!entry) continue;
      merged.set(entry.key, [...new Set([...(merged.get(entry.key) ?? []), ...nicknames])]);
    }
  }
  return merged;
}

/**
 * Finds Pokémon by what members type: the name ("giratina origin", "alolan rattata", "mega
 * charizard y"), the catalogue key, a game-master id that stands for an entry, a nickname
 * ("ttar") or the Pokédex number. Every word must match; a word may be the beginning of a longer
 * one ("alo", "galar", "hisu") or slightly misspelt. When that finds nothing, a second try also
 * reads two neighbouring letters in the wrong order ("lugai").
 *
 * The best fit comes first (`find`): what the text names outright; then the hits it leads to
 * by their name (its first word begins the name, a nickname or the species' name, or is a word
 * of the species' name: `gira`, `hoo`, `rattata`), whole words before beginnings and among
 * equals a legendary, a mythical Pokémon or an ultra beast before an ordinary one, though the
 * class lifts three entries of a species at most (`CLASS_LIFTS`: Arceus has eighteen); then
 * the hits found only by a word of a form, a type or a style (`ty` finds Tyranitar before the
 * seventeen types of Arceus), whatever their class; then what only a key or a number finds;
 * guesses last. Among equal fits the species comes before its regional forms, other forms and
 * megas, so "giratina" gives the Altered Forme and "charizard" the plain one. A form that
 * differs from its species in looks only (Vivillon's patterns, Unown's letters) is left out
 * unless the text names it: "vivillon" gives one result, "vivillon marine" the pattern.
 *
 * Built for one catalogue; build a new one when the game data or the nicknames change.
 */
export class PokemonSearch {
  private readonly index: MiniSearch<PokemonDocument>;
  private readonly exactTexts = new Map<string, PokemonEntry | null>();
  /** Every entry a folded text is the name, key, id or a nickname of. */
  private readonly owners = new Map<string, PokemonEntry[]>();
  /** For a looks-only form: the words that tell it from its species. */
  private readonly formWords = new Map<string, Set<string>>();
  /** By entry: the words of its own key, as against those of the ids that stand for it. */
  private readonly ownWords = new Map<string, ReadonlySet<string>>();
  /**
   * By entry: the first word of its name, the first word of each of its nicknames, and the
   * words of its species' name.
   */
  private readonly leads = new Map<
    string,
    { first: string; nicknames: readonly string[]; species: ReadonlySet<string> }
  >();

  constructor(
    private readonly catalogue: PokemonCatalogue,
    nicknames: ReadonlyMap<string, readonly string[]> = new Map(),
  ) {
    this.index = new MiniSearch<PokemonDocument>({
      fields: ['name', 'nicknames', 'key', 'dex'],
      tokenize: searchTokens,
    });
    for (const entry of catalogue.all) {
      const nicks = nicknames.get(entry.key) ?? [];
      const aliases = catalogue.aliasesOf(entry.key);
      const ids = [entry.key, ...aliases];
      this.index.add({
        id: entry.key,
        name: entry.name,
        nicknames: nicks.join(' '),
        key: ids.join(' '),
        dex: String(entry.dex),
      });
      this.ownWords.set(entry.key, new Set(searchTokens(entry.key)));
      for (const text of [entry.name, ...ids, ...nicks]) this.remember(text, entry);
      this.leads.set(entry.key, {
        first: searchTokens(entry.name)[0] ?? '',
        nicknames: nicks.flatMap((nick) => searchTokens(nick).slice(0, 1)),
        // The species as it is called without its form: Giratina, not its Altered Forme.
        species: new Set(
          searchTokens(feedLookupOf(catalogue).speciesName(entry.pokemonId) ?? entry.name),
        ),
      });
      const species = catalogue.species(entry.dex);
      if (entry.kind === 'form' && species && species !== entry && sameBattler(entry, species)) {
        const shared = new Set(searchTokens(`${species.name} ${species.key}`));
        const own = searchTokens(`${entry.name} ${entry.key} ${nicks.join(' ')}`);
        this.formWords.set(entry.key, new Set(own.filter((word) => !shared.has(word))));
      }
    }
  }

  /** A text that means exactly one entry finds it at once; one shared by several does not. */
  private remember(text: string, entry: PokemonEntry): void {
    const folded = searchText(text);
    if (folded === '') return;
    const owners = this.owners.get(folded);
    if (!owners) this.owners.set(folded, [entry]);
    else if (!owners.includes(entry)) owners.push(entry);
    const known = this.exactTexts.get(folded);
    if (known === undefined) this.exactTexts.set(folded, entry);
    else if (known !== entry) this.exactTexts.set(folded, null);
  }

  /**
   * How a hit fits the typed words, or undefined for a hit that is none after all:
   *
   * - a nickname is never read as a misspelling: nicknames are short slang, and `star` is not
   *   `ttar`, nor `kabuto` the `kanto` of an Alolan form's counterpart. Neither is an id that
   *   only stands for the entry, nor a number: a guess is a word of the name, or one of the
   *   entry's own key;
   * - a hit found by nothing but the words of ids that stand for it is none: Pikachu's
   *   costumes have ids with `star`, `party` and `summer` in them, and `star` is not Pikachu.
   *   With a word of the entry itself beside them (`pikachu copy`) they do find it.
   */
  private fit(
    key: string,
    typed: readonly string[],
    found: Readonly<Record<string, readonly string[]>>,
    misspelt: Misspelt,
  ): Pick<PokemonHit, 'match' | 'guessed'> | undefined {
    const ownWords = this.ownWords.get(key);
    let worst = 0;
    let onlyAliases = true;
    const guessed: string[] = [];
    for (const word of typed) {
      let best: { fit: number; own: boolean; term: string } | undefined;
      for (const [term, fields] of Object.entries(found) as [string, Field[]][]) {
        const named = fields.includes('name') || fields.includes('nicknames');
        // Found in the key field alone, by a word that is not the key's own: by an id that
        // only stands for the entry.
        const own = fields.some((field) => field !== 'key') || ownWords?.has(term) === true;
        let fit: WordFit;
        if (term === word) fit = named ? 'word' : 'loose';
        else if (term.startsWith(word)) fit = named ? 'beginning' : 'loose';
        else if (
          (fields.includes('name') || (fields.includes('key') && ownWords?.has(term) === true)) &&
          misspelt(word, term)
        ) {
          fit = 'guess';
        } else continue;
        const rank = WORD_FITS.indexOf(fit);
        // Of two equal fits the one by a word of the entry itself counts.
        if (!best || rank < best.fit || (rank === best.fit && own && !best.own)) {
          best = { fit: rank, own, term };
        }
      }
      if (!best) return undefined;
      if (best.own) onlyAliases = false;
      if (WORD_FITS[best.fit] === 'guess') guessed.push(best.term);
      worst = Math.max(worst, best.fit);
    }
    const match = WORD_FITS[worst];
    return onlyAliases || match === undefined ? undefined : { match, guessed };
  }

  /**
   * Whether a text leads to an entry by its name: its first word begins the first word of the
   * entry's name (`gira`, `mega`, `alo`), of one of its nicknames (`hoo` for Ho-Oh, `tta` for
   * Tyranitar) or of its species' name (`ratt` for the Alolan Rattata, `char` for Mega
   * Charizard), or is a word of the species' name (`bulu` for Tapu Bulu). Anything else found
   * the entry by a word of a form, a type or a style (`ty` for Arceus of any type, `for` for
   * every Forme), or by the middle of its name (`bul` for Tapu Bulu).
   */
  private ledByName(entry: PokemonEntry, typed: readonly string[]): boolean {
    const [first] = typed;
    const lead = this.leads.get(entry.key);
    if (first === undefined || !lead) return false;
    const [speciesFirst = ''] = lead.species;
    return (
      lead.first.startsWith(first) ||
      lead.nicknames.some((nickname) => nickname.startsWith(first)) ||
      speciesFirst.startsWith(first) ||
      lead.species.has(first)
    );
  }

  private rank(
    text: string,
    typos: (term: string) => number,
    misspelt: Misspelt,
    plain: boolean,
  ): PokemonHit[] {
    const typed = [...new Set(searchTokens(text))];
    const hits: { hit: PokemonHit; score: number; group: number; classed: boolean }[] = [];
    const results = this.index.search(text, {
      combineWith: 'AND',
      boost: { name: 3, nicknames: 3 },
      prefix: true,
      fuzzy: typos,
      weights: { ...MATCH_WEIGHTS },
    });
    for (const result of results) {
      const formWords = this.formWords.get(result.id as string);
      if (formWords && !result.terms.some((term) => formWords.has(term))) continue;
      const entry = this.catalogue.byKey(result.id as string);
      const fit = this.fit(entry?.key ?? '', typed, result.match, misspelt);
      if (!entry || !fit) continue;
      const named = fit.match === 'word' || fit.match === 'beginning';
      const led = named && this.ledByName(entry, typed);
      hits.push({
        hit: { entry, ...fit, named: led },
        score: result.score,
        // By its name; by a word of a form or the like; by a key or a number; by a guess.
        group: led ? 0 : named ? 1 : MATCH_ORDER[fit.match],
        // The class orders only among the hits a text leads to by their name.
        classed: led && !plain && entry.class !== null,
      });
    }
    type Ranked = (typeof hits)[number];
    const order =
      (withClass: boolean) =>
      (a: Ranked, b: Ranked): number =>
        a.group - b.group ||
        MATCH_ORDER[a.hit.match] - MATCH_ORDER[b.hit.match] ||
        (withClass ? Number(b.classed) - Number(a.classed) : 0) ||
        b.score - a.score ||
        KIND_ORDER[a.hit.entry.kind] - KIND_ORDER[b.hit.entry.kind] ||
        a.hit.entry.key.localeCompare(b.hit.entry.key);
    // The class lifts the best few entries of a species; its others stand where they would
    // without a class.
    hits.sort(order(false));
    const lifted = new Map<number, number>();
    for (const ranked of hits) {
      if (!ranked.classed) continue;
      const before = lifted.get(ranked.hit.entry.dex) ?? 0;
      if (before >= CLASS_LIFTS) ranked.classed = false;
      else lifted.set(ranked.hit.entry.dex, before + 1);
    }
    return hits.sort(order(true)).map(({ hit }) => hit);
  }

  /**
   * The one entry this text names outright (its name, key, an id that stands for it, or a
   * nickname no other entry has); undefined when the text is anything less. Act on this; offer
   * `search` results as a choice.
   */
  exact(text: string): PokemonEntry | undefined {
    return this.exactTexts.get(searchText(text)) ?? undefined;
  }

  /**
   * Every entry this text is already the name, the key, an id or a nickname of, compared as
   * `exact` compares (without regard to case, spaces and punctuation); empty when it names none.
   * For a new nickname, which must not be another Pokémon's.
   */
  namedBy(text: string): PokemonEntry[] {
    return [...(this.owners.get(searchText(text)) ?? [])];
  }

  /**
   * What a text finds, best first, each hit with how it fits (`PokemonMatch`): the entry the
   * text names outright, then the order the class describes; among the hits a text leads to
   * by their name a legendary, a mythical Pokémon or an ultra beast stands before an ordinary
   * one (`gira` gives Giratina before Girafarig; not with `plain`), and a guess stands after
   * every proper match. A text that names an entry outright is not guessed at: `mawile` is no
   * misspelling of Marill, and what begins with it (`kabuto` and Kabutops) is all it brings
   * besides. The species whose Pokédex number the text is stands first as well, but as a
   * `loose` hit: a number is not a name. A long text goes by its first words (`firstWords`).
   */
  find(typed: string, options: PokemonSearchOptions = {}): PokemonHit[] {
    const text = firstWords(typed);
    const { filter, limit } = options;
    const plain = options.plain === true;
    const folded = searchText(text);
    const named = this.exact(text);
    const numbered =
      named === undefined && /^\d+$/.test(folded)
        ? this.catalogue.species(Number(folded))
        : undefined;
    const first = named ?? numbered;
    let ranked = this.rank(text, FIRST_TYPOS, MISSPELT, plain);
    if (ranked.length === 0) ranked = this.rank(text, SWAP_TYPOS, MISSPELT_OR_SWAPPED, plain);
    const found: PokemonHit[] = first
      ? [
          {
            entry: first,
            match: named ? 'exact' : 'loose',
            named: named !== undefined,
            guessed: [],
          },
          ...ranked.filter((hit) => hit.entry !== first && !(named && hit.match === 'guess')),
        ]
      : ranked;
    const allowed = filter ? found.filter((hit) => filter(hit.entry)) : found;
    return limit === undefined ? allowed : allowed.slice(0, limit);
  }

  /** The entries of `find`, for whoever does not ask how they fit. */
  search(text: string, options: PokemonSearchOptions = {}): PokemonEntry[] {
    return this.find(text, options).map((hit) => hit.entry);
  }
}
