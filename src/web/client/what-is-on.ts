import { stageAt } from '../../domain/party/raid-stage.js';
import { clockTime } from '../../domain/web/clock.js';
import type { PartiesView } from '../../domain/web/party-data.js';
import { backAtWords } from '../../domain/stops/back-at.js';
import type { MapSpawn } from '../../domain/web/spawn-data.js';
import type { StopReportsView } from '../../domain/web/stop-report-data.js';
import { spawnName, spawnPopupKey } from './spawns.js';
import { stopPopupKey, type StopLayer, type StopReport, type StopReports } from './stop-reports.js';
import { distanceWords, metersBetween, type DistanceUnits } from './distance.js';
import { stopLine, trainPlaces } from './parties.js';
import type { MapGym } from './popup.js';
import { isDimmed, timeLeft } from './raid-marker.js';
import { startWords } from './shared-place.js';
import type { LatLon, ViewStorage } from './view.js';

/**
 * The list of what is on (plan 8M-7): every live thing the enabled layers show, across the whole
 * server (not only what is in view), grouped by kind in this order (raids, trains, meetups, the
 * reports at stops, wild spawns), each group headed with its count. A line: picture, name,
 * place, distance, time, how many are going; dimmed in a raid's last minutes. Sorted, by the
 * member's choice kept per browser: Nearest (from your location, else the map's middle),
 * Soonest (ending soonest for raids, starting soonest for trains and meetups), Most going; ties
 * by name, and what the map cannot place (no point at all) last in its group. The pure part;
 * `list-ui.ts` draws it.
 */

export type ListKind = 'raids' | 'trains' | 'meetups' | StopLayer | 'spawns' | FoundPlaceLayer;

/** The layers of the places Find finds by name (plan 8M-12): a line of Find alone has them. */
export type FoundPlaceLayer = 'gyms' | 'stops' | 'spots';

/**
 * The groups in their order, each with its heading (the registry's layer of the same id). Max
 * battles are in the raids' group and layer (plan 8M-9A); the reports at stops follow the parties
 * (plan 8M-9B, the design's order: raids and max battles, trains, meetups, research, Rocket,
 * spawns).
 */
const GROUPS: ReadonlyArray<[ListKind, string]> = [
  ['raids', 'Raids and max battles'],
  ['trains', 'Trains'],
  ['meetups', 'Meetups'],
  ['research', 'Field research'],
  ['rocket', 'Team GO Rocket'],
  ['spawns', 'Wild spawns'],
];

/** A thing of the list, as the page has it from the list of parties. */
export interface ListLine {
  /** A place of Find: its address, where anything of it is known. */
  address?: string | null;
  /** `raid:<id>`, `max:<id>`, `train:<id>`, `meetup:<id>`. */
  key: string;
  kind: ListKind;
  /** The party's id. */
  id: string;
  /** Its popup's key on the map (`gym:<id>`, `max:<id>`, `train:<id>`, `meetup:<id>`): none off the map. */
  marker: string | null;
  name: string;
  place: string | null;
  /** Where it is, when the page knows; none puts it last in its group. */
  point: LatLon | null;
  picture: string | null;
  going: number;
  /** What Soonest sorts by: the end of a raid or max battle, the start of a train or meetup; none last. */
  soonest: number | null;
  /** The times its time is worded from. */
  times: {
    stage?: 'egg' | 'hatched';
    hatch?: number | null;
    end?: number | null;
    start?: number | null;
    /** A report at a stop standing all period or all day (plan 8M-9B): "until 5:00 PM". */
    until?: number;
  };
  /** Why a report Find found is not confirmed (plan 8M-12): "not confirmed: one of 6 encounters". */
  mark?: string;
}

