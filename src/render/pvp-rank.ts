import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
  type APIStringSelectComponent,
} from 'discord.js';
import { encodeCustomIdIfFits } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { Ivs } from '../domain/pogo/cp.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import type { TempEvolution } from '../domain/pogo/types.js';
import {
  IV_FLOOR_NAMES,
  IV_FLOOR_VALUE,
  LEAGUE_CP,
  LEAGUE_NAMES,
  LEAGUES,
  type CappedRanks,
  type IvFloor,
  type League,
  type LevelCap,
  type PvpRank,
  type Spread,
} from '../domain/pvp/rank.js';
import type { FloorReason } from '../domain/pvp/floors.js';
import { TEXT_BUDGET } from './party-post.js';
import { fitItems, plain } from './text.js';
import { buttonEmojiOf } from './party-controls.js';
import {
  actionRow,
  container,
  countComponents,
  menuRow,
  section,
  separator,
  textDisplay,
  thumbnail,
} from './v2.js';

/** The CP pvpivs.com takes for a league; Master League is any CP. */
const PVPIVS_CP: Readonly<Record<League, number>> = {
  little: 500,
  great: 1500,
  ultra: 2500,
  master: 10_000,
};

/** The names pvpivs.com's list has where `pvpivsName`'s rule gives another, by catalogue key. */
const PVPIVS_NAMES: Readonly<Record<string, string>> = {
  mewtwo_a: 'Mewtwo_Armored',
  tauros_paldea_combat: 'Tauros_Paldean',
  tauros_paldea_blaze: 'Tauros_Paldean',
  tauros_paldea_aqua: 'Tauros_Paldean',
  calyrex_shadow_rider: 'Shadow_Rider_Calyrex',
  calyrex_ice_rider: 'Ice_Rider_Calyrex',
  necrozma_ultra: 'Ultra_Necrozma',
  zacian_hero: 'Zacian_Hero_of_Many_Battles',
  zamazenta_hero: 'Zamazenta_Hero_of_Many_Battles',
  eiscue_ice: 'Eiscue_Ice_Face',
  eiscue_noice: 'Eiscue_Noice_Face',
  oinkologne: 'Oinkologne_Male',
  enamorus_incarnate: 'Enamorus',
  gimmighoul: 'Gimmighoul_Roaming',
  zygarde: 'Zygarde_Fifty_Percent',
  zygarde_complete_fifty_percent: 'Zygarde_Fifty_Percent',
  zygarde_complete_ten_percent: 'Zygarde_Ten_Percent',
  minior: 'Minior_Meteor',
  minior_blue: 'Minior_Core',
  minior_green: 'Minior_Core',
  minior_indigo: 'Minior_Core',
  minior_orange: 'Minior_Core',
  minior_red: 'Minior_Core',
  minior_violet: 'Minior_Core',
  minior_yellow: 'Minior_Core',
  terapagos: 'Terapagos_Normal',
};

/**
 * The names pvpivs.com's list has with `_SPECULATIVE` after them (2026-11-01), released Pokémon
 * among them (Mega Mewtwo X and Y): the site reads only the whole name, so a link without the mark
 * opens no ranking. The site's author takes marks away and adds new ones: `npm run pvpivs:check`
 * tells what has changed.
 */
