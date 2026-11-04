import { sql, type Kysely, type KyselyPlugin } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  OTHER_REPORTER,
  PLACE,
  REPORT_MIDNIGHT,
  REPORT_NOW,
  REPORT_SERVER,
  reportedStop,
  researchReport,
  rocketReport,
  stopReportCases,
  TAKEN_BACK,
} from '../../../test/support/stop-report-cases.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { StopReportRepository, SWEEP_BATCH } from './stop-report-repository.js';

/** What `failing` refuses, as MySQL would refuse it, before the statement is sent. */
interface Refusals {
  /** An insert into `StopReportHistory` that names this text anywhere (a table, a value). */
  insertNaming?: string;
  /** With `insertNaming`: refused once, as a deadlock (errno 1213). */
  deadlock?: boolean;
  /** A delete that names this text. */
  deleteNaming?: string;
  /** Every `rollback to savepoint`: the savepoint gone with the failure (P1). */
  rollbackToSavepoint?: boolean;
}

/** The database, with some statements refused (`Refusals`) by a plugin that sees each one. */
function failing(db: Kysely<DB>, refusals: Refusals): Kysely<DB> {
  let deadlocked = false;
  const plugin: KyselyPlugin = {
    transformQuery({ node }) {
      const text = JSON.stringify(node);
      const { insertNaming, deleteNaming } = refusals;
      if (
        node.kind === 'InsertQueryNode' &&
        insertNaming !== undefined &&
        text.includes('StopReportHistory') &&
        text.includes(insertNaming)
      ) {
        if (!refusals.deadlock) throw new Error('refused: an insert into StopReportHistory');
        if (!deadlocked) {
          deadlocked = true;
          throw Object.assign(new Error('Deadlock found when trying to get lock'), {
            errno: 1213,
          });
        }
      }
      if (node.kind === 'DeleteQueryNode' && deleteNaming && text.includes(deleteNaming)) {
        throw new Error(`refused: a delete from ${deleteNaming}`);
      }
      if (
        node.kind === 'RawNode' &&
        refusals.rollbackToSavepoint &&
        text.includes('rollback to savepoint')
      ) {
        throw new Error('the savepoint is gone');
      }
      return node;
    },
    transformResult: ({ result }) => Promise.resolve(result),
  };
  return db.withPlugin(plugin);
}

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
    await db.deleteFrom('StopReportHistory').execute();
    await db.deleteFrom('HistoryOptIn').execute();
    return new StopReportRepository(db);
  };

  stopReportCases(fresh, async (_store, serverId, memberId) => {
    await db
      .insertInto('HistoryOptIn')
      .values({ serverId, memberId, createdAt: String(REPORT_NOW) })
      .execute();
  });

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

  describe('the history of reports that end (plan 8H-2)', () => {
    /** The history table gone for a moment: every record fails as a broken insert would. */
    const withoutHistory = async (work: () => Promise<void>) => {
      await sql`rename table StopReportHistory to StopReportHistoryAway`.execute(db);
      try {
        await work();
      } finally {
        await sql`rename table StopReportHistoryAway to StopReportHistory`.execute(db);
      }
    };

    it('saves a report and takes one back all the same where its record fails, logged (review H11)', async () => {
      const { log, entries } = createTestLogger();
      await fresh();
      const store = new StopReportRepository(db, log);
      const { report } = await store.save(researchReport(), { place: PLACE });
      let replaced: Awaited<ReturnType<typeof store.save>> | undefined;
      await withoutHistory(async () => {
        replaced = await store.save(researchReport({ reporter: OTHER_REPORTER }), {
          place: PLACE,
        });
        await store.remove(replaced.report.id, REPORT_SERVER, {
          ...TAKEN_BACK,
          by: OTHER_REPORTER.id,
        });
      });
      expect(replaced?.replaced).toEqual(report);
      expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([]);
      expect(await store.historyOf(REPORT_SERVER)).toEqual([]);
      expect(
        entries.filter(
          (entry) =>
            entry.msg === 'could not record stop reports that ended; their records are lost',
        ),
      ).toHaveLength(2);
    });

    it('keeps the ended rows of a sweep whose records fail, for the next sweep, logged (review H10)', async () => {
      const { log, entries } = createTestLogger();
      await fresh();
      const store = new StopReportRepository(db, log);
      await store.save(researchReport(), { place: PLACE });
      await withoutHistory(async () => {
        expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(0);
      });
      expect(await db.selectFrom('StopReport').select('id').execute()).toHaveLength(1);
      expect(
        entries
          .filter((entry) => entry.level === 50)
          .map((entry) => entry.msg)
          .sort(),
      ).toEqual([
        'could not record a batch of ended stop reports; trying them one by one',
        'could not record an ended stop report; it is kept for the next sweep',
      ]);
      expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(1);
      expect(await store.historyOf(REPORT_SERVER)).toMatchObject([{ ending: 'stood' }]);
    });

    it('stops trying row by row after five failures in a row, keeping the rest back unread (R2)', async () => {
      const { log, entries } = createTestLogger();
      await fresh();
      const store = new StopReportRepository(db, log);
      for (let n = 1; n <= 8; n++) await store.save(researchReport({ stop: reportedStop(n) }));
      await withoutHistory(async () => {
        expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(0);
      });
      expect(await db.selectFrom('StopReport').select('id').execute()).toHaveLength(8);
      const errors = entries.filter((entry) => entry.level === 50);
      expect(
        errors.filter(
          (entry) =>
            entry.msg === 'could not record an ended stop report; it is kept for the next sweep',
        ),
      ).toHaveLength(5);
      expect(
        errors.filter(
          (entry) =>
            entry.msg ===
            'gave up recording ended stop reports one by one; the rest are kept for the next sweep',
        ),
      ).toMatchObject([{ keptBack: 3 }]);
    });

    it('keeps back only the row whose record fails, the rest of its batch swept (P7)', async () => {
      const { log } = createTestLogger();
      await fresh();
      const store = new StopReportRepository(failing(db, { insertNaming: 'balloon' }), log);
      const one = await store.save(researchReport({ stop: reportedStop(1) }));
      const bad = await store.save(researchReport({ stop: reportedStop(2) }));
      const three = await store.save(researchReport({ stop: reportedStop(3) }));
      await db
        .updateTable('StopReport')
        .set({ detail: JSON.stringify({ balloon: true }) })
        .where('id', '=', bad.report.id)
        .execute();
      expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(2);
      expect((await store.historyOf(REPORT_SERVER)).map((record) => record.reportId)).toEqual([
        one.report.id,
        three.report.id,
      ]);
      expect(await db.selectFrom('StopReport').select('id').execute()).toEqual([
        { id: bad.report.id },
      ]);
    });

    it('saves the report without its records where the savepoint went with a failure (P1)', async () => {
      const { log, entries } = createTestLogger();
      await fresh();
      const plain = new StopReportRepository(db, log);
      const store = new StopReportRepository(
        failing(db, { insertNaming: 'StopReportHistory', rollbackToSavepoint: true }),
        log,
      );
      await plain.save(researchReport(), { place: PLACE });
      const replaced = await store.save(researchReport({ reporter: OTHER_REPORTER }));
      expect(replaced.report.reporter).toEqual(OTHER_REPORTER);
      expect(await plain.standing(REPORT_SERVER, REPORT_NOW)).toEqual([replaced.report]);
      // A take-back the same way: the report goes, its record is lost.
      expect(
        await store.remove(replaced.report.id, REPORT_SERVER, {
          ...TAKEN_BACK,
          by: OTHER_REPORTER.id,
        }),
      ).toEqual(replaced.report);
      expect(await plain.standing(REPORT_SERVER, REPORT_NOW)).toEqual([]);
      expect(await plain.historyOf(REPORT_SERVER)).toEqual([]);
      expect(
        entries.filter(
          (entry) =>
            entry.msg === 'could not record stop reports that ended; saved without their records',
        ),
      ).toHaveLength(2);
    });

    it('runs the whole save again where a deadlock took the savepoint with it (P1)', async () => {
      await fresh();
      const plain = new StopReportRepository(db);
      const store = new StopReportRepository(
        failing(db, {
          insertNaming: 'StopReportHistory',
          deadlock: true,
          rollbackToSavepoint: true,
        }),
      );
      const { report } = await plain.save(researchReport(), { place: PLACE });
      await store.save(researchReport({ reporter: OTHER_REPORTER }));
      // The second run wrote the record: the deadlock was the one thrown, and retried.
      expect(await plain.historyOf(REPORT_SERVER)).toMatchObject([
        { reportId: report.id, ending: 'churned' },
      ]);
    });

    it('fails a restore whose forgetting of the hideout’s record fails, changing nothing (P3)', async () => {
      await fresh();
      const plain = new StopReportRepository(db);
      const store = new StopReportRepository(failing(db, { deleteNaming: 'StopReportHistory' }));
      const arlo = rocketReport({
        subjectKey: 'leader:arlo',
        rocket: { name: 'Arlo', catches: [] },
        endsAt: REPORT_MIDNIGHT,
        reporter: OTHER_REPORTER,
      });
      const hideout = await plain.save(arlo, { place: PLACE });
      const grunt = await plain.save(rocketReport({ madeAt: REPORT_NOW + 60_000 }));
      await expect(
        store.saveUnless(arlo, () => ({ verdict: 'replace', ending: 'unposted' }), {
          standingAt: REPORT_NOW + 90_000,
          restoring: { id: hideout.report.id, madeAt: hideout.report.madeAt },
        }),
      ).rejects.toThrow(/StopReportHistory/);
      expect(await plain.standing(REPORT_SERVER, REPORT_NOW)).toEqual([grunt.report]);
      expect(await plain.historyOf(REPORT_SERVER)).toMatchObject([
        { reportId: hideout.report.id, ending: 'churned' },
      ]);
    });

    it('records a row this version cannot read, raw, as the sweep forgets it', async () => {
      const store = await fresh();
      const { report } = await store.save(researchReport(), { place: PLACE });
      await db
        .updateTable('StopReport')
        .set({ kind: 'balloon', detail: JSON.stringify({ said: `<@${OTHER_REPORTER.id}>` }) })
        .where('id', '=', report.id)
        .execute();
      expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(1);
      expect(await store.historyOf(REPORT_SERVER)).toMatchObject([
        { reportId: report.id, kind: 'balloon', detail: { said: '@member' }, ending: 'stood' },
      ]);
    });

    it('sweeps in batches, every ended row recorded once', async () => {
      const store = await fresh();
      const rows = Array.from({ length: SWEEP_BATCH + 1 }, (_, n) => ({
        serverId: REPORT_SERVER,
        stopKey: `stop-${String(n)}`,
        kind: 'research',
        periodKey: 'day:2026-10-21',
        endsAt: String(REPORT_MIDNIGHT),
        stopName: 'Yellow Mural',
        lat: 40.44,
        lon: -79.99,
        subjectKey: 'a'.repeat(16),
        detail: JSON.stringify(researchReport().research),
        reporterId: OTHER_REPORTER.id,
        reporterName: OTHER_REPORTER.name,
        madeAt: String(REPORT_NOW),
      }));
      await db.insertInto('StopReport').values(rows).execute();
      expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(SWEEP_BATCH + 1);
      expect(await store.historyOf(REPORT_SERVER)).toHaveLength(SWEEP_BATCH + 1);
      expect(await db.selectFrom('StopReport').select('id').execute()).toEqual([]);
    });
  });
});
