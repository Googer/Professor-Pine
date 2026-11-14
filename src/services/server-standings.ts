import { isOpenInstance, listedServers, type Settings } from '../config/settings.js';
import type {
  ServerRecordStorage,
  StoredServerRecord,
} from '../db/repositories/server-record-repository.js';
import { mayHave, NO_STANDING, type Standing } from '../domain/operators/admission.js';
import type { Logger } from '../log.js';

/**
 * Whether Pine left a server (plan 19C-1; `ServerStandings.isLeft`): what the few places that act
 * on a server outside its interactions ask, so that nothing is posted, edited or sent for it.
 */
export interface LeftServers {
  isLeft(serverId: string): boolean;
}

/** The servers a write of `ServerStandings` marked left, and those it took back (plan 19C-1). */
export interface LeftChange {
  left: readonly string[];
  back: readonly string[];
}

export interface ServerStandingsOptions {
  store: ServerRecordStorage;
  /** The file's `servers` (`isOpenInstance`, `listedServers`). */
  settings: Pick<Settings, 'servers'>;
  log: Logger;
  now?: () => number;
  /**
   * The rows as read already, for a lookup made where nothing is awaited (the tests' context);
   * `load` reads them anew.
   */
  rows?: readonly StoredServerRecord[];
}

/**
 * Each server's standing with the instance (plan 19C-1; table `ServerRecord`, migration 061), kept in
 * memory: read whole at the start (`load`, before the login), changed here by whoever changes the
 * table, so that every question is synchronous: who may have this Pine (`mayHave`, the rule of
 * `src/domain/operators/admission.ts` with the file's `servers`), what an operator's tier reads
 * of a server (`standingOf`), and whether Pine left it (`isLeft`).
 *
 * The writes of one server are made one after another, each deciding on the row as the one before
 * left it (a removal and a return that meet, plan 19C-1's J2): `markLeft` and `cameBack` read
 * which servers they change only in their turn.
 *
 * **A new install** (`adopting`): while no server was ever recorded, on an instance whose file
 * lists no servers and is not open, the servers present at its first start are adopted
 * (`ServerAdoption`): kept as recorded in memory at once (`adopt`), so that they are admitted at
 * that very start, and written once (`writeAdopted`), which closes the window for good.
 */
export class ServerStandings {
  private readonly rows = new Map<string, StoredServerRecord>();
  /** Whether no server was ever recorded on an instance without a list (decided at `load`). */
  private open: boolean;
  /** The servers adopted in memory and not written yet. */
  private readonly unwritten = new Set<string>();
  /** Each server's last write, the next one after it. */
  private readonly turns = new Map<string, Promise<unknown>>();
  /** Who is told of the servers marked left and back (`whenLeftChanged`). */
  private readonly leftListeners: ((change: LeftChange) => void)[] = [];
  /** Who is told of a server an operator allowed, blocked or unblocked (`whenStandingChanged`). */
  private readonly standingListeners: ((serverId: string) => void)[] = [];

  constructor(private readonly options: ServerStandingsOptions) {
    for (const row of options.rows ?? []) this.rows.set(row.serverId, { ...row });
    this.open = this.windowOpen();
  }

  /** Reads every server's row. A failed read is thrown: the bot does not start without them. */
  async load(): Promise<void> {
    const rows = await this.options.store.all();
    this.rows.clear();
    for (const row of rows) this.rows.set(row.serverId, row);
    this.open = this.windowOpen();
    this.options.log.info({ servers: rows.length, adopting: this.open }, 'server standings loaded');
  }

  /**
   * Whether this is a new install that may still adopt the servers it is in (`ServerAdoption`):
   * no server was ever recorded, and the file's `servers` is unset (a list names its own; an open
   * instance needs none). Closed for good once an adopted server is written.
   */
  get adopting(): boolean {
    return this.open;
  }