export const PVPIVS_SPECULATIVE: ReadonlySet<string> = new Set([
  'Archaludon',
  'Fezandipiti',
  'Gouging_Fire',
  'Great_Tusk',
  'Iron_Boulder',
  'Iron_Crown',
  'Iron_Hands',
  'Mega_Barbaracle',
  'Mega_Baxcalibur',
  'Mega_Chandelure',
  'Mega_Chesnaught',
  'Mega_Chimecho',
  'Mega_Clefable',
  'Mega_Crabominable',
  'Mega_Darkrai',
  'Mega_Delphox',
  'Mega_Dragalge',
  'Mega_Drampa',
  'Mega_Eelektross',
  'Mega_Emboar',
  'Mega_Excadrill',
  'Mega_Falinks',
  'Mega_Feraligatr',
  'Mega_Floette',
  'Mega_Froslass',
  'Mega_Glimmora',
  'Mega_Golisopod',
  'Mega_Golurk',
  'Mega_Greninja',
  'Mega_Hawlucha',
  'Mega_Heatran',
  'Mega_Magearna',
  'Mega_Meowstic',
  'Mega_Mewtwo_X',
  'Mega_Mewtwo_Y',
  'Mega_Pyroar',
  'Mega_Raichu_X',
  'Mega_Raichu_Y',
  'Mega_Scolipede',
  'Mega_Scovillain',
  'Mega_Scrafty',
  'Mega_Skarmory',
  'Mega_Staraptor',
  'Mega_Starmie',
  'Mega_Tatsugiri',
  'Mega_Zeraora',
  'Mega_Zygarde',
  'Munkidori',
  'Ogerpon',
  'Okidogi',
  'Palafin_Hero',
  'Pecharunt',
  'Raging_Bolt',
  'Roaring_Moon',
  'Terapagos_Normal',
  'Terapagos_Stellar',
  'Terapagos_Terastal',
]);

/** `RAICHU_ALOLA` → `Raichu_Alola`. */
const titled = (id: string): string =>
  id
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_');

/**
 * The Pokémon's name in pvpivs.com's list, which the site reads only exactly (2026-10-23): the
 * game master's id in title case (`Raichu_Alola`, `Giratina_Origin`, `Mr_Mime`), a species whose
 * id runs its words together by its English name (`Iron_Treads`, `Chien_Pao`), `_Paldean` for
 * the game master's `_PALDEA`, a mega as `Mega_Charizard_X`, and the few the site names
 * otherwise from `PVPIVS_NAMES`, with the mark of `PVPIVS_SPECULATIVE` where the site has one. A
 * form that changes only the looks (Unown's letters, Castform's weather: every form of the Pokédex
 * number but the regional ones and megas has the same stats) is the species there. `sameDex` is
 * every entry of the Pokémon's Pokédex number.
 */
export function pvpivsName(entry: PokemonEntry, sameDex: readonly PokemonEntry[]): string {
  const name = unmarkedName(entry, sameDex);
  return PVPIVS_SPECULATIVE.has(name) ? `${name}_SPECULATIVE` : name;
}

/** The name `pvpivsName` gives, before the mark. */
function unmarkedName(entry: PokemonEntry, sameDex: readonly PokemonEntry[]): string {
  const named = PVPIVS_NAMES[entry.key];
  if (named !== undefined) return named;
  if (entry.tempEvolution !== null) {
    const [prefix, suffix] = PVPIVS_TEMP[entry.tempEvolution];
    return `${prefix}_${speciesName(entry)}${suffix}`;
  }
  const looksOnly = sameDex
    .filter((one) => one.kind === 'species' || one.kind === 'form')
    .every((one) => JSON.stringify(one.stats) === JSON.stringify(entry.stats));
  const name =
    entry.form === null || (entry.kind !== 'regional' && looksOnly)
      ? speciesName(entry)
      : titled(entry.form);
  return name.replace(/_Paldea(?=_|$)/, '_Paldean');
}

/** The species' part of a pvpivs.com name: `Mr_Mime`, `Great_Tusk`. */
function speciesName(entry: PokemonEntry): string {
  const plain = entry.kind === 'species' && entry.form === null;
  if (!plain || entry.pokemonId.includes('_') || !/[ -]/.test(entry.name)) {
    return titled(entry.pokemonId);
  }
  return entry.name.replace(/[ -]/g, '_').replace(/[^A-Za-z0-9_]/g, '');
}

/** How pvpivs.com names a temporary evolution: before and after the species. */
const PVPIVS_TEMP: Readonly<Record<TempEvolution, readonly [string, string]>> = {
  MEGA: ['Mega', ''],
  MEGA_X: ['Mega', '_X'],
  MEGA_Y: ['Mega', '_Y'],
  PRIMAL: ['Primal', ''],
};

