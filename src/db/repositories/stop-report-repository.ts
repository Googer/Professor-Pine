import type { Kysely, Selectable } from 'kysely';
import { z } from 'zod';
import type { NewStopReport, StopReport, StopReportKind } from '../../domain/stops/report.js';
import type { Logger } from '../../log.js';
import { isDuplicateEntry } from '../errors.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB, StopReport as StopReportRow } from '../types.js';
import { catchesDocument } from './rocket-lineup-repository.js';

/** What came of saving a report: it, and the report it took the place of, if any. */
export interface SavedStopReport {
  report: StopReport;
  replaced: StopReport | undefined;
}

/**
 * What `saveUnless` does with the report standing in its place: keeps it as it is (`keep`),
 * replaces it with a report of its own (`replace`, a new id), or changes it into the new report in
 * place (`update`, plan 8R-4L, Matt's B2: its row and id stay, so that a grunt's messages and an
 * answer's Take back still find it).
 */
export type StandingVerdict = 'keep' | 'replace' | 'update';

/**
 * What came of a save that may keep the report standing in its place (`saveUnless`): saved, as
 * `save` saves (`inPlace` where the standing report was changed into it, keeping its id); or not,
 * the report standing there kept as it is.
 */
export type SaveOutcome =
  ({ saved: true; inPlace: boolean } & SavedStopReport) | { saved: false; standing: StopReport };

/**
 * The reports at stops (plan 8R-1; table `StopReport` of migration 027); lets tests keep them in
 * memory (`MemoryStopReports`, `test/support/stop-reports.ts`). Both run `stopReportCases`.
 */
export interface StopReportStorage {
  /**
   * Saves a report in the place of the one of its server, stop, kind and period (the latest
   * replaces the earlier, whoever made it: design 4.3), in one transaction; gives the report as
   * kept and the one it replaced.
   */
  save(report: NewStopReport): Promise<SavedStopReport>;
  /**
   * `save`, unless `decide` says the report standing in its place stays (plan 8R-2: one Rocket
   * report per stop and day, design 5.2), or is to be changed into it in place (`update`, plan
   * 8R-4L: its id kept; the other rows of its place go as a replacement takes them): asked with
   * that report, while its row is locked in the same transaction, so that the decision and the
   * write are one. Not asked where nothing stands (or what stands cannot be read: it is
   * replaced). With `standingAt`, a report of the same server, stop and kind that still stands at
   * that time in another period (a grunt of yesterday past midnight) counts as standing in its
   * place too: it is asked about (the latest), locked, and replaced with the rest (fix A2: one
   * Rocket report per stop, also across midnight).
   */
  saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict,
    standingAt?: number,
  ): Promise<SaveOutcome>;
  /** A report by its id, if it is kept. */
  byId(id: number): Promise<StopReport | undefined>;
  /** The reports of a server that have not ended at `now` (`endsAt` later), oldest first. */
  standing(serverId: string, now: number): Promise<StopReport[]>;
  /** The servers with reports that have not ended at `now`. */
  serversStanding(now: number): Promise<string[]>;
  /**
   * A member's latest report of a server made at or after `since` (by `madeAt`; the later id of
   * two made at once), ended or not, as long as it is kept: one taken back or replaced is gone
   * (Matt, 2026-10-27: `/rocket report` offers the stops near it, when `StopReportService` has no
   * record of the member's last report, after a restart). One that cannot be read is none
   * (logged).
   */
  latestBy(serverId: string, memberId: string, since: number): Promise<StopReport | undefined>;
  /**
   * Takes back a report of a server; gives it, or undefined when it is not kept (any more). With
   * `madeAt`, only while the report by that id was made then (review L1: a report changed in
   * place keeps its id, so its version is the id and `madeAt`); another is left as it is.
   */
  remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined>;
  /** Forgets the reports that ended at or before `before`; gives how many. */
  removeEnded(before: number): Promise<number>;
}

/**
 * A report as it changes one made at `standingMadeAt` in place (fix round 2, F1): made at least a
 * millisecond after it, its end moved by as much, so that its length stays. Two versions of one
 * id are never equal, and the later write is always the newer one, also where the clock that
 * made the report was behind (another process, a refine that waited for the lock).
 *
 * For a grunt's in-place refine only (K2), whose end is its own length after it was made: a
 * report bound to a period (research, a hideout until midnight) must not use it, as moving its
 * end would carry it past the period's.
 */
