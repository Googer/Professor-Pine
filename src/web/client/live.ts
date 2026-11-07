/*
 * The map's live connection (design `2026-10-31-map-live-updates-design.md`): Server-Sent Events
 * that say only that a list changed. Pure over its timers and a source, as `Poller`. The page
 * counts itself live only while heartbeats reach it, so a buffering proxy, a blocked stream and a
 * silent drop all end at polling every 20 seconds, which is a normal path: nothing is shown.
 */

/** The lists a stream tells of. */
export type LiveName = 'parties' | 'stop-reports' | 'spawns';

/** The interval of a list that is not live, or whose last answer was no good. */
export const POLL_MS = 20_000;
/** The interval of a list while it is live: what no signal tells of. */
export const LIVE_POLL_MS = 120_000;
/** A page neither reopens its stream nor asks on going live sooner after the last time. */
export const LIVE_FLOOR_MS = 20_000;
/** Silence after which a stream is given up, with pings every 25 seconds. */
export const NOT_LIVE_AFTER_MS = 60_000;

/** The spread of a page that has heard none yet. */
const FIRST_SPREAD_MS = 1_000;
const BACKOFF_FIRST_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
/** The longest delay `setTimeout` takes. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/**
 * How long a list's question may take, ending in the normal failed answer: Cloudflare's 100 seconds
 * and a margin. The paced queue takes one member at a time, about 8 a second at a 120 ms round trip,
 * so this covers about 1,000 cold members ahead of the question.
 */
export const LIST_ASK_LIMIT_MS = 130_000;

/** A list's question's time limit, for `fetch`; none in a browser without `AbortSignal.timeout`. */
export function listAskLimit(): { signal?: AbortSignal } {
  return typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function'
    ? {}
    : { signal: AbortSignal.timeout(LIST_ASK_LIMIT_MS) };
}
/** A moment's ask comes this long after it, for a clock a little behind the server's. */
const AFTER_MOMENT_MS = 1_000;

/** What the connection needs of `EventSource`. */
export interface LiveSource {
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
  onerror: (() => void) | null;
  close(): void;
}

/** The server's stream, or none in a browser without `EventSource`. */
export function liveSource(guild: string): LiveSource | undefined {
  if (typeof EventSource === 'undefined') return undefined;
  return new EventSource(`/s/${guild}/api/live`) as unknown as LiveSource;
}

export interface LiveConnectionDeps {
  /** Opens the stream; undefined where it cannot be. */
  open(): LiveSource | undefined;
  /** Whether the live map is in use (`MapActivity`). */
  active(): boolean;
  now(): number;
  /** From 0 up to 1, as `Math.random`. */
  random(): number;
  setTimer(run: () => void, ms: number): () => void;
  /** A list changed; `spread`: over how long this server's maps spread their asks. */
  changed(list: LiveName, spread: number): void;
  /** Live began or ended; said at once, also when the page was hidden. */
  liveChanged(live: boolean, spread: number): void;
}

/** A `changed` event's data: `parties 4000`; the spread may be missing or unreadable. */
function readChanged(data: unknown): { list: LiveName; spread: number | undefined } | undefined {
  const [list, spread] = String(data).split(' ');
  if (list !== 'parties' && list !== 'stop-reports' && list !== 'spawns') return undefined;
  return { list, spread: readSpread(spread) };
}

function readSpread(text: unknown): number | undefined {
  const spread = Number(text);
  return text !== undefined && text !== '' && Number.isFinite(spread) && spread > 0
    ? spread
    : undefined;
}

/**
 * Keeps the stream: open while the map is in use, closed at every error or a minute of silence and
 * opened again by its own timer, 5 seconds doubling to 5 minutes (random across the whole of that,
 * and at least over the crowd's spread, so that a restart's reconnects spread out), never within
 * `LIVE_FLOOR_MS` of the last opening. The wait starts over only after a stream that stayed live,
 * whose second ping arrived: a proxy that passes one and then buffers does not reset it.
 */
export class LiveConnection {
  private source: LiveSource | undefined;
  private live = false;
  private pings = 0;
  private failures = 0;
  private spread = FIRST_SPREAD_MS;
  private openedAt = -Infinity;
  private retryAt = -Infinity;
  private cancelRetry: (() => void) | undefined;
  private cancelSilence: (() => void) | undefined;
  private ended = false;

  constructor(private readonly deps: LiveConnectionDeps) {}

  get isLive(): boolean {
    return this.live;
  }

  /** The spread the server last sent, by ping or signal. */
  get latestSpread(): number {
    return this.spread;
  }

  start(): void {
    this.activeChanged();
  }

  /** The page was hidden or shown, or the region editor turned on or off. */
  activeChanged(): void {
    if (this.ended) return;
    if (!this.deps.active()) {
      this.cancelRetry?.();
      this.cancelRetry = undefined;
      this.shut();
      return;
    }
    if (!this.source && !this.cancelRetry) this.openWhenDue();
  }

