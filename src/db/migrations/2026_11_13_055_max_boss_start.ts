import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The moment an upcoming max boss starts, as Pokebattler gives it (plan 19A-2, a time zone per
 * server): `RaidBoss.startsFrom`, epoch milliseconds, null for a boss that is no upcoming one and
 * for every row from before. Pokebattler gives one instant for an event the game holds at a
 * local hour everywhere, so the boss is offered from the start of that instant's day in each
 * server's zone (`maxRowsIn`); `firstSeen` keeps that day's start in the instance's default zone,
 * as 2.0 reads it.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const maxBossStart: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'RaidBoss'
        and column_name = 'startsFrom'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table RaidBoss add column startsFrom bigint default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
