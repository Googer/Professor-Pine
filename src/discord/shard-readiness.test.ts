import { EventEmitter } from 'node:events';
import { Events, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ShardReadiness, type EveryShardReady, type ShardStart } from './shard-readiness.js';

const SERVER_A = '100000000000000001';
const SERVER_B = '100000000000000002';
const SERVER_C = '100000000000000003';

/** A client of `count` shards on an EventEmitter, its servers by shard, and what was told. */
function readiness(count: number, servers: Record<number, string[]> = {}) {
  const { log, entries } = createTestLogger();
  const client = new EventEmitter();
  const shards = new Map<number, string[]>(
    Array.from({ length: count }, (_, id) => [id, servers[id] ?? []]),
  );
  const started: ShardStart[] = [];
  const told: EveryShardReady[] = [];
  let everyReady = 0;
  const watch = new ShardReadiness({
    log,
    shardIds: () => shards.keys(),
    serversOf: (shard) => shards.get(shard) ?? [],
  })
    .attach(client as unknown as Pick<Client, 'on'>)
    .onShardReady((start) => {
      started.push(start);
    })
    .onEveryShardReady((every) => {
      everyReady += 1;
      told.push(every);
    });
  return {
    watch,
    entries,
    shards,
    started,
    everyReady: () => everyReady,
    /** What the last every-shard-ready said: the servers present. */
    present: () => [...(told.at(-1)?.present ?? [])].sort(),
    /** What the last every-shard-ready said. */
    told: () => told.at(-1),
    /** The client's ready, after the last shard's first. */
    clientReady: () => client.emit(Events.ClientReady, {}),
    /** A server that adds the bot (`GuildCreate`) or removes it (`GuildDelete`), on its shard. */
    created: (id: string, shardId: number) => client.emit(Events.GuildCreate, { id, shardId }),
    deleted: (id: string, shardId: number) => client.emit(Events.GuildDelete, { id, shardId }),
    /** The shard's ready; with `inReady`, its READY packet first (`Events.Raw`), as discord.js. */
    ready: (shard: number, unavailable?: Set<string>, inReady?: string[]) => {
      if (inReady) {
        const guilds = inReady.map((id) => ({ id, unavailable: true }));
        client.emit(Events.Raw, { op: 0, t: 'READY', s: 1, d: { guilds } }, shard);
      }
      client.emit(Events.ShardReady, shard, unavailable);
    },
    raw: (packet: unknown, shard: number) => client.emit(Events.Raw, packet, shard),
    resume: (shard: number) => client.emit(Events.ShardResume, shard, 3),
    reconnecting: (shard: number) => client.emit(Events.ShardReconnecting, shard),
  };
}

