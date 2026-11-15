import { ChannelType, DiscordAPIError, OverwriteType, PermissionFlagsBits as P } from 'discord.js';
import type { ApiOverwrite, ApiRole } from '../../src/ops/permissions.js';

/** One request made of the fake API. */
export interface ApiRequest {
  method: 'GET' | 'DELETE';
  route: string;
  /** The query, as `key=value&…`, where there was one. */
  query?: string;
  reason?: string;
}

export interface FakeApiChannel {
  id: string;
  name: string;
  type: ChannelType;
  parentId: string | null;
  overwrites: ApiOverwrite[];
  /** Its messages, oldest first: their authors, or their authors and texts. */
  messages: (string | { author: string; content: string })[];
  /** The bot may not read its messages (Discord answers 403, Missing Access). */
  unreadable?: boolean;
}

export interface FakeApiGuild {
  id: string;
  name: string;
  ownerId: string;
  roles: ApiRole[];
  /** The roles of each member, by user id. */
  members: Map<string, string[]>;
  channels: FakeApiChannel[];
}

/** The bot's own ids in the fake. */
export const FAKE_APP_ID = '400000000000000777';
export const FAKE_BOT_ID = '400000000000000777';

let nextId = 700000000000000000n;
/** A made-up snowflake, new at every call. */
export function fakeSnowflake(): string {
  nextId += 1n;
  return String(nextId);
}

/** Discord's error as discord.js throws it. */
export function apiError(
  status: number,
  code: number,
  message: string,
  method: string,
  route: string,
): DiscordAPIError {
  return new DiscordAPIError({ code, message }, code, status, method, route, {});
}

/**
 * Discord's REST API as the cutover tools read it (the application, the bot's servers, their
 * roles, members, channels and the oldest message of a channel) and as the legacy cleanup
 * deletes channels, over an in-memory model. Every request is recorded; a route it does not know
 * is answered 404, as Discord would, and a deleted channel is gone (10003, Unknown Channel).
 */
export class FakeDiscordApi {
  readonly requests: ApiRequest[] = [];
  readonly guilds = new Map<string, FakeApiGuild>();
  application = { id: FAKE_APP_ID, name: 'Professor Pine', flags: 0, bot_public: false };
  bot = { id: FAKE_BOT_ID, username: 'Professor Pine' };
  /** The names of the application's emoji. */
  emoji: string[] = [];
  /** The names of the application's global commands (`GET /applications/{id}/commands`). */
  globalCommands: string[] = [];
  /** Every request fails with this error from now on (Discord down, a bad token). */
  failWith: Error | undefined;
  /** Routes answered with an error of their own (a GET of one server that fails). */
  readonly refused = new Map<string, Error>();
  /** Channels deleted, in order. */
  readonly deleted: string[] = [];

  addGuild(name: string, options: { id?: string; ownerId?: string } = {}): FakeApiGuild {
    const id = options.id ?? fakeSnowflake();
    const ownerId = options.ownerId ?? fakeSnowflake();
    const guild: FakeApiGuild = {
      id,
      name,
      ownerId,
      roles: [{ id, name: '@everyone', permissions: '0', position: 0 }],
      members: new Map(),
      channels: [],
    };
    this.guilds.set(id, guild);
    return guild;
  }

  addRole(guild: FakeApiGuild, name: string, ...flags: bigint[]): string {
    const id = fakeSnowflake();
    guild.roles.push({
      id,
      name,
      permissions: String(flags.reduce((all, flag) => all | flag, 0n)),
      position: guild.roles.length,
    });
    return id;
  }

  addChannel(
    guild: FakeApiGuild,
    name: string,
    options: {
      id?: string;
      type?: ChannelType;
      parentId?: string | null;
      overwrites?: ApiOverwrite[];
      messages?: (string | { author: string; content: string })[];
    } = {},
  ): FakeApiChannel {
    const channel: FakeApiChannel = {
      id: options.id ?? fakeSnowflake(),
      name,
      type: options.type ?? ChannelType.GuildText,
      parentId: options.parentId ?? null,
      overwrites: options.overwrites ?? [],
      messages: options.messages ?? [],
    };
    guild.channels.push(channel);
    return channel;
  }

  channel(id: string): FakeApiChannel | undefined {
    for (const guild of this.guilds.values()) {
      const found = guild.channels.find((channel) => channel.id === id);
      if (found) return found;
    }
    return undefined;
  }

  get(route: `/${string}`, options: { query?: URLSearchParams } = {}): Promise<unknown> {
    const query = options.query?.toString();
    this.requests.push({ method: 'GET', route, ...(query ? { query } : {}) });
    if (this.failWith) return Promise.reject(this.failWith);
    const refusal = this.refused.get(route);
    if (refusal) return Promise.reject(refusal);
    // A throw of the answer becomes the rejection, as an error of Discord would.
    return Promise.resolve().then(() => this.answer(route, options.query));
  }

