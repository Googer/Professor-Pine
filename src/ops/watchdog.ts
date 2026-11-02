import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../config/errors.js';
import type { Logger } from '../log.js';
import {
  BACKUP_STATUS_FILE,
  backupsOff,
  type BackupsOff,
  type BackupStatus,
} from './backup-status.js';
import type { DockerApi } from './docker-api.js';
import { healthKindOf, type HealthKind } from './health.js';
import { alertTime, firstLine, type OwnerAlerts } from './owner-alerts.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A failed backup older than this, found at the watchdog's start, was told before. */
const OLD_FAILURE_MS = 24 * HOUR;
/** How often the owner is told again that backups are missing. */
const MISSING_AGAIN_MS = 12 * HOUR;

/** A whole number from the environment, blank meaning the default. */
const count = (fallback: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(1).max(max).default(fallback),
  );

const watchdogEnvSchema = z.object({
  /** The socket proxy's host and port, on the network the watchdog shares with it alone. */
  DOCKER_PROXY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .regex(/^[A-Za-z0-9.-]+:\d+$/, 'must be host:port')
      .default('docker-proxy:2375'),
  ),
  /** The Compose project (compose.yaml names it; the proxy lets through its bot alone). */
  WATCHDOG_PROJECT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
  WATCHDOG_INTERVAL_SECONDS: count(30, 3600),
  WATCHDOG_UNHEALTHY_MINUTES: count(5, 24 * 60),
  /** How long the bot may be unhealthy for a reason a restart does not mend before it is told. */
  WATCHDOG_ALERT_MINUTES: count(15, 24 * 60),
  /** How long Discord may stay away before the bot is restarted after all (an hour). */
  WATCHDOG_GATEWAY_RESTART_MINUTES: count(5, 7 * 24 * 60),
  WATCHDOG_RESTARTS: count(3, 100),
  WATCHDOG_RESTART_WINDOW_MINUTES: count(30, 24 * 60),
  /** How old the last good backup may be before the owner is told (a day and two hours). */
  WATCHDOG_BACKUP_HOURS: count(26, 24 * 30),
  BACKUP_STATUS_FILE: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().default(BACKUP_STATUS_FILE),
  ),
});

export interface WatchdogConfig {
  engine: { host: string; port: number };
  project: string | undefined;
  intervalMs: number;
  unhealthyMs: number;
  alertMs: number;
  gatewayRestartMs: number;
  restartLimit: number;
  restartWindowMs: number;
  backupStatusFile: string;
  backupMaxAgeMs: number;
}

function engineAddress(hostAndPort: string): { host: string; port: number } {
  const colon = hostAndPort.lastIndexOf(':');
  return { host: hostAndPort.slice(0, colon), port: Number(hostAndPort.slice(colon + 1)) };
}

/** The watchdog's settings from the environment (`.env`, see `.env.example`). */
export function watchdogConfig(raw: Record<string, string | undefined>): WatchdogConfig {
  const parsed = watchdogEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    engine: engineAddress(env.DOCKER_PROXY),
    project: env.WATCHDOG_PROJECT,
    intervalMs: env.WATCHDOG_INTERVAL_SECONDS * 1000,
    unhealthyMs: env.WATCHDOG_UNHEALTHY_MINUTES * MINUTE,
    alertMs: env.WATCHDOG_ALERT_MINUTES * MINUTE,
    gatewayRestartMs: env.WATCHDOG_GATEWAY_RESTART_MINUTES * MINUTE,
    restartLimit: env.WATCHDOG_RESTARTS,
    restartWindowMs: env.WATCHDOG_RESTART_WINDOW_MINUTES * MINUTE,
    backupStatusFile: env.BACKUP_STATUS_FILE,
    backupMaxAgeMs: env.WATCHDOG_BACKUP_HOURS * HOUR,
  };
}

/** What the watchdog told, kept across its own restarts. */
export interface WatchdogMemory {
  /** The end of the failed backup last told. */
  toldFailure?: number;
  /** When the owner was last told that no backup succeeded. */
  toldMissing?: number;
  /** Whether the owner was told that this stack's backups are off. */
  toldOff?: boolean;
  /** Since when every ask of Docker about the bot failed, and whether the owner was told. */
  dockerAway?: DockerAway;
}

/** A spell of Docker out of the watchdog's reach. */
export interface DockerAway {
  since: number;
  told: boolean;
}