export function newerThan<T extends NewStopReport>(report: T, standingMadeAt: number): T {
  const madeAt = Math.max(report.madeAt, standingMadeAt + 1);
  return { ...report, madeAt, endsAt: report.endsAt + (madeAt - report.madeAt) };
}

const reward = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('encounter'),
    name: z.string(),
    key: z.string().nullable(),
    dex: z.number().int().nullable(),
    shiny: z.boolean(),
    cp: z.object({ min: z.number(), max: z.number() }).nullable(),
    image: z.string().nullable(),
    // A version's costumed reward (plan 8R-5, review W1); kept only where set.
    costumed: z.literal(true).optional(),
  }),
  z.object({
    kind: z.literal('item'),
    item: z.string(),
    name: z.string(),
    quantity: z.number(),
    image: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('energy'),
    dex: z.number().int().nullable(),
    name: z.string(),
    quantity: z.number(),
    image: z.string().nullable(),
  }),
]);

/** The rewards of a task as a document keeps them (`ResearchTask.rewards`, a report's detail). */
export const rewardsDocument = z.array(reward);

/** What a research report's `detail` holds. */
const researchDocument = z.object({
  text: z.string(),
  category: z.string().nullable(),
  rewards: rewardsDocument,
  typed: z.boolean(),
});

/** What a Rocket report's `detail` holds (plan 8R-2; a lineup's first slot, plan 8R-4L). */
const rocketDocument = z.object({
  name: z.string(),
  catches: catchesDocument,
  lineup: z.string().optional(),
});

const KINDS: ReadonlySet<string> = new Set<StopReportKind>(['research', 'rocket']);

/** A JSON column as the driver gives it: parsed already, or text. */
function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** The `StopReport` table. */
export class StopReportRepository implements StopReportStorage {
  /** `log` hears of a row that cannot be read (left out and left alone). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  /** A row as a report; undefined (logged) for one of a kind or a detail this version cannot read. */
  private read(row: Selectable<StopReportRow>): StopReport | undefined {
    const detail = parsedJson(row.detail);
    const research = row.kind === 'research' ? researchDocument.safeParse(detail) : undefined;
    const rocket = row.kind === 'rocket' ? rocketDocument.safeParse(detail) : undefined;
    if (!KINDS.has(row.kind) || !(research?.success ?? rocket?.success ?? false)) {
      this.log?.warn(
        { report: row.id, kind: row.kind },
        'a stop report cannot be read; left alone',
      );
      return undefined;
    }
    const base = {
      id: row.id,
      serverId: row.serverId,
      stop: {
        key: row.stopKey,
        name: row.stopName,
        address: row.stopAddress,
        image: row.stopImage,
        lat: row.lat,
        lon: row.lon,
      },
      periodKey: row.periodKey,
      endsAt: Number(row.endsAt),
      subjectKey: row.subjectKey,
      reporter: { id: row.reporterId, name: row.reporterName },
      madeAt: Number(row.madeAt),
    };
    if (rocket?.success) return { ...base, kind: 'rocket', rocket: rocket.data };
    if (research?.success) return { ...base, kind: 'research', research: research.data };
    return undefined;
  }

  private columns(report: NewStopReport) {
    return {
      serverId: report.serverId,
      stopKey: report.stop.key,
      kind: report.kind,
      periodKey: report.periodKey,
      endsAt: String(report.endsAt),
      stopName: report.stop.name,
      stopAddress: report.stop.address,
      stopImage: report.stop.image,
      lat: report.stop.lat,
      lon: report.stop.lon,
      subjectKey: report.subjectKey,
      detail: JSON.stringify(report.kind === 'research' ? report.research : report.rocket),
      reporterId: report.reporter.id,
      reporterName: report.reporter.name,
      madeAt: String(report.madeAt),
    };
  }

  /**
   * In a transaction of its own (read committed: a report not there yet locks no gap), the row of
   * the report's identity locked when it is there, then replaced or made. Two first reports of a
   * stop at once: one insert meets the other's row (a duplicate) and the whole runs again, then
   * replacing it.
   */
  async save(report: NewStopReport): Promise<SavedStopReport> {
    const outcome = await this.saveUnless(report, () => 'replace');
    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
    return outcome;
  }

