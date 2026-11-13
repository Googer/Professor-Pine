import { z } from 'zod';
import { searchTokens } from '../search/text.js';
import type { FormKind } from './names.js';
import { raidTier, type RaidLevel, type RaidTier } from './raid-tier.js';

/**
 * A boss as a feed lists it: a raid boss of ScrapedDuck's feed (`T` is `RaidTier`), or a max boss
 * of Pokebattler's (`MaxTier`).
 */
export interface FeedBoss<T = RaidTier> {
  /** Game-master species id, e.g. `BLASTOISE`. */
  pokemonId: string;
  /**
   * Game-master form id, e.g. `LANDORUS_INCARNATE`, `BLASTOISE_MEGA` for a mega or
   * `PIKACHU_GLASS_HELMET_2026` for a costume. It is the picture's form when the catalogue has
   * it, or when the catalogue has the picture's species and lacks the form (then the boss stays
   * unresolved, and keeps these ids for when the game master learns the form), or the name's
   * entry when a name decided over a costume picture (`Giratina (Origin)`). It is null when the
   * picture names no form, and for a boss that could not be placed, whose `pokemonId` is then
   * made of its name. `resolveBoss` runs the same decision again on the stored row.
   */
  form: string | null;
  tier: T;
  shiny: boolean;
  /** The feed's English name without `Shadow `. Shown only for a Pokémon the game master does not know. */
  name: string;
  /** Address of the boss's picture, when the feed gives a usable one. */
  image?: string;
  /**
   * When it is a boss from (epoch ms), for one the feed lists before its start (an upcoming max
   * boss, plan 8X-2); stored as `firstSeen` when that is later than the read, and the list in
   * effect leaves it out until then. Undefined: from the read that lists it.
   */
  startsAt?: number;
  /**
   * The moment the feed gives an upcoming boss's start (plan 19A-2: Pokebattler's `startDate`,
   * while it is ahead): `startsAt` is the start of its day in the instance's default zone, and in
   * each server's zone that day's start there (`maxRowsIn`). Stored (`RaidBoss.startsFrom`).
   */
  startsFrom?: number;
}

export interface ParsedFeed<T = RaidTier> {
  bosses: FeedBoss<T>[];
  /**
   * What the feed has that Pine has no raid tier for, as the headings (`Mega Raids`) or, for a
   * shadow name under a level without shadow raids, `Shadow under <heading>`; those bosses were
   * left out.
   */
  unknownLevels: string[];
  /** Entries left out: no usable name or tier, a heading or a shadow name Pine has no tier for. */
  skipped: number;
  /**
   * The feed's ids of bosses the game data does not know (the max boss feed only, which names
   * its bosses by id): they are listed by a name made of the id, without stats.
   */
  unknownIds?: string[];
}

/**
 * What the feed does not say, worked out from the game data. `parseRaidBossFeed` stays free of
 * the catalogue's service; `feedLookup` (feed-lookup.ts) builds this from a catalogue.
 */
export interface FeedLookup {
  /** The game-master species id of a Pokédex number, e.g. `LANDORUS`. */
  speciesId(dex: number): string | undefined;
  /**
   * The ids of the entry an English name stands for (without `Shadow `): by its exact name or a
   * usual respelling of it (`Black Kyurem` / `Kyurem (Black)`); undefined when the name fits no
   * entry or several.
   */
  findByName(name: string): { pokemonId: string; form: string | null } | undefined;
  /** The English name of a species without its form (`Landorus`); undefined when the catalogue lacks it. */
  speciesName(pokemonId: string): string | undefined;
  /**
   * The kind of the entry these ids name (a mega or primal form is `mega`); undefined when the
   * catalogue has no entry with exactly these ids. A costume the game master lists as an alias
   * has the kind of the entry it copies.
   */
  kindOf(pokemonId: string, form: string | null): FormKind | undefined;
  /**
   * The catalogue key of the entry these ids name (a costume alias gives the key of the entry it
   * copies), so that two spellings of one entry can be told from two entries; undefined when the
   * catalogue has no entry with exactly these ids.
   */
  keyOf(pokemonId: string, form: string | null): string | undefined;
}

