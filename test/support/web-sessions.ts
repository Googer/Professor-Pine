import {
  SESSION_MS,
  sessionsPushedOut,
  type WebSession,
  type WebSessionStore,
} from '../../src/web/session-model.js';

/** The sessions of the web pages in memory: the twin of `WebSessionRepository`. */
export class MemoryWebSessions implements WebSessionStore {
  readonly rows = new Map<string, WebSession>();
  /** Each session's servers (final review R4-1), gone with it as the table's key cascades. */
  private readonly servers = new Map<string, readonly string[]>();

  create(session: WebSession, servers: readonly string[] = []): Promise<string[]> {
    this.rows.set(session.id, { ...session });
    this.servers.set(session.id, [...new Set(servers)]);
    const others = [...this.rows.values()].filter(
      (row) => row.userId === session.userId && row.id !== session.id,
    );
    const pushedOut = sessionsPushedOut(others).map((row) => row.id);
    for (const id of pushedOut) this.delete(id);
    return Promise.resolve(pushedOut);
  }

  find(id: string, now: number): Promise<WebSession | undefined> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.expiresAt > now ? { ...row } : undefined);
  }

  serversOf(id: string): Promise<string[]> {
    return Promise.resolve([...(this.servers.get(id) ?? [])]);
  }

  touch(id: string, now: number): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastUsedAt: now, expiresAt: now + SESSION_MS });
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.delete(id);
    return Promise.resolve();
  }

  removeExpired(now: number): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt <= now) {
        this.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  /** A session and its servers. */
  private delete(id: string): void {
    this.rows.delete(id);
    this.servers.delete(id);
  }
}
