import { ConfigError, type Env } from '../config/index.js';
import { loadEnv } from '../config/env.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import { restoreStep } from './restore.js';

// The database half of `./pine restore`, run in a one-off container of the bot's image (the
// script streams the dump itself into the mysql service in between); see `restoreStep`:
//   node dist/ops/restore-cli.js check [--replace]     before anything is stopped
//   node dist/ops/restore-cli.js prepare [--replace]   an empty database
//   node dist/ops/restore-cli.js finish                the table names, and what was loaded
const [step, ...flags] = process.argv.slice(2);

let env: Env;
try {
  env = loadEnv(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}

const db = createDb<unknown>(dbConfigFrom(env));
try {
  process.exitCode = await restoreStep(db, step, flags, (line) =>
    process.stdout.write(`${line}\n`),
  );
} catch (err) {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
