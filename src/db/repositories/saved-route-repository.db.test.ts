import { stops } from '../../../test/support/parties.js';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { MAX_SAVED_ROUTES, SavedRouteRepository } from './saved-route-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const WEST = 1;
const EAST = 2;

describe('SavedRouteRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let routes: SavedRouteRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    routes = new SavedRouteRepository(db);
    users = new UserRepository(db);
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788), (2, 1, 1234567890123456789)`.execute(
      db,
    );
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('SavedRoutes').execute();
    await db.deleteFrom('User').execute();
  });

  it('saves a route for a member and a region, and gives the member their row', async () => {
    expect(await routes.list(ALICE, WEST)).toEqual([]);
    expect(await users.idFor(ALICE)).toBeUndefined();
    const saved = await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 1, 7));
    expect(saved).toEqual({
      kind: 'saved',
      route: {
        id: expect.any(Number) as number,
        name: 'Downtown loop',
        stops: stops(4, 1, 7),
        atEnd: 'finish',
      },
    });
    expect(await routes.list(ALICE, WEST)).toEqual([
      {
        id: saved.kind === 'saved' ? saved.route.id : 0,
        name: 'Downtown loop',
        stops: stops(4, 1, 7),
        atEnd: 'finish',
      },
    ]);
    const row = await db.selectFrom('SavedRoutes').selectAll().executeTakeFirstOrThrow();
    // As the legacy bot wrote it: the member by their row id, the gyms as text.
    expect(row).toMatchObject({
      userId: await users.idFor(ALICE),
      region: WEST,
      name: 'Downtown loop',
      gyms: '4,1,7',
    });
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentionsTrainStops: false });
    const id = await users.idFor(ALICE);
    await routes.save(ALICE, WEST, 'Loop', stops(1));
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentionsTrainStops).toBe(false);
    expect(await db.selectFrom('User').select('id').execute()).toHaveLength(1);
  });

  it('uses up no id of the User table for a member who has a row', async () => {
    const alice = await users.ensure(ALICE);
    for (let n = 0; n < 3; n++) await routes.save(ALICE, WEST, `Route ${n}`, stops(n + 1));
    await routes.save(ALICE, WEST, 'Route 1', stops(9));
    // The next member gets the next id: saving did not take any in between.
    expect(await users.ensure(BOB)).toBe(alice + 1);
  });

  it('saves and removes at the same moment without one waiting for the other for good', async () => {
    const saved = await routes.save(ALICE, WEST, 'Loop', stops(1));
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    const [replaced, removed, another] = await Promise.all([
      routes.save(ALICE, WEST, 'Loop', stops(2)),
      routes.remove(ALICE, WEST, saved.route.id),
      routes.save(ALICE, WEST, 'Other', stops(3)),
    ]);
    // Whichever came first: the route was replaced and removed, or removed and saved anew.
    expect(['replaced', 'saved']).toContain(replaced.kind);
    expect(another.kind).toBe('saved');
    const left = (await routes.list(ALICE, WEST)).map((route) => route.name);
    expect(left).toEqual(removed && replaced.kind === 'replaced' ? ['Other'] : ['Loop', 'Other']);
  });

  it('lists the routes of one member in one region, by name', async () => {
    await routes.save(ALICE, WEST, 'River walk', stops(2, 3));
    await routes.save(ALICE, WEST, 'Downtown loop', stops(4));
    await routes.save(ALICE, EAST, 'Harbour', stops(8, 9));
    await routes.save(BOB, WEST, 'Bob’s round', stops(5));
    expect((await routes.list(ALICE, WEST)).map((route) => route.name)).toEqual([
      'Downtown loop',
      'River walk',
    ]);
    expect((await routes.list(ALICE, EAST)).map((route) => route.name)).toEqual(['Harbour']);
    expect((await routes.list(BOB, WEST)).map((route) => route.name)).toEqual(['Bob’s round']);
    expect(await routes.list(BOB, EAST)).toEqual([]);
  });

  it('replaces the route of the same name, whatever its case, and keeps its id', async () => {
    const first = await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 1));
    const again = await routes.save(ALICE, WEST, 'downtown LOOP', stops(7));
    if (first.kind !== 'saved' || again.kind !== 'replaced') throw new Error('not replaced');
    expect(again.route).toEqual({
      id: first.route.id,
      name: 'downtown LOOP',
      stops: stops(7),
      atEnd: 'finish',
    });
    expect(await routes.list(ALICE, WEST)).toEqual([again.route]);
    // The same name in another region, or by another member, is another route.
    expect((await routes.save(ALICE, EAST, 'Downtown loop', stops(8))).kind).toBe('saved');
    expect((await routes.save(BOB, WEST, 'Downtown loop', stops(5))).kind).toBe('saved');
    expect(await routes.list(ALICE, WEST)).toEqual([again.route]);
  });

  it('holds twenty-five routes per member and region: the next is refused, a namesake replaced', async () => {
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) {
      expect((await routes.save(ALICE, WEST, `Route ${n}`, stops(n + 1))).kind).toBe('saved');
    }
    expect(await routes.save(ALICE, WEST, 'One more', stops(1))).toEqual({ kind: 'full' });
    expect(await routes.list(ALICE, WEST)).toHaveLength(MAX_SAVED_ROUTES);
    expect((await routes.save(ALICE, WEST, 'Route 3', stops(9, 8))).kind).toBe('replaced');
    // Another region and another member have their own.
    expect((await routes.save(ALICE, EAST, 'One more', stops(1))).kind).toBe('saved');
    expect((await routes.save(BOB, WEST, 'One more', stops(1))).kind).toBe('saved');
  });

  it('saves one route when the same name is saved twice at once', async () => {
    const both = await Promise.all([
      routes.save(ALICE, WEST, 'Loop', stops(1)),
      routes.save(ALICE, WEST, 'Loop', stops(2)),
    ]);
    expect(both.map((outcome) => outcome.kind).sort()).toEqual(['replaced', 'saved']);
    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
  });

  it('gets and removes a route only for the member and region it belongs to', async () => {
    const saved = await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 1));
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    const { id } = saved.route;
    expect(await routes.get(ALICE, WEST, id)).toEqual(saved.route);
    expect(await routes.get(BOB, WEST, id)).toBeUndefined();
    expect(await routes.get(ALICE, EAST, id)).toBeUndefined();
    expect(await routes.get(ALICE, WEST, id + 99)).toBeUndefined();
    expect(await routes.remove(BOB, WEST, id)).toBeUndefined();
    expect(await routes.remove(ALICE, EAST, id)).toBeUndefined();
    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
    expect(await routes.remove(ALICE, WEST, id)).toEqual(saved.route);
    expect(await routes.remove(ALICE, WEST, id)).toBeUndefined();
    expect(await routes.list(ALICE, WEST)).toEqual([]);
  });

  it('reads what the legacy bot wrote: no name, no gyms, a gym twice, what is no id', async () => {
    const userId = await users.ensure(ALICE);
    await sql`insert into SavedRoutes (userId, region, name, gyms) values
      (${userId}, 1, null, ''),
      (${userId}, 1, 'Twice', '12,45,12, 9'),
      (${userId}, 1, 'Odd', '7,,x,0,-3,[object Object],8'),
      (${userId}, 1, 'Twice', null)`.execute(db);
    expect((await routes.list(ALICE, WEST)).map(({ name, stops }) => ({ name, stops }))).toEqual([
      { name: '', stops: stops() },
      { name: 'Odd', stops: stops(7, 8) },
      { name: 'Twice', stops: stops(12, 45, 9) },
      { name: 'Twice', stops: stops() },
    ]);
    // Of two rows with one name (the legacy bot made such) the older one is replaced.
    const replaced = await routes.save(ALICE, WEST, 'Twice', stops(1, 2));
    expect(replaced.kind).toBe('replaced');
    expect((await routes.list(ALICE, WEST)).map((route) => route.stops)).toEqual([
      [],
      stops(7, 8),
      stops(1, 2),
      [],
    ]);
  });

  it('keeps what a train does at the end of the route, also through a replacement', async () => {
    const saved = await routes.save(ALICE, WEST, 'Round', stops(4, 1), 'loop');
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    expect(saved.route.atEnd).toBe('loop');
    expect(await routes.get(ALICE, WEST, saved.route.id)).toEqual(saved.route);
    const row = await db.selectFrom('SavedRoutes').select('atEnd').executeTakeFirstOrThrow();
    expect(row.atEnd).toBe('loop');
    const replaced = await routes.save(ALICE, WEST, 'round', stops(1, 4), 'turn-back');
    expect(replaced).toMatchObject({ kind: 'replaced', route: { atEnd: 'turn-back' } });
    expect(await routes.list(ALICE, WEST)).toMatchObject([
      { stops: stops(1, 4), atEnd: 'turn-back' },
    ]);
    // Saved without one: the route finishes.
    await routes.save(ALICE, WEST, 'round', stops(1));
    expect(await routes.list(ALICE, WEST)).toMatchObject([{ atEnd: 'finish' }]);
  });

  it('reads a row the legacy bot inserted as a route that finishes, and a mode it does not know too', async () => {
    const userId = await users.ensure(ALICE);
    // The legacy bot names its columns: the new one gets its default.
    await sql`insert into SavedRoutes (userId, region, name, gyms) values (${userId}, 1, 'Old', '4,1')`.execute(
      db,
    );
    await sql`insert into SavedRoutes (userId, region, name, gyms, atEnd) values (${userId}, 1, 'Odd', '7', 'bounce')`.execute(
      db,
    );
    expect((await routes.list(ALICE, WEST)).map(({ name, atEnd }) => ({ name, atEnd }))).toEqual([
      { name: 'Odd', atEnd: 'finish' },
      { name: 'Old', atEnd: 'finish' },
    ]);
  });

  it('loses the routes of a region or a member that is deleted', async () => {
    await sql`insert into Region (id, guildId, channelId) values (9, 1, 1234567890123456000)`.execute(
      db,
    );
    await routes.save(ALICE, 9, 'Gone with it', stops(1));
    await routes.save(ALICE, WEST, 'Stays', stops(1));
    await sql`delete from Region where id = 9`.execute(db);
    expect(await db.selectFrom('SavedRoutes').select('name').execute()).toEqual([
      { name: 'Stays' },
    ]);
    await db.deleteFrom('User').execute();
    expect(await db.selectFrom('SavedRoutes').select('name').execute()).toEqual([]);
  });

  it('counts the routes that have a gym as a stop, whoever saved them and where', async () => {
    await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 17, 7));
    await routes.save(ALICE, EAST, 'East side', stops(17));
    await routes.save(BOB, WEST, 'Lunch', stops(170, 1));
    await routes.save(BOB, EAST, 'Other', stops(2, 3));
    expect(await routes.countWithGym(17)).toBe(2);
    expect(await routes.countWithGym(1)).toBe(1);
    expect(await routes.countWithGym(70)).toBe(0);
    expect(await routes.countWithGym(99)).toBe(0);
  });

  it('takes a gym off every saved route and removes a route left without a stop', async () => {
    await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 17, 7));
    await routes.save(ALICE, EAST, 'East side', stops(17));
    await routes.save(BOB, WEST, 'Lunch', stops(170, 1));
    // A row as the legacy bot may have left it: spaces, the gym twice.
    const userId = await users.ensure(BOB);
    await db
      .insertInto('SavedRoutes')
      .values({ userId, region: EAST, name: 'Legacy', gyms: '17, 5,17' })
      .execute();

    expect(await routes.removeGym(17)).toEqual({ changed: 2, removed: 1 });

    expect(await routes.list(ALICE, WEST)).toMatchObject([
      { name: 'Downtown loop', stops: stops(4, 7) },
    ]);
    expect(await routes.list(ALICE, EAST)).toEqual([]);
    // 170 is another gym.
    expect(await routes.list(BOB, WEST)).toMatchObject([{ name: 'Lunch', stops: stops(170, 1) }]);
    expect(await routes.list(BOB, EAST)).toMatchObject([{ name: 'Legacy', stops: stops(5) }]);
    expect(await routes.countWithGym(17)).toBe(0);
    expect(await routes.removeGym(17)).toEqual({ changed: 0, removed: 0 });
  });

  it('keeps Power Spots: saved and read back in order, kept when a gym goes (plan 8X-4)', async () => {
    // A Wayfarer id holds the digits of gym 17 too: only a gym of the route counts as one.
    const spot = '0000000000000000000000000000017a.16';
    const saved = await routes.save(ALICE, WEST, 'Max loop', stops(4, spot, 17));
    expect(saved).toMatchObject({ kind: 'saved', route: { stops: stops(4, spot, 17) } });
    const row = await db.selectFrom('SavedRoutes').select('gyms').executeTakeFirstOrThrow();
    expect(row.gyms).toBe(`4,w${spot},17`);
    expect(await routes.list(ALICE, WEST)).toMatchObject([{ stops: stops(4, spot, 17) }]);
    await routes.save(ALICE, EAST, 'Spots', stops(spot, 17));
    await routes.save(BOB, EAST, 'Only spot', stops(spot));
    expect(await routes.countWithGym(17)).toBe(2);
    expect(await routes.countWithGym(0x17)).toBe(0);
    // A route left with a power spot alone is a route still: only one left without a stop goes.
    await routes.save(BOB, WEST, 'Gone', stops(17));
    expect(await routes.removeGym(17)).toEqual({ changed: 2, removed: 1 });
    expect(await routes.list(ALICE, WEST)).toMatchObject([{ stops: stops(4, spot) }]);
    expect(await routes.list(ALICE, EAST)).toMatchObject([{ stops: stops(spot) }]);
    expect(await routes.list(BOB, EAST)).toMatchObject([{ stops: stops(spot) }]);
    expect(await routes.list(BOB, WEST)).toEqual([]);
  });

  it('takes a gym off the routes inside a transaction of the caller, and back out with it', async () => {
    await routes.save(ALICE, WEST, 'Downtown loop', stops(4, 17, 7));
    await routes.save(ALICE, EAST, 'East side', stops(17));
    await expect(
      db.transaction().execute(async (trx) => {
        expect(await new SavedRouteRepository(trx).removeGym(17)).toEqual({
          changed: 1,
          removed: 1,
        });
        throw new Error('the rest of it failed');
      }),
    ).rejects.toThrow('the rest of it failed');
    expect(await routes.countWithGym(17)).toBe(2);
  });

  it('saves the very same route again as a replacement of its one row', async () => {
    const first = await routes.save(ALICE, WEST, 'Loop', stops(4, 17));
    // Nothing differs: the database changes no row, and it is a replacement all the same.
    const again = await routes.save(ALICE, WEST, 'Loop', stops(4, 17));
    expect(again).toMatchObject({ kind: 'replaced' });
    expect(again.kind === 'replaced' && first.kind === 'saved' && again.route.id).toBe(
      first.kind === 'saved' ? first.route.id : -1,
    );
    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
  });

  it('decides by the route as it is when its turn comes, not as it was listed', async () => {
    // Three routes with the gym. While the removal runs, a member saves two of them anew:
    // one without the gym, one with other stops beside it.
    await routes.save(ALICE, WEST, 'Without', stops(4, 17, 7));
    await routes.save(ALICE, EAST, 'Changed', stops(17, 1));
    await routes.save(BOB, WEST, 'Untouched', stops(17, 2));
    let saved: () => void = () => undefined;
    const resaved = new Promise<void>((resolve) => {
      saved = resolve;
    });
    let commit: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      commit = resolve;
    });
    // The member's saves, written and not yet committed: their rows are locked.
    const saving = db.transaction().execute(async (trx) => {
      await trx
        .updateTable('SavedRoutes')
        .set({ gyms: '4,7' })
        .where('name', '=', 'Without')
        .execute();
      await trx
        .updateTable('SavedRoutes')
        .set({ gyms: '17,8,9' })
        .where('name', '=', 'Changed')
        .execute();
      saved();
      await held;
    });
    await resaved;
    // The removal lists the rows as they were committed (all three have the gym) and waits
    // for the first of them.
    const removing = routes.removeGym(17);
    // eslint-disable-next-line no-restricted-syntax -- a real MySQL: nothing tells when the statement waits for the lock
    await new Promise((resolve) => setTimeout(resolve, 300));
    commit();
    await saving;

    await expect(removing).resolves.toEqual({ changed: 2, removed: 0 });
    expect(await routes.list(ALICE, WEST)).toMatchObject([{ name: 'Without', stops: stops(4, 7) }]);
    expect(await routes.list(ALICE, EAST)).toMatchObject([{ name: 'Changed', stops: stops(8, 9) }]);
    expect(await routes.list(BOB, WEST)).toMatchObject([{ name: 'Untouched', stops: stops(2) }]);
  });

  it('counts the routes of a region, of all members', async () => {
    expect(await routes.countInRegion(WEST)).toBe(0);
    await routes.save(ALICE, WEST, 'Loop', stops(1, 2));
    await routes.save(ALICE, WEST, 'Other', stops(3));
    await routes.save(BOB, WEST, 'Loop', stops(1));
    await routes.save(BOB, EAST, 'East', stops(7));
    expect(await routes.countInRegion(WEST)).toBe(3);
    expect(await routes.countInRegion(EAST)).toBe(1);
    expect(await routes.countInRegion(99)).toBe(0);
  });
});
