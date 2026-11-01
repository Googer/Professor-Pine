import { readFile } from 'node:fs/promises';
import type { Kysely } from 'kysely';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_SCHEMA_FIXTURE,
  startDatabase,
  type TestDatabase,
} from '../../test/support/mysql.js';
import { createDb } from '../db/kysely.js';
import { runMigrations } from '../db/migrator.js';
import { LEGACY_REQUIRED_MIGRATION } from '../db/migrations/2026_10_09_000_baseline.js';
import { PINE_TABLES } from '../db/table-names.js';
import { prepareSchema, renameLegacyTables, restoreReport, restoreStep } from './restore.js';

const silent = pino({ level: 'silent' });
const opened: Array<{ database: TestDatabase; db: Kysely<unknown> }> = [];

async function open(options: { legacySchema: boolean }) {
  const database = await startDatabase(options);
  const db = createDb<unknown>(database.config);
  opened.push({ database, db });
  return { database, db };
}

afterEach(async () => {
  for (const { database, db } of opened.splice(0)) {
    await db.destroy();
    await database.stop();
  }
});

/**
 * The legacy schema as a dump from MySQL on Windows has it: every table name in lower case, in
 * its own statements and in the foreign keys that point at it.
 */
async function lowerCaseLegacyDump(): Promise<string> {
  const fixture = await readFile(LEGACY_SCHEMA_FIXTURE, 'utf8');
  return fixture.replace(
    /(CREATE TABLE|REFERENCES|INSERT INTO|ALTER TABLE) `(\w+)`/g,
    (_, keyword: string, name: string) => `${keyword} \`${name.toLowerCase()}\``,
  );
}

const ROWS = `
  INSERT INTO guild (id, snowflake) VALUES (1, '100000000000000001'), (2, '100000000000000002');
  INSERT INTO gym (id, lat, lon, name) VALUES (1, 40.44, -79.99, 'Gym One');
  INSERT INTO gymmeta (gymId, nickname) VALUES (1, 'One');
  INSERT INTO user (id, userSnowflake) VALUES (1, '200000000000000001');
  INSERT INTO pokemonnotification (pokemon, guildId, userId) VALUES (150, 1, 1);
`;

/** The tables of the test's database, by its name (a dropped database is nobody's current one). */
async function tables(database: TestDatabase): Promise<string[]> {
  const rows = await database.query<{ name: string }>(
    `select table_name as name from information_schema.tables
     where table_schema = ? order by name`,
    [database.config.database],
  );
  return rows.map((row) => row.name);
}

describe('renameLegacyTables', () => {
  it('renames the lower-case tables of a Windows dump, keeps their rows and foreign keys', async () => {
    const { database, db } = await open({ legacySchema: false });
    await database.query(await lowerCaseLegacyDump());
    await database.query(ROWS);

    const renamed = await renameLegacyTables(db);

    expect(renamed).toContainEqual({ from: 'gymmeta', to: 'GymMeta' });
    expect(renamed).toHaveLength(15);
    expect(await tables(database)).toEqual(
      [
        'Alias',
        'AutoAssignRole',
        'AutosetPokemon',
        'CommandRoleAuthorization',
        'CommandRoles',
        'Guild',
        'Gym',
        'GymMeta',
        'GymNotification',
        'Pokemon',
        'PokemonNotification',
        'Region',
        'Role',
        'SavedRoutes',
        'User',
        'knex_migrations',
        'knex_migrations_lock',
      ].sort(),
    );
    const references = await database.query<{ name: string }>(
      `select distinct referenced_table_name as name from information_schema.referential_constraints
       where constraint_schema = database() order by name`,
    );
    expect(references.map((row) => row.name)).toEqual([
      'Alias',
      'Guild',
      'Gym',
      'Region',
      'Role',
      'User',
    ]);
    expect(await database.query('select nickname from GymMeta')).toEqual([{ nickname: 'One' }]);

    // The migrator takes the renamed database over as it takes over any legacy one.
    await runMigrations(db, silent);
  });

  it('leaves a database with the right names alone', async () => {
    const { database, db } = await open({ legacySchema: true });
    const before = await tables(database);

    expect(await renameLegacyTables(db)).toEqual([]);
    expect(await tables(database)).toEqual(before);
  });

  it('knows every table the migrations make', async () => {
    const { database, db } = await open({ legacySchema: true });
    await runMigrations(db, silent);

    const unknown = (await tables(database)).filter((name) => !PINE_TABLES.includes(name));
    expect(unknown).toEqual([]);
  });
});

