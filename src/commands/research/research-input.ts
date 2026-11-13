import { PermissionFlagsBits } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Settings } from '../../config/settings.js';
import type { LocatedInteraction } from '../../discord/command.js';
import { ListChanged, UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { variedThrottleKey } from '../../discord/router.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import { PIN_NEAR_METRES, type KnownPlace } from '../../domain/geo/place.js';
import {
  foldTaskText,
  isItemKey,
  isTaskKey,
  MAX_TYPED_TASK,
  taskKeyOf,
  taskOffered,
  type ResearchTask,
  type TaskReward,
} from '../../domain/research/task.js';
import { researchSubjectOf } from '../../domain/research/reports.js';
import {
  oneOfLabel,
  rewardHash,
  versionValue,
  type TaskVersion,
} from '../../domain/research/versions.js';
import { typedSubject, type ReportedStop } from '../../domain/stops/report.js';
import { searchTokens } from '../../domain/search/text.js';
import { ACCESS_UNKNOWN } from '../../render/activity.js';
import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
import { plain, truncate } from '../../render/text.js';
import type { PlaceChoice } from '../../services/place-finder.js';
import type { ResearchSubject } from '../../services/stop-reports.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { namedPlace, orList, type PlaceKindsOnly } from '../place-option.js';
import { stopReportBarred, stopReportBarredWords } from './research-report.js';
import { serverValuesOf } from '../../discord/server-values.js';

/*
 * What `/research report` reads (plan 8R-1; design 4.3, 9.8): the task (a choice of the period's
 * list, or text typed in full), up to five stops, and for a typed task its reward.
 */

/** The name `/research report` is used and counted under (the router's key of a subcommand). */
export const RESEARCH_REPORT = 'research report';

/** The name `/research remove` is counted under (the map's taking back counts there too). */
export const RESEARCH_REMOVE = 'research remove';

/** Where `/research` works, said wherever it does not. */
export const RESEARCH_FROM_A_REGION =
  'Report field research from the channel of a region, its forum or a post there.';

/** Said where the server's regions hold no PokéStop at all (Matt's answer 7). */
export const NO_STOPS_HERE =
  'No PokéStops are known here yet; staff can `/gym import` or `/pokestop add`.';

/** Said of a choice of the task list that is gone from it since it was offered (design 9.8). */
export const TASK_LIST_CHANGED = 'The task list just changed: pick the task again.';

/** Said of a place of another kind than a PokéStop. */
export const NOT_A_STOP =
  'Field research is at PokéStops: pick a PokéStop from the list that appears while you type.';

/** Said of a pin without a PokéStop within `PIN_NEAR_METRES`, in the settings' units. */
export function noStopAtPin(units: DistanceUnits): string {
  return (
    `I know no PokéStop within ${distanceWords(PIN_NEAR_METRES, units)} of that pin: pick one ` +
    'from the list that appears while you type.'
  );
}

/** The options that name a stop, the first required. */
export const STOP_OPTIONS = ['stop', 'stop2', 'stop3', 'stop4', 'stop5'] as const;

/**
 * The longest task and reward typed in (`/research report`'s `task:` and `reward:`, the map's
 * body and fields: branch review W4 of 8M-9B, one number).
 */
export const MAX_TYPED = 100;

/** Only PokéStops. */
const STOPS_ONLY: PlaceKindsOnly = { kinds: ['stop'], refusal: NOT_A_STOP };

/** `/research report`'s limit, of the settings (design 4.3: 10 reports in 30 minutes unless set). */
export function researchThrottle(settings: Pick<Settings, 'research'>): Throttle {
  const { uses, minutes } = settings.research.throttle;
  return { uses, perSeconds: minutes * 60 };
}

/**
 * The window `/research report` counts in, for the controls that count there too ("Same task at
 * more stops…"): its throttle is a function of the settings, so its window is the varied one.
 */
export function researchWindow(settings: Pick<Settings, 'research'>): string {
  return variedThrottleKey(RESEARCH_REPORT, researchThrottle(settings));
}

/** A known stop as a report keeps it. */
export function reportedStop(place: KnownPlace | PlaceChoice): ReportedStop {
  const point = 'point' in place ? place.point : { lat: place.lat, lon: place.lon };
  return {
    key: place.id,
    name: place.title,
    address: place.address === null || place.address === '' ? null : place.address,
    image: place.image === '' ? null : place.image,
    lat: point.lat,
    lon: point.lon,
  };
}

/**
 * Refuses a report at a stop of a region the member is kept out of (plan 8Z-2; `stopReportBarred`,
 * the question the map's routes ask), naming the stop; and, while Discord cannot say, in words
 * of its own (logged). For the guards of `/research report` and `/rocket report`, where a
 * refusal does not count, and for "Same task at more stops…", whose use the refusal gives back
 * (`givesBack`). A server's administrator is asked nothing.
 */
export async function requireStopsOpen(
  interaction: LocatedInteraction,
  ctx: AppContext,
  stops: readonly ReportedStop[],
  options: { givesBack?: boolean } = {},
): Promise<void> {
  const administrator =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  let kept: Awaited<ReturnType<typeof stopReportBarred>>;
  try {
    kept = await stopReportBarred(
      ctx,
      (gate, memberId) => ctx.partyService.memberAccess(gate, memberId),
      guildIdOf(interaction),
      stops,
      { id: interaction.user.id, administrator },
    );
  } catch (err) {
    ctx.log.warn(
      { err, user: interaction.user.id },
      'could not ask Discord whether a member is kept out of the region of a stop; refused',
    );
    throw new UserError(ACCESS_UNKNOWN, { givesBack: true });
  }
  if (kept !== undefined) throw new UserError(stopReportBarredWords(kept), options);
}

/**
 * The stop an option names: a choice of the stops (`stop:<id>`), typed text that names one
 * beyond doubt, or a maps link or coordinates, which is the nearest PokéStop within 50 meters
 * (`PlaceFinder.nearestStop`). Refused otherwise, as `/wild near:` refuses. Resolved once per
 * interaction (`namedPlace`): the guard's answer is the command's.
 */
export async function namedStop(
  interaction: LocatedInteraction,
  ctx: AppContext,
  value: string,
  /** What a place of another kind is refused with (plan 8R-2: `/rocket`'s words). */
  refusal = NOT_A_STOP,
): Promise<ReportedStop> {
  const place = await namedPlace(
    interaction,
    ctx,
    value,
    'or paste a link to it from a maps app',
    refusal === NOT_A_STOP ? STOPS_ONLY : { kinds: ['stop'], refusal },
  );
  if (place === undefined) throw new UserError(refusal);
  if (place.kind !== 'pin') return reportedStop(place);
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  const near = row === undefined ? undefined : ctx.placeFinder.nearestStop(row, place);
  if (!near) throw new UserError(noStopAtPin(serverValuesOf(interaction, ctx).distanceUnits));
  return reportedStop(near);
}

/** The stops the options of a use name, each once, in the order of the options. */
export async function namedStops(
  interaction: LocatedInteraction & {
    options: { getString(name: string, required?: boolean): string | null };
  },
  ctx: AppContext,
): Promise<ReportedStop[]> {
  const stops: ReportedStop[] = [];
  for (const option of STOP_OPTIONS) {
    const value = interaction.options.getString(option, option === 'stop');
    if (value === null || value.trim() === '') continue;
    const stop = await namedStop(interaction, ctx, value);
    if (!stops.some((one) => one.key === stop.key)) stops.push(stop);
  }
  return stops;
}

/** Whether every typed word is in a text, folded as the search folds it. */
function hasWords(text: string, words: readonly string[]): boolean {
  const own = searchTokens(text);
  return words.every((word) => own.some((one) => one.startsWith(word)));
}

/**
 * A version of a task as a choice (plan 8R-5): `Make 3 Excellent Throws in a row · Gible`,
 * `… · one of Gible, Larvitar, Beldum`, its value the version's (`<task>:<hash>`, the task's key
 * for "one of"); the task's text cut first.
 */
export function versionChoice(task: ResearchTask, label: string, value: string): Choice {
  const suffix = label === '' ? '' : ` · ${label}`;
  const room = CHOICE_NAME - Math.min(suffix.length, CHOICE_NAME - 30);
  return { name: truncate(`${truncate(task.text, room)}${suffix}`, CHOICE_NAME), value };
}

/**
 * The choices of the `task` option (design 4.3; plan 8R-5, design point 3 and R12): a choice per
 * version of the period's tasks, in the list's order; with words typed, first every version of
 * the tasks whose text has every word (as the beginning of a word), then the versions that have
 * them across the task's text and their rewards' names together (`excellent gible` finds "Make 3
 * Excellent Throws in a row · Gible" and its "one of"), a "one of" naming the rewards typed first.
 */
export function taskChoices(
  ctx: Pick<AppContext, 'researchTasks' | 'gameData'>,
  typed: string,
  zone: string,
): Choice[] {
  const words = searchTokens(typed);
  const byText: Choice[] = [];
  const byReward: Choice[] = [];
  // The tasks offered in the server's zone (plan 19A-2: an event's end on its clock).
  for (const task of ctx.researchTasks.tasks(zone)) {
    const whole = hasWords(task.text, words);
    for (const version of ctx.researchTasks.versions(task)) {
      const names = version.rewards.map((reward) => reward.name);
      if (whole) {
        byText.push(versionChoice(task, version.label, version.value));
      } else if (
        // "One of" found by its own words too (plan 8R-6, the staging's finding 6).
        hasWords(`${task.text} ${version.oneOf ? 'one of ' : ''}${names.join(' ')}`, words)
      ) {
        // "One of" with the rewards typed first (R12).
        const label = version.oneOf
          ? oneOfLabel(
              version.rewards,
              (reward) =>
                searchTokens(reward.name).some((own) => words.some((w) => own.startsWith(w))),
              ctx.gameData.catalogue,
            )
          : version.label;
        byReward.push(versionChoice(task, label, version.value));
      }
    }
  }
  return [...byText, ...byReward].slice(0, MAX_CHOICES);
}

/** The items and the Mega Energy of the task list, by key: what `reward:` and `/want` offer. */
export function listedRewards(ctx: Pick<AppContext, 'researchTasks'>): {
  items: Map<string, string>;
  energies: Map<number, string>;
} {
  const items = new Map<string, string>();
  const energies = new Map<number, string>();
  for (const task of ctx.researchTasks.storedTasks()) {
    for (const reward of task.rewards) {
      if (reward.kind === 'item') items.set(reward.item, reward.name);
      if (reward.kind === 'energy' && reward.dex !== null) energies.set(reward.dex, reward.name);
    }
  }
  return { items, energies };
}

/** A reward's value as a choice carries it: `pokemon:<key>`, `item:<key>`, `energy:<dex>`. */
export type RewardValue = `pokemon:${string}` | `item:${string}` | `energy:${number}`;

/**
 * The choices of `reward:` (for a task typed in full): the items and Mega Energy of today's list
 * that fit what was typed, then the Pokémon the search finds.
 */
export function rewardChoices(
  ctx: Pick<AppContext, 'researchTasks' | 'pokemon'>,
  typed: string,
): Choice[] {
  const words = searchTokens(typed);
  if (words.length === 0) return [];
  const { items, energies } = listedRewards(ctx);
  const choices: Choice[] = [];
  for (const [key, name] of items) {
    if (hasWords(name, words)) choices.push({ name, value: `item:${key}` });
  }
  for (const [dex, name] of energies) {
    if (hasWords(name, words)) choices.push({ name, value: `energy:${String(dex)}` });
  }
  for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES })) {
    choices.push({ name: truncate(entry.name, CHOICE_NAME), value: `pokemon:${entry.key}` });
  }
  return choices.slice(0, MAX_CHOICES);
}

