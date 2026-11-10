import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** The keys whose columns this migration turns around: the old name, the new one, the table. */
const TURNED = [
  {
    table: 'Role',
    old: 'role_guildid_rolesnowflake_unique',
    name: 'role_rolesnowflake_guildid_unique',
    columns: sql`(roleSnowflake, guildId)`,
  },
  {
    table: 'GymReview',
    old: 'gymreview_guildid_opengymid_unique',
    name: 'gymreview_opengymid_guildid_unique',
    columns: sql`(openGymId, guildId)`,
  },
] as const;

/**
 * Foreign keys that MySQL 9 checks (2026-11-07, on the move from MySQL 8.4 to 9.7).
 *
 * InnoDB checks a foreign key by the first index whose columns begin with the key's own, and a
 * unique index comes before a plain one. MySQL 9.7 (seen on 9.7.4; 8.4 checks it) skips the
 * check of a row when that index is unique and the row has NULL in a further column of it: the
 * row may then name a server that does not exist, and is not deleted with any server. Two keys
 * of this bot were such indexes, both beginning with the server (`guildId`), the foreign key's
 * column: `Role (guildId, roleSnowflake)` (migration 008; a legacy row has no `roleSnowflake`)
 * and `GymReview (guildId, openGymId)` (migration 012; a decided item has no `openGymId`).
 *
 * Each is replaced, in one statement, by the same key with its columns the other way round, so
 * that the foreign key on `guildId` is checked by the plain index that begins with it
 * (`role_guildid_foreign`, `gymreview_guildid_queuedat_index`). What the key allows is
 * unchanged: one row per Discord role and one open item per gym in a server, and any number
 * with NULL. The legacy bot knows neither key (it never names `roleSnowflake`, and has no
 * `GymReview`), so it keeps working on the database as a rollback option. Its own keys are
 * left alone.
 *
 * No foreign key of the schema may lead such an index; a test of this migration looks at the
 * whole schema for one.
 *
 * Safe to run again after a failure half-way: a key turned already is left alone.
 */
export const checkedForeignKeys: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const key of TURNED) {
      const hasOld = await hasIndex(db, key.table, key.old);
      const hasNew = await hasIndex(db, key.table, key.name);
      if (hasNew && !hasOld) continue;
      const drop = hasOld ? sql`drop index ${sql.ref(key.old)}` : undefined;
      const add = hasNew ? undefined : sql`add unique key ${sql.ref(key.name)} ${key.columns}`;
      const changes = [drop, add].filter((change) => change !== undefined);
      await sql`alter table ${sql.table(key.table)} ${sql.join(changes)}`.execute(db);
    }
  },
  async down() {
    // The keys stay as they are now.
  },
};

/** Whether a table of the current database has an index (or a key) of this name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
async function hasIndex(db: Kysely<any>, table: string, index: string): Promise<boolean> {
  const found = await sql<{ n: number }>`
    select count(*) as n from information_schema.statistics
    where table_schema = database() and table_name = ${table}
      and index_name = ${index}`.execute(db);
  return Number(found.rows[0]?.n ?? 0) > 0;
}
