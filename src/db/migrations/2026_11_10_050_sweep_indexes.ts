import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** The indexes this migration adds: the table, the index's name, its columns in order. */
const ADDED: readonly { table: string; name: string; columns: readonly string[] }[] = [
  { table: 'User', name: 'user_nickname_index', columns: ['nickname'] },
  {
    table: 'ModerationReport',
    name: 'moderationreport_status_createdat_index',
    columns: ['status', 'createdAt'],
  },
  {
    table: 'MeetupAppeal',
    name: 'meetupappeal_status_createdat_index',
    columns: ['status', 'createdAt'],
  },
  {
    table: 'MeetupPlaceAsk',
    name: 'meetupplaceask_status_createdat_index',
    columns: ['status', 'createdAt'],
  },
  {
    table: 'MeetupRequest',
    name: 'meetuprequest_stranded_index',
    columns: ['status', 'partyId', 'decidedAt'],
  },
];

/**
 * Indexes for five reads that had none (plan 8Z-2, the audit of 2026-11-10):
 *
 * - `User (nickname)`: `/nickname find` asks who registered an in-game name
 *   (`UserRepository.withNickname`) and read every member's row for it.
 * - `ModerationReport`, `MeetupAppeal` and `MeetupPlaceAsk (status, createdAt)`: the sweeps of
 *   each minute ask for the open rows of every server, oldest first (`openPartyReports`,
 *   `unpostedReports`, `staleAppeals`, `staleAsks`: `status = 'open'`, some with `createdAt <= …`,
 *   `order by createdAt, id`). Their other indexes begin with the server or the party, so each
 *   sweep read the whole table, the decided rows too, which only grow. InnoDB ends each entry
 *   with the primary key (`id`), so the index gives the sweep's order as well.
 * - `MeetupRequest (status, partyId, decidedAt)`: the approvals whose meetup was never made
 *   (`strandedApprovals`: `status = 'approved' and partyId is null and decidedAt <= …`). The
 *   index `(status, expiresAt)` of 019 finds every approved request, of which nearly all have
 *   their party.
 *
 * Additive only. Safe to run again after a failure half-way, and where an index of the name is
 * there already (added by hand): each is made only when it is missing.
 */
export const sweepIndexes: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const index of ADDED) {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.statistics
        where table_schema = database() and table_name = ${index.table}
          and index_name = ${index.name}`.execute(db);
      if (Number(found.rows[0]?.n ?? 0) > 0) continue;
      await sql`create index ${sql.ref(index.name)} on ${sql.table(index.table)}
        (${sql.join(index.columns.map((column) => sql.ref(column)))})`.execute(db);
    }
  },
  async down() {
    // Additive only: the indexes stay.
  },
};
