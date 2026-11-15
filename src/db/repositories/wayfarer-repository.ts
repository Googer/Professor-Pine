import { sql, type Kysely, type Selectable } from 'kysely';
import {
  isReviewDecision,
  isReviewKind,
  readCandidates,
  readImportCounts,
  REVIEW_KINDS,
  type ImportCounts,
  type QueuedReview,
  type ReviewDecision,
  type ReviewItem,
  type ReviewKind,
} from '../../domain/wayspots/review.js';
import { inTransaction } from '../transaction.js';
import type { DB, GymReview, WayspotImport } from '../types.js';

/** What Pine knows of a gym's Wayspot beside its `pogoId`; a gym without a row has the defaults. */
export interface WayfarerRecord {
  gymId: number;
  /** When an import last found the gym's Wayspot, epoch milliseconds. */
  lastSeen: number | null;
  /** Staff said the gym is not in Wayfarer (a sponsored gym): it is never queued again. */
  notInWayfarer: boolean;
  /** Snowflake of who said so. */
  notInWayfarerBy: string | null;
  notInWayfarerAt: number | null;
}

/** An import as it is recorded. */
export interface WayspotImportRow {
  /** Row id of the server (`Guild.id`), not its snowflake. */
  guildId: number;
  /** Snowflake of the staff member who imported. */
  staffId: string;
  importedAt: number;
  /** When the export tool's run started and finished, as the file says. */
  startedAt: number | null;
  finishedAt: number | null;
  counts: ImportCounts;
}

export interface StoredImport extends WayspotImportRow {
  id: number;
}

/** An item of the review queue, open or decided. */
export interface StoredReview extends ReviewItem {
  id: number;
  /** The gym's `pogoId` when the item was queued or last refreshed. */
  gymPogoId: string | null;
  /** Row id of the server (`Guild.id`). */
  guildId: number;
  /** The import that queued it last; null when that import's row is gone. */
  importId: number | null;
  createdAt: number;
  /** Its place in the queue: when it was queued first or skipped last. */
  queuedAt: number;
  /** Null while the item is open. */
  decision: ReviewDecision | null;
  decidedAt: number | null;
  /** Snowflake of who decided; null for an import that resolved it. */
  decidedBy: string | null;
}

/** A row that could not be read; it is left out and left alone. */
export interface UnreadableWayfarerRow {
  table: 'GymReview' | 'WayspotImport';
  id: number;
  problem: string;
}

/** Open items of a server by kind. */
export type ReviewCounts = Record<ReviewKind, number>;

/**
 * What the Wayfarer import and the review queue need of storage; lets tests keep it in memory
 * (`MemoryWayfarer`). Every method that takes a server's row id reads and changes only that
 * server's items, whatever ids it is given.
 */
