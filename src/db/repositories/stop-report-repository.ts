import { sql, type Insertable, type Kysely, type Selectable } from 'kysely';
import { z } from 'zod';
import {
  confirmedWith,
  detailWithoutMembers,
  endingOfRow,
  reportCell,
  takeBackEnding,
  type ReportEnding,
  type StopReportRecord,
  type TakeBackBy,
} from '../../domain/stops/report-history.js';
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
 * What `saveUnless`'s `decide` says of the report standing in its place (plan 8H-2): the verdict;
 * how that report ends where the save takes it (`ending`, decided by the domain: review H1; any
 * other row the save takes, and one whose end had passed, ends as `endingOfRow` says); and
 * whether the new report's member confirms it (`confirms`: on `keep` they are added to its
 * `confirmedBy`, on `replace` they count for its record; each member once, never its own
 * reporter). A bare verdict ends nothing as decided and confirms nothing.
 */
export interface StandingDecision {
  verdict: StandingVerdict;
  ending?: ReportEnding;
  confirms?: boolean;
}

/**
 * Where a report's stop lies, fixed when it is made (plan 8H-2): the S2 cell of level 14
 * (`cellToken`), and the ids of the regions whose outlines held it (null where they could not be
 * read). Kept on the live row and copied into its record when it ends.
 */
export interface ReportPlace {
  cell: string;
  regionIds: readonly number[] | null;
}

/** How a save is made (`saveUnless`). */
export interface SaveOptions {
  /**
   * A report of the same server, stop and kind that still stands at that time in another period
   * (a grunt of yesterday past midnight) counts as standing in its place too (fix A2). Also the
   * moment the reports the save takes away end, where it is later than the report's `madeAt`.
   */
  standingAt?: number;
  /** Where the report's stop lies; none for a row kept as the rows of before migration 036. */
  place?: ReportPlace;
  /**
   * The version of a hideout put back (`StopReportService.restore`, review H4): its record,
   * written when the grunt took its place, is forgotten in the same transaction, so that it
   * never counts twice, and its cell and regions are the new row's (P4; `place` only where no
   * record is kept, else the stop's cell and no regions known). Not behind the savepoint (P3):
   * where forgetting it fails, the save fails, and the caller takes the grunt back.
   */
  restoring?: { id: number; madeAt: number };
}

/**
 * Why a report is taken back (`remove`, review H8): by whom, as whom (`TakeBackBy`), and when; the
 * ending of its record follows (`takeBackEnding`).
 */
export interface Removal {
  by: string;
  as: TakeBackBy;
  at: number;
}

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
  save(report: NewStopReport, options?: SaveOptions): Promise<SavedStopReport>;
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
   *
   * Every version the save takes away is recorded (plan 8H-2, `StopReportHistory`) in the same
   * transaction, behind a savepoint: a record that fails is logged and lost, and the report is
   * saved all the same (review H11). A `keep` that confirms adds the member to the standing
   * report's `confirmedBy`, leaving its version (`madeAt`) as it is.
   */
  saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict | StandingDecision,
    options?: SaveOptions,
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
   * place keeps its id, so its version is the id and `madeAt`); another is left as it is. Its
   * record (plan 8H-2) ends as `why` says, behind a savepoint, as `saveUnless` writes them.
   */
  remove(
    id: number,
    serverId: string,
    why: Removal,
    madeAt?: number,
  ): Promise<StopReport | undefined>;
  /**
   * Forgets the reports that ended at or before `before`, each recorded as `stood` (plan 8H-2),
   * in batches of one transaction each (`SWEEP_BATCH`): a batch whose records fail is tried row
   * by row, and a row whose record fails is kept back for the next sweep and logged (review H10,
   * P7; after `ONE_BY_ONE_FAILURES` failures in a row the rest of the batch is kept back unread,
   * logged once). Gives how many it forgot; throws only where the ended rows cannot be read.
   */
  removeEnded(before: number): Promise<number>;
  /**
   * Says how a version's record ended after all, where it ended as one of `from` (plan 8H-2: a
   * grunt seen by nobody is `unposted`; `StopReportService` says from which endings, 8H2-1,
   * 8H2-2). False where no such record of that version is kept (it failed, the report still
   * stands, or it ended otherwise).
   */
  endedAs(
    id: number,
    madeAt: number,
    ending: ReportEnding,
    from: readonly ReportEnding[],
  ): Promise<boolean>;
  /**
   * The records of a server's reports that ended (plan 8H-2), oldest record first. For tests: no
   * surface reads the history yet.
   */
  historyOf(serverId: string): Promise<StopReportRecord[]>;
}

