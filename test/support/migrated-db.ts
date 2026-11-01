import type { Kysely, LogConfig } from 'kysely';
import { pino } from 'pino';
import { createDb } from '../../src/db/kysely.js';
import { runMigrations } from '../../src/db/migrator.js';
import type { DB } from '../../src/db/types.js';
import { startDatabase, type TestDatabase } from './mysql.js';

/**
 * A throwaway MySQL holding the legacy schema with every Kysely migration applied. `log` hears
 * of every statement sent through `db` (the migrations' own included).
 */
export async function startMigratedDatabase(options: { log?: LogConfig } = {}): Promise<{
  database: TestDatabase;
  db: Kysely<DB>;
  stop: () => Promise<void>;
}> {
  const database = await startDatabase({ legacySchema: true });
  const db = createDb<DB>(database.config, options.log);
  await runMigrations(db, pino({ level: 'silent' }));
  return {
    database,
    db,
    stop: async () => {
      await db.destroy();
      await database.stop();
    },
  };
}
