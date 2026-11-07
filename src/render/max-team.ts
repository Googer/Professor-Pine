import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';
import {
  MAX_ROLES,
  slotRoleWords,
  type MaxMoveLevels,
  type MaxPick,
  type MaxRole,
} from '../domain/counters/max-team.js';
import { typeWord } from '../domain/pogo/game-icons.js';
import { maxBossTitle, type MaxTier } from '../domain/pogo/max-tier.js';
import type { PokemonType } from '../domain/pogo/types.js';
import {
  FRIENDSHIP_NAMES,
  type CounterWeather,
  type Friendship,
} from '../domain/counters/options.js';
import { COUNTERS_COLOUR, weatherText, type ShownMove } from './counters.js';
import { cutText, TEXT_BUDGET } from './party-post.js';
import { fitItems, plain } from './text.js';
import {
  actionRow,
  container,
  linkButton,
  section,
  separator,
  textDisplay,
  thumbnail,
} from './v2.js';

/** The words of the answer's link, and of a refusal's (`troubleError`): the boss's Lobby. */
export const MAX_TEAM_LINK_WORDS = 'Lobby on Pokebattler';

/** How many alternatives a role of the team lists (each slot of Pokebattler's has ten). */
export const SHOWN_ALTERNATIVES = 5;

/** A Pokémon of the team as the answer shows it. */
export interface ShownTeamMember {
  /** `Zacian (Crowned Sword)`, `Gigantamax Rillaboom`. */
  name: string;
  picture: string | undefined;
  pick: MaxPick;
}

/** One of the three Pokémon of the team, with the alternatives for its place. */
export interface ShownSlot {
  /** Pokebattler's role of the slot (`ATTACK`, `METER_CHARGE`, `SHIELD`, `HEAL`, `CHARGE`). */
  role: string;
  member: ShownTeamMember;
  alternatives: readonly ShownTeamMember[];
}

/** What `/counters` shows for a max battle (plan 8X-6). */
export interface MaxTeamView {
  bossName: string;
  /** The boss's catalogue key, for its label (`maxBossTitle`). */
  bossKey?: string;
  tier: MaxTier;
  bossTypes: readonly PokemonType[];
  picture: string | undefined;
  role: MaxRole;
  slots: readonly ShownSlot[];
  weather: CounterWeather;
  friendship: Friendship;
  /** The level the answer was simulated at; null when it does not say. */
  level: string | null;
  maxMoves: MaxMoveLevels | undefined;
  /** A move by its id (`METAL_CLAW_FAST`). */
  move: (moveId: string) => ShownMove;
  /** The emoji of a type by its name (`steel`), undefined where there is none. */
  icon: (name: string) => string | undefined;
  /** The boss's Lobby on Pokebattler's site (`maxTeamLink`). */
  link: string;
  /** The custom id of "Change options…"; without it the answer has the link alone. */
  optionsId?: string | undefined;
}

/** What one text of the answer may hold (a name of Pokebattler's is never long; to be safe). */
const PART_ROOM = 1_000;

/** A type as its emoji, or in words where there is none. */
const typeText = (type: PokemonType, view: MaxTeamView): string =>
  view.icon(type) ?? typeWord(type);

/** A move with its type's emoji before it, or its type in words after it where there is none. */
function moveText(move: ShownMove, view: MaxTeamView): string {
  if (move.type === undefined) return plain(move.name);
  const icon = view.icon(move.type);
  return icon === undefined
    ? `${plain(move.name)} (${typeWord(move.type)})`
    : `${icon} ${plain(move.name)}`;
}

/**
 * A slot: its role and Pokémon, and in small print what the role does as Pokebattler's Lobby
 * says it (where Pine knows the role) and its moves (no charged move where none).
 */
function slotText(slot: ShownSlot, view: MaxTeamView): string {
  const { pick } = slot.member;
  const moves = [pick.fast, ...(pick.charged === null ? [] : [pick.charged])]
    .map((id) => moveText(view.move(id), view))
    .join(' / ');
  const words = slotRoleWords(slot.role);
  const small = words.does === undefined ? moves : `${words.does} · ${moves}`;
  return cutText(`**${plain(words.one)}** · ${plain(slot.member.name)}\n-# ${small}`, PART_ROOM);
}

/** The slots by role, in the order of the answer (attackers first, as Pokebattler lists them). */
function byRole(slots: readonly ShownSlot[]): ShownSlot[][] {
  const groups = new Map<string, ShownSlot[]>();
  for (const slot of slots) {
    const group = groups.get(slot.role);
    if (group) group.push(slot);
    else groups.set(slot.role, [slot]);
  }
  return [...groups.values()];
}

