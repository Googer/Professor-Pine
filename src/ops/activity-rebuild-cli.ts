import { ConfigError, loadConfig, type Config } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import { ActivityRepository } from '../db/repositories/activity-repository.js';
import type { DB } from '../db/types.js';
import { rebuildStep } from './activity-rebuild.js';

// The rebuild of the activity heatmap (plan 8H-4) and the raids per day (plan 8H-8) from the party
// history:
//   npm run activity:rebuild [-- --server <server id>]
//   ./pine rebuild-activity [--server <server id>]
// It reads the party history and writes only the heatmap's buckets, the raids per day and their
// marks; it never logs in to Discord. The zone of the buckets and the days is the settings'
// `timezone`. The logic, and its exit codes, are `rebuildStep`.

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}
const db = createDb<DB>(dbConfigFrom(config.env));
try {
  process.exitCode = await rebuildStep(process.argv.slice(2), {
    activity: new ActivityRepository(db, { zone: config.settings.timezone }),
    say: (line) => process.stdout.write(`${line}\n`),
  });
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
