import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** A column this migration adds to `ServerRecord`. */
const COLUMNS: readonly { name: string; definition: string }[] = [
  { name: 'deletingAt', definition: 'bigint default null' },
  { name: 'deletedAt', definition: 'bigint default null' },
  { name: 'filesLeftAt', definition: 'bigint default null' },
];

/** An index this migration adds: the table, the index's name, its columns in order. */
const ADDED: readonly { table: string; name: string; columns: readonly string[] }[] = [
  { table: 'StopPost', name: 'stoppost_server_index', columns: ['serverId'] },
  { table: 'GruntMessage', name: 'gruntmessage_server_index', columns: ['serverId'] },
  { table: 'EndedPartyCopy', name: 'endedpartycopy_regionid_index', columns: ['regionId'] },
];

/**
 * The deletion of a server Pine left more than 30 days ago (plan 19C-3; spec
 * `2026-11-12-multi-server-instance-design.md`, "Leaving"; `ServerDataRepository`):
 *
 * - `ServerRecord.deletingAt`: set before the first of the server's rows is deleted and kept until
 *   the last, so that a deletion a failure or a restart cut short is taken up again (at the next
 *   sweep, or then and there when the server adds Pine back meanwhile); null otherwise.
 * - `ServerRecord.deletedAt`: when the database part of the deletion ended (`deletingAt` cleared
 *   in the same write). Kept for good, also when the server adds Pine back: once its data is
 *   deleted, a server is new to this Pine's settings whatever its record
 *   (`ServerStandings.setUpOnRecord`), and starts in setup. The record itself stays: an
 *   allowance or a block outlives the data, and a new install's adoption window stays closed
 *   once a row held `recordedAt` (plan 19C-1).
 * - `ServerRecord.filesLeftAt`: the kept screenshots of the deletion that ended then (the end's
 *   time: those read up to it are the server's before) could not all be removed; tried again at
 *   each sweep until they are, and cleared then. Null otherwise. Files left never hold the
 *   record: `deletedAt` is written once the database part is done.
 * - The indexes a deletion by server reads that were missing: `StopPost (serverId)` (its key is
 *   `(channelId, day)`), `GruntMessage (serverId)` (its keys are the message, the report and the
 *   time), and `EndedPartyCopy (regionId)` (a copy names its region or its channel, never its
 *   server: the deletion takes those of the server's regions). The reasons of a report need none:
 *   `moderationreportreason_report_reporter_unique (reportId, reporterId)` leads with the report.
 *
 * Additive only. Safe to run again after a failure half-way: each column and each index is added
 * only when it is missing.
 */
export const serverDeletion: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const column of COLUMNS) {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'ServerRecord'
          and column_name = ${column.name}`.execute(db);
      if (Number(found.rows[0]?.n ?? 0) > 0) continue;
      // The definition is this file's own constant text, never a value from outside.
      await sql`alter table ServerRecord add column ${sql.ref(column.name)} ${sql.raw(
        column.definition,
      )}`.execute(db);
    }
    for (const index of ADDED) {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.statistics
        where table_schema = database() and table_name = ${index.table}
          and index_name = ${index.name}`.execute(db);
      if (Number(found.rows[0]?.n ?? 0) > 0) continue;
      const key = sql.join(index.columns.map((column) => sql.ref(column)));
      await sql`create index ${sql.ref(index.name)} on ${sql.table(index.table)} (${key})`.execute(
        db,
      );
    }
  },
  async down() {
    // Additive only: the columns and the indexes stay.
  },
};
