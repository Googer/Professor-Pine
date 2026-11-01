import { REST } from 'discord.js';
import { ConfigError, loadConfig, type Config } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import {
  CHECK_USAGE,
  checkFailed,
  cutoverCheck,
  formatCheck,
  parseCheckArgs,
} from './cutover-check.js';
import { databaseStore } from './cutover-store.js';

// Whether this installation is ready for the cutover, read only:
//   node dist/ops/cutover-check-cli.js [--legacy-parties <folder>]   (`./pine cutover-check`, `npm run cutover:check`)
// The database in a read-only transaction; Discord through its REST API with the bot's token,
// GETs only, without logging in to the gateway (a legacy bot that runs is not disturbed). Prints
// pass / warn / fail lines and exits 1 when any fails.

// --legacy-parties <folder>: the legacy bot's parties folder, for the count of the cleanup.
const parsed = parseCheckArgs(process.argv.slice(2));
if (parsed === undefined) {
  process.stderr.write(`Unknown arguments: ${process.argv.slice(2).join(' ')}\n${CHECK_USAGE}\n`);
  process.exit(2);
}
const { legacyParties } = parsed;

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  const message = err instanceof ConfigError ? err.message : String(err);
  process.stdout.write(`FAIL  config: ${message.replaceAll('\n', '\n        ')}\n`);
  process.exit(1);
}

const db = createDb<unknown>(dbConfigFrom(config.env));
try {
  const lines = await db
    .transaction()
    .setAccessMode('read only')
    .execute((trx) =>
      cutoverCheck({
        store: databaseStore(trx),
        discord: new REST().setToken(config.env.DISCORD_TOKEN),
        appId: config.env.DISCORD_APP_ID,
        settings: config.settings,
        ...(legacyParties === undefined ? {} : { legacyParties }),
      }),
    );
  process.stdout.write(formatCheck(lines));
  const failed = checkFailed(lines);
  process.stdout.write(failed ? 'No go: a line failed.\n' : 'Go: no line failed.\n');
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
