import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The staff's log of a server's settings (plan 19A-1; `ServerSettingsAuditRepository`): an entry
 * per setting a change in `/admin settings` (or `/admin setup-forums`' new events forum) changed,
 * written in the transaction that writes the server's values, kept 30 days. Its own table, since
 * `PartyAudit`'s entries belong to a party. `serverId` the server's snowflake (no foreign key, as
 * `ServerSettings`); `at` when (epoch ms); `actorId` and `actorName` the staff member who changed
 * it (every change has one); `key` the setting (`channels.moderation`, `features.roles`,
 * `flaggedWords`, `SettingChange`); `before` and `after` its values as stored, ids and not names
 * (null: unset). Keyed as migration 045 keys `PartyAudit`: a server's newest entries (the
 * panel's Recent changes), a member's in a server (`/audit member:`), and `at` for the 30 days'
 * sweep.
 *
 * Safe to run again after a failure half-way: the table is made only when missing.
 */
export const serverSettingsAudit: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ServerSettingsAudit (
        id bigint not null auto_increment,
        serverId varchar(20) not null,
        at bigint not null,
        actorId varchar(20) not null,
        actorName varchar(100) default null,
        \`key\` varchar(64) not null,
        \`before\` json default null,
        \`after\` json default null,
        primary key (id),
        key serversettingsaudit_server_at_index (serverId, at),
        key serversettingsaudit_actor_index (serverId, actorId, at),
        key serversettingsaudit_at_index (at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
