import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The member's id on the moderators' records takes a null (plan 8G, fix round 1): the owner's
 * `/operator forget member:` clears it, with the name, on the records that are decided and over.
 *
 * - `MeetupRequest.makerId`, `MeetupAppeal.memberId` and `MeetupPlaceAsk.memberId` become
 *   nullable (`varchar(30) default null`).
 * - `ModerationReportReason` gets a row id of its own as its primary key (`id`, auto-increment),
 *   `reporterId` becomes nullable, and `(reportId, reporterId)` stays unique as
 *   `moderationreportreason_report_reporter_unique` (one reason per reporter and report). MySQL
 *   lets several nulls stand in a unique key, so several forgotten reporters of one report do
 *   not collide; a column of a primary key could not be null at all.
 *
 * **Not additive.** It changes existing columns and a primary key, which the rule "database
 * changes are additive only" forbids. Matt allowed it on 2026-11-10, for this removal on request
 * and nowhere else: a member who asks to be forgotten is forgotten on these records too, not only
 * their name. The four tables are Pine's own (migrations 019 and 022); the legacy bot never had
 * them, and nothing of the legacy schema is touched. A version of Pine older than 051 reads the
 * columns as never null, which holds until somebody is forgotten; to go back past 051 its row in
 * `kysely_migration` is removed first (the columns stay as they are).
 *
 * Depends on nothing after 022: it can run beside any other migration of its day.
 *
 * Safe to run again after a failure half-way: each step is done only while it is not done yet
 * (read from `information_schema`), and each is one statement, which MySQL makes or undoes whole.
 */
export const forgettableMembers: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const cleared: [table: string, column: string][] = [
      ['MeetupRequest', 'makerId'],
      ['MeetupAppeal', 'memberId'],
      ['MeetupPlaceAsk', 'memberId'],
    ];
    for (const [table, column] of cleared) await nullable(db, table, column);

    // The unique key first: the reasons are never without a key that keeps one per reporter.
    const unique = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'ModerationReportReason'
        and index_name = 'moderationreportreason_report_reporter_unique'`.execute(db);
    if (Number(unique.rows[0]?.n ?? 0) === 0) {
      await sql`alter table ModerationReportReason
        add unique key moderationreportreason_report_reporter_unique (reportId, reporterId)`.execute(
        db,
      );
    }
    const id = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'ModerationReportReason'
        and column_name = 'id'`.execute(db);
    if (Number(id.rows[0]?.n ?? 0) === 0) {
      await sql`alter table ModerationReportReason drop primary key,
        add column id int unsigned not null auto_increment primary key first`.execute(db);
    }
    await nullable(db, 'ModerationReportReason', 'reporterId');
  },
  async down() {
    // Nothing is undone: a null cleared on request cannot be given back, and the columns stay.
  },
};

/** Makes a member's column `varchar(30)` nullable, unless it is already. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
async function nullable(db: Kysely<any>, table: string, column: string): Promise<void> {
  const found = await sql<{ nullable: string }>`
    select is_nullable as nullable from information_schema.columns
    where table_schema = database() and table_name = ${table}
      and column_name = ${column}`.execute(db);
  if (found.rows[0]?.nullable !== 'NO') return;
  await sql`alter table ${sql.raw(table)}
    modify column ${sql.raw(column)} varchar(30) default null`.execute(db);
}
