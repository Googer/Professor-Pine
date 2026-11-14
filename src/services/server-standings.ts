import { isOpenInstance, listedServers, type Settings } from '../config/settings.js';
import type {
  ServerRecordStorage,
  StoredServerRecord,
} from '../db/repositories/server-record-repository.js';
import { mayHave, NO_STANDING, type Standing } from '../domain/operators/admission.js';
import { deletedSinceLeft } from '../domain/servers/deletion.js';
import type { Logger } from '../log.js';

/**
 * Whether Pine left a server (plan 19C-1; `ServerStandings.isLeft`): what the few places that act
 * on a server outside its interactions ask, so that nothing is posted, edited or sent for it.
 */
export interface LeftServers {
  isLeft(serverId: string): boolean;
}

/**
 * A server's unfinished deletion failed when it was added back, and is not tried again until the
 * next sweep or ready (plan 19C-3, fix round 1, 3a): what asks meanwhile is answered so, quietly.
 */
class FailedBefore extends Error {
  constructor() {
    super('the deletion failed at the server’s return: tried again at the next sweep or ready');
  }
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
  /** The servers whose deletion was asked and is not over (plan 19C-3, `deleteIfDue`). */
  private readonly deleting = new Set<string>();
  /**
   * The servers added back whose deletion was pending, until they are taken back
   * (`backAfterDeletion`): pending till then.
   */
  private readonly returning = new Set<string>();
  /**
   * The servers whose unfinished deletion failed when they were added back (fix round 1, 3a):
   * not tried again by their return until the next sweep or ready (`retryDeletions`). Of the
   * servers pending alone, bounded small by nature.
   */
  private readonly finishFailed = new Set<string>();
  /** The work that finishes a deletion begun and not ended (`finishDeletionsWith`). */
  private finishing: ((serverId: string) => Promise<unknown>) | undefined;
  /** Who is told of a server taken back once its deletion is over (`whenBackAfterDeletion`). */
  private readonly backListeners: ((serverId: string) => Promise<unknown> | void)[] = [];

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

  /**
   * Whether a server present at the login is filled set up by the instance's record (plan 19C-2,
   * `ServerFill`'s `recorded`): recorded, at the upgrade to 2.1 or adopted by a new install, and
   * its data never deleted (plan 19C-3: once deleted, a server is new to this Pine's settings
   * whatever its record, and starts in setup when it adds Pine back, while Pine runs or while it
   * was down; its record still lets it have this Pine, `mayHave`).
   */
  setUpOnRecord(serverId: string): boolean {
    const row = this.rows.get(serverId);
    return row !== undefined && row.recordedAt !== null && row.deletedAt === null;
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
   * their turn, after a mark asked before. When a server's data was deleted stays on record
   * (`deletedAt`, `setUpOnRecord`).
   *
   * A server whose deletion is pending (plan 19C-3, `pending`: being deleted, or begun and not
   * ended) leaves the batch (fix round 1, 1): it is taken back in its own turn once its deletion
   * is over (`backAfterDeletion`: an unfinished one finished first, tried once until the next
   * sweep or ready), in the background, its failure logged and its own; the others are taken back
   * at once, whatever it does. A failed write of the others is thrown.
   */
  async cameBack(serverIds: readonly string[]): Promise<void> {
    if (serverIds.length === 0) return;
    const pending = new Set(serverIds.filter((serverId) => this.pending(serverId)));
    for (const serverId of pending) void this.backAfterDeletion(serverId);
    const rest = serverIds.filter((serverId) => !pending.has(serverId));
    if (rest.length === 0) return;
    await this.inTurn(rest, async () => {
      const left = rest.filter((serverId) => this.isLeft(serverId));
      if (left.length > 0) await this.takeBack(left);
    });
  }

  /**
   * Takes these servers back (in their turn): written, kept, the listeners told; then, of those
   * whose data was deleted since they left (`deletedSinceLeft`: they start anew), who follows
   * them (`whenBackAfterDeletion`), each in turn.
   */
  private async takeBack(left: readonly string[]): Promise<void> {
    await this.options.store.cameBack(left);
    const anew: string[] = [];
    for (const serverId of left) {
      const row = this.rows.get(serverId);
      if (row && deletedSinceLeft(row)) anew.push(serverId);
      if (row) this.rows.set(serverId, { ...row, leftAt: null });
      // Back: no longer pending (`backAfterDeletion`).
      this.returning.delete(serverId);
    }
    this.tellLeft({ left: [], back: left });
    for (const serverId of anew) await this.tellBackAfterDeletion(serverId);
  }

  /**
   * A server added back while its deletion was pending (plan 19C-3, fix round 1): in its turn,
   * once the deletion is over (`settled`: one begun and not ended finished first, tried once until
   * the next sweep or ready), it is taken back (`takeBack`, which tells who follows it). Pending
   * until then (`returning`), so that what joins it meanwhile is held. Where the deletion cannot
   * be finished it stays left (logged by `settled`), and so where its return's write fails
   * (logged apart: a later return takes it back). A server taken back already by an earlier call
   * is not taken back again. Never rejects.
   */
  private async backAfterDeletion(serverId: string): Promise<void> {
    this.returning.add(serverId);
    try {
      await this.settled(serverId, async () => {
        if (this.isLeft(serverId)) await this.takeBack([serverId]);
      });
    } finally {
      this.returning.delete(serverId);
    }
  }

  /**
   * Tells `listener` of a server taken back whose data was deleted since it left (plan 19C-3, fix
   * round 1: `deletedSinceLeft`; it starts anew), in the server's turn once it is taken back (a
   * removal asked after it comes after the listener's work): `app.ts` begins its fill and writes
   * its `Guild` row (`backAfterDeletion`), which `afterDeletions` and `followServers` held while
   * its deletion was pending, and which a ready may have passed over meanwhile (both are
   * idempotent: for a server whose joining began them already, they do nothing more). A listener
   * that throws or rejects is logged.
   */
  whenBackAfterDeletion(listener: (serverId: string) => Promise<unknown> | void): void {
    this.backListeners.push(listener);
  }

  private async tellBackAfterDeletion(serverId: string): Promise<void> {
    for (const listener of this.backListeners) {
      try {
        await listener(serverId);
      } catch (err) {
        this.options.log.error(
          { err, server: serverId },
          'could not begin a server added back after its deletion',
        );
      }
    }
  }

  /**
   * A sweep or a ready is here (fix round 1, 3a): a server whose unfinished deletion failed when it
   * was added back is tried again at its next return (the ready's own, `ServerAdmission`).
   */
  retryDeletions(): void {
    this.finishFailed.clear();
  }

  /**
   * The servers whose data is due to be deleted (plan 19C-3, `ServerDeletion`): left at least
   * `keptMs` ago and not deleted since (`deletedSinceLeft`: one deleted, added back and left again
   * is due again), and those left whose deletion began and did not end, whatever the time; those
   * Pine left first first.
   */
  due(keptMs: number): string[] {
    const before = this.now() - keptMs;
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.leftAt !== null &&
          (row.deletingAt !== null || (row.leftAt <= before && !deletedSinceLeft(row))),
      )
      .sort((a, b) => (a.leftAt ?? 0) - (b.leftAt ?? 0) || a.serverId.localeCompare(b.serverId))
      .map((row) => row.serverId);
  }

