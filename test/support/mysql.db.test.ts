import { readdirSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { LEGACY_SCHEMA_STATEMENTS } from '../../src/db/baseline/legacy-schema.js';
import { startDatabase, type TestDatabase } from './mysql.js';

const LEGACY_TABLES = [
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
];

describe('startDatabase', () => {
  it('gives each call a database of its own that the other cannot be read from', async () => {
    const first = await startDatabase({ legacySchema: false });
    const second = await startDatabase({ legacySchema: false });
    try {
      expect(first.config.database).not.toBe(second.config.database);
      await first.query('create table only_in_first (id int primary key)');
      const tables = await second.query('show tables');
      expect(tables).toEqual([]);
      await expect(
        second.query(`select * from \`${first.config.database}\`.only_in_first`),
      ).rejects.toThrow(/denied/i);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  it('drops its database on stop', async () => {
    const database = await startDatabase({ legacySchema: false });
    const other = await startDatabase({ legacySchema: false });
    try {
      const name = database.config.database;
      await database.stop();
      // The test user cannot list a database it has no rights on, so ask as the administrator.
      const admin = inject('sharedMysql');
      if (!admin) return;
      const pool = mysql.createPool({
        host: admin.host,
        port: admin.port,
        user: admin.adminUser,
        password: admin.adminPassword,
      });
      try {
        const [rows] = await pool.query('show databases like ?', [name]);
        expect(rows).toEqual([]);
        const [kept] = await pool.query('show databases like ?', [other.config.database]);
        expect(kept).toHaveLength(1);
      } finally {
        await pool.end();
      }
    } finally {
      await other.stop();
    }
  });
});

describe('legacy schema fixture', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startDatabase({ legacySchema: true });
  });
  afterAll(async () => {
    await database.stop();
  });

  it('creates every legacy table', async () => {
    const rows = await database.query<{ name: string }>(
      'select table_name as name from information_schema.tables where table_schema = database()',
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...LEGACY_TABLES].sort());
  });

  it('records one knex_migrations row per legacy migration file', async () => {
    const files = readdirSync('app/db')
      .filter((f) => f.endsWith('.js'))
      .sort();
    const rows = await database.query<{ name: string }>(
      'select name from knex_migrations order by name',
    );
    expect(rows.map((r) => r.name)).toEqual(files);
    expect(files).toContain('20221014-pokemon-elite.js');
  });

  it('generates one new-install statement per legacy table', () => {
    const tables = LEGACY_SCHEMA_STATEMENTS.map(
      (s) => /CREATE TABLE `([^`]+)`/.exec(s)?.[1],
    ).sort();
    expect(tables).toEqual(LEGACY_TABLES.filter((t) => !t.startsWith('knex_')).sort());
  });
});
