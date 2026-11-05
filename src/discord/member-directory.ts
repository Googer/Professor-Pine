import {
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
  type Collection,
  type Guild,
  type GuildMember,
} from 'discord.js';
import { BoundedMap } from '../bounded-map.js';
import { isSnowflake } from '../db/snowflake.js';
import type { Logger } from '../log.js';
import {
  answeredMembers,
  CachedViewers,
  GatewayWithFallback,
  MEMBER_REQUEST_BUDGET,
  MEMBERS_PER_LOOKUP,
  RequestBudget,
  withSelf,
} from './member-viewers.js';

/** A member of a server, as far as the bot needs them outside an interaction of their own. */
export interface ServerMember {
  id: string;
  /** Their display name in that server. */
  name: string;
  /**
   * Their roles and whether they are an administrator, as Discord said when they were looked
   * up (`DiscordMemberDirectory` always says); undefined: not known, taken for no role and no
   * administrator.
   */
  standing?: MemberStanding;
}

/** A member's roles by name and whether they are an administrator, as Discord has them. */
export interface MemberStanding {
  roleNames: readonly string[];
  administrator: boolean;
  /**
   * Manage Server (also as an administrator), for the map's hint of the region editor
   * (`mayEditRegions`, plan 8M-10); not said: none.
   */
  manageGuild?: boolean;
  /**
   * Manage Messages in the server (also as an administrator), which the map's Delete… asks as
   * well as a staff role, as `/delete`'s `default_member_permissions` does (plan 8Z); not said:
   * none.
   */
  manageMessages?: boolean;
}

/**
 * The roles, the administrator permission, Manage Server and Manage Messages of a member as
 * discord.js gives them.
 */
export function memberStanding(member: GuildMember): MemberStanding {
  return {
    roleNames: member.roles.cache.map((role) => role.name),
    administrator: member.permissions.has(PermissionFlagsBits.Administrator),
    manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
    manageMessages: member.permissions.has(PermissionFlagsBits.ManageMessages),
  };
}

/**
 * Members of a server, looked up by id. The bot keeps no member list (that needs the
 * privileged GuildMembers intent, spec 3.1): somebody who is not the member of the interaction
 * at hand is asked for, one at a time (`find`) or many at once with what they can see
 * (`viewers`).
 */
export interface MemberDirectory {
  /**
   * The member of a server with this user id; undefined for somebody who is not in that server
   * (or no longer), and for a server the bot is not in. Throws for any other failure.
   */
  find(guildId: string, userId: string): Promise<ServerMember | undefined>;
  /**
   * Of these user ids, those who are members of the server and can view the channel (a text
   * channel or a forum of it; a post is seen by whoever sees its forum): who may be told by
   * direct message about something that happened there. However many are asked for, Discord is
   * asked in small requests one after the other, so this can take a while; answers are kept
   * briefly. Rejects when it could not be found out, also for a server or a channel the bot
   * does not know (at this moment: its cache may lack them for a while after a reconnect), so
   * that "nobody" is never remembered for what was not asked.
   */
  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>>;
  /**
   * Those of these user ids who are members of the server, with their display names (plan 8H-6:
   * the names a board shows): from discord.js's cache where it has them, the rest asked in one
   * request for many. Somebody who is not in the server is not among them. Rejects when it could
   * not be found out.
   */
  named(guildId: string, userIds: readonly string[]): Promise<ServerMember[]>;
}

/**
 * Asks Discord for one member of a server; undefined for somebody who is not in it. This is the
 * one place members are fetched (the party gateway asks through it too). Without `fresh` the
 * answer may come from discord.js's cache, where a member stays as their last interaction left
 * them: roles they got or lost since are not seen, and neither is their leaving. With `fresh`
 * Discord is always asked (REST; allowed without the GuildMembers intent).
 */
