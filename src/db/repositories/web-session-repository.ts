import type { Kysely } from 'kysely';
import { SESSION_MS, type WebSession, type WebSessionStore } from '../../web/session-model.js';
import type { DB } from '../types.js';

/**
 * The sessions of the web pages, in the table `WebSession` (migration 015), by the SHA-256 of
 * their cookie. Its twin in memory is `MemoryWebSessions`; both run `webSessionCases`
 * (`test/support/web-session-cases.ts`).
 */
export class WebSessionRepository implements WebSessionStore {
  constructor(private readonly db: Kysely<DB>) {}

  async create(session: WebSession): Promise<void> {
    await this.db
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
}
