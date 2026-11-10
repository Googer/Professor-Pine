import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import type { DB } from '../db/types.js';
import type { HistoryRecord } from '../domain/history/party-history.js';
import { importLegacyHistory, importReport, importStep } from './history-import.js';

/** Invented legacy files: four of `complete/` (one broken), five of `active/`. */
const FIXTURE = path.resolve(import.meta.dirname, '../../test/fixtures/legacy-parties');
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
/** The members the fixtures name: none of them may be kept anywhere. */
const MEMBERS = [1, 2, 3, 4, 5, 6].map((n) => `32000000000000000${String(n)}`);
const [M1 = '', M2 = '', M3 = '', M4 = '', M5 = '', M6 = ''] = MEMBERS;
/** The legacy keys of the fixtures' records, by what they are. */
const GIRATINA = '310000000000000001:1650000000000';
const EGG_2018 = '310000000000000002:1530000000000';
const CHARIZARD = '310000000000000003:1600000000000';
const UNHEARD = '310000000000000004:1570000000000';
const TRAIN = '310000000000000005:1780000000000';
const PICNIC = '310000000000000006:1700000000000';
const EGG_T1 = '310000000000000009:1680000000000';

/**
 * The fixtures without their broken file, in a folder of their own: with a file it cannot read,
 * the import keeps the member index as it was (A4).
 */
function readable(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'parties-'));
  cpSync(FIXTURE, dir, {
    recursive: true,
    filter: (source) => path.basename(source) !== '2c3d4e5f60718293a4b5c6d7e8f90a1b',
  });
  return dir;
}

