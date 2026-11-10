import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LIBRARY,
  MAKER,
  meetupSafetyCases,
  newAppeal,
  newAsk,
  newAskRecord,
  MOD,
  MODERATOR,
  newRequest,
  requestId,
  SAFETY_NOW,
  SAFETY_SERVER,
} from '../../../test/support/meetup-safety-cases.js';
import { connectionId, lockWaits } from '../../../test/support/lock-waits.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { createDb } from '../kysely.js';
import type { DB } from '../types.js';
import { MeetupSafetyRepository } from './meetup-safety-repository.js';

describe('MeetupSafetyRepository', () => {
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
    for (const table of [
      'MeetupRequest',
      'MeetupPlaceRuling',
      'MeetupBlock',
      'MeetupAppeal',
      'MeetupPlaceAsk',
    ] as const) {
      await db.deleteFrom(table).execute();
    }
    return new MeetupSafetyRepository(db);
  };

  meetupSafetyCases(fresh);

  it('keeps times beyond 2^31 and snowflakes as written', async () => {
    const store = await fresh();
    const far = SAFETY_NOW * 2;
    await store.addRequest(
      newRequest(1, { makerId: '1234567890123456789', startTime: far, expiresAt: far - 1 }),
    );
    expect(await store.request(requestId(1))).toMatchObject({
      makerId: '1234567890123456789',
      startTime: far,
      expiresAt: far - 1,
    });
  });

  it('reads a request whose kept failure it does not know as one without a reason', async () => {
    await fresh();
    const store = new MeetupSafetyRepository(db);
    await store.addRequest(newRequest(1));
    await store.decideRequest(requestId(1), 'approved', 'approve', MOD);
    await store.settleApproval(requestId(1), { failed: { kind: 'no-forum' } });
    await db
      .updateTable('MeetupRequest')
      .set({ failure: JSON.stringify({ kind: 'castle' }) })
      .execute();
    expect(await store.request(requestId(1))).toMatchObject({ status: 'failed', failure: null });
  });

  it('marks a due request whose place is no place failed, and says so once', async () => {
    await fresh();
    const { log, entries } = createTestLogger();
    const store = new MeetupSafetyRepository(db, log);
    await store.addRequest(newRequest(1));
    await store.addRequest(newRequest(2, { expiresAt: SAFETY_NOW * 3 }));
    await db
      .updateTable('MeetupRequest')
      .set({ place: JSON.stringify({ kind: 'castle' }) })
      .execute();
    expect(await store.request(requestId(1))).toBeUndefined();
    expect(await store.duePending(SAFETY_NOW * 2)).toEqual([]);
    expect(await store.duePending(SAFETY_NOW * 2)).toEqual([]);
    const rows = await db
      .selectFrom('MeetupRequest')
      .select(['id', 'status'])
      .orderBy('id')
      .execute();
    // The one not due yet stays as it was.
    expect(rows).toEqual([
      { id: requestId(1), status: 'failed' },
      { id: requestId(2), status: 'pending' },
    ]);
    expect(
      entries.filter((entry) => entry.msg === 'a due meetup request cannot be read; it is failed'),
    ).toHaveLength(1);
  });

  it('lifts a block without the appeal a moderator decided meanwhile', async () => {
    const store = await fresh();
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addAppeal(newAppeal(1));
    const other = createDb<DB>(database.config);
    try {
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let kept = (): void => undefined;
      const isKept = new Promise<void>((resolve) => {
        kept = resolve;
      });
      // A moderator keeps the block on the appeal, and holds the appeal's row while it is lifted.
      let holder = 0;
      const keeping = other.transaction().execute(async (trx) => {
        holder = await connectionId(trx);
        await trx
          .updateTable('MeetupAppeal')
          .set({ status: 'kept', openKey: null, decidedBy: MODERATOR, decidedAt: String(MOD.at) })
          .where('id', '=', requestId(101))
          .execute();
        kept();
        await held;
      });
      await isKept;
      const lifting = store.liftWithAppeal(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 1 });
      expect(await lockWaits(db, holder)).toBe(1);
      release();
      await keeping;
      expect(await lifting).toEqual({ lifted: true, appeal: undefined });
      expect((await store.appeal(requestId(101)))?.status).toBe('kept');
    } finally {
      await other.destroy();
    }
  });

  it('lifts a block from /places while the appeal is being decided, without a deadlock', async () => {
    const store = await fresh();
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.addAppeal(newAppeal(1));
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
      // Lift block on the appeal post, in liftOnAppeal's order: the appeal first, then the block.
      let holder = 0;
      const onAppeal = other.transaction().execute(async (trx) => {
        holder = await connectionId(trx);
        await trx
          .updateTable('MeetupAppeal')
          .set({ status: 'lifted', openKey: null, decidedBy: MODERATOR, decidedAt: String(MOD.at) })
          .where('id', '=', requestId(101))
          .execute();
        locked();
        await held;
        await trx
          .updateTable('MeetupBlock')
          .set({ liftedBy: MODERATOR, liftedAt: String(MOD.at) })
          .where('serverId', '=', SAFETY_SERVER)
          .where('memberId', '=', MAKER)
          .where('liftedAt', 'is', null)
          .execute();
      });
      await isLocked;
      const fromPlaces = store.liftWithAppeal(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 1 });
      expect(await lockWaits(db, holder)).toBe(1);
      release();
      await onAppeal;
      expect(await fromPlaces).toEqual({ lifted: false, appeal: undefined });
    } finally {
      await other.destroy();
    }
  });

  it('allows a place on an ask after an Undo ruling of it, in the order of their locks', async () => {
    const store = await fresh();
    const key = { kind: 'stop' as const, id: LIBRARY.id };
    await store.rule(SAFETY_SERVER, key, 'refuse', MOD, { place: LIBRARY });
    await store.addAsk(newAsk(1));
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
      // An Undo ruling, as `undoRuling` makes it: the ruling's row locked first, then the ask's.
      let holder = 0;
      const undoing = other.transaction().execute(async (trx) => {
        holder = await connectionId(trx);
        await trx
          .selectFrom('MeetupPlaceRuling')
          .selectAll()
          .where('serverId', '=', SAFETY_SERVER)
          .where('placeId', '=', LIBRARY.id)
          .forUpdate()
          .execute();
        locked();
        await held;
        await trx
          .updateTable('MeetupPlaceAsk')
          .set({ status: 'undone', openKey: null })
          .where('id', '=', requestId(301))
          .execute();
        await trx
          .deleteFrom('MeetupPlaceRuling')
          .where('serverId', '=', SAFETY_SERVER)
          .where('placeId', '=', LIBRARY.id)
          .execute();
      });
      await isLocked;
      const allowing = store.allowOnAsk(newAskRecord(1), { ...MOD, at: MOD.at + 1 });
      expect(await lockWaits(db, holder)).toBe(1);
      release();
      await undoing;
      // The ask was undone first: nothing to allow.
      expect(await allowing).toBe(false);
      expect((await store.ask(requestId(301)))?.status).toBe('undone');
      expect(await store.ruling(SAFETY_SERVER, key)).toBeUndefined();
    } finally {
      await other.destroy();
    }
  });

  it('decides a request once when two decide it at the same moment', async () => {
    const store = await fresh();
    await store.addRequest(newRequest(1));
    const both = await Promise.all([
      store.decideRequest(requestId(1), 'approved', 'approve', MOD),
      store.decideRequest(requestId(1), 'refused', 'refuse', { ...MOD, id: MAKER }),
    ]);
    expect(both.filter(Boolean)).toHaveLength(1);
  });

  it('blocks a member once when two block them at the same moment', async () => {
    const store = await fresh();
    const both = await Promise.all([
      store.addBlock(SAFETY_SERVER, MAKER, MOD),
      store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 1 }),
    ]);
    expect([...both].sort()).toEqual([false, true]);
    // Over two requests of the maker: both refused, one block, no deadlock.
    const again = await fresh();
    await again.addRequest(newRequest(1));
    await again.addRequest(newRequest(2));
    const blocks = await Promise.all([
      again.blockMaker(newRequest(1), MOD),
      again.blockMaker(newRequest(2), { ...MOD, at: MOD.at + 1 }),
    ]);
    expect(blocks.map((one) => one.decided)).toEqual([true, true]);
    expect(blocks.filter((one) => one.newBlock)).toHaveLength(1);
    // And again once the block was lifted (the row is there).
    await again.liftBlock(SAFETY_SERVER, MAKER, MOD);
    await again.addRequest(newRequest(3));
    await again.addRequest(newRequest(4));
    const anew = await Promise.all([
      again.blockMaker(newRequest(3), MOD),
      again.blockMaker(newRequest(4), { ...MOD, at: MOD.at + 1 }),
    ]);
    expect(anew.filter((one) => one.newBlock)).toHaveLength(1);
  });

  it('blocks a member once when many block them at the same moment over a deleted row', async () => {
    // A deleted row waits for InnoDB's purge (held off here by a snapshot): each insert locks it
    // shared to see the duplicate, then exclusive to use it again, so two at once deadlock. No
    // block is ever deleted but by a test; a deadlocked block is tried again all the same. Six,
    // over 300 rounds: two at once deadlock too seldom to be seen.
    const store = await fresh();
    await db.connection().execute(async (snapshot) => {
      await sql`start transaction with consistent snapshot`.execute(snapshot);
      await sql`select count(*) from MeetupBlock`.execute(snapshot);
      for (let round = 0; round < 300; round++) {
        await store.addBlock(SAFETY_SERVER, MAKER, MOD);
        await db.deleteFrom('MeetupBlock').execute();
        const six = [1, 2, 3, 4, 5, 6];
        // By turns alone and with the maker's requests, each a transaction tried again whole.
        if (round % 2 === 0) {
          const all = await Promise.all(
            six.map((n) => store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + n })),
          );
          expect(all.filter(Boolean)).toHaveLength(1);
        } else {
          for (const n of six) await store.addRequest(newRequest(n));
          const all = await Promise.all(
            six.map((n) => store.blockMaker(newRequest(n), { ...MOD, at: MOD.at + n })),
          );
          expect(all.filter((one) => one.decided)).toHaveLength(6);
          expect(all.filter((one) => one.newBlock)).toHaveLength(1);
          await db.deleteFrom('MeetupRequest').execute();
        }
        await db.deleteFrom('MeetupBlock').execute();
      }
      await sql`commit`.execute(snapshot);
    });
  });

  it('takes a second appeal of one id as the fault it is, not as an open appeal', async () => {
    const store = await fresh();
    const appeal = newAppeal(1);
    expect(await store.addAppeal(appeal)).toBe('added');
    await store.decideAppeal(appeal.id, 'kept', MOD);
    await expect(store.addAppeal(appeal)).rejects.toThrow(/Duplicate entry/);
  });

  it('keeps who lifted a block last, until the member is blocked again', async () => {
    const store = await fresh();
    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
    await store.liftBlock(SAFETY_SERVER, MAKER, { id: MODERATOR, name: 'Mod', at: MOD.at + 5 });
    const lifted = () =>
      db
        .selectFrom('MeetupBlock')
        .select(['liftedBy', 'liftedByName', 'liftedAt'])
        .executeTakeFirstOrThrow();
    expect(await lifted()).toEqual({
      liftedBy: MODERATOR,
      liftedByName: 'Mod',
      liftedAt: String(MOD.at + 5),
    });
    await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 9 });
    expect(await lifted()).toEqual({ liftedBy: null, liftedByName: null, liftedAt: null });
  });
});
