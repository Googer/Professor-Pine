import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The party history (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): a row
 * for every party that ended, in tables that plain SQL can count and group, beside the live
 * `Party` table, which stays as it is.
 *
 * - `PartyHistory`: one row per ended party, of the live bot (`source` `live`, `partyId` the
 *   `Party.id`, unique) or imported from the legacy bot's files (`source` `legacy`, `legacyKey`
 *   unique: `<channel id>:<creation time>`). What it was (`kind`, `tier`, the boss), where
 *   (`serverId`, `regionId`, `gymId`), when (`createdAt`, `hatchTime`, `startTime`, `endTime`,
 *   `endedAt`, epoch milliseconds), how it ended (`ending`), and the counts of its attendees by
 *   the furthest status each reached. `createdById` and `conductorId` hold a member only with
 *   their opt-in (`HistoryOptIn`). The server is its snowflake, and region and gym carry no
 *   foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither
 *   delete nor split it; Matt, 2026-10-16) and keeps a region or gym that is deleted later.
 * - `PartyHistoryAttendee`: a row per member who signed up (`seq` in the order they did),
 *   whether or not they stayed; `memberId` only with their opt-in, otherwise null.
 * - `PartyHistoryGroup`: a row per group of the party.
 * - `PartyHistoryStop`: a row per stop a train made, in the order it made them.
 * - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key, like the history)
 *   who asked for their id to be kept (`/settings history`).
 * - `PartyHistoryStep`: what happened to a party while it is active (a member's status, a member
 *   leaving, a train's stop, a group's meeting time, the party it moved from), which the live
 *   model does not keep; read into the party's history when it ends, then deleted. It goes with
 *   its `Party` row.
 * - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its
 *   history was written (the row holds the ids of its maker and members; Matt, 2026-10-16), for
 *   what still reads them: the hourly archiving of reopened posts and the forums parties named.
 *   No member and no party id; it goes with the server's `Guild` row, as `Party` rows do.
 *
 * 018: after 8W-2's `017_wayspot`, which is merged first (the migrator refuses a migration
 * that sorts before one that has run); 016 stays unused.
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing.
 */
export const partyHistory: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PartyHistory (
        id int unsigned not null auto_increment,
        source varchar(8) not null,
        partyId char(36) default null,
        legacyKey varchar(64) default null,
        kind varchar(8) not null,
        serverId varchar(30) not null,
        regionId int unsigned default null,
        gymId int unsigned default null,
        legacyGymId int unsigned default null,
        name varchar(100) default null,
        description text default null,
        tier varchar(16) default null,
        shadow tinyint(1) not null default 0,
        mega tinyint(1) not null default 0,
        elite tinyint(1) not null default 0,
        ex tinyint(1) not null default 0,
        shiny tinyint(1) default null,
        bossKey varchar(64) default null,
        bossDex smallint unsigned default null,
        bossSpecies varchar(64) default null,
        bossForm varchar(64) default null,
        bossName varchar(100) default null,
        fastMove varchar(64) default null,
        chargedMove varchar(64) default null,
        createdAt bigint not null,
        hatchTime bigint default null,
        startTime bigint default null,
        endTime bigint default null,
        endedAt bigint default null,
        ending varchar(10) not null,
        createdById varchar(30) default null,
        conductorId varchar(30) default null,
        anonymous tinyint(1) not null default 0,
        routeStops smallint unsigned default null,
        attendees smallint unsigned not null default 0,
        interested smallint unsigned not null default 0,
        joined smallint unsigned not null default 0,
        here smallint unsigned not null default 0,
        done smallint unsigned not null default 0,
        interestedHeads smallint unsigned not null default 0,
        joinedHeads smallint unsigned not null default 0,
        hereHeads smallint unsigned not null default 0,
        doneHeads smallint unsigned not null default 0,
        extras smallint unsigned not null default 0,
        remote smallint unsigned not null default 0,
        departed smallint unsigned not null default 0,
        primary key (id),
        unique key partyhistory_partyid_unique (partyId),
        unique key partyhistory_legacykey_unique (legacyKey),
        key partyhistory_server_kind_createdat_index (serverId, kind, createdAt),
        key partyhistory_gymid_index (gymId),
        key partyhistory_regionid_index (regionId),
        key partyhistory_bosskey_index (bossKey),
        key partyhistory_createdbyid_index (createdById),
        key partyhistory_conductorid_index (conductorId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists PartyHistoryAttendee (
        historyId int unsigned not null,
        seq smallint unsigned not null,
        memberId varchar(30) default null,
        status varchar(10) default null,
        furthest varchar(10) not null,
        groupId char(1) default null,
        extras tinyint unsigned not null default 0,
        remote tinyint(1) not null default 0,
        team varchar(8) default null,
        signedUpAt bigint default null,
        joinedAt bigint default null,
        hereAt bigint default null,
        doneAt bigint default null,
        leftAt bigint default null,
        primary key (historyId, seq),
        key partyhistoryattendee_memberid_index (memberId),
        constraint partyhistoryattendee_historyid_foreign foreign key (historyId)
          references PartyHistory (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists PartyHistoryGroup (
        historyId int unsigned not null,
        groupId char(1) not null,
        label varchar(100) default null,
        meetingTime bigint default null,
        members smallint unsigned not null default 0,
        heads smallint unsigned not null default 0,
        primary key (historyId, groupId),
        constraint partyhistorygroup_historyid_foreign foreign key (historyId)
          references PartyHistory (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists PartyHistoryStop (
        historyId int unsigned not null,
        seq smallint unsigned not null,
        gymId int unsigned default null,
        legacyGymId int unsigned default null,
        arrivedAt bigint default null,
        leftAt bigint default null,
        primary key (historyId, seq),
        key partyhistorystop_gymid_index (gymId),
        constraint partyhistorystop_historyid_foreign foreign key (historyId)
          references PartyHistory (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists HistoryOptIn (
        serverId varchar(30) not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (serverId, memberId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists PartyHistoryStep (
        id bigint unsigned not null auto_increment,
        partyId char(36) not null,
        at bigint not null,
        kind varchar(8) not null,
        subject varchar(36) not null,
        value bigint default null,
        primary key (id),
        key partyhistorystep_partyid_at_index (partyId, at),
        key partyhistorystep_kind_subject_index (kind, subject),
        constraint partyhistorystep_partyid_foreign foreign key (partyId) references Party (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists EndedPartyPost (
        forumPostId varchar(30) not null,
        forumChannelId varchar(30) not null,
        guildId int unsigned not null,
        endedAt bigint not null,
        primary key (forumPostId),
        key endedpartypost_guildid_forumchannelid_index (guildId, forumChannelId),
        constraint endedpartypost_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
