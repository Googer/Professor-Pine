import { ServerBoundedMap } from '../bounded-map.js';
import { isSnowflake } from '../db/snowflake.js';
import type { Logger } from '../log.js';

/**
 * Of these user ids (at most `MEMBERS_PER_LOOKUP`), those who are in the server and can view
 * the channel. Rejects when it could not be found out.
 */
export type ViewersFetch = (
  guildId: string,
  channelId: string,
  userIds: readonly string[],
) => Promise<ReadonlySet<string>>;

/** As many user ids as one gateway request for members may name (Discord's limit). */
export const MEMBERS_PER_REQUEST = 100;

/**
 * As many members as are asked about in one go: one short of what a request may name, because
 * every request names the bot itself too (`withSelf`).
 */
export const MEMBERS_PER_LOOKUP = MEMBERS_PER_REQUEST - 1;

/**
 * The user ids a gateway request for members names: those asked about, and the bot's own. The
 * bot is a member of every server it asks about, so its member must be in every answer: an
 * answer without it is no answer (`answeredMembers`). Without that, a request Discord answered
 * with nothing (it needs an intent after all, or the answer was lost) would read as "none of
 * them is a member", and be remembered.
 */
export function withSelf(userIds: readonly string[], selfId: string): string[] {
  return [...new Set([...userIds, selfId])];
}

/**
 * What a request made with `withSelf` found, for who asked about `userIds`: the members
 * without the bot's own (unless it was asked about). Throws when the bot is not among them:
 * that is no answer, and whoever asked over the gateway asks another way
 * (`GatewayWithFallback`).
 */
export function answeredMembers<T extends { id: string }>(
  found: Iterable<T>,
  selfId: string,
  userIds: readonly string[],
): T[] {
  const members = [...found];
  if (!members.some((member) => member.id === selfId)) {
    throw new Error('The gateway answered a request for members without the bot itself');
  }
  return userIds.includes(selfId) ? members : members.filter((member) => member.id !== selfId);
}

/**
 * What the batch look-up may send over the gateway connection. Discord closes a connection that
 * sends more than 120 events in 60 seconds (close code 4008), whatever the events are; requests
 * for members by user id count against that (reportedly not against the 30 seconds per server
 * of a request for the whole list; unverified until staging). `@discordjs/ws` queues what is
 * sent and sleeps before the 115th event of a minute, so the limit itself is not passed, but a
 * burst of these requests would then hold back everything else the connection sends. So the
 * look-up has a budget of its own, far below the limit: one request after the other, never two
 * at once, at most one a second and thirty in any minute (3,000 members a minute, five times
 * what `DmSender` sends in that time). A request beyond the budget waits for its turn.
 */
export const MEMBER_REQUEST_BUDGET = { gapMs: 1_000, perMinute: 30 } as const;

const MINUTE_MS = 60_000;

export interface RequestBudgetOptions {
  /** The least time between two requests. */
  gapMs: number;
  /** As many requests as may start within any minute. */
  perMinute: number;
  now?: () => number;
  /** Waits; a test passes one that moves its clock. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A budget for requests that are made one after the other: `take()` resolves when the next one
 * may start, and counts it. It is not a queue: whoever uses it must wait for one `take` before
 * asking for the next (`CachedViewers` runs its requests in one chain).
 */
export class RequestBudget {
  /** When the requests of the last minute started, oldest first. */
  private readonly started: number[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RequestBudgetOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms).unref();
        }));
  }

  /** How long the next request has to wait from now; 0 when it may start. */
  waitMs(): number {
    const now = this.now();
    while (this.started.length > 0 && now - (this.started[0] ?? 0) >= MINUTE_MS) {
      this.started.shift();
    }
    const last = this.started.at(-1);
    const forGap = last === undefined ? 0 : last + this.options.gapMs - now;
    const oldest = this.started[this.started.length - this.options.perMinute];
    const forMinute = oldest === undefined ? 0 : oldest + MINUTE_MS - now;
    return Math.max(0, forGap, forMinute);
  }

  /** Resolves when the next request may start, and counts it as started then. */
  async take(): Promise<void> {
    for (let wait = this.waitMs(); wait > 0; wait = this.waitMs()) await this.sleep(wait);
    this.started.push(this.now());
  }
}

/**
 * How long the gateway is left alone after a request for members over it failed: a minute after
 * the first failure, twice as long after every further one in a row, six hours at most.
 */
export const GATEWAY_REST = { firstMs: 60_000, maxMs: 6 * 60 * 60_000 } as const;

export interface GatewayWithFallbackOptions {
  now?: () => number;
  /** Told when the gateway fails for the first time, and when it answers again. */
  log?: Pick<Logger, 'warn' | 'info'>;
  /** How long Discord asks to wait, when `err` is its refusal of a request as rate limited. */
  retryAfterMs?: (err: unknown) => number | undefined;
}

/**
 * Asks over the gateway, and another way when that fails (a request for members that timed
 * out, was refused as rate limited or was answered without the bot itself, see
 * `answeredMembers`: the same members one by one over REST). After a failure
 * the gateway is left alone, for a minute at first and twice as long after every further
 * failure in a row, up to six hours (or for as long as Discord said, when that is longer); a
 * request that succeeds makes it a minute again. A gateway that stays broken (the request
 * needing an intent the bot lacks after all) so costs one lost request every six hours, not one
 * a minute. It warns when the gateway first fails and says when it answers again, and nothing
 * between: a failure that repeats is one state, not news.
 */
