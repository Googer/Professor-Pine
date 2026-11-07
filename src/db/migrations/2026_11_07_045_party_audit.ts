import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The staff audit log of parties (`PartyAudit`; Matt, 2026-11-07): an entry per change of a
 * party that staff may ask about with `/audit` (`PartyAuditRepository`), kept 30 days. `serverId`
 * the server's snowflake (no foreign key, as the party history); `partyId` the party; `postId`
 * the post the party had when the entry was written (a party's first entries are written before
 * its post exists and get it once it does); `at` when; `actorId` and `actorName` who (null: Pine
 * itself, the clock or a feed); `action` what (`AuditEntry`, `src/domain/party/audit.ts`) and
 * `detail` its facts, worded when read. Keys for a party's entries, a post's parties, a member's
 * entries in a server, and the retention's deletion.
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const partyAudit: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PartyAudit (
        id bigint not null auto_increment,
        serverId varchar(30) not null,
        partyId char(36) not null,
        postId varchar(30) default null,
        at bigint not null,
        actorId varchar(30) default null,
        actorName varchar(100) default null,
        action varchar(16) not null,
        detail json default null,
        primary key (id),
        key partyaudit_party_index (partyId, at),
        key partyaudit_post_index (postId),
        key partyaudit_actor_index (serverId, actorId, at),
        key partyaudit_at_index (at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
