import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { checkedForeignKeys } from './2026_11_07_048_checked_foreign_keys.js';

const HOME = '412345678901234567';
/** The row id of a server that has no row (left, or never there). */
const GONE = 99;

describe('migration 048: foreign keys that MySQL 9 checks', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymReview').execute();
    await db.deleteFrom('Role').execute();
    await db.deleteFrom('Guild').execute();
    await db.deleteFrom('Gym').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
    await sql`insert into Gym (id, lat, lon, name) values (1, 40, -80, 'Gym')`.execute(db);
  });

  const role = (guildId: number, name: string, roleSnowflake: string | null = null) =>
    sql`insert into Role (roleName, guildId, roleSnowflake)
        values (${name}, ${guildId}, ${roleSnowflake})`.execute(db);
  const review = (guildId: number, openGymId: number | null) =>
    sql`insert into GymReview (guildId, gymId, openGymId, kind, candidates, createdAt, queuedAt)
        values (${guildId}, 1, ${openGymId}, 'moved', '[]', 0, 0)`.execute(db);
  const missingParent = { errno: 1452 };

  it('refuses a role or a review item of a server that has no row', async () => {
    // A legacy role (no Discord id) and an item already decided (no open gym): the rows whose
    // NULL in the unique key once made MySQL 9 skip the check of the server.
    await expect(role(GONE, 'East')).rejects.toMatchObject(missingParent);
    await expect(role(GONE, 'West', '510000000000000001')).rejects.toMatchObject(missingParent);
    await expect(review(GONE, null)).rejects.toMatchObject(missingParent);
    await expect(review(GONE, 1)).rejects.toMatchObject(missingParent);
    expect(await db.selectFrom('Role').select('id').execute()).toEqual([]);
    expect(await db.selectFrom('GymReview').select('id').execute()).toEqual([]);
  });

  it('keeps one row per Discord role and one open item per gym in a server', async () => {
    await role(1, 'North', '510000000000000001');
    await expect(role(1, 'South', '510000000000000001')).rejects.toThrow(
      /Duplicate entry .*role_rolesnowflake_guildid_unique/u,
    );
    // Any number without an id, and the same id in another server.
    await role(1, 'East');
    await role(1, 'West');
    await sql`insert into Guild (id, snowflake) values (2, '412345678901234568')`.execute(db);
    await role(2, 'North', '510000000000000001');
    await review(1, 1);
    await expect(review(1, 1)).rejects.toThrow(
      /Duplicate entry .*gymreview_opengymid_guildid_unique/u,
    );
    await review(1, null);
    await review(1, null);
  });

  it('runs again without changing anything', async () => {
    const indexes = () =>
      sql<{ t: string; i: string; c: string }>`
        select table_name as t, index_name as i,
               group_concat(column_name order by seq_in_index) as c
        from information_schema.statistics
        where table_schema = database() and table_name in ('Role', 'GymReview')
        group by table_name, index_name order by table_name, index_name`
        .execute(db)
        .then((result) => result.rows);
    const before = await indexes();
    await checkedForeignKeys.up(db);
    expect(await indexes()).toEqual(before);
  });

  /**
   * MySQL 9.7 checks a foreign key by the first index whose columns begin with the key's, and a
   * unique index comes first. When that index is unique and has a further column that may be
   * NULL, a row with NULL there is not checked at all (seen on 9.7.4; 8.4 checks it): the row
   * may name a parent that does not exist, and is never deleted with it. No foreign key of the
   * schema may begin such an index.
   */
  it('leaves no foreign key leading a unique key with a column that may be NULL', async () => {
    const foreignKeys = await sql<{ t: string; name: string; c: string }>`
      select table_name as t, constraint_name as name,
             group_concat(column_name order by ordinal_position) as c
      from information_schema.key_column_usage
      where table_schema = database() and referenced_table_name is not null
      group by table_name, constraint_name`.execute(db);
    const uniqueKeys = await sql<{ t: string; name: string; c: string; nullable: string }>`
      select table_name as t, index_name as name,
             group_concat(column_name order by seq_in_index) as c,
             group_concat(nullable order by seq_in_index) as nullable
      from information_schema.statistics
      where table_schema = database() and non_unique = 0
      group by table_name, index_name`.execute(db);
    const unchecked = foreignKeys.rows.flatMap((key) => {
      const columns = key.c.split(',');
      return uniqueKeys.rows
        .filter((unique) => unique.t === key.t)
        .filter((unique) => {
          const leading = unique.c.split(',');
          const nullable = unique.nullable.split(',');
          return (
            columns.every((column, at) => leading[at] === column) &&
            nullable.slice(columns.length).includes('YES')
          );
        })
        .map((unique) => `${key.t}.${key.name} leads ${unique.name}`);
    });
    expect(unchecked).toEqual([]);
  });
});
