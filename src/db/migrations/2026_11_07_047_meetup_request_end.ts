import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * When a meetup held for the moderators ends (2026-11-07, follow-ups of Phase 3A: `/meetup end:`):
 * `MeetupRequest.endTime`, epoch milliseconds, null for a meetup asked for without an end (and
 * every row from before). An approval makes the meetup with it, and the moderators' post says it.
 *
 * 047: written as 045 on its branch and renumbered at the merge, after 044 (spawns on the map),
 * 045 (the party audit log) and 046 (the copies of ended parties).
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const meetupRequestEnd: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'MeetupRequest'
        and column_name = 'endTime'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table MeetupRequest add column endTime bigint default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
