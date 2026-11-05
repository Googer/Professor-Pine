import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import type { DB } from '../db/types.js';
import type { HistoryRecord } from '../domain/history/party-history.js';
import { importLegacyHistory, importReport, importStep } from './history-import.js';

/** Invented legacy files: three of `complete/` (one broken), five of `active/`. */
const FIXTURE = path.resolve(import.meta.dirname, '../../test/fixtures/legacy-parties');
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
/** The members the fixtures name: none of them may be kept anywhere. */
const MEMBERS = [1, 2, 3, 4, 5].map((n) => `32000000000000000${String(n)}`);

describe('the import of the legacy parties into the history', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PartyHistory').execute();
    await db.deleteFrom('Guild').execute();
    await db.deleteFrom('Gym').execute();
    // Two servers, as after the new bot joined another: the files' regions are all HOME's.
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (3, 1, 300000000000000001)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Fountain'), (2, 'Library')`.execute(db);
  });

  const run = (more: Partial<Parameters<typeof importLegacyHistory>[0]> = {}) =>
    importLegacyHistory({ dir: FIXTURE, db, catalogue: catalogueFixture(), batchSize: 2, ...more });
  const imported = () =>
    db
      .selectFrom('PartyHistory')
      .select(['kind', 'ending', 'serverId', 'tier', 'bossKey', 'bossName', 'gymId', 'legacyGymId'])
      .orderBy('createdAt')
      .execute();

  it('imports what it can read, once, and counts what it could not', async () => {
    const first = await run();
    expect(first).toEqual({
      files: { complete: 3, active: 5, unreadable: { 'not JSON': 1 } },
      read: 10,
      imported: 6,
      alreadyThere: 0,
      duplicates: 2,
      skipped: { 'no-attendees': 1, 'no-creator': 1 },
      writeFailed: 0,
      withoutRegion: 1,
      byFallback: 1,
      gymsGone: 3,
      bossesByName: 1,
      bossNames: ['Unheardofmon'],
    });
    const second = await run({ batchSize: 100 });
    expect(second).toMatchObject({ read: 10, imported: 0, alreadyThere: 6, duplicates: 2 });
    expect(await imported()).toEqual([
      // 2018: an egg of tier 3 (its copy left in active/ is the same raid), how it ended unknown.
      {
        kind: 'raid',
        ending: 'unknown',
        serverId: HOME,
        tier: 'T3',
        bossKey: null,
        bossName: null,
        gymId: 1,
        legacyGymId: 1,
      },
      // Its region is gone: the server is the one of every region the files named.
      {
        kind: 'raid',
        ending: 'unknown',
        serverId: HOME,
        tier: null,
        bossKey: null,
        bossName: 'Unheardofmon',
        gymId: null,
        legacyGymId: 999,
      },
      {
        kind: 'raid',
        ending: 'completed',
        serverId: HOME,
        tier: 'Mega',
        bossKey: 'charizard_mega_x',
        bossName: null,
        gymId: null,
        legacyGymId: 999,
      },
      // The later of its two copies: the one deleted last.
      {
        kind: 'raid',
        ending: 'completed',
        serverId: HOME,
        tier: 'T5',
        bossKey: 'giratina_altered',
        bossName: null,
        gymId: 1,
        legacyGymId: 1,
      },
      {
        kind: 'meetup',
        ending: 'cutover',
        serverId: HOME,
        tier: null,
        bossKey: null,
        bossName: null,
        gymId: null,
        legacyGymId: null,
      },
      {
        kind: 'train',
        ending: 'cutover',
        serverId: HOME,
        tier: null,
        bossKey: null,
        bossName: null,
        gymId: null,
        legacyGymId: null,
      },
    ]);
  });

  it('keeps no member of the legacy files in any column of the history', async () => {
    await run();
    const rows = await Promise.all(
      ['PartyHistory', 'PartyHistoryAttendee', 'PartyHistoryGroup', 'PartyHistoryStop'].map(
        async (table) => (await sql`select * from ${sql.table(table)}`.execute(db)).rows,
      ),
    );
    const everything = JSON.stringify(rows);
    for (const member of MEMBERS) expect(everything).not.toContain(member);
    expect(everything).toContain('Ask @member or @member.');
    expect(everything).toContain('Ride with @member');
    // Nor who conducted a train (plan 8H-6A): the legacy history credits nobody.
    expect(
      await db.selectFrom('PartyHistoryAttendee').select('conducted').distinct().execute(),
    ).toEqual([{ conducted: 0 }]);
  });

  it('keeps the groups and the stops the files tell of', async () => {
    await run();
    const groups = await db
      .selectFrom('PartyHistoryGroup as g')
      .innerJoin('PartyHistory as h', 'h.id', 'g.historyId')
      .select(['g.groupId', 'g.label', 'g.meetingTime', 'g.members', 'g.heads'])
      .where('h.bossKey', 'in', ['giratina_altered', 'charizard_mega_x'])
      .orderBy('h.createdAt')
      .orderBy('g.groupId')
      .execute();
    expect(groups).toEqual([
      { groupId: 'A', label: null, meetingTime: '1600002000000', members: 2, heads: 4 },
      { groupId: 'A', label: null, meetingTime: null, members: 2, heads: 3 },
      { groupId: 'B', label: 'After work', meetingTime: '1650002400000', members: 1, heads: 1 },
    ]);
    expect(
      await db
        .selectFrom('PartyHistoryStop')
        .select(['seq', 'gymId', 'legacyGymId'])
        .orderBy('seq')
        .execute(),
    ).toEqual([
      { seq: 0, gymId: 1, legacyGymId: 1 },
      { seq: 1, gymId: null, legacyGymId: 999 },
    ]);
  });

  it('takes the server it is told, and refuses one the database does not know', async () => {
    const told = await run({ server: AWAY });
    expect(told.byFallback).toBe(1);
    expect((await imported()).map((row) => row.serverId)).toContain(AWAY);
    await expect(run({ server: '499999999999999999' })).rejects.toThrow(
      /no server 499999999999999999 in the database/u,
    );
  });

  it("matches no gym on a database that was not the legacy bot's", async () => {
    await sql`drop table knex_migrations`.execute(db);
    try {
      await run();
      expect((await imported()).map((row) => row.gymId)).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    } finally {
      await sql`create table knex_migrations (id int unsigned not null auto_increment primary key,
                name varchar(255), batch int, migration_time timestamp null)`.execute(db);
    }
  });

  it('goes on past a batch it cannot write, record by record, and a second run finishes it', async () => {
    const history = new HistoryRepository(db);
    let refused = 0;
    const failing = {
      insertRecords: async (records: readonly HistoryRecord[]) => {
        if (records.some((record) => record.kind === 'meetup')) {
          refused++;
          throw new Error('the database is busy');
        }
        return history.insertRecords(records);
      },
    };
    const first = await run({ history: failing });
    expect(first).toMatchObject({ imported: 5, writeFailed: 1 });
    expect(refused).toBe(2);
    const second = await run();
    expect(second).toMatchObject({ imported: 1, alreadyThere: 5, writeFailed: 0 });
  });

  it('says what it did in a few lines', async () => {
    expect(importReport(await run(), 12_345)).toEqual([
      'Read 3 files of complete/ and 5 of active/; 1 could not be read (1 not JSON).',
      'Parties read: 10. Imported: 6. Already there: 0. In the files twice: 2. Not written: 0.',
      'Skipped: 1 without a maker (active/), 1 without attendees (active/).',
      'Without their region: 1 (put in the server of the other regions: 1). At a gym no longer in the gym list: 3. Boss kept by its name: 1 (1 name).',
      'Took 12.3 s.',
    ]);
  });
});

