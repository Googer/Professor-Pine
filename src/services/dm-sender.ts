import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { BoundedMap } from '../bounded-map.js';
import type { DmGateway, DmOutcome } from '../discord/dm-gateway.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';

/**
 * How urgent a direct message is (Matt, 2026-10-12). `urgent` is for what a member is waiting
 * on in a party they are in (a meeting time, the boss of their egg); `spawn` for a wild Pokémon,
 * which is gone in half an hour; `normal` for the other news they asked for (a raid for a want
 * or at a gym, a new train). Everything of one priority goes out before anything of the next.
 */
export const DM_PRIORITY = { urgent: 0, spawn: 1, normal: 2 } as const;
export type DmPriority = (typeof DM_PRIORITY)[keyof typeof DM_PRIORITY];
const PRIORITIES: readonly DmPriority[] = [
  DM_PRIORITY.urgent,
  DM_PRIORITY.spawn,
  DM_PRIORITY.normal,
];

/** One direct message to one member. */
export interface DmJob {
  /** Snowflake of the member. */
  userId: string;
  /**
   * The message, built by the caller once per event: the sender renders nothing, and the jobs
   * of one event may share the object. Classic (a meeting time, for a phone's notification) or
   * components v2 (the notifier's news), sent as `discordPayload` makes it.
   */
  message: OutgoingMessage;
  priority: DmPriority;
  /** When what the message is about happened (epoch ms): delivery time is measured from it. */
  eventAt: number;
  /** From when on the message is not worth sending any more (epoch ms): it is dropped then. */
  expiresAt: number;
}

/**
 * Sends direct messages (`ctx.dms`). `send` only puts the message in line: it never waits for
 * Discord and never throws, and nobody learns what became of one message (the numbers of a
 * burst are logged). A second bot token could implement this later; none is built.
 */
export interface DmSender {
  send(job: DmJob): void;
}

/** The delay of the event loop while a burst went out, behind an interface so a test can fake it. */
export interface LoopDelayMeter {
  /** Starts measuring from nothing. */
  start(): void;
  /** What was measured since `start`, in milliseconds; zeros when nothing was. */
  read(): { meanMs: number; maxMs: number };
  stop(): void;
}

/** The meter over `monitorEventLoopDelay` of `node:perf_hooks`. */
export function nodeLoopDelay(): LoopDelayMeter {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  // The histogram counts nanoseconds, and holds NaN and such while it has no samples.
  const ms = (nanoseconds: number): number =>
    Number.isFinite(nanoseconds) ? Math.round(nanoseconds / 1e4) / 100 : 0;
  return {
    start() {
      histogram.reset();
      histogram.enable();
    },
    read: () =>
      histogram.count === 0
        ? { meanMs: 0, maxMs: 0 }
        : { meanMs: ms(histogram.mean), maxMs: ms(histogram.max) },
    stop() {
      histogram.disable();
    },
  };
}

/**
 * How many direct messages are started in a second: the starting value (Matt, 2026-10-12).
 * Discord's global limit for a bot is 50 requests a second, and a first message to a member is
 * two requests; this leaves the rest to the posts, the answers and the lookups.
 */
export const DM_RATE_PER_SECOND = 10;
/** As many sends as may be on their way at once (spec 6.4: "concurrency ~5"). */
export const DM_CONCURRENCY = 5;
/**
 * As many messages as may wait. At ten a second that is over a quarter of an hour of sending,
 * more than most messages are worth waiting for; beyond it the least urgent, oldest goes.
 */
export const DM_MAX_DEPTH = 10_000;
/**
 * How long nothing is started after Discord refused to open another DM channel
 * (`slow-down`): it limits how fast a bot may write to members it has not written to before,
 * and says neither the limit nor how long to wait.
 */
export const DM_SLOW_DOWN_MS = 60_000;
/**
 * How long a member whom a send found closed (they take no direct messages) is not written to
 * again: their later messages are counted as closed without asking Discord. An hour: most who
 * take none never do, and one who opens up hears of the next event after that.
 */
export const DM_CLOSED_MS = 60 * 60_000;
/** As many such members as are remembered at once; the one found longest ago goes first. */
export const DM_CLOSED_MEMBERS = 10_000;
/** While a burst lasts, its numbers so far are logged this often. */
const REPORT_EVERY_MS = 60_000;
/**
 * As many messages as one pull drops without sending (expired, or for a member known to take
 * none) before it gives the event loop back.
 */
