import type { ServerNeighborStorage } from '../db/repositories/server-neighbor-repository.js';
import type { V2Message } from '../discord/party-gateway.js';
import {
  decideAccept,
  decideAsk,
  NEIGHBOR_ASK_AGAIN_MS,
  NEIGHBOR_ASK_EXPIRES_MS,
  neighborPair,
  neighborRowEnds,
  neighborRowKept,
  neighborStanding,
  otherOf,
  pairKey,
  type NeighborPair,
  type NeighborRow,
} from '../domain/servers/neighbors.js';
import type { Logger } from '../log.js';
import {
  acceptedNotice,
  declinedNotice,
  endedByUsNotice,
  endedNotice,
  neighborRequestPost,
} from '../render/server-neighbors.js';
import type { ModeratorsLabPoster } from './moderators-lab.js';

/** What `ServerNeighbors` asks of the instance about a server. */
export interface NeighborReach {
  /**
   * Whether the server's staff can be told: Pine is in it, may serve it (`mayHave`: not blocked,
   * not refused), and it is not quiet (neither left nor in setup).
   */
  reachable(serverId: string): boolean;
  /** Its name as Discord has it, where the bot knows it. */
  nameOf(serverId: string): string | undefined;
}

/**
 * The server an invite link leads to (Discord's invite endpoint, `GET /invites/{code}`, through
 * the bot's REST client): undefined for an invite Discord does not know, one of no server, and a
 * request that failed, which `/admin neighbors` answers as any request (`ASKED`).
 */
export interface ServerInvites {
  serverOfInvite(code: string): Promise<string | undefined>;
}

export interface ServerNeighborsOptions {
  storage: ServerNeighborStorage;
  reach: NeighborReach;
  /** Each server's moderators' bot lab: the requests, and what both are told. */
  lab: ModeratorsLabPoster;
  log: Logger;
  now?: () => number;
}

/**
 * What came of an ask (`decideAsk`): `asked` whatever happened to the request; `theirs` where the
 * other server asked this one already (its request is posted again in this server's lab).
 */
export type AskOutcome = { kind: 'asked' | 'self' | 'neighbors' | 'full' | 'theirs' };

/** What came of an answer to a request: the asker's name as Discord has it, for the post. */
export type AnswerOutcome =
  { kind: 'accepted' | 'declined'; name: string | undefined } | { kind: 'expired' | 'full' };

/** A pair heard of (`whenChanged`): whether the two are neighbors from now on. */
export type NeighborListener = (pair: NeighborPair, neighbors: boolean) => void;

/**
 * A request's tell as written: the pair, the `toldAt` written for it, and the one before it, which
 * is written back where the post did not go (review RR1).
 */
interface Tell {
  pair: NeighborPair;
  toldAt: number;
  before: number | null;
}

/** A post in a server's moderators' bot lab, sent once the turn that decided it is over. */
interface LabMessage {
  serverId: string;
  message: V2Message;
  /** For a request told: its tell, written back where the post does not go. */
  told?: Tell;
}

/** What a turn decided: its result, and what the labs are told after it. */
interface Decided<T> {
  result: T;
  tell?: readonly LabMessage[];
}

/**
 * The neighbors of each server and their requests (plan 19E; spec "Neighbors"), in memory: every
 * row read at the start (`load`; small, `NEIGHBORS_MAX` a server), every question synchronous (a
 * post's render asks `neighborsOf`). A change is decided against memory, written first and then
 * kept, one at a time for the whole instance (an ask counts the asker's other rows); what the labs
 * are told is posted after that turn and never waited for (review R1: a press is answered within
 * Discord's three seconds, and a slow post holds nobody's turn), a post that fails logged, the
 * change standing.
 */
