import { wornBy } from '../pogo/raid-boss-feed.js';
import { foldText } from '../search/text.js';

/*
 * Field research tasks (plan 8R-1; design `2026-10-21-stop-reports-design.md`, 4.1): what a
 * PokéStop's task is, as Leek Duck's research page lists it. Pure: the page is read by
 * `leekduck.ts`, the list is kept by `ResearchTaskService`.
 */

/**
 * A reward a task may give. A task of several rewards is in the game several tasks of one text,
 * each with one reward, the same all day at a stop (plan 8R-5: `versions.ts`).
 */
export type TaskReward =
  /**
   * A Pokémon to catch: `key` and `dex` are the catalogue's entry where the page's name and
   * picture agree (`identifyBoss`), null where the game data does not know it (it is shown by
   * `name` and wanted by nobody); `cp` the page's range at level 15, when it gives one.
   */
  | {
      kind: 'encounter';
      name: string;
      key: string | null;
      dex: number | null;
      shiny: boolean;
      cp: { min: number; max: number } | null;
      image: string | null;
      /**
       * Set where the reward is costumed, as a version's reward carries it (plan 8R-5, review
       * W1: `taskVersions`, which has the catalogue), so that its words say so; a task of the
       * list and a report of before have none. `rewardKey` never reads it.
       */
      costumed?: true;
    }
  /** An item (`item` is its key, `itemKey`), with how many of it (0: not said, a typed reward). */
  | { kind: 'item'; item: string; name: string; quantity: number; image: string | null }
  /**
   * Mega Energy of a species (`dex` from the page's picture, null when it gives none), with how
   * much. `name` is the page's (`Sceptile Mega Energy`).
   */
  | {
      kind: 'energy';
      dex: number | null;
      name: string;
      quantity: number;
      image: string | null;
    };

/**
 * A task: its key (`taskKeyOf` its text), its text as the page writes it, its category (the
 * page's heading without "Tasks": Catching, Throwing, Battling, Exploring, Training, Buddy &
 * Friendship, Team GO Rocket, Sponsored, AR Scanning, or an event's own, `isEventCategory`)
 * and its rewards in the page's order. `endsAt`: where the page gives its section an end (an
 * event's, `data-event-end`), when it stops being offered (`taskOffered`), epoch milliseconds;
 * `endsLocal` the same end as wall-clock time where the page gave it so (plan 19A-2: the truth,
 * `endsAt` its moment in the instance's default zone).
 */
export interface ResearchTask {
  key: string;
  text: string;
  category: string;
  rewards: TaskReward[];
  endsAt?: number;
  endsLocal?: string;
}

/** Whether a task is offered at `now`: not past its event's end. */
export function taskOffered(task: Pick<ResearchTask, 'endsAt'>, now: number): boolean {
  return task.endsAt === undefined || now < task.endsAt;
}

/**
 * The categories Leek Duck's research page always has (plan 8R-8), folded to lower case, and
 * `Other`, the parser's name for a list without a heading. While an event has research of its
 * own the page puts its tasks first, under the event's own heading or headings, above these
 * (Wayback snapshots: 2026-06-10 "Candela's Quest for Victory Tasks" and "Spark's Caretaking
 * Quest Tasks", one event under two headings; 2026-08-20 "Ultra Unlock: Water Festival Tasks";
 * 2026-09-25 "Choose Your Path: Twilight Trails Tasks"; then Catching, Throwing, Battling,
 * Exploring, Training, Buddy & Friendship, Team GO Rocket, Sponsored, AR Scanning). The
 * headings do not match the events feed's names, so an event's tasks are told by their
 * category alone: any other than these.
 */
const STANDING_CATEGORIES: ReadonlySet<string> = new Set(
  [
    'Catching',
    'Throwing',
    'Battling',
    'Exploring',
    'Training',
    'Buddy & Friendship',
    'Team GO Rocket',
    'Sponsored',
    'AR Scanning',
    'Other',
  ].map((category) => category.toLowerCase()),
);