const EXPIRED_PER_PULL = 200;
/** As many delivery times as are kept for the median of a burst; the worst is kept apart. */
const MAX_SAMPLES = 10_000;
/** As many failed sends of a burst as are logged one by one; the rest are only counted. */
const FAILURES_LOGGED = 5;

export interface QueuedDmSenderOptions {
  gateway: DmGateway;
  log: Logger;
  now?: () => number;
  ratePerSecond?: number;
  concurrency?: number;
  maxDepth?: number;
  /** As many members who take no direct messages as are remembered. Default `DM_CLOSED_MEMBERS`. */
  maxClosed?: number;
  reportEveryMs?: number;
  loopDelay?: LoopDelayMeter;
  /**
   * Starts the timer that pulls the queue every `ms` and gives the function that stops it.
   * Default: `setInterval`, unref'd. A test passes its own and calls `pull()` by hand.
   */
  startTimer?: (run: () => void, ms: number) => () => void;
}

/** A queue of one priority: appended at the end, taken from the head, oldest event first. */
class Line {
  private jobs: DmJob[] = [];
  private head = 0;

  get size(): number {
    return this.jobs.length - this.head;
  }

  peek(): DmJob | undefined {
    return this.jobs[this.head];
  }

  take(): DmJob | undefined {
    const job = this.jobs[this.head];
    if (job === undefined) return undefined;
    this.head += 1;
    // The part that was taken is cut off now and then, so that taking stays cheap.
    if (this.head >= 1_024 && this.head * 2 >= this.jobs.length) {
      this.jobs = this.jobs.slice(this.head);
      this.head = 0;
    }
    return job;
  }

  /**
   * Takes the first job that `passOver` does not pass over, looking at `most` jobs at most; the
   * jobs passed over keep their places.
   */
  takeFirst(passOver: (job: DmJob) => boolean, most: number): DmJob | undefined {
    const end = Math.min(this.jobs.length, this.head + most);
    for (let at = this.head; at < end; at++) {
      const job = this.jobs[at];
      if (job === undefined || passOver(job)) continue;
      if (at === this.head) return this.take();
      this.jobs.splice(at, 1);
      return job;
    }
    return undefined;
  }

  /** Puts a job where its event belongs: behind every job whose event is not newer. */
  put(job: DmJob): void {
    const last = this.jobs.at(-1);
    if (this.size === 0 || last === undefined || last.eventAt <= job.eventAt) {
      this.jobs.push(job);
      return;
    }
    let low = this.head;
    let high = this.jobs.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((this.jobs[middle]?.eventAt ?? 0) <= job.eventAt) low = middle + 1;
      else high = middle;
    }
    this.jobs.splice(low, 0, job);
  }

  clear(): number {
    const dropped = this.size;
    this.jobs = [];
    this.head = 0;
    return dropped;
  }
}

/** The numbers of a burst: from the first message put in line until the line ran empty. */
interface Burst {
  startedAt: number;
  queued: number;
  sent: number;
  closed: number;
  failed: number;
  /** Of the failed: those Discord answered with "slow down". */
  slowedDown: number;
  saidSlow: boolean;
  expired: number;
  overflowed: number;
  deepest: number;
  samples: number[];
  worstMs: number;
  saidFull: boolean;
  reportedAt: number;
}

