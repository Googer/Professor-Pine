import { Events } from 'discord.js';
import type { Logger } from '../log.js';
import type { ServerFill, ServerNames } from '../services/server-fill.js';
import { readyGuilds, type ShardStart } from './shard-readiness.js';

/**
 * What the start of the servers needs of the client (`Client`; an `EventEmitter` in tests): the
 * events of its servers, the gateway's packets (a shard's READY) and the interactions.
 */
export interface ServerStartClient<G, I> {
  once(
    event: Events.ClientReady,
    listener: (ready: { guilds: { cache: ReadonlyMap<string, G> } }) => void,
  ): unknown;
  on(event: Events.Raw, listener: (packet: unknown, shard: unknown) => void): unknown;
  on(event: Events.GuildAvailable | Events.GuildCreate, listener: (guild: G) => void): unknown;
  on(event: Events.InteractionCreate, listener: (interaction: I) => void): unknown;
}

/** The work of the shards' readies (`shardStartWork`, `src/app-wiring.ts`); neither rejects. */
export interface ShardWork {
  /** A shard's ready: its servers recorded, then, after `filled`, its first ready's work. */
  shardReady(start: ShardStart, filled: Promise<unknown>): Promise<void>;
  /** The client's ready: the cached servers no shard's ready covered, recorded. */
  clientReady(cached: readonly string[]): Promise<void>;
}

export interface ServerStartDeps<G, I> {
  fill: Pick<ServerFill, 'begin' | 'whenFilled'>;
  /** A server's names from the client's cache (`serverNamesOf`). */
  namesOf: (guild: G) => ServerNames;
  /** A server of the client's cache by its id. */
  serverOf: (serverId: string) => G | undefined;
  /** Each shard's ready (`ShardReadiness`, plan 19D). */
  shards: { onShardReady(listener: (start: ShardStart) => void): unknown };
  work: ShardWork;
  /**
   * The rest of the start, once every shard's first ready did its work and every server present
   * has its row and its `Guild` row: what reads the servers' values, and the client marked
   * connected (the clock and the web wait for it).
   */
  started: () => void;
  /** Hands an interaction on (the router). */
  route: (interaction: I) => unknown;
  /**
   * Whether a server may have this Pine (plan 19C-1, `ServerAdmission.admits`): one that may not is
   * never filled, recorded, worked for at a ready, nor are its interactions routed.
   */
  admits: (serverId: string) => boolean;
  /** Tells a server that joins and may not have this Pine, and leaves it (`ServerAdmission.refuse`). */
  refuse: (serverId: string) => void;
  log: Logger;
}

/** What the start gives back (`wireServerStart`). */
export interface ServerStart {
  /**
   * A server that may have this Pine now and did not before (plan 19C-2: `/operator servers
   * allow` of a present server that waited): its fill begins as its joining would, so that it
   * starts in setup (fix round 1, S2); nothing for a server the cache does not have, one not
   * available (its `GuildAvailable` begins it), or one still not admitted.
   */
  admitted(serverId: string): void;
}

/**
 * The start of the servers (plan 19A-1, `servers.md`; review F14; on plan 19D's shards, fix
 * round 3, H1). A server's fill is begun in the client's own events, before discord.js hands on
 * any interaction of it: when it is made available (`GuildAvailable`, which comes before its
 * shard's ready), at its shard's ready for each of the shard's servers available then (one that
 * added the bot between the READY and the ready has no event), at `ClientReady` for the cached
 * servers no shard covered (added between two shards' readies, no event either), and when the bot
 * joins one (`GuildCreate`). Every interaction waits for its server's fill (`whenFilled`).
 *
 * Per shard, its servers' fills and their `Guild` rows are written before its start work (the
 * warnings of meetup safety and the standing spawns read the servers' values): `work.shardReady`
 * waits for the fills it is given. `started` runs once every shard's first ready did its work and
 * the servers of `ClientReady` are filled and recorded (review F4: the notifier finds a party's
 * server by its `Guild` row).
 *
 * A server that may not have this Pine (plan 19C-1, `admits`) is none of this: never filled, its
 * `Guild` row never written, left out of its shard's start work and of the client's ready, its
 * interactions never routed; one that joins is refused (`refuse`) before anything else. Those
 * present at a ready are refused by the check once every shard is ready (`ServerAdmission`).
 *
 * Who was present at the login (`'present'`, recorded set up where the instance's record has it
 * from before 2.1 or adopted at a new install's first start: `ServerFill`, plan 19C-2): only a
 * server its shard's first READY named, those Discord said unavailable included, so that one down
 * at the login is set up when it comes. Any other server without a row is `'joined'`: one that
 * adds the bot (`GuildCreate`, or no event between two readies), one that added it while its
 * shard was away (named by a later session's READY, then `GuildAvailable`), or one an operator
 * allowed after it waited (`admitted`).
 */
