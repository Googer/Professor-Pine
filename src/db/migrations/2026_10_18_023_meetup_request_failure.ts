import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Why an approved meetup could not be made (plan 8S-4): `MeetupRequest.failure` keeps it with a
 * `failed` request, as a short JSON document of its kind (`ApprovalFailure`: `{"kind":
 * "no-forum"}`, or `{"kind":"posts-refused","forumId":"…","missing":["Manage Posts"]}`), so that
 * the moderators' post, drawn anew from the row, names it for the other moderators. Null for
 * every other request and for every row from before, whose post says what it always said.
 *
 * 023: after 8S-2's `022_moderation_reports`.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const meetupRequestFailure: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'MeetupRequest'
        and column_name = 'failure'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table MeetupRequest add column failure json default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
