import { type Kysely } from 'kysely';
import type { GoogleShareRaises } from '../../services/google-shares.js';
import type { DB } from '../types.js';

/**
 * What instance operators added to servers' shares of Google's month (plan 19B-5,
 * `/operator google share`): `GoogleShareRaise` (migration 060), a row per month (its first day)
 * and server, going with its server. A month's raises are read by the primary key's first part
 * `(month)`; a raise is written by the whole key. Its twin is `MemoryGoogleShareRaises`.
 */
export class GoogleShareRaiseRepository implements GoogleShareRaises {
  constructor(private readonly db: Kysely<DB>) {}

  async of(month: string): Promise<Map<number, number>> {
    const rows = await this.db
      .selectFrom('GoogleShareRaise')
      .select(['guildId', 'extra'])
      .where('month', '=', month)
      .execute();
    return new Map(rows.map((row) => [row.guildId, row.extra]));
  }

  async set(month: string, guildId: number, extra: number, at: number): Promise<void> {
    await this.db
      .insertInto('GoogleShareRaise')
      .values({ month, guildId, extra, raisedAt: String(at) })
      .onDuplicateKeyUpdate({ extra, raisedAt: String(at) })
      .execute();
  }
}
