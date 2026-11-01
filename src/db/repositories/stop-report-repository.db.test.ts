import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  REPORT_NOW,
  REPORT_SERVER,
  reportedStop,
  researchReport,
  rocketReport,
  stopReportCases,
} from '../../../test/support/stop-report-cases.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { StopReportRepository } from './stop-report-repository.js';

describe('StopReportRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('StopReport').execute();
    return new StopReportRepository(db);
  };

  stopReportCases(fresh);

  it('makes one report of two first reports of a stop at the same moment', async () => {
    const store = await fresh();
    const [one, two] = await Promise.all([
      store.save(researchReport()),
      store.save(researchReport({ reporter: { id: '200000000000000033', name: 'Gary' } })),
    ]);
    const later = [one, two].filter(({ replaced }) => replaced !== undefined);
    expect(later).toHaveLength(1);
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([later[0]?.report]);
  });

  it('decides two first reports of the same grunt at once as one, the other kept out (8R-2)', async () => {
    const store = await fresh();
    const keepsSame = (standing: { subjectKey: string }) =>
      standing.subjectKey === 'grunt:water' ? ('keep' as const) : ('replace' as const);
    const [one, two] = await Promise.all([
      store.saveUnless(rocketReport(), keepsSame),
      store.saveUnless(
        rocketReport({ reporter: { id: '200000000000000033', name: 'Gary' } }),
        keepsSame,
      ),
    ]);
    expect([one, two].filter(({ saved }) => saved)).toHaveLength(1);
    const kept = [one, two].find(({ saved }) => !saved);
    expect(kept).toMatchObject({ saved: false, standing: { subjectKey: 'grunt:water' } });
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toHaveLength(1);
  });

  it('keeps the period of an event whose id is as long as the feed allows (review A7)', async () => {
    const store = await fresh();
    const periodKey = `event:${'e'.repeat(200)}:2026-11-21`;
    const { report } = await store.save(researchReport({ periodKey }));
    expect((await store.byId(report.id))?.periodKey).toBe(periodKey);
  });

  it('leaves out a row it cannot read, and leaves it alone', async () => {
    const { log, entries } = createTestLogger();
    const store = new StopReportRepository(db, log);
    await db.deleteFrom('StopReport').execute();
    const { report } = await store.save(researchReport({ stop: reportedStop(2) }));
    await db
      .updateTable('StopReport')
      .set({ kind: 'balloon' })
      .where('id', '=', report.id)
      .execute();
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'a stop report cannot be read; left alone')).toBe(
      true,
    );
    expect(await db.selectFrom('StopReport').select('id').execute()).toHaveLength(1);
  });
});
