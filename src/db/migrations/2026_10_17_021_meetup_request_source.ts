import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Where a meetup held for the moderators was asked for (plan 8M-5M): `MeetupRequest.source` is
 * `map` for a meetup asked for on the live map, null for `/meetup` (and every row from before).
 * The moderators' post is drawn anew from the row at each decision and at expiry, so it says
 * "on the map" only when the row keeps it.
 *
 * 021: after 8S-1's `019_meetup_safety` and 8T's `020_train_split` (renumbered from 020 at the merge: 8T merged first).
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const meetupRequestSource: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'MeetupRequest'
        and column_name = 'source'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table MeetupRequest add column source varchar(8) default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
