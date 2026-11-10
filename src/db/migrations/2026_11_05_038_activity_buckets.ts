import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The activity heatmap (plan 8H-4; design `2026-11-04-history-on-show-design.md`, Part B):
 *
 * - `ActivityBucket`: the raids and max battles of the party history that count
 *   (`countsAsActivity`), summed per server (snowflake), region (`PartyHistory.regionId`, 0
 *   where none), place (`placeKind` `gym` with the gym's id, `spot` with the Power Spot's
 *   Wayfarer id, `none` with `0` for a party at no place: a raid without a gym, a max battle at
 *   a pin), local month (`yyyy-mm` in the installation's zone), ISO weekday (1 Monday to 7
 *   Sunday) and hour: `raids`, `maxes`, `completed` and `heads` (those who came). No member,
 *   ever; no foreign key (the counts outlive the server's row, as the history does). Derived:
 *   rebuilt in full by `npm run activity:rebuild`.
 * - `ActivityProgress`: how far each server's buckets have counted its history (the last
 *   `PartyHistory.id` added); the hourly upkeep adds the records above it.
 * - `PartyHistory`'s index `(serverId, id)`, which the adding reads a server's records along.
 *
 * Safe to run again after a failure half-way: the tables are made only when missing, the index
 * added only when missing.
 */
export const activityBuckets: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ActivityBucket (
        serverId varchar(30) not null,
        regionId int unsigned not null,
        placeKind varchar(4) not null,
        placeId varchar(40) not null,
        month char(7) not null,
        weekday tinyint unsigned not null,
        hour tinyint unsigned not null,
        raids int unsigned not null default 0,
        maxes int unsigned not null default 0,
        completed int unsigned not null default 0,
        heads int unsigned not null default 0,
        primary key (serverId, regionId, placeKind, placeId, month, weekday, hour),
        key activitybucket_server_weekday_hour_index (serverId, weekday, hour),
        key activitybucket_server_month_index (serverId, month)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists ActivityProgress (
        serverId varchar(30) not null,
        lastHistoryId int unsigned not null default 0,
        primary key (serverId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    const indexed = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'PartyHistory'
        and index_name = 'partyhistory_serverid_id_index'`.execute(db);
    if (Number(indexed.rows[0]?.n ?? 0) === 0) {
      await sql`create index partyhistory_serverid_id_index
        on PartyHistory (serverId, id)`.execute(db);
    }
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
