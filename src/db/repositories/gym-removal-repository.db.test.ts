import { stops } from '../../../test/support/parties.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRemovalRepository } from './gym-removal-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

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
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
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
    const gone = await gyms.create({ name: 'Going', lat: 40, lon: -80 });
    const stays = await gyms.create({ name: 'Staying', lat: 41, lon: -80 });
    await routes.save(ALICE, 1, 'Loop', stops(gone.id, stays.id));
    await routes.save(BOB, 1, 'Only', stops(gone.id));
    await routes.save(BOB, 1, 'Other', stops(stays.id));
    // One member in two servers is one member.
    await targets.add(ALICE, HOME, gone.id);
    await targets.add(ALICE, AWAY, gone.id);
    await targets.add(BOB, HOME, gone.id);
    await targets.add(BOB, HOME, stays.id);

    await expect(removal.remove(gone.id)).resolves.toEqual({ routes: 2, targets: 2 });

    await expect(gyms.get(gone.id)).resolves.toBeUndefined();
    await expect(gyms.get(stays.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', stops: stops(stays.id) }]);
    expect(await routes.list(BOB, 1)).toMatchObject([{ name: 'Other', stops: stops(stays.id) }]);
    expect(await targets.membersTargeting(gone.id)).toBe(0);
    expect(await targets.list(BOB, HOME)).toEqual({ gymIds: [stays.id], unreadable: 0 });
  });

  it('cleans up what names a gym whose row is gone already', async () => {
    await routes.save(ALICE, 1, 'Loop', stops(77, 78));
    await targets.add(ALICE, HOME, 77);
    await expect(removal.remove(77)).resolves.toEqual({ routes: 1, targets: 1 });
    expect(await routes.list(ALICE, 1)).toMatchObject([{ stops: stops(78) }]);
  });

  it('changes nothing when a part of it fails', async () => {
    const gym = await gyms.create({ name: 'Going', lat: 40, lon: -80 });
    await routes.save(ALICE, 1, 'Loop', stops(gym.id));
    await targets.add(ALICE, HOME, gym.id);
    // The last step of the removal is refused by the database: a row that must keep the gym.
    await sql`create table GymKeeper (gymId int unsigned not null,
      constraint gymkeeper_gym foreign key (gymId) references Gym (id))`.execute(db);
    await sql`insert into GymKeeper (gymId) values (${gym.id})`.execute(db);
    try {
      await expect(removal.remove(gym.id)).rejects.toThrow();
    } finally {
      await sql`drop table GymKeeper`.execute(db);
    }
    await expect(gyms.get(gym.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', stops: stops(gym.id) }]);
    expect(await targets.membersTargeting(gym.id)).toBe(1);
  });
});
