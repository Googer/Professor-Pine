import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The sessions of the web pages (plan 8M-1; spec `2026-10-15-web-map-region-editor-design`,
 * 2.4): a member who logged in with Discord or through a link of `/maps` is known by a cookie.
 *
 * `WebSession` is one row per session: its `id` is the hex SHA-256 of the cookie's value (the
 * value itself is never stored), `userId` the member's snowflake, `userName` their name when
 * they logged in (the page's header). Times are epoch milliseconds: a session lasts 30 days
 * from `lastUsedAt` (`expiresAt`), renewed at most hourly; the hourly upkeep deletes expired
 * rows (by `expiresAt`). Nothing else refers to a session.
 *
 * 015: this plan's (014 is 8W-1R's); renumbered at a merge if another branch took it first.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const webSession: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists WebSession (
        id char(64) not null,
        userId varchar(30) not null,
        userName varchar(100) not null,
        createdAt bigint not null,
        lastUsedAt bigint not null,
        expiresAt bigint not null,
        primary key (id),
        key websession_expiresat_index (expiresAt),
        key websession_userid_index (userId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