/**
 * How many rows in a row the sweep's row-by-row pass may fail before it keeps the rest of the
 * batch back unread (R2): a failure that hits every row costs a few lines of the log, not one per
 * row.
 */
export const ONE_BY_ONE_FAILURES = 5;

/** How many ended reports one transaction of the sweep records and forgets. */
export const SWEEP_BATCH = 500;

/** A decision as `saveUnless` reads it: a bare verdict ends nothing as decided. */
export function decisionOf(decided: StandingVerdict | StandingDecision): StandingDecision {
  return typeof decided === 'string' ? { verdict: decided } : decided;
}

/**
 * The moment a save takes reports away (plan 8H-2): the report's own `madeAt` (a refine's
 * written version, `newerThan`), or `standingAt` where that is later (a hideout put back keeps
 * its old `madeAt`, and the grunt in its place ends now).
 */
export function savedAt(madeAt: number, standingAt: number | undefined): number {
  return standingAt === undefined ? madeAt : Math.max(madeAt, standingAt);
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

/** Member ids in a JSON column (`confirmedBy`); none for null or a value that is no such list. */
function memberIds(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(parsedJson(value));
  return parsed.success ? parsed.data : [];
}

/** Region ids in a JSON column (`regionIds`); null for null or a value that is no list of ids. */
function regionIdsOf(value: unknown): number[] | null {
  const parsed = z.array(z.number().int()).safeParse(parsedJson(value));
  return parsed.success ? parsed.data : null;
}

/**
 * What a save or a take-back meant to record and lost with its transaction (P1): a failure whose
 * rollback to the savepoint failed too (another failure, or a deadlock, took the transaction).
 */
interface Lost {
  err?: unknown;
  reports?: number[];
}

/** A row that a save, a take-back or the sweep takes away, and how its record ends. */
interface Ended {
  row: Selectable<StopReportRow>;
  ending: ReportEnding;
  endedAt: number;
  /** A member whose report confirmed it as it went (a narrowing by another: review H6). */
  confirmedBy?: string;
}

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

  private columns(report: NewStopReport, place: ReportPlace | undefined) {
    return {
      cell: place?.cell ?? null,
      regionIds: place?.regionIds ? JSON.stringify(place.regionIds) : null,
      // A version of its own: who confirmed the one before do not confirm it (review H15).
      confirmedBy: null,
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
  async save(report: NewStopReport, options: SaveOptions = {}): Promise<SavedStopReport> {
    const outcome = await this.saveUnless(report, () => 'replace', options);
    if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
    return outcome;
  }

  /**
   * As `save`; `decide` is asked inside the transaction, with the standing row locked. Two first
   * reports at once: the one whose insert meets the other's row runs again, and is asked then.
   * The retry also covers the update in place (plan 8R-4L): a report of yesterday changed into
   * today's period can meet a first report of today made meanwhile, and is asked again then.
   *
   * Where a record's failure took the transaction with it (its savepoint gone, P1, as
   * `PartyRepository` meets it): a deadlock runs the whole again; any other failure runs the save
   * once more without its records, which are logged as lost.
   */
  async saveUnless(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict | StandingDecision,
    options: SaveOptions = {},
  ): Promise<SaveOutcome> {
    const lost: Lost = {};
    try {
      return await this.trySave(report, decide, options, lost);
    } catch (err) {
      if (lost.err === undefined) throw err;
      this.lostRecords(lost);
      return this.trySave(report, decide, options, undefined);
    }
  }

  /** Logs the records a failure took with its transaction (P1). */
  private lostRecords(lost: Lost): void {
    this.log?.error(
      { err: lost.err, reports: lost.reports },
      'could not record stop reports that ended; saved without their records',
    );
  }

  /** `saveUnless` once, with its records (`lost` says what a failure took) or without. */
  private async trySave(
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict | StandingDecision,
    options: SaveOptions,
    lost: Lost | undefined,
  ): Promise<SaveOutcome> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await retryOnDeadlock(this.db, () => {
          // A run again starts afresh: what the run before lost went with its transaction.
          if (lost) delete lost.err;
          return inTransaction(this.db, (trx) => this.saveIn(trx, report, decide, options, lost), {
            isolation: 'read committed',
          });
        });
      } catch (err) {
        if (attempt >= 3 || !isDuplicateEntry(err, 'stopreport_identity_unique')) throw err;
      }
    }
  }

  private async saveIn(
    trx: Kysely<DB>,
    report: NewStopReport,
    decide: (standing: StopReport) => StandingVerdict | StandingDecision,
    { standingAt, place, restoring }: SaveOptions,
    lost: Lost | undefined,
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
    const decision: StandingDecision = standing
      ? decisionOf(decide(standing))
      : { verdict: 'replace' };
    if (standing && before && decision.verdict === 'keep') {
      if (decision.confirms) await this.confirm(trx, before, report.reporter.id);
      return { saved: false, standing };
    }
    // Changed in place (plan 8R-4L): the standing row keeps its id and takes the new report's
    // columns; the other rows of its place go first, so that its period is free to take.
    const kept = standing && decision.verdict === 'update' ? standing.id : undefined;
    // A version strictly newer than the one it changes (F1): the order of the writes of one id
    // is the order of `madeAt`, whatever clock each read.
    const written = standing && kept !== undefined ? newerThan(report, standing.madeAt) : report;
    const at = savedAt(written.madeAt, standingAt);
    // Every version that goes is recorded (plan 8H-2): the row decided about as decided (a
    // refine ends the version before it), any other as `endingOfRow` says.
    const ended = rows.map((row): Ended => ({
      row,
      ...endingOfRow(
        { endsAt: Number(row.endsAt) },
        at,
        row === before ? decision.ending : undefined,
      ),
      ...(row === before && decision.confirms ? { confirmedBy: report.reporter.id } : {}),
    }));
    // A hideout put back forgets its record and takes its place (P3, P4: not behind the savepoint).
    const placed = restoring
      ? ((await forgetRecord(trx, restoring)) ??
        place ?? { cell: reportCell(report.stop), regionIds: null })
      : place;
    await this.recordBehindSavepoint(trx, ended, lost);
    // A replacement is a report of its own (review A1): the replaced row is deleted and a new one
    // made, under the same lock, so an id never changes what it is; an old answer's Take back or
    // "Same task at more stops…" finds its report gone.
    const gone = rows.filter((row) => row.id !== kept).map((row) => row.id);
    if (gone.length > 0) await trx.deleteFrom('StopReport').where('id', 'in', gone).execute();
    if (standing && kept !== undefined) {
      await trx
        .updateTable('StopReport')
        .set(this.columns(written, placed))
        .where('id', '=', kept)
        .execute();
      return { saved: true, inPlace: true, report: { ...written, id: kept }, replaced: standing };
    }
    const made = await trx
      .insertInto('StopReport')
      .values(this.columns(report, placed))
      .executeTakeFirstOrThrow();
    const id = Number(made.insertId);
    return { saved: true, inPlace: false, report: { ...report, id }, replaced: standing };
  }

  /**
   * Adds a member to who confirmed the standing version (review H6), each once, never its own
   * reporter; its `madeAt` stays, so the version is the same.
   */
  private async confirm(
    trx: Kysely<DB>,
    row: Selectable<StopReportRow>,
    member: string,
  ): Promise<void> {
    const before = memberIds(row.confirmedBy);
    const after = confirmedWith(before, member, row.reporterId);
    if (after === before) return;
    await trx
      .updateTable('StopReport')
      .set({ confirmedBy: JSON.stringify(after) })
      .where('id', '=', row.id)
      .execute();
  }

  /**
   * Records the versions that end in the caller's transaction, behind a savepoint (review H11):
   * what fails is rolled back alone and logged, and the report's own write goes on. Where the
   * rollback to the savepoint fails too (P1: the failure took the transaction with it), the
   * failure itself is thrown, so that a deadlock is run again whole, and `lost` keeps it for the
   * run without records. No `lost`: that run, which records nothing.
   */
  private async recordBehindSavepoint(
    trx: Kysely<DB>,
    ended: readonly Ended[],
    lost: Lost | undefined,
  ): Promise<void> {
    if (ended.length === 0 || lost === undefined) return;
    const reports = ended.map(({ row }) => row.id);
    await sql`savepoint stop_report_history`.execute(trx);
    try {
      await record(trx, ended);
      await sql`release savepoint stop_report_history`.execute(trx);
    } catch (err) {
      try {
        await sql`rollback to savepoint stop_report_history`.execute(trx);
      } catch {
        lost.err = err;
        lost.reports = reports;
        throw err;
      }
      this.log?.error(
        { err, reports },
        'could not record stop reports that ended; their records are lost',
      );
    }
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

  /**
   * As `saveUnless` meets a failure that took its transaction (P1): a deadlock runs the whole
   * again, any other runs the take-back once more without its record, logged as lost.
   */
  async remove(
    id: number,
    serverId: string,
    why: Removal,
    madeAt?: number,
  ): Promise<StopReport | undefined> {
    const lost: Lost = {};
    try {
      return await this.tryRemove(id, serverId, why, madeAt, lost);
    } catch (err) {
      if (lost.err === undefined) throw err;
      this.lostRecords(lost);
      return this.tryRemove(id, serverId, why, madeAt, undefined);
    }
  }

  private tryRemove(
    id: number,
    serverId: string,
    why: Removal,
    madeAt: number | undefined,
    lost: Lost | undefined,
  ): Promise<StopReport | undefined> {
    return retryOnDeadlock(this.db, () => {
      if (lost) delete lost.err;
      return this.removeIn(id, serverId, why, madeAt, lost);
    });
  }

  private removeIn(
    id: number,
    serverId: string,
    why: Removal,
    madeAt: number | undefined,
    lost: Lost | undefined,
  ): Promise<StopReport | undefined> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('StopReport')
        .selectAll()
        .where('id', '=', id)
        .where('serverId', '=', serverId)
        .forUpdate()
        .executeTakeFirst();
      if (!row || (madeAt !== undefined && Number(row.madeAt) !== madeAt)) return undefined;
      // How it ends is read from the locked row: its reporter, as it stands now.
      const ending = takeBackEnding(row.reporterId, why.by, why.as);
      await this.recordBehindSavepoint(
        trx,
        [{ row, ...endingOfRow({ endsAt: Number(row.endsAt) }, why.at, ending) }],
        lost,
      );
      await trx.deleteFrom('StopReport').where('id', '=', id).execute();
      return this.read(row);
    });
  }

  async removeEnded(before: number): Promise<number> {
    let forgotten = 0;
    // The rows whose own records failed in this sweep: kept for the next one (P7).
    const keptBack = new Set<number>();
    for (;;) {
      let batch: { seen: number; forgotten: number };
      try {
        batch = await retryOnDeadlock(this.db, () => this.sweepBatch(before, keptBack));
      } catch (err) {
        this.log?.error(
          { err },
          'could not record a batch of ended stop reports; trying them one by one',
        );
        batch = await this.sweepOneByOne(before, keptBack);
      }
      forgotten += batch.forgotten;
      if (batch.seen < SWEEP_BATCH) return forgotten;
    }
  }

  /** The ended rows of a batch, in the order they ended (P6), those kept back left out. */
  private endedRows(trx: Kysely<DB>, before: number, keptBack: ReadonlySet<number>) {
    let query = trx.selectFrom('StopReport').where('endsAt', '<=', String(before));
    if (keptBack.size > 0) query = query.where('id', 'not in', [...keptBack]);
    // `stopreport_ends_index`: the rows locked in the order the index holds them.
    return query.orderBy('endsAt').orderBy('id').limit(SWEEP_BATCH);
  }

  /**
   * One batch in one transaction (read committed, P6: no gap is locked): the ended rows locked,
   * their records written, the rows deleted. No savepoint (review H10): records that fail keep
   * the batch's rows.
   */
  private sweepBatch(
    before: number,
    keptBack: ReadonlySet<number>,
  ): Promise<{ seen: number; forgotten: number }> {
    return inTransaction(
      this.db,
      async (trx) => {
        const rows = await this.endedRows(trx, before, keptBack).selectAll().forUpdate().execute();
        if (rows.length === 0) return { seen: 0, forgotten: 0 };
        await record(
          trx,
          rows.map((row) => ({
            row,
            ...endingOfRow({ endsAt: Number(row.endsAt) }, before, undefined),
          })),
        );
        const ids = rows.map((row) => row.id);
        await trx.deleteFrom('StopReport').where('id', 'in', ids).execute();
        return { seen: rows.length, forgotten: rows.length };
      },
      { isolation: 'read committed' },
    );
  }

  /**
   * A batch whose records failed, row by row (P7): each in a transaction of its own, so that a
   * row whose record fails keeps only itself back, for the next sweep (logged); after
   * `ONE_BY_ONE_FAILURES` in a row the rest is kept back unread, logged once with its count (R2).
   */
  private async sweepOneByOne(
    before: number,
    keptBack: Set<number>,
  ): Promise<{ seen: number; forgotten: number }> {
    const ids = (await this.endedRows(this.db, before, keptBack).select('id').execute()).map(
      (row) => row.id,
    );
    let forgotten = 0;
    let failures = 0;
    for (const [n, id] of ids.entries()) {
      if (failures >= ONE_BY_ONE_FAILURES) {
        const rest = ids.slice(n);
        for (const one of rest) keptBack.add(one);
        this.log?.error(
          { keptBack: rest.length },
          'gave up recording ended stop reports one by one; the rest are kept for the next sweep',
        );
        break;
      }
      try {
        const gone = await retryOnDeadlock(this.db, () =>
          inTransaction(
            this.db,
            async (trx) => {
              const row = await trx
                .selectFrom('StopReport')
                .selectAll()
                .where('id', '=', id)
                .where('endsAt', '<=', String(before))
                .forUpdate()
                .executeTakeFirst();
              if (!row) return false;
              await record(trx, [
                { row, ...endingOfRow({ endsAt: Number(row.endsAt) }, before, undefined) },
              ]);
              await trx.deleteFrom('StopReport').where('id', '=', id).execute();
              return true;
            },
            { isolation: 'read committed' },
          ),
        );
        if (gone) forgotten += 1;
        failures = 0;
      } catch (err) {
        failures += 1;
        keptBack.add(id);
        this.log?.error(
          { err, report: id },
          'could not record an ended stop report; it is kept for the next sweep',
        );
      }
    }
    return { seen: ids.length, forgotten };
  }

  async endedAs(
    id: number,
    madeAt: number,
    ending: ReportEnding,
    from: readonly ReportEnding[],
  ): Promise<boolean> {
    if (from.length === 0) return false;
    const changed = await this.db
      .updateTable('StopReportHistory')
      .set({ ending })
      .where('reportId', '=', id)
      .where('reportMadeAt', '=', String(madeAt))
      .where('ending', 'in', [...from])
      .executeTakeFirst();
    return changed.numUpdatedRows > 0n;
  }

  async historyOf(serverId: string): Promise<StopReportRecord[]> {
    const rows = await this.db
      .selectFrom('StopReportHistory')
      .selectAll()
      .where('serverId', '=', serverId)
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      reportId: row.reportId,
      reportMadeAt: Number(row.reportMadeAt),
      serverId: row.serverId,
      kind: row.kind,
      periodKey: row.periodKey,
      subjectKey: row.subjectKey,
      detail: parsedJson(row.detail),
      cell: row.cell,
      regionIds: regionIdsOf(row.regionIds),
      madeAt: Number(row.madeAt),
      endsAt: Number(row.endsAt),
      endedAt: Number(row.endedAt),
      reporterId: row.reporterId,
      confirmations: row.confirmations,
      // Written only from `ReportEnding`; read back for tests alone.
      ending: row.ending as ReportEnding,
    }));
  }
}

