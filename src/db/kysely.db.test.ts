import { sql } from 'kysely';
import { createPool, type Pool, type PoolConnection } from 'mysql2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
import { checkedPool, createDb } from './kysely.js';

// mysql2 escapes the values of a statement on the client, with backslashes. A server whose
// sql_mode has NO_BACKSLASH_ESCAPES reads a backslash as itself, so that escaping is wrong
// there: every connection is asked for its mode before anything else is sent on it.

let database: TestDatabase;

beforeAll(async () => {
  database = await startDatabase({ legacySchema: false });
});

afterAll(async () => {
  await database.stop();
});

const connectionOf = (pool: Pick<Pool, 'getConnection'>): Promise<PoolConnection> =>
  new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });

const ask = <Row>(connection: PoolConnection, text: string): Promise<Row[]> =>
  new Promise((resolve, reject) => {
    connection.query(text, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as Row[]);
    });
  });

const ended = (pool: Pool): Promise<void> => new Promise((resolve) => pool.end(() => resolve()));

describe('checkedPool', () => {
  it('refuses a connection whose session has NO_BACKSLASH_ESCAPES, and keeps the pool whole', async () => {
    // One connection, so that the one whose mode is set is the one handed out next.
    const pool = createPool({ ...database.config, connectionLimit: 1 });
    try {
      const first = await connectionOf(pool);
      // The session's mode only, never the server's: other tests share the server.
      await ask(first, "set session sql_mode = concat(@@sql_mode, ',NO_BACKSLASH_ESCAPES')");
      const firstId = first.threadId;
      first.release();

      const checked = checkedPool(pool);
      await expect(connectionOf(checked)).rejects.toThrow(
        /NO_BACKSLASH_ESCAPES.*take NO_BACKSLASH_ESCAPES out of the server's sql_mode/,
      );

      // The refused connection is gone, not kept out of the pool for good: the next one is new
      // (the server's own mode), and is handed out.
      const next = await connectionOf(checked);
      expect(next.threadId).not.toBe(firstId);
      const [row] = await ask<{ mode: string }>(next, 'select @@session.sql_mode as mode');
      expect(row?.mode).not.toContain('NO_BACKSLASH_ESCAPES');
      next.release();
    } finally {
      await ended(pool);
    }
  });

  it('asks a connection once, not each time it is handed out', async () => {
    const pool = createPool({ ...database.config, connectionLimit: 1 });
    try {
      const checked = checkedPool(pool);
      const first = await connectionOf(checked);
      // After the check, in this session: the pool hands the same connection out again.
      await ask(first, "set session sql_mode = concat(@@sql_mode, ',NO_BACKSLASH_ESCAPES')");
      first.release();
      const again = await connectionOf(checked);
      expect(again.threadId).toBe(first.threadId);
      again.release();
    } finally {
      await ended(pool);
    }
  });
});

describe('createDb', () => {
  /** How many statements the server has taken on this connection, this one included. */
  const QUESTIONS = "show session status like 'Questions'";

  it('asks every connection it opens for its mode before the first statement', async () => {
    const bare = createPool({ ...database.config, connectionLimit: 1 });
    let unchecked: number;
    try {
      const connection = await connectionOf(bare);
      const [row] = await ask<{ Value: string }>(connection, QUESTIONS);
      unchecked = Number(row?.Value);
      connection.release();
    } finally {
      await ended(bare);
    }

    const db = createDb<unknown>(database.config);
    try {
      const { rows } = await sql<{ Value: string }>`show session status like 'Questions'`.execute(
        db,
      );
      // One statement more than on a connection nothing asked: the question of its mode.
      expect(Number(rows[0]?.Value)).toBe(unchecked + 1);
    } finally {
      await db.destroy();
    }
  });
});
