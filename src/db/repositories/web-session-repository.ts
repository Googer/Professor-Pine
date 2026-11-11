import type { Kysely } from 'kysely';
import {
  SESSION_MS,
  sessionsPushedOut,
  type WebSession,
  type WebSessionStore,
} from '../../web/session-model.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * The sessions of the web pages, in the table `WebSession` (migration 015), by the SHA-256 of
 * their cookie. Its twin in memory is `MemoryWebSessions`; both run `webSessionCases`
 * (`test/support/web-session-cases.ts`).
 */
export class WebSessionRepository implements WebSessionStore {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Stores the session and deletes what it pushes out of its account's ten (plan 8Z-2;
   * `sessionsPushedOut`, read through `websession_userid_index`), in one transaction: a login
   * that fails leaves the account's sessions as they were. The ids of those it deleted (F-B5).
   */
  create(session: WebSession): Promise<string[]> {
    return inTransaction(this.db, async (trx) => {
      await trx
        .insertInto('WebSession')
        .values({
          id: session.id,
          userId: session.userId,
          userName: session.userName,
          createdAt: String(session.createdAt),
          lastUsedAt: String(session.lastUsedAt),
          expiresAt: String(session.expiresAt),
        })
        .execute();
      const others = await trx
        .selectFrom('WebSession')
        .select(['id', 'createdAt', 'lastUsedAt'])
        .where('userId', '=', session.userId)
        .where('id', '!=', session.id)
        .execute();
      const pushedOut = sessionsPushedOut(
        others.map((row) => ({
          id: row.id,
          createdAt: Number(row.createdAt),
          lastUsedAt: Number(row.lastUsedAt),
        })),
      );
      const ids = pushedOut.map((one) => one.id);
      if (ids.length === 0) return ids;
      await trx.deleteFrom('WebSession').where('id', 'in', ids).execute();
      return ids;
    });
  }

  async find(id: string, now: number): Promise<WebSession | undefined> {
    const row = await this.db
      .selectFrom('WebSession')
      .selectAll()
      .where('id', '=', id)
      .where('expiresAt', '>', String(now))
      .executeTakeFirst();
    return (
      row && {
        id: row.id,
        userId: row.userId,
        userName: row.userName,
        createdAt: Number(row.createdAt),
        lastUsedAt: Number(row.lastUsedAt),
        expiresAt: Number(row.expiresAt),
      }
    );
  }

  async touch(id: string, now: number): Promise<void> {
    await this.db
      .updateTable('WebSession')
      .set({ lastUsedAt: String(now), expiresAt: String(now + SESSION_MS) })
      .where('id', '=', id)
      .execute();
  }

  async remove(id: string): Promise<void> {
    await this.db.deleteFrom('WebSession').where('id', '=', id).execute();
  }

  async removeExpired(now: number): Promise<number> {
    const [result] = await this.db
      .deleteFrom('WebSession')
      .where('expiresAt', '<=', String(now))
      .execute();
    return Number(result?.numDeletedRows ?? 0);
  }

  /** How many sessions the account has, expired ones too (plan 8G, `/admin forget`). */
  async countOf(userId: string): Promise<number> {
    const counted = await this.db
      .selectFrom('WebSession')
      .select((eb) => eb.fn.countAll<number | string>().as('rows'))
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(counted?.rows ?? 0);
  }

  /**
   * Deletes every session of the account (plan 8G, `/admin forget`) and answers their ids, so
   * that the live streams opened under them can be ended as a logout ends them. One
   * transaction (the caller's when `db` is one): the rows are read locked, along
   * `websession_userid_index`, so that a login of the account at the same moment waits and
   * no session is deleted that is not among the ids.
   */
  removeOf(userId: string): Promise<string[]> {
    return inTransaction(this.db, async (trx) => {
      const rows = await trx
        .selectFrom('WebSession')
        .select('id')
        .where('userId', '=', userId)
        .forUpdate()
        .execute();
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return ids;
      await trx.deleteFrom('WebSession').where('id', 'in', ids).execute();
      return ids;
    });
  }
}
