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

/** A shard of the gateway back after a real disconnect (`GatewayWatch.onBack`). */
export interface GatewayBack {
  /** Which shard (plan 19D): each has its own time away. */
  shard: number;
  /**
   * How long it was away: from the first reconnection, or from the last heartbeat acknowledged
   * where that was missed (`MISSED_ACK_MS`).
   */
  awayMs: number;
  /** The shard errors meanwhile. */
  shardErrors: number;
  /** It came back with a new session (`ShardReady`): the events of the time away are lost. */
  newSession: boolean;
  /**
   * What made the return real, decided here alone (19D fix round 2, R3): its time away
   * (`REAL_AWAY_MS` or more), else its shard errors, else only its new session.
   */
  real: 'time' | 'errors' | 'session';
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

/** What the watch keeps of one shard. */
interface ShardWatch {
  /** Its first ready came: from here on a reconnection of it counts. */
  armed: boolean;
  downSince: number | undefined;
  /**
   * The shard's last heartbeat acknowledged, as it was at the first reconnection: the new
   * connection's first acknowledgement can come before its RESUMED and hide it (review F3).
   */
  ackWhenDown: number | undefined;
  errorsWhileDown: number;
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
 * Each shard by itself (plan 19D; review r0 B9 of 8X-H): its arming by its own first ready, its
 * time away, its last acknowledgement and its count of errors, so that one shard's return never
 * ends another's time away, a late shard's login is no return, and one shard's errors make no
 * other's return real. What is said of the errors is the process's (fix round 1, F6): the runs of
 * a kind are shared by every shard, so a network away, which every shard meets at once, says its
 * first error once and its repeats once a minute; an outage begins when a shard goes away while
 * none is, and ends when none is away any more (the runs are cleared then, the unsaid counted in
 * the line of the gateway back of each shard as it returns). `createClient` connects as many
 * shards as Discord asks for (one up to 2,500 servers); with one, all of this is as before.
 */
export class GatewayWatch {
  private readonly now: () => number;
  private readonly shards = new Map<number, ShardWatch>();
  /** The runs of shard errors by kind, of every shard. */
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

  /** What the watch keeps of `shard`, made at its first event. */
  private watchOf(shard: number): ShardWatch {
    let watch = this.shards.get(shard);
    if (!watch) {
      watch = {
        armed: false,
        downSince: undefined,
        ackWhenDown: undefined,
        errorsWhileDown: 0,
      };
      this.shards.set(shard, watch);
    }
    return watch;
  }

  /** Whether any shard is away now. */
  private anyAway(): boolean {
    return [...this.shards.values()].some((watch) => watch.downSince !== undefined);
  }

  private away(shard: number): void {
    const watch = this.watchOf(shard);
    if (!watch.armed || watch.downSince !== undefined) return;
    // An outage's first error of a kind is said, also of a kind seen while connected (review r1
    // C5); an outage begins when a shard goes away while none is (fix round 1, F6).
    if (!this.anyAway()) this.runs.clear();
    watch.downSince = this.now();
    watch.ackWhenDown = this.options.lastAck?.(shard);
    watch.errorsWhileDown = 0;
  }

  private back(shard: number, newSession: boolean): void {
    const watch = this.watchOf(shard);
    if (!watch.armed) {
      // The shard's login ready: from here on a reconnection of it counts.
      watch.armed = true;
      if (!this.anyAway()) this.runs.clear();
      return;
    }
    const since = watch.downSince;
    if (since === undefined) return;
    const now = this.now();
    const ack = watch.ackWhenDown;
    const from = ack !== undefined && ack >= 0 && since - ack > MISSED_ACK_MS ? ack : since;
    const awayMs = now - from;
    const shardErrors = watch.errorsWhileDown;
    const unsaid = [...this.runs.values()].reduce((sum, run) => sum + run.unsaid, 0);
    watch.downSince = undefined;
    watch.ackWhenDown = undefined;
    watch.errorsWhileDown = 0;
    // The outage ends with the last shard back; until then the unsaid are said in this line.
    if (this.anyAway()) for (const run of this.runs.values()) run.unsaid = 0;
    else this.runs.clear();
    const real: GatewayBack['real'] | undefined =
      awayMs >= (this.options.realAfterMs ?? REAL_AWAY_MS)
        ? 'time'
        : shardErrors > 0
          ? 'errors'
          : newSession
            ? 'session'
            : undefined;
    if (real === undefined) {
      this.options.log.debug({ shard, awayMs }, 'discord gateway resumed');
      return;
    }
    this.options.log.info(
      { shard, awayMs, shardErrors, unsaid, newSession, real },
      'discord gateway back',
    );
    const event: GatewayBack = { shard, awayMs, shardErrors, newSession, real };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.options.log.error({ err }, 'could not tell of the gateway back');
      }
    }
  }

  private shardError(err: Error, shard: number): void {
    const watch = this.watchOf(shard);
    if (watch.downSince !== undefined) watch.errorsWhileDown++;
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

/**
 * How often a shard's short return with a new session alone asks for the catch-up: at most once in
 * ten minutes (fix round 1 of 19D, F5).
 */
export const SESSION_CATCH_UP_EVERY_MS = 10 * 60_000;

export interface CatchUpOnReturnOptions {
  /** How many shards the client has (`client.ws.shards.size`). */
  shards: () => number;
  now?: () => number;
  sessionEveryMs?: number;
}

/**
 * The listener of `GatewayWatch.onBack` that asks for the catch-up (`request`), by what made the
 * return real (`GatewayBack.real`, decided by the watch alone): at every return real by its time
 * away or by its shard errors, when requests failed meanwhile; with one shard at every return, as
 * before plan 19D (19D fix round 2, R3); with several, a return real only by its new session (an
 * ECONNRESET on a live connection, a second away), whose few seconds failed hardly anything and
 * which several shards each have now and then, at most once in `SESSION_CATCH_UP_EVERY_MS`,
 * counted from the last catch-up asked for whatever the reason. The catch-up is the whole one,
 * every server's (`operations.md`, "The catch-up on reconnect"); it coalesces and is safe to run
 * again.
 */
export function catchUpOnReturn(
  request: () => void,
  options: CatchUpOnReturnOptions,
): (back: GatewayBack) => void {
  const now = options.now ?? Date.now;
  const everyMs = options.sessionEveryMs ?? SESSION_CATCH_UP_EVERY_MS;
  let lastAsked: number | undefined;
  return (back) => {
    const at = now();
    const limited = back.real === 'session' && options.shards() > 1;
    if (limited && lastAsked !== undefined && at - lastAsked < everyMs) return;
    lastAsked = at;
    request();
  };
}
