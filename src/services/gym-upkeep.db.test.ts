import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { LINE_AWAY, LINE_HOME } from '../../test/support/gym-lookup-cases.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import type { TestDatabase } from '../../test/support/mysql.js';
import { rowsRead } from '../../test/support/query-plan.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { GymLookupRepository } from '../db/repositories/gym-lookup-repository.js';
import { WayspotLookupRepository } from '../db/repositories/wayspot-lookup-repository.js';
import type { DB } from '../db/types.js';
import { OUT_OF_SHARE_RANK } from '../domain/geo/google-line.js';
import type { NextGymOptions } from './gym-lookups.js';
import { GymUpkeep } from './gym-upkeep.js';

/** Home's rows: by its regions, every one above Away's. */
const HOME_ROWS = 2_700;
const AWAY_ROWS = 300;

/** The line's reads, recorded and never run: the first ends the turn that asked it. */
class RecordedReads extends GymLookupRepository {
  readonly asked: NextGymOptions[] = [];

  override next(options: NextGymOptions = {}): Promise<undefined> {
    this.asked.push(options);
    return Promise.reject(new Error('the read is recorded, not run'));
  }
}

/**
 * The line of a server Pine left against MySQL (plan 19C-1, fix round 4): its rows are held out of
 * the range of the order index that the line's reads walk, so that a turn reads the rows it may
 * serve and none of the left server's, however many it has and however high its regions rank.
 */
describe('the line of a server Pine left, against MySQL', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;

  beforeAll(async () => {
    ({ db, stop, database } = await startMigratedDatabase());
    await db
      .insertInto('Guild')
      .values([
        { id: LINE_HOME, snowflake: '412345678901234567' },
        { id: LINE_AWAY, snowflake: '412345678901234568' },
      ])
      .execute();
    const ids = Array.from({ length: HOME_ROWS + AWAY_ROWS }, (_, n) => n + 1);
    for (let start = 0; start < ids.length; start += 1_000) {
      const chunk = ids.slice(start, start + 1_000);
      await db
        .insertInto('Gym')
        .values(chunk.map((id) => ({ id, name: `Gym ${String(id)}`, lat: 40, lon: -80 })))
        .execute();
      await db
        .insertInto('GymServer')
        .values(chunk.map((gymId) => ({ gymId, guildId: serverOf(gymId) })))
        .execute();
    }
  });
  afterAll(async () => {
    await stop();
  });

  /** Home's gyms first, Away's after. */
  const serverOf = (n: number) => (n <= HOME_ROWS ? LINE_HOME : LINE_AWAY);
  /** By its server's regions: Home's busier, its rows above every one of Away's. */
  const regionRank = (guildId: number, n: number) =>
    guildId === LINE_HOME ? 0.5 + n / 10_000 : n / 10_000;

  it('reads none of the gyms of a server it left, though its regions rank above the others', async () => {
    const lookups = new RecordedReads(db);
    await db.deleteFrom('ServerGymLookup').execute();
    const rows = Array.from({ length: HOME_ROWS + AWAY_ROWS }, (_, n) => {
      const guildId = serverOf(n + 1);
      return { guildId, gymId: n + 1, address: n % 3 === 0, rank: regionRank(guildId, n) };
    });
    for (let start = 0; start < rows.length; start += 1_000) {
      await lookups.add(rows.slice(start, start + 1_000), 1_000);
    }
    await sql`analyze table ServerGymLookup`.execute(db);
    const left = new Set<number>();
    const { gyms, directory, answers } = await gymDirectoryWith(new MemoryGyms([]));
    const now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const upkeep = new GymUpkeep({
      gyms,
      directory,
      geo: new FakeGeoGateway(),
      parties: { active: () => [] },
      posts: { changed: () => undefined },
      log: createTestLogger().log,
      setTimer: () => () => undefined,
      lookups,
      serves: (guildId) => !left.has(guildId),
      ranks: {
        refresh: () => Promise.resolve(),
        ofGym: (guildId, gymId) => regionRank(guildId, gymId - 1),
        ofWayspot: () => 0,
      },
      answers,
      now: () => now,
    });
    await upkeep.resume();
    // Before it is held: passing over Home by its server, a read walks all of Home's rows.
    const passingOver = await rowsRead(database, (logged) =>
      new GymLookupRepository(logged).next({
        outOfShare: { places: new Set([LINE_HOME]), geocodes: new Set() },
      }),
    );
    expect(passingOver).toBeGreaterThanOrEqual(HOME_ROWS);
    left.add(LINE_HOME);
    upkeep.servingChanged([LINE_HOME]);
    // The line's next read, after the ranking that `servingChanged` asked in the line's turn.
    await upkeep.flush();
    const [read] = lookups.asked;
    if (read === undefined) throw new Error('the line read nothing');
    const held = await db
      .selectFrom('ServerGymLookup')
      .select((eb) => eb.fn.countAll<number | string>().as('n'))
      .where('guildId', '=', LINE_HOME)
      .where('regionRank', '=', OUT_OF_SHARE_RANK)
      .executeTakeFirst();
    expect(Number(held?.n)).toBe(HOME_ROWS);
    // The read the line asks walks Away's first row alone.
    expect(await rowsRead(database, (logged) => new GymLookupRepository(logged).next(read))).toBe(
      1,
    );
    expect(await new GymLookupRepository(db).next(read)).toMatchObject({ guildId: LINE_AWAY });
    await upkeep.stop();
  });

  it('reads none of the PokéStops and Power Spots of a server held out of the line', async () => {
    const lookups = new WayspotLookupRepository(db);
    const spots = (held: boolean) =>
      Array.from({ length: HOME_ROWS + AWAY_ROWS }, (_, n) => {
        const guildId = serverOf(n + 1);
        return {
          guildId,
          wayspotId: `${String(n)}.16`,
          kind: n % 3 === 0 ? ('powerspot' as const) : ('stop' as const),
          rank: held && guildId === LINE_HOME ? OUT_OF_SHARE_RANK : regionRank(guildId, n),
        };
      });
    const write = async (held: boolean) => {
      const rows = spots(held);
      for (let start = 0; start < rows.length; start += 1_000) {
        await lookups.add(rows.slice(start, start + 1_000), 1_000);
      }
      await sql`analyze table ServerWayspotLookup`.execute(db);
    };
    await db.deleteFrom('ServerWayspotLookup').execute();
    await write(false);
    // Passed over by its server: a read walks every stop of Home's.
    expect(
      await rowsRead(database, (logged) =>
        new WayspotLookupRepository(logged).next({ outOfShare: new Set([LINE_HOME]) }),
      ),
    ).toBeGreaterThanOrEqual((HOME_ROWS * 2) / 3);
    // Held: the read walks Away's first stop alone.
    await write(true);
    expect(
      await rowsRead(database, (logged) =>
        new WayspotLookupRepository(logged).next({ outOfShare: new Set() }),
      ),
    ).toBe(1);
    expect(await lookups.next({ outOfShare: new Set() })).toMatchObject({
      guildId: LINE_AWAY,
      kind: 'stop',
    });
  });
});
