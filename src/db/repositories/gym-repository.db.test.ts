import * as he from 'he';
import { CompiledQuery, sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { createDb } from '../kysely.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { GymRepository, storedTextLength } from './gym-repository.js';
import { RegionRepository } from './region-repository.js';

const DOWNTOWN = '1234567890123456788';
const DOWNTOWN_RING: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];

describe('GymRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  let gyms: GymRepository;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    gyms = new GymRepository(db);
    const guildId = await new GuildRepository(db).ensure('412345678901234567');
    await new RegionRepository(db).saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Gym').execute();
  });

  it('creates a gym and reads it back with empty metadata', async () => {
    const created = await gyms.create({ name: 'Big Fountain', lat: 40.4417, lon: -80.0128 }, 1);
    expect(created).toEqual({
      id: expect.any(Number) as number,
      pogoId: null,
      name: 'Big Fountain',
      lat: 40.4417,
      lon: -80.0128,
      nickname: null,
      description: null,
      keywords: [],
      notice: null,
      taggedEx: false,
      confirmedEx: false,
      imageUrl: null,
      sponsor: null,
      geodata: null,
      places: null,
      nearestGym: null,
    });
    expect(await gyms.get(created.id)).toEqual(created);
  });

  it('creates a gym with everything a moderator may give it at once', async () => {
    const created = await gyms.create(
      {
        name: "Rosie's Diner",
        lat: 40.45,
        lon: -80.0,
        nickname: 'Rosie',
        description: 'Neon sign',
        notice: "Don't block the drive",
        keywords: [' Diner ', 'NEON', ''],
      },
      1,
    );
    expect(created).toMatchObject({
      name: "Rosie's Diner",
      nickname: 'Rosie',
      description: 'Neon sign',
      notice: "Don't block the drive",
      keywords: ['diner', 'neon'],
    });
    const meta = await db
      .selectFrom('GymMeta')
      .select(['notice', 'keywords'])
      .where('gymId', '=', created.id)
      .executeTakeFirstOrThrow();
    // As the legacy bot stores them: the notice encoded, the keywords joined by comma and space.
    expect(meta).toEqual({ notice: he.encode("Don't block the drive"), keywords: 'diner, neon' });
  });

  it('creates a gym with its Wayfarer id and picture address, as an import does', async () => {
    const created = await gyms.create(
      {
        name: 'Mural',
        lat: 40.45,
        lon: -80.0,
        pogoId: '0123456789abcdef0123456789abcdef.16',
        imageUrl: 'https://lh3.googleusercontent.com/abc',
      },
      1,
    );
    expect(created).toMatchObject({
      pogoId: '0123456789abcdef0123456789abcdef.16',
      imageUrl: 'https://lh3.googleusercontent.com/abc',
    });
    expect(await gyms.get(created.id)).toEqual(created);
  });

  it('creates a block of gyms and their nearest gyms in one transaction, all or nothing', async () => {
    const old = await gyms.create({ name: 'Old Gym', lat: 40.45, lon: -80 }, 1);
    const created = await gyms.createBlock(
      [
        { name: 'Café & Co', lat: 40.4501, lon: -80, pogoId: 'aa.16', geodata: '{"a":1}' },
        { name: 'Second', lat: 40.46, lon: -80 },
      ],
      1,
      (made) => {
        const [first, second] = made;
        return [
          { id: old.id, nearestGym: first!.id },
          { id: first!.id, nearestGym: old.id },
          { id: second!.id, nearestGym: first!.id },
        ];
      },
    );
    expect(created.map((gym) => [gym.name, gym.pogoId, gym.geodata])).toEqual([
      ['Café & Co', 'aa.16', '{"a":1}'],
      ['Second', null, null],
    ]);
    const [first, second] = created;
    expect(created.map((gym) => gym.nearestGym)).toEqual([old.id, first!.id]);
    expect((await gyms.get(old.id))?.nearestGym).toBe(first!.id);
    expect((await gyms.get(second!.id))?.name).toBe('Second');
    // A block that fails half-way leaves nothing of it.
    const before = (await gyms.listAll()).length;
    await expect(
      gyms.createBlock([{ name: 'Third', lat: 40.47, lon: -80 }], 1, () => {
        throw new Error('no nearest gyms');
      }),
    ).rejects.toThrow('no nearest gyms');
    await expect(
      gyms.createBlock(
        [
          { name: 'Fourth', lat: 40.48, lon: -80 },
          { name: 'x'.repeat(300), lat: 40.49, lon: -80 },
        ],
        1,
        () => [],
      ),
    ).rejects.toThrow();
    expect(await gyms.listAll()).toHaveLength(before);
  });

  it('measures a text as it is stored', async () => {
    expect(storedTextLength('Big Fountain')).toBe(12);
    expect(storedTextLength("Rosie's")).toBe(he.encode("Rosie's").length);
    expect(storedTextLength("Rosie's")).toBeGreaterThan(7);
    // What it says fits does fit, and is read back whole.
    const name = "'".repeat(42) + 'abc';
    expect(storedTextLength(name)).toBe(255);
    const created = await gyms.create({ name, lat: 40.45, lon: -80.0 }, 1);
    expect(created.name).toBe(name);
  });

  it('returns undefined for an unknown gym', async () => {
    expect(await gyms.get(987654)).toBeUndefined();
    expect(await gyms.update(987654, { notice: 'x' })).toBeUndefined();
    expect(await gyms.delete(987654)).toBe(false);
  });

  it('decodes legacy entity-encoded text', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: 'Joe&#x27;s Caf&#xE9;', lat: 40.45, lon: -80 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);
    await db
      .insertInto('GymMeta')
      .values({
        gymId: id,
        nickname: 'Joe&#x27;s',
        description: 'Mural &amp; fountain',
        notice: 'Closed &lt; 9am',
        keywords: 'cafe, joes',
        taggedEx: 1,
      })
      .execute();
    const gym = await gyms.get(id);
    expect(gym?.name).toBe("Joe's Café");
    expect(gym?.nickname).toBe("Joe's");
    expect(gym?.description).toBe('Mural & fountain');
    expect(gym?.notice).toBe('Closed < 9am');
    expect(gym?.keywords).toEqual(['cafe', 'joes']);
    expect(gym?.taggedEx).toBe(true);
    expect(gym?.confirmedEx).toBe(false);
  });

  it('stores text entity-encoded like the legacy bot', async () => {
    const gym = await gyms.create(
      {
        name: "Joe's Café",
        lat: 40.45,
        lon: -80,
        nickname: "Joe's",
        description: 'Mural & fountain',
      },
      1,
    );
    const raw = await db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select(['Gym.name', 'GymMeta.nickname', 'GymMeta.description'])
      .where('Gym.id', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({
      name: 'Joe&#x27;s Caf&#xE9;',
      nickname: 'Joe&#x27;s',
      description: 'Mural &#x26; fountain',
    });
    expect(gym.name).toBe("Joe's Café");
  });

  it('stores updated text entity-encoded too', async () => {
    const gym = await gyms.create({ name: 'Plain', lat: 40.45, lon: -80 }, 1);
    const text = {
      name: "Joe's Café",
      nickname: "Ben & Jerry's",
      description: 'A < B',
      notice: "Don't park here",
    };
    const updated = await gyms.update(gym.id, text);
    expect(updated).toMatchObject(text);
    const raw = await db
      .selectFrom('Gym')
      .innerJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select(['Gym.name', 'GymMeta.nickname', 'GymMeta.description', 'GymMeta.notice'])
      .where('Gym.id', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({
      name: he.encode(text.name),
      nickname: he.encode(text.nickname),
      description: he.encode(text.description),
      notice: he.encode(text.notice),
    });
    expect(raw.name).toContain('&#x27;');
  });

  it('reads text that was stored without encoding unchanged', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: "Ben & Jerry's", lat: 40.45, lon: -80 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);
    await db.insertInto('GymMeta').values({ gymId: id, description: 'AT&T Store' }).execute();
    const gym = await gyms.get(id);
    expect(gym?.name).toBe("Ben & Jerry's");
    expect(gym?.description).toBe('AT&T Store');
  });

  it('updates gym and metadata fields and leaves the rest alone', async () => {
    const gym = await gyms.create({ name: 'Old Name', lat: 40.45, lon: -80, nickname: 'Oldie' }, 1);
    const updated = await gyms.update(gym.id, {
      name: 'New Name',
      lat: 40.46,
      notice: 'Park closes at dusk',
      keywords: [' Fountain ', 'PARK', ''],
      taggedEx: true,
    });
    expect(updated).toEqual({
      ...gym,
      name: 'New Name',
      lat: 40.46,
      notice: 'Park closes at dusk',
      keywords: ['fountain', 'park'],
      taggedEx: true,
    });
    const raw = await db
      .selectFrom('GymMeta')
      .select(['keywords', 'taggedEx', 'confirmedEx'])
      .where('gymId', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({ keywords: 'fountain, park', taggedEx: 1, confirmedEx: null });
  });

  it('clears metadata with null, an empty keyword list and false', async () => {
    const gym = await gyms.create({ name: 'Gym', lat: 40.45, lon: -80, nickname: 'Nick' }, 1);
    await gyms.update(gym.id, { keywords: ['a'], taggedEx: true, confirmedEx: true });
    const cleared = await gyms.update(gym.id, {
      nickname: null,
      keywords: [],
      taggedEx: false,
      confirmedEx: false,
    });
    expect(cleared?.nickname).toBeNull();
    expect(cleared?.keywords).toEqual([]);
    expect(cleared?.taggedEx).toBe(false);
    const raw = await db
      .selectFrom('GymMeta')
      .select(['keywords', 'taggedEx', 'confirmedEx'])
      .where('gymId', '=', gym.id)
      .executeTakeFirstOrThrow();
    expect(raw).toEqual({ keywords: null, taggedEx: null, confirmedEx: null });
  });

  it('reads and updates a legacy gym that has no metadata row', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: 'Bare', lat: 40.45, lon: -80 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);
    expect((await gyms.get(id))?.keywords).toEqual([]);
    const updated = await gyms.update(id, { nickname: 'Now with meta' });
    expect(updated?.nickname).toBe('Now with meta');
  });

  it('does not touch a gym without coordinates unless the patch supplies them', async () => {
    const inserted = await db
      .insertInto('Gym')
      .values({ name: 'Nowhere', lat: 40.45 })
      .executeTakeFirstOrThrow();
    const id = Number(inserted.insertId);

    expect(await gyms.update(id, { name: 'Renamed', notice: 'Closed' })).toBeUndefined();
    expect(await gyms.update(id, { lat: 40.46 })).toBeUndefined();
    const untouched = await db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select(['Gym.name', 'Gym.lat', 'Gym.lon', 'GymMeta.gymId'])
      .where('Gym.id', '=', id)
      .executeTakeFirstOrThrow();
    expect(untouched).toEqual({ name: 'Nowhere', lat: 40.45, lon: null, gymId: null });

    const placed = await gyms.update(id, { name: 'Renamed', lon: -80 });
    expect(placed).toMatchObject({ id, name: 'Renamed', lat: 40.45, lon: -80 });
  });

  it('an empty patch changes nothing', async () => {
    const gym = await gyms.create({ name: 'Gym', lat: 40.45, lon: -80 }, 1);
    expect(await gyms.update(gym.id, {})).toEqual(gym);
  });

  it('lists the gyms inside a region or an arbitrary outline', async () => {
    const inside = await gyms.create({ name: 'Inside', lat: 40.45, lon: -80 }, 1);
    const outside = await gyms.create({ name: 'Outside', lat: 40.55, lon: -80 }, 1);
    expect((await gyms.listAll()).map((g) => g.id)).toEqual([inside.id, outside.id]);
    expect((await gyms.listInRegion(DOWNTOWN)).map((g) => g.id)).toEqual([inside.id]);
    expect(await gyms.listInRegion('999999999999999999')).toEqual([]);
    const north: LatLon[] = DOWNTOWN_RING.map((p) => ({ lat: p.lat + 0.1, lon: p.lon }));
    expect((await gyms.listInPolygon(north)).map((g) => g.id)).toEqual([outside.id]);
  });

  it('skips gyms that have no coordinates', async () => {
    await db.insertInto('Gym').values({ name: 'Nowhere' }).execute();
    expect(await gyms.listAll()).toEqual([]);
  });

  describe('inside a transaction the caller owns', () => {
    const CHANNEL = '1234567890123456700';

    async function writeAll(trx: Kysely<DB>): Promise<void> {
      const trxGyms = new GymRepository(trx);
      const created = await trxGyms.create({ name: 'In Trx', lat: 40.45, lon: -80 }, 1);
      await trxGyms.update(created.id, { notice: 'Changed' });
      const guildId = await new GuildRepository(trx).ensure('412345678901234999');
      await new RegionRepository(trx).saveBounds(guildId, CHANNEL, DOWNTOWN_RING);
    }

    it('rolls everything back when the caller does', async () => {
      await expect(
        db.transaction().execute(async (trx) => {
          await writeAll(trx);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await gyms.listAll()).toEqual([]);
      expect(await new RegionRepository(db).findByChannel(CHANNEL)).toBeUndefined();
    });

    it('commits everything when the caller does', async () => {
      await db.transaction().execute(writeAll);
      const [gym] = await gyms.listAll();
      expect(gym).toMatchObject({ name: 'In Trx', notice: 'Changed' });
      expect(await new RegionRepository(db).findByChannel(CHANNEL)).toBeDefined();
    });
  });

  it('answers undefined, and never throws, for a gym that is deleted while it is changed', async () => {
    const gym = await gyms.create({ name: 'Going', lat: 40.45, lon: -80 }, 1);
    // A deletion that has taken the row and its metadata away and has not committed yet.
    let commit: () => void = () => undefined;
    const committing = new Promise<void>((resolve) => {
      commit = resolve;
    });
    let removed: () => void = () => undefined;
    const removing = new Promise<void>((resolve) => {
      removed = resolve;
    });
    const deleting = db.transaction().execute(async (trx) => {
      await trx.deleteFrom('Gym').where('id', '=', gym.id).execute();
      removed();
      await committing;
    });
    await removing;
    // The change waits for the row; without that it would write metadata of a gym that is
    // gone, which the foreign key refuses.
    const changing = gyms.update(gym.id, { notice: 'Closed on Sundays', taggedEx: true });
    // eslint-disable-next-line no-restricted-syntax -- a real MySQL: nothing tells when the statement waits for the lock
    await new Promise((resolve) => setTimeout(resolve, 300));
    commit();
    await deleting;
    await expect(changing).resolves.toBeUndefined();
    expect(await gyms.get(gym.id)).toBeUndefined();
    expect(await db.selectFrom('GymMeta').selectAll().execute()).toHaveLength(0);
  });

  it('deletes a gym together with its metadata', async () => {
    const gym = await gyms.create({ name: 'Gone', lat: 40.45, lon: -80, nickname: 'Bye' }, 1);
    expect(await gyms.delete(gym.id)).toBe(true);
    expect(await gyms.get(gym.id)).toBeUndefined();
    expect(await db.selectFrom('GymMeta').selectAll().execute()).toHaveLength(0);
  });

  it('reads the servers of every gym and of one (plan 19B-2)', async () => {
    const home = await new GuildRepository(db).ensure('412345678901234567');
    const away = await new GuildRepository(db).ensure('412345678901234568');
    // Each made for one server, its link made with it; the first given to the other too.
    const shared = await gyms.create({ name: 'Shared', lat: 40.45, lon: -80 }, home);
    const own = await gyms.create({ name: 'Own', lat: 40.46, lon: -80 }, away);
    await db.insertInto('GymServer').values({ gymId: shared.id, guildId: away }).execute();
    expect(await gyms.links()).toEqual([
      { gymId: shared.id, guildId: home },
      { gymId: shared.id, guildId: away },
      { gymId: own.id, guildId: away },
    ]);
    expect(await gyms.linksOf(shared.id)).toEqual([home, away]);
    expect(await gyms.linksOf(own.id + 1)).toEqual([]);
  });

  it('lists one server’s gyms through the server index, not every gym (plan 19B-2)', async () => {
    const home = await new GuildRepository(db).ensure('412345678901234567');
    const away = await new GuildRepository(db).ensure('412345678901234568');
    // Many gyms of the first server, a few of the second.
    for (let n = 0; n < 60; n += 1) {
      await gyms.create({ name: `Home ${String(n)}`, lat: 40.4 + n / 1000, lon: -80 }, home);
    }
    const own = await gyms.create({ name: 'Own', lat: 40.46, lon: -80 }, away);
    const shared = await gyms.create({ name: 'Shared', lat: 40.47, lon: -80 }, home);
    await db.insertInto('GymServer').values({ gymId: shared.id, guildId: away }).execute();
    await sql`analyze table Gym, GymServer`.execute(db);
    expect((await gyms.listOf(away)).map((gym) => gym.name)).toEqual(['Own', 'Shared']);
    expect(await gyms.listOf(away + 7)).toEqual([]);
    const asked: CompiledQuery[] = [];
    const logged = createDb<DB>(database.config, (event) => {
      if (event.level === 'query') asked.push(event.query);
    });
    try {
      await new GymRepository(logged).listOf(away);
      const [query] = asked;
      if (query === undefined) throw new Error('nothing was asked');
      const plan = await db.executeQuery<{ table: string | null; key: string | null }>(
        CompiledQuery.raw(`explain format=traditional ${query.sql}`, [...query.parameters]),
      );
      const keyOf = (table: string) => plan.rows.find((row) => row.table === table)?.key;
      expect(keyOf('GymServer')).toBe('gymserver_guildid_index');
      expect(keyOf('Gym')).toBe('PRIMARY');
    } finally {
      await logged.destroy();
    }
    expect(own.id).toBeGreaterThan(0);
  });
});