  /**
   * As `save`; `decide` is asked inside the transaction, with the standing row locked. Two first
   * reports at once: the one whose insert meets the other's row runs again, and is asked then.
   * The retry also covers the update in place (plan 8R-4L): a report of yesterday changed into
   * today's period can meet a first report of today made meanwhile, and is asked again then.
   */
  async saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict,
    standingAt?: number,
  ): Promise<SaveOutcome> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await retryOnDeadlock(this.db, () =>
          inTransaction(this.db, (trx) => this.saveIn(trx, report, decide, standingAt), {
            isolation: 'read committed',
          }),
        );
      } catch (err) {
        if (attempt >= 3 || !isDuplicateEntry(err, 'stopreport_identity_unique')) throw err;
      }
    }
  }

  private async saveIn(
    trx: Kysely<DB>,
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict,
    standingAt: number | undefined,
  ): Promise<SaveOutcome> {
    // The row of the report's identity, and with `standingAt` every row of the stop and kind
    // still standing then, whatever its period: all locked, the latest standing one asked about.
    const rows = await trx
      .selectFrom('StopReport')
      .selectAll()
      .where('serverId', '=', report.serverId)
      .where('stopKey', '=', report.stop.key)
      .where('kind', '=', report.kind)
      .where((eb) =>
        standingAt === undefined
          ? eb('periodKey', '=', report.periodKey)
          : eb.or([eb('periodKey', '=', report.periodKey), eb('endsAt', '>', String(standingAt))]),
      )
      .orderBy('madeAt')
      .orderBy('id')
      .forUpdate()
      .execute();
    const live =
      standingAt === undefined ? [] : rows.filter((row) => Number(row.endsAt) > standingAt);
    const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
    const standing = before && this.read(before);
    const verdict = standing ? decide(standing) : 'replace';
    if (standing && verdict === 'keep') return { saved: false, standing };
    // Changed in place (plan 8R-4L): the standing row keeps its id and takes the new report's
    // columns; the other rows of its place go first, so that its period is free to take.
    const kept = standing && verdict === 'update' ? standing.id : undefined;
    // A replacement is a report of its own (review A1): the replaced row is deleted and a new one
    // made, under the same lock, so an id never changes what it is; an old answer's Take back or
    // "Same task at more stops…" finds its report gone.
    const gone = rows.filter((row) => row.id !== kept).map((row) => row.id);
    if (gone.length > 0) await trx.deleteFrom('StopReport').where('id', 'in', gone).execute();
    if (standing && kept !== undefined) {
      // A version strictly newer than the one it changes (F1): the order of the writes of one id
      // is the order of `madeAt`, whatever clock each report read.
      const written = newerThan(report, standing.madeAt);
      await trx
        .updateTable('StopReport')
        .set(this.columns(written))
        .where('id', '=', kept)
        .execute();
      return { saved: true, inPlace: true, report: { ...written, id: kept }, replaced: standing };
    }
    const made = await trx
      .insertInto('StopReport')
      .values(this.columns(report))
      .executeTakeFirstOrThrow();
    const id = Number(made.insertId);
    return { saved: true, inPlace: false, report: { ...report, id }, replaced: standing };
  }

  async byId(id: number): Promise<StopReport | undefined> {
    const row = await this.db
      .selectFrom('StopReport')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && this.read(row);
  }

  async standing(serverId: string, now: number): Promise<StopReport[]> {
    const rows = await this.db
      .selectFrom('StopReport')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('endsAt', '>', String(now))
      .orderBy('madeAt')
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => this.read(row) ?? []);
  }

  async serversStanding(now: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('StopReport')
      .select('serverId')
      .distinct()
      .where('endsAt', '>', String(now))
      .orderBy('serverId')
      .execute();
    return rows.map((row) => row.serverId);
  }

  async latestBy(
    serverId: string,
    memberId: string,
    since: number,
  ): Promise<StopReport | undefined> {
    const row = await this.db
      .selectFrom('StopReport')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('reporterId', '=', memberId)
      .where('madeAt', '>=', String(since))
      .orderBy('madeAt', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row && this.read(row);
  }

  async remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('StopReport')
        .selectAll()
        .where('id', '=', id)
        .where('serverId', '=', serverId)
        .forUpdate()
        .executeTakeFirst();
      if (!row || (madeAt !== undefined && Number(row.madeAt) !== madeAt)) return undefined;
      await trx.deleteFrom('StopReport').where('id', '=', id).execute();
      return this.read(row);
    });
  }

  async removeEnded(before: number): Promise<number> {
    const result = await this.db
      .deleteFrom('StopReport')
      .where('endsAt', '<=', String(before))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
