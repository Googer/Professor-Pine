import type {
  TrainCardLineView,
  TrainItemView,
  TrainMonthView,
  TrainRouteView,
} from '../../domain/web/train-history-data.js';
import { stepWords } from './activity.js';
import { RequestError } from './request-error.js';
import { trainLegs, type TrainLeg } from './train-line.js';

/*
 * The ended trains of the Activity layer's History (plan 8H-7B, design Part F's web half), the
 * pure part: what the panel's Trains part asks the server and shows, the train chosen and its
 * still line. Every word of a train and its card is the server's. Leaflet's and the page's side
 * is `activity-ui.ts`.
 */

/** The route of a server's trains of a month (`yyyy-mm`). */
export function trainsAddress(guild: string, month: string): string {
  return `/s/${guild}/api/history/trains?month=${month}`;
}

/** The route of one train's line and card, by its record's id. */
export function trainRouteAddress(guild: string, id: number): string {
  return `/s/${guild}/api/history/trains/${String(id)}`;
}

/** Said by year: the list is a month's. */
export const PICK_A_MONTH = 'Pick a month to see its trains.';
/** Said where a month's trains could not be loaded. */
export const TRAINS_FAILED = 'The trains could not be loaded. Try again in a moment.';
/** Said where a train chosen could not be loaded. */
export const TRAIN_FAILED = 'The train could not be loaded. Try again in a moment.';
/** Said of a train the server will not show (G4): one line, whatever why. */
export const TRAIN_REFUSED = 'This train cannot be shown.';

/** What History shows of the trains: nothing (not History, or Play), "pick a month", a month. */
export type TrainsContext =
  { kind: 'hidden' } | { kind: 'pick' } | { kind: 'month'; month: string };

/** The Trains part as the page draws it. */
export interface TrainsPanel {
  hidden: boolean;
  /** "Trains in June 2019 (12)", the summary that opens the list; none without a list. */
  heading?: string;
  /** A line in the place of the list or under it. */
  note?: string;
  items: (TrainItemView & { chosen: boolean })[];
  /** The list is of a month History has left (review R5): shown busy, not to be pressed. */
  stale: boolean;
  /** "and 9 more" where the list leaves some out. */
  more?: string;
  /** The card of the train chosen, once its answer came; `unplaced` where none of its stops is on the map. */
  card?: { id: number; lines: TrainCardLineView[]; unplaced: boolean };
}

/** What the part asks of the page. */
export interface TrainsHooks {
  get<T>(url: string): Promise<T>;
  /** The panel changed: draw it again (`panel()`). */
  changed(): void;
  /** Draw this train's still line, or none. */
  line(route: TrainRouteView | undefined): void;
}

/**
 * The Trains part of History (review G8): by month, a month's trains asked once its month is shown
 * (never during Play, which hides the part and clears the train chosen), its list and how many
 * more; a train chosen asked and drawn, chosen again cleared, another taking its place, only the
 * one chosen last drawn; cleared at a month's change, By year and the layer off. A train opened by
 * the map's address (`open`) gives its month and stays chosen when its month is shown.
 */
