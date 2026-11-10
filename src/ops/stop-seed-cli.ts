import { readFileSync } from 'node:fs';
import { ConfigError, loadConfig, type Config } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import type { DB } from '../db/types.js';
import { createLogger } from '../log.js';
import { seedStep } from './stop-seed.js';

// The stops of Pine's own seeded from a file of sponsored stops (a follow-up of plan 8R-1):
//   npm run stops:seed -- <file> --server <server id> [--apply]
//   ./pine seed-stops <file> --server <server id> [--apply]   (the file mounted read-only)
// It reads the file and the database, and with --apply writes `PineStop`; it never logs in to
// Discord. The logic, and its exit codes, are `seedStep`.

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}
const log = createLogger({ level: config.env.LOG_LEVEL, pretty: false });
const db = createDb<DB>(dbConfigFrom(config.env));
try {
  process.exitCode = await seedStep(process.argv.slice(2), {
    db,
    readText: (file) => readFileSync(file, 'utf8'),
    say: (line) => process.stdout.write(`${line}\n`),
    log,
  });
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
