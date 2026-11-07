import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { pageTask, pikachuTask } from '../../../test/support/research.js';
import { feedChoice, rocketChoicesOfFeed } from '../../../test/support/rocket.js';
import {
  REPORTER,
  reportedStop,
  researchReport,
  rocketReport,
} from '../../../test/support/stop-report-cases.js';
import { taskKeyOf, type ResearchTask, type TaskReward } from '../research/task.js';
import { taskVersions, type TaskVersion } from '../research/versions.js';
import { lineupChoice, type RocketChoice } from '../rocket/lineups.js';
import { searchTokens } from '../search/text.js';
import type { ResearchReport, RocketReport } from './report.js';
import { reportSearch, type SearchFacts } from './report-search.js';

/** Today's lineups as the feed of 2026-10-22 has them: the water and untyped grunts have two. */
const FACTS: SearchFacts = {
  lineupsOf: (typeKey) =>
    rocketChoicesOfFeed().find((choice) => choice.key === typeKey)?.lineups?.length ?? 0,
};

/** A research report of a version of a task, as `/research` and the map store it. */
function reported(task: ResearchTask, version: TaskVersion): ResearchReport {
  return {
    ...researchReport({
      subjectKey: version.value,
      research: {
        text: task.text,
        category: task.category,
        rewards: version.rewards,
        typed: false,
      },
    }),
    id: 1,
  };
}

/** The versions of a task of the page of 2026-10-21, by their labels. */
function versionOf(task: ResearchTask, label: string): TaskVersion {
  const found = taskVersions(task, catalogueFixture()).find((version) => version.label === label);
  if (!found) throw new Error(`no version ${label} of ${task.text}`);
  return found;
}

/** A Rocket report of a choice of the lineups, as `/rocket` and the map store it. */
function rocketOf(choice: RocketChoice): RocketReport {
  return {
    ...rocketReport({
      subjectKey: choice.key,
      rocket: {
        name: choice.name,
        catches: choice.catches,
        ...(choice.lineup === undefined ? {} : { lineup: choice.lineup }),
      },
    }),
    id: 2,
  };
}

/** Whether every word typed is found, as typed or as the start of a word of the report's. */
function finds(words: readonly string[], typed: string): boolean {
  return searchTokens(typed).every((word) => words.some((one) => one.startsWith(word)));
}

