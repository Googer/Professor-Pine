import type { UnownGiftStorage } from '../../src/db/repositories/unown-gift-repository.js';

/**
 * The record of settled Unown wants kept in memory as `UnownGiftRepository` keeps it, whose
 * behaviour unown-gift-repository.db.test.ts pins down. `guilds` are the servers the bot has a
 * row for (the fakes' server by default): for any other nothing is recorded. Set `failing` to
 * make every call reject.
 */
export class MemoryUnownGifts implements UnownGiftStorage {
  failing: Error | undefined;
  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];

  constructor(readonly guilds = new Set(['412345678901234567'])) {}

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  given(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() =>
      this.rows.some((row) => row.memberId === memberId && row.guildId === guildId),
    );
  }

  record(memberId: string, guildId: string, now: number): Promise<void> {
    return this.attempt(() => {
      const known = this.rows.some((row) => row.memberId === memberId && row.guildId === guildId);
      if (!known && this.guilds.has(guildId)) this.rows.push({ memberId, guildId, createdAt: now });
    });
  }
}