  /** For good: a 401 or a 403 the polling found. */
  stop(): void {
    this.ended = true;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.shut();
  }

  private openWhenDue(): void {
    const wait = Math.max(this.retryAt, this.openedAt + LIVE_FLOOR_MS) - this.deps.now();
    if (wait <= 0) {
      this.open();
      return;
    }
    this.cancelRetry = this.deps.setTimer(() => {
      this.cancelRetry = undefined;
      if (this.deps.active() && !this.ended) this.open();
    }, wait);
  }

  private open(): void {
    const source = this.deps.open();
    if (!source) return;
    this.source = source;
    this.openedAt = this.deps.now();
    this.pings = 0;
    source.addEventListener('ping', ({ data }) => {
      if (source !== this.source) return;
      this.spread = readSpread(data) ?? this.spread;
      this.pings += 1;
      // It stayed live: the next failure starts the wait over.
      if (this.pings === 2) this.failures = 0;
      this.heard();
    });
    source.addEventListener('changed', ({ data }) => {
      if (source !== this.source) return;
      const changed = readChanged(data);
      this.spread = changed?.spread ?? this.spread;
      this.heard();
      if (changed) this.deps.changed(changed.list, this.spread);
    });
    // Closed at every error, or the browser's own retry would run beside the page's.
    source.onerror = () => {
      if (source === this.source) this.failed();
    };
    this.awaitSilence();
  }

  private heard(): void {
    this.awaitSilence();
    if (this.live) return;
    this.live = true;
    this.deps.liveChanged(true, this.spread);
  }

  private awaitSilence(): void {
    this.cancelSilence?.();
    this.cancelSilence = this.deps.setTimer(() => {
      this.cancelSilence = undefined;
      this.failed();
    }, NOT_LIVE_AFTER_MS);
  }

  private failed(): void {
    this.shut();
    const widest = Math.max(BACKOFF_FIRST_MS, this.spread);
    const range = Math.min(BACKOFF_MAX_MS, widest * 2 ** this.failures);
    this.failures += 1;
    this.retryAt = this.deps.now() + this.deps.random() * range;
    if (this.deps.active() && !this.ended) this.openWhenDue();
  }

  /** Closes the stream and drops to not live, synchronously, before anyone reads the interval. */
  private shut(): void {
    this.cancelSilence?.();
    this.cancelSilence = undefined;
    const { source } = this;
    this.source = undefined;
    if (source) {
      source.onerror = null;
      source.close();
    }
    if (!this.live) return;
    this.live = false;
    this.deps.liveChanged(false, this.spread);
  }
}

export interface LiveListDeps {
  poller: {
    setEvery(ms: number): void;
    setEveryScattered(ms: number, scatterMs: number): void;
    signalled(spreadMs: number): void;
    askOnce(floorMs: number, spreadMs: number): void;
  };
  now(): number;
  setTimer(run: () => void, ms: number): () => void;
  /** The server's latest spread (`LiveConnection.latestSpread`), read when a moment comes. */
  spread(): number;
}

/**
 * One list's pace: polled every 2 minutes only while live, its last answer good and not read-only,
 * so that a 429, a 503 or a network failure is not left for 2 minutes; asked once on going live, or
 * a change between the last poll and the stream's open would wait for that poll; scattered over the
 * 20 seconds on going not live; at a signal; at a
 * party's next hatch or end, without which those would wait up to 60 seconds for the store's write.
 * Every ask of a live map waits a random time inside the server's latest spread.
 */
export class LiveList {
  private live = false;
  private ok = true;
  private readOnly = false;
  private cancelMoment: (() => void) | undefined;

  constructor(private readonly deps: LiveListDeps) {}

  /** What the last answer was: good, and whether its list is read-only. */
  answered(ok: boolean, readOnly: boolean): void {
    this.ok = ok;
    this.readOnly = readOnly;
    this.pace();
  }

  setLive(live: boolean, spread: number): void {
    this.live = live;
    if (live) {
      this.pace();
      this.deps.poller.askOnce(LIVE_FLOOR_MS, spread);
      return;
    }
    // A restart drops every stream together: never asked at once, but scattered as polling is.
    this.deps.poller.setEveryScattered(POLL_MS, Math.max(spread, POLL_MS));
  }

  signal(spread: number): void {
    this.deps.poller.signalled(spread);
  }

  /** The list's next hatch or end, after whose moment it is asked for again; one timer. */
  atNext(moment: number | undefined): void {
    this.cancelMoment?.();
    this.cancelMoment = undefined;
    if (moment === undefined) return;
    const wait = moment - this.deps.now() + AFTER_MOMENT_MS;
    this.cancelMoment = this.deps.setTimer(
      () => {
        this.cancelMoment = undefined;
        if (this.live) this.deps.poller.signalled(this.deps.spread());
      },
      Math.min(wait, MAX_TIMER_MS),
    );
  }

  private pace(): void {
    this.deps.poller.setEvery(this.live && this.ok && !this.readOnly ? LIVE_POLL_MS : POLL_MS);
  }
}
