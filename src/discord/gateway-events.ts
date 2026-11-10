import { Events, type Client } from 'discord.js';
import type { Logger } from '../log.js';

/**
 * Logs gateway trouble. discord.js emits ShardDisconnect only for close codes it will not
 * reconnect after (4004 bad token, 4014 disallowed intents, and similar), so it is fatal:
 * `onFatal` should shut down and exit non-zero so the supervisor restarts the bot; it is told why,
 * in a line for the owner's alert. Shard errors are the `GatewayWatch`'s (plan 8X-H): discord.js
 * retries by itself, and a line each was 115 a minute in an outage.
 */
export function attachGatewayHandlers(
  client: Pick<Client, 'on'>,
  log: Logger,
  onFatal: (reason: string) => void,
): void {
  client.on(Events.ShardDisconnect, (event, shard) => {
    log.fatal(
      { code: event.code, shard },
      'discord gateway closed and will not reconnect; shutting down',
    );
    onFatal(`Discord closed the gateway connection for good (code ${event.code})`);
  });
}

/** How long the gateway is away before its return counts as real without errors: 30 seconds. */
export const REAL_AWAY_MS = 30_000;
/**
 * How old the last heartbeat acknowledged is, at the first reconnection, before the time away
 * counts from it: a minute. Discord asks for a heartbeat every 41.25 s, so at a routine
 * reconnection the last acknowledgement is up to that old; a zombie connection (discord.js gives
 * it up two unanswered heartbeats on, some 82 s) or a laptop asleep leaves it older (review r0 B1).
 */
export const MISSED_ACK_MS = 60_000;
/** A run of shard errors of one kind is said again at most once in this time: a minute. */
export const REPEAT_EVERY_MS = 60_000;

/** The gateway back after a real disconnect (`GatewayWatch.onBack`). */
export interface GatewayBack {
  /**
   * How long it was away: from the first reconnection, or from the last heartbeat acknowledged
   * where that was missed (`MISSED_ACK_MS`).
   */
  awayMs: number;
  /** The shard errors meanwhile. */
  shardErrors: number;
  /** It came back with a new session (`ShardReady`): the events of the time away are lost. */
  newSession: boolean;
}

export interface GatewayWatchOptions {
  log: Logger;
  now?: () => number;
  /**
   * When Discord last acknowledged the heartbeat of a shard (`client.ws.shards`'s
   * `lastPingTimestamp`; -1 before the first, undefined for none): a laptop asleep while
   * connected reconnects only at wake, so the time away counts from then, when it is more than
   * `MISSED_ACK_MS` before the first reconnection.
   */
  lastAck?: (shardId: number) => number | undefined;
  realAfterMs?: number;
  repeatEveryMs?: number;
}

/** A run of shard errors of one kind: when it was last said, and how many since. */
interface ErrorRun {
  message: string;
  saidAt: number;
  unsaid: number;
}

/**
 * Whether the gateway came back after a real disconnect (plan 8X-H, review R2), so that what
 * failed meanwhile is caught up: armed by the first ready (the login's own and earlier
 * reconnections never count); the first `ShardReconnecting` while up marks it away (discord.js
 * says it with every try: later ones change nothing); `ShardResume` or `ShardReady` brings it
 * back. Back for real when it was away `REAL_AWAY_MS` or more (from the shard's last heartbeat
 * acknowledged when that is more than `MISSED_ACK_MS` older: a zombie connection, a laptop that
 * slept while connected), when a shard error came meanwhile, or when it came back with a new
 * session (`ShardReady`: the events of the time away are lost); then `discord gateway back` at
 * info and the listeners told. A routine resume of a second without errors is none. Only a
 * reconnection starts the time away: a shard error while connected is said, but not counted
 * (review r0 B8). The heartbeat and the health rules are not this (`operations.md`): they say
 * whether the bot is connected now.
 *
 * Shard errors (Windows' DNS away gives one each half second, some 115 a minute) are said once
 * per kind (`code`, else the message): the first at warn with the error, then at most once a
 * minute `discord shard errors repeated` with how many, checked as each comes (no timer); those
 * not said yet are counted in the line of the gateway back, and a kind is said anew when the next
 * outage begins.
 *
 * One state for every shard: the first away, the first back. Pine runs one shard
 * (`createClient`, `src/discord/client.ts`, sets no `shards`: discord.js's `shardCount` of 1;
 * Discord asks for more only beyond 2,500 servers); with several, one shard's return would end
 * the time away of all (review r0 B9).
 */
