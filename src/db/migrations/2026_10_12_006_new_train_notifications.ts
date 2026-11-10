import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * "Tell me of new trains" per server (plan 4B; Matt, 2026-10-12).
 *
 * The legacy bot kept this as one flag of a member, `User.newTrain`, and told a member of the
 * trains of every server they were in. The new bot keeps it per member and server, like the
 * wants: `NewTrainNotification` holds one row for each server a member asked for. `guildId` is
 * the row of the server (`Guild.id`), so the rows of a server the bot left go with it; the
 * member is a snowflake, `varchar(30)` as in `Party`.
 *
 * Everybody who has the legacy flag on gets a row for every server the bot knows: that is what
 * the flag meant (every server; whether a member is in one is found out when a train is made).
 * The legacy column stays as it is, for the legacy bot; the new bot neither reads nor writes
 * it from here on.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing,
 * and a row that exists is left as it is.
 */
export const newTrainNotifications: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists NewTrainNotification (
        guildId int unsigned not null,
        memberId varchar(30) not null,
        createdAt bigint not null,
        primary key (guildId, memberId),
        constraint newtrainnotification_guildid_foreign foreign key (guildId)
          references Guild (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      insert into NewTrainNotification (guildId, memberId, createdAt)
      select g.id, u.userSnowflake, ${String(Date.now())}
      from User u cross join Guild g
      where u.newTrain = 1 and u.userSnowflake is not null
      on duplicate key update memberId = NewTrainNotification.memberId`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
