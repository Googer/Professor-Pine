import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The line that waits for Google as a priority queue with a monthly budget (plan 8W-6; design
 * `2026-10-20-google-line-priority-design.md`):
 *
 * - `GymLookup.regionRank`: the rank of the gym's best region by its raids (`regionRanks`,
 *   `src/domain/geo/google-line.ts`; -1 for a gym in no region of any server), by which the line
 *   is worked through before the time a gym was queued. Rows from before take 0 until the line's
 *   ranks are worked out at the next start.
 * - `WayspotLookup`: one row per PokéStop or Power Spot that waits for its places (`wayspotId`:
 *   the Wayfarer id of a kept Wayspot, or `pine-<id>` for a stop of Pine's own; no foreign key,
 *   since the two live in different tables: the line passes over an id it no longer knows),
 *   its `kind` (`stop`, `powerspot`) and `regionRank` as for gyms, and when it was queued.
 * - `WayspotPlaces`: the places Google gave around a PokéStop or Power Spot, kept apart from the
 *   Wayfarer import's writes to `Wayspot` (whose upsert must not clear them), with the point and
 *   kind they were asked for (`lat`, `lon`, `kind`: a Wayspot moved by more than a few meters, or
 *   of another kind now, waits again) and when (`askedAt`, epoch ms); `places` the names joined
 *   by spaces, as `GymMeta.places`, null when Google found none.
 * - `GymGoogleAsked`: one row per gym whose places Google answered at the place it is now
 *   (`askedAt`, epoch ms), whatever it found, written with the answer and deleted when the gym
 *   moves (and with the gym): a gym Google found nothing for has neither address nor places, as
 *   one never asked, and a start must not put it in the line again. A gym of before with places
 *   counts as asked without a row.
 * - `GoogleUseDay`: the questions that reached Google per day (`day`, `YYYY-MM-DD` in Pacific
 *   time, when Google's free amounts reset) and kind (`places`, `geocode`): a month is the sum of
 *   its days, so that a restart does not start the month's count again. `GymLookupDay` stays and
 *   is no longer written; its rows of the current month are read as places questions.
 *
 * 032: at first 031, renumbered when typescript-migration was merged in, as 8R-9's
 * `031_region_board` came first (a database that ran it refuses an earlier name).
 *
 * Safe to run again after a failure half-way: a table is created and a column added only when it
 * is missing.
 */
export const googleLine: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'GymLookup'
        and column_name = 'regionRank'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table GymLookup
        add column regionRank double not null default 0,
        add key gymlookup_order_index (regionRank desc, queuedAt, gymId)`.execute(db);
    }
    await sql`
      create table if not exists WayspotLookup (
        wayspotId varchar(40) not null,
        kind varchar(10) not null,
        regionRank double not null default 0,
        queuedAt bigint not null,
        primary key (wayspotId),
        key wayspotlookup_order_index (kind desc, regionRank desc, queuedAt, wayspotId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists WayspotPlaces (
        wayspotId varchar(40) not null,
        kind varchar(10) not null,
        lat double not null,
        lon double not null,
        places text default null,
        askedAt bigint not null,
        primary key (wayspotId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GymGoogleAsked (
        gymId int unsigned not null,
        askedAt bigint not null,
        primary key (gymId),
        constraint gymgoogleasked_gymid_foreign foreign key (gymId) references Gym (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GoogleUseDay (
        day char(10) not null,
        kind varchar(8) not null,
        questions int unsigned not null default 0,
        primary key (day, kind)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