/** What a pvpivs.com link ranks with: the level cap, the lowest IV, a shadow. */
export interface PvpivsOptions {
  levelCap: LevelCap;
  /** The lowest IV the rank used (0 unless given). */
  floor?: number;
  /** Ranked as a shadow: the site's own links say it by `_true` after the IVs. */
  shadow?: boolean;
  /** Every entry of the Pokémon's Pokédex number, as for `pvpivsName`. */
  sameDex?: readonly PokemonEntry[];
}

/**
 * The page of pvpivs.com with the ranking of a Pokémon in a league (spec 6.3). It always says the
 * floor and the levels (`f`, `min=1`, `max`): the site otherwise ranks by those the visitor saved
 * in their browser (review of 2026-10-29), so the page opens on the combinations Pine ranked. The
 * name is encoded, so the address can stand in a masked link.
 */
export function pvpivsLink(
  entry: PokemonEntry,
  league: League,
  ivs: Ivs,
  options: PvpivsOptions,
): string {
  const { levelCap, floor = 0, shadow = false, sameDex = [entry] } = options;
  return (
    `https://pvpivs.com/?mon=${encodeURIComponent(pvpivsName(entry, sameDex))}` +
    `&cp=${String(PVPIVS_CP[league])}` +
    `&IVs=${String(ivs.attack)}_${String(ivs.defense)}_${String(ivs.stamina)}` +
    (shadow ? '_true' : '') +
    `&f=${String(floor)}&min=1&max=${String(levelCap)}`
  );
}

/** The colour of the answer by the share of the best stat product: gold, silver, bronze. */
export function rankColour(percent: number): number {
  if (percent >= 99) return 0xffd700;
  if (percent >= 97) return 0xc0c0c0;
  if (percent >= 95) return 0xcd7f32;
  return 0x30839f;
}

/** `98.53%`: cut, not rounded, so that only the best combination shows 100%. */
export function percentText(percent: number): string {
  return `${(Math.floor(percent * 100) / 100).toFixed(2)}%`;
}

/** `10/12/13`. */
export const ivText = (ivs: Ivs): string =>
  `${String(ivs.attack)}/${String(ivs.defense)}/${String(ivs.stamina)}`;

/** `4,096`: numbers with a thousands separator. */
const number = (n: number): string => n.toLocaleString('en-US');

/** `1499 CP at level 22.5`. */
const atLevel = (spread: Spread): string =>
  `${String(spread.cp)} CP at level ${String(spread.level)}`;

/** `**Rank 3** of 4,096 · 99.62%`. */
const rankLine = (ranked: PvpRank): string =>
  `**Rank ${number(ranked.rank)}** of ${number(ranked.of)} · ${percentText(ranked.percent)}`;

/** A level cap shown above 50: its level, what it is in a heading and in a line, its rank. */
interface HigherCap {
  level: LevelCap;
  heading: string;
  words: string;
  ranked: PvpRank;
}

/**
 * The caps above 50 that `ranks` shows, in order: a best buddy's 51, a Super Mega's own (52) and
 * a Super Mega best buddy's (53). One a combination cannot reach the league at is left out.
 */
function higherCaps(ranks: CappedRanks): HigherCap[] {
  const caps: HigherCap[] = [];
  const superCap = ranks.superMegaCap ?? 0;
  const add = (level: number, heading: string, words: string, ranked: PvpRank | undefined) => {
    if (ranked) caps.push({ level, heading, words, ranked });
  };
  add(51, 'best buddy', 'best buddy', ranks.level51);
  add(superCap, 'Super Mega', 'Super Mega', ranks.superMega);
  add(superCap + 1, 'Super Mega, best buddy', 'Super Mega and best buddy', ranks.superMegaBuddy);
  return caps;
}

function notInLeague(league: League): string {
  return `Too strong for ${LEAGUE_NAMES[league]} already at level 1 (above ${String(LEAGUE_CP[league])} CP).`;
}

/**
 * A member of the family (`catalogue.evolutionLine`), ranked with the same IVs: up to every cap
 * while the family is shown, up to level 50 alone while it is hidden (what the menu shows).
 */
