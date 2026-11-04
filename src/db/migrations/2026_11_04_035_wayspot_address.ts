import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A Power Spot's address, looked up when the map opens its popup (design
 * `2026-11-04-power-spot-address-design.md`): Wayfarer gives Power Spots none.
 * `WayspotAddress` keeps one row per spot asked about (`wayspotId`, its Wayfarer id; no foreign
 * key, as `WayspotPlaces`: a spot that became a gym or was forgotten keeps its row, ignored),
 * where it was asked (`lat`, `lon`: a spot moved more than 10 meters is asked again), the
 * geocode's parts as a gym's `geodata` (null when Google found none), and when (`askedAt`, epoch
 * ms).
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const wayspotAddress: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists WayspotAddress (
        wayspotId varchar(40) not null,
        lat double not null,
        lon double not null,
        geodata text default null,
        askedAt bigint not null,
        primary key (wayspotId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
