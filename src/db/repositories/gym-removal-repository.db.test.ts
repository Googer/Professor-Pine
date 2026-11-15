import { stops } from '../../../test/support/parties.js';
import { sql, type Kysely } from 'kysely';
import { deadlockingOnce } from '../../../test/support/deadlock.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRemovalRepository } from './gym-removal-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const CAROL = '312345678901234569';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
/** The first server (row 1) with its region (1), as gym administration names it. */
const HOME_SERVER = { guildId: 1, regionIds: [1] };

describe('GymRemovalRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gyms: GymRepository;
  let routes: SavedRouteRepository;
  let targets: GymNotificationRepository;
  let removal: GymRemovalRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    gyms = new GymRepository(db);
    routes = new SavedRouteRepository(db);
    targets = new GymNotificationRepository(db);
    removal = new GymRemovalRepository(db);
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788),
      (2, 2, 1234567890123456789)`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('SavedRoutes').execute();
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('Gym').execute();
    await db.deleteFrom('User').execute();
  });

  it('removes the gym with the saved routes and the gym targets that name it', async () => {
    const gone = await gyms.create({ name: 'Going', lat: 40, lon: -80 }, 1);
    const stays = await gyms.create({ name: 'Staying', lat: 41, lon: -80 }, 1);
    await routes.save(ALICE, 1, 'Loop', stops(gone.id, stays.id));
    await routes.save(BOB, 1, 'Only', stops(gone.id));
    await routes.save(BOB, 1, 'Other', stops(stays.id));
    // A route and a target of another server that still name the gym (left from before).
    await routes.save(CAROL, 2, 'Away loop', stops(gone.id, stays.id));
    await targets.add(CAROL, AWAY, gone.id);
    // One member in two servers is one member.
    await targets.add(ALICE, HOME, gone.id);
    await targets.add(ALICE, AWAY, gone.id);
    await targets.add(BOB, HOME, gone.id);
    await targets.add(BOB, HOME, stays.id);

    // The counts are the deleting server's, as its question said them (plan 19B-2, H3).
    await expect(removal.remove(gone.id, HOME_SERVER)).resolves.toEqual({
      routes: 2,
      targets: 2,
      deleted: true,
    });

    await expect(gyms.get(gone.id)).resolves.toBeUndefined();
    await expect(gyms.get(stays.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', stops: stops(stays.id) }]);
    expect(await routes.list(BOB, 1)).toMatchObject([{ name: 'Other', stops: stops(stays.id) }]);
    // Whatever of another server still named it went with the row.
    expect(await routes.list(CAROL, 2)).toMatchObject([
      { name: 'Away loop', stops: stops(stays.id) },
    ]);
    expect(await targets.membersTargeting(gone.id, 'every')).toBe(0);
    expect(await targets.list(BOB, HOME)).toEqual({ gymIds: [stays.id], unreadable: 0 });
  });

  it('cleans up what names a gym whose row is gone already', async () => {
    await routes.save(ALICE, 1, 'Loop', stops(77, 78));
    await targets.add(ALICE, HOME, 77);
    await expect(removal.remove(77, HOME_SERVER)).resolves.toEqual({
      routes: 1,
      targets: 1,
      deleted: true,
    });
    expect(await routes.list(ALICE, 1)).toMatchObject([{ stops: stops(78) }]);
  });

  it('changes nothing when a part of it fails', async () => {
    const gym = await gyms.create({ name: 'Going', lat: 40, lon: -80 }, 1);
    await routes.save(ALICE, 1, 'Loop', stops(gym.id));
    await targets.add(ALICE, HOME, gym.id);
    // The last step of the removal is refused by the database: a row that must keep the gym.
    await sql`create table GymKeeper (gymId int unsigned not null,
      constraint gymkeeper_gym foreign key (gymId) references Gym (id))`.execute(db);
    await sql`insert into GymKeeper (gymId) values (${gym.id})`.execute(db);
    try {
      await expect(removal.remove(gym.id, HOME_SERVER)).rejects.toThrow();
    } finally {
      await sql`drop table GymKeeper`.execute(db);
    }
    await expect(gyms.get(gym.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', stops: stops(gym.id) }]);
    expect(await targets.membersTargeting(gym.id, 'every')).toBe(1);
  });

  it('runs the removal again after a deadlock rolled the first try back, and counts it once', async () => {
    const gym = await gyms.create({ name: 'Going', lat: 40, lon: -80 }, 1);
    await routes.save(ALICE, 1, 'Loop', stops(gym.id, 78));
    await routes.save(BOB, 1, 'Only', stops(gym.id));
    await targets.add(ALICE, HOME, gym.id);
    // The last step, the gym's row, meets a deadlock: the routes and targets the first try took
    // came back with the rollback, and the second try takes and counts them again.
    const { db: deadlocking, deadlocks } = deadlockingOnce(db, 'delete', 'Gym');
    await expect(
      new GymRemovalRepository(deadlocking).remove(gym.id, HOME_SERVER),
    ).resolves.toEqual({ routes: 2, targets: 1, deleted: true });
    expect(deadlocks()).toBe(1);
    await expect(gyms.get(gym.id)).resolves.toBeUndefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', stops: stops(78) }]);
    expect(await routes.list(BOB, 1)).toEqual([]);
    expect(await targets.membersTargeting(gym.id, 'every')).toBe(0);
  });

  it('takes a gym two servers share from one of them, the other keeping it (plan 19B-2)', async () => {
    const shared = await gyms.create({ name: 'Shared', lat: 40, lon: -80 }, 1);
    await db.insertInto('GymServer').values({ gymId: shared.id, guildId: 2 }).execute();
    await routes.save(ALICE, 1, 'Home loop', stops(shared.id));
    await routes.save(BOB, 2, 'Away loop', stops(shared.id));
    await targets.add(ALICE, HOME, shared.id);
    await targets.add(BOB, AWAY, shared.id);

    await expect(removal.remove(shared.id, { guildId: 2, regionIds: [2] })).resolves.toEqual({
      routes: 1,
      targets: 1,
      deleted: false,
    });

    await expect(gyms.get(shared.id)).resolves.toBeDefined();
    expect(await gyms.linksOf(shared.id)).toEqual([1]);
    expect(await routes.list(ALICE, 1)).toHaveLength(1);
    expect(await routes.list(BOB, 2)).toEqual([]);
    expect(await targets.membersTargeting(shared.id, 1)).toBe(1);
    expect(await targets.membersTargeting(shared.id, 2)).toBe(0);

    // The last server's removal takes the row.
    await expect(removal.remove(shared.id, HOME_SERVER)).resolves.toMatchObject({
      deleted: true,
    });
    await expect(gyms.get(shared.id)).resolves.toBeUndefined();
  });
});
