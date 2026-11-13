import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * For which members of which servers the Unown want of the old role was settled (see
 * `UnownWantService`); lets tests keep it in memory. A member and a server are named by their
 * snowflakes.
 */
export interface UnownGiftStorage {
  /** Whether it was settled for this member in this server. */
  given(memberId: string, guildId: string): Promise<boolean>;
  /**
   * Records that it was settled. Once recorded it stays as it is; for a server the bot has no
   * row for, nothing is recorded (and nothing was given there).
   */
  record(memberId: string, guildId: string, now: number): Promise<void>;
}

/** The `UnownWantGift` table. */
export class UnownGiftRepository implements UnownGiftStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async given(memberId: string, guildId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('UnownWantGift as gift')
      .innerJoin('Guild as g', 'g.id', 'gift.guildId')
      .select('gift.memberId')
      .where('g.snowflake', '=', guildId)
      .where('gift.memberId', '=', memberId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async record(memberId: string, guildId: string, now: number): Promise<void> {
    // The server by its row, in the one statement; recorded already: the row stays as it is.
    await sql`
      insert into UnownWantGift (guildId, memberId, createdAt)
      select id, ${memberId}, ${String(now)} from Guild where snowflake = ${guildId}
      on duplicate key update memberId = UnownWantGift.memberId`.execute(this.db);
  }

  /** In how many servers it was settled for the member (plan 8G, `/operator forget`). */
  async countOf(memberId: string): Promise<number> {
    const counted = await this.db
      .selectFrom('UnownWantGift')
      .select((eb) => eb.fn.countAll<number | string>().as('rows'))
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    return Number(counted?.rows ?? 0);
  }

  /**
   * Deletes the member's rows of every server (plan 8G, `/operator forget`); how many. The servers
   * are read first, without a lock, and the rows deleted by their key (the server, the member),
   * as `NewTrainRepository.forget` does and for its reason. In the caller's transaction when
   * `db` is one. A member who comes back with the old role is given the Unown want once more,
   * as somebody new would be.
   */
  async forget(memberId: string): Promise<number> {
    const rows = await this.db
      .selectFrom('UnownWantGift')
      .select('guildId')
      .where('memberId', '=', memberId)
      .execute();
    if (rows.length === 0) return 0;
    const gone = await this.db
      .deleteFrom('UnownWantGift')
      .where('memberId', '=', memberId)
      .where(
        'guildId',
        'in',
        rows.map((row) => row.guildId),
      )
      .executeTakeFirst();
    return Number(gone.numDeletedRows);
  }
}