/** The member index a run wrote: per server, each member's entry lines, sorted. */
function indexIn(root: string): Record<string, Record<string, string[]>> {
  const read: Record<string, Record<string, string[]>> = {};
  for (const server of readdirSync(root)) {
    read[server] = {};
    for (const file of readdirSync(path.join(root, server))) {
      const content = JSON.parse(readFileSync(path.join(root, server, file), 'utf8')) as {
        member: string;
        entries: string[];
      };
      read[server][content.member] = [...content.entries].sort();
    }
  }
  return read;
}

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
      files: { complete: 4, active: 5, unreadable: { 'not JSON': 1 } },
      read: 11,
      imported: 7,
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
    expect(second).toMatchObject({ read: 11, imported: 0, alreadyThere: 7, duplicates: 2 });
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
      // An egg of tier 1 whose maker signed up to nothing (plan 8H-10).
      {
        kind: 'raid',
        ending: 'completed',
        serverId: HOME,
        tier: 'T1',
        bossKey: null,
        bossName: null,
        gymId: 2,
        legacyGymId: 2,
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
    expect(first).toMatchObject({ imported: 6, writeFailed: 1 });
    expect(refused).toBe(2);
    const second = await run();
    expect(second).toMatchObject({ imported: 1, alreadyThere: 6, writeFailed: 0 });
  });

  it('writes the member index: what each member did, by the records the history holds', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    const counts = await run({ dir: readable(), indexDir: root });
    expect(counts.index).toEqual({
      servers: [{ serverId: HOME, members: 6, entries: 17 }],
      leftOut: 0,
      failed: [],
    });
    const sorted = (lines: string[]) => [...lines].sort();
    expect(indexIn(root)).toEqual({
      [HOME]: {
        // A maker and an attendee: of the copy of a raid stored twice the one taken, and a train.
        [M1]: sorted([
          `${GIRATINA} r`,
          `${GIRATINA} a 0 done 1 A`,
          `${TRAIN} r`,
          `${TRAIN} a 0 here 0 A`,
        ]),
        [M2]: sorted([
          `${GIRATINA} a 1 joined 0 B`,
          `${EGG_2018} r`,
          `${EGG_2018} a 0 interested 0`,
          `${TRAIN} a 1 joined 1 A`,
        ]),
        [M3]: sorted([
          `${GIRATINA} a 2 interested 0 A`,
          `${PICNIC} r`,
          `${PICNIC} a 0 interested 0 A`,
        ]),
        // The maker of the mega raid is written as a number: nobody, as in the history.
        [M4]: sorted([`${CHARIZARD} a 0 done 2 A`, `${UNHEARD} r`, `${UNHEARD} a 0 here 0 A`]),
        // First of the egg's attendees, past one the history skipped.
        [M5]: sorted([`${CHARIZARD} a 1 here 0 A`, `${EGG_T1} a 0 done 0`]),
        // Only its maker.
        [M6]: [`${EGG_T1} r`],
      },
    });
  });

  it('indexes a place again only where the history still holds it as the files tell it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    await run();
    // As if an earlier import had read the mega raid's second attendee otherwise.
    await sql`
      update PartyHistoryAttendee a join PartyHistory h on h.id = a.historyId
      set a.extras = 3 where h.legacyKey = ${CHARIZARD} and a.seq = 1`.execute(db);
    // Another server's index is left as it is.
    mkdirSync(path.join(root, AWAY));
    writeFileSync(path.join(root, AWAY, `${M1}.json`), 'kept');
    const again = await run({ dir: readable(), indexDir: root });
    expect(again).toMatchObject({ imported: 0, alreadyThere: 7 });
    expect(again.index).toEqual({
      servers: [{ serverId: HOME, members: 6, entries: 16 }],
      leftOut: 1,
      failed: [],
    });
    expect(JSON.parse(readFileSync(path.join(root, HOME, `${M5}.json`), 'utf8'))).toEqual({
      member: M5,
      server: HOME,
      entries: [`${EGG_T1} a 0 done 0`],
    });
    expect(readFileSync(path.join(root, AWAY, `${M1}.json`), 'utf8')).toBe('kept');
  });

  it('keeps the member index as it was where a file could not be read or a party written (A4)', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    mkdirSync(path.join(root, HOME));
    writeFileSync(path.join(root, HOME, `${M1}.json`), 'kept');
    // The fixtures' broken file: what it held could be anybody's.
    const unreadable = await run({ indexDir: root });
    expect(unreadable.index).toEqual({
      servers: [],
      leftOut: 0,
      kept: { notWritten: 0, unreadable: 1 },
      failed: [],
    });
    expect(importReport(unreadable, 1)).toContain(
      'Member index kept as it was: 1 file could not be read.',
    );
    // A party the database refused.
    const history = new HistoryRepository(db);
    const failing = {
      insertRecords: async (records: readonly HistoryRecord[]) => {
        if (records.some((record) => record.kind === 'meetup')) throw new Error('busy');
        return history.insertRecords(records);
      },
    };
    const notWritten = await run({ dir: readable(), indexDir: root, history: failing });
    expect(notWritten.index?.kept).toEqual({ notWritten: 1, unreadable: 0 });
    expect(importReport(notWritten, 1)).toContain(
      'Member index kept as it was: 1 party not written.',
    );
    expect(readdirSync(path.join(root, HOME))).toEqual([`${M1}.json`]);
    expect(readFileSync(path.join(root, HOME, `${M1}.json`), 'utf8')).toBe('kept');
  });

  it('writes the index of a server that has none yet with what it read, and says what it left out', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    // Another server's older index stays whole, as A4 keeps it.
    mkdirSync(path.join(root, AWAY));
    writeFileSync(path.join(root, AWAY, `${M1}.json`), 'kept');
    // The fixtures' broken file: HOME has no index yet, so it gets what the run could read.
    const unreadable = await run({ indexDir: root });
    expect(unreadable.index).toEqual({
      servers: [{ serverId: HOME, members: 6, entries: 17, partiesLeftOut: 1 }],
      leftOut: 0,
      failed: [],
    });
    expect(importReport(unreadable, 1)).toContain(
      `Member index: 6 members of server ${HOME} (17 entries; 1 party left out).`,
    );
    expect(readdirSync(path.join(root, HOME))).toHaveLength(6);
    // Had another server of the run an older index, that one is kept, and the report says so.
    const mixed = {
      ...unreadable,
      index: {
        servers: [{ serverId: HOME, members: 6, entries: 17, partiesLeftOut: 1 }],
        leftOut: 0,
        kept: { notWritten: 0, unreadable: 1 },
        failed: [],
      },
    };
    expect(importReport(mixed, 1).slice(-3, -1)).toEqual([
      `Member index: 6 members of server ${HOME} (17 entries; 1 party left out).`,
      'Member index of the other servers kept as it was: 1 file could not be read.',
    ]);
    expect(readFileSync(path.join(root, AWAY, `${M1}.json`), 'utf8')).toBe('kept');

    // A party the database refused, in a fresh root: the meetup's maker and attendee are out.
    await db.deleteFrom('PartyHistory').execute();
    const history = new HistoryRepository(db);
    const failing = {
      insertRecords: async (records: readonly HistoryRecord[]) => {
        if (records.some((record) => record.kind === 'meetup')) throw new Error('busy');
        return history.insertRecords(records);
      },
    };
    const fresh = mkdtempSync(path.join(tmpdir(), 'index-'));
    const notWritten = await run({ dir: readable(), indexDir: fresh, history: failing });
    expect(notWritten.index).toEqual({
      servers: [{ serverId: HOME, members: 6, entries: 15, partiesLeftOut: 1 }],
      leftOut: 0,
      failed: [],
    });
    expect(indexIn(fresh)[HOME]?.[M3]).toEqual([`${GIRATINA} a 2 interested 0 A`]);
  });

  it('says which server’s index it could not write, without its path, and fails (A3)', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    // No folder: a file where the index's root should be.
    const notAFolder = path.join(root, 'a-file');
    writeFileSync(notAFolder, '');
    const counts = await run({ dir: readable(), indexDir: notAFolder });
    expect(counts.index?.failed).toEqual([{ serverId: HOME, code: expect.any(String) as string }]);
    const said = importReport(counts, 1);
    expect(
      said.some((line) => line.startsWith(`Could not write the member index of server ${HOME} (`)),
    ).toBe(true);
    expect(said.join('\n')).not.toContain(root);
    expect(said.at(-1)).toMatch(/^Took /u);
  });

  it('says what it did in a few lines', async () => {
    expect(importReport(await run(), 12_345)).toEqual([
      'Read 4 files of complete/ and 5 of active/; 1 could not be read (1 not JSON).',
      'Parties read: 11. Imported: 7. Already there: 0. In the files twice: 2. Not written: 0.',
      'Skipped: 1 without a maker (active/), 1 without attendees (active/).',
      'Without their region: 1 (put in the server of the other regions: 1). At a gym no longer in the gym list: 3. Boss kept by its name: 1 (1 name).',
      'Took 12.3 s.',
    ]);
    const indexed = await run({
      dir: readable(),
      indexDir: mkdtempSync(path.join(tmpdir(), 'index-')),
    });
    expect(
      importReport(
        { ...indexed, index: { servers: indexed.index?.servers ?? [], leftOut: 1, failed: [] } },
        1,
      ),
    ).toContain(
      `Member index: 6 members of server ${HOME} (17 entries). Left out: 1 place the history holds otherwise.`,
    );
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
    expect(lines).toContain(
      'LEGACY_INDEX_DIR is not set: no member index is written, so members cannot add their old-bot history.',
    );
    expect(lines.at(-1)).toMatch(/^Took \d+\.\d s\.$/u);
  });

  it('writes the member index into the folder it is given, which must be there', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'index-'));
    // This database has no region: every party goes to the server it is told.
    expect(
      await importStep([readable(), '--server', HOME], { db, loadCatalogue, say, indexDir: root }),
    ).toBe(0);
    expect(lines).toContain(`Member index: 6 members of server ${HOME} (17 entries).`);
    expect(readdirSync(root)).toEqual([HOME]);
    lines = [];
    const missing = path.join(root, 'nowhere');
    expect(await importStep([FIXTURE], { db, loadCatalogue, say, indexDir: missing })).toBe(1);
    expect(lines).toEqual([
      `There is no folder ${missing} for the member index (LEGACY_INDEX_DIR): make it, or leave LEGACY_INDEX_DIR blank.`,
    ]);
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
