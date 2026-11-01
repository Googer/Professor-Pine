import { hostname } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigError } from '../config/errors.js';
import { loggerFromEnv } from '../log.js';
import { readBackupStatus } from './backup-status.js';
import { SocketDockerApi } from './docker-api.js';
import { FileStamps, ownerAlertsFrom } from './owner-alerts.js';
import { FileWatchdogState, Watchdog, watchdogConfig, type WatchdogConfig } from './watchdog.js';

/** The stack's `ops` volume: the backup's result, and what the watchdog told. */
const OPS_DIR = '/ops';

// The stack's watchdog service (compose.yaml): the bot's image with this command, the Docker
// socket mounted. See `Watchdog`.
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

const docker = new SocketDockerApi(config.socketPath);
// Compose names the container's host after the container: its labels name the project.
const project =
  config.project ??
  (await docker.container(hostname()).catch(() => undefined))?.labels['com.docker.compose.project'];
if (!project) {
  log.fatal(
    { socket: config.socketPath },
    'cannot tell which Compose project to watch: is the Docker socket mounted? (or set WATCHDOG_PROJECT)',
  );
  process.exit(1);
}

const alerts = ownerAlertsFrom(
  process.env,
  log,
  new FileStamps(path.join(OPS_DIR, 'watchdog-alerts.json')),
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
  state: new FileWatchdogState(path.join(OPS_DIR, 'watchdog-state.json')),
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
