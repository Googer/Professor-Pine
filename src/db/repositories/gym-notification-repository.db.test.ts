import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import type { DB } from '../types.js';
import { GymNotificationRepository, type GymTargetStorage } from './gym-notification-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

describe('GymNotificationRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let targets: GymNotificationRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    targets = new GymNotificationRepository(db);
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot may have left it. */
  const legacyRow = async (member: string, guildId: number, gym: string | null) =>
    db
      .insertInto('GymNotification')
      .values({ userId: await users.ensure(member), guildId, gym })
      .execute();
  const stored = () =>
    db.selectFrom('GymNotification').select(['gym', 'userId', 'guildId']).orderBy('id').execute();

  it('has nothing for a member without a row, and creates none by reading', async () => {
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [], unreadable: 0 });
    expect(await targets.count(ALICE, HOME)).toBe(0);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(false);
    expect(await targets.removeAll(ALICE, HOME)).toBe(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
  });

  it('adds a target as the legacy bot wrote it, once, and gives the member their row', async () => {
    expect(await targets.add(ALICE, HOME, 4)).toBe('added');
    expect(await targets.add(ALICE, HOME, 4)).toBe('exists');
    expect(await targets.add(ALICE, HOME, 12)).toBe('added');
    const userId = await users.idFor(ALICE);
    expect(userId).toBeDefined();
    expect(await stored()).toEqual([
      { gym: '4', userId, guildId: 1 },
      { gym: '12', userId, guildId: 1 },
    ]);
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [4, 12], unreadable: 0 });
    expect(await targets.count(ALICE, HOME)).toBe(2);
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentions: false });
    const id = await users.idFor(ALICE);
    await targets.add(ALICE, HOME, 4);
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentions).toBe(false);
  });

  it('keeps targets apart by member and by server', async () => {
    await targets.add(ALICE, HOME, 4);
    await targets.add(ALICE, AWAY, 5);
    await targets.add(BOB, HOME, 6);
    expect((await targets.list(ALICE, HOME)).gymIds).toEqual([4]);
    expect((await targets.list(ALICE, AWAY)).gymIds).toEqual([5]);
    expect((await targets.list(BOB, HOME)).gymIds).toEqual([6]);
    expect(await targets.remove(BOB, HOME, 4)).toBe(false);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(true);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(false);
    expect(await stored()).toHaveLength(2);
  });

  it('reads legacy rows: one target for several rows of a gym, and what is no gym id counted', async () => {
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, '7');
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, null);
    await legacyRow(ALICE, 1, 'the library');
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [4, 7], unreadable: 2 });
    expect(await targets.count(ALICE, HOME)).toBe(4);
    // Adding what is there leaves one row of it; the rows that cannot be read stay.
    expect(await targets.add(ALICE, HOME, 4)).toBe('exists');
    expect((await stored()).map((row) => row.gym)).toEqual(['4', '7', null, 'the library']);
    // Removing takes every row of the gym.
    await legacyRow(ALICE, 1, '7');
    expect(await targets.remove(ALICE, HOME, 7)).toBe(true);
    expect((await stored()).map((row) => row.gym)).toEqual(['4', null, 'the library']);
  });

  it('removes all rows of a member in one server, also those it cannot read', async () => {
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, 'nowhere');
    await legacyRow(ALICE, 2, '5');
    await legacyRow(BOB, 1, '4');
    expect(await targets.removeAll(ALICE, HOME)).toBe(2);
    expect(await targets.removeAll(ALICE, HOME)).toBe(0);
    expect((await stored()).map((row) => [row.gym, row.guildId])).toEqual([
      ['5', 2],
      ['4', 1],
    ]);
  });

  it('has no limit on the targets of a member', async () => {
    for (let gym = 1; gym <= 130; gym++) await targets.add(ALICE, HOME, gym);
    expect(await targets.count(ALICE, HOME)).toBe(130);
  });

  it('makes one row when the same target is added many times at once', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => targets.add(ALICE, HOME, 4)),
    );
    expect(outcomes.filter((outcome) => outcome === 'added')).toHaveLength(1);
    expect(await stored()).toHaveLength(1);
  });

  it('lets different members add targets at the same time', async () => {
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234600n + BigInt(index)),
    );
    const outcomes = await Promise.all(members.map((member) => targets.add(member, HOME, 4)));
    expect(outcomes.every((outcome) => outcome === 'added')).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('lets different members add their first targets at once in a server that has no row yet', async () => {
    const other = '499999999999999998';
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234700n + BigInt(index)),
    );
    const outcomes = await Promise.all(members.map((member) => targets.add(member, other, 4)));
    expect(outcomes.every((outcome) => outcome === 'added')).toBe(true);
    const guilds = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .execute();
    expect(guilds).toHaveLength(1);
    expect(await stored()).toHaveLength(12);
  });

  it('finds by event the members who target a gym in a server, each once', async () => {
    await targets.add(ALICE, HOME, 4);
    await targets.add(BOB, HOME, 4);
    await targets.add(BOB, HOME, 41);
    await targets.add(BOB, AWAY, 4);
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, 'four');
    expect(await targets.targeting(HOME, 4)).toEqual([ALICE, BOB]);
    expect(await targets.targeting(HOME, 41)).toEqual([BOB]);
    expect(await targets.targeting(AWAY, 4)).toEqual([BOB]);
    expect(await targets.targeting(HOME, 5)).toEqual([]);
    expect(await targets.targeting('499999999999999999', 4)).toEqual([]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryGymTargets();
    // What the legacy bot may have left: a duplicate, and a row that is no gym id.
    for (const gym of ['7', '7', 'the library']) {
      await legacyRow(ALICE, 1, gym);
      memory.addRow(ALICE, HOME, gym);
    }
    const script = async (storage: GymTargetStorage) => [
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, HOME),
      await storage.add(ALICE, HOME, 7),
      await storage.list(ALICE, HOME),
      await storage.add(ALICE, HOME, 4),
      await storage.add(ALICE, HOME, 4),
      await storage.add(ALICE, AWAY, 9),
      await storage.add(BOB, HOME, 5),
      await storage.add(BOB, HOME, 7),
      await storage.targeting(HOME, 7),
      await storage.targeting(HOME, 4),
      await storage.targeting(AWAY, 9),
      await storage.targeting(AWAY, 7),
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, AWAY),
      await storage.remove(ALICE, HOME, 5),
      await storage.remove(ALICE, HOME, 4),
      await storage.removeAll(BOB, HOME),
      await storage.list(BOB, HOME),
      await storage.count(ALICE, HOME),
    ];
    expect(await script(targets)).toEqual(await script(memory));
  });

  it('counts the members who target a gym over all servers, and removes its targets', async () => {
    for (const store of [targets, new MemoryGymTargets()]) {
      await db.deleteFrom('GymNotification').execute();
      await store.add(ALICE, HOME, 17);
      await store.add(ALICE, AWAY, 17);
      await store.add(BOB, HOME, 17);
      await store.add(BOB, HOME, 170);
      expect(await store.membersTargeting(17)).toBe(2);
      expect(await store.membersTargeting(170)).toBe(1);
      expect(await store.membersTargeting(1)).toBe(0);

      expect(await store.removeGym(17)).toBe(3);

      expect(await store.membersTargeting(17)).toBe(0);
      expect(await store.list(ALICE, HOME)).toEqual({ gymIds: [], unreadable: 0 });
      expect(await store.list(BOB, HOME)).toEqual({ gymIds: [170], unreadable: 0 });
      expect(await store.removeGym(17)).toBe(0);
    }
  });
});
