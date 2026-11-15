import type {
  ShownSpawn,
  SpawnReportStorage,
  StandingSpawn,
  StoredSpawnReport,
  SweptSpawnReport,
} from '../../src/db/repositories/spawn-report-repository.js';

/**
 * The standing spawn reports kept in memory as `SpawnReportRepository` keeps them, whose
 * behaviour spawn-report-repository.db.test.ts pins down. Set `failing` to make every call
 * reject, `failingShown` a record with what the map shows of it.
 */
export class MemorySpawnReports implements SpawnReportStorage {
  failing: Error | undefined;
  /**
   * Set to make a record with what the map shows of it reject (the database refused one of its
   * values), a bare one still taken.
   */
  failingShown: Error | undefined;
  readonly rows: StoredSpawnReport[] = [];
  /** What the map shows of each report recorded with it, by message. */
  private readonly shown = new Map<string, ShownSpawn>();

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        try {
          resolve(work());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  add(report: StoredSpawnReport & { shown?: ShownSpawn }): Promise<void> {
    return this.attempt(() => {
      if (report.shown && this.failingShown) throw this.failingShown;
      if (!this.rows.some((row) => row.messageId === report.messageId)) {
        const { shown, ...stored } = report;
        this.rows.push(stored);
        if (shown) this.shown.set(report.messageId, structuredClone(shown));
      }
    });
  }

  standing(guildId: string, now: number): Promise<StandingSpawn[]> {
    return this.attempt(() =>
      this.rows
        .flatMap((row): StandingSpawn[] => {
          const shown = this.shown.get(row.messageId);
          return shown?.guildId === guildId && row.deleteAt > now
            ? [{ ...row, ...structuredClone(shown) }]
            : [];
        })
        .sort((a, b) => a.deleteAt - b.deleteAt || a.messageId.localeCompare(b.messageId)),
    );
  }

  remove(messageId: string): Promise<void> {
    return this.attempt(() => {
      const index = this.rows.findIndex((row) => row.messageId === messageId);
      if (index >= 0) this.rows.splice(index, 1);
      this.shown.delete(messageId);
    });
  }

  all(): Promise<SweptSpawnReport[]> {
    return this.attempt(() =>
      this.rows
        .map((row) => ({ ...row, guildId: this.shown.get(row.messageId)?.guildId ?? null }))
        .sort((a, b) => a.deleteAt - b.deleteAt || a.messageId.localeCompare(b.messageId)),
    );
  }
}
