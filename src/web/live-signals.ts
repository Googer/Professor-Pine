/**
 * The hub of the map's live updates (design `2026-10-31-map-live-updates-design.md`): who has a
 * stream open, and what they are told, which is only that a list of their server changed. Pure over
 * the timers, the clock and the random it is given. Every listener's method here decides and returns
 * and never throws: `PartyStore.onChange` and the other sources call them synchronously.
 */

/** The lists a stream tells of: `/api/parties`, `/api/stop-reports` and `/api/spawns`. */
export type LiveList = 'parties' | 'stop-reports' | 'spawns';

const LISTS: readonly LiveList[] = ['parties', 'stop-reports', 'spawns'];

/** A heartbeat, well inside Cloudflare's 100 seconds. */
export const LIVE_PING_MS = 25_000;
/** How long a stream lasts: its reconnect is what asks the session and membership again. */
export const LIVE_LIFETIME_MS = 30 * 60_000;
/** The most added to that at random. */
export const LIVE_LIFETIME_JITTER_MS = 5 * 60_000;
/** How long a party's change waits for its post to be drawn before it is signaled anyway. */
export const LIVE_PENDING_MS = 1_500;
export const MAX_LIVE_PER_ADDRESS = 8;
export const MAX_LIVE_PER_MEMBER = 4;
export const MAX_LIVE_STREAMS = 2_000;

const WINDOW_MIN_MS = 5_000;
const WINDOW_MAX_MS = 20_000;
/** One second of window per 10 open streams. */
const WINDOW_MS_PER_STREAM = 100;
const SPREAD_MIN_MS = 1_000;
const SPREAD_MAX_MS = 20_000;
/**
 * One second of spread per 20 open streams: a peak of about 20 asks a second per list. One ask of
 * each list costs about 8 ms of the thread that holds the gateway (measured on a loaded laptop,
 * without the database), so 20 a second is about 16% of it, before the posts a list changed.
 */
const SPREAD_MS_PER_STREAM = 50;

const clamped = (ms: number, min: number, max: number): number => Math.min(max, Math.max(min, ms));

/** How long a server's maps wait between two signals of a list. */
const windowMs = (streams: number): number =>
  clamped(streams * WINDOW_MS_PER_STREAM, WINDOW_MIN_MS, WINDOW_MAX_MS);

/** Over how long the maps spread the asks a signal causes: one process answers all its servers. */
const spreadMs = (streams: number): number =>
  clamped(streams * SPREAD_MS_PER_STREAM, SPREAD_MIN_MS, SPREAD_MAX_MS);

/** What the hub needs of an open stream. */
export interface LiveSink {
  /** False when it takes no more now, a slow reader. */
  write(text: string): boolean;
  /** Ends it politely, at its lifetime's end. */
  end(): void;
  /** Ends it at once: a slow reader, or the shutdown, which must not wait for anybody. */
  destroy(): void;
}

export interface LiveOpening {
  server: string;
  /** The server's row (`Guild.id`), by which a party says whose it is; none yet: only its reports. */
  row: number | undefined;
  address: string;
  member: string;
  sink: LiveSink;
}

export type LiveAnswer =
  /** `gone`: the client went; safe to call again, and after the hub ended it. */
  | { kind: 'open'; gone(): void }
  /** A cap was reached (429). */
  | { kind: 'full' }
  /** The web server is closing (503). */
  | { kind: 'closed' };

export interface LiveSignalsDeps {
  now(): number;
  /** Starts a timer; gives what cancels it. */
  setTimer(run: () => void, ms: number): () => void;
  /** From 0 up to 1, as `Math.random`. */
  random(): number;
}

/** The clock, the timers (which hold no process up) and the random of the bot. */
export const LIVE_ON_THE_CLOCK: LiveSignalsDeps = {
  now: () => Date.now(),
  setTimer: (run, ms) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  },
  random: () => Math.random(),
};

