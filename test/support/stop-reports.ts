import {
  newerThan,
  type SaveOutcome,
  type SavedStopReport,
  type StandingVerdict,
  type StopReportStorage,
} from '../../src/db/repositories/stop-report-repository.js';
import type { TaskReward } from '../../src/domain/research/task.js';
import { rewardHash } from '../../src/domain/research/versions.js';
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

/**
 * The reports at stops in memory (`StopReportStorage`), for tests: the twin of
 * `StopReportRepository`, running `stopReportCases` as it does. `rows` are the kept reports by
 * id; `failing` makes a method reject with the error given.
 */
export class MemoryStopReports implements StopReportStorage {
  readonly rows = new Map<number, StopReport>();
  readonly failing = new Map<Method, Error>();
  private nextId = 1;

  private fail(method: Method): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  async save(report: NewStopReport): Promise<SavedStopReport> {
    this.fail('save');
    const outcome = await this.saveUnless(report, () => 'replace');
    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
    return outcome;
  }

  saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict,
    standingAt?: number,
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
    const verdict = before ? decide(structuredClone(before)) : 'replace';
    if (before && verdict === 'keep') {
      return Promise.resolve({ saved: false, standing: structuredClone(before) });
    }
    // A replacement is a report of its own: the replaced one's id is gone for good. Changed in
    // place (plan 8R-4L), the standing one keeps its id.
    for (const row of rows) this.rows.delete(row.id);
    const inPlace = before !== undefined && verdict === 'update';
    const id = inPlace ? before.id : this.nextId++;
    // A version strictly newer than the one it changes (F1), its length kept.
    const kept: StopReport = structuredClone({
      ...(inPlace ? newerThan(report, before.madeAt) : report),
      id,
    });
    this.rows.set(id, kept);
    return Promise.resolve({
      saved: true,
      inPlace,
      report: structuredClone(kept),
      replaced: before,
    });
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

  remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined> {
    this.fail('remove');
    const row = this.rows.get(id);
    if (row?.serverId !== serverId || (madeAt !== undefined && row.madeAt !== madeAt)) {
      return Promise.resolve(undefined);
    }
    this.rows.delete(id);
    return Promise.resolve(row);
  }

  removeEnded(before: number): Promise<number> {
    this.fail('removeEnded');
    let gone = 0;
    for (const [id, row] of this.rows) {
      if (row.endsAt <= before) {
        this.rows.delete(id);
        gone += 1;
      }
    }
    return Promise.resolve(gone);
  }
}