describe('importStep: the command', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let lines: string[];
  let loads: number;
  const say = (line: string) => {
    lines.push(line);
  };
  const loadCatalogue = () => {
    loads++;
    return Promise.resolve(catalogueFixture());
  };

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, ${HOME})`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(() => {
    lines = [];
    loads = 0;
  });

  it('imports a folder and says how it went', async () => {
    expect(await importStep([FIXTURE], { db, loadCatalogue, say })).toBe(0);
    expect(lines[0]).toBe(`Importing the legacy parties of ${FIXTURE} into the party history.`);
    expect(lines.at(-1)).toMatch(/^Took \d+\.\d s\.$/u);
  });

  it('asks for a folder, and refuses one that is no parties folder before it loads anything', async () => {
    expect(await importStep([], { db, loadCatalogue, say })).toBe(2);
    expect(await importStep([path.join(FIXTURE, 'active')], { db, loadCatalogue, say })).toBe(1);
    expect(lines.at(-1)).toMatch(/has neither active\/ nor complete\//u);
    expect(loads).toBe(0);
  });

  it('fails when it could read no file at all', async () => {
    const broken = path.resolve(FIXTURE, '../legacy-parties-broken');
    expect(await importStep([broken], { db, loadCatalogue, say })).toBe(1);
    expect(lines.at(-1)).toBe('No file of the folder could be read: nothing was imported.');
  });

  it('refuses a database without the history tables', async () => {
    await sql`drop table PartyHistoryAttendee, PartyHistoryGroup, PartyHistoryStop, PartyHistory`.execute(
      db,
    );
    expect(await importStep([FIXTURE], { db, loadCatalogue, say })).toBe(1);
    expect(lines.at(-1)).toBe(
      'The database has no party history yet: run the migrations first (./pine migrate, or npm run migrate).',
    );
  });
});