/** Game-master ids are upper-case words joined with underscores; the columns hold 64 characters. */
const MAX_ID_LENGTH = 64;

/**
 * The feed's English name is stored, logged and shown for a boss the game master does not know, so
 * control and format characters (line breaks, tabs, zero-width and direction-override characters)
 * become spaces and runs of white space one space. Markdown is left for the renderer to escape.
 */
const bossName = z
  .string()
  .transform((name) => cleanText(name))
  .pipe(z.string().min(1).max(100));

/** The feed's name cleaned for storing; undefined when nothing usable is left. */
export function cleanBossName(name: string): string | undefined {
  const cleaned = bossName.safeParse(name);
  return cleaned.success ? cleaned.data : undefined;
}

function cleanText(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A picture address goes into a Discord embed, and Discord refuses a message with an address it
 * does not like. So only a plain one is kept: `https://` in lower case, a dotted DNS name as host
 * (no IP address, `localhost`, user name, password or port), at most 300 characters, and no
 * character outside the ones an address may carry unescaped. Anything else is left out, never a
 * reason to refuse the boss.
 */
const IMAGE_ADDRESS =
  /^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?:[/?#][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*)?$/;

const imageAddress = z
  .string()
  .max(300)
  .regex(IMAGE_ADDRESS)
  .refine((address) => URL.canParse(address));

/** Headings come from outside and are logged, so their number and length are bounded. */
const MAX_UNKNOWN_LEVELS = 10;
const MAX_LEVEL_LENGTH = 40;
const MAX_BOSSES_PER_HEADING = 200;
/** No heading Pine reads is anywhere near this long; a longer one is not looked at. */
const MAX_HEADING_LENGTH = 100;

const MEGA_LEGENDARY: RaidLevel = 'MegaLegendary';
const HEADINGS: Readonly<Record<string, RaidLevel>> = {
  mega: 'Mega',
  'mega legendary': MEGA_LEGENDARY,
  'legendary mega': MEGA_LEGENDARY,
  // A primal raid has the stamina of a mega legendary raid.
  primal: MEGA_LEGENDARY,
  'super mega': 'SuperMega',
  elite: 'Elite',
  // An ultra beast is an ordinary tier 5 boss.
  'ultra beast': 'T5',
};
const STAR_LEVELS: Readonly<Record<string, RaidLevel>> = { '1': 'T1', '3': 'T3', '5': 'T5' };

/**
 * A heading of Leek Duck's page (`5-Star Raids`, `Mega Raids`) as a raid level, without regard to
 * case, extra spaces or a trailing `Raids`; and whether the heading says shadow itself. Undefined
 * when the heading is none Pine knows.
 */
export function readHeading(heading: string): { level: RaidLevel; shadow: boolean } | undefined {
  if (heading.length > MAX_HEADING_LENGTH) return undefined;
  let text = cleanText(heading)
    .toLowerCase()
    // Typographic hyphens and dashes (U+2010 to U+2015, any dash punctuation) and the minus sign.
    .replace(/[\p{Pd}\u{2212}]/gu, '-')
    .replace(/ raids?$|^raids?$/, '');
  const shadow = /(^| )shadow( |$)/.test(text);
  if (shadow) text = text.replace(/(^| )shadow( |$)/, ' ').trim();
  const star = /^(?:tier ([135])|([135])[- ]?star)$/.exec(text);
  const starLevel = star ? STAR_LEVELS[star[1] ?? star[2] ?? ''] : undefined;
  const level = starLevel ?? (Object.hasOwn(HEADINGS, text) ? HEADINGS[text] : undefined);
  return level ? { level, shadow } : undefined;
}

/**
 * The parts of a picture's file name: `pm<dex>.icon.png`, `pm<dex>.f<FORM>.icon.png`, with
 * `.c<COSTUME>`, `.s` and `.g<n>` parts allowed between. Anything else (the older
 * `pokemon_icon_645_11.png`) says nothing usable.
 */
const PICTURE_NAME = /^pm(\d{1,5})((?:\.(?:f[A-Z0-9_]+|c[A-Za-z0-9_]+|s|g\d+))*)\.icon\.png$/;

function pictureFile(image: unknown): string | undefined {
  return typeof image === 'string' ? (image.split(/[?#]/)[0]?.split('/').pop() ?? '') : undefined;
}

function pictureParts(image: unknown): { dex: number; form: string | null } | undefined {
  const file = pictureFile(image);
  const match = file === undefined ? null : PICTURE_NAME.exec(file);
  if (!match) return undefined;
  const form = (match[2] ?? '').split('.').find((part) => /^f[A-Z0-9_]+$/.test(part));
  return { dex: Number(match[1]), form: form ? form.slice(1) : null };
}

/**
 * The older pictures, named by numbers (`pokemon_icon_624_00.png`, ScrapedDuck's community days
 * and events): the Pokédex number, the form's number, and a third number for a costume
 * (`pokemon_icon_025_00_05.png`), `_shiny` last.
 */
const OLD_PICTURE_NAME = /^pokemon_icon_(\d{3,4})_(\d{2})(?:_(\d{2}))?(?:_shiny)?\.png$/;

/**
 * Whether a picture's file name says a costume by its own part: `.c<COSTUME>`
 * (`pm393.cHALLOWEEN_2021_NOEVOLVE.icon.png`), or the third number of an older picture. A form
 * part that is a costume is the game data's to say (`isCostumed`).
 */
export function pictureSaysCostume(image: unknown): boolean {
  const file = pictureFile(image);
  if (file === undefined) return false;
  const match = PICTURE_NAME.exec(file);
  if (match) return (match[2] ?? '').split('.').some((part) => /^c[A-Za-z0-9_]+$/.test(part));
  return OLD_PICTURE_NAME.exec(file)?.[3] !== undefined;
}

/**
 * The Pokémon of a name that says what it wears, as Leek Duck names a costume the game data may
 * not have yet ("Zubat wearing a top hat" is Zubat); undefined for any other name.
 */
export function wornBy(name: string): string | undefined {
  const match = /^(.*\S)\s+wearing\s+\S.*$/i.exec(name);
  return match?.[1];
}

/** Form-changing kinds: a form part with one of these tokens is a form of its own. */
const FORM_CHANGING_TOKENS: ReadonlySet<string> = new Set(['MEGA', 'PRIMAL']);

/** The adjectives that put a region in a name, and the tokens a form part spells that region with. */
const REGIONS: Readonly<Record<string, readonly string[]>> = {
  alolan: ['ALOLA', 'ALOLAN'],
  galarian: ['GALAR', 'GALARIAN'],
  hisuian: ['HISUI', 'HISUIAN'],
  paldean: ['PALDEA', 'PALDEAN'],
};
const REGION_TOKENS: ReadonlySet<string> = new Set(Object.values(REGIONS).flat());

/**
 * The underscore-separated tokens of a form id without the species in front of it
 * (`PIKACHU_GLASS_HELMET_2026` gives `GLASS`, `HELMET`, `2026`).
 */
export function formTokens(pokemonId: string, form: string): string[] {
  const prefix = `${pokemonId}_`;
  return (form.startsWith(prefix) ? form.slice(prefix.length) : form).split('_');
}

/** The tokens a form part spells the region of a name with (`Alolan Raichu`); undefined if the name has none. */
export function regionOfName(name: string): readonly string[] | undefined {
  const word = /(?:^|[^a-z])(alolan|galarian|hisuian|paldean)(?![a-z])/i.exec(name)?.[1];
  return word ? REGIONS[word.toLowerCase()] : undefined;
}

/** What a form part says that gives a form stats of its own: mega, primal, a region (`ALOLAN` as `ALOLA`). */
function ownStatsKinds(tokens: readonly string[]): Set<string> {
  const kinds = new Set<string>();
  for (const token of tokens) {
    if (FORM_CHANGING_TOKENS.has(token)) kinds.add(token);
    const region = Object.entries(REGIONS).find(([, spellings]) => spellings.includes(token));
    if (region) kinds.add(region[0]);
  }
  return kinds;
}

/** Whether the form part of a form id says mega, primal or a region. */
export function isOwnStatsForm(tokens: readonly string[]): boolean {
  return tokens.some((token) => FORM_CHANGING_TOKENS.has(token) || REGION_TOKENS.has(token));
}

/** Whether the words of `species` stand in `name` as whole words, in order. */
function containsWords(name: string, species: string): boolean {
  const words = searchTokens(species).join(' ');
  return words !== '' && ` ${searchTokens(name).join(' ')} `.includes(` ${words} `);
}

/**
 * Whether a form id the game master does not have is a costume (a Pikachu in a new hat), which has
 * the stats of its species, rather than a form of its own. It is judged from the boss's ids and
 * name alone, so that it works for a boss read back from the table. All of this must hold: the
 * form part carries a digit (costumes carry a year or a number: `GLASS_HELMET_2026`, `FLYING_02`;
 * no form with stats of its own does: `MEGA_Z`, `X`, `TEN_PERCENT`, `POMPOM`, `FEMALE`, `DMAX`);
 * no token of it is `MEGA`, `PRIMAL` or a region; the name has no parenthesis and no regional
 * adjective (a costume of Galarian Corsola has Galarian Corsola's stats, not Corsola's); and the
 * name contains the species' own name (`species`, e.g. `Pikachu`) as whole words. When in doubt the
 * answer is no, so the boss is listed by name and nobody is shown the stats of the wrong Pokémon.
 * Call it only for a form the game master does not have.
 */
export function isCostumeForm(
  boss: { pokemonId: string; form: string; name: string },
  species: string,
): boolean {
  const tokens = formTokens(boss.pokemonId, boss.form);
  if (isOwnStatsForm(tokens) || regionOfName(boss.name) || /[()]/.test(boss.name)) return false;
  return tokens.some((token) => /\d/.test(token)) && containsWords(boss.name, species);
}

/** An id made of a name: upper case, non-alphanumerics as `_`, starting with a letter. */
function idFromName(name: string): string | undefined {
  const id = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+/, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/_+$/, '');
  return id === '' ? undefined : id;
}

function formatError(message: string): Error {
  return new Error(`The raid boss feed is not in the expected format: ${message}`);
}

export interface ReadEntry {
  heading: string;
  name: string;
  shiny: boolean;
  image: unknown;
}

export function readEntry(value: unknown): ReadEntry | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entry = value as Record<string, unknown>;
  const { name, tier } = entry;
  if (typeof name !== 'string' || typeof tier !== 'string') return undefined;
  return { heading: tier, name, shiny: entry['canBeShiny'] === true, image: entry['image'] };
}

/** Raid levels of the mega kind, whose bosses are a mega or primal form. */
const MEGA_LEVELS: ReadonlySet<RaidLevel> = new Set(['Mega', 'MegaLegendary', 'SuperMega']);

export function isMegaLevel(level: RaidLevel): boolean {
  return MEGA_LEVELS.has(level);
}

/**
 * Splits a cleaned name into the boss's name and whether a `Shadow ` in front of it makes it a
 * shadow boss. The Shadow belongs to the name (and the boss is no shadow boss) when the whole name,
 * prefix included, is found by the lookup (`Shadow Rider Calyrex` is `Calyrex (Shadow Rider)`), or
 * when the picture's form part is `SHADOW_<something>` and those ids are an entry of the catalogue.
 * A form part that merely starts with SHADOW (`SHADOW`, `SHADOW_2030`) changes nothing.
 */
export function splitShadow(
  name: string,
  image: unknown,
  lookup: FeedLookup,
): { name: string; shadow: boolean } {
  const prefixed = /^shadow +(.+)$/i.exec(name);
  if (!prefixed?.[1]) return { name, shadow: false };
  const shadowForm = pictureParts(image)?.form?.startsWith('SHADOW_') === true;
  const ids = shadowForm ? pictureIds(image, lookup) : undefined;
  const ownName =
    lookup.findByName(name) !== undefined ||
    (ids?.form != null && lookup.kindOf(ids.pokemonId, ids.form) !== undefined);
  return ownName ? { name, shadow: false } : { name: prefixed[1], shadow: true };
}

/** The ids that name a boss. */
export interface Ids {
  pokemonId: string;
  form: string | null;
}

export interface BossIdentity extends Ids {
  /**
   * `picture` when the ids are the picture's (a form the catalogue knows, a costume of the plain
   * species, or the plain species the name confirms), `name` when the name's entry decided, and
   * `nothing` when the boss could not be placed and the ids are made of its name.
   */
  via: 'picture' | 'name' | 'nothing';
  /** The catalogue ids the boss stands for; undefined when it stays unresolved. */
  resolved: Ids | undefined;
}

/**
 * What a picture's file name says: the species (from the Pokédex number) and the form id, as the
 * game master spells it. A form part that already starts with the species (`UNOWN_U` for Unown)
 * is the form id as it stands. Undefined when the file name says nothing usable, the number is
 * unknown, or an id would not fit the 64 characters of the columns.
 */
export function pictureIds(image: unknown, lookup: FeedLookup): Ids | undefined {
  const picture = pictureParts(image);
  const species = picture ? lookup.speciesId(picture.dex) : undefined;
  if (!picture || !species || species.length > MAX_ID_LENGTH) return undefined;
  if (picture.form === null || picture.form === 'NORMAL') return { pokemonId: species, form: null };
  const form = picture.form.startsWith(`${species}_`) ? picture.form : `${species}_${picture.form}`;
  return form.length > MAX_ID_LENGTH ? undefined : { pokemonId: species, form };
}

/** Whether two names are one text without regard to case, spaces and punctuation. */
function sameName(a: string, b: string): boolean {
  return searchTokens(a).join('') === searchTokens(b).join('');
}

type Placed = Omit<BossIdentity, 'resolved'> & { resolved: Ids };

function placed(ids: Ids, via: Placed['via'], resolved: Ids = ids): Placed {
  return { pokemonId: ids.pokemonId, form: ids.form, via, resolved };
}

/** What a picture and a name together say, before the kind of raid is looked at. */
function agree(name: string, picture: Ids, lookup: FeedLookup): Placed | undefined {
  const species = lookup.speciesName(picture.pokemonId);
  if (species === undefined) return undefined;
  const named = lookup.findByName(name);
  if (named && named.pokemonId !== picture.pokemonId) return undefined;
  if (picture.form === null) {
    if (named) return placed(named, named.form === null ? 'picture' : 'name');
    return sameName(name, species) ? placed(picture, 'picture') : undefined;
  }
  if (lookup.kindOf(picture.pokemonId, picture.form) !== undefined) {
    // A name that names another form of the species than the picture does contradicts it. The
    // plain species says nothing about a form (`Landorus` with the picture of the Therian Forme).
    const plain =
      named !== undefined &&
      lookup.kindOf(named.pokemonId, named.form) === 'species' &&
      (sameName(name, species) || sameName(name, `${species} (Normal)`));
    if (
      named &&
      !plain &&
      lookup.keyOf(named.pokemonId, named.form) !== lookup.keyOf(picture.pokemonId, picture.form)
    ) {
      return undefined;
    }
    return placed(picture, 'picture');
  }
  // The plain species a name stands for says nothing about a form the catalogue lacks (`Mewtwo`
  // with the picture of a form of its own): that is judged as a costume or not at all.
  if (named && lookup.kindOf(named.pokemonId, named.form) !== 'species') {
    // What the form part says (a mega, a region) must be what the name's entry is.
    const said = ownStatsKinds(formTokens(picture.pokemonId, picture.form));
    const is = ownStatsKinds(named.form ? formTokens(named.pokemonId, named.form) : []);
    return [...said].every((kind) => is.has(kind)) ? placed(named, 'name') : undefined;
  }
  const costume = isCostumeForm(
    { pokemonId: picture.pokemonId, form: picture.form, name },
    species,
  );
  return costume
    ? placed(picture, 'picture', { pokemonId: picture.pokemonId, form: null })
    : undefined;
}

/** Put behind an id made of a name that the catalogue has an entry for, but the boss is not. */
const UNMATCHED = '_UNMATCHED';

/**
 * The one decision of which Pokémon a raid boss is, used by the parser (from the feed's name and
 * picture) and by `resolveBoss` (from a stored row's ids and name). A boss gets a catalogue entry
 * only when what the picture says and what the name says do not contradict each other; otherwise
 * it stays unresolved, listed by the feed's name without stats. Unresolved is always acceptable;
 * the wrong Pokémon never is.
 *
 * What the name says is `lookup.findByName(name)`. What the picture says is `picture`: the species
 * and the form id (undefined when the picture is unusable).
 * - The picture's ids are an entry of the catalogue with a form (a known form, a mega, a costume
 *   the game master knows): that entry, unless the name finds an entry of another species or of
 *   another form of this one (the plain species named as such says nothing about a form).
 * - The picture gives a species and no form: the name's entry when the name finds one of the same
 *   species; when the name finds nothing, the plain species only if the name IS the species (an
 *   adjective, a parenthesis or more words make it unresolved); another species' entry: unresolved.
 * - The picture gives a form the catalogue does not know: the name's entry when it finds one of the
 *   same species that is not the plain species (a costume of Galarian Corsola is Galarian Corsola,
 *   one of Giratina (Origin) is Origin Forme); otherwise a costume of the plain species only under
 *   the conditions of `isCostumeForm`; otherwise unresolved.
 * - No usable picture: the name's entry, or unresolved.
 * - In a raid of the mega kind (`mega`) an entry that is not a mega or primal form is not accepted.
 *
 * Unresolved gives the picture's own ids when the picture names a species the catalogue has and a
 * form it lacks, and the name does not find another species (the same entry then keeps its ids when
 * the game master learns the form, and is unresolved again when read back for as long as it does
 * not); otherwise an id made of the name (with `_UNMATCHED` behind it if a catalogue entry has
 * that id), which resolves to nothing when read back. Undefined when the name has no letter to
 * make an id of. `via` is for the check script.
 */
export function matchBoss(
  name: string,
  picture: Ids | undefined,
  lookup: FeedLookup,
  options: { mega?: boolean } = {},
): BossIdentity | undefined {
  // A costume known by name only ("Zubat wearing a top hat", plan 8R-4) is placed as the
  // Pokémon that wears it; the id made of a name below keeps the whole name.
  const placedName = wornBy(name) ?? name;
  const named = picture ? undefined : lookup.findByName(placedName);
  const found = picture ? agree(placedName, picture, lookup) : named && placed(named, 'name');
  if (found) {
    const { resolved } = found;
    if (!options.mega || lookup.kindOf(resolved.pokemonId, resolved.form) === 'mega') return found;
  }
  if (idFromName(name) === undefined) return undefined;
  // The picture names a species the catalogue has and a form it lacks, and the boss is not
  // placed: the picture's ids are kept, so that the same feed entry has the same ids when the
  // game master learns the form later (and a moderator's override that names them still finds
  // it). Read back, they are unresolved again for as long as the form is missing. A name that
  // finds an entry of another species contradicts the picture and is not kept apart from it.
  if (
    picture?.form != null &&
    lookup.speciesName(picture.pokemonId) !== undefined &&
    lookup.kindOf(picture.pokemonId, picture.form) === undefined
  ) {
    const other = lookup.findByName(placedName);
    if (!other || other.pokemonId === picture.pokemonId) {
      return {
        pokemonId: picture.pokemonId,
        form: picture.form,
        via: 'nothing',
        resolved: undefined,
      };
    }
  }
  return nameIdentity(name, lookup);
}

/**
 * Whether a name has every word of the form part of these ids (`PIKACHU_COSPLAY`: `cosplay`,
 * the species' prefix left out), as `Pikachu (Cosplay Forme)` has.
 */
function namesFormPart(name: string, ids: Ids): boolean {
  const prefix = `${ids.pokemonId}_`;
  if (ids.form === null || !ids.form.startsWith(prefix)) return false;
  const words = searchTokens(ids.form.slice(prefix.length).replaceAll('_', ' '));
  const own = new Set(searchTokens(name));
  return words.length > 0 && words.every((word) => own.has(word));
}

/**
 * The ids of a boss that is not placed, made of its name (with `_UNMATCHED` behind them if a
 * catalogue entry has that id); undefined when the name has no letter to make an id of.
 */
function nameIdentity(name: string, lookup: FeedLookup): BossIdentity | undefined {
  const id = idFromName(name);
  if (id === undefined) return undefined;
  const unique =
    lookup.kindOf(id, null) === undefined
      ? id
      : `${id.slice(0, MAX_ID_LENGTH - UNMATCHED.length)}${UNMATCHED}`;
  return { pokemonId: unique, form: null, via: 'nothing', resolved: undefined };
}

/** `matchBoss` for a boss read from the feed: the picture's file name gives the picture's ids. */
export function identifyBoss(
  name: string,
  image: unknown,
  lookup: FeedLookup,
  options: { mega?: boolean } = {},
): BossIdentity | undefined {
  return matchBoss(name, pictureIds(image, lookup), lookup, options);
}

/**
 * How a boss was identified, as `npm run raid-bosses:check` and `/operator boss list` say it:
 * `agree` (picture and name name one entry), `new-form` (the picture shows a form of the named
 * species that the game data does not know yet), `disagree` (they name different entries; `used`
 * says what `matchBoss` made of it), `picture` or `name` (only that one names anything), or
 * `neither` (the ids are made of the name).
 */
export type Identification = 'agree' | 'new-form' | 'disagree' | 'picture' | 'name' | 'neither';

/** `identifyBoss`, and which of the two witnesses spoke (`Identification`). */
export function howIdentified(
  name: string,
  image: unknown,
  lookup: FeedLookup,
  options: { mega?: boolean } = {},
): { how: Identification; used: BossIdentity | undefined } {
  const picture = pictureIds(image, lookup);
  const named = lookup.findByName(name);
  const used = identifyBoss(name, image, lookup, options);
  const key = (ids: Ids): string =>
    lookup.keyOf(ids.pokemonId, ids.form) ?? `? ${ids.form ?? ids.pokemonId}`;
  if (picture && named) {
    if (key(picture) === key(named)) return { how: 'agree', used };
    const newForm =
      picture.form !== null &&
      lookup.kindOf(picture.pokemonId, picture.form) === undefined &&
      named.pokemonId === picture.pokemonId;
    return { how: newForm ? 'new-form' : 'disagree', used };
  }
  return { how: picture ? 'picture' : named ? 'name' : 'neither', used };
}

/**
 * Reads the raid boss feed (`raids.json` of ScrapedDuck, Leek Duck's raid boss page as data).
 * Throws when the document does not have the expected shape or lists no boss Pine understands, so
 * a broken feed never replaces a good list. A boss listed twice in one tier is kept once, and is
 * shiny if either entry says so.
 *
 * The feed names no game-master ids, so `lookup` works them out with `matchBoss`, from the Pokédex
 * number and the form part of the picture's file name together with the display name; a boss is
 * placed only when they do not contradict each other. What is stored: the ids of the entry the
 * boss is placed as (the picture's when the catalogue has the form or the boss is a costume of the
 * plain species, the name's when it decided); for a boss that is not placed, the picture's ids when
 * the catalogue has its species and lacks its form (so the same feed entry has the same ids once
 * the game master knows the form), otherwise an id made of the name. Two such bosses of one tier
 * whose names differ but whose pictures give the same ids are kept apart: the one the picture's
 * form part names keeps its ids, the others get ids made of their names.
 *
 * `Shadow ` in front of a name makes the boss a shadow boss, unless the Shadow belongs to the
 * name (`Shadow Rider Calyrex`: the whole name is one the lookup finds, or the picture's form part
 * is `SHADOW_<something>` and those ids are an entry of the catalogue).
 */
export function parseRaidBossFeed(raw: unknown, lookup: FeedLookup): ParsedFeed {
  if (!Array.isArray(raw)) throw formatError('the document is not a list');
  const entries = (raw as unknown[]).flatMap((value) => readEntry(value) ?? []);
  if (entries.length === 0) throw formatError('no entry has a name and a tier');

  const perHeading = new Map<string, number>();
  const bosses: FeedBoss[] = [];
  const unknownLevels: string[] = [];
  const seen = new Map<string, FeedBoss>();
  const found: { entry: ReadEntry; name: string; tier: RaidTier; ids: BossIdentity }[] = [];
  let skipped = (raw as unknown[]).length - entries.length;
  const unknown = (label: string): void => {
    const cut = cleanText(label).slice(0, MAX_LEVEL_LENGTH);
    if (unknownLevels.length < MAX_UNKNOWN_LEVELS && !unknownLevels.includes(cut)) {
      unknownLevels.push(cut);
    }
  };
  const headings = entries.map((entry) => readHeading(entry.heading));
  // Only a heading Pine reads is limited, counted per level and shadow flag whatever the spelling
  // of the heading: the count of a heading it does not know is reported.
  for (const heading of headings) {
    if (!heading) continue;
    const slot = `${heading.level}|${String(heading.shadow)}`;
    const count = (perHeading.get(slot) ?? 0) + 1;
    if (count > MAX_BOSSES_PER_HEADING) {
      throw formatError(`more than ${MAX_BOSSES_PER_HEADING} bosses under one heading`);
    }
    perHeading.set(slot, count);
  }
  for (const [index, entry] of entries.entries()) {
    const heading = headings[index];
    const cleaned = cleanBossName(entry.name);
    if (cleaned === undefined) {
      skipped += 1;
      continue;
    }
    const { name, shadow: shadowName } = splitShadow(cleaned, entry.image, lookup);
    const tier = heading ? raidTier(heading.level, heading.shadow || shadowName) : undefined;
    if (!heading || !tier) {
      skipped += 1;
      unknown(heading && !heading.shadow ? `Shadow under ${entry.heading}` : entry.heading);
      continue;
    }
    const ids = identifyBoss(name, entry.image, lookup, { mega: isMegaLevel(heading.level) });
    if (!ids) {
      skipped += 1;
      continue;
    }
    found.push({ entry, name, tier, ids });
  }
  // Two bosses that share a picture of an unknown form are two (an unresolved boss has its
  // picture's ids). Of the names of a tier under one such picture, the one the picture's form part
  // names keeps the picture's ids, so that its id stays when another joins or leaves the feed; the
  // others, or all of them when the form part names none or several, get ids made of their names.
  const keyOf = (ids: Ids, tier: RaidTier) =>
    `${ids.pokemonId}|${ids.form ?? ''}|${tier.level}|${String(tier.shadow)}`;
  const namesOf = new Map<string, Set<string>>();
  for (const { name, tier, ids } of found) {
    if (ids.resolved !== undefined || ids.form === null) continue;
    const key = keyOf(ids, tier);
    namesOf.set(key, (namesOf.get(key) ?? new Set()).add(name));
  }
  const keeps = (ids: BossIdentity, name: string, names: ReadonlySet<string>): boolean => {
    const named = [...names].filter((each) => namesFormPart(each, ids));
    return named.length === 1 && named[0] === name;
  };
  for (const { entry, name, tier, ids: given } of found) {
    const names = namesOf.get(keyOf(given, tier));
    const shared =
      given.resolved === undefined &&
      names !== undefined &&
      names.size > 1 &&
      !keeps(given, name, names);
    const ids = shared ? (nameIdentity(name, lookup) ?? given) : given;
    const identity = keyOf(ids, tier);
    const image = imageAddress.safeParse(entry.image);
    const earlier = seen.get(identity);
    if (earlier) {
      earlier.shiny ||= entry.shiny;
      if (earlier.image === undefined && image.success) earlier.image = image.data;
      continue;
    }
    const boss: FeedBoss = {
      pokemonId: ids.pokemonId,
      form: ids.form,
      tier: { ...tier },
      shiny: entry.shiny,
      name,
      ...(image.success ? { image: image.data } : {}),
    };
    seen.set(identity, boss);
    bosses.push(boss);
  }
  if (bosses.length === 0) throw new Error('The raid boss feed lists no bosses');
  return { bosses, unknownLevels, skipped };
}
