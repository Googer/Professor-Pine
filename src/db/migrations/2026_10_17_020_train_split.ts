import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Splitting a group off a raid train (plan 8T; spec `2026-10-17-train-split-design.md`, "Data"):
 * `PartyHistory.splitFromId` names, in the record of a train that was split off another, that
 * other train's `partyId`. It is a link and nothing more: each train is recorded on its own
 * (Matt, 2026-10-17), so it carries no foreign key (the other record may be written later, or
 * not at all). Null for every other party, the legacy history's included.
 *
 * A member who went with the group leaves the old train by a step of the kind `split`
 * (`PartyHistoryStep.kind`, a `varchar(8)` since 018: no change needed), and their row of the old
 * train's record says so: `PartyHistoryAttendee.splitOff` (1; 0 for every other row), so that
 * SQL tells them from a member who left. `PartyHistory.splitFromId` is indexed, for the trains
 * split off a train.
 *
 * 020: 8S-1 holds 019, which may be merged before or after this one (the migrator runs them
 * in name order on a database that has neither).
 *
 * Safe to run again after a failure half-way: each column and the index are added only when they
 * are missing.
 */
export const trainSplit: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const missing = async (table: string, column: string) => {
      const rows = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${column}`.execute(db);
      return Number(rows.rows[0]?.n ?? 0) === 0;
    };
    if (await missing('PartyHistory', 'splitFromId')) {
      await sql`alter table PartyHistory add column splitFromId char(36) default null
        after routeStops`.execute(db);
    }
    if (await missing('PartyHistoryAttendee', 'splitOff')) {
      await sql`alter table PartyHistoryAttendee add column splitOff tinyint(1) not null default 0
        after leftAt`.execute(db);
    }
    const index = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and index_name = 'partyhistory_splitfromid_index'`.execute(db);
    if (Number(index.rows[0]?.n ?? 0) === 0) {
      await sql`create index partyhistory_splitfromid_index
        on PartyHistory (splitFromId)`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
