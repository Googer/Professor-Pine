import type {
  HiddenReport,
  MapResearch,
  MapReward,
  ResearchOptionsView,
  ResearchTaskOption,
} from '../../domain/web/stop-report-data.js';
import { holdsSubject, taskOfSubject } from '../../domain/research/reports.js';
import { sendButton } from './form-buttons.js';
import type { PageNode } from './popup.js';
import { nearestPart, type Nearest } from './report-flow.js';
import { STOP_GONE } from './rocket-forms.js';
import type { StopAnswered } from './stop-forms.js';
import type { LatLon } from './view.js';

/*
 * The field research form of the live map (plan 8M-9B, goals 7 and 8; B8: in the side pane, docked
 * under the map on a phone, as the meetup and train forms), the part with no page in it. A new
 * report: the task searched for in the whole list (`/api/research-options`, the server's order, an
 * event's tasks first, grouped by `category`), then its version where it has several (one reward
 * each, then "one of", with the rewards' pictures; a task of one version takes it without asking);
 * a task the list lacks typed in full with its reward ("I can't find my task"); the stops: the one
 * it was opened on and up to four more picked on the map ("Add stops…"). "Same task at more
 * stops…" (`sameAs`): the task of a report standing, at up to four more stops. Its Submit
 * (`submitResearch`) sends `POST …/api/research` and does what the answer says by its machine
 * parts (B4): made, the form closes; every stop reported already (`reason: 'already'`), the form
 * closes with its words; the report `sameAs`
 * named gone (`reason: 'ended'`), a listed one sent again by its task with `more: true`, a typed
 * one (or a listed one whose task the list lost since) turned into a new report's form; the list
 * changed (`reason: 'list-changed'`), the lists asked for again, the pick kept where still listed;
 * other members' reports it contradicts (`asks`), the contradiction question in the form, an
 * unticked checkbox per report, Report sending it again with `replacing` (none ticked: `[]`),
 * Cancel sending nothing (R7); a stop gone (404), the page's own words (B6).
 */

/**
 * A stop picked for the report: its key as `/api/stops` names it, its name, and where it is
 * (re-review X2: "Add stops…" zooms to the form's last stop and measures the nearest from it).
 */
export interface PickedStop {
  key: string;
  name: string;
  at?: LatLon;
}

/** What the form holds, kept when it is drawn anew. */
export interface ResearchFormState {
  /** The words searched for in the task list. */
  query: string;
  /** The task picked, by its key. */
  task?: string;
  /** Its version picked, by its value. */
  version?: string;
  /** "I can't find my task": the task and its reward typed in full. */
  typing?: { task: string; reward: string };
  /** The contradiction question (422 `asks`): its words and the reports it names. */
  asks?: { text: string; reports: MapResearch[]; hidden: HiddenReport[] };
  /** "Add stops…" is picking stops on the map. */
  adding?: boolean;
  /**
   * While it adds, the nearest stops of the view not in the report yet, as the Report button's
   * step 2 lists them (`nearestPart`), or why it has none (branch review W6).
   */
  nearest?: Nearest;
  /** Its report is on its way: every button is drawn off (review F3), whatever draws the form. */
  sending?: boolean;
}

/** What a report of the form is of: its version's value (`subjectKey`), and whether "one of". */
export interface FormSubject {
  subjectKey: string;
  oneOf: boolean;
}

/**
 * What the form reports, as far as it is picked (plan 8M-11A, S18): "Same task at more stops…"'s
 * report's version; else the version picked of the task list (`lists`); none before one is picked,
 * or for a typed task.
 */
export function formSubject(
  state: ResearchFormState,
  mode: ResearchMode,
  lists: Pick<ResearchOptionsView, 'tasks'> | undefined,
): FormSubject | undefined {
  if (mode.kind === 'more') return { subjectKey: mode.report.task, oneOf: mode.report.oneOf };
  const version = lists?.tasks
    .find((task) => task.key === state.task)
    ?.versions.find((one) => one.value === state.version);
  return version === undefined ? undefined : { subjectKey: version.value, oneOf: version.oneOf };
}

/**
 * The stops whose research report standing now holds the form's subject already (plan 8M-11A,
 * S18), by the rule "Same task at more stops…" on Discord uses (`holdsSubject`): Add stops… and
 * "Same task at more stops…" on the map leave them out. None before a subject is picked.
 */
