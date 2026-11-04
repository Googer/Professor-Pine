import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The history of reports at stops (plan 8H-2; design `2026-11-04-history-on-show-design.md`,
 * Part A): every version of a report that ends is kept, so that the boards and a member's own
 * stats have data from the cutover on.
 *
 * - `StopReport.cell`: the S2 cell of level 14 the stop lies in (about 600 m across, a token of
 *   `@pine/wayspot-core/s2`), `StopReport.regionIds`: the `Region.id`s whose outlines held the
 *   stop (JSON array), both fixed when the report is made; `StopReport.confirmedBy`: the other
 *   members who met this version with a report of their own (JSON array of member ids, each
 *   once). Null for a row of before, and `regionIds` for one whose regions could not be read.
 *   The live row is swept within the day, so these ids live no longer than its `reporterId`.
 * - `StopReportHistory`: a row per version that ended: the live row's id and `madeAt`
 *   (`reportId`, `reportMadeAt`: a version), server, kind, period, subject, the detail with every
 *   member it names written `@member`, the cell and regions, its times, the reporter only with
 *   their history opt-in (else null), how many other members confirmed it and how it ended
 *   (`ending`). No stop, name, address, picture or point, and no reporter's name. Indexed by
 *   server and reporter (the opt-out), server and end (the boards), and by version (a hideout
 *   put back forgets its record).
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing, the
 * table made only when it is missing.
 */
export const stopReportHistory: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const added: [string, string][] = [
      ['cell', 'varchar(16) null'],
      ['regionIds', 'json null'],
      ['confirmedBy', 'json null'],
    ];
    for (const [column, type] of added) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'StopReport'
          and column_name = ${column}`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table StopReport add column ${sql.raw(column)} ${sql.raw(type)}`.execute(
          db,
        );
      }
    }
    await sql`
      create table if not exists StopReportHistory (
        id int unsigned not null auto_increment,
        reportId int unsigned not null,
        reportMadeAt bigint not null,
        serverId varchar(30) not null,
        kind varchar(10) not null,
        periodKey varchar(220) not null,
        subjectKey varchar(64) not null,
        detail json not null,
        cell varchar(16) null,
        regionIds json null,
        madeAt bigint not null,
        endsAt bigint not null,
        endedAt bigint not null,
        reporterId varchar(30) null,
        confirmations int unsigned not null default 0,
        ending varchar(20) not null,
        primary key (id),
        key stopreporthistory_server_reporter_index (serverId, reporterId),
        key stopreporthistory_server_ended_index (serverId, endedAt),
        key stopreporthistory_report_index (reportId, reportMadeAt)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