/**
 * The sender on the bot's own client: a queue on the main thread, pulled by a timer.
 *
 * `send` puts a job in line and returns. Every `1000 / ratePerSecond` milliseconds the timer
 * starts at most one send, the most urgent first and within one priority the oldest event
 * first, unless `concurrency` sends are still on their way: so no more than the rate goes out
 * however long the line is, and nothing here ever loops over a line of recipients. (The legacy
 * bot once lost its gateway connection sending a popular want in one go on the main thread.)
 * A member's messages go one at a time: while a send to them is on its way, their next message
 * waits and those of others go past it (within the first `EXPIRED_PER_PULL` of a line), so that
 * a member reads them in their order.
 * A message whose time has passed (`expiresAt`) is dropped when its turn comes. A line longer
 * than `maxDepth` loses its least urgent, oldest message, which is said once per burst. A send
 * that fails is logged and dropped: discord.js has waited out a rate limit by then, and
 * nothing is tried twice. A member whom a send found closed is remembered for `DM_CLOSED_MS`
 * (`DM_CLOSED_MEMBERS` of them at most): a message for one of them is counted as closed when
 * its turn comes and Discord is not asked, which would be two requests for nothing. When Discord refuses to open more DM channels (`slow-down`) that
 * message is dropped too and nothing is started for `DM_SLOW_DOWN_MS`; what waits meanwhile
 * expires by itself when its time passes.
 *
 * A burst is the time from the first message in an empty line until the line is empty and
 * nothing is on its way. When it ends, and every minute while it lasts, one line is logged
 * with what the measurements for a second token need: how many were sent, closed (the member
 * takes no direct messages), failed and dropped, the deepest line, the time from event to
 * delivery (median and worst) and the delay of the event loop.
 */
export class QueuedDmSender implements DmSender {
  private readonly lines = new Map<DmPriority, Line>(
    PRIORITIES.map((priority) => [priority, new Line()]),
  );
  private readonly now: () => number;
  private readonly concurrency: number;
  private readonly maxDepth: number;
  private readonly intervalMs: number;
  private readonly reportEveryMs: number;
  private readonly loopDelay: LoopDelayMeter;
  private readonly startTimer: (run: () => void, ms: number) => () => void;
  private stopTimer: (() => void) | undefined;
  private burst: Burst | undefined;
  private readonly onTheirWay = new Set<Promise<void>>();
  /** How many sends are on their way to each member (`next` passes their other messages over). */
  private readonly busy = new Map<string, number>();
  /** Resolved when the burst that is running ends; `drain` waits for it. */
  private ended: { promise: Promise<void>; resolve: () => void } | undefined;
  private closed = false;
  /** Until when nothing is started, after Discord said to slow down. */
  private pausedUntil = 0;
  /** Set while `drain` waits: called when a pause begins, so that it looks again. */
  private onPause: (() => void) | undefined;
  /** The members a send found closed, with the time until which they are not written to. */
  private readonly closedUntil: BoundedMap<string, number>;

  constructor(private readonly options: QueuedDmSenderOptions) {
    this.now = options.now ?? (() => Date.now());
    this.concurrency = options.concurrency ?? DM_CONCURRENCY;
    this.maxDepth = options.maxDepth ?? DM_MAX_DEPTH;
    this.closedUntil = new BoundedMap(options.maxClosed ?? DM_CLOSED_MEMBERS);
    this.intervalMs = Math.max(
      1,
      Math.round(1_000 / (options.ratePerSecond ?? DM_RATE_PER_SECOND)),
    );
    this.reportEveryMs = options.reportEveryMs ?? REPORT_EVERY_MS;
    this.loopDelay = options.loopDelay ?? nodeLoopDelay();
    this.startTimer =
      options.startTimer ??
      ((run, ms) => {
        const timer = setInterval(run, ms);
        timer.unref();
        return () => {
          clearInterval(timer);
        };
      });
  }

  /** How many messages wait. */
  get depth(): number {
    let depth = 0;
    for (const line of this.lines.values()) depth += line.size;
    return depth;
  }

  /** How many sends are on their way. */
  get sending(): number {
    return this.onTheirWay.size;
  }

  /** Whether nothing waits and nothing is on its way. */
  get idle(): boolean {
    return this.burst === undefined;
  }

  send(job: DmJob): void {
    try {
      this.enqueue(job);
    } catch (err) {
      this.options.log.error({ err }, 'could not put a direct message in line');
    }
  }

  private enqueue(job: DmJob): void {
    // After `drain` the client is about to go: nothing new is taken.
    if (this.closed) return;
    const burst = this.burst ?? this.begin();
    const line = this.lines.get(job.priority) ?? this.lines.get(DM_PRIORITY.normal);
    if (!line) return;
    line.put(job);
    burst.queued += 1;
    if (this.depth > this.maxDepth) this.overflow(burst);
    burst.deepest = Math.max(burst.deepest, this.depth);
  }

