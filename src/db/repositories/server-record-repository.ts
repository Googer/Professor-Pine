import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * A server's record as kept (table `ServerRecord` of migration 061): each fact null where it
 * does not hold. `recordedAt` when it was recorded at the upgrade to 2.1, `allowedAt` /
 * `allowedBy` and `blockedAt` / `blockedBy` an instance operator's allowance and block (with the
 * operator's id), `leftAt` since when Pine is no longer in it; `deletingAt` since when its data
 * is being deleted (plan 19C-3: set before the first row goes, kept until the last), `deletedAt`
 * when the database part of its last deletion ended (kept when it comes back: it is new to this
 * Pine's settings), `filesLeftAt` the end of a deletion whose kept screenshots are still to be
 * removed (those read up to it; the sweep removes them, and clears it).
 */
export interface StoredServerRecord {
  serverId: string;
  recordedAt: number | null;
  allowedAt: number | null;
  allowedBy: string | null;
  blockedAt: number | null;
  blockedBy: string | null;
  leftAt: number | null;
  deletingAt: number | null;
  deletedAt: number | null;
  filesLeftAt: number | null;
}

/**
 * The servers' records (plan 19C-1): `ServerRecordRepository` and its twin
 * `MemoryServerRecords` (`test/support/server-standings.ts`), both running
 * `serverRecordCases`.
 */
export interface ServerRecordStorage {
  /** Every server's row, by server. */
  all(): Promise<StoredServerRecord[]>;
  /**
   * Marks left at `at` those of these servers that Pine was in (they have a `Guild` row), keeping
   * an earlier time where one is marked already, but for a server whose data was deleted since it
   * was marked (plan 19C-3: added back, its return not written): it leaves anew, and is deleted
   * again 30 days later. Their rows as they are now, by server. A server Pine was never in (one it
   * refused) is not written.
   */
  markLeft(serverIds: readonly string[], at: number): Promise<StoredServerRecord[]>;
  /**
   * These servers are present again: none of them is marked left any more, nor deleted (one whose
   * data was deleted starts anew, plan 19C-3).
   */
  cameBack(serverIds: readonly string[]): Promise<void>;
  /**
   * A server's deletion begins (plan 19C-3): `deletingAt`, a time set already kept (a deletion
   * taken up again began the first time). Nothing for a server without a row.
   */
  markDeleting(serverId: string, at: number): Promise<void>;
  /**
   * The database part of a server's deletion ended at `at` (`deletedAt`; `deletingAt` cleared),
   * its kept screenshots up to `at` left to remove (`filesLeftAt`).
   */
  markDeleted(serverId: string, at: number): Promise<void>;
  /** The kept screenshots of the deletion that ended at `at` are removed (`filesLeftAt` cleared). */
  filesRemoved(serverId: string, at: number): Promise<void>;
  /**
   * These servers are recorded at `at` (a new install adopts them, `ServerAdoption`), a time
   * recorded already kept.
   */
  record(serverIds: readonly string[], at: number): Promise<void>;
  /** An instance operator allows a server (the latest allowance kept). */
  allow(serverId: string, at: number, by: string): Promise<void>;
  /** An instance operator blocks a server (the latest block kept). */
  block(serverId: string, at: number, by: string): Promise<void>;
  /** A server's block is taken back. */
  unblock(serverId: string): Promise<void>;
}

/** As many servers as one statement of `markLeft` and `cameBack` names. */
const CHUNK = 500;

type Row = {
  serverId: string;
  recordedAt: string | null;
  allowedAt: string | null;
  allowedBy: string | null;
  blockedAt: string | null;
  blockedBy: string | null;
  leftAt: string | null;
  deletingAt: string | null;
  deletedAt: string | null;
  filesLeftAt: string | null;
};

/**
 * A time column as a number, none as null: also a column the table lacks, as `ServerRecord` lacks
 * the deletion's before migration 062 when `cutover-check` reads a database not yet migrated
 * (`selectAll` gives no field; fix round 3, R4).
 */
const time = (value: string | null | undefined): number | null =>
  value == null ? null : Number(value);

const stored = (row: Row): StoredServerRecord => ({
  serverId: row.serverId,
  recordedAt: time(row.recordedAt),
  allowedAt: time(row.allowedAt),
  allowedBy: row.allowedBy,
  blockedAt: time(row.blockedAt),
  blockedBy: row.blockedBy,
  leftAt: time(row.leftAt),
  deletingAt: time(row.deletingAt),
  deletedAt: time(row.deletedAt),
  filesLeftAt: time(row.filesLeftAt),
});

/** The `ServerRecord` table: every read a whole read at the start or by the primary key. */
export class ServerRecordRepository implements ServerRecordStorage {
  constructor(private readonly db: Kysely<DB>) {}

  /** A whole read (`ServerRecords.load` at start): one row per server, bounded small by nature. */
  async all(): Promise<StoredServerRecord[]> {
    const rows = await this.db.selectFrom('ServerRecord').selectAll().orderBy('serverId').execute();
    return rows.map(stored);
  }

  /**
   * One insert per chunk of the servers' `Guild` rows (found by `guild_snowflake_unique`), a row
   * already there given its time only where it has none; then their rows read back by the
   * primary key.
   */
  async markLeft(serverIds: readonly string[], at: number): Promise<StoredServerRecord[]> {
    const marked: StoredServerRecord[] = [];
    const unique = [...new Set(serverIds)];
    for (let start = 0; start < unique.length; start += CHUNK) {
      const chunk = unique.slice(start, start + CHUNK);
      await this.db
        .insertInto('ServerRecord')
        .columns(['serverId', 'leftAt'])
        .expression(
          this.db
            .selectFrom('Guild')
            .select(['snowflake', sql<string>`${String(at)}`.as('leftAt')])
            .where('snowflake', 'in', chunk),
        )
        // Left anew where its data was deleted since it was marked (its return not written).
        .onDuplicateKeyUpdate({
          leftAt: sql<string>`case when leftAt is null or deletedAt >= leftAt then ${String(at)} else leftAt end`,
        })
        .execute();
      const rows = await this.db
        .selectFrom('ServerRecord')
        .selectAll()
        .where('serverId', 'in', chunk)
        .orderBy('serverId')
        .execute();
      marked.push(...rows.map(stored));
    }
    return marked.sort((a, b) => a.serverId.localeCompare(b.serverId));
  }

  /** By the primary key; when its data was deleted stays (plan 19C-3). */
  async cameBack(serverIds: readonly string[]): Promise<void> {
    const unique = [...new Set(serverIds)];
    for (let start = 0; start < unique.length; start += CHUNK) {
      await this.db
        .updateTable('ServerRecord')
        .set({ leftAt: null })
        .where('serverId', 'in', unique.slice(start, start + CHUNK))
        .execute();
    }
  }

  /** By the primary key: one insert per chunk, a row there already given its time only where it has none. */
  async record(serverIds: readonly string[], at: number): Promise<void> {
    const unique = [...new Set(serverIds)];
    for (let start = 0; start < unique.length; start += CHUNK) {
      await this.db
        .insertInto('ServerRecord')
        .values(
          unique.slice(start, start + CHUNK).map((serverId) => ({
            serverId,
            recordedAt: String(at),
          })),
        )
        .onDuplicateKeyUpdate({ recordedAt: sql<string>`coalesce(recordedAt, ${String(at)})` })
        .execute();
    }
  }

  async allow(serverId: string, at: number, by: string): Promise<void> {
    const values = { allowedAt: String(at), allowedBy: by };
    await this.db
      .insertInto('ServerRecord')
      .values({ serverId, ...values })
      .onDuplicateKeyUpdate(values)
      .execute();
  }

  async block(serverId: string, at: number, by: string): Promise<void> {
    const values = { blockedAt: String(at), blockedBy: by };
    await this.db
      .insertInto('ServerRecord')
      .values({ serverId, ...values })
      .onDuplicateKeyUpdate(values)
      .execute();
  }

  /** By the primary key. */
  async markDeleting(serverId: string, at: number): Promise<void> {
    await this.db
      .updateTable('ServerRecord')
      .set({ deletingAt: sql<string>`coalesce(deletingAt, ${String(at)})` })
      .where('serverId', '=', serverId)
      .execute();
  }

  /** By the primary key. */
  async markDeleted(serverId: string, at: number): Promise<void> {
    await this.db
      .updateTable('ServerRecord')
      .set({ deletingAt: null, deletedAt: String(at), filesLeftAt: String(at) })
      .where('serverId', '=', serverId)
      .execute();
  }

  /** By the primary key. */
  async filesRemoved(serverId: string, at: number): Promise<void> {
    await this.db
      .updateTable('ServerRecord')
      .set({ filesLeftAt: null })
      .where('serverId', '=', serverId)
      .where('filesLeftAt', '=', String(at))
      .execute();
  }

  /** By the primary key. */
  async unblock(serverId: string): Promise<void> {
    await this.db
      .updateTable('ServerRecord')
      .set({ blockedAt: null, blockedBy: null })
      .where('serverId', '=', serverId)
      .execute();
  }
}
