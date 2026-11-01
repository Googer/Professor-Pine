import type { PokemonCatalogue } from './catalogue.js';
import { bossIdsOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import type { MaxTier } from './max-tier.js';
import { formTokens } from './raid-boss-feed.js';

/**
 * Where the game's icons of Pokémon are served from: Leek Duck's CDN, under the game's own file
 * names. The pictures of the raid boss feed are addresses of the same kind, so what
 * `pictureIds` (raid-boss-feed.ts) reads from a feed picture is what `iconCandidates` writes.
 */
export const POKEMON_ICON_BASE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';

/**
 * Where the portraits of megas are served from: PokeMiners' `Images/Mega Portraits 512x512`
 * (the space encoded). A mega whose icon the icon list lacks shows its portrait (2026-10-23: 13
 * of 61 megas, the newest; Leek Duck's own icon of Mega Malamar is a poor render).
 */
export const MEGA_PORTRAIT_BASE =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Mega%20Portraits%20512x512/';

/**
 * An icon file as this module uses it: `pm<dex>.icon.png` or `pm<dex>.f<FORM>.icon.png`. The
 * files with more parts (`.c<COSTUME>`, `.s` for shiny, `.g<n>` for a gender) show something a
 * catalogue entry does not say, and are left out.
 */
const ICON_NAME = /^pm(\d{1,5})(?:\.f([A-Z0-9_]+))?\.icon\.png$/;

/** A mega's portrait: `pm<dex>.f<FORM>.portrait.png`, never a shiny one (`.s`). */
const PORTRAIT_NAME = /^pm(\d{1,5})\.f([A-Z0-9_]+)\.portrait\.png$/;

/** Whether a name is one `PokemonIcons` keeps: an icon or a mega's portrait. */
const isKept = (name: string): boolean => ICON_NAME.test(name) || PORTRAIT_NAME.test(name);

/** As many names as a listing may give; the game had some 3,500 files in 2026. */
const MAX_ICONS = 50_000;

/**
 * The icon names in a listing of the game's picture files: GitHub's answer for the tree of
 * PokeMiners' `pogo_assets`, `Images/Pokemon/Addressable Assets` (`{ tree: [{ path }] }`).
 * Only the names this module can use are kept, each once, sorted. Throws when the document is
 * no such listing or names no icon, so that a broken download never replaces a good list.
 */
export function iconNamesOf(listing: unknown): string[] {
  const names = namesOf(listing, ICON_NAME, 'icon');
  if (names.length === 0) throw new Error('The icon listing names no icon of a Pokémon');
  return names;
}

/**
 * The portrait names in a listing of PokeMiners' `Images/Mega Portraits 512x512`, as
 * `iconNamesOf` reads the icons'; throws when it is no listing or names no portrait.
 */
export function portraitNamesOf(listing: unknown): string[] {
  const names = namesOf(listing, PORTRAIT_NAME, 'portrait');
  if (names.length === 0) throw new Error('The portrait listing names no portrait of a mega');
  return names;
}

/** The names of a GitHub tree listing that match, each once, sorted. */
function namesOf(listing: unknown, pattern: RegExp, what: string): string[] {
  const tree =
    typeof listing === 'object' && listing !== null
      ? (listing as { tree?: unknown }).tree
      : undefined;
  if (!Array.isArray(tree)) throw new Error(`The ${what} listing is not a tree of files`);
  const names = new Set<string>();
  for (const file of tree as unknown[]) {
    const name =
      typeof file === 'object' && file !== null ? (file as { path?: unknown }).path : undefined;
    if (typeof name === 'string' && pattern.test(name)) names.add(name);
    if (names.size >= MAX_ICONS) break;
  }
  return [...names].sort();
}

/** Whether GitHub cut the listing short (`truncated`): icons may be missing from it then. */
export function isTruncatedListing(listing: unknown): boolean {
  return (
    typeof listing === 'object' &&
    listing !== null &&
    (listing as { truncated?: unknown }).truncated === true
  );
}

/** The icon files that exist, and the megas' portraits, by name. */
export class PokemonIcons {
  private readonly all: Set<string>;

  /**
   * `names` are icon names as `iconNamesOf` gives them and portrait names as `portraitNamesOf`
   * gives them; anything else is ignored.
   */
  constructor(names: Iterable<string>) {
    this.all = new Set([...names].filter(isKept).sort());
  }

  /** The icons alone: what a failed listing of portraits keeps, and the reverse below. */
  iconsOnly(): PokemonIcons {
    return new PokemonIcons([...this.all].filter((name) => ICON_NAME.test(name)));
  }

  /** The portraits alone. */
  portraits(): PokemonIcons {
    return new PokemonIcons([...this.all].filter((name) => PORTRAIT_NAME.test(name)));
  }

  get size(): number {
    return this.all.size;
  }

  has(name: string): boolean {
    return this.all.has(name);
  }

  /** Every name, sorted: what is saved between runs. */
  names(): string[] {
    return [...this.all];
  }

  /** A list with the names of both: what is kept when a newer listing was cut short. */
  with(other: PokemonIcons): PokemonIcons {
    return new PokemonIcons([...this.all, ...other.all]);
  }
}

/**
 * What the picture of a Pokémon is looked up in: the icon files that exist (none while no list
 * could be downloaded) and the catalogue, for the other entries of a species. The game data
 * (`GameDataProvider`) is one.
 */
export interface PictureSource {
  catalogue: Pick<PokemonCatalogue, 'byDex'>;
  icons?: PokemonIcons | undefined;
}

/**
 * The file names under which the icon of a catalogue entry may exist, the likeliest first: the
 * inverse of how a feed picture is read (`pictureIds`). The form part of a file is the form id
 * without its species (`pm19.fALOLA`, `pm487.fORIGIN`, `pm6.fMEGA_X` for the ids
 * `RATTATA_ALOLA`, `GIRATINA_ORIGIN`, `CHARIZARD_MEGA_X`), for some species the whole form id
 * (`pm201.fUNOWN_F`). An entry without a form, or with the form `NORMAL`, has the file without
 * a form part (`pm147.icon.png`), and where the species has other forms sometimes one named
 * `NORMAL` (`pm646.fNORMAL` is Kyurem), which the feed's reader takes for no form as well.
 * Which of them exists cannot be told from the game master: `iconName` asks the list of files.
 */
export function iconCandidates(entry: PokemonEntry): string[] {
  const { pokemonId, form } = bossIdsOf(entry);
  const named = (part: string): string => `pm${String(entry.dex)}.f${part}.icon.png`;
  const plain = [`pm${String(entry.dex)}.icon.png`, named('NORMAL')];
  if (form === null) return plain;
  const suffix = formTokens(pokemonId, form).join('_');
  if (suffix === 'NORMAL' || suffix === '') return plain;
  return suffix === form ? [named(form)] : [named(suffix), named(form)];
}

/**
 * The form that shows a whole species whose files exist per form only, by Pokédex number, where
 * the first form of the catalogue (they are in the order of their keys) is not the ordinary
 * one: the catalogue key of the form to try first.
 */
const PREFERRED_FORM: Readonly<Record<number, string>> = {
  // Before `furfrou_dandy`: the untrimmed one.
  676: 'furfrou_natural',
  // Before `zygarde_complete`: the 50% form is the one that is met.
  718: 'zygarde_fifty_percent',
  // Before `dudunsparce_three`.
  982: 'dudunsparce_two',
  // Before `poltchageist_artisan` and `sinistcha_masterpiece`: the common ones.
  1012: 'poltchageist_counterfeit',
  1013: 'sinistcha_unremarkable',
  // Before `basculin_blue_striped`.
  550: 'basculin_red_striped',
  // Before `deerling_autumn` and `sawsbuck_autumn`: the seasons begin with spring.
  585: 'deerling_spring',
  586: 'sawsbuck_spring',
  // Before `flabebe_blue`, `floette_blue` and `florges_blue`.
  669: 'flabebe_red',
  670: 'floette_red',
  671: 'florges_red',
  // Before `urshifu_rapid_strike`.
  892: 'urshifu_single_strike',
  // Before `vivillon_archipelago`.
  666: 'vivillon_meadow',
};

/**
 * Forms that are never shown by the plain file of their species although they are entries of
 * kind `form`: like a mega, another Pokémon to look at. Ultra Necrozma is a transformation of
 * Necrozma's fused forms, and the plain file shows the Necrozma it is not.
 */
const NEVER_BY_SPECIES: ReadonlySet<string> = new Set(['necrozma_ultra']);

/** A file that shows a mega, a primal or a Gigantamax Pokémon: never the picture of a species. */
const TRANSFORMED = /\.f(?:[A-Z0-9_]+_)?(?:MEGA(?:_[A-Z])?|PRIMAL|GIGANTAMAX)\.icon\.png$/;

/** The file of the entry itself: the first of its candidates that exists. */
function ownIcon(entry: PokemonEntry, icons: PokemonIcons): string | undefined {
  return iconCandidates(entry).find((name) => icons.has(name));
}

/**
 * The icon file of a catalogue entry: the first of its candidates that exists, or else
 *
 * - for an entry of kind `form` without a file of its own, the plain file of its species when
 *   that exists: such forms only change the look (Scatterbug's patterns), and every spawn
 *   report should have its picture (Matt, 2026-10-13). Only for that kind: never for a mega
 *   or a regional form, never for a species that is known by a form (Eiscue's Ice Face), and
 *   never for a form that is another Pokémon to look at (`NEVER_BY_SPECIES`);
 * - for an entry that stands for a whole species whose files exist per form only (Unown has no
 *   `pm201.icon.png`), the file of one of its forms: the preferred one (`PREFERRED_FORM`),
 *   else the first in catalogue order that has a file (`pm201.fUNOWN_A.icon.png`). Only the
 *   catalogue's entries of kind `form` are asked, so never a mega, a primal or a Gigantamax.
 *   Not for a species that is known by a form: it is that form, and no other shows it.
 *
 * Undefined when no file fits: a species or a mega that is not released yet, a form of a
 * species that has no plain file.
 */
export function iconName(
  entry: PokemonEntry,
  icons: PokemonIcons,
  catalogue: Pick<PokemonCatalogue, 'byDex'>,
): string | undefined {
  const found = ownIcon(entry, icons);
  if (found !== undefined) return found;
  if (entry.kind === 'mega' || entry.tempEvolution !== null) return undefined;
  if (entry.kind === 'form') {
    return NEVER_BY_SPECIES.has(entry.key) ? undefined : ownIcon({ ...entry, form: null }, icons);
  }
  if (entry.kind !== 'species' || bossIdsOf(entry).form !== null) return undefined;
  const forms = catalogue.byDex(entry.dex).filter((one) => one.kind === 'form');
  const preferred = PREFERRED_FORM[entry.dex];
  const first = forms.find((one) => one.key === preferred);
  for (const form of first ? [first, ...forms] : forms) {
    const file = ownIcon(form, icons);
    if (file !== undefined && !TRANSFORMED.test(file)) return file;
  }
  return undefined;
}

/**
 * The address of the icon of a catalogue entry; undefined when the list of files has none for
 * it, or there is no list (it could not be downloaded yet). Nothing is asked of the network: a
 * file the list names is taken to be served.
 */
export function iconAddress(
  entry: PokemonEntry,
  source: PictureSource | undefined,
): string | undefined {
  const icons = source?.icons;
  if (!icons) return undefined;
  const name = iconName(entry, icons, source.catalogue);
  if (name !== undefined) return `${POKEMON_ICON_BASE}${name}`;
  if (entry.kind !== 'mega') return undefined;
  // A mega the icon list lacks: its portrait, under the name of its icon (`pm687.fMEGA`).
  const portrait = iconCandidates(entry)
    .map((icon) => icon.replace(/\.icon\.png$/, '.portrait.png'))
    .find((candidate) => icons.has(candidate));
  return portrait === undefined ? undefined : `${MEGA_PORTRAIT_BASE}${portrait}`;
}

/**
 * The picture of a max battle's boss (plan 8X-2; Pokebattler's feed has no pictures): for a
 * Gigantamax boss the game's Gigantamax file of its form (`pm849.fAMPED_GIGANTAMAX`), else of its
 * species (`pm68.fGIGANTAMAX`), else its own picture as `iconAddress` finds it (Eternatus,
 * which has none); for a Dynamax boss always its own picture, as a raid boss's.
 */
export function maxBossPicture(
  entry: PokemonEntry | undefined,
  tier: MaxTier,
  source: PictureSource | undefined,
): string | undefined {
  if (!entry || !source?.icons) return undefined;
  if (tier === 'G') {
    const { pokemonId, form } = bossIdsOf(entry);
    const suffix = form === null ? '' : formTokens(pokemonId, form).join('_');
    const dex = String(entry.dex);
    const files = [
      ...(suffix === '' || suffix === 'NORMAL' ? [] : [`pm${dex}.f${suffix}_GIGANTAMAX.icon.png`]),
      `pm${dex}.fGIGANTAMAX.icon.png`,
    ];
    const found = files.find((name) => source.icons?.has(name));
    if (found !== undefined) return `${POKEMON_ICON_BASE}${found}`;
  }
  return iconAddress(entry, source);
}

/**
 * The picture of a Pokémon wherever one is shown (the post of a raid or train, a spawn
 * report): the one place that decides. The raid boss feed's picture wins when there is one: it
 * shows the costume the boss wears just now. Otherwise the icon of its catalogue entry (a boss
 * a moderator added by override, a train's boss that is no raid boss now, any wild Pokémon),
 * and nothing for a Pokémon the game data does not know or that has no icon.
 */
export function pokemonPicture(
  feedImage: string | undefined,
  entry: PokemonEntry | undefined,
  source: PictureSource | undefined,
): string | undefined {
  return feedImage ?? (entry && iconAddress(entry, source));
}