export interface FamilyMember {
  entry: PokemonEntry;
  ranks: CappedRanks;
  /** Address of its picture, shown beside it while the message holds them. */
  picture?: string | undefined;
  /** Ranked as a shadow (`rankedAsShadow`): its name says "Shadow". */
  asShadow?: boolean;
}

/** The family of the Pokémon shown. */
export interface RankFamily {
  members: readonly FamilyMember[];
  /** Whether its section is shown (`/rank evolutions:`, the toggle). */
  shown: boolean;
  /** The key of the member that stands for the Pokémon shown (`catalogue.familyMember`): ▸. */
  marked: string;
}

/**
 * The lowest IV a rank used: a filter the member picked, one worked out from the Pokémon
 * (`autoFloor`, its reason), or none because the IVs given are below the one worked out
 * (`fallback`: the Pokémon came some other way).
 */
export type FloorShown =
  | { kind: 'picked'; filter: IvFloor }
  | { kind: 'auto'; floor: number; reason: FloorReason }
  | { kind: 'fallback'; assumed: number };

/** The lowest IV of a `FloorShown`: what the rank and its links used. */
export function floorValue(shown: FloorShown): number {
  if (shown.kind === 'picked') return IV_FLOOR_VALUE[shown.filter];
  return shown.kind === 'auto' ? shown.floor : 0;
}

/** What `/rank` shows. */
export interface RankView {
  entry: PokemonEntry;
  ivs: Ivs;
  league: League;
  /** The filter the controls carry: a picked one, or `auto` (worked out for each Pokémon). */
  filter: IvFloor | 'auto';
  /** Whether a shadow was asked for (the controls carry it). */
  shadow?: boolean;
  /** Whether the Pokémon shown is ranked as a shadow (`rankedAsShadow`): the head says so. */
  asShadow?: boolean;
  /** The lowest IV the rank used and why, for the small print and the links. */
  floor: FloorShown;
  ranks: CappedRanks;
  /** The family, its members ranked; undefined for a view that has none (a test's). */
  family?: RankFamily;
  /** Address of the Pokémon's picture. */
  picture?: string | undefined;
  /** Every entry of the Pokémon's Pokédex number, for its name on pvpivs.com (`pvpivsName`). */
  sameDex?: readonly PokemonEntry[];
  /**
   * The leagues' emoji as message text (`<:leagueultra:…>`, `LEAGUE_ICON`), where the
   * application has them: before the league's name and on its button. Without, words.
   */
  leagueIcons?: Partial<Record<League, string>>;
}

/**
 * The small print of the floor a rank used: a picked filter as before, a floor worked out from
 * the Pokémon with its reason, or why there is none (the IVs are below the one worked out). Nothing
 * for no floor. `name` is the Pokémon's name as the head shows it.
 */
function floorText(
  shown: FloorShown,
  name: string,
  entry: Pick<PokemonEntry, 'class'>,
  ivs: Ivs,
): string | undefined {
  if (shown.kind === 'picked') {
    if (shown.filter === 'none') return undefined;
    return `-# Filter: ${IV_FLOOR_NAMES[shown.filter]} (IVs from ${String(IV_FLOOR_VALUE[shown.filter])})`;
  }
  if (shown.kind === 'fallback') {
    return (
      `-# Ranked among all IVs: ${ivText(ivs)} is below the ${String(shown.assumed)} Pine ` +
      `assumes for ${name}.`
    );
  }
  if (shown.reason === 'untradable') {
    return (
      `-# IVs from ${String(shown.floor)}: ${name} cannot be traded, so it came from a raid, ` +
      'research or a max battle.'
    );
  }
  if (shown.reason === 'shadow') {
    const kind =
      entry.class === 'legendary'
        ? 'a shadow legendary comes from a raid or Giovanni.'
        : entry.class === 'mythical'
          ? 'a shadow mythical comes from a raid.'
          : 'a shadow Ultra Beast comes from a raid.';
    return `-# IVs from ${String(shown.floor)}: ${kind}`;
  }
  return undefined;
}

