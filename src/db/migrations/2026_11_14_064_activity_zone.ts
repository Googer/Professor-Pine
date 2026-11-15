import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The zone a server's activity is counted in (final review R3-3 of 2.1; `history.md`, "A change
 * of a server's zone"):
 *
 * - `ActivityProgress.zone`: the IANA zone, as `ServerSettings.zoneOf` spells it, in which the
 *   server's buckets (`ActivityBucket`) and days (`ActivityDay`) up to its marks were counted;
 *   null where it is not known (a row from before this migration, a row just made). The adding
 *   (`ActivityRepository.addNew`) counts a server again from its first record where its zone is
 *   now another, so that a change of zone whose rebuild never ended (a shutdown before its reset,
 *   a rebuild that failed) leaves no history on the old clock.
 *
 * Read and written with the row by its primary key (`serverId`), as the marks are. Safe to run
 * again after a failure: the column is added only when missing.
 */
export const activityZone: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const found = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'ActivityProgress'
        and column_name = 'zone'`.execute(db);
    if (Number(found.rows[0]?.n ?? 0) === 0) {
      await sql`alter table ActivityProgress add column zone varchar(64) null default null
        after lastDayHistoryId`.execute(db);
    }
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
