import { randomBytes } from 'node:crypto';

/**
 * What a member is told whose question is no longer known (`take` answered `expired`: answered
 * already, too old, or from before a restart), and of a question another member asked
 * (`not-yours`). Every question of a `PendingRequests` says these, in these words.
 */
export const EXPIRED = 'That has expired. Use the command again.';
export const NOT_YOURS = 'That is somebody else’s question.';

/**
 * Who asks, and where: the member and the server an interaction came from (`guildId`, null in a
 * DM). A Discord interaction is one; so is a message's author where it was posted.
 */
export interface Asker {
  readonly user: { readonly id: string };
  readonly guildId: string | null;
}

/**
 * What a command has to remember between asking a member something with buttons or a menu and
 * the answer: the values are kept in memory under a token that goes into the custom id of the
 * controls. A request belongs to the member who made it and to the server it was made in (or to
 * the DM), is answered once, and is forgotten after `ttlMs` (a restart forgets all of them; the
 * control then says it has expired). A token pressed from another server, or from a DM for a
 * question of a server and the other way round, is answered as expired (plan 19B-4: anything of
 * another server is as if it did not exist), whoever presses it, and stays for its own.
 */
export class PendingRequests<T> {
  private readonly requests = new Map<
    string,
    { ownerId: string; serverId: string | null; value: T; expires: number }
  >();
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.max = options.max ?? 1_000;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Remembers a value for a member and gives the token to put into the custom id. With `reuse`,
   * under that token, in place of what it held (a question asked again replaces itself, and the
   * store does not grow with each asking; the token must be as hard to guess as a new one).
   */
  put(asker: Asker, value: T, reuse?: string): string {
    const now = this.now();
    if (reuse !== undefined) this.requests.delete(reuse);
    for (const [token, request] of this.requests) {
      if (request.expires <= now) this.requests.delete(token);
    }
    // Oldest first: a Map keeps the order in which entries were added.
    while (this.requests.size >= this.max) {
      const oldest = this.requests.keys().next();
      if (oldest.done) break;
      this.requests.delete(oldest.value);
    }
    const token = reuse ?? randomBytes(8).toString('hex');
    this.requests.set(token, {
      ownerId: asker.user.id,
      serverId: asker.guildId,
      value,
      expires: now + this.ttlMs,
    });
    return token;
  }

  /**
   * The value for a token, which is then forgotten. `expired` when there is none (answered
   * already, too old, or from before a restart, or a request of another server, which stays);
   * `not-yours` for another member's request of this server, which stays.
   */
  take(token: string, asker: Asker): { value: T } | 'expired' | 'not-yours' {
    const request = this.requests.get(token);
    if (!request || request.expires <= this.now()) {
      this.requests.delete(token);
      return 'expired';
    }
    if (request.serverId !== asker.guildId) return 'expired';
    if (request.ownerId !== asker.user.id) return 'not-yours';
    this.requests.delete(token);
    return { value: request.value };
  }

  /**
   * The value for a token, which stays: for a question that leads to a form first (the member
   * may close the form and press another button of the question after all). `expired` and
   * `not-yours` as for `take`.
   */
  peek(token: string, asker: Asker): { value: T } | 'expired' | 'not-yours' {
    const request = this.requests.get(token);
    if (!request || request.expires <= this.now()) {
      this.requests.delete(token);
      return 'expired';
    }
    if (request.serverId !== asker.guildId) return 'expired';
    return request.ownerId === asker.user.id ? { value: request.value } : 'not-yours';
  }

  get size(): number {
    return this.requests.size;
  }
}
