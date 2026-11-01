import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Reports at stops (plan 8R-1; design `2026-10-21-stop-reports-design.md`, sections 3, 4, 6, 7
 * and 9): one migration for the whole plan. Servers and members are snowflakes without a foreign
 * key, as in 019 and 022, but where a table hangs on a member's rows of a server as the wants do
 * (`TargetWant`, under `withMemberLocked`), which keeps the rows of `User` and `Guild`. Times are
 * epoch milliseconds.
 *
 * - `PineStop`: the PokéStops of Pine's own (sponsored ones, which Wayfarer lacks), per server:
 *   `serverId`, the name, the point, the address (null for none), who made and last changed it.
 *   Its key elsewhere is `pine-<id>`.
 * - `StopReport`: what a member reported at a stop, of a `kind` (`research`; `rocket` for plan
 *   8R-2's hideouts), in a research period (`periodKey`: `day:<date>`, `event:<eventID>` or
 *   `event:<eventID>:<date>`), until `endsAt`; one per server, stop, kind and period (the unique
 *   key: the latest replaces the earlier). The stop as it was when reported (`stopName`,
 *   `stopAddress`, `stopImage`, `lat`, `lon`: a report still shows a stop renamed or removed
 *   later that day); `subjectKey` is what the report is of (a task's key; a typed task's
 *   `typed:<key>`), `detail` the rest as JSON (the task's text, category and rewards as they were);
 *   the reporter by id and name. Indexed by server and end for the post and the sweep.
 * - `ResearchEvent`: the events of ScrapedDuck's feed with field research of their own, as last
 *   seen (`eventId` is the feed's `eventID`; start and end; its `eventType`, which says whether
 *   its days have hours of their own), so that a restart, or an event the feed dropped once it
 *   ended, cannot lose a period.
 * - `StopPost`: the pinned "Today at the stops" post of a region channel and a local day: its
 *   message ids in order (JSON), and the server.
 * - `TargetWant`: the wants that are no `PokemonNotification` row (design 9.1: research rewards,
 *   the Dynamax and Gigantamax boxes; 8R-2's Rocket targets): `guildId` and `userId` are the rows
 *   of `Guild` and `User`, as `PokemonNotification`'s, with their foreign keys; `target` the
 *   token (`research:pokemon:147`). Unique per server, member and token (the dialog's read of one
 *   member's tokens of one target is that key), indexed by server and token (who wants what a
 *   report rewards).
 * - `ResearchTask`: the last good task list read from Leek Duck, as `RaidBoss` keeps the feed's
 *   bosses: a row per task (`taskKey`, the hash of its folded text), its text, category and
 *   rewards (JSON), its place on the page (`position`), when first and last read, and whether the
 *   last good read listed it.
 *
 * 027: written as 026 after 8X-3's `025_max_battle_history`; renumbered when typescript-migration
 * was merged in, as 8X-4's `026_train_spot_stops` took 026 first.
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing.
 */
export const stopReports: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PineStop (
        id int unsigned not null auto_increment,
        serverId varchar(30) not null,
        name varchar(255) not null,
        lat double not null,
        lon double not null,
        address varchar(255) null,
        createdBy varchar(30) not null,
        createdAt bigint not null,
        updatedBy varchar(30) not null,
        updatedAt bigint not null,
        primary key (id),
        key pinestop_server_index (serverId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists StopReport (
        id int unsigned not null auto_increment,
        serverId varchar(30) not null,
        stopKey varchar(45) not null,
        kind varchar(10) not null,
        periodKey varchar(220) not null,
        endsAt bigint not null,
        stopName varchar(255) not null,
        stopAddress varchar(255) null,
        stopImage varchar(255) null,
        lat double not null,
        lon double not null,
        subjectKey varchar(64) not null,
        detail json not null,
        reporterId varchar(30) not null,
        reporterName varchar(100) not null,
        madeAt bigint not null,
        primary key (id),
        unique key stopreport_identity_unique (serverId, stopKey, kind, periodKey),
        key stopreport_server_ends_index (serverId, endsAt),
        key stopreport_ends_index (endsAt)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists ResearchEvent (
        eventId varchar(200) not null,
        name varchar(100) not null,
        eventType varchar(40) not null,
        startsAt bigint not null,
        endsAt bigint not null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        primary key (eventId),
        key researchevent_ends_index (endsAt)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists StopPost (
        channelId varchar(30) not null,
        day varchar(10) not null,
        serverId varchar(30) not null,
        messageIds json not null,
        updatedAt bigint not null,
        primary key (channelId, day)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists TargetWant (
        id int unsigned not null auto_increment,
        guildId int unsigned not null,
        userId int unsigned not null,
        target varchar(100) not null,
        createdAt bigint not null,
        primary key (id),
        unique key targetwant_member_unique (guildId, userId, target),
        key targetwant_target_index (guildId, target),
        key targetwant_userid_foreign (userId),
        constraint targetwant_guildid_foreign foreign key (guildId)
          references Guild (id) on delete cascade,
        constraint targetwant_userid_foreign foreign key (userId)
          references User (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists ResearchTask (
        taskKey varchar(16) not null,
        text varchar(255) not null,
        category varchar(60) not null,
        rewards json not null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        active tinyint(1) not null default 1,
        position int not null default 0,
        primary key (taskKey)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
