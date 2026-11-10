import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Parties on forums (spec sections 5.1 and 5.5).
 *
 * `Party` holds one row per raid, train or meetup. What the scheduler and the duplicate check
 * search by has its own column; everything else a party knows (attendees, groups, boss, moves)
 * is the JSON document `state`, which only `PartyRepository` reads and writes. Times are epoch
 * milliseconds. New snowflake columns are `varchar(30)` like `Guild.snowflake`, so they are
 * strings in SQL as well as in code; never compare one with the BIGINT `Region.channelId` in SQL.
 *
 * `Region` gains the forum that holds the region's party posts and the pinned summary post in it.
 * One forum holds the posts of one region, so the forum column is unique (regions without a forum
 * all have null, which a unique key allows).
 *
 * MySQL commits each statement of a migration by itself, so the statements are written to be
 * safe to run again after a failure half-way.
 */
export const parties: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists Party (
        id char(36) not null,
        guildId int unsigned not null,
        type varchar(16) not null,
        status varchar(16) not null default 'active',
        regionId int unsigned default null,
        gymId int unsigned default null,
        forumChannelId varchar(30) default null,
        forumPostId varchar(30) default null,
        regionLinkMessageId varchar(30) default null,
        mirrorMessages json not null,
        createdById varchar(30) not null,
        hatchTime bigint default null,
        endTime bigint default null,
        lastPossibleTime bigint default null,
        deletionTime bigint default null,
        saved tinyint(1) not null default 0,
        state json not null,
        createdAt bigint not null,
        updatedAt bigint not null,
        primary key (id),
        unique key party_forumpostid_unique (forumPostId),
        key party_status_deletiontime_index (status, deletionTime),
        key party_gymid_status_index (gymId, status),
        constraint party_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade,
        constraint party_regionid_foreign foreign key (regionId) references Region (id)
          on delete set null,
        constraint party_gymid_foreign foreign key (gymId) references Gym (id)
          on delete set null
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

    for (const column of ['forumChannelId', 'summaryMessageId']) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'Region' and column_name = ${column}`.execute(
        db,
      );
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table Region add column ${sql.ref(column)}
          varchar(30) character set utf8mb4 collate utf8mb4_0900_ai_ci default null`.execute(db);
      }
    }

    const index = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'Region'
        and index_name = 'region_forumchannelid_unique'`.execute(db);
    if (Number(index.rows[0]?.n ?? 0) === 0) {
      await sql`alter table Region add unique key region_forumchannelid_unique (forumChannelId)`.execute(
        db,
      );
    }
  },
  async down() {
    // Additive only: the table and the columns stay.
  },
};