/** Whether a task's category is an event's: none of the standing ones, in any case. */
export function isEventCategory(category: string): boolean {
  return !STANDING_CATEGORIES.has(category.trim().toLowerCase());
}

/**
 * The tasks as they are offered (plan 8R-8): an event's first, then the rest, each part in the
 * order given (the page's). The very same list when it holds no event's task, or only those.
 */
export function eventTasksFirst<T extends { category: string }>(tasks: readonly T[]): readonly T[] {
  const events = tasks.filter((task) => isEventCategory(task.category));
  if (events.length === 0 || events.length === tasks.length) return tasks;
  return [...events, ...tasks.filter((task) => !isEventCategory(task.category))];
}

/** How long a task's text may be, as kept and shown. */
export const MAX_TASK_TEXT = 200;

/** How long a task a member typed may be (design 9.8; Matt's answer 5). */
export const MAX_TYPED_TASK = 100;

/**
 * A task's text as it is compared: folded (no case, no accents), every run of what is no letter
 * or digit one space. "Make 2 Excellent Throws" and "make 2 excellent  throws!" are one task.
 */
export function foldTaskText(text: string): string {
  return foldText(text)
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .join(' ');
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = (1n << 64n) - 1n;

/**
 * A task's key (design 9.8): FNV-1a of its folded text (UTF-8), 64 bits as 16 hex digits. The
 * value of an autocomplete choice and a report's `subjectKey`; the same text always has it.
 */
export function taskKeyOf(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(foldTaskText(text))) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Whether a text can be a task's key. */
export function isTaskKey(text: string): boolean {
  return /^[0-9a-f]{16}$/.test(text);
}

/**
 * An item's key, made of its name as the page writes it: folded, words joined by `-`
 * (`Golden Razz Berry` is `golden-razz-berry`, `Poké Ball` is `poke-ball`), at most 40
 * characters. Empty for a name without a letter or digit.
 */
export function itemKey(name: string): string {
  return foldTaskText(name).replace(/ /g, '-').slice(0, 40).replace(/-+$/, '');
}

/** Whether a text can be an item's key (`itemKey`). */
export function isItemKey(text: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) && text.length <= 40;
}

/** What a costumed reward's words end with (plan 8R-5, R12). */
export const COSTUMED_MARK = ' (costumed)';

/**
 * A reward's words: its name, an item's quantity; a costumed encounter's `(costumed)` where its
 * name does not say what it wears (review L9: `Pikachu wearing a Cosmog suit` says it already).
 */
function rewardInShort(reward: TaskReward): string {
  if (reward.kind === 'encounter') {
    return reward.costumed === true && wornBy(reward.name) === undefined
      ? `${reward.name}${COSTUMED_MARK}`
      : reward.name;
  }
  // A quantity of 0 is one nobody said (a reward typed with a task typed in full).
  return reward.quantity === 0 ? reward.name : `${reward.name} ×${String(reward.quantity)}`;
}

/**
 * The rewards of a task in short, as a choice and a line show them: `Dratini, Bagon, Axew`,
 * `Rare Candy ×3` or `Pikachu (costumed)`, the first `most` and "+N" for the rest.
 */
export function rewardsInShort(rewards: readonly TaskReward[], most = 3): string {
  const names = rewards.map(rewardInShort);
  const shown = names.slice(0, most).join(', ');
  return names.length > most ? `${shown} +${String(names.length - most)}` : shown;
}

/**
 * What a task may give, in short, as text (the post's reward line before it is made plain, the
 * map's report, plan 8M-9B): `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`; empty for none.
 */
export function rewardLine(rewards: readonly TaskReward[]): string {
  if (rewards.length === 0) return '';
  const short = rewardsInShort(rewards);
  return rewards.length === 1 ? short : `one of ${short}`;
}
