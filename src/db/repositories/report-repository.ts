import { sql, type Kysely, type Selectable } from 'kysely';
import type { Decider } from '../../domain/meetups/records.js';
import {
  REPORT_STATUSES,
  reportSubject,
  reportTargetKey,
  type ModerationReport,
  type NewReport,
  type PostRemoval,
  type ReportRemoval,
  type ReasonAdded,
  type ReportReason,
  type ReportStatus,
  type ReportStore,
  type ReportSubject,
} from '../../domain/moderation/reports.js';
import type { Logger } from '../../log.js';
import { isDuplicateEntry } from '../errors.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB, ModerationReport as ReportRow } from '../types.js';

const epoch = (value: string | null): number | null => (value === null ? null : Number(value));

/** How often a reason tries to open or join a report while others decide or open it meanwhile. */
const ADD_TRIES = 3;

/**
 * Reports to the moderators (plan 8S-2), in the tables of migration 022: `ModerationReport` and
 * `ModerationReportReason`. Its twin in memory is `MemoryReports`; both run `reportCases`
 * (`test/support/report-cases.ts`). A report whose subject does not read is logged and left
 * alone, as if it were not there.
 */
export class ReportRepository implements ReportStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  async addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded> {
    // A subject that would not read back is refused before anything is kept.
    reportSubject.parse(report.subject);
    const openKey = reportTargetKey(report.subject);
    for (let attempt = 0; attempt < ADD_TRIES; attempt++) {
      // The open report locked, then the reason: a reason joins a report only while it is open
      // (a decision at the same moment waits, or comes first and the reason opens a new one).
      // Read committed: no gap lock where there is no open report, so two first reasons of one
      // subject do not deadlock; the second meets the unique key and joins the first. Except
      // beside a decided report's key InnoDB has not purged yet, which the duplicate check locks
      // even so: a deadlock there runs the try again.
      const outcome = await retryOnDeadlock(this.db, () =>
        inTransaction(
          this.db,
          async (trx): Promise<{ kind: ReasonAdded['kind']; id: string } | undefined> => {
            // Found by its key, locked by its id (a lock on the key's index as well would deadlock
            // with a decision, which changes the key), and still open once locked.
            const found = await trx
              .selectFrom('ModerationReport')
              .select('id')
              .where('openKey', '=', openKey)
              .executeTakeFirst();
            const open =
              found &&
              (await trx
                .selectFrom('ModerationReport')
                .select('id')
                .where('id', '=', found.id)
                .where('status', '=', 'open')
                .forUpdate()
                .executeTakeFirst());
            // Decided while this waited: the next try opens a report anew.
            if (found && !open) return undefined;
            if (open) {
              try {
                await insertReason(trx, open.id, reason);
                return { kind: 'added', id: open.id };
              } catch (err) {
                if (isDuplicateEntry(err, 'PRIMARY')) return { kind: 'already', id: open.id };
                throw err;
              }
            }
            if (!(await this.open(trx, report, openKey))) return undefined;
            // The report and its first reason in one step: a report never has none.
            await insertReason(trx, report.id, reason);
            return { kind: 'opened', id: report.id };
          },
          { isolation: 'read committed' },
        ),
      );
      // Opened by another reason meanwhile: the next try joins it.
      if (outcome) return { kind: outcome.kind, report: await this.reportOrThrow(outcome.id) };
    }
    throw new Error('a reason found its report decided and opened again too often');
  }

  /** Opens a report; false when one of its subject was opened meanwhile (the unique key). */
  private async open(trx: Kysely<DB>, report: NewReport, openKey: string): Promise<boolean> {
    try {
      await trx
        .insertInto('ModerationReport')
        .values({
          id: report.id,
          serverId: report.serverId,
          kind: report.subject.kind,
          partyId: report.subject.kind === 'party' ? report.subject.partyId : null,
          targetChannelId: report.subject.kind === 'message' ? report.subject.channelId : null,
          targetMessageId: report.subject.kind === 'message' ? report.subject.messageId : null,
          subject: JSON.stringify(report.subject),
          createdAt: String(report.createdAt),
          status: 'open',
          openKey,
        })
        .execute();
    } catch (err) {
      if (isDuplicateEntry(err, 'moderationreport_openkey_unique')) return false;
      throw err;
    }
    return true;
  }

  async report(id: string): Promise<ModerationReport | undefined> {
    const row = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return undefined;
    return (await this.readAll([row]))[0];
  }

  async openReport(key: string): Promise<ModerationReport | undefined> {
    // The key is unique and only an open report has one.
    const row = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('openKey', '=', key)
      .where('status', '=', 'open')
      .executeTakeFirst();
    if (!row) return undefined;
    return (await this.readAll([row]))[0];
  }

  private async reportOrThrow(id: string): Promise<ModerationReport> {
    const found = await this.report(id);
    if (!found) throw new Error(`report ${id} cannot be read`);
    return found;
  }

  async setReportPost(id: string, channelId: string, messageId: string): Promise<void> {
    await this.db
      .updateTable('ModerationReport')
      .set({ channelId, messageId })
      .where('id', '=', id)
      .execute();
  }

  async setSubject(id: string, subject: ReportSubject): Promise<void> {
    reportSubject.parse(subject);
    await this.db
      .updateTable('ModerationReport')
      .set({ subject: JSON.stringify(subject) })
      .where('id', '=', id)
      .execute();
  }

  async discardReport(id: string): Promise<void> {
    await inTransaction(this.db, async (trx) => {
      await trx.deleteFrom('ModerationReportReason').where('reportId', '=', id).execute();
      await trx.deleteFrom('ModerationReport').where('id', '=', id).execute();
    });
  }

  async decideReport(
    id: string,
    status: Exclude<ReportStatus, 'open'>,
    removal: PostRemoval | null,
    by: Decider | null,
  ): Promise<boolean> {
    const [result] = await this.db
      .updateTable('ModerationReport')
      .set({
        status,
        removal,
        openKey: null,
        decidedBy: by?.id ?? null,
        decidedByName: by?.name ?? null,
        decidedAt: by === null ? null : String(by.at),
      })
      .where('id', '=', id)
      .where('status', '=', 'open')
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async closeEnded(id: string, removal: ReportRemoval, by: Decider): Promise<boolean> {
    const [result] = await this.db
      .updateTable('ModerationReport')
      .set({
        status: 'closed',
        removal,
        decidedBy: by.id,
        decidedByName: by.name,
        decidedAt: String(by.at),
      })
      .where('id', '=', id)
      .where('status', '=', 'ended')
      .execute();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  async openReportsOfParty(partyId: string): Promise<ModerationReport[]> {
    const rows = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('partyId', '=', partyId)
      .where('status', '=', 'open')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readAll(rows);
  }

  async reopenReport(id: string): Promise<boolean> {
    const found = await this.report(id);
    if (!found) return false;
    try {
      const [result] = await this.db
        .updateTable('ModerationReport')
        .set({
          status: 'open',
          openKey: reportTargetKey(found.subject),
          removal: null,
          decidedBy: null,
          decidedByName: null,
          decidedAt: null,
        })
        .where('id', '=', id)
        .execute();
      return Number(result?.numUpdatedRows ?? 0) > 0;
    } catch (err) {
      if (isDuplicateEntry(err, 'moderationreport_openkey_unique')) return false;
      throw err;
    }
  }

  async markGone(id: string): Promise<void> {
    await this.db
      .updateTable('ModerationReport')
      .set({ status: 'gone' })
      .where('id', '=', id)
      .where('status', '=', 'deleted')
      .execute();
  }

  async setRemoval(id: string, removal: ReportRemoval): Promise<void> {
    await this.db.updateTable('ModerationReport').set({ removal }).where('id', '=', id).execute();
  }

  async openPartyReports(): Promise<ModerationReport[]> {
    const rows = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('kind', '=', 'party')
      .where('status', '=', 'open')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readAll(rows);
  }

  async openReports(serverId: string): Promise<ModerationReport[]> {
    const rows = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('status', '=', 'open')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readAll(rows);
  }

  async unpostedReports(before: number): Promise<ModerationReport[]> {
    const rows = await this.db
      .selectFrom('ModerationReport')
      .selectAll()
      .where('status', '=', 'open')
      .where('messageId', 'is', null)
      .where('createdAt', '<=', String(before))
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return this.readAll(rows);
  }

  /** The reports of these rows with their reasons; a row that does not read is logged and left out. */
  private async readAll(rows: Selectable<ReportRow>[]): Promise<ModerationReport[]> {
    if (rows.length === 0) return [];
    const reasons = await this.db
      .selectFrom('ModerationReportReason')
      .selectAll()
      .where(
        'reportId',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('createdAt')
      .orderBy('reporterId')
      .execute();
    return rows.flatMap((row) => {
      const subject = reportSubject.safeParse(
        typeof row.subject === 'string' ? JSON.parse(row.subject) : row.subject,
      );
      const status = REPORT_STATUSES.find((one) => one === row.status);
      if (!subject.success || status === undefined) {
        this.log?.error({ report: row.id }, 'a report cannot be read; it is left alone');
        return [];
      }
      return [
        {
          id: row.id,
          serverId: row.serverId,
          subject: subject.data,
          createdAt: Number(row.createdAt),
          status,
          removal:
            row.removal === 'archive' || row.removal === 'delete' || row.removal === 'denied'
              ? row.removal
              : null,
          channelId: row.channelId,
          messageId: row.messageId,
          decidedBy: row.decidedBy,
          decidedByName: row.decidedByName,
          decidedAt: epoch(row.decidedAt),
          reasons: reasons
            .filter((one) => one.reportId === row.id)
            .map((one) => ({
              reporterId: one.reporterId,
              reporterName: one.reporterName,
              text: one.text,
              at: Number(one.createdAt),
            })),
        },
      ];
    });
  }

  /**
   * What the reports of every server hold of a member (plan 8G: the look of `/admin forget`):
   * the reasons they gave, how many of those still carry their name, and the reports about them
   * (a party they made, a message they wrote: the subject's `makerId` or `authorId`). The tables
   * are read whole: neither is indexed by the member, both are small, and only the owner asks.
   */
  async heldOf(memberId: string): Promise<ReportsHeld> {
    const reasons = await this.db
      .selectFrom('ModerationReportReason')
      .select((eb) => [
        eb.fn.countAll<number | string>().as('reasons'),
        eb.fn.count<number | string>('reporterName').as('named'),
      ])
      .where('reporterId', '=', memberId)
      .executeTakeFirst();
    const about = await sql<{ about: number | string }>`
      select count(*) as about from ModerationReport
      where json_unquote(json_extract(subject, '$.makerId')) = ${memberId}
         or json_unquote(json_extract(subject, '$.authorId')) = ${memberId}`.execute(this.db);
    return {
      reasons: Number(reasons?.reasons ?? 0),
      named: Number(reasons?.named ?? 0),
      about: Number(about.rows[0]?.about ?? 0),
    };
  }

  /**
   * Takes a member's name off the reasons they gave, in every server (plan 8G, `/admin forget`);
   * from how many. Their id stays: it is half of the table's primary key (one reason per
   * reporter and report) and cannot be null, and the reason and its report stay for the
   * moderators. Reports about the member are not touched. Their reasons are read first, without
   * a lock, and changed by their key (the report, the reporter): a change by the reporter alone
   * would lock every reason of the table. In the caller's transaction when `db` is one.
   */
  async forgetReporter(memberId: string): Promise<number> {
    const rows = await this.db
      .selectFrom('ModerationReportReason')
      .select('reportId')
      .where('reporterId', '=', memberId)
      .where('reporterName', 'is not', null)
      .execute();
    if (rows.length === 0) return 0;
    const blanked = await this.db
      .updateTable('ModerationReportReason')
      .set({ reporterName: null })
      .where('reporterId', '=', memberId)
      .where(
        'reportId',
        'in',
        rows.map((row) => row.reportId),
      )
      .where('reporterName', 'is not', null)
      .executeTakeFirst();
    return Number(blanked.numUpdatedRows);
  }
}

/** What the reports hold of a member, counted (`ReportRepository.heldOf`). */
export interface ReportsHeld {
  /** The reasons they gave, one per report they made or joined. */
  reasons: number;
  /** Of those, the ones that still carry their name. */
  named: number;
  /** The reports about a party they made or a message they wrote. */
  about: number;
}

function reasonRow(reportId: string, reason: ReportReason) {
  return {
    reportId,
    reporterId: reason.reporterId,
    reporterName: reason.reporterName,
    text: reason.text,
    createdAt: String(reason.at),
  };
}

async function insertReason(db: Kysely<DB>, reportId: string, reason: ReportReason): Promise<void> {
  await db.insertInto('ModerationReportReason').values(reasonRow(reportId, reason)).execute();
}
