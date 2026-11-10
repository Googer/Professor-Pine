import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { GymLookup, type GymHit, type GymLookupOptions } from '../domain/search/gym-lookup.js';
import type { Logger } from '../log.js';

/** The part of `GymRepository` the directory reads. */
export interface GymSource {
  listAll(): Promise<Gym[]>;
  get(id: number): Promise<Gym | undefined>;
}

/** The part of `RegionRepository` the directory reads. */
export interface RegionSource {
  listAll(): Promise<Region[]>;
}

/** What handlers need: the gyms, and finding them by what members type. See `GymLookup`. */
export interface GymProvider {
  /** The gym with this id, or undefined. */
  get(id: number): Gym | undefined;
  /** Whether the channel is a region with an outline. */
  isRegion(channelId: string): boolean;
  /** Channel ids of the regions the gym lies in; empty when it lies in none. */
  regionsOf(gymId: number): string[];
  /** The gyms that lie in the region of this channel, in no particular order (a new list). */
  inRegion(channelId: string): Gym[];
  /**
   * Gyms matching the text, best first. In a region channel: the matches of the text as typed
   * (the region's own gyms, then gyms just outside it), then the matches that needed a
   * correction (the same order of places); in any other channel, or with null, all gyms are
   * searched. Guesses (`allWords` false: gyms with only some of the words) come only when no gym
   * has every word, the region's own first, then the neighbours'. A hit's `score` is comparable
   * only with hits of the same `place` and the same `corrected` value of one search.
   */
  search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[];
}

export interface GymDirectoryOptions {
  gyms: GymSource;
  regions: RegionSource;
  /** Words ignored in gym texts and searches (settings.blacklistWords). */
  ignoredWords: readonly string[];
  log: Logger;
}

/**
 * All gyms in memory, read from the database. `load` reads everything (two queries); after a gym
 * was added, changed or deleted call `refreshGym`, and after regions changed call `load` again.
 * Reads never wait: they use the last complete state.
 */
export class GymDirectory implements GymProvider {
  private lookup: GymLookup<Gym> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private changes = 0;

  constructor(private readonly options: GymDirectoryOptions) {}

  /**
   * A number that changes with every load and every gym re-read or forgotten: what is built
   * from the gyms (the web map's view) is built anew when it differs from the one it was built
   * at.
   */
  get generation(): number {
    return this.changes;
  }

  private get current(): GymLookup<Gym> {
    if (!this.lookup) throw new Error('Gyms have not been loaded yet');
    return this.lookup;
  }

  /** Changes are applied one after the other, in the order they were asked for. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Reads every gym and region and builds the index anew. The old state serves until then. */
  load(): Promise<void> {
    return this.enqueue(async () => {
      const [gyms, regions] = await Promise.all([
        this.options.gyms.listAll(),
        this.options.regions.listAll(),
      ]);
      const started = performance.now();
      this.lookup = new GymLookup(gyms, regions, this.options.ignoredWords);
      this.changes += 1;
      this.options.log.info(
        { gyms: gyms.length, regions: regions.length, ms: Math.round(performance.now() - started) },
        'gyms indexed',
      );
    });
  }

  /**
   * Re-reads one gym after it was added, changed or deleted. Returns the gym as it is now, or
   * undefined when it no longer exists.
   */
  refreshGym(id: number): Promise<Gym | undefined> {
    return this.enqueue(async () => {
      const lookup = this.current;
      const gym = await this.options.gyms.get(id);
      if (gym) lookup.put(gym);
      else lookup.remove(id);
      this.changes += 1;
      return gym;
    });
  }

  /**
   * Re-reads several gyms in one turn (plan 8W-6: a block of a Wayfarer import and the gyms whose
   * nearest gym it changed), the generation changed once. Gives those that exist, in order.
   */
  refreshGyms(ids: readonly number[]): Promise<Gym[]> {
    return this.enqueue(async () => {
      const lookup = this.current;
      const read: Gym[] = [];
      for (const id of ids) {
        const gym = await this.options.gyms.get(id);
        if (gym) {
          lookup.put(gym);
          read.push(gym);
        } else lookup.remove(id);
      }
      this.changes += 1;
      return read;
    });
  }

  /**
   * Takes a gym out of memory at once, without reading anything: for a gym whose row was just
   * deleted, so that nothing finds it in the moment before (or when) the database can be asked.
   * False when there was no such gym.
   *
   * It is taken out now, and once more behind whatever is on its way: a `refreshGym` of it or
   * a `load` that read the database before the row went would otherwise put it back.
   */
  forget(id: number): boolean {
    const known = this.current.remove(id);
    this.changes += 1;
    void this.enqueue(() => {
      if (this.lookup?.remove(id)) this.changes += 1;
      return Promise.resolve();
    });
    return known;
  }

  get size(): number {
    return this.current.size;
  }

  get(id: number): Gym | undefined {
    return this.current.get(id);
  }

  /**
   * Every gym, in no particular order (a new list): for the upkeep of the gyms, which measures
   * from one gym to all others. Handlers search; they do not list.
   */
  all(): Gym[] {
    return this.current.all();
  }

  isRegion(channelId: string): boolean {
    return this.current.isRegion(channelId);
  }

  regionsOf(gymId: number): string[] {
    return this.current.regionsOf(gymId);
  }

  inRegion(channelId: string): Gym[] {
    return this.current.inRegion(channelId);
  }

  search(channelId: string | null, text: string, options?: GymLookupOptions): GymHit<Gym>[] {
    return this.current.search(channelId, text, options);
  }
}
