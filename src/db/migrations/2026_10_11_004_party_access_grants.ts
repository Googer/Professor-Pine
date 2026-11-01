import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Access for members of other regions (spec section 5.4).
 *
 * `PartyAccessGrant` holds one row per permission overwrite the bot put on a region's forum to
 * let a member in who signed up for a raid there and could not see the forum. The row is how the
 * bot knows which overwrites are its own: it takes back only those. A member has at most one
 * grant per forum. `guildId` is the row of the server (`Guild.id`), so the grants of a server the
 * bot left go with it; snowflakes are `varchar(30)` as in `Party`.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const partyAccessGrants: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PartyAccessGrant (
        forumChannelId varchar(30) not null,
        memberId varchar(30) not null,
        guildId int unsigned not null,
        createdAt bigint not null,
        primary key (forumChannelId, memberId),
        constraint partyaccessgrant_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
