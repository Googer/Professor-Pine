import { sql, type Kysely } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { startDatabase } from '../../../test/support/mysql.js';
import { MemoryNewTrains } from '../../../test/support/new-trains.js';
import { createDb } from '../kysely.js';
import { runMigrations } from '../migrator.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { NewTrainRepository, type NewTrainStorage } from './new-train-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NOWHERE = '499999999999999999';
const NOW = 1_800_000_000_000;

describe('NewTrainRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let trains: NewTrainRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    trains = new NewTrainRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await db.deleteFrom('User').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  const stored = () =>
    db
      .selectFrom('NewTrainNotification')
      .select(['guildId', 'memberId', 'createdAt'])
      .orderBy('guildId')
      .orderBy('memberId')
      .execute();

  it('is off for everybody until it is switched on, per member and server', async () => {
    expect(await trains.isOn(ALICE, HOME)).toBe(false);
    expect(await trains.set(ALICE, HOME, true, NOW)).toBe(true);
    expect(await trains.isOn(ALICE, HOME)).toBe(true);
    expect(await trains.isOn(ALICE, AWAY)).toBe(false);
    expect(await trains.isOn(BOB, HOME)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
  });

  it('says whether a switch changed anything, and keeps the first row as it is', async () => {
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(false);
    expect(await trains.set(ALICE, HOME, true, NOW)).toBe(true);
    expect(await trains.set(ALICE, HOME, true, NOW + 5_000)).toBe(false);
    expect(await stored()).toEqual([{ guildId: 1, memberId: ALICE, createdAt: String(NOW) }]);
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(true);
    expect(await trains.set(ALICE, HOME, false, NOW)).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it('gives who asked in a server, oldest first, and nobody of another server', async () => {
    expect(await trains.wanting(HOME)).toEqual([]);
    await trains.set(BOB, HOME, true, NOW);
    await trains.set(ALICE, HOME, true, NOW + 1);
    await trains.set(CAROL, AWAY, true, NOW + 2);
    await trains.set(ALICE, AWAY, true, NOW + 3);
    expect(await trains.wanting(HOME)).toEqual([BOB, ALICE]);
    expect(await trains.wanting(AWAY)).toEqual([CAROL, ALICE]);
    expect(await trains.wanting(NOWHERE)).toEqual([]);
    await trains.set(BOB, HOME, false, NOW);
    expect(await trains.wanting(HOME)).toEqual([ALICE]);
    // Switching off in one server leaves the other alone.
    expect(await trains.isOn(ALICE, AWAY)).toBe(true);
  });

  it('makes the row of a server that has none when a member switches it on there', async () => {
    expect(await trains.set(ALICE, NOWHERE, false, NOW)).toBe(false);
    expect(await new GuildRepository(db).idFor(NOWHERE)).toBeUndefined();
    expect(await trains.set(ALICE, NOWHERE, true, NOW)).toBe(true);
    expect(await new GuildRepository(db).idFor(NOWHERE)).toBeDefined();
    expect(await trains.wanting(NOWHERE)).toEqual([ALICE]);
  });

  it('makes one row when the same member switches it on many times at once', async () => {
    const changed = await Promise.all(
      Array.from({ length: 8 }, (_unused, n) => trains.set(ALICE, HOME, true, NOW + n)),
    );
    expect(changed.filter(Boolean)).toHaveLength(1);
    expect(await stored()).toHaveLength(1);
  });

  it('loses its rows with the server, and never touches the legacy column', async () => {
    await sql`insert into User (userSnowflake, newTrain) values (${ALICE}, 0)`.execute(db);
    await trains.set(ALICE, HOME, true, NOW);
    const flag = await db.selectFrom('User').select('newTrain').executeTakeFirstOrThrow();
    expect(flag.newTrain).toBe(0);
    await new GuildRepository(db).remove(HOME);
    expect(await stored()).toEqual([]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryNewTrains();
    const script = async (storage: NewTrainStorage) => [
      await storage.isOn(ALICE, HOME),
      await storage.set(ALICE, HOME, false, NOW),
      await storage.set(ALICE, HOME, true, NOW),
      await storage.set(ALICE, HOME, true, NOW + 1),
      await storage.set(BOB, HOME, true, NOW - 1),
      await storage.set(BOB, AWAY, true, NOW),
      await storage.set(CAROL, HOME, true, NOW),
      await storage.isOn(ALICE, HOME),
      await storage.isOn(ALICE, AWAY),
      await storage.wanting(HOME),
      await storage.wanting(AWAY),
      await storage.wanting(NOWHERE),
      await storage.set(BOB, HOME, false, NOW),
      await storage.set(BOB, HOME, false, NOW),
      await storage.wanting(HOME),
    ];
    expect(await script(trains)).toEqual(await script(memory));
  });

  it('forgets a member in every server, counted, and nobody else (plan 8G)', async () => {
    await trains.set(ALICE, HOME, true, NOW);
    await trains.set(ALICE, AWAY, true, NOW + 1);
    await trains.set(BOB, HOME, true, NOW + 2);
    expect(await trains.countOf(ALICE)).toBe(2);
    expect(await trains.countOf(CAROL)).toBe(0);

    expect(await trains.forget(ALICE)).toBe(2);

    expect(await trains.countOf(ALICE)).toBe(0);
    expect(await stored()).toEqual([{ guildId: 1, memberId: BOB, createdAt: String(NOW + 2) }]);
    // Nothing is left to forget, and somebody without a row has none.
    expect(await trains.forget(ALICE)).toBe(0);
    expect(await trains.forget(CAROL)).toBe(0);
    expect(await trains.isOn(BOB, HOME)).toBe(true);
  });
});

describe('the migration to new-train notifications per server', () => {
  it('gives everybody with the legacy flag a row for every server, and leaves the flag', async () => {
    const database = await startDatabase({ legacySchema: true });
    const db = createDb<DB>(database.config);
    try {
      await database.query('insert into Guild (id, snowflake) values (1, ?), (2, ?)', [HOME, AWAY]);
      await database.query(
        'insert into User (userSnowflake, newTrain) values (?, 1), (?, 0), (?, 1), (null, 1)',
        [ALICE, BOB, CAROL],
      );
      const before = Date.now();
      await runMigrations(db, pino({ level: 'silent' }));
      const rows = await db
        .selectFrom('NewTrainNotification')
        .select(['guildId', 'memberId', 'createdAt'])
        .orderBy('guildId')
        .orderBy('memberId')
        .execute();
      expect(rows.map(({ guildId, memberId }) => ({ guildId, memberId }))).toEqual([
        { guildId: 1, memberId: ALICE },
        { guildId: 1, memberId: CAROL },
        { guildId: 2, memberId: ALICE },
        { guildId: 2, memberId: CAROL },
      ]);
      for (const row of rows) expect(Number(row.createdAt)).toBeGreaterThanOrEqual(before);
      const trains = new NewTrainRepository(db);
      expect((await trains.wanting(HOME)).sort()).toEqual([ALICE, CAROL]);
      // The legacy bot still reads its column: it is as it was.
      const flags = await database.query<{ newTrain: number }>(
        'select newTrain from User order by id',
      );
      expect(flags.map((row) => Number(row.newTrain))).toEqual([1, 0, 1, 1]);
      // Switching off in the new bot leaves it too.
      await trains.set(ALICE, HOME, false, Date.now());
      const after = await database.query<{ newTrain: number }>(
        'select newTrain from User where userSnowflake = ?',
        [ALICE],
      );
      expect(Number(after[0]?.newTrain)).toBe(1);
    } finally {
      await db.destroy();
      await database.stop();
    }
  });
});
