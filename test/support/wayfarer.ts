import type {
  ReviewCounts,
  StoredImport,
  StoredReview,
  UnreadableWayfarerRow,
  WayfarerRecord,
  WayfarerStorage,
  WayspotImportRow,
} from '../../src/db/repositories/wayfarer-repository.js';
import {
  isReviewDecision,
  isReviewKind,
  readCandidates,
  readImportCounts,
  REVIEW_KINDS,
  type QueuedReview,
  type ReviewDecision,
} from '../../src/domain/wayspots/review.js';

/** A row of `GymReview` as stored: its texts and JSON unchecked, as MySQL holds them. */
export interface MemoryReviewRow {
  id: number;
  guildId: number;
  gymId: number;
  openGymId: number | null;
  kind: string;
  candidates: unknown;
  gymPogoId: string | null;
  importId: number | null;
  createdAt: number;
  queuedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  decision: string | null;
}

/** A row of `WayspotImport` as stored. */
export interface MemoryImportRow extends Omit<WayspotImportRow, 'counts'> {
  id: number;
  counts: unknown;
}

/** A JSON value as it comes back from MySQL: a copy. */
const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/**
 * The Wayfarer tables kept in memory as `WayfarerRepository` keeps them, whose behaviour
 * wayfarer-repository.db.test.ts pins down for both. The rows are open to a test (`reviews`,
 * `imports`, `gymRecords`); `removeGym` does what the foreign keys do when a gym is deleted. Set
 * `failing` to make every call reject.
 */
export class MemoryWayfarer implements WayfarerStorage {
  failing: Error | undefined;
  readonly gymRecords = new Map<number, WayfarerRecord>();
  readonly reviews: MemoryReviewRow[] = [];
  readonly imports: MemoryImportRow[] = [];
  private readonly reported = new Set<string>();
  private nextReviewId = 1;
  private nextImportId = 1;

  constructor(
    private readonly unreadable: (row: UnreadableWayfarerRow) => void = () => undefined,
  ) {}

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  /** What the foreign keys do when a gym is deleted: its record and its items go. */
  removeGym(gymId: number): void {
    this.gymRecords.delete(gymId);
    for (let i = this.reviews.length - 1; i >= 0; i--) {
      if (this.reviews[i]?.gymId === gymId) this.reviews.splice(i, 1);
    }
  }

  records(gymIds: readonly number[]): Promise<Map<number, WayfarerRecord>> {
    return this.attempt(() => {
      const found = new Map<number, WayfarerRecord>();
      for (const id of gymIds) {
        const record = this.gymRecords.get(id);
        if (record) found.set(id, { ...record });
      }
      return found;
    });
  }

  seen(gymIds: readonly number[], at: number): Promise<void> {
    return this.attempt(() => {
      for (const gymId of gymIds) this.recordOf(gymId).lastSeen = at;
    });
  }

  markNotInWayfarer(gymId: number, by: string, at: number): Promise<void> {
    return this.attempt(() => {
      Object.assign(this.recordOf(gymId), {
        notInWayfarer: true,
        notInWayfarerBy: by,
        notInWayfarerAt: at,
      });
    });
  }

  clearNotInWayfarer(gymIds: readonly number[]): Promise<void> {
    return this.attempt(() => {
      for (const gymId of gymIds) {
        const record = this.gymRecords.get(gymId);
        if (record) {
          Object.assign(record, {
            notInWayfarer: false,
            notInWayfarerBy: null,
            notInWayfarerAt: null,
          });
        }
      }
    });
  }

  addImport(row: WayspotImportRow): Promise<number> {
    return this.attempt(() => {
      const id = this.nextImportId++;
      this.imports.push({ ...row, id, counts: stored(row.counts) });
      return id;
    });
  }

  lastImport(guildId: number): Promise<StoredImport | undefined> {
    return this.attempt(() => {
      const rows = this.imports
        .filter((row) => row.guildId === guildId)
        .sort((a, b) => b.importedAt - a.importedAt || b.id - a.id);
      for (const row of rows) {
        const read = this.importOf(row);
        if (read) return read;
      }
      return undefined;
    });
  }

  openReviews(guildId: number): Promise<StoredReview[]> {
    return this.attempt(() => this.openOf(guildId));
  }

  nextReview(guildId: number): Promise<StoredReview | undefined> {
    return this.attempt(() => this.openOf(guildId)[0]);
  }

  review(guildId: number, id: number): Promise<StoredReview | undefined> {
    return this.attempt(() => {
      const row = this.reviews.find((r) => r.id === id && r.guildId === guildId);
      return row ? this.reviewOf(row) : undefined;
    });
  }

  openCounts(guildId: number): Promise<ReviewCounts> {
    return this.attempt(() => {
      const counts = Object.fromEntries(REVIEW_KINDS.map((kind) => [kind, 0])) as ReviewCounts;
      for (const row of this.reviews) {
        if (row.guildId === guildId && row.openGymId !== null && isReviewKind(row.kind)) {
          counts[row.kind]++;
        }
      }
      return counts;
    });
  }

