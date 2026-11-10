import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
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

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
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
});
