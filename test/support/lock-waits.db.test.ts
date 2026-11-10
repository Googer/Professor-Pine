import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/kysely.js';
import { connectionId, lockWaits } from './lock-waits.js';
import { startDatabase, type TestDatabase } from './mysql.js';

describe('lockWaits', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query(
      'create table Waited (id int primary key, name varchar(20)) default charset=utf8mb4',
    );
    await database.query("insert into Waited values (1, 'pine')");
  });
  afterAll(async () => {
    await database.stop();
  });

  // MySQL 9.7's `information_schema.processlist` cannot be read at all while any session of the
  // server runs a statement with a character beyond three bytes (an emoji of a gym's name): it
  // converts every statement's text to utf8mb3 and fails (error 3854).
  it('counts a statement that waits, whatever characters the statements of the server hold', async () => {
    const holder = createDb(database.config);
    const waiter = createDb(database.config);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let holderId = 0;
    try {
      const holding = holder.transaction().execute(async (trx) => {
        holderId = await connectionId(trx);
        await sql`select id from Waited where id = 1 for update`.execute(trx);
        locked();
        await held;
      });
      await isLocked;
      const waiting = sql`update Waited set name = ${'🌲 Pine'} where id = 1`.execute(waiter);
      try {
        expect(await lockWaits(holder, holderId)).toBe(1);
      } finally {
        release();
        await holding;
        await waiting;
      }
    } finally {
      await holder.destroy();
      await waiter.destroy();
    }
  });
});
