import { Events, type Client } from 'discord.js';
import type { Logger } from '../log.js';

/** A shard ready (`ShardReadiness.onShardReady`): its servers, for the work at its start. */
export interface ShardStart {
  shard: number;
  /**
   * The shard's servers in the client's cache at its ready but those `gone` (those Discord said
   * unavailable included, and those that added the bot between the READY and the ready).
   */
  servers: readonly string[];
  /**
   * The shard's servers in the cache just before its READY that the READY does not name (19D
   * fix round 1, F2; round 2, R1): they removed the bot while the shard was away, and
   * discord.js, which only adds the servers of a READY and hears no delete for them, keeps them.
   * Not in `servers`. None at the login (the cache is empty then) or without a READY packet.
   */
  gone: readonly string[];
  /** The servers the shard's READY named (`Events.Raw`); absent where no READY packet was seen. */
  inReady?: ReadonlySet<string>;
  /** The servers Discord had not sent by the ready (`ShardReady`'s second argument): their channels are not known. */
  unavailable: ReadonlySet<string>;
  /** The shard's first ready in the client's life (the login's); false after a new session. */
  first: boolean;
}

/** Every shard is ready (`ShardReadiness.onEveryShardReady`, plan 19C-1). */
export interface EveryShardReady {
  /**
   * The servers the bot is in now: each shard's at its last ready (`ShardStart.servers`, those
   * Discord said unavailable included, those gone left out), with the servers that added the bot
   * on that shard since (`GuildCreate`) and without those that removed it (`GuildDelete`). Never
   * the client's cache, which keeps the gone ones.
   */
  present: ReadonlySet<string>;
  /**
   * Whether a server is present now (`ShardReadiness.isPresent`): `present` followed since by the
   * joins and removals, for a listener that decides after an await (plan 19C-1, J2).
   */
  isPresent(serverId: string): boolean;
}

/** The client is ready (`ShardReadiness.onClientReady`, plan 19C-1, J2). */
export interface ClientReadyServers {
  /**
   * The cached servers no shard's ready covered: they added the bot on a shard ready already
   * while later shards still identified, and discord.js says no `GuildCreate` before the client
   * is ready. Present from now on.
   */
  uncovered: readonly string[];
}

export interface ShardReadinessOptions {
  log: Logger;
  /**
   * The ids of the client's shards (`client.ws.shards`' keys): discord.js makes every shard at the
   * login, before the first of them is ready.
   */
  shardIds: () => Iterable<number>;
  /** The servers of a shard in the client's cache (`guild.shardId`). */
  serversOf: (shard: number) => readonly string[];
}

/**
 * Each shard's ready and the moment every shard is ready (plan 19D). discord.js says `ShardReady`
 * at each READY of a shard (the login's, then after every new session) and `ClientReady` once in
 * the client's life, after the last shard's first ready; the work per server is done per shard, so
 * that a server on a late shard is not missed and a new session redoes what must be redone.
 *
 * - `onShardReady`: the shard, its servers as the client has them then and as its READY names
 *   them (the READY packet read from `Events.Raw`, whose second argument is the shard), those the
 *   cache keeps that the READY no longer names (`gone`), those Discord said unavailable, and
 *   whether it is the shard's first ready.
 * - `onEveryShardReady`: every shard is ready (by its ready or its resume; one away, by
 *   `ShardReconnecting` or `ShardDisconnect` for good, is waited for) and one had a new session
 *   since the last time this was said. A resume loses no event and says nothing. What it can
 *   promise: each shard's servers were given to `onShardReady` at its last ready, with those gone
 *   since flagged; the client's cache holds every server of the READYs, but also those gone (until
 *   discord.js hears of them, which it may never), so the listener is given the servers present
 *   (`EveryShardReady.present`, plan 19C-1): each shard's last `ShardStart`, followed since by the
 *   servers that added the bot on it (`GuildCreate`) and removed it (`GuildDelete`), never the
 *   cache. At the login it is said at the last shard's first ready, before `ClientReady`: before
 *   the client is marked connected and before `botServers` is set, so a listener must not need
 *   either. What a listener decides after an await it asks of `isPresent` (the same sets, live),
 *   never of the snapshot it was given (plan 19C-1, J2).
 * - `onClientReady`: at `ClientReady`, the cached servers no shard's ready covered (added between
 *   two shards' readies, without an event), from then on present.
 *
 * A listener that throws is logged, and the others are told.
 */
export class ShardReadiness {
  /** The shards whose first ready came. */
  private readonly readied = new Set<number>();
  /** The shards ready now. */
  private readonly up = new Set<number>();
  /** A new session since every shard was last said to be ready (the login's first). */
  private owed = false;
  /**
   * Each shard's last READY: the servers it named, and the shard's servers in the cache just
   * before it (`Events.Raw` comes before discord.js handles the packet).
   */
  private readonly inReady = new Map<
    number,
    { named: ReadonlySet<string>; before: readonly string[] }
  >();
  /** Each shard's servers present: those of its last ready, followed by its joins and removals. */
  private readonly present = new Map<number, Set<string>>();
  /** Each shard's servers gone at its last ready (`ShardStart.gone`). */
  private readonly lastGone = new Map<number, readonly string[]>();
  private readonly shardListeners: ((start: ShardStart) => void)[] = [];
  private readonly everyListeners: ((every: EveryShardReady) => void)[] = [];
  private readonly clientListeners: ((ready: ClientReadyServers) => void)[] = [];

  constructor(private readonly options: ShardReadinessOptions) {}