/** The custom-id kind of the controls under an answer of `/rank` (`rankControls`). */
export const RANK_KIND = 'rank';
/** The buttons' action: show the ranking as the rest of the custom id says. */
export const RANK_SHOW = 'show';
/** The menu's action: show the member of the family picked, as the rest says. */
export const RANK_PICK = 'pick';

/** What an answer of `/rank` shows, as its buttons say it: everything but the Pokémon's key. */
export interface RankState {
  league: League;
  ivs: Ivs;
  /** A picked filter, or `auto`: the floor worked out anew for the Pokémon a press shows. */
  floor: IvFloor | 'auto';
  evolutions: boolean;
  /** Whether a shadow was asked for. */
  shadow: boolean;
}

/** `10-12-13`: the IVs as a part of a custom id. */
export const ivArg = (ivs: Ivs): string =>
  `${String(ivs.attack)}-${String(ivs.defense)}-${String(ivs.stamina)}`;

const stateArgs = (state: RankState): string[] => [
  state.league,
  ivArg(state.ivs),
  state.floor,
  state.evolutions ? '1' : '0',
  state.shadow ? '1' : '0',
];

/**
 * The custom id of a button that shows the ranking of a Pokémon as `state` says:
 * `rank:<key>:show:<league>:<a>-<d>-<s>:<filter|auto>:<0|1 family>:<0|1 shadow>`. Nothing
 * about the answer is kept anywhere else. Undefined when it would be longer than Discord allows
 * (no key of the game master comes close).
 */
export function rankButtonId(key: string, state: RankState): string | undefined {
  return encodeCustomIdIfFits({
    kind: RANK_KIND,
    id: key,
    action: RANK_SHOW,
    args: stateArgs(state),
  });
}

/**
 * The custom id of the menu "Show another of the family…": `rank:<key>:pick:…` with the state
 * of the answer as the buttons' (the picked value a catalogue key of the family).
 */
export function rankPickId(key: string, state: RankState): string | undefined {
  return encodeCustomIdIfFits({
    kind: RANK_KIND,
    id: key,
    action: RANK_PICK,
    args: stateArgs(state),
  });
}

/** The leagues' buttons say the first word of the league's name where they have no icon. */
const LEAGUE_LABELS: Readonly<Record<League, string>> = {
  little: 'Little',
  great: 'Great',
  ultra: 'Ultra',
  master: 'Master',
};

/** A league's button: its icon alone (a word without), the one shown pressed and disabled. */
function leagueButton(
  customId: string,
  league: League,
  shown: boolean,
  icon: string | undefined,
): APIButtonComponentWithCustomId {
  const emoji = buttonEmojiOf(icon);
  return {
    type: ComponentType.Button,
    style: shown ? ButtonStyle.Primary : ButtonStyle.Secondary,
    custom_id: customId,
    ...(emoji === undefined ? { label: LEAGUE_LABELS[league] } : { emoji }),
    ...(shown ? { disabled: true } : {}),
  };
}

/** The family's toggle: "🧬 Family", blue while the family is shown, grey while hidden. */
function familyButton(customId: string, shown: boolean): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style: shown ? ButtonStyle.Primary : ButtonStyle.Secondary,
    custom_id: customId,
    label: 'Family',
    emoji: { name: '🧬' },
  };
}

/** A level cap's block: its heading with its link in the text, the spread, the best. */
function capText(heading: string, link: string, ranked: PvpRank): string {
  const { spread, best } = ranked;
  return [
    `${heading} · [🔗](<${link}>)`,
    `${atLevel(spread)} · Attack ${spread.attack.toFixed(2)} · Defense ` +
      `${spread.defense.toFixed(2)} · HP ${String(spread.hp)}`,
    `-# Best: ${ivText(best.ivs)} · ${atLevel(best)}`,
  ].join('\n');
}

/** A member's ranks above level 50 that differ from its level 50 rank: `best buddy: rank 214`. */
function otherRanks(member: FamilyMember, level50: PvpRank): string[] {
  return higherCaps(member.ranks)
    .filter((cap) => cap.ranked.rank !== level50.rank)
    .map((cap) => `${cap.words}: rank ${number(cap.ranked.rank)}`);
}

