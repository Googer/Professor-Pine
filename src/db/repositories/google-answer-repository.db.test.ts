import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { googleAnswerCases } from '../../../test/support/google-answer-cases.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { DEPRECATED_SYNTAX, lastWarnings } from '../../../test/support/mysql-warnings.js';
import { planOf, scanned } from '../../../test/support/query-plan.js';
import type { DB } from '../types.js';
import { GoogleAnswerRepository } from './google-answer-repository.js';

/** Google's answers by the point and the kind of question (plan 19B-3). */
describe('GoogleAnswerRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('GoogleAnswer').execute();
    return new GoogleAnswerRepository(db);
  };

  googleAnswerCases(fresh);

  it('removes answers through the primary key, never a scan of the table', async () => {
    const answers = await fresh();
    // Two thousand answers of both kinds, as a city's places (the table is read whole only at
    // start; the sweep deletes a few of them by their key).
    const rows = Array.from({ length: 2_000 }, (_, index) => ({
      kind: index % 2 === 0 ? ('places' as const) : ('address' as const),
      lat: 40 + Math.floor(index / 2) / 10_000,
      lon: -80,
      answer: null,
      askedAt: 1,
    }));
    await answers.save(rows);
    await sql`analyze table GoogleAnswer`.execute(db);
    const plan = await planOf(database, (logged) =>
      new GoogleAnswerRepository(logged).remove(rows.slice(0, 3)),
    );
    expect(plan.map((row) => row.key)).toEqual(['PRIMARY']);
    expect(scanned(plan)).toEqual([]);
    expect(await answers.all()).toHaveLength(1_997);
  });

  it('keeps an answer again without the VALUES() function MySQL deprecates', async () => {
    await fresh();
    const row = { kind: 'address' as const, lat: 40, lon: -80, answer: null, askedAt: 1 };
    const warnings = await lastWarnings(db, async (trx) => {
      const answers = new GoogleAnswerRepository(trx);
      await answers.save([row]);
      await answers.save([{ ...row, askedAt: 2 }]);
    });
    expect(warnings.filter((warning) => warning.Code === DEPRECATED_SYNTAX)).toEqual([]);
    expect(await new GoogleAnswerRepository(db).all()).toEqual([{ ...row, askedAt: 2 }]);
  });
});