interface Stream {
  opening: LiveOpening;
  server: ServerStreams;
  cancelPing: () => void;
  cancelLifetime: () => void;
}

interface ListPace {
  lastAt: number | undefined;
  cancel: (() => void) | undefined;
}

interface ServerStreams {
  id: string;
  row: number | undefined;
  streams: Set<Stream>;
  paces: Record<LiveList, ListPace>;
  /** The parties whose change waits for their post, with what cancels their timer. */
  pending: Map<string, () => void>;
}

function changedEvent(list: LiveList, spread: number): string {
  return `event: changed\ndata: ${list} ${spread}\n\n`;
}

function pingEvent(spread: number): string {
  return `event: ping\ndata: ${spread}\n\n`;
}

/** Counts in a plain `Map`, deleted at zero: an eviction would lose a live count. */
function counted(counts: Map<string, number>, key: string, by: 1 | -1): void {
  const next = (counts.get(key) ?? 0) + by;
  if (next <= 0) counts.delete(key);
  else counts.set(key, next);
}

export class LiveSignals {
  private readonly servers = new Map<string, ServerStreams>();
  private readonly rows = new Map<number, ServerStreams>();
  private readonly byAddress = new Map<string, number>();
  private readonly byMember = new Map<string, number>();
  private total = 0;
  private isClosed = false;

  constructor(private readonly deps: LiveSignalsDeps) {}

  /**
   * Registers a stream and writes its first ping, or says why not (nothing written then). The
   * checks and the registration are one turn: a caller has no `await` between them.
   */
  open(opening: LiveOpening): LiveAnswer {
    if (this.isClosed) return { kind: 'closed' };
    if (
      this.total >= MAX_LIVE_STREAMS ||
      (this.byAddress.get(opening.address) ?? 0) >= MAX_LIVE_PER_ADDRESS ||
      (this.byMember.get(opening.member) ?? 0) >= MAX_LIVE_PER_MEMBER
    ) {
      return { kind: 'full' };
    }
    const server = this.serverOf(opening);
    const stream: Stream = {
      opening,
      server,
      cancelPing: () => undefined,
      cancelLifetime: () => undefined,
    };
    server.streams.add(stream);
    this.total += 1;
    counted(this.byAddress, opening.address, 1);
    counted(this.byMember, opening.member, 1);
    stream.cancelLifetime = this.deps.setTimer(
      () => {
        this.forget(stream);
        this.safely(() => {
          opening.sink.end();
        });
      },
      LIVE_LIFETIME_MS + this.deps.random() * LIVE_LIFETIME_JITTER_MS,
    );
    this.ping(stream);
    return {
      kind: 'open',
      gone: () => {
        this.forget(stream);
      },
    };
  }

  /**
   * A party was added or changed (`PartyStore.onChange`): an active one's post is usually still
   * being edited, so it waits for `postShown`, or `LIVE_PENDING_MS` if no draw comes; one that
   * ended is signaled at once.
   */
  partyChanged(party: { id: string; guildId: number; status: string }): void {
    const server = this.rows.get(party.guildId);
    if (!server) return;
    if (party.status === 'ended') {
      this.settled(server, party.id);
      this.ask(server, 'parties');
      return;
    }
    if (server.pending.has(party.id)) return;
    server.pending.set(
      party.id,
      this.deps.setTimer(() => {
        server.pending.delete(party.id);
        this.ask(server, 'parties');
      }, LIVE_PENDING_MS),
    );
  }

  /**
   * A party's post was drawn (`PartyService.keepLayout`), which happens also for draws that send
   * nothing new: `changed` says its key differs from the one kept. Signals that, or flushes a
   * change that waited for it.
   */
  postShown(partyId: string, row: number, changed: boolean): void {
    const server = this.rows.get(row);
    if (!server) return;
    if (this.settled(server, partyId) || changed) this.ask(server, 'parties');
  }