/** The lines of a list of parties, in its order (the groups and sorting are `listGroups`'). */
export function listLines(view: PartiesView, gyms: ReadonlyMap<number, MapGym>): ListLine[] {
  const raids = view.raids.map((raid): ListLine => {
    const gym = raid.gymId === null ? undefined : gyms.get(raid.gymId);
    const where = gym ?? raid.place;
    return {
      key: `raid:${raid.id}`,
      kind: 'raids',
      id: raid.id,
      marker: gym ? `gym:${gym.id}` : null,
      // Its post's own heading words (fix round 1).
      name: raid.heading,
      place: where?.name ?? null,
      point: where ? { lat: where.lat, lon: where.lon } : null,
      picture: raid.picture,
      going: raid.attendance.going,
      soonest: raid.endTime,
      times: { stage: raid.stage, hatch: raid.hatchTime, end: raid.endTime },
    };
  });
  // Max battles (plan 8M-9A, A2): in the raids' group, named by their post's title, at their spot
  // or pin, Soonest by their end; no egg, so their time reads as a hatched raid's.
  const maxes = view.maxes.map((max): ListLine => ({
    key: `max:${max.id}`,
    kind: 'raids',
    id: max.id,
    marker: `max:${max.id}`,
    name: max.title,
    place: max.place.name,
    point: { lat: max.place.lat, lon: max.place.lon },
    picture: max.picture,
    going: max.attendance.going,
    soonest: max.endTime,
    times: { stage: 'hatched', hatch: null, end: max.endTime },
  }));
  const trains = view.trains.map((train): ListLine => {
    const { ring } = trainPlaces(train, gyms);
    const at = (id: number | null) => (id === null ? undefined : gyms.get(id));
    return {
      key: `train:${train.id}`,
      kind: 'trains',
      id: train.id,
      marker: ring ? `train:${train.id}` : null,
      name: train.name,
      place: stopLine(train, { gym: at }),
      point: ring ? { lat: ring.at.lat, lon: ring.at.lon } : null,
      picture: null,
      going: train.attendance.going,
      soonest: train.startTime,
      times: { start: train.startTime },
    };
  });
  const meetups = view.meetups.map((meetup): ListLine => {
    const { place } = meetup;
    const gym = place?.gymId == null ? undefined : gyms.get(place.gymId);
    const where = gym ?? place;
    return {
      key: `meetup:${meetup.id}`,
      kind: 'meetups',
      id: meetup.id,
      marker: place ? `meetup:${meetup.id}` : null,
      name: meetup.name,
      place: place?.words ?? null,
      point: where ? { lat: where.lat, lon: where.lon } : null,
      picture: null,
      going: meetup.attendance.going,
      soonest: meetup.startTime,
      times: { start: meetup.startTime },
    };
  });
  return [...raids, ...maxes, ...trains, ...meetups];
}

/**
 * The lines of the reports at stops (plan 8M-9B, goal 4), each opening its stop's popup
 * (`stop:<key>`): research by its task, a grunt or hideout by its name, the stop as its place, the
 * picture as the popup shows it; Soonest by their end; no count of those going (Most going keeps
 * them nearest first, B13). Research and hideouts stand until their end ("until 5:00 PM"), a
 * grunt for its minutes left, read as a hatched raid's (its last minutes dimmed).
 */
export function stopReportLines(stops: readonly StopReports[]): ListLine[] {
  const base = (at: StopReports, report: StopReport, kind: StopLayer) => ({
    kind,
    id: String(report.id),
    marker: stopPopupKey(at.stop.key),
    place: at.stop.name,
    point: { lat: at.stop.lat, lon: at.stop.lon },
    going: 0,
    soonest: report.endsAt,
  });
  return stops.flatMap((at) => [
    ...at.research.map((report): ListLine => ({
      ...base(at, report, 'research'),
      key: `research:${String(report.id)}`,
      name: report.text,
      picture: report.picture ?? null,
      times: { until: report.endsAt },
    })),
    ...at.grunts.map((report): ListLine => ({
      ...base(at, report, 'rocket'),
      key: `grunt:${String(report.id)}`,
      name: report.name,
      picture: report.picture ?? null,
      times: { stage: 'hatched', hatch: null, end: report.endsAt },
    })),
    ...at.hideouts.map((report): ListLine => ({
      ...base(at, report, 'rocket'),
      key: `hideout:${String(report.id)}`,
      name: report.name,
      picture: report.picture ?? null,
      times: { until: report.endsAt },
    })),
  ]);
}

/**
 * The lines of the wild spawns (Matt, 2026-11-07), each opening its marker (`spawn:<id>`) where it
 * has a point, else its popup under its line: the Pokémon, the place it is near (else where it is
 * in the reporter's words), its picture; Soonest by when it goes away; its minutes left read as a
 * hatched raid's (its last minutes dimmed); no count of those going (Most going keeps them nearest
 * first, as the reports at stops).
 */
