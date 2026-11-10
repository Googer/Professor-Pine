import { describe, expect, it } from 'vitest';
import { cellPixels, clustersAt } from './cluster.js';
import { planDots, shownGyms, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
import type { MapGym } from './popup.js';

const gym = (id: number, name: string): MapGym => ({
  id,
  name,
  nickname: null,
  lat: 40.44,
  lon: -79.95 + id / 1000,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

const GYMS = [gym(1, 'Carnegie Library'), gym(2, 'Schenley Fountain'), gym(3, 'Library Steps')];
const ids = (gyms: readonly MapGym[]) => gyms.map((one) => one.id);

describe('the gyms the map draws (plan 8M-7)', () => {
  it('are every gym while the layer is on, and none while it is off', () => {
    expect(ids(shownGyms(GYMS, { on: true, filter: '', forced: false }))).toEqual([1, 2, 3]);
    expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: false }))).toEqual([]);
  });

  it('are those "Find a gym" matches while it holds a word and the layer is on', () => {
    expect(ids(shownGyms(GYMS, { on: true, filter: 'fountain', forced: false }))).toEqual([2]);
  });

  // Plan 8M-13 (L2): Gyms off hides a search's matches; on again shows them while the text stands.
  it('are none while the layer is off, whatever "Find a gym" holds', () => {
    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: false }))).toEqual([]);
  });

  it('are every gym, or the matches, while a gym is to be clicked (route mode, a place picked)', () => {
    expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: true }))).toEqual([1, 2, 3]);
    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: true }))).toEqual([1, 3]);
  });
});

/** A view of Oakland at street level and the gyms around it. */
const at = (id: number, lat: number, lon: number): MapGym => ({
  ...gym(id, 'Gym ' + id),
  lat,
  lon,
});
const VIEW = { south: 40.44, west: -79.96, north: 40.45, east: -79.94 };

