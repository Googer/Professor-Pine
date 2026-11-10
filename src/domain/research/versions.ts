import type { PokemonCatalogue } from '../pogo/catalogue.js';
import { costumedByName } from '../pogo/costumes.js';
import { hexHash } from '../short-hash.js';
import { rewardsInShort, type ResearchTask, type TaskReward } from './task.js';

/*
 * The versions of a field research task (plan 8R-5; design
 * `2026-10-23-research-rewards-apart-design.md`): a task Leek Duck lists with several rewards is
 * in the game several tasks of one text, each with one reward, the same all day at a stop. So a
 * report is of one version: one reward (`<task key>:<reward hash>`), or, for a task of two or
 * more encounters, "one of" them (the task's key alone), since an encounter is not shown before
 * the task is done. Pure.
 */

/**
 * What tells two rewards of a task apart: its kind and what it is; an encounter also whether it
 * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two), which only the catalogue
 * tells: without it, none is.
 */
export function rewardKey(reward: TaskReward, catalogue?: PokemonCatalogue): string {
  switch (reward.kind) {
    case 'encounter':
      return `e:${reward.key ?? reward.name}${rewardIsCostumed(reward, catalogue) ? ':costumed' : ''}`;
    case 'item':
      return `i:${reward.item}:${String(reward.quantity)}`;
    case 'energy':
      return `m:${reward.name}:${String(reward.quantity)}`;
  }
}

/** Whether an encounter is costumed, by its Leek Duck name and picture (`costumedByName`). */
function rewardIsCostumed(reward: TaskReward, catalogue?: PokemonCatalogue): boolean {
  return (
    catalogue !== undefined &&
    reward.kind === 'encounter' &&
    costumedByName(catalogue, reward.name, reward.image ?? undefined)
  );
}

/** A reward's hash in a version's subject: 8 hex digits of FNV-1a of its `rewardKey`. */
export function rewardHash(reward: TaskReward, catalogue?: PokemonCatalogue): string {
  return hexHash(rewardKey(reward, catalogue));
}

/** A version's subject: `<task>:<reward hash>`, or the task alone ("one of", or no reward). */
export function versionValue(task: string, hash?: string): string {
  return hash === undefined ? task : `${task}:${hash}`;
}

/**
 * A version of a task, as `/research report` and the map offer it (R1): its value (the report's
 * `subjectKey`), its label (the reward's words: `Gible`, `Rare Candy ×3`, `Pikachu wearing a
 * Cosmog suit (costumed)`, `one of Gible, Bulbasaur`), the rewards it stands for (one, the
 * encounters of "one of", none for a task of no reward), and whether it is "one of".
 */
export interface TaskVersion {
  value: string;
  label: string;
  rewards: TaskReward[];
  oneOf: boolean;
  /** Whether it is a costumed reward's version (plan 8R-4: kept apart from the plain one). */
  costumed: boolean;
}

/**
 * A reward as a version carries it (review W1): a costumed encounter marked `costumed`, so that
 * every place that words it says so (`rewardsInShort`), not only the pick list.
 */
function versionReward(reward: TaskReward, catalogue: PokemonCatalogue | undefined): TaskReward {
  return reward.kind === 'encounter' && rewardIsCostumed(reward, catalogue)
    ? { ...reward, costumed: true }
    : reward;
}

/** A reward's words as a version's label (`rewardsInShort`, `(costumed)` included). */
function rewardLabel(reward: TaskReward, catalogue: PokemonCatalogue | undefined): string {
  return rewardsInShort([versionReward(reward, catalogue)]);
}

/**
 * The words of "one of" (R12): `one of Gible, Bulbasaur, Axew +2`, the rewards `first` matches
 * (the reward typed, the member's) before the others, each group in its order.
 */
export function oneOfLabel(
  rewards: readonly TaskReward[],
  first?: (reward: TaskReward) => boolean,
  catalogue?: PokemonCatalogue,
): string {
  const ordered =
    first === undefined
      ? rewards
      : [
          ...rewards.filter((reward) => first(reward)),
          ...rewards.filter((reward) => !first(reward)),
        ];
  const names = ordered.map((reward) => rewardLabel(reward, catalogue));
  const shown = names.slice(0, 3).join(', ');
  return `one of ${names.length > 3 ? `${shown} +${String(names.length - 3)}` : shown}`;
}

/** A version found by its value, with its task. */
export interface FoundVersion {
  task: ResearchTask;
  version: TaskVersion;
}

/** The versions of a task list, worked out once (R1): by task and by value. */
export interface VersionIndex {
  of(task: ResearchTask): readonly TaskVersion[];
  byValue(value: string): FoundVersion | undefined;
}

/** The versions of every task of a list, by task key and by value. */
export function versionIndex(
  tasks: readonly ResearchTask[],
  catalogue: PokemonCatalogue,
): VersionIndex {
  const byTask = new Map<string, TaskVersion[]>();
  const byValue = new Map<string, FoundVersion>();
  for (const task of tasks) {
    const versions = taskVersions(task, catalogue);
    byTask.set(task.key, versions);
    for (const version of versions) byValue.set(version.value, { task, version });
  }
  return {
    of: (task) => byTask.get(task.key) ?? taskVersions(task, catalogue),
    byValue: (value) => byValue.get(value),
  };
}

/**
 * The versions of a task (R1): one per reward in the page's order (one listed twice once, by
 * `rewardKey`), then "one of" its encounters
 * where it has two or more (its items and Mega Energy left out: they show before the task is
 * done). A task of no reward is one version, its key alone.
 */
export function taskVersions(task: ResearchTask, catalogue: PokemonCatalogue): TaskVersion[] {
  if (task.rewards.length === 0) {
    return [{ value: task.key, label: '', rewards: [], oneOf: false, costumed: false }];
  }
  // A reward listed twice (shiny or not, which `rewardKey` leaves out) is one version, the
  // first kept (review W4): two of one value would be two choices of one report.
  const seen = new Set<string>();
  const rewards = task.rewards.filter((reward) => {
    const key = rewardKey(reward, catalogue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const versions = rewards.map((reward): TaskVersion => ({
    value: versionValue(task.key, rewardHash(reward, catalogue)),
    label: rewardLabel(reward, catalogue),
    rewards: [versionReward(reward, catalogue)],
    oneOf: false,
    costumed: rewardIsCostumed(reward, catalogue),
  }));
  const encounters = rewards
    .filter((reward) => reward.kind === 'encounter')
    .map((reward) => versionReward(reward, catalogue));
  if (encounters.length >= 2) {
    versions.push({
      value: task.key,
      label: oneOfLabel(encounters, undefined, catalogue),
      rewards: encounters,
      oneOf: true,
      costumed: false,
    });
  }
  return versions;
}
