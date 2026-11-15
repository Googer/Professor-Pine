import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * An index this migration adds: the table, the index's name, and its key: columns in order, or
 * one expression (a functional key part on a JSON path, or a multi-valued one on a JSON array).
 */
type Added = { table: string; name: string } & (
  { columns: readonly string[] } | { expression: string }
);

/** The indexes this migration adds. */
const ADDED: readonly Added[] = [
  {
    table: 'ModerationReportReason',
    name: 'moderationreportreason_reporterid_index',
    columns: ['reporterId'],
  },
  { table: 'MeetupRequest', name: 'meetuprequest_makerid_index', columns: ['makerId'] },
  { table: 'MeetupAppeal', name: 'meetupappeal_memberid_index', columns: ['memberId'] },
  { table: 'MeetupPlaceAsk', name: 'meetupplaceask_memberid_index', columns: ['memberId'] },
  {
    table: 'StopReportHistory',
    name: 'stopreporthistory_reporterid_index',
    columns: ['reporterId'],
  },
  { table: 'HistoryOptIn', name: 'historyoptin_memberid_index', columns: ['memberId'] },
  { table: 'LeaderboardOptIn', name: 'leaderboardoptin_memberid_index', columns: ['memberId'] },
  { table: 'LegacyFillIn', name: 'legacyfillin_memberid_index', columns: ['memberId'] },
  {
    table: 'NewTrainNotification',
    name: 'newtrainnotification_memberid_index',
    columns: ['memberId'],
  },
  { table: 'UnownWantGift', name: 'unownwantgift_memberid_index', columns: ['memberId'] },
  { table: 'MeetupBlock', name: 'meetupblock_memberid_index', columns: ['memberId'] },
  // What the look counts that the removal leaves (X11).
  { table: 'PartyAudit', name: 'partyaudit_actorid_index', columns: ['actorId'] },
  {
    table: 'PartyAudit',
    name: 'partyaudit_toid_index',
    expression: `cast(json_unquote(json_extract(detail, '$.to.id')) as char(30)) collate utf8mb4_bin`,
  },
  {
    table: 'PartyAudit',
    name: 'partyaudit_fromid_index',
    expression: `cast(json_unquote(json_extract(detail, '$.from.id')) as char(30)) collate utf8mb4_bin`,
  },
  {
    table: 'ServerSettingsAudit',
    name: 'serversettingsaudit_actorid_index',
    columns: ['actorId'],
  },
  { table: 'StopReport', name: 'stopreport_reporterid_index', columns: ['reporterId'] },
  {
    table: 'StopReport',
    name: 'stopreport_confirmedby_index',
    expression: `cast(confirmedBy as char(30) array)`,
  },
  { table: 'PartyAccessGrant', name: 'partyaccessgrant_memberid_index', columns: ['memberId'] },
  { table: 'MeetupRequest', name: 'meetuprequest_decidedby_index', columns: ['decidedBy'] },
  { table: 'MeetupAppeal', name: 'meetupappeal_decidedby_index', columns: ['decidedBy'] },
  { table: 'MeetupPlaceAsk', name: 'meetupplaceask_decidedby_index', columns: ['decidedBy'] },
  { table: 'MeetupPlaceRuling', name: 'meetupplaceruling_ruledby_index', columns: ['ruledBy'] },
  { table: 'MeetupBlock', name: 'meetupblock_blockedby_index', columns: ['blockedBy'] },
  { table: 'MeetupBlock', name: 'meetupblock_liftedby_index', columns: ['liftedBy'] },
  {
    table: 'ModerationReport',
    name: 'moderationreport_decidedby_index',
    columns: ['decidedBy'],
  },
  {
    table: 'ModerationReport',
    name: 'moderationreport_makerid_index',
    expression: `cast(json_unquote(json_extract(subject, '$.makerId')) as char(30)) collate utf8mb4_bin`,
  },
  {
    table: 'ModerationReport',
    name: 'moderationreport_authorid_index',
    expression: `cast(json_unquote(json_extract(subject, '$.authorId')) as char(30)) collate utf8mb4_bin`,
  },
  {
    table: 'RaidBossOverride',
    name: 'raidbossoverride_createdby_index',
    columns: ['createdBy'],
  },
  { table: 'PineStop', name: 'pinestop_createdby_index', columns: ['createdBy'] },
  { table: 'PineStop', name: 'pinestop_updatedby_index', columns: ['updatedBy'] },
  { table: 'GymReview', name: 'gymreview_decidedby_index', columns: ['decidedBy'] },
  {
    table: 'GymWayfarer',
    name: 'gymwayfarer_notinwayfarerby_index',
    columns: ['notInWayfarerBy'],
  },
  { table: 'WayspotImport', name: 'wayspotimport_staffid_index', columns: ['staffId'] },
  { table: 'EventWindow', name: 'eventwindow_setby_index', columns: ['setBy'] },
  { table: 'ServerSettings', name: 'serversettings_updatedby_index', columns: ['updatedBy'] },
];

