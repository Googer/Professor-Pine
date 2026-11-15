import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { serverDeletion } from './2026_11_14_062_server_deletion.js';

describe('migration 062: the deletion of a server left 30 days', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const columnsOf = async (table: string) =>
    (
      await sql<{ name: string; type: string; nullable: string }>`
        select column_name as name, column_type as type, is_nullable as nullable
        from information_schema.columns
        where table_schema = database() and table_name = ${table}
        order by ordinal_position`.execute(db)
    ).rows;

  const indexOf = async (table: string, name: string) =>
    (
      await sql<{ c: string }>`
        select column_name as c from information_schema.statistics
        where table_schema = database() and table_name = ${table} and index_name = ${name}
        order by seq_in_index`.execute(db)
    ).rows.map((row) => row.c);

  it('records when a server’s deletion began and when it ended, and since when files are left, all nullable', async () => {
    const added = (await columnsOf('ServerRecord')).filter((c) =>
      ['deletingAt', 'deletedAt', 'filesLeftAt'].includes(c.name),
    );
    expect(added).toEqual([
      { name: 'deletingAt', type: 'bigint', nullable: 'YES' },
      { name: 'deletedAt', type: 'bigint', nullable: 'YES' },
      { name: 'filesLeftAt', type: 'bigint', nullable: 'YES' },
    ]);
  });

  it('indexes by server what had no such index', async () => {
    expect(await indexOf('StopPost', 'stoppost_server_index')).toEqual(['serverId']);
    expect(await indexOf('GruntMessage', 'gruntmessage_server_index')).toEqual(['serverId']);
    expect(await indexOf('EndedPartyCopy', 'endedpartycopy_regionid_index')).toEqual(['regionId']);
  });

  it('runs again without a change, the columns and indexes there already', async () => {
    const before = await columnsOf('ServerRecord');
    await serverDeletion.up(db);
    expect(await columnsOf('ServerRecord')).toEqual(before);
    expect(await indexOf('StopPost', 'stoppost_server_index')).toEqual(['serverId']);
  });
});
