import { matchNamed, type Named } from '../search/word-match.js';
import type { PokemonCatalogue } from './catalogue.js';
import { feedLookupOf } from './feed-lookup.js';
import { searchTokens } from '../search/text.js';
import {
  encodeNotification,
  isFormKey,
  isNotificationTier,
  isPokedexNumber,
  notificationTiers,
  pokemonTarget,
  readNotification,
  sameNotificationTarget,
  widerScope,
  type EncodedNotification,
  type NotificationScope,
  type NotificationTarget,
  type PokemonTarget,
  type StoredNotification,
  type Want,
} from './notification-target.js';
import {
  isRaidLevel,
  raidTier,
  raidTierLabel,
  type RaidLevel,
  type RaidTier,
} from './raid-tier.js';

/**
 * What a choice of a list of wants carries as its value (the list that appears while a member
 * types): a text that says exactly which target was picked, whatever the list called it. It is
 * not for the custom id of a control, which takes neither `:` nor an empty part. `pokemon:<dex>` for a
 * species, `pokemon:<dex>:<form>` for one form of it (the form's catalogue key), and
 * `pokemon:<dex>::shadow` and `pokemon:<dex>:<form>:shadow` for the shadow raids of either;
 * `tier:<level>` and `tier:<level>:shadow` (the level as `RaidLevel` spells it), `iv:perfect`,
 * `iv:zero`. At most 100 characters, as a choice's value may be. The shadow flag has a place
 * of its own, after the form: `pokemon:<dex>:shadow` is a form whose key is `shadow`, which no
 * game data has (`/want` answers that it does not know that Pokémon).
 */
export function wantToken(target: NotificationTarget): string {
  if (target.kind === 'pokemon') {
    const species = `pokemon:${String(target.dex)}`;
    if (target.shadow) return `${species}:${target.form ?? ''}:shadow`;
    return target.form === undefined ? species : `${species}:${target.form}`;
  }
  if (target.kind === 'iv') return `iv:${target.iv}`;
  return `tier:${target.tier.level}${target.tier.shadow ? ':shadow' : ''}`;
}

/**
 * The target a token names; undefined for any other text, also for a tier that cannot be wanted,
 * for a number that is no Pokédex number and for a form that cannot be a catalogue key. Whether
 * the species or the form exists is not asked here.
 */
export function parseWantToken(text: string): NotificationTarget | undefined {
  const [kind, value, flag, last, ...more] = text.trim().split(':');
  if (value === undefined || more.length > 0) return undefined;
  if (kind === 'pokemon') {
    if (!/^[1-9]\d*$/.test(value) || !isPokedexNumber(Number(value))) return undefined;
    if (flag === undefined) return pokemonTarget(Number(value));
    // Three parts name a form; four name the shadow raids, of the species when the form is empty.
    if (last !== undefined && last !== 'shadow') return undefined;
    if (flag === '' ? last === undefined : !isFormKey(flag)) return undefined;
    return pokemonTarget(Number(value), flag === '' ? undefined : flag, last === 'shadow');
  }
  if (last !== undefined) return undefined;
  if (kind === 'iv' && flag === undefined) {
    return value === 'perfect' || value === 'zero' ? { kind: 'iv', iv: value } : undefined;
  }
  if (kind === 'tier' && (flag === undefined || flag === 'shadow') && isRaidLevel(value)) {
    const tier = raidTier(value, flag === 'shadow');
    return tier && isNotificationTier(tier) ? { kind: 'tier', tier } : undefined;
  }
  return undefined;
}

/** `T5 raids`, `Shadow T5 raids`, `Mega Legendary raids`. */
export function tierWantLabel(tier: RaidTier): string {
  return `${raidTierLabel(tier)} raids`;
}

/** `Perfect IV spawns`, `Zero IV spawns`. */
export function ivWantLabel(iv: 'perfect' | 'zero'): string {
  return iv === 'perfect' ? 'Perfect IV spawns' : 'Zero IV spawns';
}

/**
 * What a target is called in a list: `T5 raids`, `Perfect IV spawns`; a species by its name,
 * with `(every form)` when it has several, so that it cannot be taken for one of the forms that
 * may stand beside it (`Giratina (every form)`, `Dratini`); one form by the name of its entry
 * (`Giratina (Origin Forme)`, `Mega Charizard Y`); shadow raids as `Shadow Landorus`. What the
 * game data does not have (any more) is called by its number or its key (`pokemonWantName`).
 * The name comes from the game data, so it is not made plain here; `plain()` it where it
 * stands in a message. The one name of a want everywhere: lists, answers, direct messages.
 */