/**
 * Indexes that begin with the member, for the removal of a member's data on request and its look
 * (plan 8G, `/operator forget`; the index audit of 2026-11-13, X10 and X11). Both ask for one
 * member's rows in every server, and these tables' keys began with the server (`(serverId,
 * memberId)`, `(guildId, memberId)`, `(serverId, makerId, status)`, `(serverId, actorId, at)`) or
 * with the report (`(reportId, reporterId)`), or held no member at all: each read walked the whole
 * key or table, or one probe of it per server, and more so on an instance of many servers, the
 * removal's inside its transaction (run again whole on a deadlock).
 *
 * - `ModerationReportReason (reporterId)`: the reasons a member gave (`ReportRepository.heldOf`,
 *   `forgetReporter`).
 * - `MeetupRequest (makerId)`, `MeetupAppeal (memberId)`, `MeetupPlaceAsk (memberId)`,
 *   `MeetupBlock (memberId)`: their requests, appeals, asks about places and blocks
 *   (`MeetupSafetyRepository.heldOf`, `forgetMember`).
 * - `HistoryOptIn`, `LeaderboardOptIn`, `LegacyFillIn (memberId)` and
 *   `StopReportHistory (reporterId)`: the servers whose history holds anything of the member
 *   (`serversNaming` of `HistoryRepository.heldEverywhere`, `forgetEverywhere`), and the switches
 *   counted for the look.
 * - `NewTrainNotification`, `UnownWantGift (memberId)`: their rows of every server (`countOf`,
 *   `forget` of `NewTrainRepository` and `UnownGiftRepository`).
 * - What the look counts that the removal leaves (X11; Matt, 2026-11-13: "Index them"): the
 *   staff's logs by who did it (`PartyAudit (actorId)`, `ServerSettingsAudit (actorId)`) and by
 *   the conductor before and after (`PartyAudit`'s `detail` at `$.from.id` and `$.to.id`, each a
 *   functional key part); their reports at stops (`StopReport (reporterId)`) and those they
 *   confirmed (`StopReport.confirmedBy`, a multi-valued key part over the JSON array, read with
 *   `member of`); the forums they were let into (`PartyAccessGrant (memberId)`); the reports
 *   about them (`ModerationReport`'s `subject` at `$.makerId` and `$.authorId`); and what they
 *   did as staff, one index per column that names the staff member (`decidedBy`, `ruledBy`,
 *   `blockedBy`, `liftedBy`, `createdBy`, `updatedBy`, `notInWayfarerBy`, `staffId`, `setBy`).
 *   A JSON path's key part is its text cast to `char(30) collate utf8mb4_bin`, the collation
 *   `json_unquote` answers in, so that MySQL serves a query that writes
 *   `json_unquote(json_extract(…)) = ?` by it (`MemberDataRepository`'s `left`,
 *   `ReportRepository.heldOf`; a query that writes the cast itself is not, its path taking the
 *   connection's collation, tried); member ids are snowflakes, which `char(30)` holds as
 *   `varchar(30)` does. A JSON array's (`confirmedBy`) serves `? member of (confirmedBy)`.
 *
 * What the JSON indexes refuse, the row's insert or update failing whole (the test tries each):
 * `partyaudit_toid_index` and `partyaudit_fromid_index` a conductor's id over 30 characters
 * ("Data truncated for functional index"), as do `moderationreport_makerid_index` and
 * `moderationreport_authorid_index` of the subject's member; `stopreport_confirmedby_index` a
 * `confirmedBy` that is not SQL null or a list of strings of at most 30 characters: a JSON
 * `null`, a `null` in the list, an object in it or in its place, an id over 30 characters. So
 * the writers bound them as well (`loggedMember` in `src/domain/party/audit.ts`, the subject's
 * `snowflake` in `src/domain/moderation/reports.ts`, `StopReportRepository`'s `confirm`), and
 * widening an id is a decision of a migration that widens its index.
 *
 * Additive only. Safe to run again after a failure half-way, and where an index of the name is
 * there already (added by hand): each is made only when it is missing.
 */
export const memberIndexes: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const index of ADDED) {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.statistics
        where table_schema = database() and table_name = ${index.table}
          and index_name = ${index.name}`.execute(db);
      if (Number(found.rows[0]?.n ?? 0) > 0) continue;
      // An expression is this file's own constant text, never a value from outside.
      const key =
        'columns' in index
          ? sql.join(index.columns.map((column) => sql.ref(column)))
          : sql.raw(`(${index.expression})`);
      await sql`create index ${sql.ref(index.name)} on ${sql.table(index.table)} (${key})`.execute(
        db,
      );
    }
  },
  async down() {
    // Additive only: the indexes stay.
  },
};