describe('prepareSchema', () => {
  it('lets an empty database be loaded', async () => {
    const { db } = await open({ legacySchema: false });

    await expect(prepareSchema(db, { replace: false })).resolves.toEqual({ dropped: 0 });
  });

  it('refuses a database that has tables, unless told to replace it', async () => {
    const { database, db } = await open({ legacySchema: true });

    await expect(prepareSchema(db, { replace: false })).rejects.toThrow(
      `The database ${database.config.database} already has 17 tables. ` +
        "'./pine restore <dump> --replace' drops them first.",
    );
    expect(await tables(database)).toHaveLength(17);
  });

  it('drops the database and makes it anew, empty and utf8mb4, when told to replace it', async () => {
    const { database, db } = await open({ legacySchema: true });

    await expect(prepareSchema(db, { replace: true })).resolves.toEqual({ dropped: 17 });

    expect(await tables(database)).toEqual([]);
    const [schema] = await database.query<{ charset: string; collation: string }>(
      `select default_character_set_name as charset, default_collation_name as collation
       from information_schema.schemata where schema_name = ?`,
      [database.config.database],
    );
    expect(schema).toEqual({ charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' });
  });
});

/** Runs a step of `restore-cli` and keeps what it said. */
async function step(db: Kysely<unknown>, name: string, ...flags: string[]) {
  const said: string[] = [];
  const code = await restoreStep(db, name, flags, (line) => said.push(line));
  return { code, said };
}

describe('restoreStep', () => {
  it('checks before anything is stopped: an empty database, or one --replace will drop', async () => {
    const empty = await open({ legacySchema: false });
    expect(await step(empty.db, 'check')).toEqual({
      code: 0,
      said: [`The database ${empty.database.config.database} is empty.`],
    });

    const full = await open({ legacySchema: true });
    const name = full.database.config.database;
    expect(await step(full.db, 'check')).toEqual({
      code: 1,
      said: [
        `The database ${name} already has 17 tables. ` +
          "'./pine restore <dump> --replace' drops them first.",
      ],
    });
    // 3: the database has tables that --replace will drop (the script backs them up first).
    expect(await step(full.db, 'check', '--replace')).toEqual({
      code: 3,
      said: [`The database ${name} has 17 tables: --replace drops them.`],
    });
    expect(await tables(full.database)).toHaveLength(17);
  });

  it('drops the database with --replace and says so', async () => {
    const { database, db } = await open({ legacySchema: true });

    expect(await step(db, 'prepare', '--replace')).toEqual({
      code: 0,
      said: [`Dropped the database ${database.config.database} (17 tables) and made it anew.`],
    });
  });

  it('refuses, with a code of its own, the finish of a load the bot cannot take', async () => {
    const empty = await open({ legacySchema: false });
    expect((await step(empty.db, 'finish')).code).toBe(4);

    const incomplete = await open({ legacySchema: true });
    await incomplete.database.query('delete from knex_migrations where name = ?', [
      LEGACY_REQUIRED_MIGRATION,
    ]);
    const finished = await step(incomplete.db, 'finish');
    expect(finished.code).toBe(4);
    expect(finished.said[0]).toMatch(/that the bot refuses: Baseline failed/);

    const legacy = await open({ legacySchema: true });
    expect((await step(legacy.db, 'finish')).code).toBe(0);
  });

  it('refuses a step it does not know', async () => {
    const { db } = await open({ legacySchema: false });

    expect((await step(db, 'load')).code).toBe(2);
  });
});

describe('restoreReport', () => {
  it('says what kind of database was loaded and counts the rows of the main tables', async () => {
    const { database, db } = await open({ legacySchema: false });
    await database.query(await lowerCaseLegacyDump());
    await database.query(ROWS);
    await renameLegacyTables(db);

    expect(await restoreReport(db)).toEqual({
      kind: 'legacy',
      tables: 17,
      migrations: 0,
      rows: {
        Guild: 2,
        Region: 0,
        Gym: 1,
        User: 1,
        PokemonNotification: 1,
        GymNotification: 0,
        Role: 0,
        SavedRoutes: 0,
      },
    });

    await runMigrations(db, silent);
    const migrated = await restoreReport(db);
    expect(migrated.kind).toBe('pine');
    expect(migrated.migrations).toBeGreaterThan(10);
    expect(migrated.rows).toMatchObject({ Guild: 2, Party: 0 });
  });

  it('says so when nothing was loaded', async () => {
    const { db } = await open({ legacySchema: false });

    expect(await restoreReport(db)).toEqual({ kind: 'empty', tables: 0, migrations: 0, rows: {} });
  });
});
