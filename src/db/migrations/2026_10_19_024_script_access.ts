import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Who may have the Pine Wayspot export tool (plan 8W-P): one row per member who asked
 * for it on the owner's instance, or the owner's own.
 *
 * `ScriptAccess`: `id` (counted), `userId` (unique: one row per member), `name` (the member's
 * Discord name when they asked), `community` (their line, cut to 200 code points), `state`
 * (`asked`, `approved`, `refused`, `revoked`), `key` (64 hex digits of 32 random bytes, only
 * while approved; unique, and compared byte for byte: `ascii_bin`, since the default collation
 * ignores case), `askedAt`, `decidedAt`, `lastFetchAt` and `lastVersion` (the last fetch of the
 * tool with the key, and the version it was given). Times are epoch milliseconds; members are
 * snowflakes without a foreign key, as in 019 and 022.
 *
 * 024: after 8S-4's `023_meetup_request_failure`; renumbered at the merge if another branch took
 * it first.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const scriptAccess: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ScriptAccess (
        id int unsigned not null auto_increment,
        userId varchar(30) not null,
        name varchar(100) not null,
        community varchar(200) not null,
        state varchar(10) not null,
        \`key\` varchar(64) character set ascii collate ascii_bin default null,
        askedAt bigint not null,
        decidedAt bigint default null,
        lastFetchAt bigint default null,
        lastVersion varchar(40) default null,
        primary key (id),
        unique key scriptaccess_userid_unique (userId),
        unique key scriptaccess_key_unique (\`key\`),
        key scriptaccess_state_index (state)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
