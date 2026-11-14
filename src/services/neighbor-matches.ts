import { BoundedMap } from '../bounded-map.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { sameGyms } from '../domain/gyms/neighbor-match.js';
import type { GymDirectory } from './gym-directory.js';
import type { WayspotProvider } from './wayspot-directory.js';

/** What the matches read of the gyms: a server's own, without building its view. */
export type MatchGyms = Pick<GymDirectory, 'gymsOf' | 'generationOf' | 'regionsIn'>;

/** What the matches read of the kept Wayspots: where a server's copy of one lies. */
export type MatchSpots = Pick<WayspotProvider, 'regionsIn'>;

/**
 * How many pairs' matches are kept, the one asked for longest ago going first (built again when
 * asked): every pair of neighbors, `NEIGHBORS_MAX` a server, of a few hundred servers.
 */
export const MATCHED_PAIRS_KEPT = 2_000;

/** How many servers' gyms inside their regions are kept for the matches (built again when asked). */
export const MATCHED_SERVERS_KEPT = 500;

/** A pair's matches as built, both ways, with the marks of both servers' gyms they were built at. */
interface Matched {
  marks: [string, string];
  /** The lower row's gyms to the higher's, and back. */
  forward: Map<number, number>;
  backward: Map<number, number>;
  /** `forward` as `changesOf` last said it (what the posts were redrawn for). */
  said: Map<number, number>;
}

/** A server's gyms inside its own regions, with the mark of its gyms they were read at. */
interface InRegions {
  mark: string;
  gyms: Gym[];
}

/** The keys whose values differ between two maps (one without the key counting as different). */
function differing(one: ReadonlyMap<number, number>, other: ReadonlyMap<number, number>): number[] {
  const keys = new Set([...one.keys(), ...other.keys()]);
  return [...keys].filter((key) => one.get(key) !== other.get(key)).sort((a, b) => a - b);
}

/** The key of a pair of rows, the lower first. */
function pairOf(low: number, high: number): string {
  return `${String(low)}:${String(high)}`;
}

/** A map turned around: its values to its keys. */
function inverse(map: ReadonlyMap<number, number>): Map<number, number> {
  return new Map([...map].map(([from, to]) => [to, from]));
}

/**
 * The same gym or Power Spot of two neighbors (plan 19E), by `Guild` rows. Two servers' gyms
 * are matched by `sameGyms` (one row both have; else the Wayfarer id; else the place and the name),
 * of each server's gyms inside its own regions alone ("inside both servers' regions"), and kept in
 * memory per pair: built when the pair is first asked, and again when either server's gyms changed
 * since (`GymDirectory.generationOf`: an import, an edit, a link or a removal, a load that found
 * its regions or gyms changed), never for another server's change. Each server's gyms inside its
 * regions are read once per mark of its gyms, for all its pairs (review R9). A Power Spot is the
 * same Wayfarer id in both servers' kept Wayspots, inside a region of each.
 */
export class NeighborMatches {
  private readonly pairs: BoundedMap<string, Matched>;
  private readonly servers: BoundedMap<number, InRegions>;
  /** How many times a pair's matches were built: for tests. */
  rebuilt = 0;

  constructor(private readonly options: { gyms: MatchGyms; spots?: MatchSpots; kept?: number }) {
    this.pairs = new BoundedMap(options.kept ?? MATCHED_PAIRS_KEPT);
    this.servers = new BoundedMap(MATCHED_SERVERS_KEPT);
  }

  /** The gym of `toRow` that is `fromRow`'s gym `gymId`, where both lie inside their regions. */
  sameGym(fromRow: number, gymId: number, toRow: number): number | undefined {
    if (fromRow === toRow) return undefined;
    const matched = this.matchedOf(fromRow, toRow);
    return (fromRow < toRow ? matched.forward : matched.backward).get(gymId);
  }

  /** Every gym of `ourRow` that is a gym of `theirRow`, ours to theirs (`/admin neighbors copy`). */
  matchedGyms(ourRow: number, theirRow: number): ReadonlyMap<number, number> {
    if (ourRow === theirRow) return new Map();
    const matched = this.matchedOf(ourRow, theirRow);
    return ourRow < theirRow ? matched.forward : matched.backward;
  }

  /**
   * The gyms of each of the two servers that gained, lost or changed their match since this was
   * last asked of the pair (review R9: the posts of the parties there are drawn anew), by row.
   * Renders that built the pair anew in between change nothing of it: what is said is against
   * what was said, or what the render that first built it showed. A pair this builds itself (no
   * render asked of it since the start, or it was let go: review RR3) says every gym of both
   * servers with a match, once: the posts there were drawn before the change, which is not
   * known.
   */
  changesOf(one: number, other: number): Map<number, number[]> {
    if (one === other) return new Map([[one, []]]);
    const [low, high] = one < other ? [one, other] : [other, one];
    const first = !this.pairs.has(pairOf(low, high));
    const matched = this.matchedOf(low, high);
    if (first) matched.said = new Map();
    const changes = new Map([
      [low, differing(matched.said, matched.forward)],
      [high, differing(inverse(matched.said), matched.backward)],
    ]);
    matched.said = matched.forward;
    return changes;
  }

  /**
   * Lets go of a server whose data was deleted (plan 19C-3, `forgetServerMemory`): its gyms inside
   * its regions and every pair of it; other pairs are kept as they were.
   */
  forgetRow(guildRow: number): void {
    this.servers.delete(guildRow);
    for (const key of this.pairs.keys()) {
      const [low, high] = key.split(':').map(Number);
      if (low === guildRow || high === guildRow) this.pairs.delete(key);
    }
  }

  /** Whether both servers keep the Power Spot `spotId` inside a region of each. */
  sameSpot(fromRow: number, spotId: string, toRow: number): boolean {
    const { spots } = this.options;
    if (spots === undefined || fromRow === toRow) return false;
    return spots.regionsIn(fromRow, spotId).length > 0 && spots.regionsIn(toRow, spotId).length > 0;
  }

  /** The pair's matches, built anew where either server's gyms changed since. */
  private matchedOf(one: number, other: number): Matched {
    const [low, high] = one < other ? [one, other] : [other, one];
    const key = pairOf(low, high);
    const { gyms } = this.options;
    const marks: [string, string] = [gyms.generationOf(low), gyms.generationOf(high)];
    const kept = this.pairs.get(key);
    if (kept && kept.marks[0] === marks[0] && kept.marks[1] === marks[1]) return kept;
    const forward = sameGyms(this.inRegions(low), this.inRegions(high));
    const backward = inverse(forward);
    const built = { marks, forward, backward, said: kept?.said ?? forward };
    this.pairs.set(key, built);
    this.rebuilt += 1;
    return built;
  }

  /** A server's gyms inside its own regions, read once per mark of its gyms. */
  private inRegions(guildId: number): Gym[] {
    const { gyms } = this.options;
    const mark = gyms.generationOf(guildId);
    const kept = this.servers.get(guildId);
    if (kept?.mark === mark) return kept.gyms;
    const inside = [...gyms.gymsOf(guildId)].filter(
      (gym) => gyms.regionsIn(guildId, gym.id).length > 0,
    );
    this.servers.set(guildId, { mark, gyms: inside });
    return inside;
  }
}
