import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from './mysql.js';
import { rowsRead } from './query-plan.js';

describe('rowsRead', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table counted (id int primary key, n int not null)');
    await database.query('create table other (id int primary key)');
    await database.query('insert into counted values (1, 0), (2, 0)');
    await database.query('insert into other values (1)');
  });

  afterAll(async () => {
    await database.stop();
  });

  it('gives the rows a read walks', async () => {
    expect(await rowsRead(database, (db) => sql`select * from counted`.execute(db))).toBe(2);
  });

  it('refuses a statement that is not a read, and runs it no second time', async () => {
    // `explain analyze` runs what it explains: a write would be made twice.
    await expect(
      rowsRead(database, (db) =>
        sql`update counted join other on other.id = counted.id set counted.n = counted.n + 1`.execute(
          db,
        ),
      ),
    ).rejects.toThrow(/explains a read alone/u);
    expect(await database.query('select n from counted where id = 1')).toEqual([{ n: 1 }]);
  });
});
