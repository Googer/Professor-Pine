import { expect, it } from 'vitest';
import { SESSION_MS, type WebSession, type WebSessionStore } from '../../src/web/session-model.js';

const DAY_MS = 86_400_000;

/** A session as `Sessions.start` writes one: made at `at`, good for 30 days. */
export function storedSession(id: string, at: number, userId = '700000000000000001'): WebSession {
  return {
    id,
    userId,
    userName: 'Ash',
    createdAt: at,
    lastUsedAt: at,
    expiresAt: at + SESSION_MS,
  };
}

/** A session id as stored: 64 hex characters (the SHA-256 of the cookie). */
export function sessionId(n: number): string {
  return n.toString(16).padStart(64, '0');
}

/**
 * What the sessions of the web pages do, run against the repository and its twin in memory
 * alike. `made` gives a fresh, empty store.
 */
export function webSessionCases(made: () => Promise<WebSessionStore>): void {
  it('finds a session by its id until it expires', async () => {
    const store = await made();
    const session = storedSession(sessionId(1), 1_000);
    await store.create(session);
    expect(await store.find(sessionId(1), 2_000)).toEqual(session);
    expect(await store.find(sessionId(2), 2_000)).toBeUndefined();
    expect(await store.find(sessionId(1), session.expiresAt - 1)).toEqual(session);
    expect(await store.find(sessionId(1), session.expiresAt)).toBeUndefined();
  });

  it('keeps names as they were given, accents and emoji too', async () => {
    const store = await made();
    const session = { ...storedSession(sessionId(3), 1_000), userName: 'Zoë 🌲 <b>' };
    await store.create(session);
    expect((await store.find(sessionId(3), 2_000))?.userName).toBe('Zoë 🌲 <b>');
  });

  it('renews a session for 30 days from its use', async () => {
    const store = await made();
    await store.create(storedSession(sessionId(1), 1_000));
    const later = 1_000 + 20 * DAY_MS;
    await store.touch(sessionId(1), later);
    expect(await store.find(sessionId(1), later + 25 * DAY_MS)).toMatchObject({
      createdAt: 1_000,
      lastUsedAt: later,
      expiresAt: later + SESSION_MS,
    });
  });

  it('removes one session, and those that expired', async () => {
    const store = await made();
    await store.create(storedSession(sessionId(1), 1_000));
    await store.create(storedSession(sessionId(2), 1_000, '700000000000000002'));
    await store.create(storedSession(sessionId(3), 40 * DAY_MS));
    await store.remove(sessionId(1));
    expect(await store.find(sessionId(1), 2_000)).toBeUndefined();
    expect(await store.removeExpired(35 * DAY_MS)).toBe(1);
    expect(await store.find(sessionId(2), 2_000)).toBeUndefined();
    expect(await store.find(sessionId(3), 41 * DAY_MS)).toBeDefined();
    expect(await store.removeExpired(35 * DAY_MS)).toBe(0);
  });
}