export function wantTargetLabel(
  catalogue: PokemonCatalogue,
  target: NotificationTarget,
  costumed = false,
): string {
  if (target.kind === 'tier') return tierWantLabel(target.tier);
  if (target.kind === 'iv') return ivWantLabel(target.iv);
  return pokemonWantName(catalogue, target, { everyForm: true, costumed });
}

/** The number a level has in the game, as members type it. */
const LEVEL_NUMBERS: Partial<Record<RaidLevel, string>> = {
  T1: '1',
  T3: '3',
  T5: '5',
  Mega: '4',
  MegaLegendary: '6',
  SuperMega: '7',
};

/** Words for a level beside its number. */
const LEVEL_WORDS: Readonly<Record<RaidLevel, readonly string[]>> = {
  T1: [],
  T3: [],
  T5: ['legendary'],
  Mega: ['mega'],
  MegaLegendary: ['mega legendary', 'legendary mega'],
  SuperMega: ['super mega'],
  Elite: ['elite'],
};

/** Every way a tier is typed: `5`, `t5`, `tier 5`, `level 5`, `5 star`, `shadow 5`, `mega`. */
function tierNames(tier: RaidTier): string[] {
  const number = LEVEL_NUMBERS[tier.level];
  const plain = [
    ...(number === undefined
      ? []
      : [number, `t${number}`, `tier ${number}`, `level ${number}`, `${number} star`]),
    ...LEVEL_WORDS[tier.level],
    raidTierLabel({ level: tier.level, shadow: false }),
  ];
  return tier.shadow ? plain.map((name) => `shadow ${name}`) : plain;
}

/** `hundo` is the legacy word for perfect; `none` and `useless` its words for zero. */
const IV_NAMES: Readonly<Record<'perfect' | 'zero', readonly string[]>> = {
  perfect: ['perfect', 'perfect iv', 'perfect ivs', 'hundo', '100', '100 iv', '100 percent'],
  zero: ['zero', 'zero iv', 'zero ivs', 'none', 'useless', 'nundo', '0', '0 iv', '0 percent'],
};

/** The tier and IV targets with the names they are typed by: fixed, so built once. */
interface WordCandidates {
  /** For the strict matcher (`wantWordGuesses`). */
  named: Named<NotificationTarget>[];
  /** By a name without its gaps; null for a name that two targets share. */
  byName: Map<string, NotificationTarget | null>;
}

let wordCandidatesBuilt: WordCandidates | undefined;

function wordCandidates(): WordCandidates {
  if (wordCandidatesBuilt) return wordCandidatesBuilt;
  const named = [
    ...notificationTiers().map((tier): Named<NotificationTarget> => ({
      value: { kind: 'tier', tier },
      names: tierNames(tier),
    })),
    ...(['perfect', 'zero'] as const).map((iv): Named<NotificationTarget> => ({
      value: { kind: 'iv', iv },
      names: IV_NAMES[iv],
    })),
  ];
  const byName = new Map<string, NotificationTarget | null>();
  for (const candidate of named) {
    for (const name of candidate.names) {
      const folded = searchTokens(name).join('');
      const known = byName.get(folded);
      byName.set(folded, known === undefined || known === candidate.value ? candidate.value : null);
    }
  }
  wordCandidatesBuilt = { named, byName };
  return wordCandidatesBuilt;
}

/** Words that say nothing about which tier or IV target is meant. */
const FILLER = new Set(['raid', 'raids', 'egg', 'eggs', 'spawn', 'spawns', 'boss', 'bosses']);

/**
 * The tier or IV target a typed text names as a word: `tier 5`, `t5`, `5`, `level 5`, `5 star`,
 * `legendary`, `mega`, `mega legendary`, `super mega`, `elite`, `shadow 5`,
 * `perfect`, `hundo`, `100`, `zero`, `none`, `useless`, `0`, with or without `raids`, `eggs` or
 * `spawns` after it. Only a text that is one of these names in full is that target: the
 * beginning of a name or a misspelling of one is never acted on, because it is as likely the
 * beginning of a Pokémon's name (`zer`, `hun`, `eli`, `mega s`). Such a text is only offered
 * (`wantWordGuesses`). Undefined for anything else.
 */
export function wantWord(text: string): NotificationTarget | undefined {
  const words = wordsOf(text);
  if (words.length === 0) return undefined;
  return wordCandidates().byName.get(words.join('')) ?? undefined;
}

/** As many tier and IV targets as a refusal or a list offers for a text that names none. */
const WORD_GUESSES = 3;

