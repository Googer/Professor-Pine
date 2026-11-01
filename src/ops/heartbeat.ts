import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Status } from 'discord.js';
import type { Logger } from '../log.js';
import type { HealthStatus } from './health.js';

export interface HeartbeatOptions {
  /** Where the status goes (`healthFiles().status`). */
  file: string;
  /** Asks the database something small; rejects when it cannot. */
  database: () => Promise<void>;
  /** How often the status is written. Thirty seconds. */
  intervalMs?: number;
  /** How long the database may take to answer. Ten seconds. */
  databaseTimeoutMs?: number;
  log: Logger;
  now?: () => number;
  /** Rehearsal mode is on: the status says so (`./pine status`, the health check). */
  rehearsal?: boolean;
}

/** What the gateway probe reads of a shard of discord.js's `client.ws.shards`. */
export interface ShardState {
  status: Status;
  /** When Discord last acknowledged the shard's heartbeat; -1 before the first time. */
  lastPingTimestamp: number;
}

/** Discord acknowledges a heartbeat about every 41 seconds: three minutes without is a dead line. */
const ACK_LIMIT_MS = 3 * 60_000;

/**
 * Whether the client is connected to Discord: every shard is ready and Discord acknowledged its
 * heartbeat lately. The shards, not `client.ws.status`, which discord.js sets to ready once and
 * never back when a shard closes, resumes or reconnects.
 */
export function gatewayConnected(
  shards: ReadonlyMap<number, ShardState>,
  now: number,
  ackLimitMs = ACK_LIMIT_MS,
): boolean {
  if (shards.size === 0) return false;
  return [...shards.values()].every(
    (shard) =>
      shard.status === Status.Ready &&
      (shard.lastPingTimestamp < 0 || now - shard.lastPingTimestamp <= ackLimitMs),
  );
}

/**
 * The bot's health as a small file under `var/` (no listener of its own: the web server of plan
 * 8M is the bot's only one), written every thirty seconds from the start on: when, whether the
 * bot is still starting (until its login begins), whether the client is connected to Discord and
 * since when, whether the database answered. The health check
 * of the Docker stack (`health-cli`) reads it; a file that stops changing means a stuck bot.
 */
export class Heartbeat {
  private readonly startedAt: number;
  private readonly now: () => number;
  private gateway: (() => boolean) | undefined;
  private connected: { connected: boolean; since: number };
  private timer: NodeJS.Timeout | undefined;
  private beating: Promise<void> | undefined;
  private writeFailed = false;

  constructor(private readonly options: HeartbeatOptions) {
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.connected = { connected: false, since: this.startedAt };
  }

  /**
   * The login to Discord begins: the bot is running from here on, and the connection is read
   * from `probe`; the time without it counts from now.
   */
  loggingIn(probe: () => boolean): void {
    this.gateway = probe;
    this.connected = { connected: false, since: this.now() };
  }

  /** Writes the status now and every interval, until `stop`. */
  start(): void {
    if (this.timer) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.options.intervalMs ?? 30_000);
    this.timer.unref();
  }

  /** Stops writing; a write that has begun finishes. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.beating;
  }

  /** One heartbeat: the database asked, the status written. Never throws. */
  beat(): Promise<void> {
    // One at a time: a slow database never piles up checks.
    this.beating ??= this.write().finally(() => {
      this.beating = undefined;
    });
    return this.beating;
  }

  private async write(): Promise<void> {
    const database = await this.checkDatabase();
    const now = this.now();
    const connected = this.gateway?.() ?? false;
    if (connected !== this.connected.connected) this.connected = { connected, since: now };
    const status: HealthStatus = {
      writtenAt: now,
      startedAt: this.startedAt,
      pid: process.pid,
      phase: this.gateway ? 'running' : 'starting',
      gateway: this.connected,
      database,
      ...(this.options.rehearsal ? { rehearsal: true } : {}),
    };
    const { file, log } = this.options;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      // Whole or not at all: the health check never reads half a file.
      const next = `${file}.next`;
      await writeFile(next, JSON.stringify(status));
      await rename(next, file);
      this.writeFailed = false;
    } catch (err) {
      // Once until it works again: the health check says the rest.
      if (!this.writeFailed) log.warn({ err, file }, 'could not write the heartbeat');
      this.writeFailed = true;
    }
  }

  private async checkDatabase(): Promise<HealthStatus['database']> {
    const ms = this.options.databaseTimeoutMs ?? 10_000;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
      timer.unref();
    });
    try {
      await Promise.race([this.options.database(), timeout]);
      return { reachable: true, checkedAt: this.now() };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { reachable: false, checkedAt: this.now(), error: error.split('\n')[0] ?? error };
    } finally {
      clearTimeout(timer);
    }
  }
}