describe('the dots and clusters drawn (plan 8M-7, fix round 1)', () => {
  it('are those of the view and a margin round it, the rest left out', () => {
    const inView = at(1, 40.445, -79.95);
    const inMargin = at(2, 40.452, -79.95);
    const far = at(3, 40.6, -79.95);
    const wanted = wantedDots([inView, inMargin, far], 16, VIEW, undefined);
    expect([...wanted.keys()].sort()).toEqual(['gym:1', 'gym:2']);
  });

  // Plan 8M-11B (S13): a cluster is its cell, whatever its places, so that a change of them
  // changes its count and place in place rather than drawing it anew.
  it('clusters below street level, each cluster keyed by its zoom and its cell alone', () => {
    const a = at(1, 40.445, -79.95);
    const b = at(2, 40.4451, -79.9501);
    const wanted = wantedDots([a, b], 12, VIEW, undefined);
    const [key] = [...wanted.keys()];
    expect(wanted.size).toBe(1);
    expect(key).toMatch(/^cluster:12:\d+:\d+$/u);
    const item = wanted.get(key ?? '');
    expect(item?.kind === 'cluster' ? item.points.map((one) => one.id) : []).toEqual([1, 2]);
    // Another place in the same cell: the same cluster, counting three.
    const more = wantedDots([a, b, at(3, 40.4452, -79.9502)], 12, VIEW, undefined);
    expect([...more.keys()]).toEqual([key]);
    const three = more.get(key ?? '');
    expect(three?.kind === 'cluster' ? three.points.length : 0).toBe(3);
    // At another zoom the grid is another: another key.
    expect([...wantedDots([a, b], 11, VIEW, undefined).keys()]).not.toContain(key);
  });

  it('makes the cells larger as the map zooms out: fewer clusters', () => {
    expect([15, 14, 13, 12, 11, 8].map(cellPixels)).toEqual([60, 90, 90, 120, 120, 120]);
    // A row of 50 gyms about 50 meters apart, across the view: fewer clusters than 60-pixel
    // cells would make, below zoom 15.
    const row = Array.from({ length: 50 }, (_, index) =>
      at(index + 1, 40.445, -79.965 + index * 0.0006),
    );
    for (const zoom of [12, 13, 14]) {
      const drawn = wantedDots(row, zoom, VIEW, undefined).size;
      expect(drawn, `zoom ${String(zoom)}`).toBeLessThan(clustersAt(row, zoom, 60).length);
    }
    expect(wantedDots(row, 15, VIEW, undefined).size).toBe(clustersAt(row, 15, 60).length);
  });

  it('keeps the gym whose popup is open on its own, out of clusters and out of view', () => {
    const a = at(1, 40.445, -79.95);
    const b = at(2, 40.4451, -79.9501);
    const wanted = wantedDots([a, b], 12, VIEW, 2);
    // Gym 2 is open: on its own; gym 1, alone in its cell then, a dot.
    expect([...wanted.keys()].sort()).toEqual(['gym:1', 'gym:2']);
    const away = wantedDots([at(9, 40.7, -79.95)], 16, VIEW, 9);
    expect([...away.keys()]).toEqual(['gym:9']);
  });

  /** A cluster as wanted, of `count` gyms at a place. */
  const cluster = (count: number, lat = 40.44, lon = -79.95) => ({
    kind: 'cluster' as const,
    points: Array.from({ length: count }, (_, index) => gym(index + 1, 'Gym')),
    lat,
    lon,
  });
  const dot = { kind: 'dot' as const, gym: gym(1, 'Gym') };
  const drawnAs = (entries: Array<[string, DrawnDot]>) => new Map(entries);

  it('adds and takes off only the difference, never the open gym', () => {
    const wanted = new Map([
      ['gym:1', dot],
      ['gym:3', dot],
    ]);
    const drawn = drawnAs([
      ['gym:1', undefined],
      ['gym:2', undefined],
      ['gym:5', undefined],
    ]);
    expect(planDots(drawn, wanted, 'gym:5')).toEqual({
      add: ['gym:3'],
      remove: ['gym:2'],
      move: [],
      change: [],
    });
  });

  // Plan 8M-11B (S13): a poll that changes no gym draws nothing.
  it('changes nothing where what is wanted is what is drawn', () => {
    const wanted = new Map<string, WantedDot<MapGym>>([
      ['gym:1', dot],
      ['cluster:12:1:2', cluster(3)],
    ]);
    const drawn = drawnAs([
      ['gym:1', undefined],
      ['cluster:12:1:2', { count: 3, lat: 40.44, lon: -79.95 }],
    ]);
    expect(planDots(drawn, wanted, undefined)).toEqual({
      add: [],
      remove: [],
      move: [],
      change: [],
    });
  });

  it("changes a cluster's count and place in place when its gyms change", () => {
    const wanted = new Map([['cluster:12:1:2', cluster(2, 40.441, -79.951)]]);
    const drawn = drawnAs([['cluster:12:1:2', { count: 3, lat: 40.44, lon: -79.95 }]]);
    expect(planDots(drawn, wanted, undefined)).toEqual({
      add: [],
      remove: [],
      move: [],
      change: ['cluster:12:1:2'],
    });
  });

  it("moves a cluster's marker no longer wanted to a new cluster rather than drawing one anew", () => {
    const wanted = new Map<string, WantedDot<MapGym>>([
      ['cluster:13:5:5', cluster(2)],
      ['cluster:13:5:6', cluster(4)],
      ['gym:7', dot],
    ]);
    const drawn = drawnAs([
      ['cluster:12:1:1', { count: 9, lat: 40.4, lon: -79.9 }],
      ['gym:8', undefined],
    ]);
    expect(planDots(drawn, wanted, undefined)).toEqual({
      add: ['cluster:13:5:6', 'gym:7'],
      remove: ['gym:8'],
      move: [['cluster:12:1:1', 'cluster:13:5:5']],
      change: [],
    });
  });
});
