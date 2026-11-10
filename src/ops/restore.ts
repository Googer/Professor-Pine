import { sql, type Kysely } from 'kysely';
import { detectDatabaseState, refusalMessage } from '../db/migrations/2026_10_09_000_baseline.js';
import { canonicalRenames } from '../db/table-names.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- these run on any schema: a dump as it was
   loaded, before the bot's own migrations */

/** A plain sentence for the operator: `restore-cli` prints it without a stack. */
export class RestoreError extends Error {}

async function tablesOf(db: Kysely<any>): Promise<string[]> {
  const result = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = database() order by name`.execute(db);
  return result.rows.map((row) => row.name);
}

/**
 * Makes the database ready for a dump: an empty one is left as it is; one with tables is refused,
 * unless `replace`, which drops the database and creates it anew (utf8mb4 with the bot's
 * collation), so that no table of the old one is left among the dump's.
 */
export async function prepareSchema(
  db: Kysely<any>,
  options: { replace: boolean },
): Promise<{ dropped: number }> {
  const { name, tables } = await checkSchema(db, options);
  if (tables === 0) return { dropped: 0 };
  await sql`drop database ${sql.id(name)}`.execute(db);
  await sql`create database ${sql.id(name)} character set utf8mb4 collate utf8mb4_0900_ai_ci`.execute(
    db,
  );
  return { dropped: tables };
}

async function schemaName(db: Kysely<any>): Promise<string> {
  const name = (await sql<{ name: string }>`select database() as name`.execute(db)).rows[0]?.name;
  if (!name) throw new RestoreError('No database is selected: DB_SCHEMA names none.');
  return name;
}

/**
 * Whether a dump may be loaded, asked before anything is stopped: the database is empty, or it
 * has tables and `replace` is given. Refuses (`RestoreError`) a database with tables otherwise.
 */
export async function checkSchema(
  db: Kysely<any>,
  options: { replace: boolean },
): Promise<{ name: string; tables: number }> {
  const name = await schemaName(db);
  const tables = (await tablesOf(db)).length;
  if (tables > 0 && !options.replace) {
    throw new RestoreError(
      `The database ${name} already has ${tables} tables. ` +
        "'./pine restore <dump> --replace' drops them first.",
    );
  }
  return { name, tables };
}

/**
 * Gives a loaded dump the table names the bot uses: a dump from MySQL on Windows has them in
 * lower case. One `RENAME TABLE` for all of them (MySQL renames them together, and the foreign
 * keys follow); a dump with the right names is left alone.
 */
export async function renameLegacyTables(
  db: Kysely<any>,
): Promise<Array<{ from: string; to: string }>> {
  const renames = canonicalRenames(await tablesOf(db));
  if (renames.length === 0) return [];
  const pairs = renames.map((rename) => sql`${sql.id(rename.from)} to ${sql.id(rename.to)}`);
  await sql`rename table ${sql.join(pairs)}`.execute(db);
  return renames;
}

/** The tables whose rows `restoreReport` counts, as far as the database has them. */
const MAIN_TABLES = [
  'Guild',
  'Region',
  'Gym',
  'User',
  'PokemonNotification',
  'GymNotification',
  'Role',
  'SavedRoutes',
  'Party',
] as const;

export interface RestoreReport {
  /**
   * `pine`: the bot's migrations ran on it; `legacy`: the legacy bot's only, all of them;
   * `legacy-incomplete`: the legacy bot's without its last one (the migrator refuses it); else
   * `other`.
   */
  kind: 'empty' | 'legacy' | 'legacy-incomplete' | 'pine' | 'other';
  tables: number;
  /** The bot's migrations applied. */
  migrations: number;
  /** The rows of the main tables it has. */
  rows: Partial<Record<(typeof MAIN_TABLES)[number], number>>;
}

/** What a loaded dump holds: its kind, its tables and the rows of the main ones. */
export async function restoreReport(db: Kysely<any>): Promise<RestoreReport> {
  const tables = await tablesOf(db);
  if (tables.length === 0) return { kind: 'empty', tables: 0, migrations: 0, rows: {} };
  let migrations = 0;
  if (tables.includes('kysely_migration')) {
    const applied = await sql<{ count: number | string }>`
      select count(*) as count from kysely_migration`.execute(db);
    migrations = Number(applied.rows[0]?.count ?? 0);
  }
  const { state } = await detectDatabaseState(db);
  const kind =
    migrations > 0
      ? 'pine'
      : state === 'legacy-complete'
        ? 'legacy'
        : state === 'legacy-incomplete'
          ? 'legacy-incomplete'
          : 'other';
  const rows: RestoreReport['rows'] = {};
  for (const table of MAIN_TABLES) {
    if (!tables.includes(table)) continue;
    const counted = await sql<{ count: number | string }>`
      select count(*) as count from ${sql.table(table)}`.execute(db);
    rows[table] = Number(counted.rows[0]?.count ?? 0);
  }
  return { kind, tables: tables.length, migrations, rows };
}

/** The report in lines for the operator. */
export function reportLines(report: RestoreReport): string[] {
  if (report.kind === 'empty') {
    return [
      'The dump loaded no tables into the database. Was it made for another database name ' +
        '(a USE line in it)?',
    ];
  }
  if (report.kind === 'legacy-incomplete') {
    return [
      `Loaded a legacy Professor Pine database of ${report.tables} tables that the bot refuses: ` +
        refusalMessage('legacy-incomplete', []),
    ];
  }
  const what = {
    pine: `a Professor Pine database (${report.migrations} of the bot's migrations applied)`,
    legacy: "a legacy Professor Pine database (the bot's migrator takes it over at the start)",
    other: 'a database the bot does not know: its migrator will refuse it',
  }[report.kind];
  return [
    `Loaded ${what}, ${report.tables} tables.`,
    ...Object.entries(report.rows).map(([table, rows]) => `  ${table}: ${rows} rows`),
  ];
}

