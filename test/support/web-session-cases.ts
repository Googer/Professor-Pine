import { expect, it } from 'vitest';
import {
  MAX_SESSIONS_PER_ACCOUNT,
  SESSION_MS,
  type WebSession,
  type WebSessionStore,
} from '../../src/web/session-model.js';

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

  it('keeps at most ten sessions of one account, the one used longest ago going first (plan 8Z-2)', async () => {
    const store = await made();
    const OTHER = '700000000000000002';
    const found = async (...ids: number[]) =>
      Promise.all(ids.map(async (n) => (await store.find(sessionId(n), 50_000)) !== undefined));
    await store.create(storedSession(sessionId(90), 500, OTHER));
    for (let n = 1; n <= MAX_SESSIONS_PER_ACCOUNT; n += 1) {
      await store.create(storedSession(sessionId(n), n * 1_000));
    }
    // Ten of one account, all kept.
    expect(await found(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)).not.toContain(false);
    // The first made is used again: the second is now the one used longest ago.
    await store.touch(sessionId(1), 20_000);
    // Each says whom it pushed out (F-B5: their live streams end with them).
    expect(await store.create(storedSession(sessionId(11), 21_000))).toEqual([sessionId(2)]);
    expect(await found(1, 2, 3, 11)).toEqual([true, false, true, true]);
    expect(await store.create(storedSession(sessionId(12), 22_000))).toEqual([sessionId(3)]);
    expect(await found(1, 3, 4, 12)).toEqual([true, false, true, true]);
    // Somebody else's first pushes out nobody.
    expect(await store.create(storedSession(sessionId(91), 23_000, OTHER))).toEqual([]);
    // Somebody else's session is theirs: older than all of these, and kept.
    expect(await found(90)).toEqual([true]);
  });

  it('never drops the session it makes, though others were used at the same moment or later', async () => {
    const store = await made();
    for (let n = 1; n <= MAX_SESSIONS_PER_ACCOUNT; n += 1) {
      await store.create(storedSession(sessionId(n), 5_000));
    }
    // A clock that went back: the new one is the oldest by its times, and still the one kept.
    await store.create(storedSession(sessionId(11), 4_000));
    expect(await store.find(sessionId(11), 6_000)).toBeDefined();
    const kept = await Promise.all(
      Array.from({ length: MAX_SESSIONS_PER_ACCOUNT }, (_, i) =>
        store.find(sessionId(i + 1), 6_000),
      ),
    );
    expect(kept.filter((one) => one !== undefined)).toHaveLength(MAX_SESSIONS_PER_ACCOUNT - 1);
  });
}
