import {
  decisionOf,
  KEPT_UNRECORDED_MS,
  newerThan,
  savedAt,
  type Removal,
  type ReportPlace,
  type SaveOptions,
  type SaveOutcome,
  type SavedStopReport,
  type StandingDecision,
  type StandingVerdict,
  type StopReportStorage,
} from '../../src/db/repositories/stop-report-repository.js';
import type { TaskReward } from '../../src/domain/research/task.js';
import { rewardHash } from '../../src/domain/research/versions.js';
import {
  confirmedWith,
  detailWithoutMembers,
  endingOfRow,
  reportCell,
  takeBackEnding,
  type ReportEnding,
  type StopReportRecord,
} from '../../src/domain/stops/report-history.js';
import type { NewStopReport, StopReport } from '../../src/domain/stops/report.js';
import { catalogueFixture } from './game-data.js';

/**
 * A research reward's hash with the fixtures' catalogue, which tells a costume: what
 * `StopReportService` needs as `rewardHash` (plan 8R-5), as the app gives it the game data's.
 */
export function fixtureRewardHash(reward: TaskReward): string {
  return rewardHash(reward, catalogueFixture());
}

/** Methods a test can make fail (`failing`). */
type Method = keyof StopReportStorage;

/** A report that goes, and how its record ends. */
interface Ended {
  row: StopReport;
  ending: ReportEnding;
  endedAt: number;
  confirmedBy?: string;
}

/**
 * The reports at stops in memory (`StopReportStorage`), for tests: the twin of
 * `StopReportRepository`, running `stopReportCases` as it does. `rows` are the kept reports by
 * id; `failing` makes a method reject with the error given. Plan 8H-2: `places` and `confirmedBy`
 * are what the live rows keep beside the report (by id), `records` the history of the reports
 * that ended, `optIn` a member's history opt-in, and `historyFailing` makes the records of a
 * save or a take-back fail (logged and lost there, review H11) and the sweep's (its rows kept,
 * H10, and nothing forgotten). Plan 8H-3: `reach`, what the news of each kept version reached.
 */
export class MemoryStopReports implements StopReportStorage {
  readonly rows = new Map<number, StopReport>();
  readonly failing = new Map<Method, Error>();
  readonly places = new Map<number, ReportPlace>();
  readonly confirmedBy = new Map<number, readonly string[]>();
  /** What the news of each kept version reached (plan 8H-3), by id. */
  readonly reach = new Map<number, number>();
  readonly records: StopReportRecord[] = [];
  historyFailing: Error | undefined;
  private readonly optedIn = new Set<string>();
  private nextId = 1;

  private fail(method: Method): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  /** Opts a member in to the history of a server (`HistoryOptIn`). */
  optIn(serverId: string, memberId: string): void {
    this.optedIn.add(`${serverId}:${memberId}`);
  }

  async save(report: NewStopReport, options: SaveOptions = {}): Promise<SavedStopReport> {
    this.fail('save');
    const outcome = await this.saveUnless(report, () => 'replace', options);
    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
    return outcome;
  }

  saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict | StandingDecision,
    { standingAt, place, restoring }: SaveOptions = {},
  ): Promise<SaveOutcome> {
    this.fail('saveUnless');
    const rows = [...this.rows.values()]
      .filter(
        (row) =>
          row.serverId === report.serverId &&
          row.stop.key === report.stop.key &&
          row.kind === report.kind &&
          (row.periodKey === report.periodKey ||
            (standingAt !== undefined && row.endsAt > standingAt)),
      )
      .sort((a, b) => a.madeAt - b.madeAt || a.id - b.id);
    const live = standingAt === undefined ? [] : rows.filter((row) => row.endsAt > standingAt);
    const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
    const decision: StandingDecision = before
      ? decisionOf(decide(structuredClone(before)))
      : { verdict: 'replace' };
    if (before && decision.verdict === 'keep') {
      if (decision.confirms) this.confirm(before, report.reporter.id);
      return Promise.resolve({ saved: false, standing: structuredClone(before) });
    }
    const inPlace = before !== undefined && decision.verdict === 'update';
    // A version strictly newer than the one it changes (F1), its length kept.
    const written = inPlace ? newerThan(report, before.madeAt) : report;
    const at = savedAt(written.madeAt, standingAt);
    // A hideout put back forgets its record and takes its place (P3, P4).
    const placed = restoring
      ? (this.forgetRecord(restoring) ??
        place ?? { cell: reportCell(report.stop), regionIds: null })
      : place;
    this.recordBehindSavepoint(
      rows.map((row) => ({
        row,
        ...endingOfRow(row, at, row === before ? decision.ending : undefined),
        ...(row === before && decision.confirms ? { confirmedBy: report.reporter.id } : {}),
      })),
    );
    // A replacement is a report of its own: the replaced one's id is gone for good. Changed in
    // place (plan 8R-4L), the standing one keeps its id.
    for (const row of rows) this.forget(row.id);
    const id = inPlace ? before.id : this.nextId++;
    const kept: StopReport = structuredClone({ ...written, id });
    this.rows.set(id, kept);
    if (placed) this.places.set(id, structuredClone(placed));
    return Promise.resolve({
      saved: true,
      inPlace,
      report: structuredClone(kept),
      replaced: before,
    });
  }

  private forget(id: number): void {
    this.rows.delete(id);
    this.places.delete(id);
    this.confirmedBy.delete(id);
    this.reach.delete(id);
  }

  private confirm(row: StopReport, member: string): void {
    const before = this.confirmedBy.get(row.id) ?? [];
    this.confirmedBy.set(row.id, confirmedWith(before, member, row.reporter.id));
  }

  /** The record of a hideout's version put back, forgotten; its place, where it kept one. */
  private forgetRecord(version: { id: number; madeAt: number }): ReportPlace | undefined {
    const at = this.records.findIndex(
      (one) => one.reportId === version.id && one.reportMadeAt === version.madeAt,
    );
    if (at < 0) return undefined;
    const [gone] = this.records.splice(at, 1);
    return gone?.cell === null || gone === undefined
      ? undefined
      : { cell: gone.cell, regionIds: gone.regionIds };
  }

  /** As the repository writes them: a failure is lost, and the report's write goes on. */
  private recordBehindSavepoint(ended: readonly Ended[]): void {
    if (this.historyFailing) return;
    this.record(ended);
  }

  private record(ended: readonly Ended[]): void {
    for (const { row, ending, endedAt, confirmedBy } of ended) {
      const confirmed = this.confirmedBy.get(row.id) ?? [];
      const place = this.places.get(row.id);
      this.records.push(
        structuredClone({
          reportId: row.id,
          reportMadeAt: row.madeAt,
          serverId: row.serverId,
          kind: row.kind,
          periodKey: row.periodKey,
          subjectKey: row.subjectKey,
          detail: detailWithoutMembers(row.kind === 'research' ? row.research : row.rocket),
          cell: place?.cell ?? null,
          regionIds: place?.regionIds ?? null,
          madeAt: row.madeAt,
          endsAt: row.endsAt,
          endedAt,
          reporterId: this.optedIn.has(`${row.serverId}:${row.reporter.id}`)
            ? row.reporter.id
            : null,
          confirmations: (confirmedBy === undefined
            ? confirmed
            : confirmedWith(confirmed, confirmedBy, row.reporter.id)
          ).length,
          reach: this.reach.get(row.id) ?? 0,
          ending,
        }),
      );
    }
  }

  byId(id: number): Promise<StopReport | undefined> {
    this.fail('byId');
    const row = this.rows.get(id);
    return Promise.resolve(row && structuredClone(row));
  }

  standing(serverId: string, now: number): Promise<StopReport[]> {
    this.fail('standing');
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.serverId === serverId && row.endsAt > now)
        .sort((a, b) => a.madeAt - b.madeAt || a.id - b.id)
        .map((row) => structuredClone(row)),
    );
  }

  serversStanding(now: number): Promise<string[]> {
    this.fail('serversStanding');
    return Promise.resolve(
      [
        ...new Set(
          [...this.rows.values()].filter((row) => row.endsAt > now).map((row) => row.serverId),
        ),
      ].sort(),
    );
  }

  latestBy(serverId: string, memberId: string, since: number): Promise<StopReport | undefined> {
    this.fail('latestBy');
    const latest = [...this.rows.values()]
      .filter(
        (row) => row.serverId === serverId && row.reporter.id === memberId && row.madeAt >= since,
      )
      .sort((a, b) => b.madeAt - a.madeAt || b.id - a.id)[0];
    return Promise.resolve(latest && structuredClone(latest));
  }

  remove(
    id: number,
    serverId: string,
    why: Removal,
    madeAt?: number,
  ): Promise<StopReport | undefined> {
    this.fail('remove');
    const row = this.rows.get(id);
    if (row?.serverId !== serverId || (madeAt !== undefined && row.madeAt !== madeAt)) {
      return Promise.resolve(undefined);
    }
    const ending = takeBackEnding(row.reporter.id, why.by, why.as);
    this.recordBehindSavepoint([{ row, ...endingOfRow(row, why.at, ending) }]);
    this.forget(id);
    return Promise.resolve(row);
  }

  removeEnded(before: number): Promise<number> {
    this.fail('removeEnded');
    const ended = [...this.rows.values()]
      .filter((row) => row.endsAt <= before)
      .sort((a, b) => a.endsAt - b.endsAt || a.id - b.id);
    if (ended.length === 0) return Promise.resolve(0);
    // Records that fail keep their rows for the next sweep (review H10, P7), but a week past
    // their end the rows go without them (8H2-4).
    if (this.historyFailing) {
      const dropped = ended.filter((row) => row.endsAt < before - KEPT_UNRECORDED_MS);
      for (const row of dropped) this.forget(row.id);
      return Promise.resolve(dropped.length);
    }
    this.record(ended.map((row) => ({ row, ...endingOfRow(row, before, undefined) })));
    for (const row of ended) this.forget(row.id);
    return Promise.resolve(ended.length);
  }

  endedAs(
    id: number,
    madeAt: number,
    ending: ReportEnding,
    from: readonly ReportEnding[],
  ): Promise<boolean> {
    this.fail('endedAs');
    const found = this.records.filter(
      (one) => one.reportId === id && one.reportMadeAt === madeAt && from.includes(one.ending),
    );
    for (const one of found) one.ending = ending;
    return Promise.resolve(found.length > 0);
  }

  addReach(id: number, madeAt: number, members: number): Promise<boolean> {
    this.fail('addReach');
    const row = this.rows.get(id);
    if (row?.madeAt !== madeAt) return Promise.resolve(false);
    this.reach.set(id, (this.reach.get(id) ?? 0) + members);
    return Promise.resolve(true);
  }

  historyOf(serverId: string): Promise<StopReportRecord[]> {
    this.fail('historyOf');
    return Promise.resolve(
      this.records.filter((one) => one.serverId === serverId).map((one) => structuredClone(one)),
    );
  }
}