  latestDecided(guildId: number, gymIds: readonly number[]): Promise<Map<number, StoredReview>> {
    return this.attempt(() => {
      const ids = new Set(gymIds);
      const latest = new Map<number, StoredReview>();
      const rows = this.reviews
        .filter((row) => row.guildId === guildId && ids.has(row.gymId) && row.decision !== null)
        .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0) || b.id - a.id);
      for (const row of rows) {
        const item = this.reviewOf(row);
        if (item && !latest.has(item.gymId)) latest.set(item.gymId, item);
      }
      return latest;
    });
  }

  saveReviews(
    guildId: number,
    importId: number | null,
    items: readonly QueuedReview[],
    now: number,
  ): Promise<void> {
    return this.attempt(() => {
      for (const item of items) {
        const open = this.reviews.find(
          (row) => row.guildId === guildId && row.openGymId === item.gymId,
        );
        if (open) {
          Object.assign(open, {
            kind: item.kind,
            candidates: stored(item.candidates),
            gymPogoId: item.gymPogoId ?? null,
            importId,
          });
        } else {
          this.reviews.push({
            id: this.nextReviewId++,
            guildId,
            gymId: item.gymId,
            openGymId: item.gymId,
            kind: item.kind,
            candidates: stored(item.candidates),
            gymPogoId: item.gymPogoId ?? null,
            importId,
            createdAt: now,
            queuedAt: now,
            decidedAt: null,
            decidedBy: null,
            decision: null,
          });
        }
      }
    });
  }

  closeReviews(
    guildId: number,
    gymIds: readonly number[],
    decision: ReviewDecision,
    by: string | null,
    now: number,
  ): Promise<number> {
    return this.attempt(() => {
      const ids = new Set(gymIds);
      let closed = 0;
      for (const row of this.reviews) {
        if (row.guildId === guildId && row.openGymId !== null && ids.has(row.openGymId)) {
          this.close(row, decision, by, now);
          closed++;
        }
      }
      return closed;
    });
  }

  decide(
    guildId: number,
    id: number,
    decision: ReviewDecision,
    by: string,
    now: number,
  ): Promise<boolean> {
    return this.attempt(() => {
      const row = this.openRow(guildId, id);
      if (row) this.close(row, decision, by, now);
      return row !== undefined;
    });
  }

  skip(guildId: number, id: number, now: number): Promise<boolean> {
    return this.attempt(() => {
      const row = this.openRow(guildId, id);
      if (row) row.queuedAt = now;
      return row !== undefined;
    });
  }

  private recordOf(gymId: number): WayfarerRecord {
    let record = this.gymRecords.get(gymId);
    if (!record) {
      record = {
        gymId,
        lastSeen: null,
        notInWayfarer: false,
        notInWayfarerBy: null,
        notInWayfarerAt: null,
      };
      this.gymRecords.set(gymId, record);
    }
    return record;
  }

  private openRow(guildId: number, id: number): MemoryReviewRow | undefined {
    return this.reviews.find(
      (row) => row.id === id && row.guildId === guildId && row.openGymId !== null,
    );
  }

  private close(
    row: MemoryReviewRow,
    decision: ReviewDecision,
    by: string | null,
    now: number,
  ): void {
    Object.assign(row, { openGymId: null, decision, decidedBy: by, decidedAt: now });
  }

  private openOf(guildId: number): StoredReview[] {
    return this.reviews
      .filter((row) => row.guildId === guildId && row.openGymId !== null)
      .sort((a, b) => a.queuedAt - b.queuedAt || a.id - b.id)
      .flatMap((row) => this.reviewOf(row) ?? []);
  }

  private report(row: UnreadableWayfarerRow): undefined {
    const key = `${row.table}:${String(row.id)}`;
    if (!this.reported.has(key)) {
      this.reported.add(key);
      this.unreadable(row);
    }
    return undefined;
  }

  private reviewOf(row: MemoryReviewRow): StoredReview | undefined {
    const fail = (problem: string) => this.report({ table: 'GymReview', id: row.id, problem });
    if (!isReviewKind(row.kind)) return fail(`kind "${row.kind}"`);
    let decision: ReviewDecision | null = null;
    if (row.decision !== null) {
      if (!isReviewDecision(row.decision)) return fail(`decision "${row.decision}"`);
      decision = row.decision;
    }
    const candidates = readCandidates(stored(row.candidates));
    if (!candidates.ok) return fail(`candidates: ${candidates.problem}`);
    return {
      id: row.id,
      guildId: row.guildId,
      gymId: row.gymId,
      kind: row.kind,
      candidates: candidates.value,
      gymPogoId: row.gymPogoId,
      importId: row.importId,
      createdAt: row.createdAt,
      queuedAt: row.queuedAt,
      decision,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
    };
  }

  private importOf(row: MemoryImportRow): StoredImport | undefined {
    const counts = readImportCounts(stored(row.counts));
    if (!counts.ok) {
      return this.report({
        table: 'WayspotImport',
        id: row.id,
        problem: `counts: ${counts.problem}`,
      });
    }
    return { ...row, counts: counts.value };
  }
}