  /** What the database says of a server: recorded at the upgrade, allowed, blocked. */
  standingOf(serverId: string): Standing {
    const row = this.rows.get(serverId);
    if (row === undefined) return NO_STANDING;
    return {
      recorded: row.recordedAt !== null,
      allowed: row.allowedAt !== null,
      blocked: row.blockedAt !== null,
    };
  }

  /** Whether a server may have this Pine (`mayHave`), by its standing and the file's `servers`. */
  mayHave(serverId: string): boolean {
    const { settings } = this.options;
    const instance = { open: isOpenInstance(settings), listed: listedServers(settings) };
    return mayHave(serverId, instance, this.standingOf(serverId));
  }

  /** Whether Pine left the server (and is not back): nothing is posted or sent for it. */
  isLeft(serverId: string): boolean {
    return (this.rows.get(serverId)?.leftAt ?? null) !== null;
  }

  /**
   * Pine is no longer in these servers: those it was in (a `Guild` row) are marked left now, an
   * earlier time kept. Written first, then kept; in each server's turn. Only `leftAt` is taken
   * from what was written: the rest of the row kept is as it was (an adoption not written yet
   * stays).
   */
  async markLeft(serverIds: readonly string[]): Promise<void> {
    if (serverIds.length === 0) return;
    await this.inTurn(serverIds, async () => {
      const rows = await this.options.store.markLeft(serverIds, this.now());
      const marked: string[] = [];
      for (const row of rows) {
        if (row.leftAt !== null && !this.isLeft(row.serverId)) marked.push(row.serverId);
        this.rows.set(row.serverId, { ...this.rowOf(row.serverId), leftAt: row.leftAt });
      }
      this.tellLeft({ left: marked, back: [] });
    });
  }

  /**
   * These servers are present again: those marked left are so no more. Which are left is read in
   * their turn, after a mark asked before.
   */
  async cameBack(serverIds: readonly string[]): Promise<void> {
    if (serverIds.length === 0) return;
    await this.inTurn(serverIds, async () => {
      const left = serverIds.filter((serverId) => this.isLeft(serverId));
      if (left.length === 0) return;
      await this.options.store.cameBack(left);
      for (const serverId of left) {
        const row = this.rows.get(serverId);
        if (row) this.rows.set(serverId, { ...row, leftAt: null });
      }
      this.tellLeft({ left: [], back: left });
    });
  }

  /**
   * Tells `listener` of the servers each write marked left (they were not) and of those it took
   * back, once written and kept (plan 19C-1: what is queued for a server Pine left is dropped,
   * Google's line serves it no more, and again once it is back). Every listener is told; one that
   * throws is logged.
   */
  whenLeftChanged(listener: (change: LeftChange) => void): void {
    this.leftListeners.push(listener);
  }

  private tellLeft(change: LeftChange): void {
    if (change.left.length === 0 && change.back.length === 0) return;
    for (const listener of this.leftListeners) {
      try {
        listener(change);
      } catch (err) {
        this.options.log.error({ err }, 'a listener of servers left failed');
      }
    }
  }

  /**
   * A new install adopts these servers (`ServerAdoption`): recorded in memory now, so that they
   * are admitted at once; written by `writeAdopted`.
   */
  adopt(serverIds: readonly string[]): void {
    const at = this.now();
    for (const serverId of serverIds) {
      const row = this.rowOf(serverId);
      if (row.recordedAt !== null && !this.unwritten.has(serverId)) continue;
      this.rows.set(serverId, { ...row, recordedAt: row.recordedAt ?? at });
      this.unwritten.add(serverId);
    }
  }

  /**
   * Writes the servers adopted and not written yet (`recordedAt`); those written, by server.
   * Once one is, the window is closed for good. A failed write is thrown: the adopted stay
   * admitted for this run, and the next call writes them.
   */
  async writeAdopted(): Promise<string[]> {
    const adopted = [...this.unwritten].sort();
    if (adopted.length === 0) return [];
    await this.inTurn(adopted, async () => {
      await this.options.store.record(adopted, this.now());
    });
    for (const serverId of adopted) this.unwritten.delete(serverId);
    this.open = false;
    return adopted;
  }

