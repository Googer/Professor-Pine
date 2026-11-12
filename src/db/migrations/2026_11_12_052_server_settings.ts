import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A server's settings (plan 19A-1; spec `2026-11-12-multi-server-instance-design.md`, "Per-server
 * settings"; `ServerSettingsRepository`): one row per Discord server, keyed by its snowflake
 * (`serverId`, not the `Guild` row: the row outlives a server Pine leaves, plan C deletes it after
 * 30 days). `settings` is the server's values as one JSON document, checked by
 * `serverValuesSchema` (`src/config/server-settings.ts`) when it is read and before it is
 * written; `setUpAt` when the server finished its setup (every server present at the upgrade to
 * 2.1 counts as set up; null for one that joined later, which plan C's setup reads); `updatedAt`
 * and `updatedBy` the last change and the staff member who made it (null for the fill, which
 * nobody asked for).
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const serverSettings: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ServerSettings (
        serverId varchar(20) not null,
        settings json not null,
        setUpAt bigint default null,
        updatedAt bigint not null,
        updatedBy varchar(20) default null,
        primary key (serverId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