  delete(route: `/${string}`, options: { reason?: string } = {}): Promise<unknown> {
    this.requests.push({
      method: 'DELETE',
      route,
      ...(options.reason === undefined ? {} : { reason: options.reason }),
    });
    if (this.failWith) return Promise.reject(this.failWith);
    const match = /^\/channels\/(\d+)$/.exec(route);
    if (!match?.[1]) return Promise.reject(apiError(404, 0, '404: Not Found', 'DELETE', route));
    for (const guild of this.guilds.values()) {
      const index = guild.channels.findIndex((channel) => channel.id === match[1]);
      if (index < 0) continue;
      const [gone] = guild.channels.splice(index, 1);
      this.deleted.push(match[1]);
      return Promise.resolve({ id: gone?.id });
    }
    return Promise.reject(apiError(404, 10003, 'Unknown Channel', 'DELETE', route));
  }

  /** Whether every request so far only read. */
  onlyRead(): boolean {
    return this.requests.every((request) => request.method === 'GET');
  }

  private guildOf(id: string | undefined, route: string): FakeApiGuild {
    const guild = id === undefined ? undefined : this.guilds.get(id);
    if (!guild) throw apiError(404, 10004, 'Unknown Guild', 'GET', route);
    return guild;
  }

  private answer(route: string, query: URLSearchParams | undefined): unknown {
    if (route === '/applications/@me') return { ...this.application };
    if (route === `/applications/${this.application.id}/emojis`) {
      return { items: this.emoji.map((name, i) => ({ id: String(i + 1), name })) };
    }
    if (route === `/applications/${this.application.id}/commands`) {
      return this.globalCommands.map((name, i) => ({ id: String(i + 1), name }));
    }
    if (route === '/users/@me') return { ...this.bot };
    if (route === '/users/@me/guilds') {
      // As Discord pages them: by id, those after `after` (none: from the first), at most
      // `limit` (200 unless asked for fewer; 200 at most).
      const after = BigInt(query?.get('after') ?? '0');
      const limit = Math.min(Number(query?.get('limit') ?? '200'), 200);
      return [...this.guilds.values()]
        .filter((guild) => guild.members.has(this.bot.id) && BigInt(guild.id) > after)
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        .slice(0, limit)
        .map((guild) => ({ id: guild.id, name: guild.name }));
    }
    let match = /^\/guilds\/(\d+)$/.exec(route);
    if (match) {
      const guild = this.guildOf(match[1], route);
      return { id: guild.id, name: guild.name, owner_id: guild.ownerId, roles: guild.roles };
    }
    match = /^\/guilds\/(\d+)\/members\/(\d+)$/.exec(route);
    if (match) {
      const guild = this.guildOf(match[1], route);
      const roles = guild.members.get(match[2] ?? '');
      if (!roles) throw apiError(404, 10007, 'Unknown Member', 'GET', route);
      return { user: { id: match[2] }, roles };
    }
    match = /^\/guilds\/(\d+)\/channels$/.exec(route);
    if (match) {
      const guild = this.guildOf(match[1], route);
      return guild.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parent_id: channel.parentId,
        permission_overwrites: channel.overwrites,
      }));
    }
    match = /^\/channels\/(\d+)\/messages$/.exec(route);
    if (match) {
      const channel = this.channel(match[1] ?? '');
      if (!channel) throw apiError(404, 10003, 'Unknown Channel', 'GET', route);
      if (channel.unreadable) throw apiError(403, 50001, 'Missing Access', 'GET', route);
      // Only the question for the oldest message is known: `after=0&limit=1`.
      if (query?.get('after') !== '0' || query.get('limit') !== '1') {
        throw new Error(`the fake answers only after=0&limit=1, not ${query?.toString() ?? ''}`);
      }
      const first = channel.messages[0];
      if (first === undefined) return [];
      const { author, content } =
        typeof first === 'string' ? { author: first, content: '' } : first;
      return [{ id: `${channel.id}-1`, author: { id: author }, content }];
    }
    throw apiError(404, 0, '404: Not Found', 'GET', route);
  }
}

/** Everything the bot asks for in a server, as one role's permissions. */
export const BOT_PERMISSIONS = [
  P.ViewChannel,
  P.SendMessages,
  P.SendMessagesInThreads,
  P.EmbedLinks,
  P.AttachFiles,
  P.ReadMessageHistory,
  P.ManageChannels,
  P.ManageRoles,
  P.ManageThreads,
  P.ManageMessages,
  P.AddReactions,
  P.UseExternalEmojis,
  P.PinMessages,
];

/** An overwrite of a role or a member. */
export function overwrite(
  id: string,
  allow: readonly bigint[],
  deny: readonly bigint[] = [],
  type: OverwriteType = OverwriteType.Role,
): ApiOverwrite {
  const bits = (flags: readonly bigint[]) => String(flags.reduce((all, flag) => all | flag, 0n));
  return { id, type, allow: bits(allow), deny: bits(deny) };
}