  /**
   * Deletes a server's data where it is still due (plan 19C-3): in the server's turn, after every
   * write of it asked before (a return queued first wins: then nothing is begun), its record read
   * again there; `deletingAt` written before `work` (a time written already kept), `deletedAt`
   * after it (`filesLeftAt` with it: the kept screenshots are the sweep's next step, `filesLeft`).
   * Whether it deleted. A failure of `work` is thrown, `deletingAt` kept: the next sweep takes it
   * up, or the server's return finishes it first (`finishDeletionsWith`). A return asked meanwhile
   * waits for the end.
   *
   * Never a server Pine is in (fix round 1, 2): `present` is asked in the turn, and a server it
   * names present (unavailable included) is not begun; it is taken back instead where it may have
   * this Pine (`cameBack`, after the turn), as a ready would have. One whose presence is not known
   * (`undefined`: no client yet) is neither. Where none is given, none is present (the tests').
   */
  async deleteIfDue(
    serverId: string,
    keptMs: number,
    work: () => Promise<unknown>,
    present: (serverId: string) => boolean | undefined = () => false,
  ): Promise<boolean> {
    let deleted = false;
    let back = false;
    // Pending from the moment it is asked: what joins the server meanwhile waits for its turn.
    this.deleting.add(serverId);
    try {
      await this.inTurn([serverId], async () => {
        if (!this.due(keptMs).includes(serverId)) return;
        const here = present(serverId);
        if (here !== false) {
          if (here === true) {
            back = this.mayHave(serverId);
            this.options.log.warn(
              { server: serverId, back },
              'a server Pine left 30 days ago is present: its data is not deleted',
            );
          }
          return;
        }
        if (!this.unfinished(serverId)) {
          const at = this.now();
          await this.options.store.markDeleting(serverId, at);
          this.rows.set(serverId, { ...this.rowOf(serverId), deletingAt: at });
        }
        await this.ended(serverId, work);
        deleted = true;
      });
    } finally {
      this.deleting.delete(serverId);
    }
    if (back) await this.cameBack([serverId]);
    return deleted;
  }

