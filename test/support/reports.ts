import type { Decider } from '../../src/domain/meetups/records.js';
import {
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
} from '../../src/domain/moderation/reports.js';

/**
 * `ReportRepository` in memory, for tests: the same answers (`reportCases` runs on both).
 * `failing` makes every method of that name reject.
 */
export class MemoryReports implements ReportStore {
  readonly reports = new Map<string, ModerationReport>();
  readonly failing = new Set<keyof ReportStore>();

  private check(method: keyof ReportStore): Promise<void> {
    return this.failing.has(method)
      ? Promise.reject(new Error(`the database refused ${method}`))
      : Promise.resolve();
  }

  /** A copy, its reasons in the repository's order: by time, then as they came. */
  private copy(report: ModerationReport): ModerationReport {
    const copied = structuredClone(report);
    // A stable sort: reasons of one moment stay in the order they were given (the row ids).
    copied.reasons.sort((a, b) => a.at - b.at);
    return copied;
  }

  async addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded> {
    await this.check('addReport');
    // As the repository: a subject that would not read back is refused before anything is kept.
    reportSubject.parse(report.subject);
    const key = reportTargetKey(report.subject);
    const open = [...this.reports.values()].find(
      (one) => one.status === 'open' && reportTargetKey(one.subject) === key,
    );
    if (open) {
      // As the unique key: several reasons of reporters removed on request (null) stand.
      if (
        reason.reporterId !== null &&
        open.reasons.some((one) => one.reporterId === reason.reporterId)
      ) {
        return { kind: 'already', report: this.copy(open) };
      }
      open.reasons.push({ ...reason });
      return { kind: 'added', report: this.copy(open) };
    }
    const made: ModerationReport = {
      ...structuredClone(report),
      status: 'open',
      removal: null,
      channelId: null,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      reasons: [{ ...reason }],
    };
    this.reports.set(report.id, made);
    return { kind: 'opened', report: this.copy(made) };
  }

  async report(id: string) {
    await this.check('report');
    const found = this.reports.get(id);
    return found && this.copy(found);
  }

  async openReport(key: string) {
    await this.check('openReport');
    const found = [...this.reports.values()].find(
      (one) => one.status === 'open' && reportTargetKey(one.subject) === key,
    );
    return found && this.copy(found);
  }

  async setReportPost(id: string, channelId: string, messageId: string) {
    await this.check('setReportPost');
    const found = this.reports.get(id);
    if (found) this.reports.set(id, { ...found, channelId, messageId });
  }

  async setSubject(id: string, subject: ReportSubject) {
    await this.check('setSubject');
    reportSubject.parse(subject);
    const found = this.reports.get(id);
    if (found) this.reports.set(id, { ...found, subject: structuredClone(subject) });
  }

  async discardReport(id: string) {
    await this.check('discardReport');
    this.reports.delete(id);
  }

  async decideReport(
    id: string,
    status: Exclude<ReportStatus, 'open'>,
    removal: PostRemoval | null,
    by: Decider | null,
  ) {
    await this.check('decideReport');
    const found = this.reports.get(id);
    if (!found || found.status !== 'open') return false;
    this.reports.set(id, {
      ...found,
      status,
      removal,
      decidedBy: by?.id ?? null,
      decidedByName: by?.name ?? null,
      decidedAt: by?.at ?? null,
    });
    return true;
  }

  async closeEnded(id: string, removal: ReportRemoval, by: Decider) {
    await this.check('closeEnded');
    const found = this.reports.get(id);
    if (found?.status !== 'ended') return false;
    this.reports.set(id, {
      ...found,
      status: 'closed',
      removal,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    });
    return true;
  }

  async openReportsOfParty(partyId: string) {
    await this.check('openReportsOfParty');
    return this.sorted(
      (one) =>
        one.status === 'open' && one.subject.kind === 'party' && one.subject.partyId === partyId,
    );
  }

  async reopenReport(id: string) {
    await this.check('reopenReport');
    const found = this.reports.get(id);
    if (!found) return false;
    const key = reportTargetKey(found.subject);
    const taken = [...this.reports.values()].some(
      (one) => one.id !== id && one.status === 'open' && reportTargetKey(one.subject) === key,
    );
    if (taken) return false;
    this.reports.set(id, {
      ...found,
      status: 'open',
      removal: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
    });
    return true;
  }

  async markGone(id: string) {
    await this.check('markGone');
    const found = this.reports.get(id);
    if (found?.status === 'deleted') this.reports.set(id, { ...found, status: 'gone' });
  }

  async setRemoval(id: string, removal: ReportRemoval) {
    await this.check('setRemoval');
    const found = this.reports.get(id);
    if (found) this.reports.set(id, { ...found, removal });
  }

  async openPartyReports() {
    await this.check('openPartyReports');
    return this.sorted((one) => one.status === 'open' && one.subject.kind === 'party');
  }

  async openReports(serverId: string) {
    await this.check('openReports');
    return this.sorted((one) => one.status === 'open' && one.serverId === serverId);
  }

  async unpostedReports(before: number) {
    await this.check('unpostedReports');
    return this.sorted(
      (one) => one.status === 'open' && one.messageId === null && one.createdAt <= before,
    );
  }

  private sorted(which: (report: ModerationReport) => boolean): ModerationReport[] {
    return [...this.reports.values()]
      .filter(which)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((one) => this.copy(one));
  }
}