/**
 * The reward `reward:` names: a choice (`RewardValue`), or text that names one in full (an
 * item of today's list, `<species> Mega Energy` of one, or a Pokémon `ctx.pokemon.exact` knows).
 * A typed reward's quantity is not said (0).
 */
export function readReward(
  ctx: Pick<AppContext, 'researchTasks' | 'pokemon' | 'gameData'>,
  value: string,
): TaskReward {
  const text = value.trim();
  const { catalogue } = ctx.gameData;
  const { items, energies } = listedRewards(ctx);
  const picked = /^(pokemon|item|energy):(.+)$/.exec(text);
  if (picked?.[1] === 'pokemon') {
    const entry = catalogue.byKey(picked[2] ?? '');
    if (entry) return encounterOf(entry);
  } else if (picked?.[1] === 'item' && isItemKey(picked[2] ?? '')) {
    const name = items.get(picked[2] ?? '');
    if (name !== undefined) {
      return { kind: 'item', item: picked[2] ?? '', name, quantity: 0, image: null };
    }
  } else if (picked?.[1] === 'energy') {
    const dex = Number(picked[2]);
    const name = energies.get(dex);
    if (name !== undefined) return { kind: 'energy', dex, name, quantity: 0, image: null };
  }
  const folded = foldTaskText(text);
  for (const [key, name] of items) {
    if (foldTaskText(name) === folded)
      return { kind: 'item', item: key, name, quantity: 0, image: null };
  }
  for (const [dex, name] of energies) {
    if (foldTaskText(name) === folded)
      return { kind: 'energy', dex, name, quantity: 0, image: null };
  }
  const entry = ctx.pokemon.exact(text);
  if (entry) return encounterOf(entry);
  const suggested = rewardChoices(ctx, text)
    .slice(0, 5)
    .map((choice) => plain(choice.name));
  throw new UserError(
    `I do not know "${plain(truncate(text, 80))}" as a reward. ` +
      (suggested.length === 0 ? '' : `Did you mean ${orList(suggested)}? `) +
      'Pick one from the list that appears while you type.',
  );
}

