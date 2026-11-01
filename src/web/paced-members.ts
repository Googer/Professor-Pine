import type { MemberDirectory, ServerMember } from '../discord/member-directory.js';
import type { Logger } from '../log.js';

/** The fresh fetches of members that the web's list and post asks may cause in a second. */
export const MEMBER_LOOKUPS_PER_SECOND = 20;

/**
 * How long a paced fetch is waited for before the next one goes on: a call stuck in a 429's sleep
 * does not stop the queue. discord.js's own queue then holds that one and the next.
 */
export const PACED_FETCH_PATIENCE_MS = 5_000;

/** A directory that says which answers need no request of Discord (`CachedMemberDirectory`). */
export type PacedDirectory = Pick<MemberDirectory, 'find'> & {
  holds(guildId: string, userId: string): boolean;
};

export interface MemberPace {
  perSecond: number;
  setTimer(run: () => void, ms: number): () => void;
}

/** A look-up refused because the web server is closing: nobody's failure, and not to be logged. */
export class MembersClosingError extends Error {
  constructor() {
    super('the web server is closing');
    this.name = 'MembersClosingError';
  }
}

interface Waiting {
  guildId: string;
  userId: string;
  answer: Promise<ServerMember | undefined>;
  resolve(member: ServerMember | undefined): void;
  reject(err: unknown): void;
}

/**
 * The member look-ups of the map's list and post asks, paced (design
 * `2026-10-31-map-live-updates-design.md`, reviews D2, R2-1): a signal makes every open map ask, and
 * where the members' answers have run out each ask would be a forced request of Discord in one
 * moment. So those wait here, first in first out, one per member however many asks wait on it, at
 * most `perSecond` and one at a time: discord.js runs one server's member requests one after the
 * other, so starting more would only move the backlog into its queue, in front of everybody else's.
 * An answer the directory holds passes at once and spends no turn. Presses, `/api/me` and Discord's
 * own handlers ask the directory itself: they do not wait in this queue, only behind the one paced
 * request on its way, and what they fetch releases whoever waited for the same member.
 */
export class PacedMembers implements Pick<MemberDirectory, 'find'> {
  /** By member, in their order of arrival. */
  private readonly waiting = new Map<string, Waiting>();
  private cancel: (() => void) | undefined;
  /** The paced fetch on its way, by what stops waiting for it. */
  private inFlight: { cancelPatience: () => void } | undefined;
  private lastAt = -Infinity;
  private closed = false;
  /**
   * Rejected at `close`: an answer raced against it, so that a fetch asleep in a 429 holds nobody's
   * request, and so no web server's close, past that.
   */
  private readonly closing: Promise<never>;
  private refuseAll = (_err: unknown): void => undefined;

  constructor(
    private readonly directory: PacedDirectory,
    private readonly pace: MemberPace & { now(): number; log: Pick<Logger, 'debug'> },
  ) {
    this.closing = new Promise<never>((_yes, no) => {
      this.refuseAll = no;
    });
    this.closing.catch(() => undefined);
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    if (this.closed) return Promise.reject(new MembersClosingError());
    const key = `${guildId}:${userId}`;
    const kept = this.waiting.get(key);
    if (this.directory.holds(guildId, userId)) {
      // Somebody's press has the answer by now: whoever waited for it need not wait on.
      const asked = this.untilClosed(guildId, userId);
      if (kept) {
        this.waiting.delete(key);
        this.settle(kept, asked);
      }
      return asked;
    }
    if (kept) return kept.answer;
    let resolve = (_member: ServerMember | undefined): void => undefined;
    let reject = (_err: unknown): void => undefined;
    const answer = new Promise<ServerMember | undefined>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.waiting.set(key, { guildId, userId, answer, resolve, reject });
    this.pace.log.debug({ waiting: this.waiting.size }, 'member look-ups of the map wait');
    this.drain();
    return answer;
  }

  /** Whoever waits is refused, so that no answer holds the web server's close. */
  close(): void {
    this.closed = true;
    this.refuseAll(new MembersClosingError());
    this.cancel?.();
    this.cancel = undefined;
    this.inFlight?.cancelPatience();
    this.inFlight = undefined;
    for (const one of this.waiting.values()) one.reject(new MembersClosingError());
    this.waiting.clear();
  }

  /** The directory's answer, or the close if that comes first. */
  private untilClosed(guildId: string, userId: string): Promise<ServerMember | undefined> {
    return Promise.race([this.directory.find(guildId, userId), this.closing]);
  }

  private settle(one: Waiting, asked: Promise<ServerMember | undefined>): void {
    asked.then(
      (member) => {
        one.resolve(member);
      },
      (err: unknown) => {
        one.reject(err);
      },
    );
  }

  private drain(): void {
    if (this.closed) return;
    // Those answered meanwhile go first: they need no turn, wherever they are in the line.
    let next: [string, Waiting] | undefined;
    for (const entry of this.waiting) {
      const [key, one] = entry;
      if (this.directory.holds(one.guildId, one.userId)) {
        this.waiting.delete(key);
        this.settle(one, this.untilClosed(one.guildId, one.userId));
      } else {
        next ??= entry;
      }
    }
    if (!next || this.inFlight || this.cancel) return;
    // At most the interval: a wall clock that steps back must not stall the queue.
    const interval = 1_000 / this.pace.perSecond;
    const wait = Math.min(interval, this.lastAt + interval - this.pace.now());
    if (wait > 0) {
      this.cancel = this.pace.setTimer(() => {
        this.cancel = undefined;
        // Its wait is over, whatever the clock says now.
        this.lastAt = -Infinity;
        this.drain();
      }, wait);
      return;
    }
    const [key, one] = next;
    this.waiting.delete(key);
    this.lastAt = this.pace.now();
    this.fetch(one);
  }

  /** One paced fetch: the next when it has settled, or when its patience has run out. */
  private fetch(one: Waiting): void {
    const flight = {
      cancelPatience: this.pace.setTimer(() => {
        goOn();
      }, PACED_FETCH_PATIENCE_MS),
    };
    const goOn = (): void => {
      if (this.inFlight !== flight) return;
      flight.cancelPatience();
      this.inFlight = undefined;
      this.drain();
    };
    this.inFlight = flight;
    this.untilClosed(one.guildId, one.userId).then(
      (member) => {
        goOn();
        one.resolve(member);
      },
      (err: unknown) => {
        goOn();
        one.reject(err);
      },
    );
  }
}
