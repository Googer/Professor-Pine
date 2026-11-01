import { ConfigError, loadConfig, type Config } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import type { DB } from '../db/types.js';
import { createLogger } from '../log.js';
import { GameDataService } from '../services/game-data-service.js';
import { importStep } from './history-import.js';

// The import of the legacy bot's parties into the party history (plan 8H):
//   npm run history:import -- <legacy parties folder> [--server <server id>]
//   ./pine import-history <legacy parties folder> [--server <server id>]   (mounted read-only)
// It reads the folder and writes the history tables; it never logs in to Discord. The game data
// (for the bosses) is the bot's saved copy, downloaded as the bot does when there is none. The
// logic, and its exit codes, are `importStep`.

/** Where the bot keeps its parsed game data (`src/app.ts`). */
const GAME_DATA_CACHE = 'var/game-data-cache.json';
const HOUR_MS = 3_600_000;

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}
const log = createLogger({ level: config.env.LOG_LEVEL, pretty: false });
const db = createDb<DB>(dbConfigFrom(config.env));
const gameData = new GameDataService({
  gameMasterUrl: config.settings.gameData.gameMasterUrl,
  textUrl: config.settings.gameData.textUrl,
  iconsUrl: config.settings.gameData.iconsUrl,
  megaPortraitsUrl: config.settings.gameData.megaPortraitsUrl,
  cachePath: GAME_DATA_CACHE,
  maxAgeMs: config.settings.gameData.refreshHours * HOUR_MS,
  fetch: (url, init) => fetch(url, init),
  log,
});
try {
  process.exitCode = await importStep(process.argv.slice(2), {
    db,
    loadCatalogue: async () => {
      await gameData.load();
      return gameData.catalogue;
    },
    say: (line) => process.stdout.write(`${line}\n`),
  });
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  gameData.stop();
  await db.destroy();
}
