import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';

/** Where a member's legacy fill-in of a server stands. `queued`: waiting, or under way. */
export type FillInState =
  { state: 'queued' } | { state: 'done'; filled: number } | { state: 'failed'; failure: string };

/**
 * What asking did: `queued`, a new request, or one that had failed asked again (A1); `asked`,
 * there was one already, waiting or done: nothing is queued again; `off`, the member's history is
 * off in that server.
 */
export type FillInAsked = 'queued' | 'asked' | 'off';

/**
 * The legacy fill-ins members asked for (plan 8H-10; `LegacyFillIn`, migration 043): a request
 * per member and server, written only from their history opt-in and deleted with it by the
 * opt-out (`HistoryRepository.optOut`). A member and a server are their snowflakes.
 */
export interface LegacyFillIns {
  /** Queues the member's fill-in of the server where their history is on there (H7). */
  request(memberId: string, serverId: string, now: number): Promise<FillInAsked>;
  /** Where the member's fill-in of the server stands; undefined where they never asked. */
  stateOf(memberId: string, serverId: string): Promise<FillInState | undefined>;
}

export class LegacyFillInRepository implements LegacyFillIns {
  constructor(private readonly db: Kysely<DB>) {}

  async request(memberId: string, serverId: string, now: number): Promise<FillInAsked> {
    // From the opt-in row, locked shared by the select: an opt-out that deleted it meanwhile has
    // committed or waits for this statement, and then deletes the request with it.
    const made = await sql`
      insert ignore into LegacyFillIn (serverId, memberId, requestedAt)
      select serverId, memberId, ${String(now)} from HistoryOptIn
      where serverId = ${serverId} and memberId = ${memberId}`.execute(this.db);
    if (Number(made.numAffectedRows ?? 0) > 0) return 'queued';
    // A request that failed is asked again (A1, the member retries): its row starts afresh, from
    // the opt-in row as the insert is; one waiting or done stays as it is.
    const again = await sql`
      update LegacyFillIn f
      join HistoryOptIn h on h.serverId = f.serverId and h.memberId = f.memberId
      set f.requestedAt = ${String(now)}, f.startedAt = null, f.failedAt = null, f.failure = null
      where f.serverId = ${serverId} and f.memberId = ${memberId} and f.failedAt is not null`.execute(
      this.db,
    );
    if (Number(again.numAffectedRows ?? 0) > 0) return 'queued';
    return (await this.stateOf(memberId, serverId)) === undefined ? 'off' : 'asked';
  }

  async stateOf(memberId: string, serverId: string): Promise<FillInState | undefined> {
    const row = await this.db
      .selectFrom('LegacyFillIn')
      .select(['doneAt', 'filled', 'failedAt', 'failure'])
      .where('serverId', '=', serverId)
      .where('memberId', '=', memberId)
      .executeTakeFirst();
    if (row === undefined) return undefined;
    if (row.failedAt !== null) return { state: 'failed', failure: row.failure ?? '' };
    if (row.doneAt !== null) return { state: 'done', filled: row.filled };
    return { state: 'queued' };
  }
}
