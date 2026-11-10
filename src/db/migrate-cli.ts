import { loadConfig } from '../config/index.js';
import { createLogger } from '../log.js';
import { dbConfigFrom } from './db-config.js';
import { createDb } from './kysely.js';
import { runMigrations } from './migrator.js';

const config = loadConfig(process.env);
const log = createLogger({
  level: config.env.LOG_LEVEL,
  pretty: config.env.NODE_ENV === 'development',
});
const db = createDb<unknown>(dbConfigFrom(config.env));
try {
  await runMigrations(db, log);
  log.info('database is up to date');
} catch (err) {
  log.fatal({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