export class GatewayWithFallback {
  private readonly now: () => number;
  /** As many requests over the gateway as failed in a row. */
  private failures = 0;
  private until = 0;

  constructor(private readonly options: GatewayWithFallbackOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Until when only the other way is asked (epoch ms); in the past when the gateway is asked. */
  get restsUntil(): number {
    return this.until;
  }

  async ask<T>(overGateway: () => Promise<T>, otherwise: () => Promise<T>): Promise<T> {
    if (this.now() < this.until) return otherwise();
    let answer: T;
    try {
      answer = await overGateway();
    } catch (err) {
      const doubled = GATEWAY_REST.firstMs * 2 ** Math.min(this.failures, 30);
      const rest = Math.max(
        Math.min(doubled, GATEWAY_REST.maxMs),
        this.options.retryAfterMs?.(err) ?? 0,
      );
      this.failures += 1;
      this.until = this.now() + rest;
      if (this.failures === 1) {
        this.options.log?.warn(
          { err, restMs: rest },
          'the gateway request for members failed; asking for them one by one until it works again',
        );
      }
      return otherwise();
    }
    if (this.failures > 0) {
      this.options.log?.info(
        { failures: this.failures },
        'the gateway request for members works again',
      );
      this.failures = 0;
      this.until = 0;
    }
    return answer;
  }
}

/**
 * How long "this member sees the channel" is good for. Ten minutes: who could see a forum a
 * moment ago nearly always still can, and the next event there (a raid's boss, its gym) asks
 * about the same members again. Somebody who lost the view meanwhile gets one more message.
 */
export const SEES_MS = 10 * 60_000;
/**
 * How long "cannot see it" and "not a member" are good for. A minute, as an answer of
 * `CachedMemberDirectory`: who joins the server or is let into the forum is told of the next
 * event there.
 */
export const UNSEEN_MS = 60_000;
/**
 * As many answers as are remembered at once, over every server; the oldest of the server holding
 * the most goes first (`ServerBoundedMap`, plan 19B-5). An answer is a short key
 * and a flag: enough for the recipients of several events in a busy minute.
 */
const CACHE_SIZE = 20_000;

export interface CachedViewersOptions {
  now?: () => number;
  /** Waited for before every request; none by default. */
  budget?: Pick<RequestBudget, 'take'>;
  /** As many answers as are kept at once; `CACHE_SIZE` unless set (tests). */
  maxKept?: number;
}

/**
 * "Who of these members can see this channel" over a function that asks for at most a hundred
 * (`ViewersFetch`). The members are asked for in requests of `MEMBERS_PER_LOOKUP`, all
 * requests of all callers one after the other, each after the budget lets it start. An answer
 * is kept, "sees it" for ten minutes (`SEES_MS`), "cannot see it" and "not a member" for one
 * (`UNSEEN_MS`), so the next event in that channel asks only for whom it does not know; a
 * member whom an earlier request in the line has answered meanwhile is not asked for again. A
 * failure is not kept and rejects the call it belongs to; the requests behind it go on. A text
 * that cannot be a user id (`isSnowflake`) is nobody, and is not asked for.
 */
export class CachedViewers {
  private readonly known: ServerBoundedMap<string, { sees: boolean; until: number }>;
  /** The request that is last in line; the next one starts when it has settled. */
  private tail: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(
    private readonly fetch: ViewersFetch,
    private readonly options: CachedViewersOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.known = new ServerBoundedMap(options.maxKept ?? CACHE_SIZE);
  }

  private cached(guildId: string, key: string): boolean | undefined {
    const found = this.known.get(guildId, key);
    return found && found.until > this.now() ? found.sees : undefined;
  }

  private keep(guildId: string, key: string, sees: boolean): void {
    this.known.set(guildId, key, { sees, until: this.now() + (sees ? SEES_MS : UNSEEN_MS) });
  }

  async viewers(
    guildId: string,
    channelId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    const key = (userId: string): string => `${guildId}:${channelId}:${userId}`;
    const asked = [...new Set(userIds)].filter((id) => isSnowflake(id));
    const unknown = asked.filter((id) => this.cached(guildId, key(id)) === undefined);
    const seen = new Set(asked.filter((id) => this.cached(guildId, key(id)) === true));
    const requests: Promise<void>[] = [];
    for (let start = 0; start < unknown.length; start += MEMBERS_PER_LOOKUP) {
      const chunk = unknown.slice(start, start + MEMBERS_PER_LOOKUP);
      const request = this.tail.then(async () => {
        // Answered by a request that was ahead in the line: not asked for again.
        const still: string[] = [];
        for (const id of chunk) {
          const answer = this.cached(guildId, key(id));
          if (answer === undefined) still.push(id);
          else if (answer) seen.add(id);
        }
        if (still.length === 0) return;
        await this.options.budget?.take();
        const visible = await this.fetch(guildId, channelId, still);
        for (const id of still) {
          this.keep(guildId, key(id), visible.has(id));
          if (visible.has(id)) seen.add(id);
        }
      });
      // The line goes on after a request that failed.
      this.tail = request.catch(() => undefined);
      requests.push(request);
    }
    await Promise.all(requests);
    return seen;
  }
}