export class ServerNeighbors {
  /** The rows kept (`neighborRowKept`), by pair. */
  private readonly rows = new Map<string, NeighborRow>();
  /** The keys of each server's rows. */
  private readonly ofServer = new Map<string, Set<string>>();
  private readonly listeners: NeighborListener[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  /** The labs' posts on their way. */
  private readonly sending = new Set<Promise<void>>();
  private readonly now: () => number;

  constructor(private readonly options: ServerNeighborsOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Reads every row; deletes, by their keys, those no longer kept. */
  async load(): Promise<void> {
    const rows = await this.options.storage.all();
    const now = this.now();
    this.rows.clear();
    this.ofServer.clear();
    for (const row of rows) this.keep(row);
    const over = rows.filter((row) => !neighborRowKept(row, now));
    if (over.length > 0) {
      try {
        await this.options.storage.remove(over);
        for (const row of over) this.forget(pairKey(row));
      } catch (err) {
        this.options.log.warn({ err }, 'could not delete the neighbors’ requests that expired');
      }
    }
  }

  /**
   * Deletes, by their keys, the rows no longer kept (requests expired or taken back, declines a
   * week old), memory with them (review R8): with the upkeep. Gives how many went.
   */
  sweep(): Promise<number> {
    return this.inTurn(async () => {
      const now = this.now();
      const over = [...this.rows.values()].filter((row) => !neighborRowKept(row, now));
      if (over.length === 0) return 0;
      await this.options.storage.remove(over);
      for (const row of over) this.forget(pairKey(row));
      return over.length;
    });
  }

  /**
   * A server whose data was deleted (plan 19C-3, `forgetServerMemory`; the deletion took its rows
   * by either column, `TABLE_OWNERS`' `server-pair`): its pairs and requests are forgotten, in a
   * turn, so that added back it has no neighbors and asks and is asked anew. Nobody is told and
   * no post is drawn: a server is deleted only 30 days after Pine left it, and no post has shown
   * its parties since it left, nor shown it theirs.
   */
  forgetServer(serverId: string): Promise<void> {
    return this.inTurn(() => {
      for (const key of [...(this.ofServer.get(serverId) ?? [])]) this.forget(key);
      return Promise.resolve();
    });
  }

  /** Tells `listener` of each pair that becomes neighbors or stops being so, once kept. */
  whenChanged(listener: NeighborListener): void {
    this.listeners.push(listener);
  }

  /** A server's name as Discord has it, where the bot knows it. */
  nameOf(serverId: string): string | undefined {
    return this.options.reach.nameOf(serverId);
  }

  /** A server's neighbors, in the order of their ids. */
  neighborsOf(serverId: string): string[] {
    return this.rowsOf(serverId)
      .filter((row) => row.acceptedAt !== null)
      .map((row) => otherOf(row, serverId))
      .sort();
  }

  areNeighbors(one: string, other: string): boolean {
    const row = this.rows.get(pairKey(neighborPair(one, other)));
    return neighborStanding(row, this.now()) === 'neighbors';
  }

  /** A server's rows that still say something: neighbors, requests either way, declines. */
  rowsOf(serverId: string): NeighborRow[] {
    const now = this.now();
    return [...(this.ofServer.get(serverId) ?? [])].flatMap((key) => {
      const row = this.rows.get(key);
      return row && neighborStanding(row, now) !== 'none' ? [row] : [];
    });
  }

  /** The pair's row, if it says something. */
  rowOf(one: string, other: string): NeighborRow | undefined {
    const row = this.rows.get(pairKey(neighborPair(one, other)));
    return row && neighborStanding(row, this.now()) !== 'none' ? row : undefined;
  }

  /** When a row stops saying anything: a request's expiry, the end of a decline's week. */
  endsAt(row: NeighborRow): number | undefined {
    return neighborRowEnds(row);
  }

  /** A server's neighbors and its own requests pending, the pair of `except` left out. */
  private countOf(serverId: string, except?: string): number {
    const now = this.now();
    return this.rowsOf(serverId).filter((row) => {
      if (pairKey(row) === except) return false;
      const standing = neighborStanding(row, now);
      return standing === 'neighbors' || (standing === 'asked' && row.askedBy === serverId);
    }).length;
  }

  /**
   * The staff of `asker` ask `target` to be neighbors (`decideAsk`). Whatever the target is, an
   * ask answered `asked` writes the pair's row once before it is answered (review R1: the asker
   * learns nothing of the other server, by the answer nor by its time); the target's lab is told
   * after the turn where it can be, at most once a week of the pair's requests. A request that
   * may not be told (a server Pine is not in, left, blocked or new) is written all the same and
   * told at a repeat ask once it can be, or expires unanswered.
   */
  ask(asker: string, target: string): Promise<AskOutcome> {
    return this.decide<AskOutcome>(async () => {
      const pair = asker === target ? undefined : neighborPair(asker, target);
      const key = pair && pairKey(pair);
      const now = this.now();
      const before = key === undefined ? undefined : this.rows.get(key);
      const decided = decideAsk({
        asker,
        target,
        row: before,
        now,
        count: this.countOf(asker, key),
        reachable: this.options.reach.reachable(target),
      });
      if (decided.kind === 'theirs') {
        const asked = before?.askedAt ?? now;
        const message = neighborRequestPost(
          target,
          this.nameOf(target),
          asked + NEIGHBOR_ASK_EXPIRES_MS,
        );
        return { result: { kind: 'theirs' }, tell: [{ serverId: asker, message }] };
      }
      if (decided.kind !== 'asked') return { result: { kind: decided.kind } };
      const { row, tell } = decided;
      await this.options.storage.put(row);
      this.keep(row);
      if (row !== before && row.askedAt === now) {
        this.options.log.info({ server: asker, asked: target }, 'a server asked to be neighbors');
      }
      if (!tell || pair === undefined || row.toldAt === null) return { result: { kind: 'asked' } };
      const message = neighborRequestPost(
        asker,
        this.nameOf(asker),
        row.askedAt + NEIGHBOR_ASK_EXPIRES_MS,
      );
      // The tell before this one: the pair's, where the row was a request of the same server's
      // (`decideAsk` keeps it so); none for a request anew of the other.
      const toldBefore = before?.askedBy === row.askedBy ? before.toldAt : null;
      return {
        result: { kind: 'asked' },
        tell: [
          {
            serverId: target,
            message,
            told: { pair, toldAt: row.toldAt, before: toldBefore },
          },
        ],
      };
    });
  }

  /**
   * The staff of `by` answer the request `asker` sent (`decideAccept`): accepted, both are
   * neighbors and the asker's lab is told; declined, the asker's lab hears only that. The post
   * of the request is the presser's to show anew.
   */
  answer(asker: string, by: string, accept: boolean): Promise<AnswerOutcome> {
    return this.decide<AnswerOutcome>(async () => {
      if (asker === by) return { result: { kind: 'expired' } };
      const pair = neighborPair(asker, by);
      const key = pairKey(pair);
      const row = this.rows.get(key);
      const now = this.now();
      const decided = decideAccept({
        row,
        by,
        now,
        count: accept ? this.countOf(by, key) : 0,
      });
      if (decided !== 'ok' || !row) {
        return { result: { kind: decided === 'full' ? 'full' : 'expired' } };
      }
      const answered: NeighborRow = accept
        ? { ...row, acceptedAt: now }
        : { ...row, declinedAt: now };
      await this.options.storage.put(answered);
      this.keep(answered);
      this.options.log.info(
        { server: by, asker, accepted: accept },
        accept ? 'two servers became neighbors' : 'a request to be neighbors was declined',
      );
      if (accept) this.told(pair, true);
      const message = accept ? acceptedNotice(by, this.nameOf(by)) : declinedNotice(by);
      return {
        result: { kind: accept ? 'accepted' : 'declined', name: this.nameOf(asker) },
        tell: [{ serverId: asker, message }],
      };
    });
  }

  /**
   * The staff of `by` end being neighbors with `other` (the row deleted, both labs told), or take
   * back their own request to it (the row kept as taken back, as long as its tell; nobody told);
   * `none` where there is neither.
   */
  end(by: string, other: string): Promise<'ended' | 'withdrawn' | 'none'> {
    return this.decide<'ended' | 'withdrawn' | 'none'>(async () => {
      if (by === other) return { result: 'none' };
      const pair = neighborPair(by, other);
      const key = pairKey(pair);
      const row = this.rows.get(key);
      const now = this.now();
      const standing = neighborStanding(row, now);
      if (row !== undefined && standing === 'asked' && row.askedBy === by) {
        const withdrawn: NeighborRow = { ...row, withdrawnAt: now };
        if (neighborRowKept(withdrawn, now)) {
          await this.options.storage.put(withdrawn);
          this.keep(withdrawn);
        } else {
          await this.options.storage.remove([pair]);
          this.forget(key);
        }
        this.options.log.info({ server: by, other }, 'a request to be neighbors was withdrawn');
        return { result: 'withdrawn' };
      }
      if (standing !== 'neighbors') return { result: 'none' };
      await this.options.storage.remove([pair]);
      this.forget(key);
      this.options.log.info({ server: by, other }, 'two servers stopped being neighbors');
      this.told(pair, false);
      return {
        result: 'ended',
        tell: [
          { serverId: other, message: endedNotice(by, this.nameOf(by)) },
          { serverId: by, message: endedByUsNotice(other, this.nameOf(other)) },
        ],
      };
    });
  }

  /** The week a decline keeps the same server from asking again. */
  askAgainAt(row: NeighborRow): number {
    return (row.declinedAt ?? this.now()) + NEIGHBOR_ASK_AGAIN_MS;
  }

  /**
   * Resolves once every change asked so far is done and every lab's post it asked for has been
   * sent or has failed: for tests, and for a shutdown that waits.
   */
  async idle(): Promise<void> {
    await this.queue;
    while (this.sending.size > 0) await Promise.all([...this.sending]);
  }

  private keep(row: NeighborRow): void {
    const key = pairKey(row);
    this.rows.set(key, row);
    for (const server of [row.serverA, row.serverB]) {
      const keys = this.ofServer.get(server) ?? new Set<string>();
      keys.add(key);
      this.ofServer.set(server, keys);
    }
  }

  private forget(key: string): void {
    const row = this.rows.get(key);
    if (!row) return;
    this.rows.delete(key);
    for (const server of [row.serverA, row.serverB]) {
      const keys = this.ofServer.get(server);
      keys?.delete(key);
      if (keys?.size === 0) this.ofServer.delete(server);
    }
  }

  private told(pair: NeighborPair, neighbors: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(pair, neighbors);
      } catch (err) {
        this.options.log.error({ err }, 'a listener of neighbors failed');
      }
    }
  }