function encounterOf(entry: { key: string; dex: number; name: string }): TaskReward {
  return {
    kind: 'encounter',
    name: entry.name,
    key: entry.key,
    dex: entry.dex,
    shiny: false,
    cp: null,
    image: null,
  };
}

/** Said of a task of several rewards named without its reward, and no "one of" (R2). */
export const PICK_THE_REWARD =
  'That task has several rewards: pick the task with its reward from the list that appears ' +
  'while you type.';

/**
 * The task `task:` names (design 4.3, 9.8; plan 8R-5, R2): a version of the list
 * (`<task>:<hash>`; one no longer on the list is `TASK_LIST_CHANGED`), a task's key or typed text
 * that is the list's task of the same folded text (`listedVersion`: its version by `reward`),
 * else a task typed in full (at most `MAX_TYPED_TASK` characters), whose `reward` is the only
 * reward that makes wants fire: `typed:<text key>`, with the reward's hash after it (R11).
 * Whether a task is still offered is decided in `zone` (the server's, plan 19A-2).
 */
export function readTask(
  ctx: Pick<AppContext, 'researchTasks' | 'pokemon' | 'gameData'>,
  value: string,
  reward: string | null,
  zone: string,
): ResearchSubject {
  const text = tidyLine(value);
  const subject = researchSubjectOf(text);
  if (subject?.hash !== undefined && !subject.task.startsWith('typed:')) {
    const found = ctx.researchTasks.byVersion(text);
    if (!found) throw new ListChanged(TASK_LIST_CHANGED);
    return versionSubject(found.task, found.version);
  }
  if (isTaskKey(text)) {
    const task = ctx.researchTasks.byKey(text);
    if (!task) throw new ListChanged(TASK_LIST_CHANGED);
    return listedVersion(ctx, task, reward);
  }
  if (text === '')
    throw new UserError('Say which task: pick one from the list that appears while you type.');
  const key = taskKeyOf(text);
  const known = ctx.researchTasks.byKey(key);
  // Past its event's end the list no longer has it: "pick it from the list" would be a dead end.
  if (known && taskOffered(known, Date.now(), zone)) return listedVersion(ctx, known, reward);
  if (text.length > MAX_TYPED_TASK) {
    throw new UserError(
      `A task you type may have ${String(MAX_TYPED_TASK)} characters: pick it from the list ` +
        'that appears while you type, or shorten it.',
    );
  }
  const rewards = reward === null || reward.trim() === '' ? [] : [readReward(ctx, reward)];
  const [only] = rewards;
  return {
    subjectKey: versionValue(
      typedSubject(key),
      only === undefined ? undefined : rewardHash(only, ctx.gameData.catalogue),
    ),
    research: { text, category: null, rewards, typed: true },
  };
}

