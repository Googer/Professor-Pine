import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Gyms from Wayfarer (plan 8W-1): what an import of the userscript's file keeps.
 *
 * `GymWayfarer` holds what Pine knows of a gym's Wayspot beside the legacy `Gym` row (which
 * keeps the Wayfarer id in `pogoId`): when an import last saw it, and whether staff said it is
 * not in Wayfarer at all (a sponsored gym), by whom and when.
 *
 * `WayspotImport` is one row per import: the server (its row, `Guild.id`), the staff member
 * (snowflake), when it ran, the times the file says it was made in, and what it did (`counts`, a
 * JSON object of numbers).
 *
 * `GymReview` is the review queue: one row per question about a gym (`kind`: match, missing,
 * unknown), with the Wayspots offered as they were in the file (`candidates`, a JSON array) and
 * the gym's `pogoId` when it was queued (`gymPogoId`: an answer is refused once it differs).
 * `openGymId` is the gym while the item is open and null once it is decided, so the unique key
 * on (`guildId`, `openGymId`) allows one open item per gym and server and any number of closed
 * ones. The queue is read by `queuedAt` within a server. Rows go with their server and their
 * gym; an import that is gone leaves its items without one.
 *
 * Times are epoch milliseconds; snowflakes are `varchar(30)` as in `Party`. Safe to run again
 * after a failure half-way: each table is created only when it is missing.
 */
export const wayfarer: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists GymWayfarer (
        gymId int unsigned not null,
        lastSeen bigint null,
        notInWayfarer tinyint(1) not null default 0,
        notInWayfarerBy varchar(30) null,
        notInWayfarerAt bigint null,
        primary key (gymId),
        constraint gymwayfarer_gymid_foreign foreign key (gymId) references Gym (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists WayspotImport (
        id int unsigned not null auto_increment,
        guildId int unsigned not null,
        staffId varchar(30) not null,
        importedAt bigint not null,
        startedAt bigint null,
        finishedAt bigint null,
        counts json not null,
        primary key (id),
        key wayspotimport_guildid_importedat_index (guildId, importedAt),
        constraint wayspotimport_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GymReview (
        id int unsigned not null auto_increment,
        guildId int unsigned not null,
        gymId int unsigned not null,
        openGymId int unsigned null,
        kind varchar(10) not null,
        candidates json not null,
        gymPogoId varchar(255) null,
        importId int unsigned null,
        createdAt bigint not null,
        queuedAt bigint not null,
        decidedAt bigint null,
        decidedBy varchar(30) null,
        decision varchar(20) null,
        primary key (id),
        unique key gymreview_guildid_opengymid_unique (guildId, openGymId),
        key gymreview_guildid_queuedat_index (guildId, queuedAt),
        constraint gymreview_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade,
        constraint gymreview_gymid_foreign foreign key (gymId) references Gym (id)
          on delete cascade,
        constraint gymreview_importid_foreign foreign key (importId) references WayspotImport (id)
          on delete set null
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the tables stay.
  },
};
