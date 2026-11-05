import { sql, type Insertable, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVITY_SERVER,
  activityReaderCases,
  OTHER_ACTIVITY_SERVER,
} from '../../../test/support/activity-cases.js';
import { connectionId, lockWaits } from '../../../test/support/lock-waits.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { zonedAt } from '../../../test/support/time.js';
import { createDb } from '../kysely.js';
import type { DB } from '../types.js';
import { UNKNOWN_MONTH } from '../../domain/history/activity.js';
import { ActivityRepository } from './activity-repository.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

/** A record of the party history as the history writes it: a raid at gym 7 in region 2. */
function historyRow(overrides: Partial<Insertable<DB['PartyHistory']>> = {}) {
  return {
    source: 'live',
    kind: 'raid',
    serverId: ACTIVITY_SERVER,
    regionId: 2,
    gymId: 7,
    createdAt: String(at('2026-10-22T17:20')),
    hatchTime: String(at('2026-10-22T18:00')),
    ending: 'completed',
    hereHeads: 2,
    doneHeads: 3,
    ...overrides,
  } satisfies Insertable<DB['PartyHistory']>;
}

describe('ActivityRepository', () => {
  let database: TestDatabase;
  let db: Kysely<DB>;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ database, db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await sql`delete from ActivityBucket`.execute(db);
    await sql`delete from ActivityProgress`.execute(db);
    await sql`delete from PartyHistory`.execute(db);
  });

  const record = async (...rows: Array<Partial<Insertable<DB['PartyHistory']>>>) => {
    await db
      .insertInto('PartyHistory')
      .values(rows.map((row) => historyRow(row)))
      .execute();
  };

  const bucketsOf = async (serverId = ACTIVITY_SERVER) =>
    (
      await db
        .selectFrom('ActivityBucket')
        .selectAll()
        .where('serverId', '=', serverId)
        .orderBy(['regionId', 'placeKind', 'placeId', 'month', 'weekday', 'hour'])
        .execute()
    ).map(({ serverId: _server, ...bucket }) => bucket);

  const progressOf = async (serverId = ACTIVITY_SERVER) =>
    (
      await db
        .selectFrom('ActivityProgress')
        .select('lastHistoryId')
        .where('serverId', '=', serverId)
        .executeTakeFirst()
    )?.lastHistoryId;

  const lastId = async () =>
    Number(
      (await db.selectFrom('PartyHistory').select(db.fn.max('id').as('id')).executeTakeFirst())?.id,
    );

  const repository = (batch?: number) =>
    new ActivityRepository(db, { zone: ZONE, ...(batch === undefined ? {} : { batch }) });

  it('adds every raid and max battle that counts to its place’s bucket, summed', async () => {
    await record(
      {},
      { hereHeads: 1, doneHeads: 0, ending: 'expired' },
      { kind: 'max', gymId: null, wayspotId: 'abc.16', hatchTime: null },
      // A max battle at a pin, and a raid without a gym: counted at no place.
      { kind: 'max', gymId: null, wayspotId: null, hatchTime: null, regionId: null },
      { gymId: null, legacyGymId: 99, source: 'legacy', ending: 'unknown' },
      // Neither counts.
      { ending: 'cancelled' },
      { kind: 'train', gymId: null },
    );
    const added = await repository().addNew();
    expect(added).toBe(7);
    expect(await bucketsOf()).toEqual([
      {
        regionId: 0,
        placeKind: 'none',
        placeId: '0',
        month: '2026-10',
        weekday: 4,
        hour: 17,
        raids: 0,
        maxes: 1,
        completed: 1,
        heads: 5,
      },
      {
        regionId: 2,
        placeKind: 'gym',
        placeId: '7',
        month: '2026-10',
        weekday: 4,
        hour: 18,
        raids: 2,
        maxes: 0,
        completed: 1,
        heads: 6,
      },
      {
        regionId: 2,
        placeKind: 'none',
        placeId: '0',
        month: '2026-10',
        weekday: 4,
        hour: 18,
        raids: 1,
        maxes: 0,
        completed: 0,
        heads: 5,
      },
      {
        regionId: 2,
        placeKind: 'spot',
        placeId: 'abc.16',
        month: '2026-10',
        weekday: 4,
        hour: 17,
        raids: 0,
        maxes: 1,
        completed: 1,
        heads: 5,
      },
    ]);
    expect(await progressOf()).toBe(await lastId());
  });

  it('adds only the records above its mark, each once', async () => {
    const activity = repository();
    await record({});
    await activity.addNew();
    expect(await activity.addNew()).toBe(0);
    await record({ hereHeads: 0, doneHeads: 1 });
    expect(await activity.addNew()).toBe(1);
    expect(await bucketsOf()).toMatchObject([{ raids: 2, heads: 6 }]);
    expect(await progressOf()).toBe(await lastId());
  });

  it('keeps each server’s buckets and mark apart', async () => {
    await record({}, { serverId: OTHER_ACTIVITY_SERVER, gymId: 8 });
    await repository().addNew();
    expect(await bucketsOf()).toMatchObject([{ placeId: '7', raids: 1 }]);
    expect(await bucketsOf(OTHER_ACTIVITY_SERVER)).toMatchObject([{ placeId: '8', raids: 1 }]);
    expect(await progressOf(OTHER_ACTIVITY_SERVER)).toBe(await lastId());
  });

  it('adds in batches, one transaction each with its mark, as one pass would', async () => {
    const rows = Array.from({ length: 7 }, (_, n) => ({
      hatchTime: String(at('2026-10-22T18:00') + n * 3_600_000),
      gymId: 1 + (n % 3),
    }));
    await record(...rows);
    const batched = repository(2);
    let batches = 0;
    // The stop is asked before each batch: three batches, then it stops.
    expect(await batched.addNew({ isStopped: () => batches++ >= 3 })).toBe(6);
    const sixth = Number(
      (
        await db
          .selectFrom('PartyHistory')
          .select('id')
          .orderBy('id')
          .offset(5)
          .limit(1)
          .executeTakeFirst()
      )?.id,
    );
    expect(await progressOf()).toBe(sixth);
    expect(await batched.addNew()).toBe(1);
    const inBatches = await bucketsOf();
    await sql`delete from ActivityBucket`.execute(db);
    await sql`delete from ActivityProgress`.execute(db);
    await repository().addNew();
    expect(await bucketsOf()).toEqual(inBatches);
  });

  it('rebuilds a server in full to what the hourly adding made of the same history', async () => {
    const activity = repository(3);
    await record({}, { kind: 'max', gymId: null, wayspotId: 'abc.16' }, { ending: 'cancelled' });
    await activity.addNew();
    await record({ gymId: 8 }, { gymId: null }, {}, { serverId: OTHER_ACTIVITY_SERVER });
    await activity.addNew();
    await record({ hatchTime: String(at('2019-06-01T12:00')) });
    await activity.addNew();
    const hourly = await bucketsOf();
    const other = await bucketsOf(OTHER_ACTIVITY_SERVER);
    // A bucket made wrong (by hand): the rebuild starts the server from nothing.
    await sql`update ActivityBucket set raids = 99 where serverId = ${ACTIVITY_SERVER}`.execute(db);
    expect(await activity.rebuild(ACTIVITY_SERVER)).toEqual({ servers: 1, records: 7 });
    expect(await bucketsOf()).toEqual(hourly);
    expect(await progressOf()).toBe(await lastId());
    // The other server's are left as they were; a rebuild of every server makes both again.
    expect(await bucketsOf(OTHER_ACTIVITY_SERVER)).toEqual(other);
    expect(await activity.rebuild()).toEqual({ servers: 2, records: 8 });
    expect(await bucketsOf()).toEqual(hourly);
    expect(await bucketsOf(OTHER_ACTIVITY_SERVER)).toEqual(other);
    // Safe to run again.
    expect(await activity.rebuild()).toEqual({ servers: 2, records: 8 });
    expect(await bucketsOf()).toEqual(hourly);
  });

  it('runs rebuilds and the hourly adding side by side without a deadlock or a count twice', async () => {
    await record(...Array.from({ length: 9 }, (_, n) => ({ gymId: 1 + (n % 3) })));
    await repository().addNew();
    const once = await bucketsOf();
    // Each on a connection of its own (the pool's), all at the server's mark at once.
    for (let round = 0; round < 5; round++) {
      await Promise.all([
        repository(2).rebuild(ACTIVITY_SERVER),
        repository(2).rebuild(),
        repository(2).addNew(),
        repository(2).rebuild(ACTIVITY_SERVER),
      ]);
      expect(await bucketsOf()).toEqual(once);
    }
  });

  it('adds a record of a time no month holds at no place, and goes on past it', async () => {
    await record({ hatchTime: String(8.64e15) }, { gymId: 2 });
    expect(await repository().addNew()).toBe(2);
    expect(await bucketsOf()).toMatchObject([
      { placeKind: 'gym', placeId: '2', raids: 1 },
      { placeKind: 'none', month: UNKNOWN_MONTH, weekday: 0, raids: 1 },
    ]);
    expect(await progressOf()).toBe(await lastId());
    // The slider's months leave it out.
    expect(await repository().months(ACTIVITY_SERVER)).toEqual({
      first: '2026-10',
      last: '2026-10',
    });
  });

  it('forgets a server’s buckets on a rebuild once its history is gone', async () => {
    await record({});
    await repository().addNew();
    await sql`delete from PartyHistory`.execute(db);
    expect(await repository().rebuild()).toEqual({ servers: 1, records: 0 });
    expect(await bucketsOf()).toEqual([]);
    expect(await progressOf()).toBe(0);
  });

  it('waits for a record still being written below one written already, and counts both', async () => {
    const other = createDb<DB>(database.config);
    try {
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let written = (): void => undefined;
      const isWritten = new Promise<void>((resolve) => {
        written = resolve;
      });
      // A party's end writes its record and has not committed yet, while a later one has.
      let holder = 0;
      const writing = other.transaction().execute(async (trx) => {
        holder = await connectionId(trx);
        await trx
          .insertInto('PartyHistory')
          .values(historyRow({ gymId: 1 }))
          .execute();
        written();
        await held;
      });
      await isWritten;
      await record({ gymId: 2 });
      const adding = repository().addNew();
      expect(await lockWaits(db, holder)).toBe(1);
      release();
      await writing;
      expect(await adding).toBe(2);
      expect((await bucketsOf()).map((bucket) => bucket.placeId)).toEqual(['1', '2']);
    } finally {
      await other.destroy();
    }
  });

  describe('as a reader', () => {
    activityReaderCases(async () => {
      await sql`delete from ActivityBucket`.execute(db);
      return {
        reader: repository(),
        add: async (serverId, buckets) => {
          await db
            .insertInto('ActivityBucket')
            .values(buckets.map((bucket) => ({ serverId, ...bucket })))
            .execute();
        },
      };
    });
  });
});