  /** A server's reports at stops, or the links they show, changed. */
  reportsChanged(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) this.ask(server, 'stop-reports');
  }

  /**
   * A wild spawn of a server was reported (`SpawnService.onReported`). One that goes away needs no
   * word: the page drops it at its time.
   */
  spawnsChanged(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) this.ask(server, 'spawns');
  }

  /** Ends every stream at once (`preClose`); a stream asked for from now on is `closed`. */
  close(): void {
    this.isClosed = true;
    for (const server of [...this.servers.values()]) {
      for (const stream of [...server.streams]) {
        this.forget(stream);
        this.safely(() => {
          stream.opening.sink.destroy();
        });
      }
    }
  }

  private serverOf(opening: LiveOpening): ServerStreams {
    let server = this.servers.get(opening.server);
    if (!server) {
      server = {
        id: opening.server,
        row: opening.row,
        streams: new Set(),
        paces: {
          parties: { lastAt: undefined, cancel: undefined },
          'stop-reports': { lastAt: undefined, cancel: undefined },
          spawns: { lastAt: undefined, cancel: undefined },
        },
        pending: new Map(),
      };
      this.servers.set(opening.server, server);
    }
    // A later stream may know the row of a server new when the first opened.
    if (server.row === undefined) server.row = opening.row;
    if (server.row !== undefined) this.rows.set(server.row, server);
    return server;
  }

  /** Forgets what waited for a party's post; whether anything did. */
  private settled(server: ServerStreams, partyId: string): boolean {
    const cancel = server.pending.get(partyId);
    if (!cancel) return false;
    cancel();
    server.pending.delete(partyId);
    return true;
  }

  /** One signal per window: the first after a quiet spell at once, later ones at its end. */
  private ask(server: ServerStreams, list: LiveList): void {
    const pace = server.paces[list];
    if (pace.cancel) return;
    const wait =
      pace.lastAt === undefined ? 0 : pace.lastAt + windowMs(server.streams.size) - this.deps.now();
    if (wait <= 0) {
      this.signal(server, list);
      return;
    }
    pace.cancel = this.deps.setTimer(() => {
      pace.cancel = undefined;
      this.signal(server, list);
    }, wait);
  }

  private signal(server: ServerStreams, list: LiveList): void {
    server.paces[list].lastAt = this.deps.now();
    const event = changedEvent(list, spreadMs(this.total));
    for (const stream of [...server.streams]) this.write(stream, event);
  }

  private ping(stream: Stream): void {
    this.write(stream, pingEvent(spreadMs(this.total)));
    if (!stream.server.streams.has(stream)) return;
    stream.cancelPing = this.deps.setTimer(() => {
      this.ping(stream);
    }, LIVE_PING_MS);
  }

  /** A write refused or broken drops the stream: a slow reader reconnects. */
  private write(stream: Stream, text: string): void {
    const { sink } = stream.opening;
    let took = false;
    try {
      took = sink.write(text);
    } catch {
      // Dropped below, as a write refused.
    }
    if (took) return;
    this.forget(stream);
    this.safely(() => {
      sink.destroy();
    });
  }

  private forget(stream: Stream): void {
    const { server, opening } = stream;
    if (!server.streams.delete(stream)) return;
    stream.cancelPing();
    stream.cancelLifetime();
    this.total -= 1;
    counted(this.byAddress, opening.address, -1);
    counted(this.byMember, opening.member, -1);
    if (server.streams.size > 0) return;
    // With no stream open nothing needs signaling.
    for (const cancel of server.pending.values()) cancel();
    server.pending.clear();
    for (const list of LISTS) server.paces[list].cancel?.();
    this.servers.delete(server.id);
    if (server.row !== undefined) this.rows.delete(server.row);
  }

  private safely(work: () => void): void {
    try {
      work();
    } catch {
      // The stream is forgotten already; there is nobody to tell.
    }
  }
}
