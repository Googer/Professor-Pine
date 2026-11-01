import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { LEGACY_SCHEMA_STATEMENTS } from '../baseline/legacy-schema.js';

/** The last migration the legacy (knex) bot ever shipped. */
export const LEGACY_REQUIRED_MIGRATION = '20221014-pokemon-elite.js';

export type DatabaseState = 'empty' | 'legacy-complete' | 'legacy-incomplete' | 'foreign';

/** Classifies the target schema, ignoring Kysely's own bookkeeping tables. */
export async function detectDatabaseState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  db: Kysely<any>,
): Promise<{ state: DatabaseState; tables: string[] }> {
  const result = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = database() and table_name not in ('kysely_migration', 'kysely_migration_lock')
    order by name`.execute(db);
  const tables = result.rows.map((r) => r.name);
  if (tables.length === 0) return { state: 'empty', tables };
  if (!tables.includes('knex_migrations')) return { state: 'foreign', tables };
  const applied = await sql<{ name: string }>`
    select name from knex_migrations where name = ${LEGACY_REQUIRED_MIGRATION}`.execute(db);
  return { state: applied.rows.length > 0 ? 'legacy-complete' : 'legacy-incomplete', tables };
}

/** The error text for a database the baseline refuses to touch. */
export function refusalMessage(state: 'legacy-incomplete' | 'foreign', tables: string[]): string {
  if (state === 'legacy-incomplete') {
    return (
      `Baseline failed: legacy migration ${LEGACY_REQUIRED_MIGRATION} has not been applied. ` +
      'Run the legacy bot once on the legacy branch so all its migrations apply, then retry.'
    );
  }
  return (
    `Baseline failed: the database already has tables (${tables.join(', ')}) but is not a ` +
    'Professor Pine database. Use an empty schema for a new install, or the existing Pine database.'
  );
}

/**
 * Takes over a database the legacy bot fully migrated (no changes), creates the legacy
 * schema on an empty database (new install), and refuses anything else untouched.
 * Only the last legacy migration is required, so hand-applied extra knex_migrations rows
 * do not block a takeover.
 */
export const baseline: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const { state, tables } = await detectDatabaseState(db);
    switch (state) {
      case 'legacy-complete':
        return;
      case 'empty':
        // Statements are generated in dependency order, so foreign keys always resolve.
        for (const statement of LEGACY_SCHEMA_STATEMENTS) await sql.raw(statement).execute(db);
        return;
      case 'legacy-incomplete':
      case 'foreign':
        throw new Error(refusalMessage(state, tables));
    }
  },
  async down() {
    // Never drop the Pine schema from a migration.
  },
};