export async function fetchGuildMember(
  guild: Guild,
  userId: string,
  fresh = false,
): Promise<GuildMember | undefined> {
  try {
    return await guild.members.fetch({ user: userId, force: fresh });
  } catch (err) {
    if (
      err instanceof DiscordAPIError &&
      (err.code === RESTJSONErrorCodes.UnknownMember || err.code === RESTJSONErrorCodes.UnknownUser)
    ) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Asks for one member of a server: the member, or undefined for somebody who is not in it.
 * Rejects when it could not be found out.
 */
export type MemberFetch = (guildId: string, userId: string) => Promise<ServerMember | undefined>;

/** How long an answer of `CachedMemberDirectory` is good for: a "short-lived cache" (spec 3.1). */
const CACHE_MS = 60_000;
/**
 * The most added to that at random, per entry: answers taken in one moment (a signal's asks) would
 * otherwise run out in one moment, a herd of forced requests every minute.
 */
const CACHE_JITTER_MS = 30_000;
/** As many answers as are remembered at once; the oldest goes first. */
const CACHE_SIZE = 5_000;

/**
 * A directory over a function that asks for one member (`MemberFetch`). An answer, also "not a
 * member", is kept for 60 to 90 seconds, which bounds what a burst of look-ups costs; two look-ups of
 * one member at the same time are one request; a failure is not kept. A text that cannot be a
 * user id is nobody and is never asked for: Discord would read an empty id as a request for
 * all members of the server.
 */
export class CachedMemberDirectory implements Pick<MemberDirectory, 'find'> {
  private readonly known = new BoundedMap<
    string,
    { member: ServerMember | undefined; until: number }
  >(CACHE_SIZE);
  /** The look-ups that are on their way: a second one for the same member waits for the first. */
  private readonly asking = new Map<string, Promise<ServerMember | undefined>>();

  constructor(
    private readonly fetch: MemberFetch,
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => number = () => Math.random(),
  ) {}

  /** Whether `find` would answer without a request of its own: from memory, or one on its way. */
  holds(guildId: string, userId: string): boolean {
    if (!isSnowflake(userId)) return true;
    const key = `${guildId}:${userId}`;
    const cached = this.known.get(key);
    return (cached !== undefined && cached.until > this.now()) || this.asking.has(key);
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    if (!isSnowflake(userId)) return Promise.resolve(undefined);
    const key = `${guildId}:${userId}`;
    const cached = this.known.get(key);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.member);
    const waiting = this.asking.get(key);
    if (waiting) return waiting;
    const asked = this.ask(key, guildId, userId).finally(() => this.asking.delete(key));
    this.asking.set(key, asked);
    return asked;
  }

  private async ask(
    key: string,
    guildId: string,
    userId: string,
  ): Promise<ServerMember | undefined> {
    const member = await this.fetch(guildId, userId);
    this.known.set(key, {
      member,
      until: this.now() + CACHE_MS + this.random() * CACHE_JITTER_MS,
    });
    return member;
  }
}

/**
 * The one line of the gateway's requests for members (reviews A7, R-A4): `run` waits for the
 * request before it to settle and for the budget's turn (`RequestBudget.take`), then makes its
 * own and holds the line until it settles, so that `viewers` and `named` never have two requests
 * for members on their way at once and keep to one budget between them.
 */
export class BudgetLine {
  private last: Promise<void> = Promise.resolve();

  constructor(private readonly budget: Pick<RequestBudget, 'take'>) {}

  run<T>(request: () => Promise<T>): Promise<T> {
    const turn = this.last.then(async () => {
      await this.budget.take();
      return request();
    });
    this.last = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }
}

/**
 * How long one gateway request for members may take before the members are asked for one by
 * one instead. discord.js waits two minutes by default; an answer normally comes at once.
 */
const MEMBER_REQUEST_TIMEOUT_MS = 10_000;
/** The seconds Discord asks to wait, when `err` is its refusal of a gateway request as rate limited. */
function gatewayRetryAfterMs(err: unknown): number | undefined {
  if (!(err instanceof Error) || err.name !== 'GatewayRateLimitError') return undefined;
  const data = (err as { data?: { retry_after?: unknown } }).data;
  return typeof data?.retry_after === 'number' ? data.retry_after * 1_000 : undefined;
}

/**
 * The directory over a discord.js client: thin, and without unit tests like the party gateway
 * (the staging run is its test); what it remembers is `CachedMemberDirectory`'s and
 * `CachedViewers`'. The client is handed over once it exists; anything asked before that fails.
 * A look-up that is not answered from memory asks Discord afresh, so that somebody who left is
 * not found in the cache of an earlier interaction.
 *
 * `viewers` asks for up to ninety-nine members in one gateway request (Request Guild Members by
 * `user_ids`, which Discord documents as needing an intent only for the whole list and for
 * presences): discord.js builds the answer from the members that request itself brought (each
 * is put into its cache from the fresh data, roles included), and somebody who is not in the
 * server is simply not among them. The hundredth id of every request is the bot's own: an
 * answer without the bot's member is taken for a failure, never for "none of them is a member". Whether such a member sees the channel is then asked of the
 * channel as the cache has it; channels, their overwrites and the roles of the server are kept
 * current by the Guilds intent. When the gateway request fails, times out or is refused as
 * rate limited, the same members are asked for one at a time over REST (`fetchGuildMember`,
 * fresh), and the gateway is left alone for a while (`GatewayWithFallback`: a minute, longer
 * after every further failure, or for as long as Discord said).
 */
export class DiscordMemberDirectory implements MemberDirectory {
  private current: Client | undefined;
  private readonly cached: CachedMemberDirectory;
  private readonly seeing: CachedViewers;
  private readonly members: GatewayWithFallback;
  /** The one budget of the gateway's requests for members, `viewers`' and `named`'s (A7). */
  private readonly line: BudgetLine;
  private readonly now: () => number;

  constructor(options: { now?: () => number; log?: Logger } = {}) {
    const now = options.now ?? (() => Date.now());
    this.members = new GatewayWithFallback({
      now,
      ...(options.log ? { log: options.log } : {}),
      retryAfterMs: gatewayRetryAfterMs,
    });
    this.now = now;
    this.line = new BudgetLine(new RequestBudget({ ...MEMBER_REQUEST_BUDGET, now }));
    this.cached = new CachedMemberDirectory(async (guildId, userId) => {
      const guild = this.current?.guilds.cache.get(guildId);
      const found = guild && (await fetchGuildMember(guild, userId, true));
      return found && { id: found.id, name: found.displayName, standing: memberStanding(found) };
    }, now);
    this.seeing = new CachedViewers(
      async (guildId, channelId, userIds) => {
        const guild = this.current?.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(channelId);
        // Thrown, not answered with nobody: an answer is remembered, and a server or channel
        // the cache lacks at this moment says nothing about who can see it.
        if (!guild) throw new Error(`The server ${guildId} is not known`);
        if (!channel || channel.isThread()) {
          throw new Error(`The channel ${channelId} is not known, or is a thread`);
        }
        if (userIds.length === 0) return new Set<string>();
        const members = await this.line.run(() => this.freshMembers(guild, userIds));
        const seeing = new Set<string>();
        for (const member of members) {
          if (channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) {
            seeing.add(member.id);
          }
        }
        return seeing;
      },
      // The budget is the line's, which every request for members goes through.
      { now },
    );
  }

  /** Those of these users who are members of the server, as Discord has them now. */
  private freshMembers(guild: Guild, userIds: readonly string[]): Promise<GuildMember[]> {
    return this.members.ask(
      async () => {
        const selfId = guild.client.user.id;
        const found: Collection<string, GuildMember> = await guild.members.fetch({
          user: withSelf(userIds, selfId),
          time: MEMBER_REQUEST_TIMEOUT_MS,
        });
        // Throws when the bot's own member is missing: the fallback runs, the rest begins.
        return answeredMembers(found.values(), selfId, userIds);
      },
      async () => {
        const members: GuildMember[] = [];
        for (const userId of userIds) {
          const member = await fetchGuildMember(guild, userId, true);
          if (member) members.push(member);
        }
        return members;
      },
    );
  }

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  /** Whether `find` would answer without asking Discord (`CachedMemberDirectory.holds`). */
  holds(guildId: string, userId: string): boolean {
    if (!this.current?.guilds.cache.has(guildId)) return true;
    return this.cached.holds(guildId, userId);
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    if (!this.current) return Promise.reject(new Error('Discord is not connected yet'));
    // A server that is not in the cache (the bot is not in it, or it is unavailable for the
    // moment) has no members to find, and nothing is remembered about it.
    if (!this.current.guilds.cache.has(guildId)) return Promise.resolve(undefined);
    return this.cached.find(guildId, userId);
  }

  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>> {
    if (!this.current) return Promise.reject(new Error('Discord is not connected yet'));
    return this.seeing.viewers(guildId, channelId, userIds);
  }

  /**
   * The names a board shows (plan 8H-6, B4): every id asked of Discord in requests of
   * `MEMBERS_PER_LOOKUP` by user id over the gateway, which Discord allows without the
   * GuildMembers intent (its docs name the intent only for the whole list), so that somebody who
   * left is found gone (review A2: without that intent the cache never hears of a member
   * leaving). Only while the gateway rests after a failure (`GatewayWithFallback.restsUntil`) are
   * the cache's members taken as it has them, the rest asked over REST one by one
   * (`freshMembers`). Its requests take turns with those of `viewers`, one at a time on one
   * budget (`line`, reviews A7, R-A4). A server the cache lacks rejects (A8): nothing can be said of its members.
   */
  async named(guildId: string, userIds: readonly string[]): Promise<ServerMember[]> {
    if (!this.current) throw new Error('Discord is not connected yet');
    const guild = this.current.guilds.cache.get(guildId);
    if (!guild) throw new Error(`The server ${guildId} is not known`);
    const resting = this.members.restsUntil > this.now();
    const found: ServerMember[] = [];
    const ask: string[] = [];
    for (const id of userIds) {
      if (!isSnowflake(id)) continue;
      const cached = resting ? guild.members.cache.get(id) : undefined;
      if (cached) found.push({ id, name: cached.displayName });
      else ask.push(id);
    }
    for (let start = 0; start < ask.length; start += MEMBERS_PER_LOOKUP) {
      const batch = ask.slice(start, start + MEMBERS_PER_LOOKUP);
      const members = await this.line.run(() => this.freshMembers(guild, batch));
      found.push(...members.map((member) => ({ id: member.id, name: member.displayName })));
    }
    return found;
  }
}
