import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { PineStopRepository } from '../db/repositories/pine-stop-repository.js';
import { RegionRepository } from '../db/repositories/region-repository.js';
import { WayspotRepository } from '../db/repositories/wayspot-repository.js';
import type { DB } from '../db/types.js';
import { SEED_MAKER, SEED_USAGE, seedStep } from './stop-seed.js';

/** Made-up sponsored stops (the real export is kept out of the repository). */
const FIXTURE = path.resolve(import.meta.dirname, '../../test/fixtures/sponsored-stops.csv');
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const WEST = '300000000000000001';
const NOW = Date.UTC(2026, 9, 22, 12);

/** A closed square ring, latitude first. */
const square = (south: number, west: number, north: number, east: number) => [
  { lat: south, lon: west },
  { lat: south, lon: east },
  { lat: north, lon: east },
  { lat: north, lon: west },
  { lat: south, lon: west },
];

describe('seeding the stops of Pine’s own from a file', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PineStop').execute();
    await db.deleteFrom('ServerWayspot').execute();
    await db.deleteFrom('Region').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await new RegionRepository(db).saveBounds(1, WEST, square(40.0, -80.1, 40.1, -80.0));
    // Wayfarer lists a stop beside "Big Box" now.
    await new WayspotRepository(db).saveFromImport(
      1,
      { upsert: [keptRow(1, { lat: 40.0701, lon: -80.07, title: 'Big Box Store' })], remove: [] },
      NOW,
    );
    // Another server has a stop of its own where "Bakery" is: no stop of this server.
    await new PineStopRepository(db).add({
      serverId: AWAY,
      name: 'Bakery',
      lat: 40.03,
      lon: -80.03,
      address: null,
      createdBy: '200000000000000001',
      createdAt: NOW,
    });
  });

  const run = async (...args: string[]) => {
    const said: string[] = [];
    const code = await seedStep(args, {
      db,
      readText: (file) => readFileSync(file, 'utf8'),
      say: (line) => said.push(line),
      log: createTestLogger().log,
      now: () => NOW,
    });
    return { code, said };
  };
  const ownStops = () =>
    db
      .selectFrom('PineStop')
      .select(['name', 'lat', 'lon', 'address', 'createdBy', 'createdAt'])
      .where('serverId', '=', HOME)
      .orderBy('id')
      .execute();

  it('says what it would add and writes nothing without --apply', async () => {
    const { code, said } = await run(FIXTURE, '--server', HOME);
    expect(code).toBe(0);
    expect(said).toEqual([
      'unreadable  line 7: the latitude must be a number from -90 to 90',
      'would add   line 2  Corner Café (40.05, -80.05)',
      'skipped     line 3  Corner Café again (40.05005, -80.05): a stop is 6 m away (Corner Café (line 2 of this file))',
      'skipped     line 4  Big Box (40.07, -80.07): a stop is 11 m away (Big Box Store)',
      'skipped     line 5  Far Away (41, -80): outside every region of the server',
      'would add   line 6  Bakery, Main Street (40.03, -80.03)',
      '2 to add, 3 skipped, 1 unreadable. Nothing was written: add --apply to add them.',
    ]);
    expect(await ownStops()).toEqual([]);
  });

  it('adds the stops with --apply, and nothing when run again', async () => {
    const first = await run(FIXTURE, '--server', HOME, '--apply');
    expect(first.code).toBe(0);
    expect(first.said.filter((line) => line.startsWith('added'))).toEqual([
      expect.stringMatching(/^added {7}line 2 {2}Corner Café \(40\.05, -80\.05\) as pine-\d+$/u),
      expect.stringMatching(
        /^added {7}line 6 {2}Bakery, Main Street \(40\.03, -80\.03\) as pine-\d+$/u,
      ),
    ]);
    expect(first.said.at(-1)).toBe('2 added, 3 skipped, 1 unreadable.');
    expect(await ownStops()).toEqual([
      {
        name: 'Corner Café',
        lat: 40.05,
        lon: -80.05,
        address: null,
        createdBy: SEED_MAKER,
        createdAt: String(NOW),
      },
      {
        name: 'Bakery, Main Street',
        lat: 40.03,
        lon: -80.03,
        address: null,
        createdBy: SEED_MAKER,
        createdAt: String(NOW),
      },
    ]);

    const second = await run('--apply', '--server', HOME, FIXTURE);
    expect(second.code).toBe(0);
    expect(second.said).toContain(
      'skipped     line 2  Corner Café (40.05, -80.05): a stop is 0 m away (Corner Café)',
    );
    expect(second.said.at(-1)).toBe('0 added, 5 skipped, 1 unreadable.');
    expect(await ownStops()).toHaveLength(2);
  });

  it('refuses arguments it does not take, a server it does not know, a file it cannot read', async () => {
    expect(await run(FIXTURE)).toEqual({ code: 2, said: [SEED_USAGE] });
    expect(await run(FIXTURE, '--server', 'west')).toEqual({ code: 2, said: [SEED_USAGE] });
    expect(await run(FIXTURE, '--server', HOME, '--force')).toEqual({
      code: 2,
      said: [SEED_USAGE],
    });
    expect(await run(FIXTURE, '--server', '412345678901234569', '--apply')).toEqual({
      code: 1,
      said: [
        'unreadable  line 7: the latitude must be a number from -90 to 90',
        'The database has no server 412345678901234569: name a server the bot is in.',
      ],
    });
    const missing = await run(`${FIXTURE}.gone`, '--server', HOME);
    expect(missing.code).toBe(1);
    expect(missing.said[0]).toMatch(/^Cannot read .*sponsored-stops\.csv\.gone: /u);
    expect(await ownStops()).toEqual([]);
  });

  it('places no stop for a server without an outlined region', async () => {
    expect(await run(FIXTURE, '--server', AWAY, '--apply')).toEqual({
      code: 1,
      said: [
        'unreadable  line 7: the latitude must be a number from -90 to 90',
        `The server ${AWAY} has no region with an outline: no stop can be placed.`,
      ],
    });
  });
});