/** `▸ **Malamar** · rank 281 · 94.70%`: a member's name, marked when it is the one shown. */
function memberHead(member: FamilyMember, family: RankFamily, league: League): string {
  const name =
    `${member.entry.key === family.marked ? '▸ ' : ''}` +
    `**${member.asShadow === true ? 'Shadow ' : ''}${plain(member.entry.name)}**`;
  const { level50 } = member.ranks;
  return level50
    ? `${name} · rank ${number(level50.rank)} · ${percentText(level50.percent)}`
    : `${name} · ${notInLeague(league)}`;
}

/** A member beside its picture (A): its head, then its CP and other ranks in small print. */
function memberText(member: FamilyMember, family: RankFamily, league: League): string {
  const head = memberHead(member, family, league);
  const { level50 } = member.ranks;
  if (!level50) return head;
  return `${head}\n-# ${[atLevel(level50.spread), ...otherRanks(member, level50)].join(' · ')}`;
}

/** A member on one line of a list (B). */
function memberLine(member: FamilyMember, family: RankFamily, league: League): string {
  const head = memberHead(member, family, league);
  const { level50 } = member.ranks;
  return level50 ? [head, ...otherRanks(member, level50)].join(' · ') : head;
}

/** Discord's limits of a menu: its options, an option's label and description. */
const MENU_OPTIONS = 25;
const OPTION_TEXT = 100;
/** Discord's limit of a message's components, every nested one counted. */
const MAX_COMPONENTS = 40;

/**
 * The menu "Show another of the family…": a member each (25 at most). No option is its default,
 * so the closed menu shows what it is for (Matt, 2026-10-23); the family's ▸ marks the one shown.
 */
function familyMenu(customId: string, family: RankFamily): APIStringSelectComponent {
  return {
    type: ComponentType.StringSelect,
    custom_id: customId,
    placeholder: 'Show another of the family…',
    options: family.members.slice(0, MENU_OPTIONS).map((member) => {
      const { level50 } = member.ranks;
      return {
        label: `${member.asShadow === true ? 'Shadow ' : ''}${member.entry.name}`.slice(
          0,
          OPTION_TEXT,
        ),
        value: member.entry.key,
        description: level50
          ? `Rank ${number(level50.rank)} · ${percentText(level50.percent)}`
          : 'Too strong for this league',
      };
    }),
  };
}

/** The characters of every text display of `parts`, those inside sections too. */
function textLength(parts: readonly APIComponentInContainer[]): number {
  return parts.reduce((sum, part) => {
    if (part.type === ComponentType.TextDisplay) return sum + part.content.length;
    if (part.type === ComponentType.Section) {
      return sum + part.components.reduce((inner, text) => inner + text.content.length, 0);
    }
    return sum;
  }, 0);
}

/**
 * The family's section: its heading, and its members beside their pictures (A) when `pictures`
 * says so, else as one list (B), fitted to `room` characters. A member without a picture stands
 * as a text alone.
 */
function familyParts(
  view: RankView,
  family: RankFamily,
  pictures: boolean,
  room: number,
): APIComponentInContainer[] {
  const { entry, league } = view;
  if (family.members.length <= 1) {
    return [textDisplay(`**Family**\n${plain(entry.name)} does not evolve.`)];
  }
  if (pictures) {
    return [
      textDisplay('**Family**'),
      ...family.members.map((member) => {
        const text = memberText(member, family, league);
        return member.picture === undefined
          ? textDisplay(text)
          : section(text, thumbnail(member.picture));
      }),
    ];
  }
  return [
    textDisplay('**Family**'),
    textDisplay(
      fitItems(
        family.members.map((member) => memberLine(member, family, league)),
        room,
        '\n',
      ),
    ),
  ];
}

