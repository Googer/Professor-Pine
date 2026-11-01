import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The spawn reports that stand in a channel (the fix round after the staging of 5A and 4F).
 *
 * A report of `/wild` is deleted half an hour after it was made. The bot kept the reports that
 * wait in memory only, so those of a process that was killed stood for good. `SpawnReport`
 * holds one row per report message until it is deleted: the channel, the message and when it
 * is due (epoch milliseconds). Snowflakes are `varchar(30)` as in `Party`.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const spawnReports: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists SpawnReport (
        messageId varchar(30) not null,
        channelId varchar(30) not null,
        deleteAt bigint not null,
        primary key (messageId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
