import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accessKey,
  accessRequest,
  ACCESS_NOW,
  ADMIN,
  scriptAccessCases,
} from '../../../test/support/script-access-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { createLogger } from '../../log.js';
import type { DB } from '../types.js';
import { ScriptAccessRepository } from './script-access-repository.js';

describe('ScriptAccessRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('ScriptAccess').execute();
    return new ScriptAccessRepository(db);
  };

  scriptAccessCases(fresh);

  it('keeps times beyond 2^31 and a snowflake as written', async () => {
    const store = await fresh();
    const at = 1_792_000_000_000;
    const { access } = await store.ask(accessRequest({ userId: '1234567890123456789', at }));
    expect(await store.byId(access.id)).toMatchObject({
      userId: '1234567890123456789',
      askedAt: at,
    });
  });

  it('asks once when the same member asks twice at the same moment', async () => {
    const store = await fresh();
    const [one, two] = await Promise.all([store.ask(accessRequest()), store.ask(accessRequest())]);
    expect([one.kind, two.kind].sort()).toEqual(['asked', 'standing']);
    expect(await store.openCount()).toBe(1);
  });

  it('compares keys byte for byte: the column is ascii_bin', async () => {
    const rows = await sql<{ collation: string }>`
      select collation_name as collation from information_schema.columns
      where table_schema = database() and table_name = 'ScriptAccess' and column_name = 'key'`.execute(
      db,
    );
    expect(rows.rows).toEqual([{ collation: 'ascii_bin' }]);
  });

  it('refuses a second row with the same key', async () => {
    const store = await fresh();
    const { access } = await store.ask(accessRequest());
    await store.decide(access.id, {
      decision: 'approve',
      from: 'asked',
      key: accessKey(1),
      at: ACCESS_NOW,
    });
    const refused = await store
      .ownerLink({ userId: `${ADMIN}9`, name: 'Matt' }, accessKey(1), ACCESS_NOW)
      .then(
        () => undefined,
        (err: unknown) => err,
      );
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(/Duplicate entry/);
    expect(
      JSON.stringify({ ...(refused as Error), message: (refused as Error).message }),
    ).not.toContain(accessKey(1));
  });

  it('keeps a key out of the error of a failed query, and so out of the log', async () => {
    const store = await fresh();
    const key = accessKey(7);
    await sql`rename table ScriptAccess to ScriptAccessAway`.execute(db);
    let failed: unknown;
    try {
      failed = await store.byKey(key).then(
        () => undefined,
        (err: unknown) => err,
      );
    } finally {
      await sql`rename table ScriptAccessAway to ScriptAccess`.execute(db);
    }
    expect(failed).toBeInstanceOf(Error);
    const err = failed as Error;
    expect(`${err.message} ${JSON.stringify({ ...err })}`).not.toContain(key);
    const lines: string[] = [];
    createLogger(
      { level: 'info', pretty: false },
      { write: (line: string) => lines.push(line) },
    ).error({ err }, 'byKey failed');
    expect(lines.join('')).toContain('byKey failed');
    expect(lines.join('')).not.toContain(key);
  });

  it('puts the values into the statement on a failed query, which the logger hides', async () => {
    const key = accessKey(8);
    const failed = await sql`select * from NoSuchTable where k = ${key}`.execute(db).then(
      () => undefined,
      (err: unknown) => err,
    );
    expect((failed as { sql?: string }).sql).toContain(key);
    const lines: string[] = [];
    createLogger(
      { level: 'info', pretty: false },
      { write: (line: string) => lines.push(line) },
    ).error({ err: failed }, 'query failed');
    expect(lines.join('')).toContain('query failed');
    expect(lines.join('')).not.toContain(key);
  });
});
