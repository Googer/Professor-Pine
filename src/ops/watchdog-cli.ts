import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigError } from '../config/errors.js';
import { loggerFromEnv } from '../log.js';
import { readBackupStatus } from './backup-status.js';
import { EngineDockerApi } from './docker-api.js';
import { FileStamps, ownerAlertsFrom } from './owner-alerts.js';
import { FileWatchdogState, Watchdog, watchdogConfig, type WatchdogConfig } from './watchdog.js';

/**
 * The volume `watchdog-state`: what the watchdog told. Its own, since it runs as the image's user
 * and reads the root-owned `ops` volume, where the backup leaves its result, without writing there.
 */
const STATE_DIR = '/watchdog';

// The stack's watchdog service (compose.yaml): the bot's image with this command, on the network
// of the socket proxy, as the image's user. See `Watchdog`.
const log = loggerFromEnv(process.env);

let config: WatchdogConfig;
try {
  config = watchdogConfig(process.env);
} catch (err) {
  process.stderr.write(
    `The watchdog cannot start: ${err instanceof ConfigError ? err.message : String(err)}\n`,
  );
  process.exit(1);
}

const docker = new EngineDockerApi(config.engine);
// compose.yaml names it: the proxy lets through this project's bot alone, so that the watchdog
// cannot read it from its own container's labels.
const project = config.project;
if (!project) {
  log.fatal('cannot tell which Compose project to watch: set WATCHDOG_PROJECT');
  process.exit(1);
}

const alerts = ownerAlertsFrom(
  process.env,
  log,
  new FileStamps(path.join(STATE_DIR, 'watchdog-alerts.json'), log),
);
if (!alerts)
  log.warn('DISCORD_TOKEN or OWNER_ID is missing: the watchdog tells nobody what it does');
const watchdog = new Watchdog({
  docker,
  alerts: alerts ?? { send: () => Promise.resolve('failed' as const) },
  log,
  project,
  unhealthyMs: config.unhealthyMs,
  alertMs: config.alertMs,
  gatewayRestartMs: config.gatewayRestartMs,
  restartLimit: config.restartLimit,
  restartWindowMs: config.restartWindowMs,
  backup: {
    read: () => readBackupStatus(config.backupStatusFile),
    maxAgeMs: config.backupMaxAgeMs,
  },
  state: new FileWatchdogState(path.join(STATE_DIR, 'watchdog-state.json'), log),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'watchdog stopping');
    process.exit(0);
  });
}

log.info(
  {
    project,
    unhealthyMinutes: config.unhealthyMs / 60_000,
    alertMinutes: config.alertMs / 60_000,
    restarts: config.restartLimit,
    restartWindowMinutes: config.restartWindowMs / 60_000,
  },
  'watchdog started',
);
// One look at a time: a restart waits for the bot's shutdown, which can take minutes.
for (;;) {
  await watchdog.tick();
  await sleep(config.intervalMs);
}