/**
 * The tier and IV targets a text may have meant, best first: the one it names in full, or
 * those whose name it begins or nearly spells (the strict matcher: three letters at least).
 * For offering, in a list of choices or a "did you mean"; never for acting on.
 */
export function wantWordGuesses(text: string): NotificationTarget[] {
  const exact = wantWord(text);
  if (exact) return [exact];
  const words = wordsOf(text);
  if (words.length === 0) return [];
  return matchNamed(wordCandidates().named, words.join(' ')).slice(0, WORD_GUESSES);
}

/** The words of a typed tier or IV target, spelled one way, without the words that say nothing. */
function wordsOf(text: string): string[] {
  // `tier5` is `tier 5`, `100%` is `100 percent`.
  const spelled = text
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/\b(tier|level|t)\s*(\d)\b/g, (_all, word: string, digit: string) =>
      word === 't' ? `t${digit}` : `${word} ${digit}`,
    )
    .replace(/\b(\d)[\s-]*stars?\b/g, '$1 star');
  return searchTokens(spelled).filter((word) => !FILLER.has(word));
}

/** What `readWantText` needs to know of the Pokémon. Build one with `wantSpeciesFinder`. */
export interface WantSpeciesFinder {
  /**
   * The want that a text means which names one Pokémon outright (`ctx.pokemon.exact`): that
   * form of its species (`typedEntryWant`).
   */
  exact(text: string): PokemonTarget | undefined;
  /** The species a text is the name of, when it is the name of exactly one. */
  species(text: string): { dex: number } | undefined;
  /** Pokémon a text may mean, best first, near misses included (`ctx.pokemon.search`). */
  search(text: string, options: { limit: number }): ReadonlyArray<{ dex: number }>;
  /**
   * A target as the game data knows it: the species must exist, and a form must be an entry
   * of that species, under its own key or an alias of it. The target is then what the list
   * offers for that entry (`entryWant`): the key of the entry, and simply the species when the
   * entry is all there is of it. Undefined for what the game data does not have.
   */
  known(target: PokemonTarget): PokemonTarget | undefined;
  /**
   * The want for the base form of a species alone: the entry that is called as the species is,
   * where the species has other entries beside it (Charizard beside its megas). Undefined for
   * a species without such an entry.
   */
  base(dex: number): PokemonTarget | undefined;
}

/** An entry of the catalogue as far as a want needs it. */
interface Entry {
  dex: number;
  key: string;
  name: string;
  kind: 'species' | 'regional' | 'form' | 'mega';
}

/**
 * What the game data says of a form that a row holds: the key of the entry the stored key
 * stands for today (a key can become an alias: `giratina` is `giratina_altered`), and whether
 * that entry is a mega. A key the game data does not have is read as it stands, and is no mega.
 */
export interface FormReading {
  key: string;
  mega: boolean;
}

/** Reads the stored form of a row with this Pokédex number (`FormReading`). */
export type FormReader = (dex: number, form: string) => FormReading;

/** A reader that knows no game data: every form as it is stored. For what needs none. */
export const formAsStored: FormReader = (_dex, form) => ({ key: form, mega: false });

/**
 * The reader over the game data in use; `catalogue` is asked at every reading, because the
 * game data is replaced while the bot runs. A key that is an entry of another species is not
 * a form of this one, and is read as it stands.
 */
export function formReader(catalogue: () => PokemonCatalogue): FormReader {
  return (dex, form) => {
    const entry = catalogue().byKey(form);
    return entry?.dex === dex
      ? { key: entry.key, mega: entry.kind === 'mega' }
      : { key: form, mega: false };
  };
}

/**
 * Whether a want can only be about raids: the shadow raids of a Pokémon, and a mega, which is
 * never met in the wild. Its scope is `raid` whatever was picked or is stored, like a tier's.
 */
export function raidsOnly(target: NotificationTarget, reader: FormReader): boolean {
  if (target.kind !== 'pokemon') return target.kind === 'tier';
  return (
    target.shadow === true || (target.form !== undefined && reader(target.dex, target.form).mega)
  );
}

/** The base form among the entries of a species: see `WantSpeciesFinder.base`. */
function baseEntry(catalogue: PokemonCatalogue, dex: number): Entry | undefined {
  const species = catalogue.species(dex);
  return species && hasForms(catalogue, dex) && species.name === speciesNameOf(catalogue, dex)
    ? species
    : undefined;
}

/** Whether a species has more than one entry in the game data: forms, regional forms, megas. */
export function hasForms(catalogue: PokemonCatalogue, dex: number): boolean {
  return catalogue.byDex(dex).length > 1;
}

