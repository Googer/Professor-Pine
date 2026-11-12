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
 *   discord.js hears of them, which it may never), so a check of who is in (plan C) reads each
 *   shard's `ShardStart`, not the cache alone. At the login it is said at the last shard's first
 *   ready, before `ClientReady`: before the client is marked connected and before `botServers`
 *   is set, so a listener must not need either.
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
  private readonly shardListeners: ((start: ShardStart) => void)[] = [];
  private readonly everyListeners: (() => void)[] = [];

  constructor(private readonly options: ShardReadinessOptions) {}

  /** Listens to the client's shard events; `this`, to chain. */
  attach(client: Pick<Client, 'on'>): this {
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

  /** Who is told that every shard is ready (plan C's checks of who is in). */
  onEveryShardReady(listener: () => void): this {
    this.everyListeners.push(listener);
    return this;
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
    for (const listener of this.everyListeners) {
      try {
        listener();
      } catch (err) {
        this.options.log.error({ err }, 'could not tell that every shard is ready');
      }
    }
  }
}

/** The server ids of a gateway READY packet (`{ t: 'READY', d: { guilds: [{ id }] } }`), else undefined. */
function readyGuilds(packet: unknown): ReadonlySet<string> | undefined {
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
