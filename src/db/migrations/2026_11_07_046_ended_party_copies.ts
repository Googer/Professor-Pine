import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * What an ended party left on Discord that is not known to be deleted (follow-ups, Phases 2E-1
 * and 3C; 2026-11-07): `EndedPartyCopy`, a row per message, written with the party's end in the
 * same transaction, so that a stop between the end and its closing, or a closing the network
 * failed and a restart forgot, still has the copies deleted by the upkeep's sweep. `channelId`
 * is the channel of a copy (the remote and elite raid channels, a region's channel for a train,
 * the post for `/status`'s); the line that linked to the party in its region's channel has none
 * and names its region (`regionId`, no foreign key: a region that is gone leaves nothing to
 * delete). `partyId` is the ended party's (its row is deleted once it is recorded); `endedAt`
 * when it ended. A row goes once the message is deleted, gone, or refused for good.
 *
 * 046: after the two `044`s of other branches of 2026-11-07, whichever is merged first.
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const endedPartyCopies: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists EndedPartyCopy (
        messageId varchar(30) not null,
        channelId varchar(30) default null,
        regionId int unsigned default null,
        partyId char(36) not null,
        endedAt bigint not null,
        primary key (messageId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