  /** Every server's row as kept, by server (`/operator servers list`). */
  all(): readonly StoredServerRecord[] {
    return [...this.rows.values()].sort((a, b) => a.serverId.localeCompare(b.serverId));
  }

  /**
   * An instance operator allows a server (`/operator servers allow`): written, then kept, then
   * the listeners told (`whenStandingChanged`).
   */
  async allow(serverId: string, by: string): Promise<void> {
    await this.inTurn([serverId], async () => {
      const at = this.now();
      await this.options.store.allow(serverId, at, by);
      this.rows.set(serverId, { ...this.rowOf(serverId), allowedAt: at, allowedBy: by });
      this.tellStanding(serverId);
    });
  }

  /**
   * An instance operator blocks a server (`/operator servers block`): written, then kept, then the
   * listeners told (`whenStandingChanged`).
   */
  async block(serverId: string, by: string): Promise<void> {
    await this.inTurn([serverId], async () => {
      const at = this.now();
      await this.options.store.block(serverId, at, by);
      this.rows.set(serverId, { ...this.rowOf(serverId), blockedAt: at, blockedBy: by });
      this.tellStanding(serverId);
    });
  }

  /**
   * A server's block taken back (`/operator servers unblock`): written, then kept, then the
   * listeners told (`whenStandingChanged`).
   */
  async unblock(serverId: string): Promise<void> {
    await this.inTurn([serverId], async () => {
      await this.options.store.unblock(serverId);
      const row = this.rows.get(serverId);
      if (row) this.rows.set(serverId, { ...row, blockedAt: null, blockedBy: null });
      this.tellStanding(serverId);
    });
  }

  /**
   * Tells `listener` of each server an operator allowed, blocked or unblocked, once written and
   * kept (plan 19C-1: whether it may have this Pine may have changed without its leaving or
   * coming back, as a block whose leave failed: Google's line serves it, or not, at once). Every
   * listener is told; one that throws is logged.
   */
  whenStandingChanged(listener: (serverId: string) => void): void {
    this.standingListeners.push(listener);
  }

  private tellStanding(serverId: string): void {
    for (const listener of this.standingListeners) {
      try {
        listener(serverId);
      } catch (err) {
        this.options.log.error(
          { err, server: serverId },
          'a listener of servers’ standings failed',
        );
      }
    }
  }

  /**
   * Runs `work` once every earlier write of these servers is done, and holds their next writes
   * until it is; its failure is the caller's, never the next write's.
   */
  private async inTurn(serverIds: readonly string[], work: () => Promise<void>): Promise<void> {
    const before = [...new Set(serverIds)].flatMap((serverId) => {
      const turn = this.turns.get(serverId);
      return turn === undefined ? [] : [turn];
    });
    const done = Promise.all(before).then(work);
    const settled = done.catch(() => undefined);
    for (const serverId of serverIds) this.turns.set(serverId, settled);
    try {
      await done;
    } finally {
      for (const serverId of serverIds) {
        if (this.turns.get(serverId) === settled) this.turns.delete(serverId);
      }
    }
  }

  /** No server recorded, and a file that lists none and is not open. */
  private windowOpen(): boolean {
    const { settings } = this.options;
    if (isOpenInstance(settings) || listedServers(settings) !== undefined) return false;
    return ![...this.rows.values()].some((row) => row.recordedAt !== null);
  }

  private rowOf(serverId: string): StoredServerRecord {
    return (
      this.rows.get(serverId) ?? {
        serverId,
        recordedAt: null,
        allowedAt: null,
        allowedBy: null,
        blockedAt: null,
        blockedBy: null,
        leftAt: null,
      }
    );
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