/**
 * The want an entry of the catalogue stands for where a member picks it from a list: that one
 * form, or simply the species when the entry is all there is of it.
 */
export function entryWant(
  catalogue: PokemonCatalogue,
  entry: Pick<Entry, 'dex' | 'key'>,
  shadow = false,
): PokemonTarget {
  return hasForms(catalogue, entry.dex)
    ? pokemonTarget(entry.dex, entry.key, shadow)
    : pokemonTarget(entry.dex, undefined, shadow);
}

/** Words of a form's name that say nothing about which form it is. */
const FORM_FILLER = new Set(['forme', 'form', 'mode']);

/**
 * Whether a text is an entry's own name or key, or part of it: every word of the text is a word
 * of the name or of the key, and at least one of them is not a word of the species' name
 * (`Giratina Altered`, `giratina_altered`, `altered`; not `tina`, a nickname).
 */
function namesEntry(catalogue: PokemonCatalogue, entry: Entry, text: string): boolean {
  const own = new Set([...searchTokens(entry.name), ...searchTokens(entry.key.replace(/_/g, ' '))]);
  const species = new Set(searchTokens(speciesNameOf(catalogue, entry.dex) ?? ''));
  const words = searchTokens(text);
  return (
    words.every((word) => own.has(word)) &&
    words.some((word) => !species.has(word) && !FORM_FILLER.has(word))
  );
}

/**
 * The want an entry stands for where a member typed `text`, which names it outright: that one
 * form (`Mega Charizard Y`, `Alolan Rattata`, `Giratina Origin`). The species' own entry is the
 * exception, because a nickname of the species leads to it: a text that is not that entry's
 * own name or key (`tina` for Giratina, whose entry is the Altered Forme) means the species,
 * and so does any text for an entry that is called as its species is (`Charizard`, beside its
 * megas): that entry alone is picked from the list, or typed as `Charizard base form`.
 */
export function typedEntryWant(
  catalogue: PokemonCatalogue,
  entry: Entry,
  text: string,
): PokemonTarget {
  const species =
    entry.kind === 'species' &&
    (entry.name === speciesNameOf(catalogue, entry.dex) || !namesEntry(catalogue, entry, text));
  return species ? pokemonTarget(entry.dex) : entryWant(catalogue, entry);
}

/**
 * What a Pokémon target is called. A species is called by its name, with `(every form)` after
 * it where `everyForm` is asked for and the species has several entries (in a list, where its
 * forms may stand beside it); a form by the name of its entry (`Giratina (Origin Forme)`,
 * `Mega Charizard Y`), and the entry that is called as its species is by `Charizard (base
 * form)`, so that it is never taken for the species; a form the game data does not have (any
 * more) by its species with the key (`Giratina (giratina_sky)`); a species it does not have by
 * its number. Shadow raids have `Shadow` before the name, and no `(every form)`. A costumed want
 * (`costumed`, plan 8R-4) has `Costumed` before it all, and no `(every form)` either: "Costumed
 * Pikachu", "Costumed Galarian Corsola", "Costumed Corsola" for every form. The names come
 * from the game data and are not made plain here.
 */
export function pokemonWantName(
  catalogue: PokemonCatalogue,
  target: PokemonTarget,
  options: { everyForm?: boolean; costumed?: boolean } = {},
): string {
  const species = speciesNameOf(catalogue, target.dex) ?? `Pokémon #${String(target.dex)}`;
  const costumed = options.costumed === true;
  let name: string;
  if (target.form === undefined) {
    const several =
      options.everyForm === true && !target.shadow && !costumed && hasForms(catalogue, target.dex);
    name = several ? `${species} (every form)` : species;
  } else {
    const entry = catalogue.byKey(target.form);
    if (entry?.dex !== target.dex) name = `${species} (${target.form})`;
    else if (entry.key === baseEntry(catalogue, target.dex)?.key) name = `${species} (base form)`;
    else name = entry.name;
  }
  const shadowed = target.shadow ? `Shadow ${name}` : name;
  return costumed ? `Costumed ${shadowed}` : shadowed;
}

/** What a sighting is as a want is matched against it: an entry, and whether it is costumed. */
export interface PokemonSighting {
  dex: number;
  key: string;
  /** Costumed (plan 8R-4, `isCostumed`); absent is plain, as a max boss or a Rocket catch is. */
  costumed?: boolean;
}

