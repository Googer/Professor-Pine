import type {
  Gym,
  GymPatch,
  GymStorage,
  NearestWrite,
  NewGym,
} from '../../src/db/repositories/gym-repository.js';
import { loadSettings } from '../../src/config/settings.js';
import { GymDirectory } from '../../src/services/gym-directory.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import { nearestTo } from '@pine/wayspot-core/distance';
import type { GymLink } from '../../src/domain/gyms/gym-server.js';
import { testGyms, testLinks, testRegions } from './gyms.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

/**
 * The invented gyms with the nearest gym of each as the upkeep keeps it: as in production,
 * where every gym has one.
 */
export function settledTestGyms(): Gym[] {
  const gyms = testGyms();
  return gyms.map((gym) => ({ ...gym, nearestGym: nearestTo(gym, gyms)?.place.id ?? null }));
}

/** The methods of the storage, for a test that holds or fails one of them. */
export type GymMethod =
  'get' | 'listAll' | 'links' | 'linksOf' | 'create' | 'createBlock' | 'update' | 'delete';

/**
 * The gyms kept in memory as `GymRepository` keeps them, whose behaviour
 * gym-repository.db.test.ts pins down: `create` gives the next id, `update` changes only the
 * fields of the patch and answers undefined for a gym that is not there, keywords are stored
 * lower case and trimmed. It starts with the invented gyms (`settledTestGyms`) unless told
 * otherwise.
 *
 * `writes` records every change in order. Set `failing` to make every call reject, or
 * `failingOn` to make the calls of one method reject. `hold` is a promise that every call from
 * then on waits for, `holdOn` one for the calls of one method (a test that needs something to
 * happen while a write is on its way, without stopping what reads meanwhile).
 */
export class MemoryGyms implements GymStorage {
  failing: Error | undefined;
  failingOn: Partial<Record<GymMethod, Error>> = {};
  hold: Promise<void> | undefined;
  holdOn: Partial<Record<GymMethod, Promise<void>>> = {};
  readonly writes: Array<
    | { what: 'create'; id: number }
    | { what: 'update'; id: number; patch: GymPatch }
    | { what: 'delete'; id: number }
  > = [];
  private readonly rows = new Map<number, Gym>();
  /** The servers of each gym (`GymServer`), by gym: a link goes with its gym. */
  readonly servers = new Map<number, Set<number>>();
  private nextId: number;

  /** `links`: the servers of the gyms; every gym given is the test server's unless told. */
  constructor(
    gyms: readonly Gym[] = settledTestGyms(),
    links: readonly GymLink[] = testLinks(gyms),
  ) {
    for (const gym of gyms) this.rows.set(gym.id, { ...gym });
    for (const link of links) this.link(link.gymId, link.guildId);
    this.nextId = Math.max(0, ...gyms.map((gym) => gym.id)) + 1;
  }

  /** Links a gym to a server at once, as a test sets the tables up. */
  link(gymId: number, guildId: number): void {
    const servers = this.servers.get(gymId) ?? new Set<number>();
    servers.add(guildId);
    this.servers.set(gymId, servers);
  }

  links(): Promise<GymLink[]> {
    return this.attempt('links', () =>
      [...this.servers]
        .filter(([gymId]) => this.rows.has(gymId))
        .flatMap(([gymId, servers]) => [...servers].map((guildId) => ({ gymId, guildId })))
        .sort((a, b) => a.gymId - b.gymId || a.guildId - b.guildId),
    );
  }

  linksOf(gymId: number): Promise<number[]> {
    return this.attempt('linksOf', () =>
      this.rows.has(gymId) ? [...(this.servers.get(gymId) ?? [])].sort((a, b) => a - b) : [],
    );
  }

  private async attempt<T>(method: GymMethod, work: () => T): Promise<T> {
    await this.hold;
    await this.holdOn[method];
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        const failing = this.failing ?? this.failingOn[method];
        if (failing) reject(failing);
        else {
          // A write the database refuses (`refuseNames`) rejects, as a query does.
          try {
            resolve(work());
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
    });
  }

  /** The row as it is, without waiting: for what a test asserts. */
  row(id: number): Gym | undefined {
    const gym = this.rows.get(id);
    return gym && { ...gym, keywords: [...gym.keywords] };
  }

  /** The changes to one column that were written, as `[gym id, value]`, in order. */
  written<K extends keyof GymPatch>(field: K): [number, GymPatch[K]][] {
    return this.writes.flatMap((write) =>
      write.what === 'update' && field in write.patch
        ? [[write.id, write.patch[field]] as [number, GymPatch[K]]]
        : [],
    );
  }

  get(id: number): Promise<Gym | undefined> {
    return this.attempt('get', () => this.row(id));
  }

