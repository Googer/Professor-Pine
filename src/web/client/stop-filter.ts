import type {
  MapReward,
  ResearchOptionsView,
  RocketOptionsView,
  StopReportsView,
} from '../../domain/web/stop-report-data.js';
import type { StopLayer, StopReport } from './stop-reports.js';
import type { ViewStorage } from './view.js';

/*
 * The filters of the reports at stops (plan 8M-9B, goal 5; the design: "by reward or catch and by
 * grunt type or leader"): research by one or several rewards (`MapReward.value`; "one of" matches
 * when any of its rewards does, B12; a reward the game data does not know, `value` null, is no
 * choice), Team GO Rocket by one or several of who (a grunt type, matched by the grunt's
 * `typeKey`, a lineup's too; a leader; Giovanni; the decoy) or a catch. The choices are today's
 * reports' and the pick lists' names (asked only when the filter opens, B12). A report a filter
 * hides is neither drawn nor listed, and the filter is always in sight (anti-goal: no hidden
 * rule): the map's line, the list's group and the layer's toggle say it. Kept per browser.
 */

/** The values chosen per layer: rewards for research; who and catches for Rocket. */
export interface StopFilters {
  research: readonly string[];
  rocket: readonly string[];
}

export const NO_FILTERS: StopFilters = { research: [], rocket: [] };

/** Where the filters are kept in the browser: one choice for every server, as the layers'. */
export const FILTERS_KEY = 'pine-map-stop-filters';

/** Whether a report passes the filters of its layer (none: everything does). */
export function shownBy(filters: StopFilters): (report: StopReport, layer: StopLayer) => boolean {
  const research = new Set(filters.research);
  const rocket = new Set(filters.rocket);
  const any = (rewards: readonly MapReward[], chosen: ReadonlySet<string>) =>
    rewards.some((reward) => reward.value !== null && chosen.has(reward.value));
  return (report, layer) => {
    if (layer === 'research') {
      return research.size === 0 || ('rewards' in report && any(report.rewards, research));
    }
    if (rocket.size === 0) return true;
    if (!('catches' in report)) return false;
    const who = 'typeKey' in report ? report.typeKey : report.who;
    return rocket.has(who) || any(report.catches, rocket);
  };
}

/** How many of a layer's reports the filters hide (that have not ended), for its group to say. */
export function hiddenCount(
  view: StopReportsView | undefined,
  filters: StopFilters,
  layer: StopLayer,
  now = 0,
): number {
  if (!view) return 0;
  const shows = shownBy(filters);
  const reports = layer === 'research' ? view.research : [...view.grunts, ...view.hideouts];
  return reports.filter((report) => report.endsAt > now && !shows(report, layer)).length;
}

/** A choice of a filter: what it matches and its name. */
export interface FilterChoice {
  value: string;
  name: string;
}

/** Choices each once by value, in the order met. */
function once(choices: Iterable<FilterChoice>): FilterChoice[] {
  const seen = new Map<string, FilterChoice>();
  for (const choice of choices) if (!seen.has(choice.value)) seen.set(choice.value, choice);
  return [...seen.values()];
}

/** The rewards or catches as choices, those the game data knows. */
function rewardChoices(rewards: Iterable<MapReward>): FilterChoice[] {
  return [...rewards].flatMap((reward) =>
    reward.value === null ? [] : [{ value: reward.value, name: reward.name }],
  );
}

const byName = (a: FilterChoice, b: FilterChoice) => a.name.localeCompare(b.name);

/**
 * The choices of the filters: research's rewards by name; Rocket's who (the pick list's order,
 * then today's reports') and then its catches by name; each once, of today's reports and the pick
 * lists (where the page asked them).
 */
export function filterChoices(
  view: StopReportsView | undefined,
  research: ResearchOptionsView | undefined,
  rocket: RocketOptionsView | undefined,
): { research: FilterChoice[]; rocket: FilterChoice[] } {
  const rewards = once(
    rewardChoices([
      ...(view?.research ?? []).flatMap((report) => report.rewards),
      ...(research?.tasks ?? []).flatMap((task) => task.rewards),
    ]),
  ).sort(byName);
  const who = once([
    ...(rocket?.choices ?? []).map((choice) => ({ value: choice.key, name: choice.name })),
    ...(view?.grunts ?? []).map((grunt) => ({ value: grunt.typeKey, name: grunt.name })),
    ...(view?.hideouts ?? []).map((hideout) => ({ value: hideout.who, name: hideout.name })),
  ]);
  const catches = once(
    rewardChoices([
      ...[...(view?.grunts ?? []), ...(view?.hideouts ?? [])].flatMap((report) => report.catches),
      ...(rocket?.choices ?? []).flatMap((choice) => choice.catches),
    ]),
  ).sort(byName);
  return { research: rewards, rocket: [...who, ...catches] };
}

/** What heads each filter's choices (Rocket's: who it is, then the Pokémon it gives). */
export const FILTER_LEGENDS = {
  research: 'Show only research that gives',
  rocket: 'Show only these Team GO Rocket members, or those with these Pokémon to catch',
} as const;

/** A filter in words, as the map, the toggle and the list say it: its one choice, else how many. */
export function filterWords(
  values: readonly string[],
  names: ReadonlyMap<string, string>,
): string | undefined {
  const [only, ...more] = values;
  if (only === undefined) return undefined;
  if (more.length > 0) return `${String(values.length)} filters`;
  return names.get(only) ?? '1 filter';
}

/** The filters kept in this browser; none where nothing (good) is kept. */
export function readFilters(storage: ViewStorage | undefined): StopFilters {
  try {
    const read = JSON.parse(storage?.getItem(FILTERS_KEY) ?? '{}') as unknown;
    if (typeof read !== 'object' || read === null) return NO_FILTERS;
    const list = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((one): one is string => typeof one === 'string' && one.length <= 100)
        : [];
    const kept = read as { research?: unknown; rocket?: unknown };
    return { research: list(kept.research), rocket: list(kept.rocket) };
  } catch {
    return NO_FILTERS;
  }
}

/** Keeps the filters; a browser that keeps nothing is left alone. */
export function writeFilters(storage: ViewStorage | undefined, filters: StopFilters): void {
  try {
    storage?.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Private mode or a full storage: the filters hold for this visit.
  }
}