/**
 * Whether a Pokémon want is for what was reported: a want for a species fits every entry with
 * its Pokédex number, a want for a form only the entry its key stands for (as the catalogue
 * resolves it: a stored key that has become an alias fits the entry it is an alias of), and a
 * want for shadow raids only a shadow raid (`shadowRaid`; a spawn is none). A costumed want
 * (`costumed`, plan 8R-4) fits only a costumed sighting, matched under the entry the costume
 * copies (the sighting's `key` is that entry's: Galarian Corsola's for its spring costume); a
 * plain want fits either. A mega or primal is never costumed (Matt's ruling 4 of plan 8R-4): a
 * costumed want of the whole species fits it as a plain want would, so that ticking every form
 * and Costumed still tells of the species' mega raids. A boss or a spawn without an entry of the
 * catalogue fits no Pokémon want. The scope (raids, spawns) is the caller's to ask.
 */
export function pokemonWantFits(
  catalogue: Pick<PokemonCatalogue, 'byKey'>,
  target: PokemonTarget,
  entry: PokemonSighting | undefined,
  shadowRaid: boolean,
  costumed = false,
): boolean {
  if (!entry || entry.dex !== target.dex) return false;
  const megaOfSpecies = target.form === undefined && catalogue.byKey(entry.key)?.kind === 'mega';
  if (costumed && entry.costumed !== true && !megaOfSpecies) return false;
  if (target.form !== undefined) {
    const wanted = catalogue.byKey(target.form);
    if (wanted?.dex !== target.dex || wanted.key !== entry.key) return false;
  }
  return target.shadow !== true || shadowRaid;
}

/**
 * The name of the species with a Pokédex number, as a want is called: `Giratina`, not the form
 * the species is known by (`Giratina (Altered Forme)`). Undefined for a number the game data
 * does not have.
 */
export function speciesNameOf(catalogue: PokemonCatalogue, dex: number): string | undefined {
  const species = catalogue.species(dex);
  return species && (feedLookupOf(catalogue).speciesName(species.pokemonId) ?? species.name);
}

const speciesNames = new WeakMap<PokemonCatalogue, Map<string, number | null>>();

/** The species by their names, folded; null for a name that two species share. */
function speciesByName(catalogue: PokemonCatalogue): Map<string, number | null> {
  let names = speciesNames.get(catalogue);
  if (!names) {
    names = new Map();
    for (const entry of catalogue.all) {
      if (entry.kind !== 'species') continue;
      const name = searchTokens(speciesNameOf(catalogue, entry.dex) ?? '').join(' ');
      if (name === '') continue;
      const known = names.get(name);
      names.set(name, known === undefined || known === entry.dex ? entry.dex : null);
    }
    speciesNames.set(catalogue, names);
  }
  return names;
}

/**
 * A finder over a catalogue and the Pokémon search (`ctx.pokemon`). The search knows a text
 * only when it names one entry; a species is found by its name here, also one whose name
 * several of its entries answer to (Unown and its letters), and one that the search knows by
 * the form it is known by (Giratina).
 */
export function wantSpeciesFinder(
  catalogue: PokemonCatalogue,
  pokemon: {
    exact(text: string): Entry | undefined;
    search(text: string, options: { limit: number }): ReadonlyArray<{ dex: number }>;
  },
): WantSpeciesFinder {
  return {
    exact: (text) => {
      const entry = pokemon.exact(text);
      return entry && typedEntryWant(catalogue, entry, text);
    },
    search: (text, options) => pokemon.search(text, options),
    species: (text) => {
      const dex = speciesByName(catalogue).get(searchTokens(text).join(' '));
      return dex === undefined || dex === null ? undefined : { dex };
    },
    known: (target) => {
      if (target.form === undefined) return catalogue.species(target.dex) ? target : undefined;
      const entry = catalogue.byKey(target.form);
      return entry?.dex === target.dex
        ? entryWant(catalogue, entry, target.shadow === true)
        : undefined;
    },
    base: (dex) => {
      const entry = baseEntry(catalogue, dex);
      return entry && pokemonTarget(dex, entry.key);
    },
  };
}

/** As many Pokémon as a refusal suggests. */
const WANT_SUGGESTIONS = 5;

export type TypedWant =
  | { kind: 'target'; target: NotificationTarget }
  /** A token for a Pokémon or a form the game data does not have (any more). */
  | { kind: 'gone' }
  /**
   * Nothing the text names outright: the tier and IV targets it may have meant (`words`) and
   * the Pokédex numbers of the Pokémon it may have meant (`suggestions`); with `shadow`, the
   * text began with that word and the suggestions are for what followed it, so their shadow
   * raids are what it may have meant.
   */
  | { kind: 'unknown'; words: NotificationTarget[]; suggestions: number[]; shadow?: true };

