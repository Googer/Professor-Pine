import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The events forum (plan 8V-1; design `2026-10-28-events-forum-design.md`):
 *
 * - `EventForum`: one row per server with an events forum (`settings.channels.events`), made or
 *   found by `/admin setup-forums`: the server's snowflake, the forum's, and the listing post's
 *   ("Events"; null until made, or after the forum changed).
 * - `EventPost`: one row per event and server that got a post, unique on the two: the feed's
 *   `eventId` (varchar(200) as `MaxEvent.eventId`; a moved event's row takes the new id), the
 *   post's snowflake, the name and times it was drawn with (epoch milliseconds), when its
 *   auto-archive was set to a day after the end (`endedAt`), when Pine archived it (`archivedAt`:
 *   the upkeep three days after the end, or a drop), whether the event was dropped before its
 *   start (`dropped`), and whether a moderator deleted the post (`gone`: never made again).
 * - `ListedEvent`: the listed events as `RaidEventService` last merged them, replaced whole after
 *   each read (as `MaxEvent`): the feed's id, type, name, Leek Duck link and picture, start and
 *   end, and the ids it was listed under before it moved (`formerIds`, JSON, null for none).
 *
 * Snowflakes are strings (varchar(30)). Safe to run again after a failure half-way: a table is
 * made only when it is missing.
 */
export const eventsForum: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists EventForum (
        serverId varchar(30) not null,
        forumId varchar(30) not null,
        listingPostId varchar(30) null,
        primary key (serverId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists EventPost (
        id int unsigned not null auto_increment,
        serverId varchar(30) not null,
        eventId varchar(200) not null,
        postId varchar(30) not null,
        name varchar(100) not null,
        startsAt bigint not null,
        endsAt bigint not null,
        endedAt bigint null,
        archivedAt bigint null,
        dropped tinyint(1) not null default 0,
        gone tinyint(1) not null default 0,
        primary key (id),
        unique key eventpost_event_unique (serverId, eventId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists ListedEvent (
        id int unsigned not null auto_increment,
        eventId varchar(200) not null,
        eventType varchar(40) not null,
        name varchar(100) not null,
        link varchar(500) null,
        image varchar(500) null,
        startsAt bigint not null,
        endsAt bigint not null,
        formerIds json null,
        primary key (id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
