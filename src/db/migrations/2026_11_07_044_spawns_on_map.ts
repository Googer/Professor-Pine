import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * What the live map shows of a wild spawn (Matt, 2026-11-07: "Should wild spawns appear on the
 * map? yes"): `SpawnReport` kept only the message and when it is deleted; a report made from now on
 * also keeps what its region message says, so that `/api/spawns` can list it while it stands. The
 * server (`guildId`), the catalogue entry (`pokemonKey`, `pokemonName`), whether an event lists it
 * costumed, the IVs the reporter checked (`perfect`, `zero`), the details as typed, the reporter's
 * name as it was then, the picture's address the message shows, the place it is near (`near`, the
 * report's `Place` as JSON: a known place or a dropped pin) and when it was made. Every column may
 * be null (or false) for the rows of before, which the map does not list. The index serves the
 * map's read of a server's reports that stand.
 *
 * 044: after 8H-10's `043_legacy_fill_in`.
 *
 * Safe to run again after a failure half-way: each column and the index are added only when
 * missing.
 */
export const spawnsOnMap: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const columns: ReadonlyArray<[string, ReturnType<typeof sql.raw>]> = [
      ['guildId', sql.raw('varchar(30) default null')],
      ['pokemonKey', sql.raw('varchar(100) default null')],
      ['pokemonName', sql.raw('varchar(100) default null')],
      ['costumed', sql.raw('tinyint(1) not null default 0')],
      ['iv', sql.raw('varchar(10) default null')],
      ['details', sql.raw('varchar(255) default null')],
      ['reporterName', sql.raw('varchar(100) default null')],
      ['image', sql.raw('varchar(1000) default null')],
      ['near', sql.raw('json default null')],
      ['madeAt', sql.raw('bigint default null')],
    ];
    for (const [name, type] of columns) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'SpawnReport'
          and column_name = ${name}`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table SpawnReport add column ${sql.ref(name)} ${type}`.execute(db);
      }
    }
    const index = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'SpawnReport'
        and index_name = 'spawnreport_guildid_deleteat_index'`.execute(db);
    if (Number(index.rows[0]?.n ?? 0) === 0) {
      await sql`
        alter table SpawnReport
        add index spawnreport_guildid_deleteat_index (guildId, deleteAt)`.execute(db);
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