/** Where the watchdog keeps what it told. */
export interface WatchdogState {
  read(): WatchdogMemory;
  write(memory: WatchdogMemory): void;
}

/** For tests, and a watchdog without a volume. */
export class MemoryWatchdogState implements WatchdogState {
  private memory: WatchdogMemory = {};

  read(): WatchdogMemory {
    return { ...this.memory };
  }

  write(memory: WatchdogMemory): void {
    this.memory = { ...memory };
  }
}

/**
 * In a small JSON file of the watchdog's own volume (`/watchdog/watchdog-state.json`), so that a
 * watchdog recreated by `./pine update` does not tell again what it told. A file that cannot be
 * read counts as empty; one that cannot be written is logged, and only costs a repeated alert.
 */
export class FileWatchdogState implements WatchdogState {
  constructor(
    private readonly file: string,
    private readonly log: Pick<Logger, 'warn'>,
  ) {}

  read(): WatchdogMemory {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      const away = raw.dockerAway as Partial<DockerAway> | undefined;
      return {
        ...(typeof raw.toldFailure === 'number' ? { toldFailure: raw.toldFailure } : {}),
        ...(typeof raw.toldMissing === 'number' ? { toldMissing: raw.toldMissing } : {}),
        ...(raw.toldOff === true ? { toldOff: true } : {}),
        ...(typeof away?.since === 'number'
          ? { dockerAway: { since: away.since, told: away.told === true } }
          : {}),
      };
    } catch {
      return {};
    }
  }

  write(memory: WatchdogMemory): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.next`, JSON.stringify(memory));
      renameSync(`${this.file}.next`, this.file);
    } catch (err) {
      // Only an alert may be told twice.
      this.log.warn({ err, file: this.file }, 'could not keep what the watchdog told');
    }
  }
}

/**
 * What the watchdog does about a kind of the health check (`healthLine`): `stuck` (a stale or
 * missing heartbeat, or a line without a known kind: the check itself timed out) is restarted;
 * `gateway` (Discord away) is told to the owner, and restarted after a long time, in case the
 * client itself is wedged; the others (the database, a start that takes long) are only told.
 */
type UnhealthyClass = 'stuck' | 'gateway' | 'told';

function classOf(kind: HealthKind | undefined): UnhealthyClass {
  if (kind === undefined || kind === 'stale' || kind === 'missing') return 'stuck';
  return kind === 'gateway' ? 'gateway' : 'told';
}

export interface WatchdogOptions {
  docker: DockerApi;
  alerts: Pick<OwnerAlerts, 'send'>;
  log: Logger;
  /** The Compose project of the stack: only its `pine` service is ever restarted. */
  project: string;
  /** How long the bot may be stuck (`stale`, `missing`) before it is restarted. */
  unhealthyMs: number;
  /** How long it may be unhealthy for another reason before the owner is told. */
  alertMs: number;
  /** How long Discord may stay away before the bot is restarted after all. */
  gatewayRestartMs: number;
  /** How many restarts by Docker within the window make the owner be told. */
  restartLimit: number;
  restartWindowMs: number;
  /** The backup service's last result, and how old the last good one may be. */
  backup: { read: () => BackupStatus | BackupsOff | undefined; maxAgeMs: number };
  /** What it told, across its own restarts. */
  state: WatchdogState;
  now?: () => number;
}

/**
 * The stack's watchdog (a service of its own, `node dist/ops/watchdog-cli.js`), asked every
 * thirty seconds: it restarts the bot when Docker has called it unhealthy for a while because it
 * is stuck (a stale heartbeat, which no exit and no restart policy catches), and tells the owner
 * of that, of an unhealthy bot a restart would not mend (the database, Discord, a long start), of
 * a bot that keeps restarting, and of backups that failed or stopped where the stack has a backup
 * service. It never restarts anything but the bot's container of its own project, and never a
 * bot that is starting; a stopped bot is Docker's (`restart: unless-stopped`) or the operator's.
 */
export class Watchdog {
  private readonly now: () => number;
  private readonly startedAt: number;
  /**
   * Since when the bot is unhealthy, and of which class: a change of that starts the clock
   * anew, so that a spell of one class never counts towards another.
   */
  private unhealthy: { since: number; class: UnhealthyClass } | undefined;
  /** Whether the owner was told of this unhealthy spell that a restart would not mend. */
  private toldUnhealthy = false;
  /** The container last seen and its restart count, to see restarts between two ticks. */
  private seen: { id: string; restartCount: number } | undefined;
  private restarts: number[] = [];
  /** Whether the stack had no backup service when last looked at, and that was logged. */
  private saidNoBackups = false;
  /** Whether the backup service said backups are off, and that was logged. */
  private saidBackupsOff = false;
  /** The spell of Docker out of reach, as kept across the watchdog's restarts. */
  private dockerAway: DockerAway | undefined;

  constructor(private readonly options: WatchdogOptions) {
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.dockerAway = options.state.read().dockerAway;
  }

  /** One look at the bot and the backups. Never throws. */
  async tick(): Promise<void> {
    try {
      await this.watchBot();
      this.dockerAnswered();
    } catch (err) {
      this.options.log.warn({ err }, 'could not ask Docker about the bot');
      await this.dockerDidNotAnswer(err);
    }
    try {
      await this.watchBackups();
    } catch (err) {
      this.options.log.warn({ err }, 'could not ask Docker about the backups');
    }
  }

  /** An ask about the bot went through: a spell of Docker out of reach is over. */
  private dockerAnswered(): void {
    if (this.dockerAway === undefined) return;
    this.dockerAway = undefined;
    const { dockerAway: _over, ...memory } = this.options.state.read();
    this.options.state.write(memory);
  }

  /**
   * An ask about the bot failed: the proxy is gone or refuses, so a stuck bot would not be
   * restarted and nothing else would say so. After `alertMs` of asks failing in a row the owner is
   * told, once per spell (remembered only once it went out: an alert that failed or was held back
   * is tried again at the next look). Kept with what else it told, for its own restarts; held in
   * memory too, so that a state that cannot be written does not silence it.
   */
  private async dockerDidNotAnswer(err: unknown): Promise<void> {
    const { alerts, alertMs, state } = this.options;
    const now = this.now();
    const spell = this.dockerAway ?? { since: now, told: false };
    const isNew = this.dockerAway === undefined;
    this.dockerAway = spell;
    if (isNew) state.write({ ...state.read(), dockerAway: spell });
    if (spell.told || now - spell.since < alertMs) return;
    const minutes = Math.round((now - spell.since) / 60_000);
    const outcome = await alerts.send(
      'docker-away',
      `The watchdog cannot reach Docker, for ${minutes} minutes now (${firstLine(err)}), so it ` +
        "cannot restart a stuck bot. './pine logs docker-proxy' shows why.",
    );
    if (outcome !== 'sent') return;
    this.dockerAway = { ...spell, told: true };
    state.write({ ...state.read(), dockerAway: this.dockerAway });
  }

  private async watchBot(): Promise<void> {
    const { docker, project } = this.options;
    const [name] = await docker.containerNames([
      `com.docker.compose.project=${project}`,
      'com.docker.compose.service=pine',
      'com.docker.compose.oneoff=False',
    ]);
    const bot = name === undefined ? undefined : await docker.container(name);
    if (name === undefined || !bot) {
      this.unhealthy = undefined;
      this.seen = undefined;
      return;
    }
    await this.countRestarts(bot.id, bot.restartCount, bot.exitCode);
    await this.checkHealth(name, bot.running && bot.health === 'unhealthy', bot.healthOutput);
  }

  /** Whether the stack has a backup service (running or not): only then are backups watched. */
  private async hasBackupService(): Promise<boolean> {
    const { docker, project } = this.options;
    const names = await docker.containerNames([
      `com.docker.compose.project=${project}`,
      'com.docker.compose.service=backup',
      'com.docker.compose.oneoff=False',
    ]);
    return names.length > 0;
  }

  private async countRestarts(id: string, restartCount: number, exitCode: number) {
    const now = this.now();
    if (this.seen?.id === id) {
      for (let i = this.seen.restartCount; i < restartCount; i++) this.restarts.push(now);
    } else {
      this.restarts = [];
    }
    this.seen = { id, restartCount };
    const { restartLimit, restartWindowMs, alerts } = this.options;
    this.restarts = this.restarts.filter((at) => now - at < restartWindowMs);
    const count = this.restarts.length;
    if (count < restartLimit) return;
    const minutes = Math.round(restartWindowMs / 60_000);
    // Told once for these; the next ones count anew.
    this.restarts = [];
    await alerts.send(
      'restarting',
      `Professor Pine restarted ${count} times in the last ${minutes} minutes ` +
        `(exit code ${exitCode} the last time). './pine logs pine' shows why.`,
    );
  }

  private async checkHealth(name: string, unhealthy: boolean, output: string | undefined) {
    const now = this.now();
    if (!unhealthy) {
      this.unhealthy = undefined;
      this.toldUnhealthy = false;
      return;
    }
    const unhealthyClass = classOf(healthKindOf(output));
    if (this.unhealthy?.class !== unhealthyClass) {
      this.unhealthy = { since: now, class: unhealthyClass };
      this.toldUnhealthy = false;
    }
    const unhealthyFor = now - this.unhealthy.since;
    const { docker, alerts, log, gatewayRestartMs } = this.options;
    const minutes = Math.round(unhealthyFor / 60_000);
    const why = output?.trim() || 'no health output';
    const restartAfter =
      unhealthyClass === 'stuck'
        ? this.options.unhealthyMs
        : unhealthyClass === 'gateway'
          ? gatewayRestartMs
          : undefined;
    if (restartAfter === undefined || unhealthyFor < restartAfter) {
      if (unhealthyClass === 'stuck') return;
      if (this.toldUnhealthy || unhealthyFor < this.options.alertMs) return;
      this.toldUnhealthy = true;
      log.warn({ minutes, health: why }, 'the bot is unhealthy; a restart would not mend it now');
      await alerts.send(
        'unhealthy',
        `Professor Pine has been unhealthy for ${minutes} minutes (${why}); ` +
          (unhealthyClass === 'gateway'
            ? `the watchdog restarts it if that lasts ${Math.round(gatewayRestartMs / 60_000)} minutes.`
            : 'a restart would not mend that, so the watchdog leaves it running.'),
      );
      return;
    }
    this.unhealthy = undefined;
    const was = `Professor Pine was unhealthy for ${minutes} minutes (${why})`;
    log.warn({ minutes, health: why }, 'the bot is unhealthy; restarting it');
    try {
      await docker.restart(name);
      await alerts.send('unhealthy', `${was}; the watchdog restarted it.`);
    } catch (err) {
      log.error({ err }, 'could not restart the bot');
      await alerts.send(
        'unhealthy',
        `${was}; the watchdog could not restart it: ${firstLine(err)}`,
      );
    }
  }

  private async watchBackups(): Promise<void> {
    const { backup, alerts, log, state } = this.options;
    if (!(await this.hasBackupService())) {
      if (!this.saidNoBackups) log.info('no backup service: backups are not watched');
      this.saidNoBackups = true;
      return;
    }
    this.saidNoBackups = false;
    const now = this.now();
    const status = backup.read();
    if (backupsOff(status)) {
      if (!this.saidBackupsOff) log.info('backups are off: they are not watched');
      this.saidBackupsOff = true;
      // Once for this stack, also across the watchdog's own restarts: a production stack whose
      // backups were switched off by mistake is noticed.
      // Remembered only once it went out: an alert that failed is tried again.
      if (!state.read().toldOff) {
        const outcome = await alerts.send(
          'backups-off',
          'Backups are off on this stack (BACKUP_DIR is blank): nothing is backed up.',
        );
        if (outcome === 'sent') state.write({ ...state.read(), toldOff: true });
      }
      return;
    }
    this.saidBackupsOff = false;
    if (state.read().toldOff) state.write({ ...state.read(), toldOff: false });
    const memory = state.read();
    if (status && !status.ok && status.finishedAt !== memory.toldFailure) {
      state.write({ ...memory, toldFailure: status.finishedAt });
      if (status.finishedAt >= this.startedAt - OLD_FAILURE_MS) {
        await alerts.send(
          'backup',
          `The backup of ${alertTime(status.finishedAt)} failed: ` +
            `${status.reason ?? 'no reason given'}. './pine logs backup' shows more.`,
        );
      }
    }
    const lastOk = status?.lastOkAt;
    const since = lastOk ?? this.startedAt;
    if (now - since <= backup.maxAgeMs) return;
    const { toldMissing } = state.read();
    if (toldMissing !== undefined && now - toldMissing < MISSING_AGAIN_MS) return;
    state.write({ ...state.read(), toldMissing: now });
    await alerts.send(
      'backup-missing',
      lastOk === undefined
        ? `No backup has run since the watchdog started at ${alertTime(this.startedAt)}. ` +
            "'./pine logs backup' shows why."
        : `No backup has succeeded since ${alertTime(lastOk)}. './pine logs backup' shows why.`,
    );
  }
}
