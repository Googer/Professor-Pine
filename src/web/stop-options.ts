import { MAX_TYPED, STOP_OPTIONS } from '../commands/research/research-input.js';
import type { ResearchTask } from '../domain/research/task.js';
import type { TaskVersion } from '../domain/research/versions.js';
import {
  isHideout,
  lineupChoice,
  lineupValue,
  parseRocketKey,
  type RocketCatch,
  type RocketChoice,
} from '../domain/rocket/lineups.js';
import type { PictureLookup } from '../domain/stops/pictures.js';
import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
import { mapCatch, mapReward } from '../domain/web/stop-report-view.js';

/**
 * The pick lists of a research report on the map (plan 8R-3), as `/research` offers them: the
 * whole task list in the page's order (not the autocomplete's 25), each with its key, text,
 * category and rewards (pictures only from `origins`); whether it is out of date (`stale`, the
 * task list's own rule) and when it was read; and the items and Mega Energy of the list
 * (`listedRewards`), which a typed task's `reward` may name besides a Pokémon; the most stops a
 * report names and the longest text typed, `/research report`'s own (`STOP_OPTIONS`,
 * `MAX_TYPED`). Pure.
 */
export function researchOptions(input: {
  tasks: readonly ResearchTask[];
  /** A task's versions as `/research` offers them (plan 8R-5, R13: `ResearchTaskProvider`). */
  versions: (task: ResearchTask) => readonly TaskVersion[];
  readAt: number | undefined;
  stale: boolean;
  listed: { items: ReadonlyMap<string, string>; energies: ReadonlyMap<number, string> };
  origins: readonly string[];
  /**
   * The address of a picture as the post of the stops names it (plan 8M-9B, `StopPictures.url`: the
   * square one, made when the list was read); the source itself without it.
   */
  picture?: PictureLookup;
}): ResearchOptionsView {
  return {
    stale: input.stale,
    readAt: input.readAt ?? null,
    maxStops: STOP_OPTIONS.length,
    maxTyped: MAX_TYPED,
    tasks: input.tasks.map((task) => ({
      key: task.key,
      text: task.text,
      category: task.category,
      rewards: task.rewards.map((reward) => mapReward(reward, input.origins, input.picture)),
      // Each version with the rewards it stands for, as the server decides them (review F2).
      versions: input.versions(task).map(({ value, label, oneOf, rewards }) => ({
        value,
        label,
        oneOf,
        rewards: rewards.map((reward) => mapReward(reward, input.origins, input.picture)),
      })),
    })),
    rewards: [
      ...[...input.listed.items].map(([key, name]) => ({ value: `item:${key}`, name })),
      ...[...input.listed.energies].map(([dex, name]) => ({
        value: `energy:${String(dex)}`,
        name,
      })),
    ],
  };
}

/**
 * The pick list of a Rocket report on the map (plan 8R-3), as `/rocket` offers it
 * (`rocketChoices`, in its order): each who with its key, name, whether it is a hideout, the
 * catches (pictures only from `origins`), Giovanni's note (`giovanniNote`), and a grunt type's
 * two lineups (plan 8R-4L: key, the value `/rocket` takes, label, fingerprint, catches); whether
 * the lineups are out of date (`stale`, their own rule) and when they were read. Pure.
 */
export function rocketOptions(input: {
  choices: readonly RocketChoice[];
  readAt: number | undefined;
  stale: boolean;
  giovanniNote: string;
  origins: readonly string[];
  /** As `researchOptions`' (plan 8M-9B): the square pictures, made when the lineups were read. */
  picture?: PictureLookup;
}): RocketOptionsView {
  const mapped = (caught: RocketCatch) => mapCatch(caught, input.origins, input.picture);
  return {
    stale: input.stale,
    readAt: input.readAt ?? null,
    choices: input.choices.map((choice) => {
      const who = parseRocketKey(choice.key);
      return {
        key: choice.key,
        name: choice.name,
        hideout: who !== undefined && isHideout(who),
        catches: choice.catches.map(mapped),
        ...(who?.kind === 'giovanni' ? { note: input.giovanniNote } : {}),
        ...(choice.lineups === undefined
          ? {}
          : {
              lineups: choice.lineups.map((lineup) => {
                const taken = lineupChoice(choice, lineup);
                return {
                  key: taken.key,
                  value: lineupValue(choice, lineup),
                  label: taken.lineup ?? '',
                  fingerprint: lineup.fingerprint,
                  catches: lineup.catches.map(mapped),
                };
              }),
            }),
      };
    }),
  };
}
