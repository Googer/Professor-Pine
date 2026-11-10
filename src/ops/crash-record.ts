import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { alertTime } from './owner-alerts.js';
import { healthFiles, readHealthStatus } from './health.js';

/** What the start of a run found of a crash of the run before. */
export interface CrashReport {
  /** The time of the crash: its error's, or the last heartbeat's, or the run's start. */
  at: number;
  /** The first line of the error that ended that run, when it said one. */
  error?: string;
  /** The restarts after a crash within the window (an hour), this one included. */
  restartsInWindow: number;
}

/** A bot that runs from the same folder now, found by a start (`runningElsewhere`). */
export interface RunningBot {
  pid: number;
  startedAt: number;
}

/**
 * How recent the running bot's last sign of life must be: its heartbeat, or its start before the
 * first heartbeat. Three of the heartbeat's 30 s beats.
 */
const ALIVE_WITHIN_MS = 90_000;

/** Whether a process of that number runs (`EPERM`: it runs, under another user). */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

interface Marker {
  startedAt: number;
  pid: number;
  error?: { at: number; message: string };
}

export interface CrashRecordOptions {
  /** The folder of the health files (`HEALTH_DIR`). */
  dir: string;
  /** How far back restarts are counted. An hour. */
  windowMs?: number;
  now?: () => number;
  /** This process's number (tests). */
  pid?: number;
  /** Whether a process of that number runs (tests). */
  isAlive?: (pid: number) => boolean;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  const next = `${file}.next`;
  writeFileSync(next, JSON.stringify(value));
  renameSync(next, file);
}

/**
 * Whether the bot ended cleanly: a marker file is written at the start and removed at a clean
 * shutdown, so a start that finds one follows a crash (an error, a kill, the machine stopping).
 * The error that ends a run is kept in the marker for the next start to tell. Synchronous, so
 * that it works from an exit path; a file it cannot read counts as absent, one it cannot write is
 * skipped (the bot runs on without its crash reports).
 */
export class CrashRecord {
  private readonly dir: string;
  private readonly files: ReturnType<typeof healthFiles>;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly pid: number;
  private readonly isAlive: (pid: number) => boolean;

  constructor(options: CrashRecordOptions) {
    this.dir = options.dir;
    this.files = healthFiles(options.dir);
    this.windowMs = options.windowMs ?? 60 * 60_000;
    this.now = options.now ?? Date.now;
    this.pid = options.pid ?? process.pid;
    this.isAlive = options.isAlive ?? processAlive;
  }

  /**
   * Before `started`: another bot running from this folder now, whose marker is no crash. Its
   * process must be alive, be not this one (a container's bot is process 1 at every start) and
   * have shown life lately: a heartbeat of the same process, or a start before its first one. A
   * crashed bot whose number another process took has neither.
   */
  runningElsewhere(): RunningBot | undefined {
    const marker = this.readMarker();
    if (!marker || marker.pid <= 0 || marker.pid === this.pid || !this.isAlive(marker.pid)) {
      return undefined;
    }
    const now = this.now();
    const status = readHealthStatus(this.files.status);
    const beating = status?.pid === marker.pid && now - status.writtenAt <= ALIVE_WITHIN_MS;
    const starting = now - marker.startedAt <= ALIVE_WITHIN_MS;
    return beating || starting ? { pid: marker.pid, startedAt: marker.startedAt } : undefined;
  }

  /** At the start of a run: the crash of the run before, if it crashed; then a new marker. */
  started(): CrashReport | undefined {
    const now = this.now();
    const previous = this.readMarker();
    let report: CrashReport | undefined;
    if (previous) {
      const restarts = [...this.readRestarts(), now].filter((at) => now - at < this.windowMs);
      this.write(this.files.restarts, restarts);
      const lastSeen = readHealthStatus(this.files.status)?.writtenAt;
      report = {
        at:
          previous.error?.at ??
          (lastSeen !== undefined && lastSeen >= previous.startedAt ? lastSeen : undefined) ??
          previous.startedAt,
        ...(previous.error ? { error: previous.error.message } : {}),
        restartsInWindow: restarts.length,
      };
    }
    this.write(this.files.marker, { startedAt: now, pid: this.pid } satisfies Marker);
    return report;
  }

  /** The error that is ending this run, for the next start to tell. */
  failed(message: string): void {
    const marker = this.readMarker() ?? { startedAt: this.now(), pid: this.pid };
    this.write(this.files.marker, { ...marker, error: { at: this.now(), message } });
  }

  /** A clean end: the marker goes. */
  stopped(): void {
    try {
      rmSync(this.files.marker, { force: true });
    } catch {
      // The next start reports a crash that was none; nothing worse.
    }
  }

  private write(file: string, value: unknown): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeJson(file, value);
    } catch {
      // Without the files the bot only loses its crash reports.
    }
  }

  private readMarker(): Marker | undefined {
    const raw = readJson(this.files.marker);
    if (raw === undefined) {
      // A marker that is there but cannot be read still means a crash.
      return this.exists(this.files.marker) ? { startedAt: this.now(), pid: 0 } : undefined;
    }
    const marker = raw as Partial<Marker>;
    if (typeof marker.startedAt !== 'number') return { startedAt: this.now(), pid: 0 };
    const error =
      typeof marker.error?.at === 'number' && typeof marker.error.message === 'string'
        ? marker.error
        : undefined;
    return {
      startedAt: marker.startedAt,
      pid: Number(marker.pid) || 0,
      ...(error ? { error } : {}),
    };
  }

  private readRestarts(): number[] {
    const raw = readJson(this.files.restarts);
    return Array.isArray(raw) ? raw.filter((at): at is number => typeof at === 'number') : [];
  }

  private exists(file: string): boolean {
    try {
      readFileSync(file);
      return true;
    } catch {
      return false;
    }
  }
}

/** The owner's alert of a start after a crash. */
export function restartText(report: CrashReport): string {
  const why =
    report.error ?? 'no error was recorded (killed, out of memory, or the machine stopped)';
  return (
    `Professor Pine restarted after a crash at ${alertTime(report.at)}: ${why}. ` +
    `Restart ${report.restartsInWindow} in the last hour.`
  );
}