  /** Drops the least urgent, oldest message of a line that is too long. */
  private overflow(burst: Burst): void {
    for (const priority of [...PRIORITIES].reverse()) {
      if (this.lines.get(priority)?.take() === undefined) continue;
      burst.overflowed += 1;
      if (!burst.saidFull) {
        burst.saidFull = true;
        this.options.log.warn(
          { depth: this.depth, maxDepth: this.maxDepth },
          'the line of direct messages is full; the least urgent, oldest are dropped',
        );
      }
      return;
    }
  }

  private begin(): Burst {
    const now = this.now();
    this.burst = {
      startedAt: now,
      queued: 0,
      sent: 0,
      closed: 0,
      failed: 0,
      slowedDown: 0,
      saidSlow: false,
      expired: 0,
      overflowed: 0,
      deepest: 0,
      samples: [],
      worstMs: 0,
      saidFull: false,
      reportedAt: now,
    };
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.ended = { promise, resolve };
    this.loopDelay.start();
    this.stopTimer = this.startTimer(() => {
      this.pull();
    }, this.intervalMs);
    return this.burst;
  }

  /** The numbers of the burst so far, as they are logged. */
  private numbers(burst: Burst) {
    const sorted = [...burst.samples].sort((a, b) => a - b);
    const loop = this.loopDelay.read();
    return {
      queued: burst.queued,
      sent: burst.sent,
      closed: burst.closed,
      failed: burst.failed,
      slowedDown: burst.slowedDown,
      expired: burst.expired,
      overflowed: burst.overflowed,
      waiting: this.depth,
      deepest: burst.deepest,
      tookMs: this.now() - burst.startedAt,
      deliveryMedianMs: sorted[sorted.length >> 1] ?? 0,
      deliveryWorstMs: burst.worstMs,
      loopDelayMeanMs: loop.meanMs,
      loopDelayMaxMs: loop.maxMs,
    };
  }

  private finish(): void {
    const burst = this.burst;
    if (!burst || this.depth > 0 || this.onTheirWay.size > 0) return;
    const { log } = this.options;
    // Whatever fails here, the burst ends: `drain` waits for it, and the timer must stop.
    try {
      log.info(this.numbers(burst), 'direct messages sent');
    } catch (err) {
      log.error({ err }, 'could not log the numbers of a burst of direct messages');
    }
    this.burst = undefined;
    const ended = this.ended;
    this.ended = undefined;
    try {
      this.stopTimer?.();
      this.loopDelay.stop();
    } catch (err) {
      log.error({ err }, 'could not stop the timer of the direct messages');
    }
    this.stopTimer = undefined;
    ended?.resolve();
  }

  /** `finish` for where nothing may be thrown: the end of a pull, and of a send. */
  private finishSafely(): void {
    try {
      this.finish();
    } catch (err) {
      this.options.log.error({ err }, 'could not end a burst of direct messages');
    }
  }

  /** Whether a send found this member closed less than `DM_CLOSED_MS` ago. */
  private knownClosed(userId: string, now: number): boolean {
    const until = this.closedUntil.get(userId);
    if (until === undefined) return false;
    if (until > now) return true;
    this.closedUntil.delete(userId);
    return false;
  }

  /** Remembers a member a send found closed, and frees those whose hour has passed. */
  private rememberClosed(userId: string): void {
    const now = this.now();
    // Set in the order of their times: the stale ones are the oldest.
    this.closedUntil.dropWhile((until) => until <= now);
    this.closedUntil.set(userId, now + DM_CLOSED_MS);
  }

  /**
   * The next message that is still worth sending, the most urgent first; the expired go, and
   * those for a member known to take none are counted as closed.
   */
  private next(burst: Burst, now: number): DmJob | undefined {
    let dropped = 0;
    // A member with a send on its way is passed over (a message still worth sending): their
    // messages go one after the other, in their order (a second DM never overtakes the first).
    const passOver = (job: DmJob): boolean =>
      job.expiresAt > now && (this.busy.get(job.userId) ?? 0) > 0;
    for (const priority of PRIORITIES) {
      const line = this.lines.get(priority);
      const take = () => line?.takeFirst(passOver, EXPIRED_PER_PULL);
      for (let job = take(); job !== undefined; job = take()) {
        if (job.expiresAt <= now) burst.expired += 1;
        else if (this.knownClosed(job.userId, now)) burst.closed += 1;
        else return job;
        dropped += 1;
        // A long line of such messages is not walked in one turn: the next pull goes on.
        if (dropped >= EXPIRED_PER_PULL) return undefined;
      }
    }
    return undefined;
  }

