import {
  UNKNOWN_GONE_KIND,
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
 * A directory of these kept Wayspots over the invented regions, loaded (seen at 1,000): pass it
 * as `wayspots` to `createTestContext`. `storage` holds their rows. `regions`: other regions
 * (a `RegionDirectory` whose loads change them).
 */
export async function wayspotsWith(
  rows: readonly WayspotRow[],
  regions: WayspotDirectoryOptions['regions'] = regionsFixture(),
) {
  const storage = new MemoryWayspots();
  await storage.saveFromImport({ upsert: rows, remove: [] }, 1_000);
  const wayspots = new WayspotDirectory({
    wayspots: storage,
    regions,
    log: createTestLogger().log,
  });
  await wayspots.load();
  return { storage, wayspots };
}

/** The kept Wayspots in memory: the twin of `WayspotRepository`. */
export class MemoryWayspots implements WayspotStorage {
  readonly rows = new Map<string, Wayspot>();
  /**
   * The Wayspots found gone, by id: when the scan that found them gone was made, and the kind they
   * had then.
   */
  readonly goneRows = new Map<
    string,
    { firstSeen: number; lastSeen: number; kind: Wayspot['kind'] | null }
  >();

  all(): Promise<Wayspot[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((row) => ({ ...row })),
    );
  }

  gone(): Promise<Map<string, GoneWayspot>> {
    return Promise.resolve(
      new Map(
        [...this.goneRows].map(([id, { lastSeen, kind }]): [string, GoneWayspot] => [
          id,
          { goneAt: lastSeen, kind: kind ?? UNKNOWN_GONE_KIND },
        ]),
      ),
    );
  }

  saveFromImport(
    writes: WayspotWrites,
    importedAt: number,
    scannedAt: number = importedAt,
    startedAt: number = scannedAt,
  ): Promise<void> {
    for (const row of writes.upsert) {
      const kept = this.rows.get(row.id) ?? this.goneRows.get(row.id);
      if (kept && kept.lastSeen > scannedAt) continue;
      this.goneRows.delete(row.id);
      this.rows.set(row.id, {
        ...row,
        firstSeen: kept?.firstSeen ?? importedAt,
        lastSeen: scannedAt,
      });
    }
    for (const id of writes.remove) {
      this.rows.delete(id);
      this.goneRows.delete(id);
    }
    for (const id of writes.gone ?? []) {
      const row = this.rows.get(id);
      if (!row || (row.lastSeen > startedAt && row.lastSeen !== scannedAt)) continue;
      this.rows.delete(id);
      this.goneRows.set(id, { firstSeen: row.firstSeen, lastSeen: scannedAt, kind: row.kind });
    }
    return Promise.resolve();
  }

  remove(ids: readonly string[]): Promise<number> {
    let removed = 0;
    for (const id of new Set(ids)) {
      if (this.rows.delete(id)) removed++;
      this.goneRows.delete(id);
    }
    return Promise.resolve(removed);
  }
}