/**
 * One step of `restore-cli` (the database half of `./pine restore`), its lines said through
 * `say`; resolves to the exit code: 0 done, 1 refused or failed (with a sentence), 2 a step it
 * does not know, 3 (`check --replace`) the database has tables that will be dropped, 4
 * (`finish`) the load is one the bot refuses (empty, unknown, a legacy one without its last
 * migration): the script says so instead of offering to start the bot on it.
 *  - `check [--replace]`: before anything is stopped, whether the dump may be loaded;
 *  - `prepare [--replace]`: an empty database (dropped and made anew with `--replace`);
 *  - `finish`: the table names, and what was loaded; a load the bot cannot take fails.
 */
export async function restoreStep(
  db: Kysely<any>,
  step: string | undefined,
  flags: readonly string[],
  say: (line: string) => void,
): Promise<number> {
  const replace = flags.includes('--replace');
  try {
    if (step === 'check') {
      const { name, tables } = await checkSchema(db, { replace });
      if (tables === 0) {
        say(`The database ${name} is empty.`);
        return 0;
      }
      say(`The database ${name} has ${tables} tables: --replace drops them.`);
      return 3;
    }
    if (step === 'prepare') {
      const name = await schemaName(db);
      const { dropped } = await prepareSchema(db, { replace });
      say(
        dropped > 0
          ? `Dropped the database ${name} (${dropped} tables) and made it anew.`
          : `The database ${name} is empty.`,
      );
      return 0;
    }
    if (step === 'finish') {
      const renamed = await renameLegacyTables(db);
      if (renamed.length > 0) {
        say(
          `Renamed ${renamed.length} tables from lower case: ` +
            `${renamed.map((rename) => rename.to).join(', ')}.`,
        );
      }
      const report = await restoreReport(db);
      for (const line of reportLines(report)) say(line);
      return report.kind === 'pine' || report.kind === 'legacy' ? 0 : 4;
    }
    say('Usage: restore-cli.js check [--replace] | prepare [--replace] | finish');
    return 2;
  } catch (err) {
    if (err instanceof RestoreError) {
      say(err.message);
      return 1;
    }
    throw err;
  }
}
