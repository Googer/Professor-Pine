import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { plansOf } from '../../../test/support/query-plan.js';
import {
  sessionId,
  storedSession,
  webSessionCases,
} from '../../../test/support/web-session-cases.js';
import type { DB } from '../types.js';
import { WebSessionRepository } from './web-session-repository.js';

describe('WebSessionRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, database, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('WebSession').execute();
    return new WebSessionRepository(db);
  };

  webSessionCases(fresh);

  it('keeps times beyond 2^31 and a snowflake as written', async () => {
    const sessions = await fresh();
    const at = 1_792_000_000_000;
    await sessions.create(storedSession(sessionId(9), at, '1234567890123456789'));
    expect(await sessions.find(sessionId(9), at)).toEqual(
      storedSession(sessionId(9), at, '1234567890123456789'),
    );
  });

  it('removes every session of an account, saying which, and nobody else’s (plan 8G)', async () => {
    const sessions = await fresh();
    const ASH = '700000000000000001';
    const MISTY = '700000000000000002';
    await sessions.create(storedSession(sessionId(1), 1_000, ASH));
    await sessions.create(storedSession(sessionId(2), 2_000, ASH));
    await sessions.create(storedSession(sessionId(3), 3_000, MISTY));
    expect(await sessions.countOf(ASH)).toBe(2);

    expect((await sessions.removeOf(ASH)).sort()).toEqual([sessionId(1), sessionId(2)]);

    expect(await sessions.countOf(ASH)).toBe(0);
    expect(await sessions.find(sessionId(1), 4_000)).toBeUndefined();
    expect(await sessions.find(sessionId(2), 4_000)).toBeUndefined();
    expect(await sessions.find(sessionId(3), 4_000)).toEqual(
      storedSession(sessionId(3), 3_000, MISTY),
    );
    // None left: nothing to end.
    expect(await sessions.removeOf(ASH)).toEqual([]);
    expect(await sessions.countOf(MISTY)).toBe(1);
  });

  it('removes the servers of an account’s sessions with them (final review R4-1)', async () => {
    const sessions = await fresh();
    const ASH = '700000000000000001';
    const MISTY = '700000000000000002';
    await sessions.create(storedSession(sessionId(1), 1_000, ASH), ['410000000000000001']);
    await sessions.create(storedSession(sessionId(2), 2_000, MISTY), ['410000000000000001']);
    await sessions.removeOf(ASH);
    const rows = await db.selectFrom('WebSessionServer').selectAll().execute();
    expect(rows).toEqual([{ sessionId: sessionId(2), serverId: '410000000000000001' }]);
  });

  it('reads a session’s servers by the primary key, among many sessions’ (final review R4-1)', async () => {
    const sessions = await fresh();
    for (let n = 1; n <= 60; n += 1) {
      await sessions.create(
        storedSession(sessionId(n), n * 1_000, `7000000000000${String(n).padStart(5, '0')}`),
        [`41000000000000000${String(n % 5)}`, `42000000000000000${String(n % 7)}`],
      );
    }
    await sql`analyze table WebSessionServer`.execute(db);
    const [plan] = await plansOf(database, (seen) =>
      new WebSessionRepository(seen).serversOf(sessionId(7)),
    );
    expect(plan?.map((row) => [row.table, row.key])).toEqual([['WebSessionServer', 'PRIMARY']]);
  });
});
