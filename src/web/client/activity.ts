import type {
  ActivityModeName,
  ActivityPlaceView,
  ActivityView,
} from '../../domain/web/activity-data.js';
import { CLUSTER_BELOW } from './cluster.js';

/*
 * The activity layer of the live map (plan 8H-4, design Part B), its pure part: the panel's
 * modes and what it asks the server, History's slider and Play, the words of a place's popup and
 * of the parties left out, and the target a place offers a tap by its weight. The weights themselves
 * are the server's (`activityWeights`); the page only draws them (the glow: `heat.ts`). Leaflet's
 * side is `activity-ui.ts`.
 */

/** The panel's modes, in the order its menu offers them. */
export const ACTIVITY_MODE_CHOICES: ReadonlyArray<{ value: ActivityModeName; label: string }> = [
  { value: 'now', label: 'Expected now' },
  { value: 'evenings', label: 'Weekday evenings' },
  { value: 'weekend', label: 'Weekend afternoons' },
  { value: 'history', label: 'History' },
];

/** What the panel shows: a mode, and in History the step of its slider (`yyyy-mm` or `yyyy`). */
export type ActivityChoice =
  { mode: Exclude<ActivityModeName, 'history'> } | { mode: 'history'; step: string };

/** The address of the server's activity for a choice. */
export function activityAddress(guild: string, choice: ActivityChoice): string {
  const base = `/s/${guild}/api/activity?mode=${choice.mode}`;
  if (choice.mode !== 'history') return base;
  return choice.step.length === 4 ? `${base}&year=${choice.step}` : `${base}&month=${choice.step}`;
}

/** History's slider steps by month or by year. */
export type ActivitySpan = 'month' | 'year';

/** The slider's steps from the first month to the last (`yyyy-mm`), or their years (`yyyy`). */
export function sliderSteps(
  months: { first: string; last: string } | null,
  span: ActivitySpan,
): string[] {
  if (months === null) return [];
  const [firstYear = 0, firstMonth = 1] = months.first.split('-').map(Number);
  const [lastYear = 0, lastMonth = 1] = months.last.split('-').map(Number);
  if (span === 'year') {
    return Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, n) =>
      String(firstYear + n),
    );
  }
  const steps: string[] = [];
  for (let at = firstYear * 12 + firstMonth - 1; at <= lastYear * 12 + lastMonth - 1; at++) {
    steps.push(`${String(Math.floor(at / 12))}-${String((at % 12) + 1).padStart(2, '0')}`);
  }
  return steps;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A step in words: "June 2019", or the year alone. */
export function stepWords(step: string): string {
  const [year, month] = step.split('-');
  if (month === undefined) return step;
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year ?? ''}`;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const parties = (n: number): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'party' : 'parties'}`;

/**
 * A place's popup, set as text: its parties in the mode's window, unweighted (the weight only
 * sizes the circle), and when that window is. `step` is History's step shown.
 */
export function placeWords(view: ActivityView, place: ActivityPlaceView, step?: string): string {
  switch (view.mode) {
    case 'now': {
      const day = view.weekday === null ? undefined : WEEKDAYS[view.weekday - 1];
      return day === undefined
        ? `${parties(place.parties)} at this time of day, over the years`
        : `${parties(place.parties)} at this time of day on ${day}s, over the years`;
    }
    case 'evenings':
      return `${parties(place.parties)} on weekday evenings, over the years`;
    case 'weekend':
      return `${parties(place.parties)} on weekend afternoons, over the years`;
    case 'history':
      return step === undefined
        ? parties(place.parties)
        : `${parties(place.parties)} in ${stepWords(step)}`;
  }
}

/**
 * The activity's counts where the map shows its places (plan 8H-4H), from the answer the layer
 * drew (no question of their own): a gym's or a Power Spot's line in its popup, in the words of
 * the layer's own popup (`placeWords`), and a gym cluster's sum on hover. Nothing for a place the
 * glow does not draw (quiet, or none).
 */
export class ActivityCounts {
  private readonly places: ReadonlyMap<string, ActivityPlaceView>;