/**
 * The answer of `/rank` (plan 8B-2, redesigned 2026-10-23: design
 * `2026-10-23-rank-answer-redesign-design.md`), one components-v2 message coloured by the share
 * of the best stat product: the Pokémon with its IVs, the league (its icon before it) and the rank
 * up to level 50 beside its picture; a block per level cap shown, its heading ending in a link to
 * that ranking on pvpivs.com; the family when shown, its members beside their pictures while the
 * message holds them (40 components, `TEXT_BUDGET`), else as a list; the small print (where the
 * links go, the filter); the leagues' buttons (their icons, the shown one pressed and disabled)
 * and the Family toggle; the menu of the family's members when it has more than one, shown or
 * hidden. A Pokémon whose custom ids would not fit has no controls.
 */
export function renderRank(view: RankView): V2Message {
  const { entry, ivs, league, floor, ranks, family } = view;
  const { level50, level51 } = ranks;
  const icon = view.leagueIcons?.[league];
  const name = `${view.asShadow === true ? 'Shadow ' : ''}${plain(entry.name)}`;
  const head = [
    `### ${name} ${ivText(ivs)}`,
    `${icon === undefined ? '' : `${icon} `}${LEAGUE_NAMES[league]}`,
    level50 ? rankLine(level50) : notInLeague(league),
  ].join('\n');
  const top: APIComponentInContainer[] = [
    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
  ];
  const link = (levelCap: LevelCap) =>
    pvpivsLink(entry, league, ivs, {
      levelCap,
      floor: floorValue(floor),
      shadow: view.asShadow === true,
      ...(view.sameDex === undefined ? {} : { sameDex: view.sameDex }),
    });
  const caps: string[] = [];
  if (level50) {
    caps.push(
      capText(
        level51 === undefined
          ? '**Up to level 50** · the same rank up to 51'
          : '**Up to level 50**',
        link(50),
        level50,
      ),
    );
  }
  for (const cap of higherCaps(ranks)) {
    caps.push(
      capText(
        `**Up to level ${String(cap.level)} (${cap.heading})** · rank ` +
          `${number(cap.ranked.rank)} · ${percentText(cap.ranked.percent)}`,
        link(cap.level),
        cap.ranked,
      ),
    );
  }
  if (caps.length > 0) top.push(separator(), ...caps.map(textDisplay));
  const floorLine = floorText(floor, name, entry, ivs);
  const small = [
    ...(level50 ? ['-# 🔗 opens that ranking on pvpivs.com'] : []),
    ...(floorLine === undefined ? [] : [floorLine]),
  ];
  const bottom: APIComponentInContainer[] = [];
  if (small.length > 0) bottom.push(textDisplay(small.join('\n')));
  bottom.push(separator());
  const shown = family?.shown ?? false;
  const state: RankState = {
    league,
    ivs,
    floor: view.filter,
    evolutions: shown,
    shadow: view.shadow === true,
  };
  const leagueIds = LEAGUES.map((each) => rankButtonId(entry.key, { ...state, league: each }));
  const familyId = rankButtonId(entry.key, { ...state, evolutions: !shown });
  const pickId = rankPickId(entry.key, state);
  if (familyId !== undefined && leagueIds.every((id) => id !== undefined)) {
    bottom.push(
      actionRow([
        ...LEAGUES.map((each, i) =>
          leagueButton(leagueIds[i] ?? '', each, each === league, view.leagueIcons?.[each]),
        ),
        familyButton(familyId, shown),
      ]),
    );
    if (family && family.members.length > 1 && pickId !== undefined) {
      bottom.push(menuRow(familyMenu(pickId, family)));
    }
  }
  const colour = rankColour(level50?.percent ?? 0);
  const build = (middle: APIComponentInContainer[]) =>
    container(colour, [...top, ...middle, ...bottom]);
  if (!family?.shown) return { v2: true, components: [build([])] };
  const room = TEXT_BUDGET - textLength([...top, ...bottom]) - '**Family**'.length;
  const withPictures = build([separator(), ...familyParts(view, family, true, room)]);
  const fits =
    countComponents([withPictures]) <= MAX_COMPONENTS &&
    textLength(withPictures.components) <= TEXT_BUDGET;
  return {
    v2: true,
    components: [
      fits ? withPictures : build([separator(), ...familyParts(view, family, false, room)]),
    ],
  };
}