export interface WayfarerStorage {
  /** The records of those of these gyms that have one. */
  records(gymIds: readonly number[]): Promise<Map<number, WayfarerRecord>>;
  /** Notes that an import found these gyms' Wayspots at `at`. */
  seen(gymIds: readonly number[], at: number): Promise<void>;
  /** Marks a gym as not in Wayfarer, by whom and when. */
  markNotInWayfarer(gymId: number, by: string, at: number): Promise<void>;
  /** Takes the mark "not in Wayfarer" off these gyms (Wayfarer has them after all). */
  clearNotInWayfarer(gymIds: readonly number[]): Promise<void>;
  /** Records an import; answers its id. */
  addImport(row: WayspotImportRow): Promise<number>;
  /** The newest import of a server that can be read. */
  lastImport(guildId: number): Promise<StoredImport | undefined>;
  /** A server's open items in the order of the queue (`queuedAt`, then id). */
  openReviews(guildId: number): Promise<StoredReview[]>;
  /** The first of `openReviews`. */
  nextReview(guildId: number): Promise<StoredReview | undefined>;
  /** An item of this server, open or decided. */
  review(guildId: number, id: number): Promise<StoredReview | undefined>;
  /** How many items of each kind are open. */
  openCounts(guildId: number): Promise<ReviewCounts>;
  /**
   * The newest decided item of each of these gyms that has one (by when it was decided, then
   * id), that can be read: what staff answered last, with the question as it was asked. Of this
   * server's items only (plan 19B-2: a server's import reads its own gyms' answers alone).
   */
  latestDecided(guildId: number, gymIds: readonly number[]): Promise<Map<number, StoredReview>>;
  /**
   * Queues these items: a gym with an open item has its kind, candidates and `gymPogoId` replaced and is
   * tied to this import, keeping its place in the queue and when it was created; any other gym
   * gets a new item, queued at `now`.
   */
  saveReviews(
    guildId: number,
    importId: number | null,
    items: readonly QueuedReview[],
    now: number,
  ): Promise<void>;
  /** Closes the open items of these gyms; answers how many were closed. */
  closeReviews(
    guildId: number,
    gymIds: readonly number[],
    decision: ReviewDecision,
    by: string | null,
    now: number,
  ): Promise<number>;
  /** Closes one item; false when it is not an open item of this server. */
  decide(
    guildId: number,
    id: number,
    decision: ReviewDecision,
    by: string,
    now: number,
  ): Promise<boolean>;
  /** Puts an open item at the end of the queue; false when it is not an open item of this server. */
  skip(guildId: number, id: number, now: number): Promise<boolean>;
}

/** Rows written in one statement at most. */
const CHUNK = 500;
/** Open items read at a time while looking for the first one that can be read. */
const PAGE = 20;

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

const epoch = (value: string | null): number | null => (value === null ? null : Number(value));

/** The `GymWayfarer`, `WayspotImport` and `GymReview` tables. */
export class WayfarerRepository implements WayfarerStorage {
  private readonly reported = new Set<string>();