  /** Listens to the client's shard events; `this`, to chain. */
  attach(client: Pick<Client, 'on'>): this {
    // A server added or removed since its shard's ready (plan 19C-1); an outage is
    // `GuildUnavailable`, never a removal.
    client.on(Events.GuildCreate, (guild) => {
      this.present.get(guild.shardId)?.add(guild.id);
    });
    client.on(Events.GuildDelete, (guild) => {
      this.present.get(guild.shardId)?.delete(guild.id);
    });
    // discord.js gives every packet of the gateway as it comes, before it handles it: the cache
    // is still as it was before this READY.
    client.on(Events.Raw, (packet: unknown, shard: unknown) => {
      const named = readyGuilds(packet);
      if (named === undefined || typeof shard !== 'number') return;
      this.inReady.set(shard, { named, before: this.options.serversOf(shard) });
    });
    client.on(Events.ShardReady, (shard, unavailable) => {
      this.ready(shard, unavailable);
    });
    // Once, after the last shard's first ready (plan 19C-1, J2).
    client.on(Events.ClientReady, () => {
      this.clientReady();
    });
    client.on(Events.ShardResume, (shard) => {
      this.up.add(shard);
      this.sayEveryReady();
    });
    client.on(Events.ShardReconnecting, (shard) => {
      this.up.delete(shard);
    });
    client.on(Events.ShardDisconnect, (_event, shard) => {
      this.up.delete(shard);
    });
    return this;
  }

  /** Who is told of each shard's ready (the start-up work per server). */
  onShardReady(listener: (start: ShardStart) => void): this {
    this.shardListeners.push(listener);
    return this;
  }

  /** Who is told that every shard is ready, with the servers present (plan 19C-1's checks). */
  onEveryShardReady(listener: (every: EveryShardReady) => void): this {
    this.everyListeners.push(listener);
    return this;
  }

  /**
   * Who is told at the client's ready of the cached servers no shard's ready covered (plan 19C-1,
   * J2); told before any listener of `ClientReady` added after `attach`.
   */
  onClientReady(listener: (ready: ClientReadyServers) => void): this {
    this.clientListeners.push(listener);
    return this;
  }

  /**
   * Whether the bot is in a server now: one of a shard's servers at its last ready (unavailable
   * included, gone left out), followed since by the joins and removals.
   */
  isPresent(serverId: string): boolean {
    for (const servers of this.present.values()) if (servers.has(serverId)) return true;
    return false;
  }

  private clientReady(): void {
    const { log, shardIds, serversOf } = this.options;
    const uncovered: string[] = [];
    for (const shard of shardIds()) {
      const present = this.present.get(shard);
      if (present === undefined) continue;
      const gone = this.lastGone.get(shard) ?? [];
      for (const server of serversOf(shard)) {
        if (present.has(server) || gone.includes(server)) continue;
        present.add(server);
        uncovered.push(server);
      }
    }
    for (const listener of this.clientListeners) {
      try {
        listener({ uncovered });
      } catch (err) {
        log.error({ err }, 'could not tell that the client is ready');
      }
    }
  }

  private ready(shard: number, unavailable: ReadonlySet<string> | undefined): void {
    const { log, serversOf } = this.options;
    const first = !this.readied.has(shard);
    this.readied.add(shard);
    this.up.add(shard);
    this.owed = true;
    const cached = serversOf(shard);
    const seen = this.inReady.get(shard);
    // Gone: what the cache held before the READY and the READY no longer names; a server that
    // joined after the READY is the shard's (19D fix round 2, R1).
    const gone = seen ? seen.before.filter((server) => !seen.named.has(server)) : [];
    const start: ShardStart = {
      shard,
      servers: cached.filter((server) => !gone.includes(server)),
      gone,
      ...(seen ? { inReady: seen.named } : {}),
      unavailable: unavailable ?? new Set(),
      first,
    };
    this.present.set(shard, new Set(start.servers));
    this.lastGone.set(shard, gone);
    for (const listener of this.shardListeners) {
      try {
        listener(start);
      } catch (err) {
        log.error({ err, shard }, 'could not start the work of a shard');
      }
    }
    this.sayEveryReady();
  }

  private sayEveryReady(): void {
    if (!this.owed) return;
    const ids = [...this.options.shardIds()];
    if (ids.length === 0 || ids.some((id) => !this.up.has(id))) return;
    this.owed = false;
    this.options.log.debug({ shards: ids.length }, 'every shard ready');
    const present = new Set<string>();
    for (const id of ids) for (const server of this.present.get(id) ?? []) present.add(server);
    const isPresent = (serverId: string): boolean => this.isPresent(serverId);
    for (const listener of this.everyListeners) {
      try {
        listener({ present, isPresent });
      } catch (err) {
        this.options.log.error({ err }, 'could not tell that every shard is ready');
      }
    }
  }
}

/** The server ids of a gateway READY packet (`{ t: 'READY', d: { guilds: [{ id }] } }`), else undefined. */
export function readyGuilds(packet: unknown): ReadonlySet<string> | undefined {
  if (typeof packet !== 'object' || packet === null) return undefined;
  const { t, d } = packet as { t?: unknown; d?: unknown };
  if (t !== 'READY' || typeof d !== 'object' || d === null) return undefined;
  const { guilds } = d as { guilds?: unknown };
  if (!Array.isArray(guilds)) return undefined;
  const ids = guilds.flatMap((guild: unknown) => {
    const id =
      typeof guild === 'object' && guild !== null ? (guild as { id?: unknown }).id : undefined;
    return typeof id === 'string' ? [id] : [];
  });
  return new Set(ids);
}
