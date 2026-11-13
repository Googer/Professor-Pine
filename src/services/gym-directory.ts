import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Gym } from '../db/repositories/gym-repository.js';
import { WAYSPOT_MOVED_METRES } from '../domain/geo/spot-address.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { GymLink } from '../domain/gyms/gym-server.js';
import type { Logger } from '../log.js';
import type { GoogleAnswer, GoogleAnswers, KeptPlaces, PlaceKeeper } from './google-answers.js';
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
 * What handlers need of the gyms (plan 19B-2): a server's view (`of`), and a stored reference by
 * its id (`stored`). See `ServerGyms`. Nothing reads every server's gyms as one list but the
 * instance's own upkeep (`GymDirectory.all`).
 */
export interface GymProvider {
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

export interface GymDirectoryOptions {
  gyms: GymSource;
  regions: RegionSource;
  /**
   * The words a server's gym search ignores (its `blacklistWords`, `ServerSettings`), read at
   * every ask of its view: a change rebuilds its index.
   */
  wordsOf: (guildId: number) => readonly string[];
  /**
   * Google's answers by the point (plan 19B-3): each gym's places are those of its point
   * (`GoogleAnswers.at`), the one source, and so is its address unless it has Wayfarer's of its
   * own (`Gym.wayfarerAddress`, which comes first); what the storage gives of them is not read.
   * An answer saved shows at once on the gyms within `WAYSPOT_MOVED_METRES` of its point.
   */
  answers: Pick<GoogleAnswers, 'at' | 'whenSaved'>;
  log: Logger;
}

/**
 * All gyms in memory, read from the database, with the servers each belongs to. `load` reads
 * everything (three queries); after a gym was added, changed, linked, unlinked or deleted call
 * `refreshGym`, and after regions changed call `load` again. Reads never wait: they use the last
 * complete state.
 */
export class GymDirectory implements GymProvider, PlaceKeeper {
  private servers: ServerGyms | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private changes = 0;

  /** How many gyms the answers saved had looked at (`reanswer`): for tests. */
  gymsLookedAt = 0;

  constructor(private readonly options: GymDirectoryOptions) {
    options.answers.whenSaved((saved) => {
      this.reanswer(saved);
    });
  }

  /**
   * A gym as read, with its point's answers (`answers`): its own Wayfarer address first, which
   * is the gym's and no other server's.
   */
  private answered(gym: Gym): Gym {
    const { answers } = this.options;
    return {
      ...gym,
      geodata: gym.wayfarerAddress ?? answers.at('address', gym)?.answer ?? null,
      places: answers.at('places', gym)?.answer ?? null,
    };
  }

  /**
   * After answers were saved: the gyms near their points take them, in memory, at once (the
   * gyms of every server that has them; nothing is read). Also during a load or a re-read on its
   * way: those take the answers when they are put in (`answered`), after this.
   */
  private reanswer(saved: readonly GoogleAnswer[]): void {
    const servers = this.servers;
    if (!servers) return;
    // The gyms of the cells around each answer (`ServerGyms.near`), never every gym: a save is
    // one gym's or one import's few, and the instance's gyms are thousands.
    const near = new Map<number, Gym>();
    for (const answer of saved) {
      for (const gym of servers.near(answer)) {
        if (near.has(gym.id)) continue;
        this.gymsLookedAt += 1;
        if (metresBetween(answer, gym) <= WAYSPOT_MOVED_METRES) near.set(gym.id, gym);
      }
    }
    let changed = false;
    for (const gym of near.values()) {
      const now = this.answered(gym);
      if (now.geodata === gym.geodata && now.places === gym.places) continue;
      servers.put(now, servers.serversOf(gym.id));
      changed = true;
    }
    if (changed) this.changes += 1;
  }

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
   * Whether a gym of any server lies within `WAYSPOT_MOVED_METRES` of a point (an answer of
   * Google's it shows: `GoogleAnswers.sweep`), from the cells around it (`ServerGyms.near`).
   */
  anyNear(point: LatLon): boolean {
    return this.perServer
      .near(point)
      .some((gym) => metresBetween(point, gym) <= WAYSPOT_MOVED_METRES);
  }

  /**
   * The gyms as the sweep of Google's answers looks them up: the directory itself, whose cell
   * index (`ServerGyms`) is kept for its gyms anyway; nothing is built for the sweep.
   */
  keptPlaces(): KeptPlaces {
    return this;
  }

  /** A server's gyms as held, without building its view (`ServerGyms.gymsOf`): the upkeep's. */
  gymsOf(guildId: number): Iterable<Gym> {
    return this.perServer.gymsOf(guildId);
  }

  /**
   * A number that changes with every load and every gym re-read or forgotten: what is built
   * from the gyms (the web map's view) is built anew when it differs from the one it was built
   * at.
   */
  get generation(): number {
    return this.changes;
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
      this.servers = new ServerGyms(
        gyms.map((gym) => this.answered(gym)),
        links,
        regions,
        this.options.wordsOf,
      );
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
      const servers = this.perServer;
      const [gym, linked] = await Promise.all([
        this.options.gyms.get(id),
        this.options.gyms.linksOf(id),
      ]);
      const answered = gym && this.answered(gym);
      take(servers, id, answered, linked);
      this.changes += 1;
      return answered;
    });
  }

  /**
   * Re-reads several gyms in one turn (plan 8W-6: a block of a Wayfarer import and the gyms whose
   * nearest gym it changed), the generation changed once. Gives those that exist, in order.
   */
  refreshGyms(ids: readonly number[]): Promise<Gym[]> {
    return this.enqueue(async () => {
      const servers = this.perServer;
      const read: Gym[] = [];
      for (const id of ids) {
        const [gym, linked] = await Promise.all([
          this.options.gyms.get(id),
          this.options.gyms.linksOf(id),
        ]);
        const answered = gym && this.answered(gym);
        take(servers, id, answered, linked);
        if (answered) read.push(answered);
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
    const known = this.perServer.remove(id);
    this.changes += 1;
    void this.enqueue(() => {
      if (this.servers?.remove(id)) this.changes += 1;
      return Promise.resolve();
    });
    return known;
  }

  /**
   * Takes a gym out of one server's gyms at once, without reading anything: for a gym whose
   * link to the server was just deleted while other servers keep it, so that nothing of that
   * server finds it from this moment on. Again behind whatever is on its way, as `forget`.
   */
  unlink(id: number, guildId: number): boolean {
    const known = this.perServer.unlink(id, guildId);
    this.changes += 1;
    void this.enqueue(() => {
      if (this.servers?.unlink(id, guildId)) this.changes += 1;
      return Promise.resolve();
    });
    return known;
  }

  /** How many gyms there are, of every server. */
  get size(): number {
    return this.perServer.size;
  }

  /**
   * Every gym of every server, in no particular order (a new list): for the instance's upkeep of
   * the gyms (its Google queue, which measures from one gym to all others). Handlers read a
   * server's view; they do not list.
   */
  all(): Gym[] {
    return this.perServer.all();
  }
}

/** A gym as read: put in (with its servers) or taken out of every view. */
function take(
  servers: ServerGyms,
  id: number,
  gym: Gym | undefined,
  linked: readonly number[],
): void {
  if (gym) servers.put(gym, linked);
  else servers.remove(id);
}