  /**
   * `unreadable` hears of a row of `GymReview` or `WayspotImport` that cannot be read (a kind,
   * a decision or a JSON document this version does not know), once per row.
   */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly unreadable: (row: UnreadableWayfarerRow) => void = () => undefined,
  ) {}

  async records(gymIds: readonly number[]): Promise<Map<number, WayfarerRecord>> {
    const records = new Map<number, WayfarerRecord>();
    for (const part of chunks([...new Set(gymIds)])) {
      const rows = await this.db
        .selectFrom('GymWayfarer')
        .selectAll()
        .where('gymId', 'in', part)
        .execute();
      for (const row of rows) {
        records.set(row.gymId, {
          gymId: row.gymId,
          lastSeen: epoch(row.lastSeen),
          notInWayfarer: row.notInWayfarer === 1,
          notInWayfarerBy: row.notInWayfarerBy,
          notInWayfarerAt: epoch(row.notInWayfarerAt),
        });
      }
    }
    return records;
  }

  async seen(gymIds: readonly number[], at: number): Promise<void> {
    const ids = [...new Set(gymIds)];
    if (ids.length === 0) return;
    await inTransaction(this.db, async (trx) => {
      for (const part of chunks(ids)) {
        await trx
          .insertInto('GymWayfarer')
          .values(part.map((gymId) => ({ gymId, lastSeen: String(at) })))
          // The row alias (MySQL 8.0.19 on), not `VALUES()`, which 8.0.20 deprecates.
          .modifyEnd(sql`as new on duplicate key update lastSeen = new.lastSeen`)
          .execute();
      }
    });
  }

  async markNotInWayfarer(gymId: number, by: string, at: number): Promise<void> {
    const marked = { notInWayfarer: 1, notInWayfarerBy: by, notInWayfarerAt: String(at) };
    await this.db
      .insertInto('GymWayfarer')
      .values({ gymId, ...marked })
      .onDuplicateKeyUpdate(marked)
      .execute();
  }

  async clearNotInWayfarer(gymIds: readonly number[]): Promise<void> {
    const ids = [...new Set(gymIds)];
    if (ids.length === 0) return;
    await inTransaction(this.db, async (trx) => {
      for (const part of chunks(ids)) {
        await trx
          .updateTable('GymWayfarer')
          .set({ notInWayfarer: 0, notInWayfarerBy: null, notInWayfarerAt: null })
          .where('gymId', 'in', part)
          .execute();
      }
    });
  }

  async addImport(row: WayspotImportRow): Promise<number> {
    const result = await this.db
      .insertInto('WayspotImport')
      .values({
        guildId: row.guildId,
        staffId: row.staffId,
        importedAt: String(row.importedAt),
        startedAt: row.startedAt === null ? null : String(row.startedAt),
        finishedAt: row.finishedAt === null ? null : String(row.finishedAt),
        counts: JSON.stringify(row.counts),
      })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async lastImport(guildId: number): Promise<StoredImport | undefined> {
    for (let offset = 0; ; offset += PAGE) {
      const rows = await this.db
        .selectFrom('WayspotImport')
        .selectAll()
        .where('guildId', '=', guildId)
        .orderBy('importedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(PAGE)
        .offset(offset)
        .execute();
      for (const row of rows) {
        const read = this.importOf(row);
        if (read) return read;
      }
      if (rows.length < PAGE) return undefined;
    }
  }

  async openReviews(guildId: number): Promise<StoredReview[]> {
    const rows = await this.open(guildId).execute();
    return this.readable(rows);
  }

  async nextReview(guildId: number): Promise<StoredReview | undefined> {
    for (let offset = 0; ; offset += PAGE) {
      const rows = await this.open(guildId).limit(PAGE).offset(offset).execute();
      const [first] = this.readable(rows);
      if (first) return first;
      if (rows.length < PAGE) return undefined;
    }
  }

  async review(guildId: number, id: number): Promise<StoredReview | undefined> {
    const row = await this.db
      .selectFrom('GymReview')
      .selectAll()
      .where('id', '=', id)
      .where('guildId', '=', guildId)
      .executeTakeFirst();
    return row ? this.reviewOf(row) : undefined;
  }

  async openCounts(guildId: number): Promise<ReviewCounts> {
    const rows = await this.db
      .selectFrom('GymReview')
      .select(['kind', (eb) => eb.fn.countAll<number | string>().as('items')])
      .where('guildId', '=', guildId)
      .where('openGymId', 'is not', null)
      .groupBy('kind')
      .execute();
    const counts = Object.fromEntries(REVIEW_KINDS.map((kind) => [kind, 0])) as ReviewCounts;
    for (const row of rows) {
      if (isReviewKind(row.kind)) counts[row.kind] = Number(row.items);
    }
    return counts;
  }

  async latestDecided(
    guildId: number,
    gymIds: readonly number[],
  ): Promise<Map<number, StoredReview>> {
    const latest = new Map<number, StoredReview>();
    for (const part of chunks([...new Set(gymIds)])) {
      const rows = await this.db
        .selectFrom('GymReview')
        .selectAll()
        .where('guildId', '=', guildId)
        .where('gymId', 'in', part)
        .where('decision', 'is not', null)
        .orderBy('decidedAt', 'desc')
        .orderBy('id', 'desc')
        .execute();
      for (const item of this.readable(rows)) latest.getOrInsert(item.gymId, item);
    }
    return latest;
  }

  async saveReviews(
    guildId: number,
    importId: number | null,
    items: readonly QueuedReview[],
    now: number,
  ): Promise<void> {
    if (items.length === 0) return;
    await inTransaction(this.db, async (trx) => {
      for (const part of chunks(items)) {
        await trx
          .insertInto('GymReview')
          .values(
            part.map((item) => ({
              guildId,
              gymId: item.gymId,
              openGymId: item.gymId,
              kind: item.kind,
              candidates: JSON.stringify(item.candidates),
              gymPogoId: item.gymPogoId ?? null,
              importId,
              createdAt: String(now),
              queuedAt: String(now),
            })),
          )
          // The unique key (guildId, openGymId) finds the gym's open item: it keeps its id,
          // createdAt and queuedAt. The row alias (MySQL 8.0.19 on), not `VALUES()`.
          .modifyEnd(
            sql`as new on duplicate key update kind = new.kind, candidates = new.candidates,
              gymPogoId = new.gymPogoId, importId = new.importId`,
          )
          .execute();
      }
    });
  }

  async closeReviews(
    guildId: number,
    gymIds: readonly number[],
    decision: ReviewDecision,
    by: string | null,
    now: number,
  ): Promise<number> {
    const ids = [...new Set(gymIds)];
    if (ids.length === 0) return 0;
    return inTransaction(this.db, async (trx) => {
      let closed = 0;
      for (const part of chunks(ids)) {
        const result = await trx
          .updateTable('GymReview')
          .set({ openGymId: null, decision, decidedBy: by, decidedAt: String(now) })
          .where('guildId', '=', guildId)
          .where('openGymId', 'in', part)
          .executeTakeFirst();
        closed += Number(result.numUpdatedRows);
      }
      return closed;
    });
  }

  async decide(
    guildId: number,
    id: number,
    decision: ReviewDecision,
    by: string,
    now: number,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('GymReview')
      .set({ openGymId: null, decision, decidedBy: by, decidedAt: String(now) })
      .where('id', '=', id)
      .where('guildId', '=', guildId)
      .where('openGymId', 'is not', null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async skip(guildId: number, id: number, now: number): Promise<boolean> {
    // The driver counts matched rows, so an item skipped twice in one millisecond still counts.
    const result = await this.db
      .updateTable('GymReview')
      .set({ queuedAt: String(now) })
      .where('id', '=', id)
      .where('guildId', '=', guildId)
      .where('openGymId', 'is not', null)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  private open(guildId: number) {
    return this.db
      .selectFrom('GymReview')
      .selectAll()
      .where('guildId', '=', guildId)
      .where('openGymId', 'is not', null)
      .orderBy('queuedAt')
      .orderBy('id');
  }

  private readable(rows: Selectable<GymReview>[]): StoredReview[] {
    return rows.flatMap((row) => this.reviewOf(row) ?? []);
  }

  private report(row: UnreadableWayfarerRow): undefined {
    const key = `${row.table}:${String(row.id)}`;
    if (!this.reported.has(key)) {
      this.reported.add(key);
      this.unreadable(row);
    }
    return undefined;
  }

  private reviewOf(row: Selectable<GymReview>): StoredReview | undefined {
    const fail = (problem: string) => this.report({ table: 'GymReview', id: row.id, problem });
    if (!isReviewKind(row.kind)) return fail(`kind "${row.kind}"`);
    let decision: ReviewDecision | null = null;
    if (row.decision !== null) {
      if (!isReviewDecision(row.decision)) return fail(`decision "${row.decision}"`);
      decision = row.decision;
    }
    const candidates = readCandidates(row.candidates);
    if (!candidates.ok) return fail(`candidates: ${candidates.problem}`);
    return {
      id: row.id,
      guildId: row.guildId,
      gymId: row.gymId,
      kind: row.kind,
      candidates: candidates.value,
      gymPogoId: row.gymPogoId,
      importId: row.importId,
      createdAt: Number(row.createdAt),
      queuedAt: Number(row.queuedAt),
      decision,
      decidedAt: epoch(row.decidedAt),
      decidedBy: row.decidedBy,
    };
  }

  private importOf(row: Selectable<WayspotImport>): StoredImport | undefined {
    const counts = readImportCounts(row.counts);
    if (!counts.ok) {
      return this.report({
        table: 'WayspotImport',
        id: row.id,
        problem: `counts: ${counts.problem}`,
      });
    }
    return {
      id: row.id,
      guildId: row.guildId,
      staffId: row.staffId,
      importedAt: Number(row.importedAt),
      startedAt: epoch(row.startedAt),
      finishedAt: epoch(row.finishedAt),
      counts: counts.value,
    };
  }
}