  constructor(
    private readonly view: ActivityView,
    /** History's step the answer is of. */
    private readonly step?: string,
  ) {
    this.places = new Map(view.places.map((place) => [`${place.kind}:${place.id}`, place]));
  }

  /** A place's line: "Activity: 12 parties at this time of day on Thursdays, over the years". */
  line(kind: ActivityPlaceView['kind'], id: string): string | undefined {
    const place = this.places.get(`${kind}:${id}`);
    return place === undefined ? undefined : `Activity: ${placeWords(this.view, place, this.step)}`;
  }

  /**
   * A gym cluster's parties, its gyms' summed (by their ids in decimal): "≈ 140 parties in this
   * area" seen, "about 140 parties in this area" spoken (review 8H4H-7), about as many since its
   * quiet gyms are not counted; none where none is drawn.
   */
  area(gymIds: readonly string[]): AreaWords | undefined {
    let sum = 0;
    for (const id of gymIds) sum += this.places.get(`gym:${id}`)?.parties ?? 0;
    if (sum === 0) return undefined;
    return {
      shown: `≈ ${parties(sum)} in this area`,
      spoken: `about ${parties(sum)} in this area`,
    };
  }
}

/**
 * What a gym cluster says of its area (review 8H4H-7): `shown` in its tooltip, with the symbol
 * "≈"; `spoken` in words, for its `aria-label`.
 */
export interface AreaWords {
  shown: string;
  spoken: string;
}

/** The panel's line of the parties the map cannot draw; none when it drew them all. */
export function leftOutWords(leftOut: number): string | undefined {
  return leftOut === 0 ? undefined : `${parties(leftOut)} left out (gyms no longer listed, pins)`;
}

/** The smallest and the largest target to tap, in pixels: the quietest still 32 with the tolerance. */
const RADIUS = { least: 8, most: 28 };

/**
 * The radius of a place's invisible circle by its weight (0–1), the target a tap on the glow
 * finds (plan 8H-4H; 8H-4's circles, drawn no longer): larger the busier it is, by the square
 * root, as its glow is.
 */
export function tapRadius(weight: number): number {
  const w = Math.min(1, Math.max(0, weight));
  return RADIUS.least + (RADIUS.most - RADIUS.least) * Math.sqrt(w);
}

/**
 * The places drawn as invisible circles, which a tap on the glow finds (plan 8H-4H): from street
 * zoom only (`CLUSTER_BELOW`, where the gyms are drawn one by one; the Power Spots' `PLACES_FROM`
 * is the same zoom), and only where the place's own layer is off: with the Gyms layer (or the
 * Power Spots layer) on, its dots' popups carry the count. Zoomed out nothing is tappable, nor
 * while a place or a point is being picked (review P4: the Report button's step 2, a meetup's
 * place, research's stops, route mode take the taps). Only those in `box` where one is given
 * (review P3: the view and its margin).
 */
export function tappablePlaces(
  places: readonly ActivityPlaceView[],
  zoom: number,
  shown: { gyms: boolean; spots: boolean; picking?: boolean },
  box?: { south: number; west: number; north: number; east: number },
): ActivityPlaceView[] {
  if (zoom < CLUSTER_BELOW || shown.picking === true) return [];
  return places.filter(
    (place) =>
      !(place.kind === 'gym' ? shown.gyms : shown.spots) &&
      (box === undefined ||
        (place.lat >= box.south &&
          place.lat <= box.north &&
          place.lon >= box.west &&
          place.lon <= box.east)),
  );
}

/** The timers of Play (`window.setTimeout` on the page; a test's own by hand). */
export interface PlayerTimer {
  set(run: () => void, ms: number): number;
  clear(handle: number): void;
}

/** How long Play shows each step once its answer is drawn. */
export const PLAY_STEP_MS = 1_000;

/** What Play is told to do: draw a step (true once its answer is drawn, false when it failed). */
export interface PlayHooks {
  step(at: string): Promise<boolean>;
  ended(): void;
}