export function heldStops(
  reports: readonly Pick<MapResearch, 'stop' | 'task' | 'endsAt'>[],
  subject: FormSubject | undefined,
  now: number,
): Set<string> {
  if (subject === undefined) return new Set();
  return new Set(
    reports
      .filter((report) => report.endsAt > now && holdsSubject(report.task, subject))
      .map((report) => report.stop.key),
  );
}

/** The button that brings the task list back where the task is shown alone (plan 8M-11A, S26). */
export const CHANGE_TASK = 'Change task';

const changeTaskButton: PageNode = {
  tag: 'button',
  className: 'press',
  text: CHANGE_TASK,
  attributes: { type: 'button', 'data-change-task': '' },
};

/**
 * "Change task" (plan 8M-11A, S26): the task list back with the task kept as the selection. From
 * the contradiction question, its task and reward as they were; from "Same task at more
 * stops…", a new report of the list with its report's version picked (the task whose versions
 * name it, else whose key is its task's), the stops as they are; a typed task is in no list, and
 * nothing is picked.
 */
export function taskChanged(
  state: ResearchFormState,
  mode: ResearchMode,
  options: Pick<ResearchOptionsView, 'tasks'> | undefined,
): { state: ResearchFormState; mode: ResearchMode } {
  const { asks: _asks, ...rest } = state;
  if (mode.kind === 'new') return { state: rest, mode };
  const subject = mode.report.task;
  const task =
    options?.tasks.find((one) => one.versions.some((version) => version.value === subject)) ??
    options?.tasks.find((one) => one.key === taskOfSubject(subject));
  const version = task?.versions.find((one) => one.value === subject)?.value;
  return {
    state: {
      ...rest,
      ...(task === undefined ? {} : { task: task.key }),
      ...(version === undefined ? {} : { version }),
    },
    mode: { kind: 'new' },
  };
}

/** A tree of the form with every button off while its report is sent (review F3). */
function offWhileSending(node: PageNode, state: ResearchFormState): PageNode {
  if (state.sending !== true) return node;
  const off = (one: PageNode): PageNode => ({
    ...one,
    ...(one.tag === 'button' ? { attributes: { ...one.attributes, disabled: '' } } : {}),
    ...(one.children === undefined ? {} : { children: one.children.map(off) }),
  });
  return off(node);
}

/** What the form reports: a task of the list or typed, or the task of a report (`sameAs`). */
export type ResearchMode = { kind: 'new' } | { kind: 'more'; report: MapResearch };

/**
 * "Report research here" in a stop's popup: the form in the side pane, with the stop (where it
 * is too, re-review X2: `pickedFrom` reads it back).
 */
export function researchButton(stop: PickedStop): PageNode {
  return {
    tag: 'button',
    className: 'press place-control',
    text: 'Report research here',
    attributes: {
      type: 'button',
      'data-report-research': stop.key,
      'data-stop-name': stop.name,
      ...(stop.at
        ? { 'data-stop-lat': String(stop.at.lat), 'data-stop-lon': String(stop.at.lon) }
        : {}),
    },
  };
}

/** The stop a "Report research here" button names (`researchButton`), or none. */
export function pickedFrom(
  data: Readonly<Record<string, string | undefined>>,
): PickedStop | undefined {
  const key = data.reportResearch;
  if (key === undefined) return undefined;
  const lat = Number(data.stopLat);
  const lon = Number(data.stopLon);
  const at =
    data.stopLat !== undefined &&
    data.stopLon !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
      ? { at: { lat, lon } }
      : {};
  return { key, name: data.stopName ?? key, ...at };
}

/** "Same task at more stops…" on a research report of a popup (goal 8). */
export function sameTaskButton(report: Pick<MapResearch, 'id'>): PageNode {
  return {
    tag: 'button',
    className: 'link-button',
    text: 'Same task at more stops…',
    attributes: { type: 'button', 'data-same-task': String(report.id) },
  };
}

