import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Raids per day (plan 8H-8; design `2026-11-04-history-on-show-design.md`, Part G): the big days,
 * the history page's chart of a year's days and a boss's trend.
 *
 * - `ActivityDay`: the raids and max battles of the party history that count
 *   (`countsAsActivity`), summed per server (snowflake), region (`PartyHistory.regionId`, 0 where
 *   none), local day (`yyyy-mm-dd` in the installation's zone, `dayOf`) and boss (the record's
 *   `bossKey`, `''` for an egg, a boss known only by name, none): `raids` and `maxes`. No member,
 *   ever; no foreign key (the counts outlive the server's row, as the history does). Derived:
 *   rebuilt in full by `npm run activity:rebuild`, with the heatmap's buckets. Its two indexes
 *   hold every column their reads ask (A7): a server's days (`(serverId, day, regionId, raids,
 *   maxes)`, the year's chart and the big days) and a boss's trend and list (`(serverId, boss,
 *   day, regionId, raids)`) are read from the index alone, never from the table's rows.
 * - `ActivityProgress.lastDayHistoryId`: how far the days have counted each server's history,
 *   apart from the buckets' `lastHistoryId`, so that the hourly upkeep adds the whole history of
 *   every server to the days from 0 without touching the buckets (and no bucket is deleted here).
 *
 * Safe to run again after a failure half-way: the table is made only when missing, the column
 * added only when missing.
 */
export const activityDays: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ActivityDay (
        serverId varchar(30) not null,
        regionId int unsigned not null,
        day char(10) not null,
        boss varchar(64) not null,
        raids int unsigned not null default 0,
        maxes int unsigned not null default 0,
        primary key (serverId, regionId, day, boss),
        key activityday_server_day_index (serverId, day, regionId, raids, maxes),
        key activityday_server_boss_day_index (serverId, boss, day, regionId, raids)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    const found = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'ActivityProgress'
        and column_name = 'lastDayHistoryId'`.execute(db);
    if (Number(found.rows[0]?.n ?? 0) === 0) {
      await sql`alter table ActivityProgress add column lastDayHistoryId int unsigned not null
        default 0 after lastHistoryId`.execute(db);
    }
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
