import type { NewTrainStorage } from '../../src/db/repositories/new-train-repository.js';

/**
 * Who asked to be told of new trains, kept in memory as `NewTrainRepository` keeps it, whose
 * behaviour new-train-repository.db.test.ts pins down. Set `failing` to make every call reject.
 */
export class MemoryNewTrains implements NewTrainStorage {
  failing: Error | undefined;
  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private index(memberId: string, guildId: string): number {
    return this.rows.findIndex((row) => row.memberId === memberId && row.guildId === guildId);
  }

  isOn(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() => this.index(memberId, guildId) >= 0);
  }

  set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean> {
    return this.attempt(() => {
      const at = this.index(memberId, guildId);
      if (on === at >= 0) return false;
      if (on) this.rows.push({ memberId, guildId, createdAt: now });
      else this.rows.splice(at, 1);
      return true;
    });
  }

  wanting(guildId: string): Promise<string[]> {
    return this.attempt(() =>
      this.rows
        .filter((row) => row.guildId === guildId)
        .sort((a, b) => a.createdAt - b.createdAt || (a.memberId < b.memberId ? -1 : 1))
        .map((row) => row.memberId),
    );
  }
}
