import { metresBetween } from '@pine/wayspot-core/distance';
import { WAYSPOT_MOVED_METRES } from '../geo/spot-address.js';
import { searchText } from '../search/text.js';

/** What the match reads of a gym of either server. */
export interface MatchedGym {
  id: number;
  /** Its Wayfarer id, where it has one. */
  pogoId: string | null;
  name: string;
  lat: number;
  lon: number;
}

/**
 * How near two gyms of two servers lie to be one place, failing a Wayfarer id: the tolerance of
 * Google's answers (`GoogleAnswers.at`, `WAYSPOT_MOVED_METRES`), within which Pine shows one
 * place's answer on the other.
 */
export const SAME_GYM_METRES = WAYSPOT_MOVED_METRES;

/** The key of the cell of a thousandth of a degree a point lies in (about 111 m north to south). */
function cellOf(lat: number, lon: number): string {
  return `${String(Math.floor(lat * 1000))}:${String(Math.floor(lon * 1000))}`;
}

/**
 * The gyms of two servers that are the same gym (plan 19E, neighbors), ours to theirs, each at
 * most once: one row both servers have (the upgrade linked it to both) is the same gym; else the
 * Wayfarer id where both have one (two different ids are never the same gym, however near); else
 * a place within `SAME_GYM_METRES` and the same name as the search reads it (`searchText`). Of
 * several, the nearest pairs first, then the lower ids. The places are found by cells of a
 * thousandth of a degree, so a city's gyms are not measured against every other.
 */
export function sameGyms(
  ours: readonly MatchedGym[],
  theirs: readonly MatchedGym[],
): Map<number, number> {
  const matched = new Map<number, number>();
  const taken = new Set<number>();
  const theirIds = new Set(theirs.map((gym) => gym.id));
  for (const gym of ours) {
    if (theirIds.has(gym.id)) {
      matched.set(gym.id, gym.id);
      taken.add(gym.id);
    }
  }
  const byWayfarer = new Map<string, MatchedGym[]>();
  const cells = new Map<string, MatchedGym[]>();
  for (const gym of theirs) {
    if (taken.has(gym.id)) continue;
    if (gym.pogoId !== null)
      byWayfarer.set(gym.pogoId, [...(byWayfarer.get(gym.pogoId) ?? []), gym]);
    const cell = cellOf(gym.lat, gym.lon);
    cells.set(cell, [...(cells.get(cell) ?? []), gym]);
  }
  const pairs: { ours: MatchedGym; theirs: MatchedGym; metres: number }[] = [];
  for (const gym of ours) {
    if (matched.has(gym.id)) continue;
    const sameId = gym.pogoId === null ? [] : (byWayfarer.get(gym.pogoId) ?? []);
    for (const other of sameId) {
      // Before every pair by place: a Wayfarer id is surer than any place.
      pairs.push({ ours: gym, theirs: other, metres: -1 / (1 + metresBetween(gym, other)) });
    }
    const name = searchText(gym.name);
    const row = Math.floor(gym.lat * 1000);
    const column = Math.floor(gym.lon * 1000);
    for (let dLat = -1; dLat <= 1; dLat += 1) {
      for (let dLon = -1; dLon <= 1; dLon += 1) {
        for (const other of cells.get(`${String(row + dLat)}:${String(column + dLon)}`) ?? []) {
          if (gym.pogoId !== null && other.pogoId !== null) continue;
          const metres = metresBetween(gym, other);
          if (metres <= SAME_GYM_METRES && searchText(other.name) === name) {
            pairs.push({ ours: gym, theirs: other, metres });
          }
        }
      }
    }
  }
  pairs.sort((a, b) => a.metres - b.metres || a.ours.id - b.ours.id || a.theirs.id - b.theirs.id);
  for (const pair of pairs) {
    if (matched.has(pair.ours.id) || taken.has(pair.theirs.id)) continue;
    matched.set(pair.ours.id, pair.theirs.id);
    taken.add(pair.theirs.id);
  }
  return matched;
}
