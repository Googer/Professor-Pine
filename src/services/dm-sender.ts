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
   * The server the message is of (its snowflake), or null for what is the instance's (the
   * owner's DMs) (plan 19B-5): within a priority the queue takes turns between servers, the
   * instance being one more, and caps each server's messages to members never written to.
   */
  serverId: string | null;
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

/**
 * The members Pine has written to before (plan 19B-5; the table `DmContact`,
 * `DmContactRepository`): a message to anybody else opens a new DM channel, and Discord limits
 * how many of those a bot opens.
 */
export interface DmContacts {
  /** Which of these members Pine has written to before. */
  known(userIds: readonly string[]): Promise<ReadonlySet<string>>;
  /** Records that a message went to this member; nothing when it is recorded already. */
  add(userId: string, at: number): Promise<void>;
}

/**
 * How many messages to members never written to each server may start in a window (plan
 * 19B-5; the settings `dms.firstContactsPerWindow` and `dms.firstContactWindowMinutes`).
 */
export interface FirstContactCap {
  perWindow: number;
  windowMs: number;
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
/**
 * As many members as are remembered as written to before or not (plan 19B-5), read from
 * `DmContacts` as their messages come: twice the deepest line, so that the members of what
 * waits stay known; one forgotten is only read again.
 */
export const DM_CONTACTS_KEPT = 20_000;
/** As many members as one read of `DmContacts` asks about. */
const CONTACTS_PER_READ = 100;
/**
 * How long a read of `DmContacts` may take before it is taken for one that failed (its members
 * as never written to) and the next read starts: one that hangs would hold every read after it,
 * and so every server's messages to members not read yet. Its late answer is not used.
 */
const CONTACTS_READ_MS = 10_000;
/**
 * How long a record of a member written to (`DmContacts.add`) may take before it is counted as
 * one that failed: the send waits for it, and one that hangs would hold a send's place for good.
 */
const CONTACT_RECORD_MS = 10_000;
/** While a burst lasts, its numbers so far are logged this often. */
const REPORT_EVERY_MS = 60_000;
/**
 * As many messages as one pull drops (expired, or for a member known to take none) before it
 * gives the event loop back, over every server's line: the next pull goes on.
 */
const DROPPED_PER_PULL = 200;
/**
 * As many messages of one line as one pull passes over as waiting (a send to their member is on
 * its way, or their member is not read yet) before it goes on to the next line (plan 19B-5).
 * Waits use up nothing else: a server whose messages wait never ends the pull for the others,
 * nor for the next priority.
 */
const WAITS_PER_LINE = 20;
/** The key in the turns of what is the instance's (`serverId` null): no snowflake is empty. */
const INSTANCE = '';
/** The key of a message's server in the turns: its snowflake, or `INSTANCE`. */
const serverOf = (job: DmJob): string => job.serverId ?? INSTANCE;

/**
 * What a pull does with a message it looks at: sends it, leaves it in its place (`wait`: a send
 * to the member is on its way, or the member is not read yet), or drops it (`expired`,
 * `closed`).
 */
type Verdict = 'send' | 'wait' | 'expired' | 'closed';
/** How many more messages a pull may drop. */
interface Budget {
  left: number;
}
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
  /**
   * The members written to before (plan 19B-5). Without it every member counts as written to:
   * nothing is capped or recorded (tests of the rest).
   */
  contacts?: DmContacts;
  /** The cap of each server's messages to members never written to; none unless set. */
  firstContacts?: FirstContactCap;
  /** As many members as are remembered as written to or not. Default `DM_CONTACTS_KEPT`. */
  maxContacts?: number;
  reportEveryMs?: number;
  loopDelay?: LoopDelayMeter;
  /**
   * Starts the timer that pulls the queue every `ms` and gives the function that stops it.
   * Default: `setInterval`, unref'd. A test passes its own and calls `pull()` by hand.
   */
  startTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * The messages of one server and priority: appended at the end, taken from the head, oldest
 * event first.
 */
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
   * Walks the line from its head while `budget` lasts (one for each job dropped) and until
   * `WAITS_PER_LINE` jobs waited: a job `look` says waits keeps its place, one it drops is taken
   * out and handed to `drop`, and the first it says to send is taken out and given.
   */
  takeFirst(
    look: (job: DmJob) => Verdict,
    budget: Budget,
    drop: (job: DmJob, why: 'expired' | 'closed') => void,
  ): DmJob | undefined {
    let at = this.head;
    let waited = 0;
    while (at < this.jobs.length && budget.left > 0 && waited < WAITS_PER_LINE) {
      const job = this.jobs[at];
      if (job === undefined) break;
      const verdict = look(job);
      if (verdict === 'wait') {
        waited += 1;
        at += 1;
        continue;
      }
      if (at === this.head) {
        this.take();
        at = this.head;
      } else this.jobs.splice(at, 1);
      if (verdict === 'send') return job;
      budget.left -= 1;
      drop(job, verdict);
    }
    return undefined;
  }