  /**
   * One turn of the timer: starts at most one send, when fewer than `concurrency` are on
   * their way. Never throws. A test with its own timer calls this.
   */
  pull(): void {
    const burst = this.burst;
    if (!burst) return;
    try {
      const now = this.now();
      if (now - burst.reportedAt >= this.reportEveryMs) {
        burst.reportedAt = now;
        this.options.log.info(this.numbers(burst), 'direct messages are going out');
      }
      if (now >= this.pausedUntil && this.onTheirWay.size < this.concurrency) {
        const job = this.next(burst, now);
        if (job) this.start(burst, job);
      }
    } catch (err) {
      this.options.log.error({ err }, 'the line of direct messages failed');
    }
    this.finishSafely();
  }

  private start(burst: Burst, job: DmJob): void {
    const { gateway, log } = this.options;
    // Started in this very turn: the pull that took the job is the pull that sends it.
    let asked: Promise<DmOutcome>;
    try {
      asked = gateway.send(job.userId, job.message);
    } catch (err) {
      asked = Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const sending: Promise<void> = asked
      .then((outcome) => {
        if (outcome === 'closed') {
          burst.closed += 1;
          this.rememberClosed(job.userId);
          log.debug({ user: job.userId }, 'a member takes no direct messages');
          return;
        }
        if (outcome === 'slow-down') {
          // Dropped like a failure, and not tried again: what waits has its own time to expire.
          burst.failed += 1;
          burst.slowedDown += 1;
          this.pausedUntil = this.now() + DM_SLOW_DOWN_MS;
          this.onPause?.();
          if (!burst.saidSlow) {
            burst.saidSlow = true;
            log.warn(
              { user: job.userId, pauseMs: DM_SLOW_DOWN_MS, waiting: this.depth },
              'Discord says to slow down with direct messages; pausing',
            );
          }
          return;
        }
        burst.sent += 1;
        const took = Math.max(0, this.now() - job.eventAt);
        burst.worstMs = Math.max(burst.worstMs, took);
        if (burst.samples.length < MAX_SAMPLES) burst.samples.push(took);
      })
      .catch((err: unknown) => {
        burst.failed += 1;
        if (burst.failed <= FAILURES_LOGGED) {
          log.warn({ err, user: job.userId }, 'could not send a direct message');
        }
      })
      .finally(() => {
        this.onTheirWay.delete(sending);
        const left = (this.busy.get(job.userId) ?? 1) - 1;
        if (left > 0) this.busy.set(job.userId, left);
        else this.busy.delete(job.userId);
        // Nothing may be thrown here: nobody waits for this promise but `drain`.
        this.finishSafely();
      });
    this.onTheirWay.add(sending);
    this.busy.set(job.userId, (this.busy.get(job.userId) ?? 0) + 1);
  }

  /**
   * For shutdown: goes on sending at the usual rate for `maxMs` at most, also for a burst that
   * begins meanwhile, then drops what still waits (how many is logged) and waits for the sends
   * that are on their way. Nothing is taken from then on. While Discord's "slow down" pauses
   * the line for longer than the time that is left, nothing more would go out: it does not wait
   * for that.
   */
  async drain(maxMs: number): Promise<void> {
    // The time of the timer below, not `now`: a test's clock may stand still.
    const until = performance.now() + maxMs;
    for (let left = maxMs; this.ended && left > 0; left = until - performance.now()) {
      if (this.pausedUntil - this.now() >= left) break;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.ended.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, left);
        }),
        new Promise<void>((resolve) => {
          this.onPause = resolve;
        }),
      ]);
      clearTimeout(timer);
    }
    this.onPause = undefined;
    this.closed = true;
    let abandoned = 0;
    for (const line of this.lines.values()) abandoned += line.clear();
    if (abandoned > 0) {
      this.options.log.warn({ abandoned }, 'direct messages were still waiting at shutdown');
    }
    await Promise.all(this.onTheirWay);
    this.finishSafely();
  }
}