/**
 * History's Play: from the step shown (from the first where the last is shown), the next step
 * asked a second after the last one's answer was drawn (review P1: a slow answer is never
 * overtaken, and Play never asks faster than the server answers), until the last; a step whose
 * answer failed ends it (the panel says why), and `stop` ends it at once (any other press of the
 * member), an answer still on its way then asking nothing more. `ended` is said once, however it
 * ended.
 */
export class MonthPlayer {
  private timer: number | undefined;
  private hooks: PlayHooks | undefined;
  /** Which run of Play an answer on its way belongs to: one of a stopped run asks nothing. */
  private run = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly timers: PlayerTimer) {}

  playing(): boolean {
    return this.hooks !== undefined;
  }

  /** Resolves once the answer of the step asked last was handled. For tests. */
  idle(): Promise<void> {
    return this.pending;
  }

  play(steps: readonly string[], from: string, hooks: PlayHooks): void {
    this.stop();
    if (steps.length === 0) return;
    this.hooks = hooks;
    const run = this.run;
    const last = steps.length - 1;
    const show = (at: number): void => {
      const step = steps[at];
      if (step === undefined) {
        this.stop();
        return;
      }
      this.pending = hooks.step(step).then(
        (drawn) => {
          if (run !== this.run) return;
          if (!drawn || at >= last) this.stop();
          else schedule(at + 1);
        },
        () => {
          if (run === this.run) this.stop();
        },
      );
    };
    const schedule = (at: number): void => {
      this.timer = this.timers.set(() => {
        this.timer = undefined;
        show(at);
      }, PLAY_STEP_MS);
    };
    const at = steps.indexOf(from);
    if (at < 0 || at >= last) show(0);
    else schedule(at + 1);
  }

  stop(): void {
    this.run += 1;
    if (this.timer !== undefined) this.timers.clear(this.timer);
    this.timer = undefined;
    const hooks = this.hooks;
    this.hooks = undefined;
    hooks?.ended();
  }
}

/**
 * The canvas renderer's tolerance, in pixels round each circle (review P6): with the quietest
 * circle's radius a tap target of at least 32 pixels.
 */
export const CANVAS_TOLERANCE = 8;

/** A moment after the hour, so that the server's window has moved on when asked. */
export const AFTER_THE_HOUR_MS = 2_000;

/**
 * How long Expected now waits before it asks again (review P5): the server's own count to its next
 * hour, from the answer, never the page's clock (one that runs fast would ask again and again);
 * none in another mode.
 */
export function hourWait(view: ActivityView): number | undefined {
  if (view.mode !== 'now' || view.changesInMs === null) return undefined;
  return Math.max(0, view.changesInMs) + AFTER_THE_HOUR_MS;
}

/** How long Expected now waits to ask again after an answer failed (8H4-2). */
export const RETRY_AFTER_FAILURE_MS = 60_000;

/**
 * When the panel asks again by itself, in the mode it is in now: in Expected now the hour after
 * a good answer (`hourWait`), a minute after a failed one (`answer` undefined), so that one
 * failure does not end its hourly questions (8H4-2); in another mode never.
 */
export function nextAskWait(
  mode: ActivityModeName,
  answer: ActivityView | undefined,
): number | undefined {
  if (mode !== 'now') return undefined;
  return answer === undefined ? RETRY_AFTER_FAILURE_MS : hourWait(answer);
}

/**
 * The step History opens on (review P8): this month (or year) where the server has it, else its
 * last; none while it has no months.
 */
export function historyStep(
  months: { first: string; last: string } | null,
  span: ActivitySpan,
  today: string,
): string | undefined {
  const all = sliderSteps(months, span);
  const own = span === 'year' ? today.slice(0, 4) : today;
  return all.includes(own) ? own : all.at(-1);
}

/**
 * This month (or year) by the page's clock: what History asks for before it knows the server's
 * months, so that the answer brings them (review P8). Close enough at a month's turn: the answer
 * says the months, and History moves to one of them.
 */
export function todayStep(now: number, span: ActivitySpan): string {
  const date = new Date(now);
  const year = String(date.getFullYear()).padStart(4, '0');
  return span === 'year' ? year : `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