  /**
   * The servers whose kept screenshots are left to remove (`filesLeftAt`: a deletion's end, up to
   * which they were read), the oldest first: the sweep removes them (plan 19C-3, fix round 1, 3d).
   */
  filesLeft(): { serverId: string; at: number }[] {
    return [...this.rows.values()]
      .flatMap((row) =>
        row.filesLeftAt === null ? [] : [{ serverId: row.serverId, at: row.filesLeftAt }],
      )
      .sort((a, b) => a.at - b.at || a.serverId.localeCompare(b.serverId));
  }

  /**
   * The kept screenshots of the server's deletion that ended at `at` are removed: written, then
   * kept, in the server's turn (a later deletion's are left).
   */
  async filesRemoved(serverId: string, at: number): Promise<void> {
    await this.inTurn([serverId], async () => {
      await this.options.store.filesRemoved(serverId, at);
      const row = this.rows.get(serverId);
      if (row?.filesLeftAt === at) this.rows.set(serverId, { ...row, filesLeftAt: null });
    });
  }

  /**
   * The work that finishes a deletion that began and did not end, for a server added back before
   * the next sweep (`cameBack`, `settled`): `ServerDeletion`'s, the very work of a sweep.
   */
  finishDeletionsWith(work: (serverId: string) => Promise<unknown>): void {
    this.finishing = work;
  }

  /**
   * Whether the server's data is being deleted, or its deletion began and did not end, or it was
   * added back meanwhile and is not taken back yet: nothing of it is begun or written (its row of
   * settings, its `Guild` row: `afterDeletions`), its interactions are answered with one line
   * (`BEING_READIED`), the web answers it as a server Pine is not in (`servedOnWeb`), until its
   * return takes it back (`whenBackAfterDeletion`).
   */
  pending(serverId: string): boolean {
    return this.deleting.has(serverId) || this.returning.has(serverId) || this.unfinished(serverId);
  }

  /**
   * Once the server's deletion is over (plan 19C-3): at once where none is pending; else after
   * the one that runs, or after its unfinished one is finished then and there. Whether it is
   * over: false where finishing failed (logged; the server stays as it was), and then `after` is
   * not run. Finishing is tried once (fix round 1, 3a): after a failure, whatever asks again
   * (another return, a fill, a `Guild` row) is answered false at once, quietly, until the next
   * sweep or ready (`retryDeletions`). `after`, where given (`backAfterDeletion`'s return),
   * runs in the server's turn once it is over, so that what is asked of the server after it (a
   * removal) comes after it too. Never rejects: `after`'s failure is logged apart, as a return
   * not taken back (fix round 2, R1-4), and the deletion is over all the same.
   */
  settled(serverId: string, after?: () => Promise<unknown>): Promise<boolean> {
    if (!this.pending(serverId)) return Promise.resolve(true);
    return this.inTurn([serverId], async () => {
      if (this.unfinished(serverId)) await this.finish(serverId);
      if (after === undefined) return;
      try {
        await after();
      } catch (err) {
        this.options.log.error(
          { err, server: serverId },
          'could not take back a server added back after its deletion',
        );
      }
    }).then(
      () => true,
      (err: unknown) => {
        if (!(err instanceof FailedBefore)) {
          this.options.log.error(
            { err, server: serverId },
            'could not finish the deletion of a server added back',
          );
        }
        return false;
      },
    );
  }

  /** Whether the server's deletion began and did not end (`deletingAt`). */
  private unfinished(serverId: string): boolean {
    const row = this.rows.get(serverId);
    // Only of a server still left: one an older version took back (it knows no `deletingAt`) is
    // present, and nothing of it is deleted any more.
    return row !== undefined && row.deletingAt !== null && row.leftAt !== null;
  }

  /**
   * Finishes a deletion that began (in the server's turn); once until the next sweep or ready
   * after a failure (`finishFailed`), then `FailedBefore` at once.
   */
  private async finish(serverId: string): Promise<void> {
    if (this.finishFailed.has(serverId)) throw new FailedBefore();
    const work = this.finishing;
    if (work === undefined) throw new Error(`no deletion to finish server ${serverId} with`);
    try {
      await this.ended(serverId, () => work(serverId));
    } catch (err) {
      this.finishFailed.add(serverId);
      throw err;
    }
    this.finishFailed.delete(serverId);
  }

  /**
   * Runs a deletion's work (in the server's turn: its rows in the database, and what the bot keeps
   * of it in memory), then records its end, its kept screenshots left to the sweep (`filesLeft`).
   */
  private async ended(serverId: string, work: () => Promise<unknown>): Promise<void> {
    await work();
    const at = this.now();
    await this.options.store.markDeleted(serverId, at);
    this.rows.set(serverId, {
      ...this.rowOf(serverId),
      deletingAt: null,
      deletedAt: at,
      filesLeftAt: at,
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
        deletingAt: null,
        deletedAt: null,
        filesLeftAt: null,
      }
    );
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