export function wireServerStart<
  G extends { id: string; available: boolean },
  I extends { guildId: string | null },
>(client: ServerStartClient<G, I>, deps: ServerStartDeps<G, I>): ServerStart {
  const { fill, namesOf, log } = deps;
  /** The servers a shard's READY named before the shard's first ready: those of the login. */
  const atLogin = new Set<string>();
  /** The shards whose first ready came. */
  const readied = new Set<number>();
  /** Each shard's first ready's work: the start waits for all of them. */
  const firstWork: Promise<void>[] = [];
  const { admits } = deps;
  const begin = (guild: G): void => {
    // A server not available yet is filled when it is (`GuildAvailable`); one that may not have
    // this Pine never (plan 19C-1).
    if (!guild.available || !admits(guild.id)) return;
    fill.begin(namesOf(guild), atLogin.has(guild.id) ? 'present' : 'joined');
  };
  const filled = (serverIds: readonly string[]): Promise<unknown> =>
    Promise.all(serverIds.map((serverId) => fill.whenFilled(serverId)));

  // discord.js gives every packet before it handles it: a shard's READY comes before the
  // `GuildAvailable` of its servers.
  client.on(Events.Raw, (packet, shard) => {
    if (typeof shard !== 'number' || readied.has(shard)) return;
    for (const serverId of readyGuilds(packet) ?? []) atLogin.add(serverId);
  });
  deps.shards.onShardReady((start) => {
    if (start.first) {
      readied.add(start.shard);
      // Without the READY packet seen, the servers of the shard's first ready stand for it.
      const named = start.inReady ?? [...start.servers, ...start.unavailable];
      for (const serverId of named) atLogin.add(serverId);
    }
    const servers = start.servers.filter(admits);
    for (const serverId of servers) {
      const guild = deps.serverOf(serverId);
      if (guild !== undefined) begin(guild);
    }
    const work = deps.work
      .shardReady({ ...start, servers }, filled(servers))
      .catch((err: unknown) => {
        log.error({ err, shard: start.shard }, 'could not start the work of a shard');
      });
    if (start.first) firstWork.push(work);
  });
  client.once(Events.ClientReady, (ready) => {
    const all = [...ready.guilds.cache.values()].filter((guild) => admits(guild.id));
    for (const guild of all) begin(guild);
    const ids = all.map((guild) => guild.id);
    void Promise.all([...firstWork, deps.work.clientReady(ids), filled(ids)]).then(() => {
      try {
        deps.started();
      } catch (err) {
        log.error({ err }, 'could not finish the start');
      }
    });
  });
  client.on(Events.GuildAvailable, (guild) => {
    begin(guild);
  });
  client.on(Events.GuildCreate, (guild) => {
    // Refused before anything else (plan 19C-1).
    if (!admits(guild.id)) {
      deps.refuse(guild.id);
      return;
    }
    // Its row before its first interaction: joined now, so not set up.
    fill.begin(namesOf(guild), 'joined');
  });
  client.on(Events.InteractionCreate, (interaction) => {
    // Of a server Pine is leaving: answered by nothing (plan 19C-1).
    if (interaction.guildId !== null && !admits(interaction.guildId)) return;
    // After its server's fill, if one is under way: never before its row.
    void fill.whenFilled(interaction.guildId).then(() => deps.route(interaction));
  });
  return {
    admitted: (serverId) => {
      const guild = deps.serverOf(serverId);
      if (guild === undefined || !guild.available || !admits(guild.id)) return;
      // As one that joins (plan 19C-2, S2): an operator's allowance is no record of it from
      // before 2.1, so it starts in setup, present at the login though it was.
      fill.begin(namesOf(guild), 'joined');
    },
  };
}