describe('ShardReadiness (plan 19D)', () => {
  it('tells each shard’s ready with its servers, those Discord said unavailable, and whether it is the first', () => {
    const made = readiness(2, { 0: [SERVER_A, SERVER_B], 1: [SERVER_C] });
    made.ready(1, new Set([SERVER_C]), [SERVER_C]);
    made.ready(0, undefined, [SERVER_A, SERVER_B]);
    expect(made.started).toEqual([
      {
        shard: 1,
        servers: [SERVER_C],
        gone: [],
        inReady: new Set([SERVER_C]),
        unavailable: new Set([SERVER_C]),
        first: true,
      },
      {
        shard: 0,
        servers: [SERVER_A, SERVER_B],
        gone: [],
        inReady: new Set([SERVER_A, SERVER_B]),
        unavailable: new Set(),
        first: true,
      },
    ]);

    // A new session of shard 0 (a full reconnect): its servers as they are now, not its first.
    made.shards.set(0, [SERVER_A]);
    made.reconnecting(0);
    made.ready(0, undefined, [SERVER_A]);
    expect(made.started.at(-1)).toEqual({
      shard: 0,
      servers: [SERVER_A],
      gone: [],
      inReady: new Set([SERVER_A]),
      unavailable: new Set(),
      first: false,
    });
  });

  it('flags the cached servers that a new session’s READY no longer names, and leaves them out (19D fix round 1, F2)', () => {
    // Server B removed the bot while shard 0 was away: discord.js keeps it in its cache.
    const made = readiness(2, { 0: [SERVER_A, SERVER_B], 1: [SERVER_C] });
    made.ready(0, undefined, [SERVER_A, SERVER_B]);
    made.ready(1, undefined, [SERVER_C]);
    made.reconnecting(0);
    // Another shard's READY and other packets change nothing of shard 0's.
    made.raw({ op: 0, t: 'READY', s: 1, d: { guilds: [{ id: SERVER_B }] } }, 1);
    made.raw({ op: 0, t: 'GUILD_CREATE', s: 2, d: { id: SERVER_B } }, 0);
    made.ready(0, undefined, [SERVER_A]);
    expect(made.started.at(-1)).toEqual({
      shard: 0,
      servers: [SERVER_A],
      gone: [SERVER_B],
      inReady: new Set([SERVER_A]),
      unavailable: new Set(),
      first: false,
    });
  });

  it('takes a server that joined between the READY and the ready for one of the shard’s, never for gone (19D fix round 2, R1)', () => {
    const SERVER_X = '100000000000000009';
    const ready = (guilds: string[]) => ({
      op: 0,
      t: 'READY',
      s: 1,
      d: { guilds: guilds.map((id) => ({ id, unavailable: true })) },
    });
    // At the login: the cache is empty at the READY, which discord.js handles after `Raw`.
    const made = readiness(1);
    made.raw(ready([SERVER_A]), 0);
    // Server X adds the bot before the shard has all its servers (up to 15 s later).
    made.shards.set(0, [SERVER_A, SERVER_X]);
    made.ready(0);
    expect(made.started.at(-1)).toMatchObject({ servers: [SERVER_A, SERVER_X], gone: [] });

    // After a new session: B left while the shard was away, X joined after the READY.
    made.shards.set(0, [SERVER_A, SERVER_B]);
    made.reconnecting(0);
    made.raw(ready([SERVER_A]), 0);
    made.shards.set(0, [SERVER_A, SERVER_B, SERVER_X]);
    made.ready(0);
    expect(made.started.at(-1)).toMatchObject({
      servers: [SERVER_A, SERVER_X],
      gone: [SERVER_B],
      first: false,
    });
  });

  it('takes every cached server of the shard where it saw no READY', () => {
    const made = readiness(1, { 0: [SERVER_A] });
    made.ready(0);
    expect(made.started).toEqual([
      { shard: 0, servers: [SERVER_A], gone: [], unavailable: new Set(), first: true },
    ]);
  });

  it('says every shard is ready once the last one is, at the login', () => {
    const made = readiness(3);
    made.ready(0);
    made.ready(2);
    expect(made.everyReady()).toBe(0);
    made.ready(1);
    expect(made.everyReady()).toBe(1);
  });

  it('says it of one shard of one at its ready', () => {
    const made = readiness(1);
    made.ready(0);
    expect(made.everyReady()).toBe(1);
  });

  it('says it again after a shard’s new session, not after a resume, which loses no event', () => {
    const made = readiness(2);
    made.ready(0);
    made.ready(1);
    made.reconnecting(1);
    made.resume(1);
    expect(made.everyReady()).toBe(1);

    made.reconnecting(1);
    made.ready(1);
    expect(made.everyReady()).toBe(2);
  });

  it('waits for a shard away before saying it, also when that shard comes back by a resume', () => {
    const made = readiness(2);
    made.ready(0);
    made.ready(1);
    made.reconnecting(0);
    made.reconnecting(1);
    // Shard 1 has a new session while shard 0 is still away: not every shard is ready.
    made.ready(1);
    expect(made.everyReady()).toBe(1);
    made.resume(0);
    expect(made.everyReady()).toBe(2);
  });

  it('says which servers are present: each shard’s at its last ready, those gone left out, joins and removals since followed (plan 19C-1)', () => {
    const made = readiness(2, { 0: [SERVER_A, SERVER_B], 1: [SERVER_C] });
    made.ready(0, new Set([SERVER_B]), [SERVER_A, SERVER_B]);
    made.ready(1, undefined, [SERVER_C]);
    // An unavailable server is present.
    expect(made.present()).toEqual([SERVER_A, SERVER_B, SERVER_C]);
    const SERVER_D = '100000000000000004';
    made.created(SERVER_D, 1);
    made.deleted(SERVER_C, 1);
    // B removed the bot while shard 0 was away: the cache keeps it, the READY no longer names it.
    made.reconnecting(0);
    made.ready(0, undefined, [SERVER_A]);
    expect(made.everyReady()).toBe(2);
    expect(made.present()).toEqual([SERVER_A, SERVER_D]);
    // A new session of shard 1 reads its servers anew.
    made.shards.set(1, [SERVER_C]);
    made.reconnecting(1);
    made.ready(1, undefined, [SERVER_C]);
    expect(made.present()).toEqual([SERVER_A, SERVER_C]);
  });

  it('answers live whether a server is present, after what was said (plan 19C-1, J2)', () => {
    const made = readiness(1, { 0: [SERVER_A] });
    made.ready(0, undefined, [SERVER_A]);
    const every = made.told();
    expect(every?.isPresent(SERVER_A)).toBe(true);
    expect(every?.isPresent(SERVER_B)).toBe(false);
    // Joins and removals after the ready, asked of what was said then.
    made.created(SERVER_B, 0);
    made.deleted(SERVER_A, 0);
    expect(every?.isPresent(SERVER_B)).toBe(true);
    expect(every?.isPresent(SERVER_A)).toBe(false);
    expect(made.watch.isPresent(SERVER_B)).toBe(true);
  });

  it('tells at the client’s ready of the cached servers no shard’s ready covered, and takes them for present (plan 19C-1, J2)', () => {
    const made = readiness(2, { 0: [SERVER_A], 1: [SERVER_C] });
    const uncovered: string[][] = [];
    made.watch.onClientReady(({ uncovered: servers }) => uncovered.push([...servers]));
    made.ready(0, undefined, [SERVER_A]);
    // Added on shard 0 while shard 1 still identifies: discord.js says nothing of it.
    made.shards.set(0, [SERVER_A, SERVER_B]);
    made.ready(1, undefined, [SERVER_C]);
    expect(made.present()).toEqual([SERVER_A, SERVER_C]);
    made.clientReady();
    expect(uncovered).toEqual([[SERVER_B]]);
    expect(made.watch.isPresent(SERVER_B)).toBe(true);
  });

  it('logs a listener that throws, and tells the others', () => {
    const made = readiness(1, { 0: [SERVER_A] });
    const told: number[] = [];
    made.watch
      .onShardReady(() => {
        throw new Error('broken');
      })
      .onShardReady(({ shard }) => told.push(shard))
      .onEveryShardReady(() => {
        throw new Error('broken too');
      });
    made.ready(0);
    expect(told).toEqual([0]);
    expect(made.everyReady()).toBe(1);
    expect(made.entries.filter((entry) => entry.level === 50).map((entry) => entry['msg'])).toEqual(
      ['could not start the work of a shard', 'could not tell that every shard is ready'],
    );
  });
});