/**
 * The version of a listed task named without its version (R2): with `reward`, the version of
 * that reward (a plain one before a costumed one; refused where the task does not give it, and
 * with `PICK_THE_REWARD` where two versions fit alike);
 * without, its only version, else its "one of", else refused with `PICK_THE_REWARD`.
 */
function listedVersion(
  ctx: Pick<AppContext, 'researchTasks' | 'pokemon' | 'gameData'>,
  task: ResearchTask,
  reward: string | null,
): ResearchSubject {
  const versions = ctx.researchTasks.versions(task);
  if (reward === null || reward.trim() === '') {
    const [only, ...more] = versions;
    const chosen =
      only !== undefined && more.length === 0 ? only : versions.find((one) => one.oneOf);
    if (!chosen) throw new UserError(PICK_THE_REWARD);
    return versionSubject(task, chosen);
  }
  const named = readReward(ctx, reward);
  const matching = versions.filter(
    (one) => !one.oneOf && one.rewards.length === 1 && sameReward(one.rewards[0], named),
  );
  if (matching.length === 0) {
    throw new UserError(
      `${plain(truncate(task.text, 100))} does not give ${plain(named.name)}: pick the reward ` +
        'from the list.',
    );
  }
  // The plain version before a costumed one; two that fit alike (Rare Candy ×1 and ×3) are
  // refused, never one taken silently (review L7).
  const plainOnes = matching.filter((one) => !one.costumed);
  const [chosen, ...others] = plainOnes.length > 0 ? plainOnes : matching;
  if (!chosen || others.length > 0) throw new UserError(PICK_THE_REWARD);
  return versionSubject(task, chosen);
}

/** Whether a reward of the list is the one a member named (`readReward`, without a quantity). */
function sameReward(listedOne: TaskReward | undefined, named: TaskReward): boolean {
  if (listedOne === undefined) return false;
  if (listedOne.kind === 'encounter' && named.kind === 'encounter') {
    return listedOne.key !== null && listedOne.key === named.key;
  }
  if (listedOne.kind === 'item' && named.kind === 'item') return listedOne.item === named.item;
  if (listedOne.kind === 'energy' && named.kind === 'energy') return listedOne.dex === named.dex;
  return false;
}

/** A version of a listed task as a report's subject. */
export function versionSubject(task: ResearchTask, version: TaskVersion): ResearchSubject {
  return {
    subjectKey: version.value,
    research: { text: task.text, category: task.category, rewards: version.rewards, typed: false },
  };
}
