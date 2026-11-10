import { metresBetween, nearestTo, type Placed } from '@pine/wayspot-core/distance';

/** What the bookkeeping of nearest gyms needs of a gym (`Gym` of the repository has it). */
export interface NearGym extends Placed {
  /** The id of the gym nearest to this one as it is stored; null when none is. */
  nearestGym: number | null;
}

/** A gym whose stored nearest gym is no longer right, with what it should be. */
interface NearestChange {
  id: number;
  /** Null when there is no other gym. */
  nearestGym: number | null;
}

/** What happened to the gyms: one was added or moved (`placed`), or one is gone (`removed`). */
export interface NearestEvent {
  /** The id of the gym that was added or moved; it is among `gyms`, where it lies now. */
  placed?: number;
  /** The id of the gym that was deleted; it is not among `gyms`. */
  removed?: number;
}

/**
 * Which gyms need another nearest gym after one gym was added, moved or deleted, given every
 * gym as it is now. Only the gyms concerned are looked at, and only those whose stored value is
 * wrong are answered (the legacy bot compared every gym with every other and rewrote them all):
 *
 * - the gym that was added or moved itself;
 * - the gyms that pointed at the gym that moved or is gone: each looks for its nearest anew;
 * - every other gym for which the added or moved gym is now nearer than the one it points at
 *   (or that points at none, or at a gym that does not exist).
 *
 * Of two gyms equally near, the one with the lower id is the nearest. Sorted by id.
 */
export function nearestGymChanges(gyms: readonly NearGym[], event: NearestEvent): NearestChange[] {
  const byId = new Map(gyms.map((gym) => [gym.id, gym]));
  const placed = event.placed === undefined ? undefined : byId.get(event.placed);
  const changes: NearestChange[] = [];
  const note = (gym: NearGym, nearest: number | null): void => {
    if (gym.nearestGym !== nearest) changes.push({ id: gym.id, nearestGym: nearest });
  };
  for (const gym of gyms) {
    const pointsAt = gym.nearestGym === null ? undefined : byId.get(gym.nearestGym);
    // The gyms that look for their nearest among all gyms.
    const anew =
      gym.id === placed?.id ||
      (gym.nearestGym !== null &&
        (gym.nearestGym === event.removed || gym.nearestGym === placed?.id)) ||
      (placed !== undefined && (!pointsAt || pointsAt.id === gym.id));
    if (anew) {
      note(gym, nearestTo(gym, gyms)?.place.id ?? null);
      continue;
    }
    // After a deletion nothing came nearer to anybody.
    if (!placed || !pointsAt) continue;
    const now = metresBetween(gym, pointsAt);
    const offered = metresBetween(gym, placed);
    if (offered < now || (offered === now && placed.id < pointsAt.id)) note(gym, placed.id);
  }
  return changes.sort((a, b) => a.id - b.id);
}

/**
 * `nearestGymChanges` for a block of gyms added at once (plan 8W-6: a Wayfarer import adds its
 * new gyms in blocks), worked out once for the block instead of once per gym: each new gym looks
 * for its nearest among all gyms (the others of the block too), and every other gym takes the
 * nearest of the block when it is nearer than the one it points at (or it points at none, or at
 * one that does not exist). Of two gyms equally near, the lower id. Sorted by id.
 */
export function nearestBlockChanges(
  gyms: readonly NearGym[],
  added: ReadonlySet<number>,
): NearestChange[] {
  const byId = new Map(gyms.map((gym) => [gym.id, gym]));
  const block = gyms.filter((gym) => added.has(gym.id));
  const changes: NearestChange[] = [];
  const note = (gym: NearGym, nearest: number | null): void => {
    if (gym.nearestGym !== nearest) changes.push({ id: gym.id, nearestGym: nearest });
  };
  for (const gym of gyms) {
    const pointsAt = gym.nearestGym === null ? undefined : byId.get(gym.nearestGym);
    if (added.has(gym.id) || !pointsAt || pointsAt.id === gym.id) {
      note(gym, nearestTo(gym, gyms)?.place.id ?? null);
      continue;
    }
    let best = pointsAt;
    let bestMetres = metresBetween(gym, pointsAt);
    for (const other of block) {
      const metres = metresBetween(gym, other);
      if (metres < bestMetres || (metres === bestMetres && other.id < best.id)) {
        best = other;
        bestMetres = metres;
      }
    }
    note(gym, best.id);
  }
  return changes.sort((a, b) => a.id - b.id);
}
