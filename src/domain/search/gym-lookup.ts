import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { gymsByRegion, type RegionGyms } from '@pine/wayspot-core/region-membership';
import { GymIndex, type SearchableGym } from './gym-index.js';

/** What the lookup needs to know of a gym (`Gym` of the gym repository has all of it). */
export interface LocatedGym extends SearchableGym {
  lat: number;
  lon: number;
}

/** What the lookup needs to know of a region (`Region` of the region repository has it). */
export interface RegionOutline {
  channelId: string;
  bounds: readonly LatLon[] | null;
}

/** Where a found gym lies, seen from the channel the search was made in. */
export type GymPlace = 'local' | 'neighbouring' | 'anywhere';

export interface GymHit<G> {
  gym: G;
  place: GymPlace;
  /**
   * Higher is better. Comparable only between hits of one search with the same `place` and the
   * same `corrected` value; the order of the list already puts those in the right sequence.
   */
  score: number;
  /** False when the gym has only some of the words typed: a guess, not a match. */
  allWords: boolean;
  /** True when a word had to be read as a misspelling to match. */
  corrected: boolean;
  /** How far what was found is from what was typed (`GymMatch.typos`); 0 as typed. */
  typos: number;
  /** How many typed words it does not have (`GymMatch.missed`): 0 with `allWords`. */
  missed: number;
}

export interface GymLookupOptions {
  /** Look only at names and keywords: for text read from a screenshot. */
  nameOnly?: boolean;
  /** At most this many hits. Default: all. */
  limit?: number;
  /**
   * Look only at these gyms, by id (a server's: `/wild near:`), in every place; whether any
   * has every word, and so whether there are guesses, is asked of them alone. Default: all.
   */
  within?: ReadonlySet<number>;
}

/**
 * The gyms, indexed for searching and sorted into regions.
 *
 * A search from a region channel looks at that region's gyms and at gyms just outside it (the
 * near edge of its neighbours, see `gymsByRegion`); a gym further away is not found from there.
 * A search from any other channel, or from none, looks at all gyms. The order is: the matches of
 * the text as typed (the region's own gyms, then those just outside), then the matches that
 * needed a correction (the same order of places). Guesses, gyms with only some of the words,
 * are given only when no gym has every word; they are the region's own first, then the
 * neighbours'.
 */
export class GymLookup<G extends LocatedGym> {
  private readonly index: GymIndex<G>;
  private readonly byRegion: Map<string, RegionGyms>;

  constructor(
    gyms: Iterable<G>,
    private readonly regions: readonly RegionOutline[],
    ignoredWords: Iterable<string> = [],
  ) {
    this.index = new GymIndex(gyms, ignoredWords);
    this.byRegion = gymsByRegion(regions, this.index.all());
  }

  get size(): number {
    return this.index.size;
  }

  get(id: number): G | undefined {
    return this.index.get(id);
  }

  /** Every gym, in no particular order (a new list). */
  all(): G[] {
    return this.index.all();
  }

  /** Whether the channel is a region with an outline (of several rows, the first: `gymsByRegion`). */
  isRegion(channelId: string): boolean {
    const region = this.regions.find((one) => one.channelId === channelId);
    return region !== undefined && region.bounds !== null;
  }

  /** Channel ids of the regions the gym lies in; empty when it lies in none. */
  regionsOf(gymId: number): string[] {
    return [...this.byRegion]
      .filter(([, membership]) => membership.local.has(gymId))
      .map(([channelId]) => channelId);
  }

  /** The gyms that lie in the region of this channel, in no particular order. */
  inRegion(channelId: string): G[] {
    const gyms: G[] = [];
    for (const id of this.byRegion.get(channelId)?.local ?? []) {
      const gym = this.index.get(id);
      if (gym) gyms.push(gym);
    }
    return gyms;
  }

  /** Adds a gym or replaces the one with the same id, and sorts it into the regions. */
  put(gym: G): void {
    this.forget(gym.id);
    this.index.put(gym);
    for (const [channelId, membership] of gymsByRegion(this.regions, [gym])) {
      const known = this.byRegion.get(channelId);
      if (membership.local.has(gym.id)) known?.local.add(gym.id);
      if (membership.neighbouring.has(gym.id)) known?.neighbouring.add(gym.id);
    }
  }

  /** Returns false when there was no such gym. */
  remove(id: number): boolean {
    this.forget(id);
    return this.index.remove(id);
  }

  private forget(id: number): void {
    for (const membership of this.byRegion.values()) {
      membership.local.delete(id);
      membership.neighbouring.delete(id);
    }
  }

  /**
   * From a region channel: the gyms that have every word as typed (the region's, then its
   * neighbours'), then those that have every word only with a misspelling allowed (again the
   * region's first). Only when there are none of either, the gyms that have some of the words:
   * the region's own, then the neighbours'. From any other channel the order is that of
   * `GymIndex.search`.
   */
  search(channelId: string | null, text: string, options: GymLookupOptions = {}): GymHit<G>[] {
    const { nameOnly, limit, within: only } = options;
    const membership =
      channelId !== null && this.isRegion(channelId) ? this.byRegion.get(channelId) : undefined;
    const among = (ids: ReadonlySet<number> | undefined): ReadonlySet<number> | undefined =>
      only === undefined
        ? ids
        : ids === undefined
          ? only
          : new Set([...ids].filter((id) => only.has(id)));
    const places: [GymPlace, ReadonlySet<number> | undefined][] = membership
      ? [
          ['local', among(membership.local)],
          ['neighbouring', among(membership.neighbouring)],
        ]
      : [['anywhere', among(undefined)]];
    for (const words of ['all', 'any'] as const) {
      const hits = places.flatMap(([place, within]) =>
        this.index
          .search(text, { nameOnly, within, words })
          .map(({ gym, score, allWords, corrected, typos, missed }) => ({
            gym,
            place,
            score,
            allWords,
            corrected,
            typos,
            missed,
          })),
      );
      if (hits.length === 0) continue;
      // Matches as typed in any place come before corrected ones; each keeps local before
      // neighbouring (the sort is stable). Guesses keep the order of the places.
      if (words === 'all') hits.sort((a, b) => Number(a.corrected) - Number(b.corrected));
      return limit === undefined ? hits : hits.slice(0, limit);
    }
    return [];
  }
}