  /**
   * Decides in the turn (`inTurn`), then asks the labs for what it decided to tell, without
   * waiting for them (review R1), and answers. A request's post that does not go has its tell
   * written back in a turn of its own after it (`untell`, review RR1): after the answer, which
   * so takes as long whatever comes of the post.
   */
  private async decide<T>(work: () => Promise<Decided<T>>): Promise<T> {
    const { result, tell = [] } = await this.inTurn(work);
    for (const { serverId, message, told } of tell) {
      const sending = this.tell(serverId, message).then(async (sent) => {
        if (!sent && told !== undefined) await this.untell(told);
      });
      this.sending.add(sending);
      void sending.finally(() => this.sending.delete(sending));
    }
    return result;
  }

  /**
   * Posts in a server's moderators' bot lab, where it can be told (a server Pine left is told
   * nothing); what fails is logged, never thrown: the change it tells of stands. Whether it went.
   */
  private async tell(serverId: string, message: V2Message): Promise<boolean> {
    if (!this.options.reach.reachable(serverId)) return false;
    try {
      const posted = await this.options.lab.post(serverId, message);
      if (posted === 'sent') return true;
      this.options.log.warn(
        { server: serverId, posted },
        'could not tell a server’s staff of its neighbors in its moderators’ bot lab',
      );
    } catch (err) {
      this.options.log.warn(
        { err, server: serverId },
        'could not tell a server’s staff of its neighbors in its moderators’ bot lab',
      );
    }
    return false;
  }

  /**
   * A request's post did not go (review RR1): in a turn, its pair's `toldAt` is written back to
   * the one before it by the primary key, only where the row still holds that tell's (a later
   * tell, or an end, stands), so that a repeat ask tells it once the lab works; a row that is no
   * longer kept so (a request taken back meanwhile) is deleted by its key. What fails is logged:
   * the tell then stands, and the request is told at the next ask a week after it.
   */
  private async untell(told: Tell): Promise<void> {
    try {
      await this.inTurn(async () => {
        const key = pairKey(told.pair);
        const row = this.rows.get(key);
        if (row === undefined || row.toldAt !== told.toldAt) return;
        const untold: NeighborRow = { ...row, toldAt: told.before };
        if (neighborRowKept(untold, this.now())) {
          await this.options.storage.put(untold);
          this.keep(untold);
        } else {
          await this.options.storage.remove([told.pair]);
          this.forget(key);
        }
      });
    } catch (err) {
      this.options.log.warn(
        { err, pair: pairKey(told.pair) },
        'could not write back the tell of a request to be neighbors whose post did not go',
      );
    }
  }

  /** One change at a time, each after the one before. */
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
