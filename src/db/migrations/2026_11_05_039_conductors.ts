import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * What every conductor of a train led (plan 8H-6A; design `2026-11-04-history-on-show-design.md`,
 * Part D's "trains they conducted"): `PartyHistoryAttendee.conducted`, on the row of each
 * member, how many stops they led the train to as its conductor (its `stop` and `spot` steps
 * between their `conduct` and `unlead` steps, `ledStops`), 0 for none: a member who held the
 * role while the train never moved, other members, other parties, the legacy history and every
 * record of before (`PartyHistory.conductorId` keeps only the last conductor, and only one still
 * on it). The steps `conduct` and `unlead` need no change: `PartyHistoryStep.kind` is a
 * `varchar(8)` since 018.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const conductors: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistoryAttendee'
        and column_name = 'conducted'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table PartyHistoryAttendee add column conducted smallint unsigned not null default 0
        after splitOff`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
