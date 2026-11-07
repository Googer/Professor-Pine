import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import { inject } from 'vitest';
import type { DbConfig } from '../../src/db/db-config.js';

/** Keep in step with the production MySQL major version. */
export const MYSQL_IMAGE = 'mysql:9.7';

export const LEGACY_SCHEMA_FIXTURE = path.resolve(
  import.meta.dirname,
  '../fixtures/legacy-schema.sql',
);

/** The administrative connection of the one server of a run of the db project (global setup). */
export interface SharedMysql {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    sharedMysql?: SharedMysql;
  }
}

export interface TestDatabase {
  config: DbConfig;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

function provided(): SharedMysql | undefined {
  try {
    return inject('sharedMysql');
  } catch {
    // Not running inside Vitest (scripts/codegen.ts).
    return undefined;
  }
}

function openPool(config: DbConfig) {
  return mysql.createPool({
    ...config,
    multipleStatements: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

function wrap(pool: mysql.Pool, config: DbConfig, onStop: () => Promise<void>): TestDatabase {
  return {
    config,
    async query<T>(sql: string, params: unknown[] = []) {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    async stop() {
      await pool.end();
      await onStop();
    },
  };
}

/**
 * A throwaway MySQL database, optionally loaded with the legacy Pine schema. Inside the db
 * project it is a fresh database on the run's shared server (its own user may use only that
 * database, and see the server's processes); anywhere else it is a container of its own.
 */
export async function startDatabase(options: { legacySchema: boolean }): Promise<TestDatabase> {
  const shared = provided();
  if (shared) return startSharedDatabase(shared, options.legacySchema);

  const container = await new MySqlContainer(MYSQL_IMAGE)
    .withDatabase('pine')
    .withUsername('pine')
    .withUserPassword('pine')
    .start();
  const config: DbConfig = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getUserPassword(),
    database: container.getDatabase(),
  };
  const pool = openPool(config);
  if (options.legacySchema) {
    await pool.query(await readFile(LEGACY_SCHEMA_FIXTURE, 'utf8'));
  }
  return wrap(pool, config, async () => {
    await container.stop();
  });
}

async function startSharedDatabase(shared: SharedMysql, legacySchema: boolean) {
  const name = `pine_${randomBytes(6).toString('hex')}`;
  const admin = mysql.createPool({
    host: shared.host,
    port: shared.port,
    user: shared.adminUser,
    password: shared.adminPassword,
    multipleStatements: true,
  });
  try {
    await admin.query(`create database \`${name}\``);
    // A user per database: grants to one shared `pine` user would add up across databases.
    await admin.query(`create user '${name}'@'%' identified by 'pine'`);
    await admin.query(`grant all privileges on \`${name}\`.* to '${name}'@'%'`);
    // To see which transactions wait for a lock, and whose they are (`lockWaitsNow`): a test
    // asserts that its statement waits. Nothing of other databases can be changed by it.
    await admin.query(
      `grant select on performance_schema.data_lock_waits to '${name}'@'%';
       grant select on performance_schema.threads to '${name}'@'%'`,
    );
  } finally {
    await admin.end();
  }
  const config: DbConfig = {
    host: shared.host,
    port: shared.port,
    user: name,
    password: 'pine',
    database: name,
  };
  const pool = openPool(config);
  if (legacySchema) {
    await pool.query(await readFile(LEGACY_SCHEMA_FIXTURE, 'utf8'));
  }
  return wrap(pool, config, async () => {
    const dropper = mysql.createPool({
      host: shared.host,
      port: shared.port,
      user: shared.adminUser,
      password: shared.adminPassword,
    });
    try {
      await dropper.query(`drop database if exists \`${name}\``);
      await dropper.query(`drop user if exists '${name}'@'%'`);
    } finally {
      await dropper.end();
    }
  });
}