  /**
   * Drops the jobs at the head that `stale` says are not worth sending, while `budget` lasts,
   * handing them to `drop`; stops at the first that is.
   */
  dropStale(
    stale: (job: DmJob) => 'expired' | 'closed' | undefined,
    budget: Budget,
    drop: (job: DmJob, why: 'expired' | 'closed') => void,
  ): void {
    while (budget.left > 0) {
      const job = this.peek();
      const why = job && stale(job);
      if (job === undefined || why === undefined) return;
      this.take();
      budget.left -= 1;
      drop(job, why);
    }
  }

  /** Takes out the jobs `which` picks, in their order. */
  extract(which: (job: DmJob) => boolean): DmJob[] {
    const picked: DmJob[] = [];
    const kept: DmJob[] = [];
    for (let at = this.head; at < this.jobs.length; at++) {
      const job = this.jobs[at];
      if (job === undefined) continue;
      if (which(job)) picked.push(job);
      else kept.push(job);
    }
    if (picked.length > 0) {
      this.jobs = kept;
      this.head = 0;
    }
    return picked;
  }

  /** Whether any job waiting here is one `which` picks. */
  some(which: (job: DmJob) => boolean): boolean {
    for (let at = this.head; at < this.jobs.length; at++) {
      const job = this.jobs[at];
      if (job !== undefined && which(job)) return true;
    }
    return false;
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

/**
 * The messages of one server and priority, in two lines (plan 19B-5): `known`, to members
 * written to before (and every message of the instance, and all of them without `DmContacts`),
 * and `unsure`, to members never written to or not read yet. A member's messages move to
 * `known` when a read or a send finds them written to, keeping their order. While the server
 * may open no new DM channel, `unsure` is not walked (only what expired at its head goes), and
 * `known` goes on.
 */
class ServerLines {
  readonly known = new Line();
  readonly unsure = new Line();

  get size(): number {
    return this.known.size + this.unsure.size;
  }

  /**
   * The next message of this server: from the line whose head is the older event first, the
   * other next; `unsure` only when `held` says the server may open DM channels (asked only
   * while that line has a message), else only its stale head is dropped.
   */
  takeFirst(
    look: (job: DmJob, known: boolean) => Verdict,
    stale: (job: DmJob) => 'expired' | 'closed' | undefined,
    budget: Budget,
    drop: (job: DmJob, why: 'expired' | 'closed') => void,
    held: () => boolean,
  ): DmJob | undefined {
    const known = this.known.peek();
    const unsure = this.unsure.peek();
    const isHeld = unsure !== undefined && held();
    if (isHeld) this.unsure.dropStale(stale, budget, drop);
    const order: Line[] =
      unsure === undefined || isHeld
        ? [this.known]
        : known === undefined || unsure.eventAt < known.eventAt
          ? [this.unsure, this.known]
          : [this.known, this.unsure];
    for (const line of order) {
      if (budget.left <= 0) break;
      const isKnown = line === this.known;
      const job = line.takeFirst((one) => look(one, isKnown), budget, drop);
      if (job) return job;
    }
    return undefined;
  }

  /** Takes the oldest message of the two lines (for a full queue). */
  takeOldest(): DmJob | undefined {
    const known = this.known.peek();
    const unsure = this.unsure.peek();
    if (unsure !== undefined && (known === undefined || unsure.eventAt < known.eventAt)) {
      return this.unsure.take();
    }
    return this.known.take();
  }

  clear(): number {
    return this.known.clear() + this.unsure.clear();
  }
}

/**
 * The messages of one priority (plan 19B-5): a server's lines per server, the instance's one
 * more, served in turns, so that one server's burst waits behind the others' messages rather
 * than in front of them. Only servers with a message waiting have lines; a server that comes
 * gets its turn after those waiting already.
 */
class Turns {
  /** In the order of the turns: the first is looked at next. */
  private readonly lines = new Map<string, ServerLines>();

  /** Puts a message in its server's `known` line, or its `unsure` one. */
  put(server: string, job: DmJob, known: boolean): void {
    let lines = this.lines.get(server);
    if (!lines) {
      lines = new ServerLines();
      this.lines.set(server, lines);
    }
    (known ? lines.known : lines.unsure).put(job);
  }

  /**
   * The next message to send: server by server from the one whose turn it is, until one has a
   * message to send or the budget of drops is spent. Every server looked at goes to the back of
   * the turns, also one that had nothing to send now. `held` says whether a server may open no
   * new DM channel now.
   */
  take(
    look: (job: DmJob, known: boolean) => Verdict,
    stale: (job: DmJob) => 'expired' | 'closed' | undefined,
    budget: Budget,
    drop: (job: DmJob, why: 'expired' | 'closed') => void,
    held: (server: string) => boolean,
  ): DmJob | undefined {
    for (let servers = this.lines.size; servers > 0 && budget.left > 0; servers--) {
      const first = this.lines.entries().next();
      if (first.done === true) return undefined;
      const [server, lines] = first.value;
      this.lines.delete(server);
      const job = lines.takeFirst(look, stale, budget, drop, () => held(server));
      if (lines.size > 0) this.lines.set(server, lines);
      if (job) return job;
    }
    return undefined;
  }

  /** Takes a server's oldest message (for a full queue). */
  takeOldest(server: string): DmJob | undefined {
    const lines = this.lines.get(server);
    const job = lines?.takeOldest();
    if (lines?.size === 0) this.lines.delete(server);
    return job;
  }

  /** Moves the messages of members found written to from `unsure` to `known`, in their order. */
  promote(written: (userId: string) => boolean): void {
    for (const lines of this.lines.values()) {
      if (lines.unsure.size === 0) continue;
      for (const job of lines.unsure.extract((one) => written(one.userId))) lines.known.put(job);
    }
  }

  /** Every server's lines, in the order of the turns. */
  servers(): IterableIterator<[string, ServerLines]> {
    return this.lines.entries();
  }

  clear(): number {
    let dropped = 0;
    for (const lines of this.lines.values()) dropped += lines.clear();
    this.lines.clear();
    return dropped;
  }
}

/** When a server's messages to members never written to were started, oldest first. */
class Window {
  private times: number[] = [];
  private head = 0;

  /** How many were started after `since`; those before it are forgotten. */
  countAfter(since: number): number {
    while (this.head < this.times.length && (this.times[this.head] ?? 0) <= since) this.head += 1;
    if (this.head >= 1_024 && this.head * 2 >= this.times.length) {
      this.times = this.times.slice(this.head);
      this.head = 0;
    }
    return this.times.length - this.head;
  }

  add(at: number): void {
    this.times.push(at);
  }

  /**
   * When fewer than `perWindow` were started in the window again: when the one that must leave
   * it for that, started at a time of the window, does (a window of `windowMs` ending at `now`).
   * `now` when fewer were started already; never with a cap of none.
   */
  freesAt(now: number, perWindow: number, windowMs: number): number {
    if (perWindow <= 0) return Infinity;
    const count = this.countAfter(now - windowMs);
    if (count < perWindow) return now;
    return (this.times[this.head + count - perWindow] ?? now) + windowMs;
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
  /** Messages started to members never written to. */
  firstContacts: number;
  /** Members a message went to whom `contacts` could not record as written to. */
  contactsNotRecorded: number;
  saidNotRecorded: boolean;
  /** The servers whose cap of first messages was said to be reached. */
  saidCapped: Set<string>;
}

/**
 * The sender on the bot's own client: a queue on the main thread, pulled by a timer.
 *
 * `send` puts a job in line and returns. Every `1000 / ratePerSecond` milliseconds the timer
 * starts at most one send, the most urgent first, within one priority the servers in turns
 * (the instance's messages one more server; plan 19B-5) and within one server the oldest event
 * first, unless `concurrency` sends are still on their way: so no more than the rate goes out
 * however long the line is, and nothing here ever loops over a line of recipients. (The legacy
 * bot once lost its gateway connection sending a popular want in one go on the main thread.)
 * A member's messages go one at a time: while a send to them is on its way, their next message
 * waits and those of others go past it, so that a member reads them in their order. A pull
 * drops `DROPPED_PER_PULL` messages at most, over the servers' lines, and passes over
 * `WAITS_PER_LINE` waiting messages of one line at most before it goes on to the next.
 * A message whose time has passed (`expiresAt`) is dropped when its turn comes. A line longer
 * than `maxDepth` loses the oldest of the least urgent messages of the server with the most
 * waiting, which is said once per burst. A send
 * that fails is logged and dropped: discord.js has waited out a rate limit by then, and
 * nothing is tried twice. A member whom a send found closed is remembered for `DM_CLOSED_MS`
 * (`DM_CLOSED_MEMBERS` of them at most): a message for one of them is counted as closed when
 * its turn comes and Discord is not asked, which would be two requests for nothing. When
 * Discord refuses to open more DM channels (`slow-down`) that
 * message is dropped too and nothing is started for `DM_SLOW_DOWN_MS`; what waits meanwhile
 * expires by itself when its time passes.
 *
 * The first message to a member opens a DM channel, and Discord limits how many a bot opens
 * (plan 19B-5): with `contacts` and `firstContacts`, each server starts at most `perWindow`
 * messages to members never written to in any `windowMs`, and that server's others to new
 * members wait in their places for the window (and expire as any message does) while its
 * messages to members written to before go on; the instance's messages are never held back.
 * A server's messages wait in two lines (`ServerLines`): to members written to before, and to
 * the others; while the server is at its cap the second is not walked at all. Whether a member
 * was written to is read from `contacts` in reads of `CONTACTS_PER_READ`, one at a time: the
 * members of messages a pull looked at first, then the others in the order their messages
 * came; it is remembered (`DM_CONTACTS_KEPT` members), and a message waits until its member is
 * known. A read that fails, or has not answered in `CONTACTS_READ_MS`, takes its members as never
 * written to, and the next read starts. A message that went out records its member as written
 * to (a record that fails is counted, `contactsNotRecorded`, and said once per burst); a member
 * found written to has their messages moved to the first line, in their order.
 *
 * A burst is the time from the first message in an empty line until the line is empty and
 * nothing is on its way. When it ends, and every minute while it lasts, one line is logged
 * with what the measurements for a second token need: how many were sent, closed (the member
 * takes no direct messages), failed and dropped, the deepest line, the time from event to
 * delivery (median and worst) and the delay of the event loop.
 */
export class QueuedDmSender implements DmSender {
  private readonly turns = new Map<DmPriority, Turns>(
    PRIORITIES.map((priority) => [priority, new Turns()]),
  );
  /** How many messages wait, in all. */
  private waiting = 0;
  /** How many messages of each server wait, of every priority (servers with none have none). */
  private readonly waitingOf = new Map<string, number>();
  /** Whether a member was written to before (true) or not, as read or learned. */
  private readonly contactKnown: BoundedMap<string, boolean>;
  /** Members to read from `contacts`, in the order their messages came. */
  private readonly toLookUp = new Set<string>();
  /** Members whose messages a pull looked at, read before `toLookUp`. */
  private readonly askedNow = new Set<string>();
  /** Members of the read on its way. */
  private readonly lookingUp = new Set<string>();
  /** The first messages each server started in the window, by server. */
  private readonly firsts = new Map<string, Window>();
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
  /**
   * Set while `drain` waits: called when a pause begins, and when a pull finds nothing to
   * start, so that it looks again whether anything can still go out in its time.
   */
  private wake: (() => void) | undefined;
  /** The members a send found closed, with the time until which they are not written to. */
  private readonly closedUntil: BoundedMap<string, number>;

  constructor(private readonly options: QueuedDmSenderOptions) {
    this.now = options.now ?? (() => Date.now());
    this.concurrency = options.concurrency ?? DM_CONCURRENCY;
    this.maxDepth = options.maxDepth ?? DM_MAX_DEPTH;
    this.closedUntil = new BoundedMap(options.maxClosed ?? DM_CLOSED_MEMBERS);
    this.contactKnown = new BoundedMap(options.maxContacts ?? DM_CONTACTS_KEPT);
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
    return this.waiting;
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
    const turns = this.turns.get(job.priority) ?? this.turns.get(DM_PRIORITY.normal);
    if (!turns) return;
    const server = serverOf(job);
    const known =
      job.serverId === null || !this.options.contacts || this.contactKnown.get(job.userId) === true;
    turns.put(server, job, known);
    this.waiting += 1;
    this.waitingOf.set(server, (this.waitingOf.get(server) ?? 0) + 1);
    burst.queued += 1;
    // Read ahead whether its member was written to (the next pull asks, many at once).
    if (!known) this.toRead(job.userId);
    if (this.waiting > this.maxDepth) this.overflow(burst);
    burst.deepest = Math.max(burst.deepest, this.waiting);
  }

  /** Counts a message out of the line, whatever became of it. */
  private taken(job: DmJob): void {
    const server = serverOf(job);
    this.waiting -= 1;
    const left = (this.waitingOf.get(server) ?? 1) - 1;
    if (left > 0) this.waitingOf.set(server, left);
    else this.waitingOf.delete(server);
  }

  /**
   * Drops a message of a line that is too long: the oldest of the least urgent of the server
   * with the most waiting (on a tie, the one whose messages have waited longest), so that one
   * server's burst loses its own messages before another's.
   */
  private overflow(burst: Burst): void {
    let fullest: string | undefined;
    let most = 0;
    for (const [server, count] of this.waitingOf) {
      if (count > most) {
        fullest = server;
        most = count;
      }
    }
    if (fullest === undefined) return;
    for (const priority of [...PRIORITIES].reverse()) {
      const job = this.turns.get(priority)?.takeOldest(fullest);
      if (job === undefined) continue;
      this.taken(job);
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
      firstContacts: 0,
      contactsNotRecorded: 0,
      saidNotRecorded: false,
      saidCapped: new Set(),
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
      firstContacts: burst.firstContacts,
      contactsNotRecorded: burst.contactsNotRecorded,
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
    // The windows of servers that sent no first message for a while are forgotten.
    const now = this.now();
    for (const server of [...this.firsts.keys()]) this.firstsOf(server, now);
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
   * The next message that is still worth sending, the most urgent first and within a priority
   * the servers in turns; the expired go, and those for a member known to take none are counted
   * as closed. A long line of such messages is not walked in one turn (`DROPPED_PER_PULL`), nor
   * of messages that wait (`WAITS_PER_LINE`): the next pull goes on.
   */
  private next(burst: Burst, now: number): DmJob | undefined {
    const budget: Budget = { left: DROPPED_PER_PULL };
    const stale = (job: DmJob): 'expired' | 'closed' | undefined => {
      if (job.expiresAt <= now) return 'expired';
      if (this.knownClosed(job.userId, now)) return 'closed';
      return undefined;
    };
    const look = (job: DmJob, known: boolean): Verdict => {
      const why = stale(job);
      if (why) return why;
      // A member with a send on its way is passed over (a message still worth sending): their
      // messages go one after the other, in their order (a second DM never overtakes the first).
      if ((this.busy.get(job.userId) ?? 0) > 0) return 'wait';
      return known || this.mayOpen(job, now) ? 'send' : 'wait';
    };
    const drop = (job: DmJob, why: 'expired' | 'closed'): void => {
      this.taken(job);
      if (why === 'expired') burst.expired += 1;
      else burst.closed += 1;
    };
    const held = (server: string): boolean => this.held(burst, server, now);
    for (const priority of PRIORITIES) {
      const job = this.turns.get(priority)?.take(look, stale, budget, drop, held);
      if (job) {
        this.taken(job);
        return job;
      }
      if (budget.left <= 0) return undefined;
    }
    return undefined;
  }

  /**
   * Whether a message to a member not known as written to may open a DM channel now (plan
   * 19B-5): to one never written to while its server started fewer than its cap of such
   * messages in the window. A member not read yet waits for the read, asked for first.
   */
  private mayOpen(job: DmJob, now: number): boolean {
    if (job.serverId === null || !this.options.contacts) return true;
    const known = this.contactKnown.get(job.userId);
    if (known === undefined) {
      this.askNow(job.userId);
      return false;
    }
    const cap = this.options.firstContacts;
    return known || !cap || this.firstsOf(job.serverId, now) < cap.perWindow;
  }

  /**
   * Whether a server started as many first messages in the window as it may (plan 19B-5): its
   * line of members not known as written to waits then. Said once per server and burst.
   */
  private held(burst: Burst, server: string, now: number): boolean {
    const cap = this.options.firstContacts;
    if (!cap || server === INSTANCE || this.firstsOf(server, now) < cap.perWindow) return false;
    if (!burst.saidCapped.has(server)) {
      burst.saidCapped.add(server);
      this.options.log.warn(
        { server, perWindow: cap.perWindow, windowMinutes: Math.round(cap.windowMs / 60_000) },
        'a server opened as many new direct messages as it may; the rest wait',
      );
    }
    return true;
  }

  /**
   * The soonest time anything that waits could start (for `drain`): `now`, unless every message
   * that waits is a first one whose server is at its cap; then when the first such window frees.
   */
  private heldUntil(now: number): number {
    const cap = this.options.firstContacts;
    if (!cap || this.waiting === 0) return now;
    let until = Infinity;
    for (const turns of this.turns.values()) {
      for (const [server, lines] of turns.servers()) {
        if (lines.known.size > 0) return now;
        if (lines.unsure.some((job) => this.contactKnown.get(job.userId) !== false)) return now;
        const window = this.firsts.get(server);
        const frees = window
          ? window.freesAt(now, cap.perWindow, cap.windowMs)
          : cap.perWindow > 0
            ? now
            : Infinity;
        if (frees <= now) return now;
        until = Math.min(until, frees);
      }
    }
    return until;
  }

  /** How many first messages a server started in the window (plan 19B-5). */
  private firstsOf(server: string, now: number): number {
    const cap = this.options.firstContacts;
    const window = this.firsts.get(server);
    if (!cap || !window) return 0;
    const count = window.countAfter(now - cap.windowMs);
    if (count === 0) this.firsts.delete(server);
    return count;
  }

  /**
   * Puts a member in line to be read from `contacts`, unless known or being read. No more than
   * the line of messages holds: when full, the member put in longest ago gives way (their message
   * is the likeliest to have gone, and one still waiting is asked for when a pull looks at it),
   * never the newest, whom a pull may never reach while their server is at its cap.
   */
  private toRead(userId: string): void {
    if (this.contactKnown.has(userId) || this.lookingUp.has(userId)) return;
    if (this.askedNow.has(userId) || this.toLookUp.has(userId)) return;
    if (this.toLookUp.size >= this.maxDepth) {
      const oldest = this.toLookUp.values().next();
      if (!oldest.done) this.toLookUp.delete(oldest.value);
    }
    this.toLookUp.add(userId);
  }

  /** Puts a member whose message a pull looked at first in line to be read (plan 19B-5). */
  private askNow(userId: string): void {
    if (this.contactKnown.has(userId) || this.lookingUp.has(userId)) return;
    this.toLookUp.delete(userId);
    if (this.askedNow.size >= this.maxDepth) return;
    this.askedNow.add(userId);
  }

  /**
   * Starts the next read of `contacts` (`CONTACTS_PER_READ` members: those whose messages a pull
   * looked at first, then the others in the order their messages came), unless one is on its
   * way; when it is answered, the next starts. Never throws.
   */
  private readContacts(): void {
    const { contacts, log } = this.options;
    if (!contacts || this.lookingUp.size > 0) return;
    const batch: string[] = [];
    for (const waiting of [this.askedNow, this.toLookUp]) {
      for (const userId of waiting) {
        if (batch.length >= CONTACTS_PER_READ) break;
        batch.push(userId);
      }
    }
    if (batch.length === 0) return;
    for (const userId of batch) {
      this.askedNow.delete(userId);
      this.toLookUp.delete(userId);
      this.lookingUp.add(userId);
    }
    let answer: Promise<ReadonlySet<string>>;
    try {
      answer = contacts.known(batch);
    } catch (err) {
      answer = Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    // A read that does not answer in its time fails: the next read must not wait for it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const asked = Promise.race([
      answer,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`no answer in ${String(CONTACTS_READ_MS / 1_000)} seconds`));
        }, CONTACTS_READ_MS);
        timer.unref();
      }),
    ]);
    // The late answer of one that timed out, or its failure, is nobody's to handle.
    answer.catch(() => undefined);
    const learn = (isKnown: (userId: string) => boolean): void => {
      // A member found written to by a send meanwhile stays so.
      const written = new Set<string>();
      for (const userId of batch) {
        if (this.contactKnown.get(userId) === true) continue;
        const known = isKnown(userId);
        this.contactKnown.set(userId, known);
        if (known) written.add(userId);
      }
      this.promote(written);
    };
    void asked
      .then(
        (found) => {
          learn((userId) => found.has(userId));
        },
        (err: unknown) => {
          // Taken as never written to: counted against the cap rather than past it.
          log.warn(
            { err, members: batch.length },
            'could not read whom direct messages went to before',
          );
          learn(() => false);
        },
      )
      .finally(() => {
        clearTimeout(timer);
        for (const userId of batch) this.lookingUp.delete(userId);
        try {
          this.readContacts();
        } catch (err) {
          log.error({ err }, 'could not read whom direct messages went to before');
        }
      });
  }

  /**
   * Moves the messages of members found written to before into their servers' first lines,
   * where the cap holds nothing back (plan 19B-5).
   */
  private promote(written: ReadonlySet<string>): void {
    if (written.size === 0) return;
    for (const turns of this.turns.values()) turns.promote((userId) => written.has(userId));
  }

  /**
   * Records a member a message went to as written to (plan 19B-5). Never rejects: a record that
   * fails, or has not answered in `CONTACT_RECORD_MS`, is counted in the burst's numbers and said
   * once per burst (the member is remembered as written to all the same, until forgotten or a
   * restart); the send's place is free again either way.
   */
  private async wroteTo(burst: Burst, userId: string): Promise<void> {
    const contacts = this.options.contacts;
    if (!contacts || this.contactKnown.get(userId) === true) return;
    this.contactKnown.set(userId, true);
    this.promote(new Set([userId]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let recorded: Promise<void>;
      try {
        recorded = contacts.add(userId, this.now());
      } catch (err) {
        recorded = Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
      // The late answer of one that timed out, or its failure, is nobody's to handle.
      recorded.catch(() => undefined);
      await Promise.race([
        recorded,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`no answer in ${String(CONTACT_RECORD_MS / 1_000)} seconds`));
          }, CONTACT_RECORD_MS);
          timer.unref();
        }),
      ]);
    } catch (err) {
      burst.contactsNotRecorded += 1;
      if (!burst.saidNotRecorded) {
        burst.saidNotRecorded = true;
        this.options.log.warn({ err }, 'could not record that a direct message went to a member');
      }
    } finally {
      clearTimeout(timer);
    }
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
      this.readContacts();
      if (now >= this.pausedUntil && this.onTheirWay.size < this.concurrency) {
        const job = this.next(burst, now);
        if (job) this.start(burst, job, now);
        // Nothing to start: a `drain` looks again whether anything can go out in its time.
        else this.wake?.();
      }
    } catch (err) {
      this.options.log.error({ err }, 'the line of direct messages failed');
    }
    this.finishSafely();
  }

  private start(burst: Burst, job: DmJob, now: number): void {
    const { gateway, log } = this.options;
    // A first message counts against its server's cap as it starts: Discord counts the channel
    // it opens, whatever comes of the message.
    if (job.serverId !== null && this.contactKnown.get(job.userId) === false) {
      burst.firstContacts += 1;
      if (this.options.firstContacts) {
        let window = this.firsts.get(job.serverId);
        if (!window) {
          window = new Window();
          this.firsts.set(job.serverId, window);
        }
        window.add(now);
      }
    }
    // Started in this very turn: the pull that took the job is the pull that sends it.
    let asked: Promise<DmOutcome>;
    try {
      asked = gateway.send(job.userId, job.message, job.serverId);
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
          this.wake?.();
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
        // Before the member's next message is looked at: it is not a first one any more.
        return this.wroteTo(burst, job.userId);
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
   * for that, nor while all that waits are first messages their servers' caps hold back for
   * longer (plan 19B-5).
   */
  async drain(maxMs: number): Promise<void> {
    // The time of the timer below, not `now`: a test's clock may stand still.
    const until = performance.now() + maxMs;
    for (let left = maxMs; this.ended && left > 0; left = until - performance.now()) {
      const now = this.now();
      if (Math.max(this.pausedUntil, this.heldUntil(now)) - now >= left) break;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.ended.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, left);
        }),
        new Promise<void>((resolve) => {
          this.wake = resolve;
        }),
      ]);
      clearTimeout(timer);
    }
    this.wake = undefined;
    this.closed = true;
    let abandoned = 0;
    for (const turns of this.turns.values()) abandoned += turns.clear();
    this.waiting = 0;
    this.waitingOf.clear();
    this.toLookUp.clear();
    this.askedNow.clear();
    if (abandoned > 0) {
      this.options.log.warn({ abandoned }, 'direct messages were still waiting at shutdown');
    }
    await Promise.all(this.onTheirWay);
    this.finishSafely();
  }
}
