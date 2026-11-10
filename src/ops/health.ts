import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** The bot's own files about itself, under `var/` (a volume in the Docker stack). */
export const HEALTH_DIR = 'var/health';

/** The files of `HEALTH_DIR`, or of another folder (tests). */
export function healthFiles(dir: string = HEALTH_DIR) {
  return {
    /** The heartbeat (`Heartbeat`), read by the health check (`health-cli`). */
    status: path.join(dir, 'status.json'),
    /** There while the bot runs; left behind by a crash (`CrashRecord`). */
    marker: path.join(dir, 'running.json'),
    /** The times of the recent restarts after a crash (`CrashRecord`). */
    restarts: path.join(dir, 'restarts.json'),
    /** When the owner was last alerted, by kind (`FileStamps`). */
    alerts: path.join(dir, 'alerts.json'),
  };
}

const healthStatusSchema = z.object({
  /** When the file was written: an old one means a stuck or stopped bot. */
  writtenAt: z.number(),
  startedAt: z.number(),
  pid: z.number(),
  /**
   * `starting` until the login to Discord begins (migrations, game data, the stores), then
   * `running`: a start may take as long as a takeover's migrations take.
   */
  phase: z.enum(['starting', 'running']),
  /** Whether the client is connected to Discord's gateway, and since when it is or is not. */
  gateway: z.object({ connected: z.boolean(), since: z.number() }),
  /** Whether the database answered the last check. */
  database: z.object({
    reachable: z.boolean(),
    checkedAt: z.number(),
    error: z.string().optional(),
  }),
  /** Rehearsal mode is on (`settings.rehearsal`): said in every line, so it is never left on unseen. */
  rehearsal: z.boolean().optional(),
});

/** What the heartbeat writes. */
export type HealthStatus = z.output<typeof healthStatusSchema>;

/** The heartbeat file as written, or nothing when there is none or it cannot be read. */
export function readHealthStatus(file: string): HealthStatus | undefined {
  try {
    const parsed = healthStatusSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export interface HealthLimits {
  /** A heartbeat older than this means a stuck or stopped bot. */
  staleMs: number;
  /** How long the bot may be without Discord after its login began and still be healthy. */
  gatewayGraceMs: number;
  /** How long a start may take before it is called unhealthy (the watchdog only alerts). */
  startLimitMs: number;
}

/**
 * Three missed heartbeats; two minutes for Discord (a reconnect usually takes seconds, and raids are coordinated
 * through the bot); half an
 * hour for a start.
 */
export const DEFAULT_HEALTH_LIMITS: HealthLimits = {
  staleMs: 90_000,
  gatewayGraceMs: 2 * 60_000,
  startLimitMs: 30 * 60_000,
};

/**
 * What the verdict is about. The watchdog reads it from the start of the health check's line:
 * it restarts the bot only for `stale` and `missing` (a stuck or absent process), and alerts for
 * the others, which a restart does not mend.
 */
export type HealthKind =
  | 'healthy'
  | 'starting'
  | 'stale'
  | 'missing'
  | 'unreadable'
  | 'slow-start'
  | 'gateway'
  | 'database';

export interface HealthVerdict {
  healthy: boolean;
  kind: HealthKind;
  /** What was found, for Docker's health log and `./pine status`. */
  reason: string;
}

/** The health check's line: the kind first, then what was found. */
export function healthLine(verdict: HealthVerdict): string {
  return `${verdict.kind}: ${verdict.reason}`;
}

/** The kind at the start of a health check's line, if it has one. */
export function healthKindOf(line: string | undefined): HealthKind | undefined {
  const kind = /^([a-z-]+):/.exec(line?.trim() ?? '')?.[1];
  const kinds: readonly string[] = [
    'healthy',
    'starting',
    'stale',
    'missing',
    'unreadable',
    'slow-start',
    'gateway',
    'database',
  ];
  return kind !== undefined && kinds.includes(kind) ? (kind as HealthKind) : undefined;
}

/** A time span in words: "10 seconds", "2 minutes", "3 hours". */
function span(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const [amount, unit] =
    seconds < 90
      ? [seconds, 'second']
      : seconds < 90 * 60
        ? [Math.round(seconds / 60), 'minute']
        : [Math.round(seconds / 3600), 'hour'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

/** Whether the bot is healthy by its heartbeat at `now`; in rehearsal mode the reason says so. */
export function healthVerdict(
  status: HealthStatus,
  now: number,
  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
): HealthVerdict {
  const verdict = verdictOf(status, now, limits);
  return status.rehearsal
    ? { ...verdict, reason: `${verdict.reason}; REHEARSAL MODE IS ON` }
    : verdict;
}

function verdictOf(
  status: HealthStatus,
  now: number,
  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
): HealthVerdict {
  const age = now - status.writtenAt;
  if (age > limits.staleMs) {
    return {
      healthy: false,
      kind: 'stale',
      reason: `the last heartbeat is ${span(age)} old: the bot is stuck or not running`,
    };
  }
  const { gateway, database } = status;
  const checked = span(now - database.checkedAt);
  if (!database.reachable) {
    return {
      healthy: false,
      kind: 'database',
      reason: `the database did not answer ${checked} ago: ${database.error ?? 'no reason given'}`,
    };
  }
  if (status.phase === 'starting') {
    const starting = now - status.startedAt;
    if (starting > limits.startLimitMs) {
      return {
        healthy: false,
        kind: 'slow-start',
        reason: `still starting after ${span(starting)}`,
      };
    }
    return {
      healthy: true,
      kind: 'starting',
      reason: `starting for ${span(starting)}, the database answered ${checked} ago`,
    };
  }
  const away = now - gateway.since;
  if (!gateway.connected && away > limits.gatewayGraceMs) {
    return {
      healthy: false,
      kind: 'gateway',
      reason: `not connected to Discord for ${span(away)}`,
    };
  }
  const discord = gateway.connected
    ? `connected to Discord for ${span(away)}`
    : `connecting to Discord for ${span(away)}`;
  return {
    healthy: true,
    kind: 'healthy',
    reason: `${discord}, the database answered ${checked} ago`,
  };
}

/** The verdict on the heartbeat in `file`; no file, or one that cannot be read, is unhealthy. */
export function healthCheck(
  file: string,
  now: number,
  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
): HealthVerdict {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { healthy: false, kind: 'missing', reason: `no heartbeat yet: ${file} is missing` };
  }
  let status: HealthStatus | undefined;
  try {
    const parsed = healthStatusSchema.safeParse(JSON.parse(text));
    status = parsed.success ? parsed.data : undefined;
  } catch {
    status = undefined;
  }
  if (!status) {
    return {
      healthy: false,
      kind: 'unreadable',
      reason: `the heartbeat file ${file} cannot be read`,
    };
  }
  return healthVerdict(status, now, limits);
}
