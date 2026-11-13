import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A feed's wall-clock times kept as such (plan 19A-2, a time zone per server): beside each stored
 * moment of a feed's time, its wall-clock time where the feed gave it so (`startsLocal`,
 * `endsLocal`: `yyyy-mm-ddThh:mm:ss[.fff]`, `FeedTime`'s `local`), null for a time the feed gave
 * as a moment and for every row from before. Where it is set it is the truth (Raid Hour at 18:00
 * is 18:00 in each server's zone) and the moment beside it is its moment in the instance's
 * default zone, so that 2.0, going back, still reads a sensible value. On the research events,
 * the max and big events, the events forum's listed events, the event window staff set (typed
 * as local time) and the research tasks' section ends (`ResearchTask.endsLocal` only).
 *
 * Safe to run again after a failure half-way: each column is added only when it is missing.
 */
const COLUMNS: readonly (readonly [table: string, column: string])[] = [
  ['ResearchEvent', 'startsLocal'],
  ['ResearchEvent', 'endsLocal'],
  ['MaxEvent', 'startsLocal'],
  ['MaxEvent', 'endsLocal'],
  ['ListedEvent', 'startsLocal'],
  ['ListedEvent', 'endsLocal'],
  ['EventWindow', 'startsLocal'],
  ['EventWindow', 'endsLocal'],
  ['ResearchTask', 'endsLocal'],
];

export const feedLocalTimes: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const [table, column] of COLUMNS) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${column}`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table ${sql.table(table)} add column ${sql.ref(column)} varchar(32) default null`.execute(
          db,
        );
      }
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
