import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Every Wayspot of a Wayfarer import (plan 8W-2): the PokéStops, the power spots and the Wayfarer gyms Pine did not
 * take, inside a server's regions and in the scan's margin outside them alike, for `/wild` near a
 * Wayspot and for the region editor (8M-2). A Wayfarer gym that is a Pine gym lives in `Gym` (its
 * `pogoId`) and has no row here.
 *
 * `Wayspot` is one row per Wayspot: `id` is Wayfarer's id (`poiId`), `kind` what the game makes
 * of it (`stop`, `powerspot`, `gym`), `formerKind` the kind it had before an import last saw it
 * as another (a stop promoted to a gym; null while it never changed), the place, its title and
 * address as Wayfarer gives them (plain text: nothing of the legacy bot reads this table, so it
 * is not entity-encoded as gym texts are; cut to the column), the address of its picture (left
 * out when longer than the column), and when an import saw it first and last (epoch
 * milliseconds). Wayspots are not per server, as gyms are not: a row is written by whichever
 * server's import saw it last.
 *
 * 017: this plan's (015 is 8M-1's, 016 8H's); renumbered at a merge if another branch took it
 * first.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const wayspot: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists Wayspot (
        id varchar(40) not null,
        kind varchar(10) not null,
        formerKind varchar(10) null,
        lat double not null,
        lon double not null,
        title varchar(255) not null,
        address varchar(255) null,
        image varchar(255) null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        primary key (id),
        key wayspot_kind_index (kind),
        key wayspot_lat_lon_index (lat, lon)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