export function spawnLines(spawns: readonly MapSpawn[]): ListLine[] {
  return spawns.map((spawn) => ({
    key: `spawn:${spawn.id}`,
    kind: 'spawns',
    id: spawn.id,
    marker: spawn.point === null ? null : spawnPopupKey(spawn.id),
    name: spawnName(spawn),
    place: spawn.near ?? spawn.details,
    point: spawn.point,
    picture: spawn.picture ?? null,
    going: 0,
    soonest: spawn.goneAt,
    times: { stage: 'hatched', hatch: null, end: spawn.goneAt },
  }));
}

/**
 * The note of the research group while the day's research waits under an intra-day event's window
 * (plan 8M-9B, B5): when it comes back and after which event, in the post of the stops' words
 * (`backAtWords`, the reader's clock), and at how many stops (`waiting.stops`, as the server counts
 * them); none while nothing waits.
 */
export function waitingNote(
  view: Pick<StopReportsView, 'waiting' | 'event'> | undefined,
  now: number,
  zone: string,
): string | undefined {
  const waiting = view?.waiting;
  if (!waiting) return undefined;
  const back = backAtWords(clockTime(waiting.at, zone, now), view.event ?? undefined);
  const stops = waiting.stops === 1 ? '1 stop' : `${String(waiting.stops)} stops`;
  return `${back}: the day’s research at ${stops}.`;
}

/**
 * When a report that stands to its end ends, in a line: `until 5:00 PM`; a day's end, local
 * midnight, `until midnight` (not tomorrow's 12:00 AM).
 */
export function untilWords(end: number, now: number, zone: string): string {
  const before = end - 1;
  const today = clockTime(before, zone, now) === clockTime(before, zone, before);
  const words = clockTime(end, zone, now);
  return today && words.endsWith('12:00 AM') ? 'until midnight' : `until ${words}`;
}

export type ListSort = 'nearest' | 'soonest' | 'going';

/** The sorts offered, in the menu's order, with their names. */
export const SORTS: ReadonlyArray<[ListSort, string]> = [
  ['nearest', 'Nearest'],
  ['soonest', 'Soonest'],
  ['going', 'Most going'],
];

export interface ListGroup {
  kind: ListKind;
  heading: string;
  lines: ListLine[];
  /** A line under its heading (plan 8M-9B: the day's research waiting under an event, B5). */
  note?: string;
}

/** The kinds that have no count of those going: Most going keeps them nearest first (B13). */
const UNCOUNTED: ReadonlySet<ListKind> = new Set<ListKind>(['research', 'rocket', 'spawns']);

/**
 * The groups of the list for the layers on, each sorted; a group with a note (`notes`) is shown
 * with it, lines or none.
 */
export function listGroups(
  lines: readonly ListLine[],
  how: {
    on: (kind: ListKind) => boolean;
    sort: ListSort;
    origin: LatLon | undefined;
    notes?: Partial<Record<ListKind, string>>;
  },
): ListGroup[] {
  const distance = (line: ListLine): number =>
    line.point && how.origin ? metersBetween(how.origin, line.point) : Infinity;
  const order =
    (sort: ListSort) =>
    (a: ListLine, b: ListLine): number => {
      // What the map cannot place goes last in its group, whatever the sort.
      if ((a.point === null) !== (b.point === null)) return a.point === null ? 1 : -1;
      const by =
        sort === 'nearest'
          ? distance(a) - distance(b)
          : sort === 'soonest'
            ? (a.soonest ?? Infinity) - (b.soonest ?? Infinity)
            : b.going - a.going;
      return (Number.isNaN(by) ? 0 : by) || a.name.localeCompare(b.name);
    };
  return GROUPS.flatMap(([kind, name]) => {
    if (!how.on(kind)) return [];
    const of = lines.filter((line) => line.kind === kind);
    const note = how.notes?.[kind];
    if (of.length === 0 && note === undefined) return [];
    // Reports have no count of those going: nearest first under Most going (B13).
    const sort = how.sort === 'going' && UNCOUNTED.has(kind) ? 'nearest' : how.sort;
    return [
      {
        kind,
        heading: `${name} · ${of.length}`,
        lines: [...of].sort(order(sort)),
        ...(note === undefined ? {} : { note }),
      },
    ];
  });
}

/** What a line says. */
export interface LineWords {
  name: string;
  place: string | null;
  distance: string | null;
  time: string;
  going: string;
  dimmed: boolean;
  /** Find's mark of a report not confirmed (plan 8M-12). */
  mark?: string;
}

/**
 * A line's words, its distance from `origin` (your location, else the map's middle) in the
 * settings' units (`settings.distanceUnits`, the page's `data-distance-units`; task 7).
 */