/**
 * A scope at the end of a text, as a list of a member's own wants labels them: after ` · `, or
 * in brackets.
 */
const SCOPE_AT_END =
  /\s*(?:\((?:raids and spawns|raids|spawns)\)|·\s*(?:raids and spawns|raids|spawns))\s*$/i;
/** How a species the game data does not have is called in such a list: `Pokémon #1234`. */
const NUMBERED = /^pok[eé]mon\s*#\s*([1-9]\d*)$/i;
/**
 * What a list adds to a species that has several forms; the words alone are read as well, like
 * `base form` (the words of a label name what it labels).
 */
const EVERY_FORM = /\s*(?:\(every form\)|\bevery form)\s*$/i;
/** How the entry that is called as its species is, is told from the species: `(base form)`. */
const BASE_FORM = /\s*(?:\(base form\)|\bbase form)\s*$/i;
/**
 * `shadow` before a name: the shadow raids of what the rest names (also in what is being
 * typed, for a list).
 */
export const SHADOW_OF = /^shadow\s+(\S.*)$/i;
/** A word after a name that says nothing about which Pokémon is meant, and nothing of the scope. */
const FILLER_AT_END = /\s+(?:raids?|eggs?|spawns?)\s*$/i;

/**
 * A typed name as it stands, then without the filler words after it, one fewer each time:
 * `lugia raid eggs`, `lugia raid`, `lugia`. The last is the name without any of them.
 */
function withoutFiller(text: string): string[] {
  const names = [text.trim()];
  for (let name = names[0] ?? ''; FILLER_AT_END.test(name);) {
    name = name.replace(FILLER_AT_END, '');
    names.push(name);
  }
  return names;
}

/**
 * The Pokémon a typed text names in full: a species by its name (the want is for every form),
 * its base form alone by `<species> base form`, or the one form or mega that the text names
 * outright; with `shadow` before any of them, its shadow raids. One letter names an Unown
 * form: too little to act on.
 */
function namedPokemon(text: string, finder: WantSpeciesFinder): PokemonTarget | undefined {
  const plainly = (typed: string): PokemonTarget | undefined => {
    const name = typed.replace(EVERY_FORM, '');
    if (searchTokens(name).join('').length <= 1) return undefined;
    const species = finder.species(name);
    if (species) return pokemonTarget(species.dex);
    // `(every form)` after the name of a form names nothing.
    if (name !== typed) return undefined;
    const based = BASE_FORM.test(typed) ? finder.species(typed.replace(BASE_FORM, '')) : undefined;
    return based ? finder.base(based.dex) : finder.exact(typed);
  };
  const rest = SHADOW_OF.exec(text.trim())?.[1];
  const shadowOf = rest === undefined ? undefined : plainly(rest);
  if (shadowOf) return pokemonTarget(shadowOf.dex, shadowOf.form, true);
  return plainly(text.trim());
}

/**
 * What the `target` option of `/want` and `/unwant` names: a choice of the list (a token), or
 * typed text. Typed text is a tier or IV word first (`wantWord`: in full; `shadow 5` is the
 * shadow tier), then a Pokémon it names in full (`namedPokemon`): the name of a species is the
 * want for every form of it, the name of one form or mega is the want for that form, and
 * `shadow` before either is the want for its shadow raids. `raids`, `eggs` or `spawns` after
 * the name say nothing, and neither does a scope as a list writes it (`lugia raids` and
 * `Lugia · raids` are Lugia; the scope is the `type` option's). Anything less is `unknown`, with the targets the text may have meant: the first hit of a search is
 * never acted on.
 *
 * A token is taken as the game data knows it (`WantSpeciesFinder.known`): a form under the key
 * of its entry. With `own` the text is about a want the member has (`/unwant`): a species or a
 * form the game data does not have is taken all the same (its row can be read, so it can be
 * removed), and so is the number a list calls it by, `Pokémon #1234`.
 */