/**
 * Writes the records of rows that ended (plan 8H-2): copied raw, so that a row this version
 * cannot read is kept too, its detail without the members it names; the reporter only with their
 * opt-in to the server's history, read under a shared lock as a party's record reads it (an
 * opt-out under way finishes first, or waits for this and then takes the id out).
 */
async function record(trx: Kysely<DB>, ended: readonly Ended[]): Promise<void> {
  if (ended.length === 0) return;
  const optedIn = new Set<string>();
  for (const [serverId, members] of reportersByServer(ended)) {
    const rows = await trx
      .selectFrom('HistoryOptIn')
      .select('memberId')
      .where('serverId', '=', serverId)
      .where('memberId', 'in', members)
      .forShare()
      .execute();
    for (const { memberId } of rows) optedIn.add(`${serverId}:${memberId}`);
  }
  await trx
    .insertInto('StopReportHistory')
    .values(ended.map((one) => historyRow(one, optedIn)))
    .execute();
}

/** The reporters of rows by their server, each once. */
function reportersByServer(ended: readonly Ended[]): Map<string, string[]> {
  const servers = new Map<string, string[]>();
  for (const { row } of ended) {
    const members = servers.get(row.serverId) ?? [];
    if (!members.includes(row.reporterId)) members.push(row.reporterId);
    servers.set(row.serverId, members);
  }
  return servers;
}

