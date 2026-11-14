import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { serverRecord } from './2026_11_13_061_server_record.js';

const PITTSBURGH = '412345678901234567';
const NEIGHBOR = '412345678901234568';
const LATER = '412345678901234569';

describe('migration 061: the record of each server', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from ServerRecord`.execute(db);
    await db.deleteFrom('Guild').execute();
  });

  /** Every row, by server: whether it was recorded, and whether anything else is set. */
  const rows = async () =>
    (
      await sql<{ serverId: string; recorded: number; others: number }>`
        select serverId, recordedAt is not null as recorded,
          coalesce(allowedAt, allowedBy, blockedAt, blockedBy, leftAt) is not null as others
        from ServerRecord order by serverId`.execute(db)
    ).rows.map((row) => ({ ...row, recorded: Number(row.recorded), others: Number(row.others) }));

  it('keeps a row per server, keyed by its snowflake, every time and who nullable', async () => {
    const columns = await sql<{ name: string; type: string; nullable: string; key: string }>`
      select column_name as name, column_type as type, is_nullable as nullable,
        column_key as \`key\`
      from information_schema.columns
      where table_schema = database() and table_name = 'ServerRecord'
      order by ordinal_position`.execute(db);
    // This migration's own: later ones add theirs (062, the deletion of a server).
    expect(columns.rows.slice(0, 7)).toEqual([
      { name: 'serverId', type: 'varchar(20)', nullable: 'NO', key: 'PRI' },
      { name: 'recordedAt', type: 'bigint', nullable: 'YES', key: '' },
      { name: 'allowedAt', type: 'bigint', nullable: 'YES', key: '' },
      // Indexed for the look of `/operator forget` (`MemberDataRepository`): what they did as
      // instance operators.
      { name: 'allowedBy', type: 'varchar(20)', nullable: 'YES', key: 'MUL' },
      { name: 'blockedAt', type: 'bigint', nullable: 'YES', key: '' },
      { name: 'blockedBy', type: 'varchar(20)', nullable: 'YES', key: 'MUL' },
      { name: 'leftAt', type: 'bigint', nullable: 'YES', key: '' },
    ]);
  });

  it('records every server of a Guild row at the upgrade, and only then', async () => {
    await db
      .insertInto('Guild')
      .values([{ snowflake: PITTSBURGH }, { snowflake: NEIGHBOR }, { snowflake: null }])
      .execute();
    await serverRecord.up(db);
    expect(await rows()).toEqual([
      { serverId: PITTSBURGH, recorded: 1, others: 0 },
      { serverId: NEIGHBOR, recorded: 1, others: 0 },
    ]);
    // Run again (a migration that failed later on): a server that came since is not recorded.
    await db.insertInto('Guild').values({ snowflake: LATER }).execute();
    await serverRecord.up(db);
    expect((await rows()).map((row) => row.serverId)).toEqual([PITTSBURGH, NEIGHBOR]);
  });

  it('records nobody on a new install', async () => {
    await serverRecord.up(db);
    expect(await rows()).toEqual([]);
  });
});
