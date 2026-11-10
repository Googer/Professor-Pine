import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Unown wants for holders of the old `unown` role (plan 4B).
 *
 * The legacy bot gave members who wanted Unown a role instead of a row in
 * `PokemonNotification`. The new bot gives such a member a want for Unown the first time it
 * sees them with that role, and `UnownWantGift` holds one row per member and server for whom
 * that was settled, so that it happens once: a member who then removes the want keeps it
 * removed. `guildId` is the row of the server (`Guild.id`), so the rows of a server the bot
 * left go with it; the member is a snowflake, `varchar(30)` as in `Party`.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const unownWantGifts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists UnownWantGift (
        guildId int unsigned not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (guildId, memberId),
        constraint unownwantgift_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