describe("a report's search words and whether it is confirmed (plan 8M-12)", () => {
  it("finds Spinda's curveball task by its reward and by the words of its task", () => {
    const task = pageTask('Make 5 Great Curveball Throws in a row');
    const { words, unconfirmed } = reportSearch(reported(task, versionOf(task, 'Spinda 4')), FACTS);
    expect(finds(words, 'spinda')).toBe(true);
    expect(finds(words, 'curve')).toBe(true);
    expect(finds(words, 'great curveball in a row')).toBe(true);
    expect(finds(words, 'skiddo')).toBe(false);
    // One reward: it is confirmed.
    expect(unconfirmed).toBeUndefined();
  });

  it('marks Skiddo in a pool of six encounters as not confirmed, and finds it by any of them', () => {
    const task = pageTask('Catch 10 Grass-type Pokémon');
    const oneOf = taskVersions(task, catalogueFixture()).find((version) => version.oneOf);
    if (!oneOf) throw new Error('no "one of"');
    const { words, unconfirmed } = reportSearch(reported(task, oneOf), FACTS);
    expect(finds(words, 'Skiddo')).toBe(true);
    expect(finds(words, 'petilil')).toBe(true);
    expect(unconfirmed).toEqual({ kind: 'one-of', count: 6, encounters: true });
    // Skiddo told: confirmed.
    const told = reportSearch(reported(task, versionOf(task, 'Skiddo')), FACTS);
    expect(told.unconfirmed).toBeUndefined();
    expect(finds(told.words, 'petilil')).toBe(false);
  });

  it('finds the costumed Pikachu as costumed, and the plain one not', () => {
    const { task, plain, costumed } = pikachuTask();
    expect(finds(reportSearch(reported(task, costumed), FACTS).words, 'costumed pikachu')).toBe(
      true,
    );
    expect(finds(reportSearch(reported(task, costumed), FACTS).words, 'costume')).toBe(true);
    expect(finds(reportSearch(reported(task, plain), FACTS).words, 'pikachu')).toBe(true);
    expect(finds(reportSearch(reported(task, plain), FACTS).words, 'costumed')).toBe(false);
  });

  it("finds an event's Cosmog by its name, accents and case ignored, and a Pikachu wearing its suit", () => {
    const encounter = (name: string, key: string, dex: number): TaskReward => ({
      kind: 'encounter',
      name,
      key,
      dex,
      shiny: false,
      cp: null,
      image: null,
    });
    const text = 'Win 3 raids';
    const task: ResearchTask = {
      key: taskKeyOf(text),
      text,
      category: 'Ultra Unlock Tasks',
      rewards: [encounter('Cosmog', 'cosmog', 789)],
    };
    const { words } = reportSearch(reported(task, versionOf(task, 'Cosmog')), FACTS);
    expect(finds(words, 'COSMOG')).toBe(true);
    expect(finds(words, 'cos')).toBe(true);
    expect(finds(words, 'raids')).toBe(true);
    const suit = encounter('Pikachu wearing a Cosmog suit', 'pikachu', 25);
    const worn = reportSearch(
      reported({ ...task, rewards: [suit] }, versionOf({ ...task, rewards: [suit] }, suit.name)),
      FACTS,
    );
    expect(finds(worn.words, 'cosmog pikachu')).toBe(true);
    expect(finds(worn.words, 'costume')).toBe(true);
  });

  it('finds an item or Mega Energy reward by its name', () => {
    const task = pageTask('Catch a Dragon-type Pokémon');
    const candy = reportSearch(reported(task, versionOf(task, 'Rare Candy ×3')), FACTS);
    expect(finds(candy.words, 'rare candy')).toBe(true);
    expect(candy.unconfirmed).toBeUndefined();
    const grass = pageTask('Catch 10 Grass-type Pokémon');
    const energy = reportSearch(
      reported(grass, versionOf(grass, 'Venusaur Mega Energy ×10')),
      FACTS,
    );
    expect(finds(energy.words, 'venusaur mega')).toBe(true);
  });

  it('marks a task typed in full without its reward as not reported', () => {
    const report: ResearchReport = {
      ...researchReport({
        subjectKey: 'typed:0000000000000001',
        research: { text: 'Catch 3 Pawniard', category: null, rewards: [], typed: true },
      }),
      id: 3,
    };
    const { words, unconfirmed } = reportSearch(report, FACTS);
    expect(finds(words, 'pawniard')).toBe(true);
    expect(unconfirmed).toEqual({ kind: 'no-reward' });
  });

  it('finds a dragon grunt by its type and the Pokémon of its lineup, confirmed', () => {
    const { words, unconfirmed } = reportSearch(rocketOf(feedChoice('grunt:dragon')), FACTS);
    expect(finds(words, 'dragon')).toBe(true);
    expect(finds(words, 'deino')).toBe(true);
    expect(finds(words, 'grunt')).toBe(true);
    expect(finds(words, 'rocket')).toBe(true);
    // The dragon grunts have one lineup: nothing to confirm.
    expect(unconfirmed).toBeUndefined();
  });

  it('marks a water grunt reported "not sure which" of its two lineups as not confirmed', () => {
    const water = feedChoice('grunt:water');
    const { words, unconfirmed } = reportSearch(rocketOf(water), FACTS);
    expect(unconfirmed).toEqual({ kind: 'not-sure-which', count: 2 });
    expect(finds(words, 'magikarp')).toBe(true);
    expect(finds(words, 'mudkip')).toBe(true);
    const [, magikarp] = water.lineups ?? [];
    if (!magikarp) throw new Error('two lineups');
    const lineup = reportSearch(rocketOf(lineupChoice(water, magikarp)), FACTS);
    expect(lineup.unconfirmed).toBeUndefined();
    expect(finds(lineup.words, 'feebas')).toBe(true);
    expect(finds(lineup.words, 'mudkip')).toBe(false);
  });

  it('finds Giovanni, the leaders and the decoy by name', () => {
    const giovanni = reportSearch(rocketOf(feedChoice('giovanni')), FACTS);
    expect(finds(giovanni.words, 'giovanni')).toBe(true);
    expect(finds(giovanni.words, 'zekrom')).toBe(true);
    expect(giovanni.unconfirmed).toBeUndefined();
    expect(finds(reportSearch(rocketOf(feedChoice('leader:arlo')), FACTS).words, 'arlo')).toBe(
      true,
    );
    expect(finds(reportSearch(rocketOf(feedChoice('leader:arlo')), FACTS).words, 'leader')).toBe(
      true,
    );
    expect(finds(reportSearch(rocketOf(feedChoice('decoy')), FACTS).words, 'decoy')).toBe(true);
  });

  it('reads the stored report alone: a reporter or a stop is no search word', () => {
    const report: RocketReport = {
      ...rocketReport({ stop: reportedStop(7, { name: 'Spinda Fountain' }), reporter: REPORTER }),
      id: 4,
    };
    const { words } = reportSearch(report, FACTS);
    expect(finds(words, 'brock')).toBe(false);
    expect(finds(words, 'fountain')).toBe(false);
  });

  it('works out a report’s words once per report, its mark by the lineups of each ask (plan map-speed)', () => {
    const report: RocketReport = { ...rocketReport({ subjectKey: 'grunt:water' }), id: 5 };
    const first = reportSearch(report, FACTS);
    expect(first.unconfirmed).toEqual({ kind: 'not-sure-which', count: 2 });
    // The same report object: the very same words; the lineups of the day changed, its mark too.
    const later = reportSearch(report, { lineupsOf: () => 1 });
    expect(later.words).toBe(first.words);
    expect(later).not.toHaveProperty('unconfirmed');
    // A changed report is another object, with words of its own.
    const changed: RocketReport = {
      ...report,
      rocket: { ...report.rocket, name: 'Fire-type grunt' },
    };
    expect(finds(reportSearch(changed, FACTS).words, 'fire')).toBe(true);
    expect(finds(reportSearch(report, FACTS).words, 'fire')).toBe(false);
  });
});