export class HistoryTrains {
  private context: TrainsContext = { kind: 'hidden' };
  private list: { month: string; view?: TrainMonthView; failed?: boolean } | undefined;
  /** The last month's trains answered (review B5). */
  private kept: { month: string; view?: TrainMonthView } | undefined;
  /** The train chosen; `fromAddress`: opened by the map's address (review R1). */
  private chosen: { id: number; view?: TrainRouteView; fromAddress?: true } | undefined;
  /** The list is of a month History has left, until the next is shown (review R5). */
  private stale = false;
  private notice: string | undefined;
  /** The month the notice was said in: it goes once another month is shown. */
  private noticeMonth: string | undefined;
  private drawn = false;
  /** Which question's answer is wanted: a later one takes its place. */
  private asking = { list: 0, train: 0 };
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly guild: string,
    private readonly hooks: TrainsHooks,
  ) {}

  /** Resolves once the answers asked for so far were handled. For tests. */
  async idle(): Promise<void> {
    await this.pending;
  }

  /**
   * What History shows now: the part follows it. A month shown already asks nothing again, but
   * one whose trains failed (review B4); the last month's trains answered are kept, so that back
   * to it (after Play, By year) asks nothing (B5).
   */
  show(context: TrainsContext): void {
    const month = context.kind === 'month' ? context.month : undefined;
    if (month !== undefined && this.list?.month === month && this.list.failed !== true) {
      this.context = context;
      // Back to the list's month before another was shown (review W1): pressable again.
      if (this.stale) {
        this.stale = false;
        this.hooks.changed();
      }
      return;
    }
    this.context = context;
    this.asking.list += 1;
    this.list = undefined;
    // A month's change, By year, Play and the layer off clear the train chosen, but for the
    // train opened by the address whose month this is, and the address's train still on its way
    // (review R1: the heat's answer often comes first; only `drop` and `choose` take its place).
    const { chosen } = this;
    const addressPending = chosen?.fromAddress === true && chosen.view === undefined;
    if (
      chosen !== undefined &&
      !addressPending &&
      (month === undefined || chosen.view?.month !== month)
    ) {
      this.clearChosen();
    }
    this.stale = false;
    // A train that cannot be shown is said in the month it was said in (the address's: the first
    // shown after it), and no longer once another is shown.
    if (month !== undefined && this.notice !== undefined) {
      if (this.noticeMonth === undefined) this.noticeMonth = month;
      else if (this.noticeMonth !== month) this.notice = undefined;
    }
    if (month !== undefined && this.kept?.month === month) {
      this.list = this.kept;
    } else if (month !== undefined) {
      this.list = { month };
      void this.loadList(month);
    }
    this.hooks.changed();
  }

  /**
   * History was changed (a month, the mode, By month or year, the layer off; review B10): the
   * train chosen goes at once, before the new month's answer, the address's on its way too (R1);
   * the list stays, marked stale (R5: not to be pressed), until the next month is shown.
   */
  drop(): void {
    if (this.chosen !== undefined) this.clearChosen();
    this.stale = this.list !== undefined;
    this.hooks.changed();
  }

  private async loadList(month: string): Promise<void> {
    const mine = this.asking.list;
    const asked = this.hooks.get<TrainMonthView>(trainsAddress(this.guild, month));
    this.pending = asked.catch(() => undefined);
    try {
      const view = await asked;
      if (mine !== this.asking.list) return;
      this.list = { month, view };
      this.kept = this.list;
    } catch {
      if (mine !== this.asking.list) return;
      this.list = { month, failed: true };
    }
    this.hooks.changed();
  }

  /** A train of the list pressed: drawn, or cleared where it was the one chosen. */
  async choose(id: number): Promise<void> {
    if (this.chosen?.id === id) {
      this.clearChosen();
      this.hooks.changed();
      return;
    }
    this.notice = undefined;
    await this.load(id);
  }

  /**
   * A train named by the map's address (`?train=`): asked first, as the page does not know its
   * month. Its month; `refused` where the server will not show it or it could not be loaded (the
   * part says so once); `superseded` where another train was chosen, or History changed, before
   * its answer came (review B6: History is then left as the member made it).
   */
  async open(id: number): Promise<{ month: string } | 'refused' | 'superseded'> {
    const loaded = await this.load(id, true);
    return loaded === undefined
      ? 'superseded'
      : loaded === 'failed'
        ? 'refused'
        : { month: loaded.month };
  }

  /** A train asked and drawn: its view, `failed`, or undefined where another took its place. */
  private async load(
    id: number,
    fromAddress = false,
  ): Promise<TrainRouteView | 'failed' | undefined> {
    this.clearChosen();
    const mine = this.asking.train;
    const marked = fromAddress ? { fromAddress: true as const } : {};
    this.chosen = { id, ...marked };
    this.hooks.changed();
    const asked = this.hooks.get<TrainRouteView>(trainRouteAddress(this.guild, id));
    this.pending = asked.catch(() => undefined);
    try {
      const view = await asked;
      if (mine !== this.asking.train) return undefined;
      this.chosen = { id, view, ...marked };
      this.drawn = true;
      this.hooks.line(view);
      this.hooks.changed();
      return view;
    } catch (err) {
      if (mine !== this.asking.train) return undefined;
      this.chosen = undefined;
      this.notice =
        err instanceof RequestError && err.status === 404 ? TRAIN_REFUSED : TRAIN_FAILED;
      this.noticeMonth = this.list?.month;
      this.hooks.changed();
      return 'failed';
    }
  }

  /**
   * The train chosen goes, and with it its line; an answer of it still on its way is dropped
   * (review B1: after a month's change, Play or the layer off it would be drawn late).
   */
  private clearChosen(): void {
    this.asking.train += 1;
    this.chosen = undefined;
    if (this.drawn) {
      this.drawn = false;
      this.hooks.line(undefined);
    }
  }

  /** The part as it stands. */
  panel(): TrainsPanel {
    const { context } = this;
    if (context.kind === 'hidden') return { hidden: true, items: [], stale: false };
    if (context.kind === 'pick')
      return { hidden: false, note: PICK_A_MONTH, items: [], stale: false };
    const words = stepWords(context.month);
    const view = this.list?.view;
    const chosen = this.chosen;
    const card =
      chosen?.view === undefined
        ? undefined
        : { id: chosen.id, lines: chosen.view.card, unplaced: chosen.view.route.length === 0 };
    const items = (view?.trains ?? []).map((train) => ({
      ...train,
      chosen: train.id === chosen?.id,
    }));
    const total = view === undefined ? 0 : view.trains.length + view.more;
    const failed = this.list?.failed === true;
    const note =
      this.notice ??
      (failed
        ? TRAINS_FAILED
        : view !== undefined && total === 0
          ? `No trains to show in ${words}.`
          : undefined);
    return {
      hidden: false,
      stale: this.stale,
      ...(failed || (view !== undefined && total === 0)
        ? {}
        : {
            heading:
              view === undefined ? `Trains in ${words}` : `Trains in ${words} (${String(total)})`,
          }),
      ...(note === undefined ? {} : { note }),
      items,
      ...(view !== undefined && view.more > 0 ? { more: `and ${String(view.more)} more` } : {}),
      ...(card === undefined ? {} : { card }),
    };
  }
}

/**
 * An ended train's still line (review G9): its stops as a live train's line takes them
 * (`trainLegs`, through an adapter: the route the indexes into its places, as gym keys of a map of
 * them), finished, so every leg is done (the done legs' look, no arrows, no loop closed).
 */
export function stillLegs(view: Pick<TrainRouteView, 'points' | 'route'>): TrainLeg[] {
  const places = new Map(view.points.map((point, index) => [index, point]));
  return trainLegs(
    { route: view.route.map(String), stop: null, spots: [], atEnd: 'finish' },
    places,
  );
}
