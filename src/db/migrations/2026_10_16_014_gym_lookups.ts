import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The line of gyms that wait for Google (plan 8W-1R; Matt, 2026-10-16): a Wayfarer import of a
 * city adds and moves thousands of gyms, and Google is asked about them a bounded number a day
 * instead of all at once, over weeks (`GymUpkeep`, `settings.googleLookupsPerDay`).
 *
 * `GymLookup` is one row per gym that waits: whether it waits for its address as well as its
 * places (`address`), and when it was put in the line (`queuedAt`, epoch milliseconds), by which
 * the line is worked through. A row goes with its gym.
 *
 * `GymLookupDay` counts the gyms asked about on a day (`day`: `YYYY-MM-DD` in the bot's time
 * zone), so that a restart in the middle of a day does not start the day's count again.
 *
 * 014: plan 8B-3 added 013 on `typescript-migration`; whichever branch of the two that add a
 * 014 merges first keeps the number, and the other renumbers (Matt, 2026-10-15).
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing.
 */
export const gymLookups: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists GymLookup (
        gymId int unsigned not null,
        address tinyint(1) not null default 0,
        queuedAt bigint not null,
        primary key (gymId),
        key gymlookup_queuedat_index (queuedAt, gymId),
        constraint gymlookup_gymid_foreign foreign key (gymId) references Gym (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GymLookupDay (
        day char(10) not null,
        gyms int unsigned not null default 0,
        primary key (day)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