/**
 * The alternatives of a role, once for all its slots (Pokebattler gives slots of one role the
 * same list, without the role's own Pokémon): the first `SHOWN_ALTERNATIVES`, each with its fast
 * move (the max moves follow its type), in at most `room` characters ("…and N more" for those
 * that do not fit, as `renderCounters` fits its rows). Undefined when there are none or no room.
 */
function othersText(
  group: readonly ShownSlot[],
  view: MaxTeamView,
  room: number,
): string | undefined {
  const picked = new Set(group.map((slot) => slot.member.pick.pokemonId));
  const seen = new Set<string>();
  const shown: string[] = [];
  for (const other of group.flatMap((slot) => slot.alternatives)) {
    const key = `${other.pick.pokemonId}/${other.pick.fast}`;
    if (picked.has(other.pick.pokemonId) || seen.has(key)) continue;
    seen.add(key);
    shown.push(`${plain(other.name)} (${plain(view.move(other.pick.fast).name)})`);
    if (shown.length === SHOWN_ALTERNATIVES) break;
  }
  const [first] = group;
  if (!first || shown.length === 0) return undefined;
  const head = `-# ${plain(slotRoleWords(first.role).others)}: `;
  if (room - head.length < '…and 10 more'.length) return undefined;
  return cutText(`${head}${fitItems(shown, room - head.length, ' · ')}`, room);
}

/** What the team was simulated with, in small print, as Pokebattler said it. */
function settingLine(view: MaxTeamView): string | undefined {
  const parts = [
    ...(view.level === null ? [] : [`Pokémon at level ${plain(view.level)}`]),
    weatherText(view.weather),
    FRIENDSHIP_NAMES[view.friendship].toLowerCase(),
    ...(view.maxMoves
      ? [
          `Max Attack level ${String(view.maxMoves.attack)}, Max Guard ` +
            `${String(view.maxMoves.guard)}, Max Spirit ${String(view.maxMoves.spirit)}`,
        ]
      : []),
  ];
  return parts.length === 0 ? undefined : `-# ${parts.join(' · ')}`;
}

const CREDIT = '-# Data provided by Pokebattler';

/** What the list is (plan 8X-I): the team Pokebattler's Lobby builds, which the button opens. */
const TEAM_SOURCE = '-# Pokebattler’s suggested team, as its Lobby builds it';

/**
 * The answer of `/counters` for a max battle (plan 8X-6), one components-v2 message in the form
 * of the raid counters' (`renderCounters`): the boss, its types, the member's role and that the
 * team is Pokebattler's suggested one beside the boss's picture; each of the three Pokémon of
 * the team with its role, what the role does and its moves beside its picture (a Gigantamax
 * one's where the icons have it), the alternatives of each role once under its Pokémon; what the
 * team was simulated with; "Change options…" and "Lobby on Pokebattler" (the boss's Lobby on
 * Pokebattler's site, where it builds such teams); and the credit.
 */
export function renderMaxTeam(view: MaxTeamView): V2Message {
  const role = MAX_ROLES[view.role];
  const head = [
    `### Max battle team against ${plain(maxBossTitle({ name: view.bossName, key: view.bossKey }, view.tier))}`,
    [
      ...(view.bossTypes.length === 0
        ? []
        : [view.bossTypes.map((type) => typeText(type, view)).join(' / ')]),
      `your role: ${role.name} (${role.team})`,
    ].join(' · '),
    TEAM_SOURCE,
  ].join('\n');
  const parts: APIComponentInContainer[] = [
    view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
    separator(),
  ];
  const groups = byRole(view.slots);
  const settings = settingLine(view);
  // The alternatives share what is left of `TEXT_BUDGET` beside every other text, equally.
  const fixed =
    head.length +
    view.slots.reduce((sum, slot) => sum + slotText(slot, view).length, 0) +
    (settings?.length ?? 0) +
    CREDIT.length;
  const room = Math.floor((TEXT_BUDGET - fixed) / Math.max(1, groups.length));
  for (const group of groups) {
    for (const slot of group) {
      const text = slotText(slot, view);
      parts.push(
        slot.member.picture === undefined
          ? textDisplay(text)
          : section(text, thumbnail(slot.member.picture)),
      );
    }
    const others = othersText(group, view, room);
    if (others !== undefined) parts.push(textDisplay(others));
  }
  if (view.slots.length === 0) parts.push(textDisplay('Pokebattler suggests no team.'));
  parts.push(separator());
  if (settings !== undefined) parts.push(textDisplay(settings));
  parts.push(
    actionRow([
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
      linkButton(MAX_TEAM_LINK_WORDS, undefined, view.link),
    ]),
  );
  parts.push(textDisplay(CREDIT));
  return { v2: true, components: [container(COUNTERS_COLOUR, parts)] };
}
