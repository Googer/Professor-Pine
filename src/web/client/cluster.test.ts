import { describe, expect, it } from 'vitest';
import {
  CLUSTER_BELOW,
  clustersAt,
  PlacesInView,
  placesWanted,
  PLACES_FROM,
  unoccupied,
} from './cluster.js';
import { StopLoads } from './meetup-forms.js';

/** Gyms of Oakland, Pittsburgh: two a street apart, one across the river. */
const NEAR_A = { id: 1, lat: 40.4443, lon: -79.9532 };
const NEAR_B = { id: 2, lat: 40.4446, lon: -79.9529 };
const FAR = { id: 3, lat: 40.4304, lon: -79.9228 };

describe("Pine's grid clustering (plan 8M-7)", () => {
  it('puts the places of one cell of the grid into one cluster with its count, below zoom 16', () => {
    const clusters = clustersAt([NEAR_A, NEAR_B, FAR], 12);
    expect(clusters.map((cluster) => cluster.points.map((point) => point.id))).toEqual([
      [1, 2],
      [3],
    ]);
    const [both] = clusters;
    // Drawn at the middle of its places.
    expect(both?.lat).toBeCloseTo((NEAR_A.lat + NEAR_B.lat) / 2, 9);
    expect(both?.lon).toBeCloseTo((NEAR_A.lon + NEAR_B.lon) / 2, 9);
  });

  it('parts places as the map zooms in, and never clusters from zoom 16', () => {
    expect(clustersAt([NEAR_A, NEAR_B, FAR], 9)).toHaveLength(1);
    expect(clustersAt([NEAR_A, NEAR_B, FAR], 15).map((c) => c.points.length)).toEqual([2, 1]);
    expect(clustersAt([NEAR_A, NEAR_B, FAR], 16).map((c) => c.points.length)).toEqual([1, 1, 1]);
    expect(CLUSTER_BELOW).toBe(16);
    expect(clustersAt([NEAR_A, { ...NEAR_A, id: 9 }], 16)).toHaveLength(2);
    expect(clustersAt([], 10)).toEqual([]);
  });

  it('keeps its cells fixed on the world, so a cluster does not change as the map pans', () => {
    const once = clustersAt([NEAR_A, NEAR_B, FAR], 13);
    const again = clustersAt([FAR, NEAR_B, NEAR_A], 13);
    const ids = (clusters: typeof once) =>
      clusters.map((cluster) => cluster.points.map((point) => point.id).sort()).sort();
    expect(ids(again)).toEqual(ids(once));
  });
});

describe('the PokéStops and Power Spots in view (plan 8M-7)', () => {
  it('are wanted from zoom 16, when their layer is on, for a member', () => {
    expect(PLACES_FROM).toBe(16);
    expect(placesWanted(true, 16, true)).toBe(true);
    expect(placesWanted(true, 15, true)).toBe(false);
    expect(placesWanted(false, 17, true)).toBe(false);
    expect(placesWanted(true, 17, false)).toBe(false);
  });

  // Plan 8M-9A (A4): a report's step 2 draws its places whatever the layer says.
  it('are wanted while a report picks them, the layer off, from the same zoom', () => {
    expect(placesWanted(false, 16, true, true)).toBe(true);
    expect(placesWanted(false, 15, true, true)).toBe(false);
    expect(placesWanted(false, 17, false, true)).toBe(false);
  });

  // Plan 8M-9A (A6): one card per thing at a place: a spot with a battle drawn shows the battle.
  it('leave out the places whose own thing is drawn there', () => {
    const spots: Array<[string, number, number, string]> = [
      ['a', 40.44, -79.95, 'Lake Gazebo'],
      ['b', 40.45, -79.95, 'Fountain'],
    ];
    expect(unoccupied(spots, new Set(['a']))).toEqual([spots[1]]);
    expect(unoccupied(spots, new Set())).toEqual(spots);
  });

  it('are asked for only while wanted: at once, after the map rests, and no more after', async () => {
    const timers: Array<() => void> = [];
    let asked = 0;
    let cleared = 0;
    const shown: number[] = [];
    const loads = new StopLoads({
      load: () => {
        asked += 1;
        return Promise.resolve({ stops: [['s1', 40.44, -79.95, 'Fountain']], more: false });
      },
      show: (view) => shown.push(view.stops.length),
      more: () => undefined,
      failed: () => undefined,
      delayMs: 300,
      setTimer: (run) => {
        timers.push(run);
        return () => {
          timers.splice(timers.indexOf(run), 1);
        };
      },
    });
    const places = new PlacesInView({
      loads,
      clear: () => {
        cleared += 1;
      },
    });
    // Zoomed out or off: nothing asked.
    places.changed(false);
    expect(asked).toBe(0);
    // Wanted: asked at once.
    places.changed(true);
    await loads.idle();
    expect(asked).toBe(1);
    // The map moved twice: asked once, after it rested.
    places.changed(true, true);
    places.changed(true, true);
    expect(timers).toHaveLength(1);
    timers.shift()?.();
    await loads.idle();
    expect(asked).toBe(2);
    // Zoomed out again: cleared, and an answer on its way is not shown.
    places.changed(true, true);
    places.changed(false);
    expect(cleared).toBe(1);
    expect(timers).toHaveLength(0);
    expect(shown).toEqual([1, 1]);
  });
});
