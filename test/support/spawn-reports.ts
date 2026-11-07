import type {
  ShownSpawn,
  SpawnReportStorage,
  StandingSpawn,
  StoredSpawnReport,
} from '../../src/db/repositories/spawn-report-repository.js';

/**
 * The standing spawn reports kept in memory as `SpawnReportRepository` keeps them, whose
 * behaviour spawn-report-repository.db.test.ts pins down. Set `failing` to make every call
 * reject.
 */
export class MemorySpawnReports implements SpawnReportStorage {
  failing: Error | undefined;
  readonly rows: StoredSpawnReport[] = [];
  /** What the map shows of each report recorded with it, by message. */
  private readonly shown = new Map<string, ShownSpawn>();

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  add(report: StoredSpawnReport & { shown?: ShownSpawn }): Promise<void> {
    return this.attempt(() => {
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

  all(): Promise<StoredSpawnReport[]> {
    return this.attempt(() =>
      this.rows
        .map((row) => ({ ...row }))
        .sort((a, b) => a.deleteAt - b.deleteAt || a.messageId.localeCompare(b.messageId)),
    );
  }
}
