import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`): what is kept of the
 * meetups held for the moderators, so that a press on a moderators' post still works after a
 * restart. Servers and members are snowflakes without a foreign key (as the party history's):
 * a kick and a new invite neither delete nor split them. Times are epoch milliseconds.
 *
 * - `MeetupRequest`: a meetup its maker asked for at a place that needs a moderator's approval,
 *   by a UUID (in the custom ids of its post): the server, the region channel it was asked in,
 *   the maker (id, display name and team when they asked), the place as it was named (`place`,
 *   JSON: a gym, PokéStop or power spot as a snapshot, or a pin), the meetup's name, start and
 *   description, when it was made and expires, its `status` (`pending`, `approved`, `refused`,
 *   `expired`, `failed`, `withdrawn`), the moderators' post (`channelId`, `messageId`: it is
 *   sent first), what was decided (`decision`: `approve`, `approve-once`, `refuse`,
 *   `refuse-forever`, `block`), by whom and when, and the meetup an approval made (`partyId`).
 * - `MeetupPlaceRuling`: a server's ruling of a gym, PokéStop or power spot (`placeKind`,
 *   `placeId`: a gym's number as text, a Wayspot's Wayfarer id), `allow` or `refuse`, for good;
 *   one per server and place, the later in place of the earlier. Pins have none.
 * - `MeetupBlock`: a member blocked from making meetups in a server, one row per server and
 *   member; a lifted block keeps who lifted it (`liftedBy`, `liftedByName`) and when until the
 *   member is blocked again: only the last lift is kept.
 * - `MeetupAppeal`: a blocked member's appeal (`text`), `open`, `lifted`, `kept` or `expired`,
 *   with its post and who decided. `openKey` (`<server> <member>` while open, null once decided) is
 *   unique: one open appeal per member and server.
 *
 * 019: after 8H's `018_party_history`; renumbered at the merge if another branch took it first.
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing.
 */
export const meetupSafety: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists MeetupRequest (
        id char(36) not null,
        serverId varchar(30) not null,
        regionChannelId varchar(30) not null,
        makerId varchar(30) not null,
        makerName varchar(100) default null,
        makerTeam varchar(10) default null,
        place json not null,
        name varchar(100) not null,
        startTime bigint not null,
        description text not null,
        createdAt bigint not null,
        expiresAt bigint not null,
        status varchar(10) not null,
        channelId varchar(30) not null,
        messageId varchar(30) not null,
        decision varchar(16) default null,
        decidedBy varchar(30) default null,
        decidedByName varchar(100) default null,
        decidedAt bigint default null,
        partyId char(36) default null,
        primary key (id),
        key meetuprequest_status_expiresat_index (status, expiresAt),
        key meetuprequest_maker_index (serverId, makerId, status)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists MeetupPlaceRuling (
        serverId varchar(30) not null,
        placeKind varchar(10) not null,
        placeId varchar(64) not null,
        ruling varchar(8) not null,
        ruledBy varchar(30) not null,
        ruledAt bigint not null,
        primary key (serverId, placeKind, placeId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists MeetupBlock (
        serverId varchar(30) not null,
        memberId varchar(30) not null,
        blockedBy varchar(30) not null,
        blockedByName varchar(100) default null,
        blockedAt bigint not null,
        liftedBy varchar(30) default null,
        liftedByName varchar(100) default null,
        liftedAt bigint default null,
        primary key (serverId, memberId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists MeetupAppeal (
        id char(36) not null,
        serverId varchar(30) not null,
        memberId varchar(30) not null,
        memberName varchar(100) default null,
        text text not null,
        createdAt bigint not null,
        status varchar(8) not null,
        openKey varchar(64) default null,
        channelId varchar(30) default null,
        messageId varchar(30) default null,
        decidedBy varchar(30) default null,
        decidedByName varchar(100) default null,
        decidedAt bigint default null,
        primary key (id),
        unique key meetupappeal_openkey_unique (openKey),
        key meetupappeal_member_index (serverId, memberId, status)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
