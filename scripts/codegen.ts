/**
 * Regenerates src/db/types.ts from the legacy schema plus every Kysely migration.
 * `npm run db:codegen -- --verify` fails if the committed file is stale (used in CI).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pino } from 'pino';
import { createDb } from '../src/db/kysely.js';
import { runMigrations } from '../src/db/migrator.js';
import { startDatabase } from '../test/support/mysql.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const codegenBin = path.join(repoRoot, 'node_modules/kysely-codegen/dist/cli/bin.js');
const verify = process.argv.includes('--verify');

const database = await startDatabase({ legacySchema: true });
try {
  const db = createDb<unknown>(database.config);
  await runMigrations(db, pino({ level: 'warn' }));
  await db.destroy();

  const { host, port, user, password, database: name } = database.config;
  execFileSync(
    process.execPath,
    [
      codegenBin,
      '--dialect',
      'mysql',
      '--url',
      `mysql://${user}:${password}@${host}:${port}/${name}`,
      '--out-file',
      path.join(repoRoot, 'src/db/types.ts'),
      '--exclude-pattern',
      '@(kysely_migration*|knex_migrations*)',
      '--type-mapping',
      JSON.stringify({ bigint: 'string' }),
      ...(verify ? ['--verify'] : []),
    ],
    { stdio: 'inherit' },
  );
} finally {
  await database.stop();
}
