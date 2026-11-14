import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * A server's record as kept (table `ServerRecord` of migration 061): each fact null where it
 * does not hold. `recordedAt` when it was recorded at the upgrade to 2.1, `allowedAt` /
 * `allowedBy` and `blockedAt` / `blockedBy` an instance operator's allowance and block (with the
 * operator's id), `leftAt` since when Pine is no longer in it.
 */
export interface StoredServerRecord {
  serverId: string;
  recordedAt: number | null;
  allowedAt: number | null;
  allowedBy: string | null;
  blockedAt: number | null;
  blockedBy: string | null;
  leftAt: number | null;
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
   * an earlier time where one is marked already; their rows as they are now, by server. A server
   * Pine was never in (one it refused) is not written.
   */
  markLeft(serverIds: readonly string[], at: number): Promise<StoredServerRecord[]>;
  /** These servers are present again: none of them is marked left any more. */
  cameBack(serverIds: readonly string[]): Promise<void>;
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
};

const time = (value: string | null): number | null => (value === null ? null : Number(value));

const stored = (row: Row): StoredServerRecord => ({
  serverId: row.serverId,
  recordedAt: time(row.recordedAt),
  allowedAt: time(row.allowedAt),
  allowedBy: row.allowedBy,
  blockedAt: time(row.blockedAt),
  blockedBy: row.blockedBy,
  leftAt: time(row.leftAt),
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
        .onDuplicateKeyUpdate({ leftAt: sql<string>`coalesce(leftAt, ${String(at)})` })
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

  /** By the primary key. */
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
  async unblock(serverId: string): Promise<void> {
    await this.db
      .updateTable('ServerRecord')
      .set({ blockedAt: null, blockedBy: null })
      .where('serverId', '=', serverId)
      .execute();
  }
}
