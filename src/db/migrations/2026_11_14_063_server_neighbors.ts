import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Neighbors (plan 19E; spec `2026-11-12-multi-server-instance-design.md`, "Neighbors";
 * `ServerNeighborRepository`): one row per pair of servers, keyed by their snowflakes in a fixed
 * order (`serverA` the lower as a number, `neighborPair` of `src/domain/servers/neighbors.ts`),
 * not their `Guild` rows (as `ServerRecord`: a request may name a server Pine is not in, and is
 * answered as any other). `askedBy` is which of the two asked, `askedAt` when; `acceptedAt` and
 * `declinedAt` the other's answer, null while neither; `toldAt` when the other's staff were last
 * told of a request of `askedBy`'s, `withdrawnAt` when `askedBy` took it back (a request taken
 * back is kept as long as its tell, so that the other is told of the pair's requests at most once
 * a week). A pair has one row: one request pending per pair. An end deletes the row; a declined
 * row is kept a week (the same server may ask again only after it), a request unanswered expires
 * after a week, and the start and the upkeep delete what is no longer kept by the primary key.
 *
 * Reads: the whole table at the start (`ServerNeighbors.load`: a server has at most
 * `NEIGHBORS_MAX` neighbors and requests of its own, and declines and requests taken back live a
 * week, at most five asks of a server in ten minutes; small), and writes by the primary key. `serverneighbor_serverb_index` (`serverB`, `serverA`)
 * leads with the second server as the primary key leads with the first, so that a server's rows
 * are read by an index whichever of the two it is (the deletion of a server's data, plan 19C-3,
 * finds them by both).
 *
 * Safe to run again: the table is made only when missing, with its index in one statement.
 */
export const serverNeighbors: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ServerNeighbor (
        serverA varchar(20) not null,
        serverB varchar(20) not null,
        askedBy varchar(20) not null,
        askedAt bigint not null,
        acceptedAt bigint default null,
        declinedAt bigint default null,
        toldAt bigint default null,
        withdrawnAt bigint default null,
        primary key (serverA, serverB),
        key serverneighbor_serverb_index (serverB, serverA)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