  listAll(): Promise<Gym[]> {
    return this.attempt('listAll', () =>
      [...this.rows.keys()]
        .sort((a, b) => a - b)
        .flatMap((id) => {
          const gym = this.row(id);
          return gym ? [gym] : [];
        }),
    );
  }

  /** How many blocks were created (`createBlock`), each one transaction. */
  blocks = 0;

  createBlock(
    gyms: readonly NewGym[],
    nearest: (created: readonly Gym[]) => readonly NearestWrite[],
  ): Promise<Gym[]> {
    return this.attempt('createBlock', () => {
      // All or nothing, as one transaction: the rows go in only once everything worked.
      const made = gyms.map((gym, index) => this.made(this.nextId + index, gym));
      if (this.refuseNames.size > 0 && made.some((gym) => this.refuseNames.has(gym.name))) {
        throw new Error('a gym of the block was refused');
      }
      const writes = new Map(nearest(made).map((write) => [write.id, write.nearestGym]));
      this.nextId += made.length;
      for (const gym of made) {
        this.rows.set(gym.id, { ...gym, nearestGym: writes.get(gym.id) ?? null });
        this.writes.push({ what: 'create', id: gym.id });
      }
      for (const [id, nearestGym] of writes) {
        const kept = this.rows.get(id);
        if (kept && !made.some((gym) => gym.id === id)) {
          this.rows.set(id, { ...kept, nearestGym });
          this.writes.push({ what: 'update', id, patch: { nearestGym } });
        }
      }
      this.blocks++;
      return made.map((gym) => this.row(gym.id)!);
    });
  }

  /** Gym names a write refuses (`create` and `createBlock`), as a database refuses a bad row. */
  readonly refuseNames = new Set<string>();

  private made(id: number, gym: NewGym): Gym {
    return {
      id,
      pogoId: gym.pogoId ?? null,
      name: gym.name,
      lat: gym.lat,
      lon: gym.lon,
      nickname: gym.nickname ?? null,
      description: gym.description ?? null,
      keywords: (gym.keywords ?? [])
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword !== ''),
      notice: gym.notice ?? null,
      taggedEx: false,
      confirmedEx: false,
      imageUrl: gym.imageUrl ?? null,
      sponsor: null,
      geodata: gym.geodata ?? null,
      places: null,
      nearestGym: null,
    };
  }

  create(gym: NewGym): Promise<Gym> {
    return this.attempt('create', () => {
      if (this.refuseNames.has(gym.name)) throw new Error('the gym was refused');
      const id = this.nextId++;
      const created: Gym = {
        id,
        pogoId: gym.pogoId ?? null,
        name: gym.name,
        lat: gym.lat,
        lon: gym.lon,
        nickname: gym.nickname ?? null,
        description: gym.description ?? null,
        keywords: (gym.keywords ?? [])
          .map((keyword) => keyword.trim().toLowerCase())
          .filter((keyword) => keyword !== ''),
        notice: gym.notice ?? null,
        taggedEx: false,
        confirmedEx: false,
        imageUrl: gym.imageUrl ?? null,
        sponsor: null,
        geodata: gym.geodata ?? null,
        places: null,
        nearestGym: null,
      };
      this.rows.set(id, created);
      this.writes.push({ what: 'create', id });
      return { ...created };
    });
  }

  update(id: number, patch: GymPatch): Promise<Gym | undefined> {
    return this.attempt('update', () => {
      const gym = this.rows.get(id);
      if (!gym) return undefined;
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as GymPatch;
      const keywords = defined.keywords
        ?.map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword !== '');
      this.rows.set(id, { ...gym, ...defined, ...(keywords ? { keywords } : {}) });
      this.writes.push({ what: 'update', id, patch: defined });
      return this.row(id);
    });
  }

  delete(id: number): Promise<boolean> {
    return this.attempt('delete', () => {
      const existed = this.rows.delete(id);
      this.servers.delete(id);
      if (existed) this.writes.push({ what: 'delete', id });
      return existed;
    });
  }
}

/**
 * A real `GymDirectory` over gyms in memory and the invented regions, loaded: what gym
 * administration changes shows in it after `refreshGym`, as in the bot. `regions` are the rows
 * the directory sorts the gyms by (a test that changes them calls `directory.load()`).
 */
export async function gymDirectoryWith(
  gyms: MemoryGyms = new MemoryGyms(),
  regions: { rows: Region[] } = { rows: testRegions() },
) {
  const { log } = createTestLogger();
  const directory = new GymDirectory({
    gyms,
    regions: { listAll: () => Promise.resolve(regions.rows) },
    ignoredWords: loadSettings(TEST_SETTINGS_PATH).blacklistWords,
    wordsOf: () => loadSettings(TEST_SETTINGS_PATH).blacklistWords,
    log,
  });
  await directory.load();
  return { gyms, directory, regions };
}
