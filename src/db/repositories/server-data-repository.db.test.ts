import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import { plansOf, scanned } from '../../../test/support/query-plan.js';
import {
  DELETED_SERVER,
  dumpTables,
  KEPT_SERVER,
  seedMembers,
  seedServer,
  type TableDump,
} from '../../../test/support/server-data.js';
import { TABLE_OWNERS } from '../server-tables.js';
import { PINE_TABLES } from '../table-names.js';
import type { DB } from '../types.js';
import { ServerDataRepository, ServerDeletionStopped } from './server-data-repository.js';

/** The tables a server's deletion may touch: all but the migrations' own. */
const TABLES = PINE_TABLES.filter((table) => !/^(knex|kysely)_/u.test(table));

/** The tables a server owns, or that hang on its rows or a gym's: each has rows of it. */
const OWNED = Object.entries(TABLE_OWNERS)
  .filter(([, owner]) =>
    ['server', 'server-pair', 'guild-row', 'through', 'gym'].includes(owner.kind),
  )
  .map(([table]) => table);

describe('ServerDataRepository: a server’s data deleted (plan 19C-3)', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let database: TestDatabase;
  /** Every row before the deleted server's were written: the kept server's, the members'. */
  let before: TableDump;
  let deleted: { guildRow: number; ownGym: number };
  let shared: number;
  let keptGym: number;

  beforeAll(async () => {
    ({ db, database, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await db.connection().execute(async (connection) => {
      await sql`set foreign_key_checks = 0`.execute(connection);
      for (const table of TABLES) {
        if (table === 'ServerRecord' || TABLE_OWNERS[table]?.kind === 'instance') continue;
        await sql`truncate table ${sql.table(table)}`.execute(connection);
      }
      await sql`set foreign_key_checks = 1`.execute(connection);
    });
    const members = await seedMembers(db);
    shared = Number(
      (
        await db
          .insertInto('Gym')
          .values({ name: 'Shared Fountain', lat: 40.44, lon: -79.99 })
          .executeTakeFirstOrThrow()
      ).insertId,
    );
    await db.insertInto('GymMeta').values({ gymId: shared, nickname: 'Fountain' }).execute();
    ({ ownGym: keptGym } = await seedServer(db, { serverId: KEPT_SERVER, n: 2, members, shared }));
    before = await dumpTables(db, TABLES);
    deleted = await seedServer(db, { serverId: DELETED_SERVER, n: 1, members, shared });
    // The two are neighbors (plan 19E): the pair goes with the deleted server.
    await db
      .insertInto('ServerNeighbor')
      .values({
        serverA: DELETED_SERVER,
        serverB: KEPT_SERVER,
        askedBy: KEPT_SERVER,
        askedAt: '1763000000000',
        acceptedAt: '1763000000001',
      })
      .execute();
  });

  it('wrote rows of the deleted server in every table it owns or that hangs on it', async () => {
    const seeded = await dumpTables(db, OWNED);
    const untouched = OWNED.filter(
      (table) => JSON.stringify(seeded[table]) === JSON.stringify(before[table]),
    );
    expect(untouched).toEqual([]);
  });

  it('deletes every row of the server, and leaves every other row as it was', async () => {
    const outcome = await new ServerDataRepository(db).delete(DELETED_SERVER);
    expect(await dumpTables(db, TABLES)).toEqual(before);
    expect(outcome.guildRow).toBe(deleted.guildRow);
    // Its own gym went with its curated text; the one it shared is the other server's alone.
    expect(outcome.gyms).toEqual({ unlinked: [shared], deleted: [deleted.ownGym] });
    expect(outcome.counts).toMatchObject({
      Guild: 1,
      ModerationReport: 2,
      ModerationReportReason: 2,
      EndedPartyCopy: 2,
      PokemonNotification: 2,
      HistoryOptIn: 2,
      ServerWayspot: 2,
      GymServer: 2,
      ServerSettings: 1,
      PartyHistory: 1,
      // Its pair with the kept server and its two others, by either column.
      ServerNeighbor: 3,
    });
    // Run again: nothing is left to delete, and nothing else is touched.
    expect(await new ServerDataRepository(db).delete(DELETED_SERVER)).toEqual({
      counts: {},
      guildRow: undefined,
      gyms: { unlinked: [], deleted: [] },
    });
    expect(await dumpTables(db, TABLES)).toEqual(before);
    expect(keptGym).not.toBe(deleted.ownGym);
  });

  it('deletes in batches, each statement a batch at most', async () => {
    const outcome = await new ServerDataRepository(db, {}, 1).delete(DELETED_SERVER);
    expect(await dumpTables(db, TABLES)).toEqual(before);
    expect(outcome.counts).toMatchObject({ ModerationReport: 2, PokemonNotification: 2 });
  });

  it('takes up a deletion cut short where it stopped, and finishes it', async () => {
    let failing = true;
    const repository = new ServerDataRepository(db, {
      step: (table) => {
        if (failing && table === 'Party') throw new Error('the database went away');
      },
    });
    await expect(repository.delete(DELETED_SERVER)).rejects.toThrow('the database went away');
    // What it named by its snowflake went; what hangs on its row did not yet.
    const half = await dumpTables(db, ['PartyHistory', 'Party', 'Guild']);
    expect(half.PartyHistory).toEqual(before.PartyHistory);
    expect(half.Party).not.toEqual(before.Party);
    failing = false;
    await repository.delete(DELETED_SERVER);
    expect(await dumpTables(db, TABLES)).toEqual(before);
  });

  it('stops between two statements when told, and goes on from there the next time', async () => {
    let statements = 0;
    const repository = new ServerDataRepository(db);
    await expect(
      repository.delete(DELETED_SERVER, { isStopped: () => (statements += 1) > 10 }),
    ).rejects.toBeInstanceOf(ServerDeletionStopped);
    await repository.delete(DELETED_SERVER);
    expect(await dumpTables(db, TABLES)).toEqual(before);
  });

  it('reads no table whole: every statement along an index', async () => {
    // Twenty more servers, so that the server's rows are a few of many, as on a real instance.
    const members = (await db.selectFrom('User').select('id').execute()).map((row) => row.id);
    for (let n = 3; n < 23; n += 1) {
      await seedServer(db, {
        serverId: `4123456789012346${String(n).padStart(2, '0')}`,
        n,
        members,
      });
    }
    for (const table of TABLES) await sql`analyze table ${sql.table(table)}`.execute(db);
    const plans = await plansOf(database, (seen) =>
      new ServerDataRepository(seen).delete(DELETED_SERVER),
    );
    const whole = plans.flatMap((plan) => scanned(plan));
    expect(whole).toEqual([]);
    // Nor a whole index (`index`, a full index scan): each table found by a key's lookup or range.
    const walked = plans
      .flat()
      .filter((row) => row.table !== null && !row.table.startsWith('<'))
      .filter((row) => !['ref', 'range', 'eq_ref', 'const'].includes(row.type ?? ''))
      .map((row) => `${row.table ?? ''} ${row.type ?? 'null'}`);
    expect(walked).toEqual([]);
    // Every statement of the server's own tables names the key it reads by.
    const keys = new Map<string, Set<string | null>>();
    for (const row of plans.flat()) {
      if (row.table === null) continue;
      keys.set(row.table, (keys.get(row.table) ?? new Set()).add(row.key));
    }
    const keyless = [...keys.entries()]
      .filter(([, used]) => used.has(null))
      .map(([table]) => table);
    expect(keyless).toEqual([]);
    // The indexes of migration 062, and the reasons' by their report.
    expect([...(keys.get('StopPost') ?? [])]).toEqual(['stoppost_server_index']);
    expect([...(keys.get('GruntMessage') ?? [])]).toEqual(['gruntmessage_server_index']);
    expect([...(keys.get('EndedPartyCopy') ?? [])]).toEqual(['endedpartycopy_regionid_index']);
    expect([...(keys.get('ModerationReportReason') ?? [])]).toEqual([
      'moderationreportreason_report_reporter_unique',
    ]);
    // A pair of neighbors by either server: the primary key for the first, migration 063's index
    // for the second.
    expect([...(keys.get('ServerNeighbor') ?? [])].sort()).toEqual([
      'PRIMARY',
      'serverneighbor_serverb_index',
    ]);
    // Every table it deletes by the server was read.
    expect([...keys.keys()]).toEqual(expect.arrayContaining(['Guild', 'GymServer', 'Region']));
  });
});
