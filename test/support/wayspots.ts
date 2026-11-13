import {
  UNKNOWN_GONE_KIND,
  type ServerKept,
  type WayspotStorage,
} from '../../src/db/repositories/wayspot-repository.js';
import type {
  GoneWayspot,
  Wayspot,
  WayspotRow,
  WayspotWrites,
} from '../../src/domain/wayspots/kept.js';
import {
  WayspotDirectory,
  type WayspotDirectoryOptions,
} from '../../src/services/wayspot-directory.js';
import { TEST_GUILD_ROW } from './gyms.js';
import { regionsFixture } from './providers.js';
import { createTestLogger } from './test-logger.js';

/** A directory of no kept Wayspot: `createTestContext`'s. */
export function noWayspots(): WayspotDirectory {
  return new WayspotDirectory({
    wayspots: new MemoryWayspots(),
    regions: regionsFixture(),
    log: createTestLogger().log,
  });
}

/**
 * A directory of these kept Wayspots, the test server's (`TEST_GUILD_ROW`), over the invented
 * regions, loaded (seen at 1,000): pass it as `wayspots` to `createTestContext`. `storage` holds
 * their rows. `regions`: other regions (a `RegionDirectory` whose loads change them).
 * `addresses`: the Power Spots' looked-up addresses (`wayspotAddressesWith`'s; none by default).
 * `others`: other servers' Wayspots (plan 19B-3: a server's own rows, by its `Guild` row), which
 * the test server's view must never show.
 */
export async function wayspotsWith(
  rows: readonly WayspotRow[],
  regions: WayspotDirectoryOptions['regions'] = regionsFixture(),
  addresses?: WayspotDirectoryOptions['addresses'],
  others: readonly { guildId: number; rows: readonly WayspotRow[] }[] = [],
) {
  const storage = new MemoryWayspots();
  await storage.saveFromImport(TEST_GUILD_ROW, { upsert: rows, remove: [] }, 1_000);
  for (const other of others) {
    await storage.saveFromImport(other.guildId, { upsert: other.rows, remove: [] }, 1_000);
  }
  const wayspots = new WayspotDirectory({
    wayspots: storage,
    regions,
    log: createTestLogger().log,
    ...(addresses === undefined ? {} : { addresses }),
  });
  await wayspots.load();
  return { storage, wayspots };
}

/** One server's rows in `MemoryWayspots`. */
interface ServerRows {
  readonly rows: Map<string, Wayspot>;
  /**
   * The Wayspots found gone, by id: when the scan that found them gone was made, and the kind they
   * had then.
   */
  readonly goneRows: Map<
    string,
    { firstSeen: number; lastSeen: number; kind: Wayspot['kind'] | null }
  >;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The kept Wayspots of each server in memory: the twin of `WayspotRepository`. */
export class MemoryWayspots implements WayspotStorage {
  private readonly servers = new Map<number, ServerRows>();

  /** A server's rows (made empty the first time it is asked for). */
  server(guildId: number): ServerRows {
    let rows = this.servers.get(guildId);
    if (!rows) this.servers.set(guildId, (rows = { rows: new Map(), goneRows: new Map() }));
    return rows;
  }

  everyServer(): Promise<ServerKept[]> {
    return Promise.resolve(
      [...this.servers.keys()]
        .sort((a, b) => a - b)
        .flatMap((guildId) =>
          [...this.server(guildId).rows.values()]
            .sort(byId)
            .map((row) => ({ guildId, wayspot: { ...row } })),
        ),
    );
  }

  all(guildId: number): Promise<Wayspot[]> {
    return Promise.resolve(
      [...this.server(guildId).rows.values()].sort(byId).map((row) => ({ ...row })),
    );
  }

  gone(guildId: number): Promise<Map<string, GoneWayspot>> {
    return Promise.resolve(
      new Map(
        [...this.server(guildId).goneRows].map(
          ([id, { lastSeen, kind }]): [string, GoneWayspot] => [
            id,
            { goneAt: lastSeen, kind: kind ?? UNKNOWN_GONE_KIND },
          ],
        ),
      ),
    );
  }

  saveFromImport(
    guildId: number,
    writes: WayspotWrites,
    importedAt: number,
    scannedAt: number = importedAt,
    startedAt: number = scannedAt,
  ): Promise<void> {
    const { rows, goneRows } = this.server(guildId);
    for (const row of writes.upsert) {
      const kept = rows.get(row.id) ?? goneRows.get(row.id);
      if (kept && kept.lastSeen > scannedAt) continue;
      goneRows.delete(row.id);
      rows.set(row.id, {
        ...row,
        firstSeen: kept?.firstSeen ?? importedAt,
        lastSeen: scannedAt,
      });
    }
    for (const id of writes.remove) {
      rows.delete(id);
      goneRows.delete(id);
    }
    for (const id of writes.gone ?? []) {
      const row = rows.get(id);
      if (!row || (row.lastSeen > startedAt && row.lastSeen !== scannedAt)) continue;
      rows.delete(id);
      goneRows.set(id, { firstSeen: row.firstSeen, lastSeen: scannedAt, kind: row.kind });
    }
    return Promise.resolve();
  }

  remove(guildId: number, ids: readonly string[]): Promise<number> {
    const { rows, goneRows } = this.server(guildId);
    let removed = 0;
    for (const id of new Set(ids)) {
      if (rows.delete(id)) removed++;
      goneRows.delete(id);
    }
    return Promise.resolve(removed);
  }
}
