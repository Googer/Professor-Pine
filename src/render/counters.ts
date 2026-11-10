import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { CounterRow } from '../domain/counters/counters.js';
import {
  ATTACKER_LEVEL_NAMES,
  FRIENDSHIP_NAMES,
  WEATHER_NAMES,
  type AttackerLevel,
  type CounterWeather,
  type Friendship,
} from '../domain/counters/options.js';
import { typeWord } from '../domain/pogo/game-icons.js';
import { raidWords, type RaidTier } from '../domain/pogo/raid-tier.js';
import type { PokemonType } from '../domain/pogo/types.js';
import { cutText, TEXT_BUDGET } from './party-post.js';
import { count, fitItems, plain, plainNoLinks, truncate } from './text.js';
import {
  actionRow,
  container,
  linkButton,
  section,
  separator,
  textDisplay,
  thumbnail,
} from './v2.js';

/** Pokebattler's green, as the legacy answer had it. */
export const COUNTERS_COLOUR = 0x43b581;

/** A move as the answer names it: its name, and its type where the game data knows the move. */
export interface ShownMove {
  name: string;
  type: PokemonType | undefined;
}

/**
 * Where the attackers of a simulation came from, as the answer says it: a level, or the member's
 * Pokébox (whose user number the answer never shows).
 */
export type ShownAttackers = { kind: 'level'; level: AttackerLevel } | { kind: 'box' };

/** What `/counters` shows. */
export interface CountersView {
  bossName: string;
  tier: RaidTier;
  /** The page with the full results on pokebattler.com. */
  link: string;
  picture: string | undefined;
  attackers: ShownAttackers;
  weather: CounterWeather;
  friendship: Friendship;
  /** The boss's moves, `Confusion / Psystrike`; undefined for the average of all movesets. */
  bossMoves: string | undefined;
  rows: readonly CounterRow[];
  /** The name of a Pokémon by what Pokebattler calls it. */
  pokemonName: (pokemonId: string) => string;
  /** A move by its id (`DRAGON_BREATH_FAST`). */
  move: (moveId: string) => ShownMove;
  /** The emoji of a type by its name (`dragon`), undefined where there is none. */
  icon: (name: string) => string | undefined;
  /** Whether shadow Pokémon and megas were listed, and every moveset of a counter. */
  shadow: boolean;
  mega: boolean;
  single: boolean;
  /** The custom id of "Change options…"; without it the answer has the link alone. */
  optionsId?: string | undefined;
}

/** `#01`. */
const place = (index: number): string => `\`#${String(index + 1).padStart(2, '0')}\``;

/** The trainers a counter takes, up to a tenth, as the legacy bot showed it. */
const trainers = (estimator: number | null): string =>
  estimator === null ? '?' : (Math.ceil(estimator * 10) / 10).toFixed(1);

/** A move with its type's emoji before it, or its type in words after it where there is none. */
function moveText(move: ShownMove, view: CountersView): string {
  if (move.type === undefined) return plain(move.name);
  const icon = view.icon(move.type);
  return icon === undefined
    ? `${plain(move.name)} (${typeWord(move.type)})`
    : `${icon} ${plain(move.name)}`;
}

/** One counter: its place, name and numbers, and its moves in small print under them. */
function rowText(row: CounterRow, index: number, view: CountersView): string {
  const { counter, result } = row;
  const box = view.attackers.kind === 'box';
  const nickname =
    counter.nickname === null ? '' : ` "${plainNoLinks(truncate(counter.nickname, 30))}"`;
  const cp = box && counter.cp !== null ? ` · ${counter.cp.toLocaleString('en-US')} CP` : '';
  const moves = [result.fast, result.charged, ...(result.third === null ? [] : [result.third])]
    .map((id) => moveText(view.move(id), view))
    .join(' / ');
  return (
    `${place(index)} **${plain(view.pokemonName(counter.pokemonId))}**${nickname}${cp} · ` +
    `${String(Math.round(result.timeMs / 1000))}s · ${result.deaths.toFixed(1)} deaths · ` +
    `${trainers(result.estimator)} trainers\n-# ${moves}${result.legacy ? ' †' : ''}`
  );
}

