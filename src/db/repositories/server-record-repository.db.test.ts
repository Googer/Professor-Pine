import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plansOf } from '../../../test/support/query-plan.js';
import {
  NEVER_THERE,
  serverRecordCases,
  STANDING_NOW,
  STANDING_SERVER,
} from '../../../test/support/server-record-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import type { DB } from '../types.js';
import { ServerRecordRepository } from './server-record-repository.js';

/** The record of each server, of migration 061. */
describe('ServerRecordRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, database, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  serverRecordCases(async ({ rows = [], guilds = [] }) => {
    await db.deleteFrom('ServerRecord').execute();
    await db.deleteFrom('Guild').execute();
    if (guilds.length > 0) {
      await db
        .insertInto('Guild')
        .values(guilds.map((snowflake) => ({ snowflake })))
        .execute();
    }
    const store = new ServerRecordRepository(db);
    if (rows.length > 0) {
      await db
        .insertInto('ServerRecord')
        .values(
          rows.map((row) => ({
            ...row,
            recordedAt: row.recordedAt === null ? null : String(row.recordedAt),
            allowedAt: row.allowedAt === null ? null : String(row.allowedAt),
            blockedAt: row.blockedAt === null ? null : String(row.blockedAt),
            leftAt: row.leftAt === null ? null : String(row.leftAt),
            deletingAt: row.deletingAt === null ? null : String(row.deletingAt),
            deletedAt: row.deletedAt === null ? null : String(row.deletedAt),
            filesLeftAt: row.filesLeftAt === null ? null : String(row.filesLeftAt),
          })),
        )
        .execute();
    }
    return store;
  });

  it('finds the servers Pine was in by the unique key of their Guild rows, its own by its key', async () => {
    await db.deleteFrom('ServerRecord').execute();
    await db.deleteFrom('Guild').execute();
    // Enough rows for the optimizer to choose as on a real instance: two thousand servers.
    const many = Array.from({ length: 2_000 }, (_, n) => ({
      snowflake: String(500000000000000000n + BigInt(n)),
    }));
    await db.insertInto('Guild').values(many).execute();
    await sql`analyze table Guild`.execute(db);
    const [marked, readBack, ...more] = await plansOf(database, (seen) =>
      new ServerRecordRepository(seen).markLeft([STANDING_SERVER, NEVER_THERE], STANDING_NOW),
    );
    expect(more).toEqual([]);
    expect(marked?.find((row) => row.table === 'Guild')?.key).toBe('guild_snowflake_unique');
    expect(readBack?.find((row) => row.table === 'ServerRecord')?.key).toBe('PRIMARY');
  });
});
