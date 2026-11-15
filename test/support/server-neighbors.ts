import type { ServerNeighborStorage } from '../../src/db/repositories/server-neighbor-repository.js';
import type { V2Message } from '../../src/discord/party-gateway.js';
import {
  pairKey,
  type NeighborPair,
  type NeighborRow,
} from '../../src/domain/servers/neighbors.js';
import type { LabPost, ModeratorsLabPoster } from '../../src/services/moderators-lab.js';
import { ServerNeighbors } from '../../src/services/server-neighbors.js';
import {
  NEIGHBOR_ASH,
  NEIGHBOR_BROCK,
  NEIGHBOR_MISTY,
  NEIGHBOR_NOW,
} from './server-neighbor-cases.js';
import { createTestLogger } from './test-logger.js';

/** `ServerNeighborRepository`'s twin: the rows by pair (`serverNeighborCases`). */
export class MemoryServerNeighbors implements ServerNeighborStorage {
  readonly rows = new Map<string, NeighborRow>();
  /** How many times each method was asked. */
  readonly asked = { all: 0, put: 0, remove: 0 };

  constructor(rows: readonly NeighborRow[] = []) {
    for (const row of rows) this.rows.set(pairKey(row), row);
  }

  all(): Promise<NeighborRow[]> {
    this.asked.all += 1;
    return Promise.resolve(
      [...this.rows.values()].sort(
        (a, b) => a.serverA.localeCompare(b.serverA) || a.serverB.localeCompare(b.serverB),
      ),
    );
  }

  put(row: NeighborRow): Promise<void> {
    this.asked.put += 1;
    this.rows.set(pairKey(row), { ...row });
    return Promise.resolve();
  }

  remove(pairs: readonly NeighborPair[]): Promise<void> {
    this.asked.remove += 1;
    for (const pair of pairs) this.rows.delete(pairKey(pair));
    return Promise.resolve();
  }
}

/**
 * A moderators' bot lab of every server that records what is posted in it, by server, as it is
 * asked to post; a server in `noLab` has none (`no-lab`). While `hold` is set, a post answers only
 * once it settles (Discord slow to take it: review R1); a post that `fails` rejects.
 */
export class RecordingLab implements ModeratorsLabPoster {
  readonly posted: { serverId: string; message: V2Message }[] = [];
  readonly noLab = new Set<string>();
  hold: Promise<void> | undefined;
  fails: Error | undefined;

  async post(serverId: string, message: V2Message): Promise<LabPost> {
    if (this.noLab.has(serverId)) return 'no-lab';
    this.posted.push({ serverId, message });
    await this.hold;
    if (this.fails) throw this.fails;
    return 'sent';
  }

  /** What was posted in a server's lab, in order. */
  of(serverId: string): V2Message[] {
    return this.posted.filter((one) => one.serverId === serverId).map((one) => one.message);
  }
}

/** The names of the three servers of the tests, as Discord has them. */
export const NEIGHBOR_NAMES: ReadonlyMap<string, string> = new Map([
  [NEIGHBOR_ASH, 'Pallet Town'],
  [NEIGHBOR_BROCK, 'Pewter City'],
  [NEIGHBOR_MISTY, 'Cerulean City'],
]);

/**
 * A real `ServerNeighbors` over `MemoryServerNeighbors` with `rows`, a `RecordingLab`, the clock
 * `clock.now` (`NEIGHBOR_NOW` to start with), and the servers that can be told (`reachable`:
 * Ash, Brock and Misty unless given) and their names (`NEIGHBOR_NAMES` unless given). Loaded.
 */
export async function neighborsWith(
  options: {
    rows?: readonly NeighborRow[];
    reachable?: Iterable<string>;
    names?: ReadonlyMap<string, string>;
  } = {},
) {
  const store = new MemoryServerNeighbors(options.rows);
  const lab = new RecordingLab();
  const reachable = new Set(options.reachable ?? [NEIGHBOR_ASH, NEIGHBOR_BROCK, NEIGHBOR_MISTY]);
  const names = new Map(options.names ?? NEIGHBOR_NAMES);
  const clock = { now: NEIGHBOR_NOW };
  const { log, entries } = createTestLogger();
  const neighbors = new ServerNeighbors({
    storage: store,
    reach: {
      reachable: (serverId) => reachable.has(serverId),
      nameOf: (serverId) => names.get(serverId),
    },
    lab,
    log,
    now: () => clock.now,
  });
  await neighbors.load();
  return { neighbors, store, lab, reachable, names, clock, entries };
}