/**
 * The record of a row that ended (plan 8H-2): its version, what it was of and where (the cell
 * and regions fixed when it was made; no stop), its times, the reporter only with their opt-in
 * (`optedIn`, `<server>:<member>`), how many other members confirmed it and how it ended.
 */
function historyRow(
  { row, ending, endedAt, confirmedBy }: Ended,
  optedIn: ReadonlySet<string>,
): Insertable<DB['StopReportHistory']> {
  const confirmed = memberIds(row.confirmedBy);
  const confirmations =
    confirmedBy === undefined ? confirmed : confirmedWith(confirmed, confirmedBy, row.reporterId);
  const regionIds = regionIdsOf(row.regionIds);
  return {
    reportId: row.id,
    reportMadeAt: row.madeAt,
    serverId: row.serverId,
    kind: row.kind,
    periodKey: row.periodKey,
    subjectKey: row.subjectKey,
    // Any JSON is walked: a detail this version cannot read is kept too (text that is no JSON
    // as a text).
    detail: JSON.stringify(detailWithoutMembers(parsedJson(row.detail) ?? row.detail)),
    cell: row.cell,
    regionIds: regionIds === null ? null : JSON.stringify(regionIds),
    madeAt: row.madeAt,
    endsAt: row.endsAt,
    endedAt: String(endedAt),
    reporterId: optedIn.has(`${row.serverId}:${row.reporterId}`) ? row.reporterId : null,
    confirmations: confirmations.length,
    ending,
  };
}

/**
 * Forgets the record of a hideout's version put back (review H4) and gives its place (P4), or
 * undefined where none is kept (it failed, or was forgotten already).
 */
async function forgetRecord(
  trx: Kysely<DB>,
  version: { id: number; madeAt: number },
): Promise<ReportPlace | undefined> {
  const kept = await trx
    .selectFrom('StopReportHistory')
    .select(['id', 'cell', 'regionIds'])
    .where('reportId', '=', version.id)
    .where('reportMadeAt', '=', String(version.madeAt))
    .forUpdate()
    .execute();
  if (kept.length === 0) return undefined;
  await trx
    .deleteFrom('StopReportHistory')
    .where(
      'id',
      'in',
      kept.map((one) => one.id),
    )
    .execute();
  const [first] = kept;
  return first === undefined || first.cell === null
    ? undefined
    : { cell: first.cell, regionIds: regionIdsOf(first.regionIds) };
}
