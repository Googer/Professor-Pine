import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The event window staff set with `/admin event-window` (Matt, 2026-11-09: the days around a big
 * event, its lead-up and the event itself, when raids last as in a Raid Hour and max battles
 * rotate every 30 minutes; `EventWindowRepository`): one row at most, `id` always 1 (one window
 * per installation, game events being global); `startsAt` and `endsAt` epoch milliseconds (an
 * ended window keeps its row, its end moved to the moment it was ended), `setBy` the staff
 * member's snowflake, `setAt` when.
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const eventWindow: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists EventWindow (
        id tinyint unsigned not null,
        startsAt bigint not null,
        endsAt bigint not null,
        setBy varchar(30) not null,
        setAt bigint not null,
        primary key (id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
