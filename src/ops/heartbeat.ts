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
 * How long one shard of several may be away before the gateway counts as down (plan 19D): three
 * minutes. A routine reconnection takes seconds and an outage of Discord's or of the network takes
 * every shard at once; one shard alone away for minutes is a client that does not come back by
 * itself, which the watchdog's restart mends. The health check's own grace (`gatewayGraceMs`) is
 * shorter, so such a shard is unhealthy at once, counted from when it went away.
 */
export const SHARD_GRACE_MS = 3 * 60_000;

/**
 * Whether a shard is up: ready, and Discord acknowledged its heartbeat lately. The shard's own
 * status, never `client.ws.status`, which discord.js sets to ready once and never back when a
 * shard closes, resumes or reconnects.
 */
export function shardUp(shard: ShardState, now: number, ackLimitMs = ACK_LIMIT_MS): boolean {
  return (
    shard.status === Status.Ready &&
    (shard.lastPingTimestamp < 0 || now - shard.lastPingTimestamp <= ackLimitMs)
  );
}

/** How far apart discord.js identifies the shards of one `max_concurrency` slot: five seconds. */
export const IDENTIFY_GAP_MS = 5_000;

/** A shard as the probe last saw it: up or away, and since when. */
export interface ShardSpell {
  up: boolean;
  since: number;
  /**
   * A shard that has not been ready yet (the login): how long after `since` its identify comes at
   * the latest, so that its time away starts there (fix round 1, F4). None once it was ready.
   */
  slotMs?: number;
}

/** What the gateway probe says: connected or not, and how many shards are up of how many. */
export interface GatewayReading {
  connected: boolean;
  /**
   * Not connected: since when it counts as down (the shard past its grace went away, or the last
   * shard went); undefined for from now (no shards yet, at the login).
   */
  since?: number;
  up: number;
  total: number;
  /** How many shards are away past their grace, where any is. */
  late?: number;
}

/**
 * Whether the client is connected to Discord (plan 19D): yes unless every shard is away, or one
 * has been away longer than `graceMs`. One shard of one is "every shard", so a self-hosted
 * instance is down the moment its shard is, as before; with several, one shard's routine
 * reconnection leaves the bot healthy, so that the watchdog does not restart every shard for it.
 * A shard that has not been ready yet is away from its identify slot on (`slotMs`), not from the
 * login, so that the last of many shards is not late for waiting its turn. No shards (the login
 * asks Discord how many) is not connected.
 */
export function gatewayHealth(
  shards: readonly ShardSpell[],
  now: number,
  graceMs = SHARD_GRACE_MS,
): GatewayReading {
  const total = shards.length;
  const up = shards.filter((shard) => shard.up).length;
  if (total === 0) return { connected: false, up, total };
  const away = shards.filter((shard) => !shard.up);
  const lateFrom = away
    .map((shard) => shard.since + (shard.slotMs ?? 0))
    .filter((from) => now - from > graceMs);
  const downFrom = [...lateFrom];
  if (up === 0) downFrom.push(Math.max(...away.map((shard) => shard.since)));
  if (downFrom.length === 0) return { connected: true, up, total };
  return {
    connected: false,
    since: Math.min(...downFrom),
    up,
    total,
    ...(lateFrom.length > 0 ? { late: lateFrom.length } : {}),
  };
}

export interface GatewayProbeOptions {
  graceMs?: number;
  /**
   * How many shards discord.js identifies at once (Discord's `max_concurrency`, from what the
   * login asked of `GET /gateway/bot`); 1 where it is not known.
   */
  maxConcurrency?: () => number;
}

/**
 * The heartbeat's probe of the gateway (plan 19D): reads every shard of the client
 * (`client.ws.shards`) at each heartbeat and remembers since when each is up or away, from the
 * read that first saw it so (the heartbeat's thirty seconds are fine enough for a grace of
 * minutes), then judges by `gatewayHealth`. A shard that left the client's list is forgotten.
 * Until a shard is first seen up, its spell has its identify slot (fix round 1, F4): discord.js
 * identifies `max_concurrency` shards at once, five seconds apart, so shard `id` comes up to
 * 5 s × ⌈(id + 1) / max_concurrency⌉ after the first.
 */
export class GatewayProbe {
  private readonly spells = new Map<number, ShardSpell>();
  /** The shards seen up once. */
  private readonly readied = new Set<number>();

  constructor(
    private readonly shards: () => ReadonlyMap<number, ShardState>,
    private readonly options: GatewayProbeOptions = {},
  ) {}

  read(now: number): GatewayReading {
    const shards = this.shards();
    for (const id of this.spells.keys()) if (!shards.has(id)) this.spells.delete(id);
    for (const [id, shard] of shards) {
      const up = shardUp(shard, now);
      if (up) this.readied.add(id);
      if (this.spells.get(id)?.up === up) continue;
      const slotMs = up || this.readied.has(id) ? undefined : this.slotOf(id);
      this.spells.set(id, { up, since: now, ...(slotMs === undefined ? {} : { slotMs }) });
    }
    return gatewayHealth([...this.spells.values()], now, this.options.graceMs);
  }

  private slotOf(id: number): number {
    const concurrency = Math.max(1, Math.floor(this.options.maxConcurrency?.() ?? 1));
    return IDENTIFY_GAP_MS * Math.ceil((id + 1) / concurrency);
  }
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
  private gateway: ((now: number) => GatewayReading) | undefined;
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
   * from `probe` (a `GatewayProbe`'s `read`); the time without it counts from now.
   */
  loggingIn(probe: (now: number) => GatewayReading): void {
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
    const reading = this.gateway?.(now);
    const connected = reading?.connected ?? false;
    if (connected !== this.connected.connected) {
      // Down since the shard past its grace went away, not since this read (plan 19D).
      this.connected = { connected, since: connected ? now : (reading?.since ?? now) };
    }
    const status: HealthStatus = {
      writtenAt: now,
      startedAt: this.startedAt,
      pid: process.pid,
      phase: this.gateway ? 'running' : 'starting',
      gateway: reading
        ? {
            ...this.connected,
            shards: {
              up: reading.up,
              total: reading.total,
              ...(reading.late === undefined ? {} : { late: reading.late }),
            },
          }
        : this.connected,
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
