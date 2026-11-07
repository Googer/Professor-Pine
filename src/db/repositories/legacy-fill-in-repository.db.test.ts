import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { HistoryRepository } from './history-repository.js';
import { LegacyFillInRepository } from './legacy-fill-in-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOW = 1_800_000_000_000;

describe('LegacyFillInRepository: the queue of legacy fill-ins', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let history: HistoryRepository;
  let fillIns: LegacyFillInRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    history = new HistoryRepository(db);
    fillIns = new LegacyFillInRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('HistoryOptIn').execute();
    await db.deleteFrom('LegacyFillIn').execute();
  });

  it('queues a fill-in only for a member whose history is on, once', async () => {
    expect(await fillIns.request(ALICE, HOME, NOW)).toBe('off');
    expect(await fillIns.stateOf(ALICE, HOME)).toBeUndefined();
    await history.optIn(ALICE, HOME, NOW);
    expect(await fillIns.request(ALICE, HOME, NOW + 1)).toBe('queued');
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'queued' });
    // Asked again: the first request stands.
    expect(await fillIns.request(ALICE, HOME, NOW + 2)).toBe('asked');
    expect(await db.selectFrom('LegacyFillIn').selectAll().execute()).toEqual([
      {
        serverId: HOME,
        memberId: ALICE,
        requestedAt: String(NOW + 1),
        startedAt: null,
        doneAt: null,
        filled: 0,
        failedAt: null,
        failure: null,
      },
    ]);
    // Per server and member.
    expect(await fillIns.stateOf(ALICE, AWAY)).toBeUndefined();
    expect(await fillIns.stateOf(BOB, HOME)).toBeUndefined();
  });

  it('says how a fill-in ended', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await history.optIn(BOB, HOME, NOW);
    await fillIns.request(ALICE, HOME, NOW);
    await fillIns.request(BOB, HOME, NOW);
    await sql`update LegacyFillIn set doneAt = ${NOW + 5}, filled = 1234
              where memberId = ${ALICE}`.execute(db);
    await sql`update LegacyFillIn set failedAt = ${NOW + 5}, failure = 'the file is not there'
              where memberId = ${BOB}`.execute(db);
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'done', filled: 1234 });
    expect(await fillIns.stateOf(BOB, HOME)).toEqual({
      state: 'failed',
      failure: 'the file is not there',
    });
  });

  it('queues a failed fill-in again when asked again, and leaves a done or waiting one (A1)', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await history.optIn(BOB, HOME, NOW);
    await history.optIn(BOB, AWAY, NOW);
    await fillIns.request(ALICE, HOME, NOW);
    await fillIns.request(BOB, HOME, NOW);
    await fillIns.request(BOB, AWAY, NOW);
    await sql`update LegacyFillIn set startedAt = ${NOW + 1}, failedAt = ${NOW + 2},
              failure = 'damaged' where memberId = ${ALICE}`.execute(db);
    await sql`update LegacyFillIn set startedAt = ${NOW + 1}, doneAt = ${NOW + 2}, filled = 7
              where memberId = ${BOB} and serverId = ${HOME}`.execute(db);
    expect(await fillIns.request(ALICE, HOME, NOW + 10)).toBe('queued');
    expect(await fillIns.request(BOB, HOME, NOW + 10)).toBe('asked');
    expect(await fillIns.request(BOB, AWAY, NOW + 10)).toBe('asked');
    const rows = await db
      .selectFrom('LegacyFillIn')
      .select(['memberId', 'serverId', 'requestedAt', 'startedAt', 'doneAt', 'failedAt', 'failure'])
      .orderBy('memberId')
      .orderBy('serverId')
      .execute();
    expect(rows).toEqual([
      {
        memberId: ALICE,
        serverId: HOME,
        requestedAt: String(NOW + 10),
        startedAt: null,
        doneAt: null,
        failedAt: null,
        failure: null,
      },
      {
        memberId: BOB,
        serverId: HOME,
        requestedAt: String(NOW),
        startedAt: String(NOW + 1),
        doneAt: String(NOW + 2),
        failedAt: null,
        failure: null,
      },
      {
        memberId: BOB,
        serverId: AWAY,
        requestedAt: String(NOW),
        startedAt: null,
        doneAt: null,
        failedAt: null,
        failure: null,
      },
    ]);
    expect(await fillIns.stateOf(ALICE, HOME)).toEqual({ state: 'queued' });
  });

  it('goes with the history opt-in: an opt-out deletes the request', async () => {
    await history.optIn(ALICE, HOME, NOW);
    await history.optIn(ALICE, AWAY, NOW);
    await fillIns.request(ALICE, HOME, NOW);
    await fillIns.request(ALICE, AWAY, NOW);
    await history.optOut(ALICE, HOME);
    expect(await fillIns.stateOf(ALICE, HOME)).toBeUndefined();
    expect(await fillIns.stateOf(ALICE, AWAY)).toEqual({ state: 'queued' });
    // Turned on again, the member may ask again (QC).
    await history.optIn(ALICE, HOME, NOW + 1);
    expect(await fillIns.request(ALICE, HOME, NOW + 1)).toBe('queued');
  });

  it('never leaves a request without its history opt-in when an opt-out runs at once', async () => {
    for (let n = 0; n < 25; n++) {
      await history.optIn(ALICE, HOME, NOW);
      await Promise.all([fillIns.request(ALICE, HOME, NOW + n), history.optOut(ALICE, HOME)]);
      const orphans = await sql<{ n: number }>`
        select count(*) as n from LegacyFillIn f
        where not exists (select 1 from HistoryOptIn h
                          where h.serverId = f.serverId and h.memberId = f.memberId)`.execute(db);
      expect(Number(orphans.rows[0]?.n), `round ${String(n)}`).toBe(0);
    }
  });
});
