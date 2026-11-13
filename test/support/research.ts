import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseResearchPage } from '../../src/domain/research/leekduck.js';
import { taskKeyOf, type ResearchTask, type TaskReward } from '../../src/domain/research/task.js';
import {
  taskVersions,
  versionIndex,
  type TaskVersion,
  type VersionIndex,
} from '../../src/domain/research/versions.js';
import type { ResearchTaskProvider } from '../../src/services/research-task-service.js';
import { catalogueFixture } from './game-data.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Leek Duck's research page (`https://leekduck.com/research/`) as Pine's User-Agent got it on
 * 2026-10-21 at 21:40, unchanged: 58 tasks in 8 categories with 299 rewards (encounters, items
 * and Mega Energy), and the research breakthrough after them.
 */
export function readResearchPage(): string {
  return readFileSync(path.join(fixtures, 'leekduck-research.html'), 'utf8');
}

let parsed: readonly ResearchTask[] | undefined;

/** The tasks of the page of 2026-10-21, read once and shared (read-only). */
export function researchTasksOfPage(): readonly ResearchTask[] {
  parsed ??= Object.freeze(
    parseResearchPage(readResearchPage(), catalogueFixture(), 'America/New_York').tasks,
  );
  return parsed;
}

/**
 * A task list as handlers read it (`ResearchTaskProvider`): the tasks of the page of 2026-10-21
 * unless given, read at `readAt` (`null`: never read), out of date `staleAfterHours` later (the
 * settings' default, 6).
 */
export function researchTasksFixture(
  given?: readonly ResearchTask[],
  readAt: number | null = Date.UTC(2026, 9, 21, 21, 40),
  staleAfterHours = 6,
): ResearchTaskProvider {
  // Read when first asked: most contexts never ask.
  let byKey: Map<string, ResearchTask> | undefined;
  let versions: VersionIndex | undefined;
  const tasks = (): readonly ResearchTask[] => given ?? researchTasksOfPage();
  const index = (): VersionIndex => (versions ??= versionIndex(tasks(), catalogueFixture()));
  return {
    tasks,
    storedTasks: tasks,
    byKey: (key) => (byKey ??= new Map(tasks().map((task) => [task.key, task]))).get(key),
    readAt: () => readAt ?? undefined,
    stale: (now) => readAt === null || now - readAt >= staleAfterHours * 3_600_000,
    versions: (task) => index().of(task),
    byVersion: (value) => index().byValue(value),
  };
}

/** A Pikachu reward by its picture of Leek Duck's (`pm25.fPXP_2026.icon.png`: costumed). */
function pikachu(picture: string): TaskReward {
  return {
    kind: 'encounter',
    name: 'Pikachu',
    key: 'pikachu',
    dex: 25,
    shiny: false,
    cp: null,
    image: `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/${picture}`,
  };
}

/**
 * A task of two Pikachu, plain and costumed, both named "Pikachu" by the page (plan 8R-5,
 * review W1), and its versions: the plain one, the costumed one and "one of" them.
 */
export function pikachuTask(): {
  task: ResearchTask;
  plain: TaskVersion;
  costumed: TaskVersion;
  oneOf: TaskVersion;
} {
  const text = 'Catch 5 Electric-type Pokémon';
  const task: ResearchTask = {
    key: taskKeyOf(text),
    text,
    category: 'Catching',
    rewards: [pikachu('pm25.icon.png'), pikachu('pm25.fPXP_2026.icon.png')],
  };
  const [plain, costumed, oneOf] = taskVersions(task, catalogueFixture());
  if (!plain || !costumed || !oneOf) throw new Error('three versions');
  return { task, plain, costumed, oneOf };
}

/** A task of the page of 2026-10-21 by its text; throws for one it does not list. */
export function pageTask(text: string): ResearchTask {
  const found = researchTasksOfPage().find((task) => task.text === text);
  if (!found) throw new Error(`the page lists no task "${text}"`);
  return found;
}
