import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * When an event's research task stops being offered (Matt, 2026-10-31): `ResearchTask.endsAt`, the
 * end Leek Duck's page gives the task's section (`data-event-end`), epoch milliseconds, kept so
 * that a start past the end does not offer the task until the next read. Null for a standing task
 * and for every row from before, which the next read sets right.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const researchTaskEnds: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'ResearchTask'
        and column_name = 'endsAt'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table ResearchTask add column endsAt bigint default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