export function readWantText(
  value: string,
  finder: WantSpeciesFinder,
  options: { own?: boolean } = {},
): TypedWant {
  const own = options.own === true;
  const typed = value.trim();
  const token = parseWantToken(typed);
  if (token) {
    if (token.kind !== 'pokemon' || own) return { kind: 'target', target: token };
    const known = finder.known(token);
    return known ? { kind: 'target', target: known } : { kind: 'gone' };
  }
  // A scope after the name, as the lists write it, is read past: the type is an option's.
  const text = typed.replace(SCOPE_AT_END, '');
  const numbered = own ? Number(NUMBERED.exec(text)?.[1]) : Number.NaN;
  if (isPokedexNumber(numbered)) return { kind: 'target', target: pokemonTarget(numbered) };
  const word = wantWord(text);
  if (word) return { kind: 'target', target: word };
  // The text as it stands first, then with one filler word fewer each time: a name may end
  // in such a word itself (a nickname `bad egg`, also in `bad egg raids`).
  const names = withoutFiller(text);
  for (const candidate of names) {
    const named = namedPokemon(candidate, finder);
    if (named) return { kind: 'target', target: named };
  }
  const name = names.at(-1) ?? text;
  const suggested = (looked: string): number[] => {
    const dexes: number[] = [];
    if (searchTokens(looked).join('').length <= 1) return dexes;
    for (const found of finder.search(looked, { limit: WANT_SUGGESTIONS * 4 })) {
      if (!dexes.includes(found.dex)) dexes.push(found.dex);
      if (dexes.length === WANT_SUGGESTIONS) break;
    }
    return dexes;
  };
  const words = wantWordGuesses(text);
  // `shadow` with nothing after it begins the shadow tiers and is the name of no Pokémon:
  // what the search would find for the word is not what was meant.
  if (searchTokens(name).join(' ') === 'shadow') return { kind: 'unknown', words, suggestions: [] };
  // After `shadow`, what the rest may have meant: the search knows no Pokémon by that word.
  const rest = SHADOW_OF.exec(name)?.[1];
  const ofRest = rest === undefined ? [] : suggested(rest);
  return ofRest.length > 0
    ? { kind: 'unknown', words, suggestions: ofRest, shadow: true }
    : { kind: 'unknown', words, suggestions: suggested(name) };
}

/** A row of `PokemonNotification` as far as wants need it. */
export interface WantRow extends StoredNotification {
  id: number;
}

/** A member's wants in a server as the rows say them. */
export interface WantList {
  /** Each target once, in the order of the rows. */
  wants: Want[];
  /** Rows this version cannot read (see `decodeNotification`); they are left alone. */
  unreadable: number;
}

/**
 * A row as the want it means with the game data at hand: as the codec reads it
 * (`readNotification`), with a form under the key of the entry it stands for today, and with
 * the scope `raid` for what can only be about raids (`raidsOnly`: a mega, whatever its row
 * says). Undefined for a row that cannot be read.
 */
export function readWant(row: StoredNotification, reader: FormReader): Want | undefined {
  const want = readNotification(row);
  if (want?.target.kind !== 'pokemon' || want.target.form === undefined) return want;
  const { dex, form, shadow } = want.target;
  const target = pokemonTarget(dex, reader(dex, form).key, shadow === true);
  return {
    target,
    scope: raidsOnly(target, reader) ? 'raid' : want.scope,
    ...(want.costumed ? { costumed: true as const } : {}),
  };
}

/** A target with its form under the key of the entry it stands for today (`reader`). */
function underTodaysKey(target: NotificationTarget, reader: FormReader): NotificationTarget {
  if (target.kind !== 'pokemon' || target.form === undefined) return target;
  const { dex, form, shadow } = target;
  return pokemonTarget(dex, reader(dex, form).key, shadow === true);
}

/**
 * The wants a member's rows mean. Legacy data can hold several rows for one target: they are
 * one want, in every scope any of them has (each row would notify by itself). So are rows
 * whose forms are two keys of one entry (`reader`; without one every form is read as stored).
 */
export function readWants(
  rows: readonly StoredNotification[],
  reader: FormReader = formAsStored,
): WantList {
  const wants: Want[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const want = readWant(row, reader);
    if (!want) {
      unreadable += 1;
      continue;
    }
    const known = wants.find((other) => sameNotificationTarget(other.target, want.target));
    if (!known) {
      wants.push(want);
      continue;
    }
    known.scope = widerScope(known.scope, want.scope);
    // Plain wins, as the wider scope does: a plain row fires for costumed sightings too.
    if (want.costumed !== true) delete known.costumed;
  }
  return { wants, unreadable };
}

/** What came of setting a want. */
export type SetWantOutcome =
  /** There was none for this target. */
  | { kind: 'added'; want: Want }
  /** There was one, in another scope. */
  | { kind: 'changed'; want: Want; before: NotificationScope }
  /** There was one in this very scope. */
  | { kind: 'unchanged'; want: Want };