/** `no weather`, `windy weather`; also in the small print of a max battle team. */
export function weatherText(weather: CounterWeather): string {
  return weather === 'NO_WEATHER'
    ? 'no weather'
    : `${WEATHER_NAMES[weather].toLowerCase()} weather`;
}

/** Which counters were listed besides the plain ones. */
function listedText(view: CountersView): string {
  if (view.shadow && view.mega) return 'shadow Pokémon and megas listed';
  if (view.shadow) return 'shadow Pokémon listed, no megas';
  if (view.mega) return 'megas listed, no shadow Pokémon';
  return 'no shadow Pokémon or megas';
}

/**
 * What the simulation was for, in small print: `Attackers at level 40 · no weather · best
 * friends · no shadow Pokémon or megas`, a Pokébox's, every moveset, and what `†` means.
 */
function settingLine(view: CountersView, legacyShown: boolean): string {
  const attackers =
    view.attackers.kind === 'box'
      ? 'Your Pokébox on Pokebattler'
      : `Attackers at ${ATTACKER_LEVEL_NAMES[view.attackers.level].replace(/^Level/, 'level')}`;
  return `-# ${[
    attackers,
    weatherText(view.weather),
    FRIENDSHIP_NAMES[view.friendship].toLowerCase(),
    listedText(view),
    ...(view.single ? ['every moveset of a counter'] : []),
    ...(legacyShown ? ['† a legacy move'] : []),
  ].join(' · ')}`;
}

const CREDIT = '-# Data provided by Pokebattler';

/**
 * As many whole rows as fit into `room`, one under the other, and "…and N more" for the rest
 * (`fitItems`), with how many are shown; a single row too long by itself is cut.
 */
function fitRows(rows: readonly string[], room: number): { text: string; shown: number } {
  const text = fitItems(rows, room, '\n');
  const more = /…and (\d+) more$/.exec(text);
  const shown = more ? rows.length - Number(more[1]) : rows.length;
  return { text: cutText(text, room), shown };
}

/**
 * The answer of `/counters` (plan 8B-2), one components-v2 message: the boss, the raid and its
 * moves and how many trainers it takes beside the boss's picture; the best counters (twelve),
 * each with the time to win, how often it faints and how many trainers it takes (Pokebattler's
 * estimator), its moves in small print with their types' emoji; what the simulation was for;
 * "Change options…" and the full results on pokebattler.com; and the credit. The counters share
 * what is left of `TEXT_BUDGET` ("…and N more" for those that do not fit).
 */
export function renderCounters(view: CountersView): V2Message {
  const best = view.rows[0]?.result.estimator ?? null;
  const head = [
    `### Counters for ${plain(view.bossName)}`,
    `${raidWords(view.tier)} · boss moves: ${
      view.bossMoves === undefined ? 'the average of all its movesets' : plain(view.bossMoves)
    }`,
    ...(best === null
      ? []
      : [
          `About **${count(Math.max(1, Math.ceil(best)), 'trainer')}** with ` +
            `${view.attackers.kind === 'box' ? 'your' : 'the'} best counters`,
        ]),
  ].join('\n');
  // The rows have what is left beside the small print with the legacy note; the note stays only
  // when a row that is shown has a legacy move (a shorter line leaves more room, never less).
  const room = TEXT_BUDGET - head.length - settingLine(view, true).length - CREDIT.length;
  const fitted = fitRows(
    view.rows.map((row, i) => rowText(row, i, view)),
    room,
  );
  const settings = settingLine(
    view,
    view.rows.slice(0, fitted.shown).some((row) => row.result.legacy),
  );
  const rows = view.rows.length === 0 ? 'Pokebattler lists no counter that fits.' : fitted.text;
  const buttons = [
    ...(view.optionsId === undefined
      ? []
      : [
          {
            type: ComponentType.Button as const,
            style: ButtonStyle.Primary as const,
            custom_id: view.optionsId,
            label: 'Change options…',
            emoji: { name: '⚙️' },
          },
        ]),
    linkButton('Full results', undefined, view.link),
  ];
  const parts: APIComponentInContainer[] = [
    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
    separator(),
    textDisplay(rows),
    separator(),
    textDisplay(settings),
    actionRow(buttons),
    textDisplay(CREDIT),
  ];
  return { v2: true, components: [container(COUNTERS_COLOUR, parts)] };
}
