import { describe, expect, it } from 'vitest';
import { nearestTo } from '@pine/wayspot-core/distance';
import { nearestBlockChanges, nearestGymChanges, type NearGym } from './nearest.js';

/** Gyms on one line, a hundredth of a degree of latitude (1.1 km) per step of `at`. */
const gym = (id: number, at: number, nearestGym: number | null = null): NearGym => ({
  id,
  lat: 40 + at / 100,
  lon: -80,
  nearestGym,
});

/** The gyms with the nearest gym of each as it should be stored. */
function settled(gyms: readonly NearGym[]): NearGym[] {
  return gyms.map((one) => ({ ...one, nearestGym: nearestTo(one, gyms)?.place.id ?? null }));
}

/** The gyms after the changes were written. */
function applied(gyms: readonly NearGym[], changes: ReturnType<typeof nearestGymChanges>) {
  return gyms.map((one) => {
    const change = changes.find(({ id }) => id === one.id);
    return change ? { ...one, nearestGym: change.nearestGym } : one;
  });
}

describe('nearestGymChanges', () => {
  // 1 at 0, 2 at 1, 3 at 5, 4 at 6: pairs (1, 2) and (3, 4).
  const before = settled([gym(1, 0), gym(2, 1), gym(3, 5), gym(4, 6)]);

  it('gives a new gym its nearest and makes it the nearest of the gyms it is nearer to', () => {
    // A new gym at 4.6: nearest to 3, and nearer to 3 than 4 is.
    const gyms = [...before, gym(5, 4.6)];
    const changes = nearestGymChanges(gyms, { placed: 5 });
    expect(changes).toEqual([
      { id: 3, nearestGym: 5 },
      { id: 5, nearestGym: 3 },
    ]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('answers only the gyms whose stored value is wrong', () => {
    // Far from everything: nobody else changes.
    const gyms = [...before, gym(5, 50)];
    expect(nearestGymChanges(gyms, { placed: 5 })).toEqual([{ id: 5, nearestGym: 4 }]);
    // And once that is stored, nothing is left to write.
    expect(nearestGymChanges(settled(gyms), { placed: 5 })).toEqual([]);
  });

  it('has the gyms that pointed at a moved gym look anew', () => {
    // Gym 2 moves from 1 to 5.4: gym 1 is left with 3, and 3 and 4 have a nearer neighbour.
    const gyms = before.map((one) => (one.id === 2 ? { ...one, lat: 40.054 } : one));
    const changes = nearestGymChanges(gyms, { placed: 2 });
    expect(changes).toEqual([
      { id: 1, nearestGym: 3 },
      { id: 2, nearestGym: 3 },
      { id: 3, nearestGym: 2 },
      { id: 4, nearestGym: 2 },
    ]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('has the gyms that pointed at a deleted gym look anew, and no others', () => {
    const gyms = before.filter((one) => one.id !== 4);
    const changes = nearestGymChanges(gyms, { removed: 4 });
    expect(changes).toEqual([{ id: 3, nearestGym: 2 }]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('leaves the last gym without a nearest one', () => {
    const [first] = settled([gym(1, 0), gym(2, 1)]);
    if (!first) throw new Error('no gym');
    expect(nearestGymChanges([first], { removed: 2 })).toEqual([{ id: 1, nearestGym: null }]);
    expect(nearestGymChanges([gym(1, 0)], { placed: 1 })).toEqual([]);
  });

  it('gives a gym that points at nothing, at itself or at a gym that is gone its nearest when a gym is placed', () => {
    const gyms = [gym(1, 0, null), gym(2, 1, 2), gym(3, 5, 99), gym(4, 6, 3), gym(5, 30)];
    const changes = nearestGymChanges(gyms, { placed: 5 });
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('does not look at gyms a deletion did not touch', () => {
    // Gym 1 points at nothing (old data): a deletion elsewhere is not the moment to mend it.
    const gyms = [gym(1, 0, null), gym(2, 1, 1), gym(3, 5, 2)];
    expect(nearestGymChanges(gyms, { removed: 9 })).toEqual([]);
  });

  it('prefers the lower id of two gyms that are equally near', () => {
    // Gym 9 points at 5, which is exactly as near as the new gym 3 at the same place.
    const gyms = [gym(9, 0, 5), gym(5, 1, 9), gym(3, 1)];
    expect(nearestGymChanges(gyms, { placed: 3 })).toEqual([
      { id: 3, nearestGym: 5 },
      { id: 5, nearestGym: 3 },
      { id: 9, nearestGym: 3 },
    ]);
  });

  it('agrees with a full comparison after any one addition, move or deletion', () => {
    // A fixed scatter of gyms; every single change of it must end where a full pass ends.
    const scatter = settled(
      [3, 17, 4, 40, 41, 12, 28, 29.5, 8, 35].map((at, index) => gym(index + 1, at)),
    );
    for (const target of scatter) {
      const without = scatter.filter((one) => one.id !== target.id);
      const removed = nearestGymChanges(without, { removed: target.id });
      expect(applied(without, removed)).toEqual(settled(without));
      for (const at of [0, 16.5, 28.7, 60]) {
        const moved = scatter.map((one) =>
          one.id === target.id ? { ...gym(one.id, at), nearestGym: one.nearestGym } : one,
        );
        expect(applied(moved, nearestGymChanges(moved, { placed: target.id }))).toEqual(
          settled(moved),
        );
      }
    }
    const added = [...scatter, gym(99, 28.2)];
    expect(applied(added, nearestGymChanges(added, { placed: 99 }))).toEqual(settled(added));
  });

  it('agrees with a full comparison on a few hundred random maps, in both directions', () => {
    // A small generator with a fixed seed (mulberry32): the same maps on every run.
    let state = 20261013;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A town of two kilometres across; a tenth of the gyms share a place with another.
    const somewhere = (id: number, among: readonly NearGym[]): NearGym => {
      const twin =
        among.length > 0 && random() < 0.1 ? among[Math.floor(random() * among.length)] : undefined;
      return {
        id,
        lat: twin ? twin.lat : 40 + random() * 0.02,
        lon: twin ? twin.lon : -80 + random() * 0.02,
        nearestGym: null,
      };
    };
    for (let round = 0; round < 300; round++) {
      const gyms: NearGym[] = [];
      const size = 1 + Math.floor(random() * 14);
      for (let id = 1; id <= size; id++) gyms.push(somewhere(id, gyms));
      const before = settled(gyms);
      const pick = before[Math.floor(random() * before.length)];
      if (!pick) throw new Error('no gym');
      const what = random();
      if (what < 0.34) {
        const added = [...before, somewhere(size + 1, before)];
        expect(
          applied(added, nearestGymChanges(added, { placed: size + 1 })),
          `add ${round}`,
        ).toEqual(settled(added));
      } else if (what < 0.67) {
        const moved = before.map((one) =>
          one.id === pick.id ? { ...somewhere(one.id, before), nearestGym: one.nearestGym } : one,
        );
        expect(
          applied(moved, nearestGymChanges(moved, { placed: pick.id })),
          `move ${round}`,
        ).toEqual(settled(moved));
      } else {
        const left = before.filter((one) => one.id !== pick.id);
        expect(
          applied(left, nearestGymChanges(left, { removed: pick.id })),
          `remove ${round}`,
        ).toEqual(settled(left));
      }
    }
  });
});

describe('nearestBlockChanges', () => {
  it('settles the gyms of a block added at once and those they are nearer to, as a full comparison', () => {
    // 1 at 0, 2 at 1, 3 at 5, 4 at 6; a block of 5 at 4.6, 6 at 4.7 and 7 at 20 (far away).
    const before = settled([gym(1, 0), gym(2, 1), gym(3, 5), gym(4, 6)]);
    const gyms = [...before, gym(5, 4.6), gym(6, 4.7), gym(7, 20)];
    const changes = nearestBlockChanges(gyms, new Set([5, 6, 7]));
    expect(changes).toEqual([
      { id: 3, nearestGym: 6 },
      { id: 5, nearestGym: 6 },
      { id: 6, nearestGym: 5 },
      { id: 7, nearestGym: 4 },
    ]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('agrees with a full comparison on random towns and blocks, ties to the lower id', () => {
    let state = 20261025;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let round = 0; round < 200; round++) {
      const town: NearGym[] = [];
      const size = Math.floor(random() * 12);
      for (let id = 1; id <= size; id++) {
        town.push({ id, lat: 40 + random() * 0.02, lon: -80 + random() * 0.02, nearestGym: null });
      }
      const before = settled(town);
      const block: NearGym[] = [];
      const count = 1 + Math.floor(random() * 8);
      for (let id = size + 1; id <= size + count; id++) {
        // A few share a place with another gym: ties.
        const twin = random() < 0.15 ? [...before, ...block][0] : undefined;
        block.push({
          id,
          lat: twin ? twin.lat : 40 + random() * 0.02,
          lon: twin ? twin.lon : -80 + random() * 0.02,
          nearestGym: null,
        });
      }
      const gyms = [...before, ...block];
      const added = new Set(block.map((one) => one.id));
      expect(applied(gyms, nearestBlockChanges(gyms, added)), `block ${round}`).toEqual(
        settled(gyms),
      );
    }
  });
});
