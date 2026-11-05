import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Reach and want counts (plan 8H-3; design `2026-11-04-history-on-show-design.md`, Part A's
 * "Want counts" and "Reach (Q3)"):
 *
 * - `PartyHistory.reached`: how many members the notifier's news of a party was sent to (queued,
 *   not delivered), the sum of its `reach` steps; 0 for a record of before and for the legacy
 *   history (not recorded).
 * - `StopReport.reach` and `StopReportHistory.reach`: the same for a version of a report at a
 *   stop (research: the news' first report), counted on the live row and copied into its record.
 * - `WantCountDay`: a row per server (snowflake), local day (`yyyy-mm-dd` in the installation's
 *   zone) and target (a want's key, `src/domain/notify/want-keys.ts`): how many members wanted it
 *   at the end of that day. No member, ever.
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing, the
 * table made only when it is missing.
 */
export const reachAndWantCounts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const added: [string, string][] = [
      ['PartyHistory', 'reached'],
      ['StopReport', 'reach'],
      ['StopReportHistory', 'reach'],
    ];
    for (const [table, column] of added) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${column}`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table ${sql.table(table)}
          add column ${sql.ref(column)} int unsigned not null default 0`.execute(db);
      }
    }
    await sql`
      create table if not exists WantCountDay (
        serverId varchar(30) not null,
        day char(10) not null,
        target varchar(120) not null,
        count int unsigned not null,
        primary key (serverId, day, target)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
