import { clustersAt } from './cluster.js';
import { gymFilter } from './filter.js';
import type { MapGym } from './popup.js';
import { inBox, paddedBox, type Box } from './view.js';

/** How far beyond the view the dots are drawn, as a share of its size each way. */
export const DOTS_MARGIN = 0.5;

/** The key a place's own dot is drawn by (`wantedDots`, `planDots`'s `open`). */
export const dotKey = (id: number): string => `gym:${String(id)}`;

/** A thing the gyms' layer draws: a gym's dot, or a cluster with its count. */
export type WantedDot<G> =
  { kind: 'dot'; gym: G } | { kind: 'cluster'; points: G[]; lat: number; lon: number };

/**
 * What the gyms' layer draws for a view (plan 8M-7, fix round 1): the gyms of the view and a
 * margin round it (`DOTS_MARGIN`), clustered below street level (`clustersAt`), by key: `gym:<id>`
 * for a dot, `cluster:<zoom>:<cell>` for a cluster (plan 8M-11B, S13: its cell alone, so that a
 * cluster whose places change is the same one, its count and place changed in place,
 * `planDots`). The gym whose popup is open (`open`) is always drawn on its own, out of every
 * cluster, wherever it is, so that its popup is never taken away.
 */
export function wantedDots<G extends { id: number; lat: number; lon: number }>(
  gyms: readonly G[],
  zoom: number,
  view: Box,
  open: number | undefined,
): Map<string, WantedDot<G>> {
  const box = paddedBox(view, DOTS_MARGIN);
  const wanted = new Map<string, WantedDot<G>>();
  const near = gyms.filter((gym) => gym.id !== open && inBox(box, gym));
  for (const cluster of clustersAt(near, zoom)) {
    const [first] = cluster.points;
    if (!first) continue;
    if (cluster.points.length === 1) wanted.set(dotKey(first.id), { kind: 'dot', gym: first });
    else {
      wanted.set(`cluster:${String(zoom)}:${cluster.cell ?? ''}`, {
        kind: 'cluster',
        points: cluster.points,
        lat: cluster.lat,
        lon: cluster.lon,
      });
    }
  }
  const opened = gyms.find((gym) => gym.id === open);
  if (opened) wanted.set(dotKey(opened.id), { kind: 'dot', gym: opened });
  return wanted;
}

/** What a drawn cluster shows (its count and place); undefined for a gym's dot. */
export type DrawnDot = { count: number; lat: number; lon: number } | undefined;

/** How the gyms' layer goes from what it drew to what is wanted (`planDots`). */
export interface DotsPlan {
  /** Keys to draw anew. */
  add: string[];
  /** Keys to take off. */
  remove: string[];
  /** A cluster's marker no longer wanted, given to a new cluster: its count and place set. */
  move: Array<[from: string, to: string]>;
  /** A cluster drawn and still wanted whose count or place changed: set in place. */
  change: string[];
}

/**
 * How to go from what is drawn (by key, with what each cluster shows) to what is wanted (plan
 * 8M-11B, S13), touching as little as can be: a key wanted and drawn the same is left alone (a
 * poll that changes no gym changes nothing); a cluster whose count or place changed is changed in
 * place; a new cluster takes over the marker of a cluster no longer wanted (a zoom, a pan), in
 * order, rather than a marker being taken off and another made; the rest is added and taken
 * off. Never the open gym's dot.
 */
export function planDots<G>(
  drawn: ReadonlyMap<string, DrawnDot>,
  wanted: ReadonlyMap<string, WantedDot<G>>,
  open: string | undefined,
): DotsPlan {
  const added = [...wanted.keys()].filter((key) => !drawn.has(key));
  const gone = [...drawn.keys()].filter((key) => !wanted.has(key) && key !== open);
  const goneClusters = gone.filter((key) => drawn.get(key) !== undefined);
  const move: Array<[string, string]> = [];
  const add: string[] = [];
  for (const key of added) {
    const free = wanted.get(key)?.kind === 'cluster' ? goneClusters.shift() : undefined;
    if (free === undefined) add.push(key);
    else move.push([free, key]);
  }
  const moved = new Set(move.map(([from]) => from));
  const change = [...wanted].flatMap(([key, item]) => {
    const shown = drawn.get(key);
    if (item.kind !== 'cluster' || shown === undefined) return [];
    const same =
      shown.count === item.points.length && shown.lat === item.lat && shown.lon === item.lon;
    return same ? [] : [key];
  });
  return { add, remove: gone.filter((key) => !moved.has(key)), move, change };
}

/** What decides which gyms the map draws. */
export interface GymsShown {
  /** The Gyms layer is on. */
  on: boolean;
  /** What "Find a gym" holds. */
  filter: string;
  /** A gym is to be clicked: route mode, or a meetup's place being picked. */
  forced: boolean;
}

/**
 * The gyms the map draws (plan 8M-7): while the Gyms layer is on or a gym is to be clicked (route
 * mode, a meetup's place picked: the map must offer them whatever the layer), every gym, or those
 * "Find a gym" matches while it holds a word; none otherwise, also with a word (plan 8M-13, L2:
 * Gyms off hides a search's matches, on again shows them while the text stands).
 */
export function shownGyms(gyms: readonly MapGym[], shown: GymsShown): MapGym[] {
  if (!shown.on && !shown.forced) return [];
  if (shown.filter.trim() !== '') return gyms.filter(gymFilter(shown.filter));
  return [...gyms];
}
