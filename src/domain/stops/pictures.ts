import { leekDuckPicture } from '../research/leekduck.js';
import type { TaskReward } from '../research/task.js';
import { parseRocketKey, type RocketCatch } from '../rocket/lineups.js';
import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';

/*
 * Which picture a report at a stop shows (plan 8R-6; design `2026-10-23-stop-pictures-design.md`,
 * "The rule for every picture"), in the post of the stops, the DMs and a grunt's message alike: when
 * the Pokémon is known, its picture; while it is not (a "one of", a grunt whose catch is open),
 * the game's encounter picture; an item or Mega Energy its own; a leader or Giovanni the
 * portrait; none where there is none. The address given is the source (a feed's, or one of the
 * constants here): `StopPictures` makes it square and gives the address a message names. Pure.
 */

/**
 * The game's generic encounter picture (PokeMiners' `Images/Quests/QuestPokemonReward.png`, 128
 * by 126, transparent): "this may not be yours", before a word is read (Matt). Pinned to one
 * commit of their assets (byte-identical to master's on 2026-10-24), so it cannot change under
 * the bot.
 */
export const ENCOUNTER_PICTURE =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestPokemonReward.png';

/**
 * What a picture is of, for the busy day of the post of the stops (design, "The post's layout"): the
 * pictures of items and Mega Energy go first; the encounter picture and the portraits count as
 * Pokémon.
 */
export type PictureKind = 'pokemon' | 'item';

/** A picture by the rule: its source address and what it is of. */
export interface StopPicture {
  source: string;
  kind: PictureKind;
}

/**
 * The address a message names for a source (`StopPictures.url`: the square picture the bot
 * serves, or the source itself while it is not ready), or none where the source is gone (it
 * answered 404 or 410): the renderer then shows no picture (rule 6). Renderers take it as a
 * lookup.
 */
export type PictureLookup = (source: string) => string | undefined;

/** The source as it is: where no `StopPictures` is given (tests, the plain text post). */
export const AS_FED: PictureLookup = (source) => source;

/**
 * Whether a picture may be fetched from this address (design, "Safety"): https of Leek Duck's CDN
 * as the feeds' check takes it (`leekDuckPicture`, the portraits among them), or the encounter
 * picture itself; nothing else.
 */
export function isPictureSource(url: string): boolean {
  if (url === ENCOUNTER_PICTURE) return true;
  if (leekDuckPicture(url) !== url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'cdn.leekduck.com' && parsed.port === '' && parsed.username === '';
  } catch {
    return false;
  }
}

/** A picture of this source and kind; none without a source. */
function pictured(source: string | null, kind: PictureKind): StopPicture | undefined {
  return source === null ? undefined : { source, kind };
}

/**
 * The picture of a research reward line, a research DM and a confirmation (rules 2 to 4, 6): of
 * one reward that reward's (a Pokémon, an item, Mega Energy); of two or more ("one of" a task's
 * encounters, or a report of before plan 8R-5 that holds every reward of its task) the encounter
 * picture, while any of them is a Pokémon (several items alone are no encounter: none); of none
 * (a typed task without its reward), none.
 */
export function researchPicture(rewards: readonly TaskReward[]): StopPicture | undefined {
  const [only, ...others] = rewards;
  if (only === undefined) return undefined;
  if (others.length === 0)
    return pictured(only.image, only.kind === 'encounter' ? 'pokemon' : 'item');
  return rewards.some((reward) => reward.kind === 'encounter')
    ? { source: ENCOUNTER_PICTURE, kind: 'pokemon' }
    : undefined;
}

/**
 * The picture of a Team GO Rocket report by who it is of (its `rocketKey`) and what can be caught
 * (rules 2, 3, 5, 6): a leader or Giovanni the portrait; a grunt or the decoy of one possible
 * catch that Pokémon, of two or more the encounter picture, of none known none.
 */
export function rocketPicture(
  key: string,
  catches: readonly Pick<RocketCatch, 'image'>[],
): StopPicture | undefined {
  const who = parseRocketKey(key);
  if (who === undefined) return undefined;
  if (who.kind === 'leader') return { source: LEADER_PORTRAITS[who.leader], kind: 'pokemon' };
  if (who.kind === 'giovanni') return { source: GIOVANNI_PORTRAIT, kind: 'pokemon' };
  const [only, ...others] = catches;
  if (only === undefined) return undefined;
  return others.length === 0
    ? pictured(only.image, 'pokemon')
    : { source: ENCOUNTER_PICTURE, kind: 'pokemon' };
}

/** The pictures of these, each with one. */
function sourcesOf(items: Iterable<{ image: string | null }>): string[] {
  return [...items].flatMap((item) => (item.image === null ? [] : [item.image]));
}

/**
 * Every picture the task list's reports and pick lists can show (plan 8M-9B): each reward's, and
 * the encounter picture of "one of". `StopPictures.prepare` makes them square when the list is
 * read, so the map's views name the square ones (B1: never per request).
 */
export function taskPictureSources(tasks: Iterable<{ rewards: readonly TaskReward[] }>): string[] {
  return [
    ...new Set([ENCOUNTER_PICTURE, ...[...tasks].flatMap((task) => sourcesOf(task.rewards))]),
  ];
}

/**
 * Every picture the lineups' reports and pick lists can show (plan 8M-9B): each catch's (a type's
 * two lineups too), the leaders' and Giovanni's portraits, and the encounter picture of a grunt
 * whose catch is open; made square when the lineups are read.
 */
export function lineupPictureSources(
  choices: Iterable<{
    catches: readonly Pick<RocketCatch, 'image'>[];
    lineups?: readonly { catches: readonly Pick<RocketCatch, 'image'>[] }[];
  }>,
): string[] {
  const catches = [...choices].flatMap((choice) => [
    ...sourcesOf(choice.catches),
    ...(choice.lineups ?? []).flatMap((lineup) => sourcesOf(lineup.catches)),
  ]);
  return [
    ...new Set([
      ENCOUNTER_PICTURE,
      ...catches,
      GIOVANNI_PORTRAIT,
      ...Object.values(LEADER_PORTRAITS),
    ]),
  ];
}
