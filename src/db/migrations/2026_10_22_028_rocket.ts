import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Team GO Rocket at stops (plan 8R-2; design `2026-10-21-stop-reports-design.md`, sections 5 to
 * 7). A Rocket report itself is a `StopReport` row of the kind `rocket` (migration 027 left the
 * kind for it), one per server, stop and day: a grunt and a hideout share that one row, so that
 * which of them stands is decided in one transaction. This migration adds what is beside it:
 *
 * - `RocketLineup`: the last good list of `/rocket`'s choices read from ScrapedDuck, as
 *   `ResearchTask` keeps the task list: a row per choice (`rocketKey`, `grunt:water`,
 *   `leader:arlo`), its name, its catchable Pokémon (JSON), its place in the list (`position`),
 *   when first and last read, and whether the last good read listed it.
 * - `GruntMessage`: a grunt report's message in a region channel, as `SpawnReport` keeps a
 *   spawn's, until it is deleted: the message, its channel and server, the report it shows
 *   (`reportId`, the `StopReport` row; no foreign key: the message outlives a report replaced or
 *   taken back until its delete is done) and when it is due (epoch milliseconds).
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing.
 */
export const rocket: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists RocketLineup (
        rocketKey varchar(20) not null,
        name varchar(60) not null,
        catches json not null,
        position int not null default 0,
        firstSeen bigint not null,
        lastSeen bigint not null,
        active tinyint(1) not null default 1,
        primary key (rocketKey)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GruntMessage (
        messageId varchar(30) not null,
        channelId varchar(30) not null,
        serverId varchar(30) not null,
        reportId int unsigned not null,
        deleteAt bigint not null,
        primary key (messageId),
        key gruntmessage_report_index (reportId),
        key gruntmessage_delete_index (deleteAt)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
