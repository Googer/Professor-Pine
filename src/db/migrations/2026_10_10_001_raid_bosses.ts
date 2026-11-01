import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The raid boss list (spec section 6.7).
 *
 * `RaidBoss` holds what the feed lists: one row per Pokémon and tier, kept with `active = 0`
 * once the feed drops it. `RaidBossOverride` holds what moderators change. In both, `form` is
 * `''` for a Pokémon without one, so that the unique key works, and times are epoch
 * milliseconds.
 *
 * MySQL commits each statement of a migration by itself, so the statements are written to be
 * safe to run again after a failure half-way.
 */
export const raidBosses: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists RaidBoss (
        id int unsigned not null auto_increment,
        pokemonId varchar(64) not null,
        form varchar(64) not null default '',
        level varchar(16) not null,
        shadow tinyint(1) not null default 0,
        shiny tinyint(1) not null default 0,
        name varchar(100) not null,
        firstSeen bigint not null,
        lastSeen bigint not null,
        active tinyint(1) not null default 1,
        primary key (id),
        unique key raidboss_identity_unique (pokemonId, form, level, shadow)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists RaidBossOverride (
        id int unsigned not null auto_increment,
        pokemonId varchar(64) not null,
        form varchar(64) not null default '',
        level varchar(16) default null,
        shadow tinyint(1) not null default 0,
        action varchar(16) not null,
        shiny tinyint(1) default null,
        expiresAt bigint default null,
        createdBy varchar(30) not null,
        createdAt bigint not null,
        primary key (id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the tables stay.
  },
};