/** What setting a want does to a member's rows of one server. */
export interface SetWantPlan {
  outcome: SetWantOutcome;
  /** The values of a new row, when the target has none. */
  insert: EncodedNotification | undefined;
  /** The row that is kept for the target and the values it gets, when they differ from its own. */
  update: { id: number; values: EncodedNotification } | undefined;
  /** Further rows for the same target (legacy duplicates), which go. */
  remove: number[];
}

/**
 * Decides what setting a want does, from the member's rows of the server: a target without a
 * row gets one; a target with rows keeps its oldest, which gets the scope asked for, and loses
 * the others. A row is written only when what it means changes: a legacy row that says the same
 * in other letters (`Both`, or `both` for a perfect-IV want, or a mega typed `both`) stays as
 * it is. A row whose form is an older key of the entry is written with the key of today.
 *
 * A `target` whose form is an older key of an entry (a want the member has, named as its row
 * holds it) is the want of that entry; a want that can only be about raids (`raidsOnly`) is
 * stored as `raid` whatever scope is asked for. `costumed` (plan 8R-4) is written as the row's
 * own, a Pokémon's only; a row whose costume differs is rewritten.
 */
export function planSetWant(
  rows: readonly WantRow[],
  asked: NotificationTarget,
  scope: NotificationScope,
  reader: FormReader = formAsStored,
  costumed = false,
): SetWantPlan {
  const target = underTodaysKey(asked, reader);
  const values = encodeNotification(
    target,
    raidsOnly(target, reader) ? 'raid' : scope,
    costumed && target.kind === 'pokemon',
  );
  const want: Want = {
    target,
    scope: values.type,
    ...(values.costumed ? { costumed: true as const } : {}),
  };
  const same = rows
    .filter((row) => {
      const read = readWant(row, reader);
      return read !== undefined && sameNotificationTarget(read.target, target);
    })
    .sort((a, b) => a.id - b.id);
  const [kept, ...others] = same;
  if (!kept) {
    return { outcome: { kind: 'added', want }, insert: values, update: undefined, remove: [] };
  }
  const [had] = readWants(same, reader).wants;
  const before = had?.scope ?? want.scope;
  const keptWant = readWant(kept, reader);
  const keptScope = keptWant?.scope;
  const sameCostume = (keptWant?.costumed === true) === (want.costumed === true);
  // What the row itself says of the form, before the game data is asked: an older key is replaced.
  const keptAs = readNotification(kept)?.target;
  const sameKey = keptAs !== undefined && sameNotificationTarget(keptAs, target);
  return {
    outcome:
      before === want.scope ? { kind: 'unchanged', want } : { kind: 'changed', want, before },
    insert: undefined,
    update:
      keptScope === want.scope && sameKey && sameCostume ? undefined : { id: kept.id, values },
    remove: others.map((row) => row.id),
  };
}

/**
 * The rows that are a want for this target: what removing the want deletes. A target named by
 * an older key of its entry has the rows of that entry, whichever key they hold.
 */
export function rowsOfWant(
  rows: readonly WantRow[],
  target: NotificationTarget,
  reader: FormReader = formAsStored,
): number[] {
  const wanted = underTodaysKey(target, reader);
  return rows
    .filter((row) => {
      const read = readWant(row, reader);
      return read !== undefined && sameNotificationTarget(read.target, wanted);
    })
    .map((row) => row.id);
}

/** A row of `PokemonNotification` with the member it belongs to, as a read by event gives it. */
export interface MemberWantRow extends StoredNotification {
  /** Snowflake of the member. */
  memberId: string;
}

/** The wants of one member that a read by event found. */
export interface MemberWants {
  /** Snowflake of the member. */
  memberId: string;
  /** Each target once (`readWants`); never empty. */
  wants: Want[];
}

/**
 * The rows of several members as the wants they mean, member by member in the order of their
 * first row: what a read by event answers ("who has a row with one of these numbers in this
 * server"). The rows were found by number, and a number alone says little (-6 is a tier and the
 * perfect-IV rows of 2019), so they are read like any others (`readWants`, with the game data);
 * whether a want is for what happened is the matcher's to say. A member none of whose rows can
 * be read is left out.
 */
export function wantsByMember(
  rows: readonly MemberWantRow[],
  reader: FormReader = formAsStored,
): MemberWants[] {
  const byMember = new Map<string, MemberWantRow[]>();
  for (const row of rows) {
    const known = byMember.get(row.memberId);
    if (known) known.push(row);
    else byMember.set(row.memberId, [row]);
  }
  const found: MemberWants[] = [];
  for (const [memberId, own] of byMember) {
    const { wants } = readWants(own, reader);
    if (wants.length > 0) found.push({ memberId, wants });
  }
  return found;
}
