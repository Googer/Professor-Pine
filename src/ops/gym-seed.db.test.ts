import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { RegionRepository } from '../db/repositories/region-repository.js';
import type { DB } from '../db/types.js';
import { GYM_SEED_MAKER, GYM_SEED_USAGE, gymSeedStep } from './gym-seed.js';

/** Made-up sponsored gyms (the real file is kept out of the repository). */
const FIXTURE = path.resolve(import.meta.dirname, '../../test/fixtures/sponsored-gyms.csv');
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const WEST = '300000000000000001';
const NOW = Date.UTC(2026, 10, 2, 12);

/** A closed square ring, latitude first. */
const square = (south: number, west: number, north: number, east: number) => [
  { lat: south, lon: west },
  { lat: south, lon: east },
  { lat: north, lon: east },
  { lat: north, lon: west },
  { lat: south, lon: west },
];

describe('seeding the sponsored gyms from a file', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymWayfarer').execute();
    await db.deleteFrom('GymMeta').execute();
    await db.deleteFrom('Gym').execute();
    await db.deleteFrom('Region').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await new RegionRepository(db).saveBounds(1, WEST, square(40.0, -80.1, 40.1, -80.0));
    await db
      .insertInto('Gym')
      .values({ id: 1001, name: 'Old Coffee', lat: 40.05, lon: -80.05, pogoId: '49000737' })
      .execute();
    await db.insertInto('GymServer').values({ gymId: 1001, guildId: 1 }).execute();
  });

  const run = async (file: string, ...args: string[]) => {
    const said: string[] = [];
    const code = await gymSeedStep([file, ...args], {
      db,
      readText: (at) => (at === file && file !== FIXTURE ? file : readFileSync(at, 'utf8')),
      say: (line) => said.push(line),
      log: createTestLogger().log,
      now: () => NOW,
    });
    return { code, said };
  };
  const gyms = () =>
    db
      .selectFrom('Gym')
      .leftJoin('GymWayfarer', 'GymWayfarer.gymId', 'Gym.id')
      .select([
        'Gym.name',
        'Gym.pogoId',
        'GymWayfarer.notInWayfarer',
        'GymWayfarer.notInWayfarerBy',
        'GymWayfarer.notInWayfarerAt',
      ])
      .orderBy('Gym.id')
      .execute();

  it('says what it would do and writes nothing without --apply', async () => {
    const { code, said } = await run(FIXTURE, '--server', HOME);
    expect(code).toBe(0);
    expect(said).toEqual([
      'unreadable  line 7: the latitude must be a number from -90 to 90',
      'would mark  line 2  Old Coffee (40.05, -80.05) as gym 1001',
      'would add   line 3  New Coffee (40.06, -80.06)',
      'skipped     line 4  New Coffee again (40.06005, -80.06): a gym is 6 m away (New Coffee (line 3 of this file))',
      'skipped     line 5  Beside Old Coffee (40.05005, -80.05): a gym is 6 m away (Old Coffee)',
      'skipped     line 6  Far Away (41, -80): outside every region of the server',
      '1 to add, 1 to mark, 3 skipped, 1 unreadable. Nothing was written: add --apply to write them.',
    ]);
    expect(await gyms()).toEqual([
      {
        name: 'Old Coffee',
        pogoId: '49000737',
        notInWayfarer: null,
        notInWayfarerBy: null,
        notInWayfarerAt: null,
      },
    ]);
  });

  it('adds and marks with --apply, and does nothing more when run again', async () => {
    const first = await run(FIXTURE, '--server', HOME, '--apply');
    expect(first.code).toBe(0);
    expect(first.said.at(-1)).toBe('1 added, 1 marked, 3 skipped, 1 unreadable.');
    const marked = {
      notInWayfarer: 1,
      notInWayfarerBy: GYM_SEED_MAKER,
      notInWayfarerAt: String(NOW),
    };
    expect(await gyms()).toEqual([
      { name: 'Old Coffee', pogoId: '49000737', ...marked },
      { name: 'New Coffee', pogoId: 'f00000000000000000000000000000011.16', ...marked },
    ]);

    const second = await run(FIXTURE, '--server', HOME, '--apply');
    expect(second.code).toBe(0);
    expect(second.said.at(-1)).toBe('0 added, 0 marked, 5 skipped, 1 unreadable.');
    expect(await gyms()).toHaveLength(2);
  });

  it('marks a gym it added where an earlier run stopped short of that', async () => {
    await run(FIXTURE, '--server', HOME, '--apply');
    await db.deleteFrom('GymWayfarer').execute();
    const again = await run(FIXTURE, '--server', HOME, '--apply');
    expect(again.said.at(-1)).toBe('0 added, 2 marked, 3 skipped, 1 unreadable.');
    expect(await gyms()).toHaveLength(2);
  });

  it('points the gyms near a new gym at it', async () => {
    await run(FIXTURE, '--server', HOME, '--apply');
    const rows = await db
      .selectFrom('Gym')
      .leftJoin('GymMeta', 'GymMeta.gymId', 'Gym.id')
      .select(['Gym.id', 'Gym.name', 'GymMeta.nearestGym'])
      .orderBy('Gym.id')
      .execute();
    const [old, made] = rows;
    expect(old?.nearestGym).toBe(made?.id);
    expect(made?.nearestGym).toBe(old?.id);
  });

  it('says so of a file that names the wrong gym, and does not touch it', async () => {
    const file = [
      'gym,id,name,lat,lon,region,basis',
      '1001,,Old Coffee,40.07,-80.05,#west,too far from gym 1001',
      '1002,,Gone,40.05,-80.05,#west,no such gym',
    ].join('\n');
    const { code, said } = await run(file, '--server', HOME, '--apply');
    expect(code).toBe(1);
    expect(said).toEqual([
      'wrong       line 2  Old Coffee (40.07, -80.05): gym 1001 (Old Coffee) is 2224 m away',
      'wrong       line 3  Gone (40.05, -80.05): there is no gym 1002',
      '0 added, 0 marked, 0 skipped, 2 wrong.',
    ]);
    expect((await gyms())[0]?.notInWayfarer).toBeNull();
  });

  it('adds gyms of the server named, beside and by the ids of another server’s (plan 19B-2)', async () => {
    // The second server has the gym of line 3's Wayfarer id, at its place, and gym 1001 is not
    // its: the first server's run neither marks nor stands beside the other's gym.
    await new RegionRepository(db).saveBounds(
      2,
      '300000000000000002',
      square(40.0, -80.1, 40.1, -80.0),
    );
    await db
      .insertInto('Gym')
      .values({
        id: 2001,
        name: 'Their Coffee',
        lat: 40.06,
        lon: -80.06,
        pogoId: 'f00000000000000000000000000000011.16',
      })
      .execute();
    await db.insertInto('GymServer').values({ gymId: 2001, guildId: 2 }).execute();
    const first = await run(FIXTURE, '--server', HOME, '--apply');
    expect(first.said.at(-1)).toBe('1 added, 1 marked, 3 skipped, 1 unreadable.');
    const links = await db
      .selectFrom('GymServer')
      .innerJoin('Gym', 'Gym.id', 'GymServer.gymId')
      .select(['Gym.name', 'GymServer.guildId'])
      .orderBy('Gym.id')
      .execute();
    expect(links).toEqual([
      { name: 'Old Coffee', guildId: 1 },
      { name: 'Their Coffee', guildId: 2 },
      { name: 'New Coffee', guildId: 1 },
    ]);
    // The second server's run: gym 1001 is no gym of its own.
    const away = await run(FIXTURE, '--server', AWAY);
    expect(away.said).toContain(
      'wrong       line 2  Old Coffee (40.05, -80.05): there is no gym 1001',
    );
  });

  it('refuses arguments it does not take, a server it does not know, a file it cannot read', async () => {
    expect(await run(FIXTURE)).toEqual({ code: 2, said: [GYM_SEED_USAGE] });
    expect(await run(FIXTURE, '--server', 'west')).toEqual({ code: 2, said: [GYM_SEED_USAGE] });
    expect((await run(FIXTURE, '--server', '412345678901234569', '--apply')).said.at(-1)).toBe(
      'The database has no server 412345678901234569: name a server the bot is in.',
    );
    expect((await run(FIXTURE, '--server', AWAY, '--apply')).said.at(-1)).toBe(
      `The server ${AWAY} has no region with an outline: no gym can be placed.`,
    );
    const missing = await gymSeedStep([`${FIXTURE}.gone`, '--server', HOME], {
      db,
      readText: (at) => readFileSync(at, 'utf8'),
      say: () => undefined,
      log: createTestLogger().log,
    });
    expect(missing).toBe(1);
    expect(await gyms()).toHaveLength(1);
  });
});
