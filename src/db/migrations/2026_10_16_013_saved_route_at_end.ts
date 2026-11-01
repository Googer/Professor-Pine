import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * What a train does at the end of a saved route (plan 8B-3): `SavedRoutes.atEnd` holds
 * `finish`, `loop` or `turn-back` (`TRAIN_AT_END`), and every row from before finishes there, as
 * every train did. A saved route keeps its mode (Matt, 2026-10-15): `/route save` writes the
 * train's, `/route load` sets it.
 *
 * The legacy bot names its columns when it inserts into this table, so the default covers the
 * rows it writes; it reads the columns it knows and does not see this one.
 *
 * 013, not 012: the Wayfarer plan (8W-1) adds 012 on its branch. Kysely refuses to run a
 * migration that sorts before one already run, so a database gets 012 before this one.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const savedRouteAtEnd: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'SavedRoutes'
        and column_name = 'atEnd'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table SavedRoutes add column atEnd
        varchar(10) not null default 'finish'`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
