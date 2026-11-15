import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The record of each server with the instance (plan 19C-1; spec
 * `2026-11-12-multi-server-instance-design.md`, "Joining, the setup state, leaving";
 * `ServerRecordRepository`): one row per Discord server, keyed by its snowflake (`serverId`,
 * not the `Guild` row: the row outlives a server Pine leaves). Each column is a fact of its own,
 * null where it does not hold:
 *
 * - `recordedAt`: the server was recorded at the upgrade to 2.1 (it had a `Guild` row then), or
 *   adopted by a new install at its first start (`ServerAdoption`), which allows it (`mayHave`,
 *   `src/domain/operators/admission.ts`);
 * - `allowedAt`, `allowedBy`: an instance operator allowed it (`/operator servers allow`);
 * - `blockedAt`, `blockedBy`: an instance operator blocked it, which wins over every allowance;
 * - `leftAt`: Pine left it (removed by its staff, or by an operator): nothing is posted or sent
 *   for it, and nothing of it is deleted yet (plan 19C-3 deletes it after 30 days).
 *
 * A server that joined after the upgrade has a row only once one of these holds. Every read is a
 * whole read at the start (`ServerStandings.load`: one row per server, bounded small by nature)
 * or by the primary key, but the look of `/operator forget` (`MemberDataRepository`), which counts
 * what an instance operator did by `serverrecord_allowedby_index` and
 * `serverrecord_blockedby_index` (as migration 057 indexes every column that names a staff
 * member).
 *
 * At the upgrade every server of a `Guild` row is recorded, and only while the table is empty
 * (made now, or a copy that failed before): a server Pine joins later is allowed by the file's
 * `servers`, or an operator, never by having been there. A new install records none here: while
 * no server was ever recorded and the file lists none, it adopts the servers present at its first
 * start (or the first that adds it), once (`ServerStandings.adopting`).
 *
 * Safe to run again after a failure half-way: the table is made only when missing (with its
 * indexes, in one statement), and the copy is one statement.
 */
export const serverRecord: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ServerRecord (
        serverId varchar(20) not null,
        recordedAt bigint default null,
        allowedAt bigint default null,
        allowedBy varchar(20) default null,
        blockedAt bigint default null,
        blockedBy varchar(20) default null,
        leftAt bigint default null,
        primary key (serverId),
        key serverrecord_allowedby_index (allowedBy),
        key serverrecord_blockedby_index (blockedBy)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    // Empty unless the copy below went through already (a run again after a failure later on).
    const held = await sql<{ n: number }>`
      select count(*) as n from (select 1 from ServerRecord limit 1) as one`.execute(db);
    if (Number(held.rows[0]?.n ?? 0) > 0) return;
    // A whole read of `Guild`: one row per server, bounded small by nature. Only snowflakes: a
    // legacy row of anything else (none is known) is no server Discord can name.
    await sql`
      insert into ServerRecord (serverId, recordedAt)
      select snowflake, ${Date.now()} from Guild
      where snowflake regexp '^[0-9]{17,20}$'`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
