/**
 * Updates the data of the Gantt chart (`docs/superpowers/gantt-data.js`) for one step of work,
 * so that the chart follows the work task by task. Times are commit times.
 *
 *   npm run gantt -- done <task id> <commit>            the task is done: it ends at the commit
 *                                                       and starts where the task before it ended
 *   npm run gantt -- status <id> <status>               done | review | progress | todo | unplanned
 *   npm run gantt -- planning <plan id> <from> [<to>]   the planning of a plan, between two commits
 *                                                       (without <to>: until now)
 *   npm run gantt -- proto-review <plan id> <from> <to> the reviews of the prototype and their fixes,
 *                                                       inside the planning (drawn as "In review")
 *   npm run gantt -- review <plan id> <from> <to>       the review and its fixes after the tasks;
 *                                                       the plan is done
 *   npm run gantt -- touch                              only the time of the last update
 *
 * Every call sets the time of the last update to now.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Span {
  start: string;
  end: string;
}

interface Item {
  id: string;
  kind: 'phase' | 'plan' | 'task';
  parent?: string;
  name: string;
  status?: string;
  start?: string;
  end?: string;
  size?: number;
  /** With `review`: the part of the planning in which the prototype was reviewed and fixed. */
  planning?: Span & { review?: Span };
  review?: Span;
  [more: string]: unknown;
}

interface Chart {
  updated: string;
  items: Item[];
}

const FILE = path.resolve(import.meta.dirname, '../../docs/superpowers/gantt-data.js');
const PREFIX = 'window.GANTT = ';
const STATUSES = ['done', 'review', 'progress', 'todo', 'unplanned'];

function read(): { head: string; chart: Chart } {
  const text = readFileSync(FILE, 'utf8').replaceAll('\r\n', '\n');
  // The assignment at the start of a line: the notes above it name it too.
  const at =
    text.indexOf(`
${PREFIX}`) + 1;
  if (at < 1) throw new Error(`${FILE} does not assign window.GANTT`);
  const json = text.slice(at + PREFIX.length).replace(/;\s*$/, '');
  return { head: text.slice(0, at), chart: JSON.parse(json) as Chart };
}

function write(head: string, chart: Chart): void {
  writeFileSync(FILE, `${head}${PREFIX}${JSON.stringify(chart, null, 2)};\n`);
}

/** A moment as the chart writes it: local time, to the minute. */
function stamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return (
    `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `T${two(date.getHours())}:${two(date.getMinutes())}`
  );
}

/** When a commit was made. */
function commitTime(commit: string): string {
  const seconds = execFileSync('git', ['log', '-1', '--format=%ct', commit], { encoding: 'utf8' });
  return stamp(new Date(Number(seconds.trim()) * 1000));
}

function usage(): never {
  throw new Error(
    'Usage: done <task id> <commit> | status <id> <status> | planning <plan id> <from> [<to>] | ' +
      'proto-review <plan id> <from> <to> | review <plan id> <from> <to> | touch',
  );
}

const [command, id, first, second] = process.argv.slice(2);
const { head, chart } = read();
const item = (wanted: string | undefined): Item => {
  const found = chart.items.find((candidate) => candidate.id === wanted);
  if (!found) throw new Error(`The chart has no row ${wanted ?? '(none given)'}`);
  return found;
};
const now = stamp(new Date());

switch (command) {
  case 'done': {
    if (first === undefined) usage();
    const task = item(id);
    const end = commitTime(first);
    // It starts where the task before it ended; the first task, where the planning ended.
    const siblings = chart.items.filter((other) => other.parent === task.parent);
    const before = siblings[siblings.indexOf(task) - 1];
    const parent = chart.items.find((other) => other.id === task.parent);
    const start = before?.end ?? parent?.planning?.end ?? end;
    task.status = 'done';
    task.start = start <= end ? start : end;
    task.end = end;
    delete task.size;
    break;
  }
  case 'status': {
    if (first === undefined || !STATUSES.includes(first)) usage();
    item(id).status = first;
    break;
  }
  case 'planning': {
    if (first === undefined) usage();
    const plan = item(id);
    plan.planning = {
      ...plan.planning,
      start: commitTime(first),
      end: second === undefined ? now : commitTime(second),
    };
    break;
  }
  case 'proto-review': {
    if (first === undefined || second === undefined) usage();
    const plan = item(id);
    if (!plan.planning) throw new Error(`Row ${plan.id} has no planning yet`);
    plan.planning.review = { start: commitTime(first), end: commitTime(second) };
    break;
  }
  case 'review': {
    if (first === undefined || second === undefined) usage();
    item(id).review = { start: commitTime(first), end: commitTime(second) };
    item(id).status = 'done';
    break;
  }
  case 'touch':
    break;
  default:
    usage();
}

chart.updated = now;
write(head, chart);
process.stdout.write(`gantt: ${[command, id].filter(Boolean).join(' ')} (updated ${now})
`);