export class GatewayWatch {
  private readonly now: () => number;
  private armed = false;
  private downSince: number | undefined;
  /**
   * The shard's last heartbeat acknowledged, as it was at the first reconnection: the new
   * connection's first acknowledgement can come before its RESUMED and hide it (review F3).
   */
  private ackWhenDown: number | undefined;
  private errorsWhileDown = 0;
  private readonly runs = new Map<string, ErrorRun>();
  private readonly listeners: ((back: GatewayBack) => void)[] = [];

  constructor(private readonly options: GatewayWatchOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Listens to the client's shard events; `this`, to chain. */
  attach(client: Pick<Client, 'on'>): this {
    client.on(Events.ShardReady, (shard) => {
      this.back(shard, true);
    });
    client.on(Events.ShardResume, (shard) => {
      this.back(shard, false);
    });
    client.on(Events.ShardReconnecting, (shard) => {
      this.away(shard);
    });
    client.on(Events.ShardError, (err, shard) => {
      this.shardError(err, shard);
    });
    return this;
  }

  /** Who is told when the gateway is back after a real disconnect (the catch-up). */
  onBack(listener: (back: GatewayBack) => void): void {
    this.listeners.push(listener);
  }

  private away(shard: number): void {
    if (!this.armed || this.downSince !== undefined) return;
    this.downSince = this.now();
    this.ackWhenDown = this.options.lastAck?.(shard);
    this.errorsWhileDown = 0;
    // An outage's first error of a kind is said, also of a kind seen while connected (review r1 C5).
    this.runs.clear();
  }

  private back(shard: number, newSession: boolean): void {
    if (!this.armed) {
      // The login's own ready: from here on a reconnection counts.
      this.armed = true;
      this.runs.clear();
      return;
    }
    const since = this.downSince;
    if (since === undefined) return;
    const now = this.now();
    const ack = this.ackWhenDown;
    const from = ack !== undefined && ack >= 0 && since - ack > MISSED_ACK_MS ? ack : since;
    const awayMs = now - from;
    const shardErrors = this.errorsWhileDown;
    const unsaid = [...this.runs.values()].reduce((sum, run) => sum + run.unsaid, 0);
    this.downSince = undefined;
    this.ackWhenDown = undefined;
    this.errorsWhileDown = 0;
    this.runs.clear();
    const real = awayMs >= (this.options.realAfterMs ?? REAL_AWAY_MS) || shardErrors > 0;
    if (!real && !newSession) {
      this.options.log.debug({ shard, awayMs }, 'discord gateway resumed');
      return;
    }
    this.options.log.info(
      { shard, awayMs, shardErrors, unsaid, newSession },
      'discord gateway back',
    );
    const event: GatewayBack = { awayMs, shardErrors, newSession };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.options.log.error({ err }, 'could not tell of the gateway back');
      }
    }
  }

  private shardError(err: Error, shard: number): void {
    if (this.downSince !== undefined) this.errorsWhileDown++;
    const code: unknown = (err as { code?: unknown }).code;
    const kind = typeof code === 'string' || typeof code === 'number' ? String(code) : err.message;
    const now = this.now();
    const run = this.runs.get(kind);
    if (!run) {
      this.runs.set(kind, { message: err.message, saidAt: now, unsaid: 0 });
      this.options.log.warn({ err, shard }, 'discord shard error');
      return;
    }
    run.unsaid++;
    if (now - run.saidAt < (this.options.repeatEveryMs ?? REPEAT_EVERY_MS)) return;
    this.options.log.warn(
      { shard, count: run.unsaid, error: run.message },
      'discord shard errors repeated',
    );
    run.saidAt = now;
    run.unsaid = 0;
  }
}