export function lineWords(
  line: ListLine,
  origin: LatLon | undefined,
  now: number,
  zone: string,
  units: DistanceUnits,
): LineWords {
  const { stage, hatch = null, end = null, start = null, until } = line.times;
  let time: string;
  let dimmed = false;
  // A place Find found (plan 8M-12) has no time.
  if (Object.keys(line.times).length === 0) time = '';
  else if (until !== undefined) time = untilWords(until, now, zone);
  else if (stage === undefined) time = startWords(start, now, zone);
  else {
    // Egg or hatched by the clock: the domain's `stageAt`, as the marker reads it.
    const hatched =
      stageAt({ hatchTime: hatch, endTime: null, reportedHatched: stage !== 'egg' }, now) ===
      'hatched';
    dimmed = isDimmed({ stage, hatchTime: hatch, endTime: end }, now);
    if (!hatched) time = hatch === null ? 'Egg' : `hatches ${clockTime(hatch, zone, now)}`;
    else if (end === null) time = 'Hatched';
    else {
      // The time left in full (plan 8M-11A, S19): "29 min left" where the post says "in 29 minutes".
      time = timeLeft(end, now) ?? 'Ended';
    }
  }
  return {
    name: line.name,
    place: line.place,
    distance: line.point && origin ? distanceWords(metersBetween(origin, line.point), units) : null,
    time,
    going: line.going > 0 ? `${line.going} going` : '',
    dimmed,
    ...(line.mark === undefined ? {} : { mark: line.mark }),
  };
}

/** What the side pane shows: the list, a form open over it, or how to log in. */
export function paneShows(state: {
  loggedIn: boolean;
  formOpen: boolean;
}): 'list' | 'form' | 'login' {
  if (state.formOpen) return 'form';
  return state.loggedIn ? 'list' : 'login';
}

/** Where the sort is kept in the browser. */
export const SORT_KEY = 'pine-map-sort';

/** The sort kept in this browser; Nearest by default and where nothing (good) is kept. */
export function readSort(storage: ViewStorage | undefined): ListSort {
  try {
    const kept = storage?.getItem(SORT_KEY);
    return SORTS.some(([sort]) => sort === kept) ? (kept as ListSort) : 'nearest';
  } catch {
    return 'nearest';
  }
}

/** Keeps the sort; a browser that keeps nothing is left alone. */
export function writeSort(storage: ViewStorage | undefined, sort: ListSort): void {
  try {
    storage?.setItem(SORT_KEY, sort);
  } catch {
    // Private mode or a full storage: the sort holds for this visit.
  }
}

/** How far your location must move for the list, sorted Nearest, to be drawn anew. */
export const FIX_REDRAW_METERS = 25;

/**
 * Whether a new fix of your location draws the list anew (fix round 1): only sorted Nearest, and
 * only once it moved more than `FIX_REDRAW_METERS` from where the list was drawn from.
 */
export function fixRedraws(drawnFrom: LatLon | undefined, now: LatLon, sort: ListSort): boolean {
  if (sort !== 'nearest') return false;
  return drawnFrom === undefined || metersBetween(drawnFrom, now) > FIX_REDRAW_METERS;
}

/** What `ListRefresh` needs: whether a form holds, and the drawing of the list. */
export interface ListRefreshDeps {
  held(): boolean;
  draw(): void;
}

/**
 * When the list is drawn anew between two lists of parties (fix round 1): a move of the map, a
 * change of layers, a fix of your location (`fixRedraws`) draw it, but never while a form holds
 * (a line's change form, its group menu, its focus stay as they are); then once, when the form
 * lets go (`released`).
 */
export class ListRefresh {
  private waiting = false;
  private drawnFrom: LatLon | undefined;

  constructor(private readonly deps: ListRefreshDeps) {}

  moved(): void {
    this.draw();
  }

  layers(): void {
    this.draw();
  }

  fixed(at: LatLon, sort: ListSort): void {
    if (!fixRedraws(this.drawnFrom, at, sort)) return;
    this.drawnFrom = at;
    this.draw();
  }

  /** The form that held let go: what waited is drawn. */
  released(): void {
    if (!this.waiting || this.deps.held()) return;
    this.waiting = false;
    this.deps.draw();
  }

  private draw(): void {
    if (this.deps.held()) {
      this.waiting = true;
      return;
    }
    this.deps.draw();
  }
}