/** Folded for a search: no case, accents or apostrophes. */
const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/['’]/gu, '').toLowerCase();

/** The tasks a search shows, in the list's order: every word typed in its text or rewards. */
export function tasksFound(
  tasks: readonly ResearchTaskOption[],
  query: string,
): ResearchTaskOption[] {
  const words = fold(query)
    .split(/\s+/u)
    .filter((word) => word !== '');
  return tasks.filter((task) => {
    const said = fold([task.text, ...task.rewards.map((reward) => reward.name)].join(' '));
    return words.every((word) => said.includes(word));
  });
}

/** Small pictures of rewards, each named. */
function rewardPictures(rewards: readonly MapReward[]): PageNode[] {
  const shown = rewards.flatMap((reward): PageNode[] =>
    reward.image === undefined
      ? []
      : [
          {
            tag: 'img',
            className: 'small-picture',
            attributes: {
              src: reward.image,
              alt: reward.name,
              title: reward.name,
              draggable: 'false',
            },
          },
        ],
  );
  return shown.length === 0 ? [] : [{ tag: 'span', className: 'small-pictures', children: shown }];
}

/**
 * The stops of the form as chips with ×, "Add stops…" while there is room: `maxStops` of the
 * lists (branch review W4), unknown until they come. While it adds, the nearest stops to add as
 * buttons, or why there are none (branch review W6).
 */
function stopsPart(
  stops: readonly PickedStop[],
  state: ResearchFormState,
  more: boolean,
  maxStops: number | undefined,
): PageNode[] {
  const adding = state.adding === true;
  return [
    {
      tag: 'div',
      className: 'form-row stop-chips',
      children: [
        { tag: 'span', text: more ? 'More stops' : stops.length > 1 ? 'Stops' : 'Stop' },
        {
          tag: 'div',
          className: 'chips',
          children: stops.map((stop): PageNode => ({
            tag: 'span',
            className: 'stop-chip',
            children: [
              { tag: 'span', text: stop.name },
              {
                tag: 'button',
                className: 'clear-filter',
                text: '×',
                attributes: {
                  type: 'button',
                  'data-remove-stop': stop.key,
                  'aria-label': `Leave out ${stop.name}`,
                },
              },
            ],
          })),
        },
        ...(adding
          ? [
              {
                tag: 'p',
                className: 'hint',
                attributes: { 'aria-live': 'polite' },
                text:
                  maxStops === undefined
                    ? 'Tap PokéStops on the map to add them.'
                    : `Tap PokéStops on the map to add them (up to ${String(maxStops)} in all).`,
              },
              ...nearestPart(state.nearest, 'stops'),
              {
                tag: 'button',
                className: 'press',
                text: 'Done adding',
                attributes: { type: 'button', 'data-add-stops': 'done' },
              },
            ]
          : maxStops === undefined || stops.length < maxStops
            ? [
                {
                  tag: 'button',
                  className: 'press',
                  text: 'Add stops…',
                  attributes: { type: 'button', 'data-add-stops': 'start' },
                },
              ]
            : []),
      ],
    },
  ];
}

/**
 * The tasks a search finds, grouped by category, one picked: drawn anew alone as the search is
 * typed in (review F3: the field itself is kept).
 */
export function taskList(options: ResearchOptionsView, state: ResearchFormState): PageNode {
  const found = tasksFound(options.tasks, state.query);
  const groups = new Map<string, ResearchTaskOption[]>();
  for (const task of found) groups.set(task.category, [...(groups.get(task.category) ?? []), task]);
  const list: PageNode = {
    tag: 'div',
    className: 'task-list',
    attributes: { role: 'group', 'aria-label': 'Tasks' },
    children:
      found.length === 0
        ? [{ tag: 'p', className: 'hint', text: 'No task of the list has these words.' }]
        : [...groups].flatMap(([category, tasks]): PageNode[] => [
            { tag: 'h4', text: category },
            ...tasks.map((task): PageNode => ({
              tag: 'button',
              className: 'task-choice',
              attributes: {
                type: 'button',
                'data-task': task.key,
                'aria-pressed': String(task.key === state.task),
              },
              children: [
                { tag: 'span', className: 'task-text', text: task.text },
                ...rewardPictures(task.rewards),
              ],
            })),
          ]),
  };
  return offWhileSending(list, state);
}

/** The task list: a search box, then the tasks it finds (`taskList`). */
function tasksPart(options: ResearchOptionsView, state: ResearchFormState): PageNode[] {
  return [
    {
      tag: 'label',
      className: 'form-row',
      children: [
        { tag: 'span', text: 'Task' },
        {
          tag: 'input',
          attributes: {
            name: 'query',
            type: 'search',
            placeholder: 'Search the tasks or rewards',
            autocomplete: 'off',
            value: state.query,
          },
        },
      ],
    },
    taskList(options, state),
  ];
}

/** The versions of the task picked, where it has several: a radio each with its pictures. */
function versionsPart(
  task: ResearchTaskOption | undefined,
  picked: string | undefined,
): PageNode[] {
  if (!task || task.versions.length < 2) return [];
  return [
    {
      tag: 'fieldset',
      className: 'form-choice',
      children: [
        { tag: 'legend', text: 'Its reward' },
        ...task.versions.map((version): PageNode => ({
          tag: 'label',
          className: 'choice',
          children: [
            {
              tag: 'input',
              attributes: {
                type: 'radio',
                name: 'version',
                value: version.value,
                ...(version.value === picked ? { checked: '' } : {}),
              },
            },
            {
              tag: 'span',
              className: 'choice-words',
              children: [
                { tag: 'span', className: 'choice-label', text: version.label },
                // The rewards the server says it stands for (review F2).
                ...rewardPictures(version.rewards),
              ],
            },
          ],
        })),
      ],
    },
  ];
}

/** "I can't find my task": the task and its reward typed in full, the reward offered as typed. */
function typingPart(options: ResearchOptionsView, typing: ResearchFormState['typing']): PageNode[] {
  if (typing === undefined) {
    return [
      {
        tag: 'button',
        className: 'link-button',
        text: 'I can’t find my task',
        attributes: { type: 'button', 'data-typing': 'start' },
      },
    ];
  }
  const names = new Set([
    ...options.rewards.map((reward) => reward.name),
    ...options.tasks.flatMap((task) => task.rewards.map((reward) => reward.name)),
  ]);
  return [
    {
      tag: 'label',
      className: 'form-row',
      children: [
        { tag: 'span', text: 'The task, in full' },
        {
          tag: 'input',
          attributes: {
            name: 'typedTask',
            type: 'text',
            maxlength: String(options.maxTyped),
            autocomplete: 'off',
            placeholder: 'As the game words it',
            value: typing.task,
          },
        },
      ],
    },
    {
      tag: 'label',
      className: 'form-row',
      children: [
        { tag: 'span', text: 'Its reward' },
        {
          tag: 'input',
          attributes: {
            name: 'typedReward',
            type: 'text',
            maxlength: String(options.maxTyped),
            autocomplete: 'off',
            list: 'research-rewards',
            placeholder: 'optional: a Pokémon or an item',
            value: typing.reward,
          },
        },
      ],
    },
    {
      tag: 'datalist',
      attributes: { id: 'research-rewards' },
      children: [...names]
        .sort()
        .map((name): PageNode => ({ tag: 'option', attributes: { value: name } })),
    },
    {
      tag: 'button',
      className: 'link-button',
      text: '← Pick from the list',
      attributes: { type: 'button', 'data-typing': 'stop' },
    },
  ];
}

/**
 * The contradiction question in the form (R7): its words, then an unticked checkbox per report it
 * names (its stop, task and reporter as the list shows it; those the member cannot see by their
 * stop alone), then Report (sending it again with the ticked ones) and Cancel (sending nothing).
 */
function asksPart(asks: NonNullable<ResearchFormState['asks']>): PageNode[] {
  const box = (id: number, label: string): PageNode => ({
    tag: 'label',
    className: 'choice',
    children: [
      { tag: 'input', attributes: { type: 'checkbox', name: 'replacing', value: String(id) } },
      { tag: 'span', className: 'choice-words', text: label },
    ],
  });
  return [
    { tag: 'p', className: 'form-text', attributes: { role: 'alert' }, text: asks.text },
    {
      tag: 'fieldset',
      className: 'form-choice',
      children: [
        { tag: 'legend', text: 'Replace' },
        ...asks.reports.map((report) =>
          box(
            report.id,
            `${report.stop.name} · ${report.text}${report.rewardText === '' ? '' : ` · ${report.rewardText}`} · by ${report.reporter}`,
          ),
        ),
        ...asks.hidden.map((report) => box(report.id, `${report.stop} (a report you cannot see)`)),
      ],
    },
  ];
}

/** The form: its heading, its stops, then the task (or the question), Report and Cancel. */
export function researchForm(
  options: ResearchOptionsView | undefined,
  stops: readonly PickedStop[],
  state: ResearchFormState,
  mode: ResearchMode = { kind: 'new' },
): PageNode {
  const task = options?.tasks.find((one) => one.key === state.task);
  const body: PageNode[] =
    state.asks !== undefined
      ? [...asksPart(state.asks), changeTaskButton]
      : mode.kind === 'more'
        ? [
            { tag: 'p', className: 'form-text', text: mode.report.text },
            ...(mode.report.rewardText === ''
              ? []
              : [{ tag: 'p', className: 'hint', text: mode.report.rewardText }]),
            changeTaskButton,
          ]
        : options === undefined
          ? [{ tag: 'p', className: 'hint', text: 'Loading the task list…' }]
          : [
              ...(options.stale
                ? [
                    {
                      tag: 'p',
                      className: 'hint',
                      text: 'The task list may be out of date: a task missing from it can be typed in full.',
                    },
                  ]
                : []),
              ...(state.typing === undefined
                ? [...tasksPart(options, state), ...versionsPart(task, state.version)]
                : []),
              ...typingPart(options, state.typing),
            ];
  const form: PageNode = {
    tag: 'div',
    className: 'raid-form research-form stop-form',
    attributes: {
      'data-form': 'research',
      role: 'group',
      'aria-label': mode.kind === 'more' ? 'Same task at more stops' : 'Report field research',
    },
    children: [
      {
        tag: 'strong',
        className: 'name',
        attributes: { tabindex: '-1', 'data-form-heading': '' },
        text: mode.kind === 'more' ? 'Same task at more stops' : 'Report field research',
      },
      ...stopsPart(stops, state, mode.kind === 'more', options?.maxStops),
      ...body,
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          sendButton('Report', { 'data-submit': 'research' }),
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
      { tag: 'div', className: 'form-answer', attributes: { hidden: '', 'aria-live': 'polite' } },
    ],
  };
  return offWhileSending(form, state);
}

/** A research report's body (`POST …/api/research`). */
export type ResearchBody =
  | { task: string; reward?: string; more?: true; stops: string[]; replacing?: number[] }
  | { sameAs: number; stops: string[]; replacing?: number[] };

/** The body of the form, or what must be filled in first. */
export function researchBody(
  options: ResearchOptionsView | undefined,
  stops: readonly PickedStop[],
  state: ResearchFormState,
  mode: ResearchMode,
  replacing?: number[],
): { body: ResearchBody } | { text: string } {
  if (stops.length === 0) {
    return { text: mode.kind === 'more' ? 'Add the stops first.' : 'Pick the stop first.' };
  }
  const keys = stops.map((stop) => stop.key);
  const also = replacing === undefined ? {} : { replacing };
  if (mode.kind === 'more') return { body: { sameAs: mode.report.id, stops: keys, ...also } };
  if (state.typing !== undefined) {
    const task = state.typing.task.trim();
    if (task === '') return { text: 'Type the task first.' };
    const reward = state.typing.reward.trim();
    return { body: { task, ...(reward === '' ? {} : { reward }), stops: keys, ...also } };
  }
  const task = options?.tasks.find((one) => one.key === state.task);
  if (!task) return { text: 'Pick the task first.' };
  const [only] = task.versions;
  const version = task.versions.length === 1 ? only?.value : state.version;
  if (version === undefined || !task.versions.some((one) => one.value === version)) {
    return { text: 'Pick its reward first.' };
  }
  return { body: { task: version, stops: keys, ...also } };
}

/** What the page does after a research report's answer. */
export type ResearchAfter =
  /** Something to fill in first: said under the form, nothing sent. */
  | { kind: 'missing'; text: string }
  /** The form went away meanwhile: only its words are said. */
  | { kind: 'gone'; text: string }
  /** Made, or every stop reported already: the form closes, its first stop opened after the poll. */
  | { kind: 'close'; text: string }
  /** The form drawn again: the question, new lists, or the words of a refusal. */
  | {
      kind: 'draw';
      options: ResearchOptionsView | undefined;
      state: ResearchFormState;
      text: string;
      /**
       * The report `sameAs` named is gone and could not be sent by its task (a typed one, or one
       * whose task the list changed since): a new report's form (review F6).
       */
      mode?: ResearchMode;
    };

/** What `submitResearch` needs: sending, the lists, whether the form still holds. */
export interface ResearchSubmitDeps {
  send(body: ResearchBody): Promise<{ text: string; answer: StopAnswered }>;
  options(): Promise<ResearchOptionsView>;
  holds(): boolean;
}

/**
 * The research form's Submit (and its Report after the question): the body, the report, and what
 * the answer leads to, by its machine parts (B4), the words only shown.
 */
export async function submitResearch(
  options: ResearchOptionsView | undefined,
  stops: readonly PickedStop[],
  state: ResearchFormState,
  mode: ResearchMode,
  deps: ResearchSubmitDeps,
  replacing?: number[],
): Promise<ResearchAfter> {
  const made = researchBody(options, stops, state, mode, replacing);
  if ('text' in made) return { kind: 'missing', text: made.text };
  let sent = await deps.send(made.body);
  // "Same task at more stops…" of a report gone since (goal 8): a listed one by its task, as
  // "Same task at more stops…" (`more`); a typed one's task is no task of the list.
  if (sent.answer.reason === 'ended' && mode.kind === 'more' && !mode.report.typed) {
    sent = await deps.send({
      task: mode.report.task,
      more: true,
      stops: made.body.stops,
      ...(replacing === undefined ? {} : { replacing }),
    });
  }
  if (!deps.holds()) return { kind: 'gone', text: sent.text };
  const { answer } = sent;
  const kept: ResearchFormState = { ...state, adding: false };
  delete kept.asks;
  // Made; or every stop reported already (`reason: 'already'`, branch review W2).
  if (answer.ok || answer.reason === 'already') {
    return { kind: 'close', text: sent.text };
  }
  // A typed report gone (review F6): its task is no task of the list, and `sameAs` would be
  // refused again; a new report's form, its task and reward typed in, the stops kept.
  if (answer.reason === 'ended' && mode.kind === 'more') {
    const [reward] = mode.report.rewards;
    return {
      kind: 'draw',
      options,
      state: { query: '', typing: { task: mode.report.text, reward: reward?.name ?? '' } },
      text: sent.text,
      mode: { kind: 'new' },
    };
  }
  if (answer.status === 404) return { kind: 'draw', options, state: kept, text: STOP_GONE };
  const asks = answer.asks;
  if (
    answer.status === 422 &&
    asks !== undefined &&
    (asks.reports !== undefined || asks.hidden !== undefined)
  ) {
    return {
      kind: 'draw',
      options,
      state: {
        ...kept,
        asks: { text: sent.text, reports: asks.reports ?? [], hidden: asks.hidden ?? [] },
      },
      text: sent.text,
    };
  }
  if (answer.reason === 'list-changed') {
    let now = options;
    try {
      now = await deps.options();
    } catch {
      // The lists it has stay.
    }
    if (mode.kind === 'more') {
      // Sent again by its task, the list changed under it (review F6): a new report's form, the
      // report's version picked where the new lists still have it.
      const wanted = mode.report.task;
      const task = now?.tasks.find((one) => one.versions.some((each) => each.value === wanted));
      const picked: ResearchFormState = { query: '' };
      if (task) {
        picked.task = task.key;
        picked.version = wanted;
      }
      return { kind: 'draw', options: now, state: picked, text: sent.text, mode: { kind: 'new' } };
    }
    const task = now?.tasks.find((one) => one.key === state.task);
    const version = task?.versions.some((one) => one.value === state.version) === true;
    const picked: ResearchFormState = { query: state.query };
    if (task) picked.task = task.key;
    if (task && version && state.version !== undefined) picked.version = state.version;
    if (state.typing !== undefined) picked.typing = state.typing;
    return { kind: 'draw', options: now, state: picked, text: sent.text };
  }
  return { kind: 'draw', options, state: kept, text: sent.text };
}
