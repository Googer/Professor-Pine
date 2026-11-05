import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Who is on the boards of a server (plan 8H-6; design `2026-11-04-history-on-show-design.md`,
 * Part D and Q2): `LeaderboardOptIn`, a row per member and server (by snowflake, no foreign key,
 * like `HistoryOptIn`) who switched `/settings leaderboard` on. A member is ranked only while
 * both their history opt-in and this row are there; the history's opt-out deletes this row in
 * its transaction.
 *
 * Beside it `PartyHistory.closedBy` (`varchar(12)`, null; review A1): who closed a party where
 * staff (`staff`: `/delete`, the map's Delete…) or the moderators (`moderators`: a decision of a
 * report, a block of a meetup's maker) did. The ending cannot say it: a party that took place
 * records `completed` however it was closed. Null for every other end and for every record of
 * before 040.
 *
 * And the index `PartyHistory (serverId, source, kind, createdAt)` (W2): the boards read a
 * server's live records of a kind from a moment on, which on a server of the legacy import
 * would otherwise walk its legacy records of that kind too.
 *
 * Safe to run again after a failure half-way: the table is made, the column and the index added
 * only when they are missing.
 */
export const leaderboardOptIn: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists LeaderboardOptIn (
        serverId varchar(30) not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (serverId, memberId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    const closedBy = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'closedBy'`.execute(db);
    if (Number(closedBy.rows[0]?.n ?? 0) === 0) {
      await sql`alter table PartyHistory add column closedBy varchar(12) default null
        after ending`.execute(db);
    }
    const indexed = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and index_name = 'partyhistory_server_source_kind_createdat_index'`.execute(db);
    if (Number(indexed.rows[0]?.n ?? 0) === 0) {
      await sql`create index partyhistory_server_source_kind_createdat_index
        on PartyHistory (serverId, source, kind, createdAt)`.execute(db);
    }
  },
  async down() {
    // Additive only: the table stays.
  },
};
