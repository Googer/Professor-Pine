import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Fairness between servers (plan 19B-5; spec "Fairness and limits"): the members Pine has
 * written to before, and Google's month counted and raised per server.
 *
 * - `DmContact`: a row per Discord user (by snowflake, no foreign key) with when the first direct
 *   message to them went out (`firstAt`, epoch ms). Discord limits how many new DM channels a bot
 *   opens, for the whole bot; the queue caps each server's messages to members without a row
 *   (`QueuedDmSender`, `dms.firstContactsPerWindow`). The instance's: one row per member
 *   whichever server the message was of. Read and written only by the primary key
 *   (`DmContactRepository`). The table starts empty: who was written to before it was made is not
 *   known, so every member's first message after the upgrade counts as a first, which the cap's
 *   defaults never hold back.
 * - `GoogleUseServerDay`: what each server asked of Google per Pacific day and kind (`places`,
 *   `geocode` of the line's questions about its rows, `hand` its lookups by hand, `map` its maps
 *   of `/find-region`), beside the instance's `GoogleUseDay` (`GoogleUseRepository`): a server's
 *   month is read by the primary key `(guildId, day, kind)`, every server's by
 *   `googleuseserverday_day_kind_index` (`day`, `kind`): all its kinds by the day (the shares'
 *   readings), one kind by the day and the kind (the floors of lookups by hand and of maps).
 *   Goes with its server.
 * - `GoogleShareRaise`: what an instance operator added to a server's share of a month
 *   (`/operator google share`; `month` is its first day, `YYYY-MM-01` Pacific), read by the
 *   primary key `(month, guildId)`. Goes with its server.
 * - `servergymlookup_guildid_address_index` on `ServerGymLookup` (`guildId`, `address`): each
 *   server's need (its rows, and of them those that wait for an address) counted along an index
 *   that leads with the server, and a server's rows read to rank them anew when its share is used
 *   or raised (`GymLookupRepository.needs`, `ofServer`). `ServerWayspotLookup`'s primary key
 *   leads with the server already.
 *
 * Safe to run again after a failure half-way: the tables and the index are made only when they
 * are missing.
 */
export const dmContacts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists DmContact (
        userId varchar(30) not null,
        firstAt bigint not null,
        primary key (userId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GoogleUseServerDay (
        guildId int unsigned not null,
        day char(10) not null,
        kind varchar(8) not null,
        questions int unsigned not null default 0,
        primary key (guildId, day, kind),
        key googleuseserverday_day_kind_index (day, kind),
        constraint googleuseserverday_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists GoogleShareRaise (
        month char(10) not null,
        guildId int unsigned not null,
        extra int unsigned not null,
        raisedAt bigint not null,
        primary key (month, guildId),
        constraint googleshareraise_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    const found = await sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'ServerGymLookup'
        and index_name = 'servergymlookup_guildid_address_index'`.execute(db);
    if (Number(found.rows[0]?.n ?? 0) === 0) {
      await sql`create index servergymlookup_guildid_address_index
        on ServerGymLookup (guildId, address)`.execute(db);
    }
  },
  async down() {
    // Additive only: the tables and the index stay.
  },
};
