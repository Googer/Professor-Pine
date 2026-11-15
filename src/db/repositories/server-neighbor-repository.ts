import type { Kysely } from 'kysely';
import type { NeighborPair, NeighborRow } from '../../domain/servers/neighbors.js';
import type { DB } from '../types.js';

/**
 * The pairs of neighbors and their requests (plan 19E; table `ServerNeighbor` of migration 063):
 * `ServerNeighborRepository` and its twin `MemoryServerNeighbors`
 * (`test/support/server-neighbors.ts`), both running `serverNeighborCases`. `ServerNeighbors`
 * decides; the storage keeps a pair's row as it is given.
 */
export interface ServerNeighborStorage {
  /** Every row, by pair. */
  all(): Promise<NeighborRow[]>;
  /**
   * Writes a pair's row whole (a request, a tell, an acceptance, a decline, a request taken
   * back): one row per pair.
   */
  put(row: NeighborRow): Promise<void>;
  /** Deletes these pairs' rows (an end, a withdrawal, a row that says nothing any more). */
  remove(pairs: readonly NeighborPair[]): Promise<void>;
}

type Row = {
  serverA: string;
  serverB: string;
  askedBy: string;
  askedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  toldAt: string | null;
  withdrawnAt: string | null;
};

const time = (value: string | null): number | null => (value === null ? null : Number(value));

const column = (value: number | null): string | null => (value === null ? null : String(value));

const stored = (row: Row): NeighborRow => ({
  serverA: row.serverA,
  serverB: row.serverB,
  askedBy: row.askedBy,
  askedAt: Number(row.askedAt),
  acceptedAt: time(row.acceptedAt),
  declinedAt: time(row.declinedAt),
  toldAt: time(row.toldAt),
  withdrawnAt: time(row.withdrawnAt),
});

/**
 * The `ServerNeighbor` table: a whole read at the start (small: a server's neighbors and own
 * requests are at most `NEIGHBORS_MAX`, a decline or a request taken back lives a week, and a
 * server asks at most five times in ten minutes), every write and delete by the primary key.
 */
export class ServerNeighborRepository implements ServerNeighborStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<NeighborRow[]> {
    const rows = await this.db
      .selectFrom('ServerNeighbor')
      .selectAll()
      .orderBy('serverA')
      .orderBy('serverB')
      .execute();
    return rows.map(stored);
  }

  async put(row: NeighborRow): Promise<void> {
    const values = {
      askedBy: row.askedBy,
      askedAt: String(row.askedAt),
      acceptedAt: column(row.acceptedAt),
      declinedAt: column(row.declinedAt),
      toldAt: column(row.toldAt),
      withdrawnAt: column(row.withdrawnAt),
    };
    await this.db
      .insertInto('ServerNeighbor')
      .values({ serverA: row.serverA, serverB: row.serverB, ...values })
      .onDuplicateKeyUpdate(values)
      .execute();
  }

  /** By the primary key, one statement per pair. */
  async remove(pairs: readonly NeighborPair[]): Promise<void> {
    for (const { serverA, serverB } of pairs) {
      await this.db
        .deleteFrom('ServerNeighbor')
        .where('serverA', '=', serverA)
        .where('serverB', '=', serverB)
        .execute();
    }
  }
}
