import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The queue of legacy fill-ins (plan 8H-10; design `2026-11-04-history-on-show-design.md`, Part H
 * and Q6): `LegacyFillIn`, a row per member and server (by snowflake, no foreign key, like
 * `HistoryOptIn`) who asked from `/settings` to have their id filled into the legacy parties the
 * member index names them in. Written only from their `HistoryOptIn` row, and deleted with it by
 * the opt-out. `requestedAt` when they asked; `startedAt` when a worker last claimed it (a claim
 * goes stale, so that a run a stop cut short is taken up again); `doneAt` and `filled` (the
 * legacy parties it named them in) when it ended; `failedAt` and `failure` (words only, no ids)
 * where it could not be done. A table rather than memory, so that a restart loses no request.
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const legacyFillIn: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists LegacyFillIn (
        serverId varchar(30) not null,
        memberId varchar(30) not null,
        requestedAt bigint not null,
        startedAt bigint default null,
        doneAt bigint default null,
        filled int unsigned not null default 0,
        failedAt bigint default null,
        failure varchar(200) default null,
        primary key (serverId, memberId),
        key legacyfillin_waiting_index (doneAt, failedAt, requestedAt)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
