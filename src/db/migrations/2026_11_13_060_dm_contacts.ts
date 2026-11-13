import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The members Pine has written to before (plan 19B-5; spec "Fairness and limits"): `DmContact`,
 * a row per Discord user (by snowflake, no foreign key) with when the first direct message to
 * them went out (`firstAt`, epoch ms). Discord limits how many new DM channels a bot opens, for
 * the whole bot; the queue caps each server's messages to members without a row
 * (`QueuedDmSender`, `dms.firstContactsPerWindow`). The instance's: one row per member whichever
 * server the message was of. Read and written only by the primary key (`DmContactRepository`).
 *
 * The table starts empty: who was written to before it was made is not known, so every member's
 * first message after the upgrade counts as a first, which the cap's defaults never hold back.
 *
 * Safe to run again after a failure half-way: the table is made only when it is missing.
 */
export const dmContacts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists DmContact (
        userId varchar(30) not null,
        firstAt bigint not null,
        primary key (userId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
