import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MOD,
  OTHER_SERVER,
  requestId,
  SAFETY_NOW,
} from '../../../test/support/meetup-safety-cases.js';
import { connectionId, lockWaits } from '../../../test/support/lock-waits.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import {
  messageSubject,
  newReport,
  OTHER_REPORTER,
  partySubject,
  reason,
  REPORTER,
  reportCases,
} from '../../../test/support/report-cases.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import type { DB } from '../types.js';
import { ReportRepository } from './report-repository.js';

describe('ReportRepository', () => {
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
    await db.deleteFrom('ModerationReportReason').execute();
    await db.deleteFrom('ModerationReport').execute();
    return new ReportRepository(db);
  };

  reportCases(fresh);

  it('opens one report when two report the same message at the same moment', async () => {
    const store = await fresh();
    const subject = messageSubject();
    const both = await Promise.all([
      store.addReport(newReport(1, subject), reason(REPORTER)),
      store.addReport(newReport(2, subject), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 })),
    ]);
    expect(both.map((one) => one.kind).sort()).toEqual(['added', 'opened']);
    const reports = await db.selectFrom('ModerationReport').select('id').execute();
    expect(reports).toHaveLength(1);
    const [only] = reports;
    expect((await store.report(only?.id ?? ''))?.reasons).toHaveLength(2);
  });

  it('opens one report when many report a subject at the same moment after a decision', async () => {
    // The decided report's key waits for InnoDB's purge (held off here by a snapshot): each first
    // reason's insert locks it shared to see the duplicate, then wants to insert beside it, so two
    // at once deadlock. Six, over 300 rounds: two at once deadlock too seldom to be seen.
    const store = await fresh();
    const subject = messageSubject();
    await db.connection().execute(async (snapshot) => {
      await sql`start transaction with consistent snapshot`.execute(snapshot);
      await sql`select count(*) from ModerationReport`.execute(snapshot);
      for (let round = 0; round < 300; round++) {
        await store.addReport(newReport(0, subject), reason(REPORTER));
        await store.decideReport(requestId(200), 'dismissed', null, MOD);
        const six = [1, 2, 3, 4, 5, 6];
        const all = await Promise.all(
          six.map((n) =>
            store.addReport(newReport(n, subject), reason(`20000000000000010${n}`, { at: n })),
          ),
        );
        expect(all.filter((one) => one.kind === 'opened')).toHaveLength(1);
        expect(all.filter((one) => one.kind === 'added')).toHaveLength(5);
        await db.deleteFrom('ModerationReportReason').execute();
        await db.deleteFrom('ModerationReport').execute();
      }
      await sql`commit`.execute(snapshot);
    });
  });

  it('adds a reason only to an open report: one decided meanwhile is followed by a new one', async () => {
    const store = await fresh();
    await store.addReport(newReport(1), reason(REPORTER));
    const other = createDb<DB>(database.config);
    try {
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked = (): void => undefined;
      const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
      });
      // A moderator's decision holds the report's row while a second reason comes.
      let otherId = 0;
      const deciding = other.transaction().execute(async (trx) => {
        otherId = await connectionId(trx);
        await trx
          .selectFrom('ModerationReport')
          .select('id')
          .where('id', '=', requestId(201))
          .forUpdate()
          .execute();
        locked();
        await held;
        await trx
          .updateTable('ModerationReport')
          .set({ status: 'dismissed', openKey: null })
          .where('id', '=', requestId(201))
          .execute();
      });
      await isLocked;
      const adding = store.addReport(newReport(2), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 }));
      // The reason's transaction waits for the decision's lock.
      expect(await lockWaits(db, otherId)).toBe(1);
      release();
      await deciding;
      expect(await adding).toMatchObject({ kind: 'opened', report: { id: requestId(202) } });
      expect((await store.report(requestId(201)))?.reasons).toHaveLength(1);
    } finally {
      await other.destroy();
    }
  });

  it('leaves a report whose subject does not read alone, and says so', async () => {
    await fresh();
    const { log, entries } = createTestLogger();
    const store = new ReportRepository(db, log);
    await store.addReport(newReport(1), reason());
    await db
      .updateTable('ModerationReport')
      .set({ subject: JSON.stringify({ kind: 'castle' }) })
      .execute();
    expect(await store.report(requestId(201))).toBeUndefined();
    expect(
      entries.filter((entry) => entry.msg === 'a report cannot be read; it is left alone'),
    ).toHaveLength(1);
  });

  describe('forgetting who made a report (plan 8G, `/admin forget`)', () => {
    const OTHER_PARTY = '00000000-0000-4000-8000-0000000000bb';
    const reasons = () =>
      db
        .selectFrom('ModerationReportReason')
        .select(['id', 'reportId', 'reporterId', 'reporterName', 'text'])
        .orderBy('id')
        .execute();

    /**
     * Carol reported a meetup (with Dave) and, in another server, a message; Dave reported a
     * party Carol made and a message she wrote.
     */
    const seeded = async () => {
      const store = await fresh();
      await store.addReport(newReport(1), reason(REPORTER));
      await store.addReport(newReport(1), reason(OTHER_REPORTER, { at: SAFETY_NOW + 1 }));
      await store.addReport(
        newReport(2, messageSubject(), { serverId: OTHER_SERVER }),
        reason(REPORTER, { text: 'Rude.' }),
      );
      await store.addReport(
        newReport(3, partySubject({ partyId: OTHER_PARTY, makerId: REPORTER, makerName: 'Carol' })),
        reason(OTHER_REPORTER),
      );
      await store.addReport(
        newReport(4, messageSubject({ messageId: '800000000000000002', authorId: REPORTER }), {
          serverId: OTHER_SERVER,
        }),
        reason(OTHER_REPORTER),
      );
      return store;
    };

    it('counts the reasons a member gave and the reports about them, in every server', async () => {
      const store = await seeded();
      expect(await store.heldOf(REPORTER)).toEqual({ reasons: 2, about: 2 });
      expect(await store.heldOf(OTHER_REPORTER)).toEqual({ reasons: 3, about: 0 });
      expect(await store.heldOf('200000000000000099')).toEqual({ reasons: 0, about: 0 });
    });

    it('takes their id and name off the reasons they gave; the reports stay, and so does everybody else', async () => {
      const store = await seeded();
      const before = await reasons();

      expect(await store.forgetReporter(REPORTER)).toBe(2);

      // Her words and the reports stay for the moderators, without who wrote them.
      expect(await reasons()).toEqual(
        before.map((row) =>
          row.reporterId === REPORTER ? { ...row, reporterId: null, reporterName: null } : row,
        ),
      );
      expect(before.filter((row) => row.reporterId === REPORTER)).toHaveLength(2);
      expect(await store.heldOf(REPORTER)).toEqual({ reasons: 0, about: 2 });
      expect(await store.heldOf(OTHER_REPORTER)).toEqual({ reasons: 3, about: 0 });
      // What others reported about her is the moderators' record: untouched.
      expect((await store.report(requestId(203)))?.subject).toMatchObject({
        makerId: REPORTER,
        makerName: 'Carol',
      });
      expect((await store.report(requestId(201)))?.reasons).toEqual([
        expect.objectContaining({ reporterId: null, reporterName: null, text: reason().text }),
        expect.objectContaining({ reporterId: OTHER_REPORTER, reporterName: 'Dave' }),
      ]);
      // Run again, there is nothing left to take off.
      expect(await store.forgetReporter(REPORTER)).toBe(0);
    });

    it('lets a forgotten reporter report again, and keeps both reasons apart', async () => {
      const store = await seeded();
      await store.forgetReporter(REPORTER);
      // "You already reported this" looks for her id, which the open report no longer holds.
      const again = await store.addReport(
        newReport(1),
        reason(REPORTER, { at: SAFETY_NOW + 2, text: 'Again.' }),
      );
      expect(again.kind).toBe('added');
      expect(again.report.reasons.map((one) => [one.reporterId, one.text])).toEqual([
        [null, reason().text],
        [OTHER_REPORTER, reason().text],
        [REPORTER, 'Again.'],
      ]);
      // A second reason of hers is still one too many.
      const twice = await store.addReport(newReport(1), reason(REPORTER, { text: 'Thrice.' }));
      expect(twice.kind).toBe('already');
    });
  });
});
