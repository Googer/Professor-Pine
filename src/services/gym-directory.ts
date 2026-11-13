import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { GymLink } from '../domain/gyms/gym-server.js';
import { GymLookup, type GymHit, type GymLookupOptions } from '../domain/search/gym-lookup.js';
import type { Logger } from '../log.js';
import { ServerGyms, type GymView } from './server-gyms.js';

export type { GymView } from './server-gyms.js';

/** The part of `GymRepository` the directory reads. */
export interface GymSource {
  listAll(): Promise<Gym[]>;
  get(id: number): Promise<Gym | undefined>;
  /** Every gym's servers (`GymServer`). */
  links(): Promise<GymLink[]>;
  /** The servers (`Guild` rows) one gym belongs to. */
  linksOf(gymId: number): Promise<number[]>;
}

/** The part of `RegionRepository` the directory reads. */
export interface RegionSource {
  listAll(): Promise<Region[]>;
}

/**
 * The gyms per server (plan 19B-2): a server's view (`of`), and a stored reference by its id
 * (`stored`). See `ServerGyms`.
 */
export interface ServerGymProvider {
  /** The gyms of a server, by its `Guild` row (undefined: a server without one, no gyms). */
  of(guildId: number | undefined): GymView;
  /**
   * A gym by its id, whichever server it belongs to: for a reference a server stored when the
   * gym was its own (a party's gym, a history row, a saved route's stop), never for an id a
   * member gives.
   */
  stored(id: number): Gym | undefined;
  /** The servers a gym belongs to (`Guild` rows), in order. */
  serversOf(gymId: number): number[];
}

/**
 * What handlers need: the gyms per server, and finding them by what members type. The reads
 * below over every server's gyms and regions are the ones before plan 19B-2, left while their
 * callers move to a server's view (`of`) or a stored reference (`stored`); they go with the last.
 */
export interface GymProvider extends ServerGymProvider {
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
  /**
   * The words a server's gym search ignores (its `blacklistWords`, `ServerSettings`), read at
   * every ask of its view: a change rebuilds its index.
   */
  wordsOf: (guildId: number) => readonly string[];
  log: Logger;
}

/**
 * All gyms in memory, read from the database, with the servers each belongs to. `load` reads
 * everything (three queries); after a gym was added, changed, linked, unlinked or deleted call
 * `refreshGym`, and after regions changed call `load` again. Reads never wait: they use the last
 * complete state.
 */
export class GymDirectory implements GymProvider {
  private lookup: GymLookup<Gym> | undefined;
  private servers: ServerGyms | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private changes = 0;

  constructor(private readonly options: GymDirectoryOptions) {}

  private get perServer(): ServerGyms {
    if (!this.servers) throw new Error('Gyms have not been loaded yet');
    return this.servers;
  }

  of(guildId: number | undefined): GymView {
    return this.perServer.of(guildId);
  }

  stored(id: number): Gym | undefined {
    return this.perServer.stored(id);
  }

  serversOf(gymId: number): number[] {
    return this.perServer.serversOf(gymId);
  }

  /**
   * Channel ids of a server's regions one of its gyms lies in, without building the server's
   * view (`ServerGyms.regionsIn`): for the instance's upkeep, which asks it of every gym.
   */
  regionsIn(guildId: number, gymId: number): string[] {
    return this.perServer.regionsIn(guildId, gymId);
  }

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
      const [gyms, links, regions] = await Promise.all([
        this.options.gyms.listAll(),
        this.options.gyms.links(),
        this.options.regions.listAll(),
      ]);
      const started = performance.now();
      this.lookup = new GymLookup(gyms, regions, this.options.ignoredWords);
      this.servers = new ServerGyms(gyms, links, regions, this.options.wordsOf);
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
      const [gym, servers] = await Promise.all([
        this.options.gyms.get(id),
        this.options.gyms.linksOf(id),
      ]);
      this.take(lookup, id, gym, servers);
      this.changes += 1;
      return gym;
    });
  }

  /** A gym as read: put in (with its servers) or taken out of every view. */
  private take(
    lookup: GymLookup<Gym>,
    id: number,
    gym: Gym | undefined,
    servers: readonly number[],
  ): void {
    if (gym) {
      lookup.put(gym);
      this.perServer.put(gym, servers);
    } else {
      lookup.remove(id);
      this.perServer.remove(id);
    }
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
        const [gym, servers] = await Promise.all([
          this.options.gyms.get(id),
          this.options.gyms.linksOf(id),
        ]);
        this.take(lookup, id, gym, servers);
        if (gym) read.push(gym);
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
    this.perServer.remove(id);
    this.changes += 1;
    void this.enqueue(() => {
      const again = this.servers?.remove(id) ?? false;
      if (this.lookup?.remove(id) || again) this.changes += 1;
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
    return this.perServer.all();
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
