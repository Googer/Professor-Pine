import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The max events kept across a restart (plan 8X-F; the staging of 8X: ScrapedDuck dropped the
 * 10-19 Max Monday within its week, and a restart then lost the week's featured boss).
 *
 * - `MaxEvent`: the max events (`kind` `max-monday` or `max-battle`) and the big events with
 *   Gigantamax battles all day (`kind` `big`) of the events feed, as `RaidEventService` last
 *   merged them: the feed's `eventID` (`eventId`, null for a max event without one), the name,
 *   start and end (epoch milliseconds), for a max event whether it is short and whether its hours
 *   were assumed, and what its name features (`featured`, JSON `{ gigantamax, names }`, null for
 *   nothing). The table is replaced whole after each read (`MaxEventRepository.replace`): which
 *   rows are one event is the service's merge (`sameMaxEvent`: the feed id, else kind, name and
 *   start), so no unique key refuses a feed that lists one id twice.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const maxEvents: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists MaxEvent (
        id int unsigned not null auto_increment,
        kind varchar(20) not null,
        eventId varchar(200) null,
        name varchar(100) not null,
        startsAt bigint not null,
        endsAt bigint not null,
        short tinyint(1) not null default 0,
        hoursAssumed tinyint(1) not null default 0,
        featured json null,
        primary key (id)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
