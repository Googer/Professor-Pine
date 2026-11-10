import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Logger } from '../log.js';
import { detectDatabaseState, refusalMessage } from './migrations/2026_10_09_000_baseline.js';
import { warnOfSharedChannels } from './migrations/2026_10_13_011_region_channel_unique.js';
import { migrations } from './migrations/index.js';
import { canonicalRenames } from './table-names.js';

class StaticMigrationProvider implements MigrationProvider {
  constructor(private readonly all: Record<string, Migration>) {}

  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(this.all);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- migrations are schema-agnostic */

/** Whether Kysely's bookkeeping exists: the baseline was accepted once. */
async function hasBookkeeping(db: Kysely<any>): Promise<boolean> {
  const bookkeeping = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = database() and table_name = 'kysely_migration'`.execute(db);
  return bookkeeping.rows.length > 0;
}

/**
 * Kysely creates its bookkeeping tables before any migration runs, so a database the baseline
 * would refuse must be rejected before the Migrator writes anything to it. Once
 * kysely_migration exists the baseline has already been accepted, and later runs (a new
 * install looks "foreign" by then) are left to the Migrator. Undefined when it is accepted.
 */
async function unknownDatabase(
  db: Kysely<any>,
): Promise<{ state: 'foreign' | 'legacy-incomplete'; tables: string[] } | undefined> {
  if (await hasBookkeeping(db)) return undefined;
  const { state, tables } = await detectDatabaseState(db);
  return state === 'foreign' || state === 'legacy-incomplete' ? { state, tables } : undefined;
}

/**
 * A dump from MySQL on Windows has every table name in lower case (`guild`, `gymmeta`); loaded
 * into a server that tells names by their case (lower_case_table_names=0, Linux's default) the
 * bot would not find its tables, and the first migration would fail half-way. Refused before
 * anything is written, with the way out; a server that ignores case is left alone. Undefined
 * when the names are fine.
 */
async function lowerCaseTables(
  db: Kysely<any>,
): Promise<{ tables: string[]; reason: string } | undefined> {
  const setting = await sql<{ value: number | string }>`
    select @@lower_case_table_names as value`.execute(db);
  if (Number(setting.rows[0]?.value) !== 0) return undefined;
  const result = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = database()`.execute(db);
  const renames = canonicalRenames(result.rows.map((row) => row.name));
  if (renames.length === 0) return undefined;
  return {
    tables: renames.map((rename) => rename.from),
    reason:
      `The tables ${renames.map((rename) => rename.from).join(', ')} have lower-case names, as ` +
      `MySQL on Windows writes them; the bot needs ${renames.map((rename) => rename.to).join(', ')}. ` +
      "'./pine restore' renames them when it loads a dump.",
  };
}

/**
 * What `runMigrations` would do to this database, found by reading only (the cutover check):
 * refuse it, and why, in the migrator's own words; or take over a legacy database, make a new
 * install of an empty one, or bring a Pine database up to date, with the migrations it would
 * run, by name, in order.
 */
export type MigrationPlan =
  | { kind: 'refused'; reason: string }
  | { kind: 'takeover' | 'new-install' | 'pine'; pending: string[] };

/**
 * What Kysely's `migrateToLatest` refuses before it runs anything, in its words: a migration
 * that was run and that this bot does not know, or the migrations run not being the first ones
 * of the list (a newer one that sorts before one already run). Undefined when neither.
 */
async function corruptedMigrations(db: Kysely<any>): Promise<string | undefined> {
  const rows = await sql<{ name: string; timestamp: string }>`
    select name, timestamp from kysely_migration`.execute(db);
  // Kysely's order: by when they were run, then by name.
  const executed = rows.rows
    .sort((a, b) =>
      a.timestamp === b.timestamp
        ? a.name.localeCompare(b.name)
        : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .map((row) => row.name);
  // Kysely sorts its own list by code unit (`.sort()`), and only the run ones by `localeCompare`.
  const known = Object.keys(migrations).sort();
  for (const name of executed) {
    if (!known.includes(name)) {
      return `corrupted migrations: previously executed migration ${name} is missing`;
    }
  }
  for (let i = 0; i < executed.length; i++) {
    if (known[i] !== executed[i]) {
      return (
        `corrupted migrations: expected previously executed migration ${executed[i] ?? ''} to be at index ${i} but ${known[i] ?? ''} was found in its place. ` +
        'New migrations must always have a name that comes alphabetically after the last executed migration.'
      );
    }
  }
  return undefined;
}

export async function migrationPlan(db: Kysely<any>): Promise<MigrationPlan> {
  const lowerCase = await lowerCaseTables(db);
  if (lowerCase) return { kind: 'refused', reason: lowerCase.reason };
  const unknown = await unknownDatabase(db);
  if (unknown) return { kind: 'refused', reason: refusalMessage(unknown.state, unknown.tables) };
  const kind = (await hasBookkeeping(db))
    ? 'pine'
    : (await detectDatabaseState(db)).state === 'empty'
      ? 'new-install'
      : 'takeover';
  if (kind === 'pine') {
    const corrupted = await corruptedMigrations(db);
    if (corrupted) return { kind: 'refused', reason: corrupted };
  }
  // Kysely's list reads the bookkeeping, where it exists, and writes nothing.
  const known = await new Migrator({
    db,
    provider: new StaticMigrationProvider(migrations),
  }).getMigrations();
  return {
    kind,
    pending: known.filter((one) => one.executedAt === undefined).map((one) => one.name),
  };
}

export async function runMigrations(db: Kysely<any>, log: Logger): Promise<void> {
  const lowerCase = await lowerCaseTables(db);
  if (lowerCase) {
    log.error({ tables: lowerCase.tables }, 'database refused: its table names are lower case');
    throw new Error(lowerCase.reason);
  }
  const unknown = await unknownDatabase(db);
  if (unknown) {
    log.error(unknown, 'database refused');
    throw new Error(refusalMessage(unknown.state, unknown.tables));
  }
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider(migrations) });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === 'Success')
      log.info({ migration: result.migrationName }, 'migration applied');
    if (result.status === 'Error')
      log.error({ migration: result.migrationName }, 'migration failed');
  }
  if (error) {
    throw error instanceof Error ? error : new Error(JSON.stringify(error));
  }
  await warnOfSharedChannels(db, log);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
