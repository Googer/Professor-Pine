import { ConfigError, loadConfig, type Config } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import { ActivityRepository } from '../db/repositories/activity-repository.js';
import { CutoverRepository } from '../db/repositories/cutover-repository.js';
import { ServerSettingsRepository } from '../db/repositories/server-settings-repository.js';
import type { DB } from '../db/types.js';
import { createLogger } from '../log.js';
import { ServerSettings } from '../services/server-settings.js';
import { instanceZone } from '../config/settings.js';
import { rebuildStep, serverZonesFor } from './activity-rebuild.js';

// The rebuild of the activity heatmap (plan 8H-4) and the raids per day (plan 8H-8) from the party
// history:
//   npm run activity:rebuild [-- --server <server id>]
//   ./pine rebuild-activity [--server <server id>]
// It reads the party history and the servers' settings and writes only the heatmap's buckets, the
// raids per day and their marks; it never logs in to Discord. The zone of a server's buckets and
// days is its own (plan 19A-2), read from its row as the bot reads it (`ServerSettings.zoneOf`),
// the instance's default zone for a server without one, and for every server on a database
// 2.1 has not started on (no table of the servers' settings: fix round 1, N8). The logic, and
// its exit codes, are `rebuildStep`.

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}
// Only warnings and errors: what the command says goes to the standard output, line by line
// (fix round 1, N8: the servers' settings' load logs a line of its own).
const log = createLogger({ level: 'warn', pretty: false });
const db = createDb<DB>(dbConfigFrom(config.env));
try {
  const settings = config.settings;
  const zoneOf = await serverZonesFor({
    hasServerSettings: () => new CutoverRepository(db).hasTables('ServerSettings'),
    servers: async () => {
      const servers = new ServerSettings({
        store: new ServerSettingsRepository(db),
        settings,
        log,
      });
      await servers.load();
      return servers;
    },
    defaultZone: instanceZone(settings),
  });
  process.exitCode = await rebuildStep(process.argv.slice(2), {
    activity: new ActivityRepository(db, { zoneOf, settings }),
    say: (line) => process.stdout.write(`${line}\n`),
  });
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
