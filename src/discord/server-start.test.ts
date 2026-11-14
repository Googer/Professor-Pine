import { RecordingNotices } from '../../test/support/server-notices.js';
import { EventEmitter } from 'node:events';
import { Events, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { loadSettings } from '../config/settings.js';
import { MemoryServerSettings } from '../../test/support/server-settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { shardStartWork } from '../app-wiring.js';
import type { StoredServer } from '../db/repositories/server-settings-repository.js';
import { ServerFill, type ServerNames } from '../services/server-fill.js';
import { ServerSettings } from '../services/server-settings.js';
import { RecordingDms } from '../../test/support/dms.js';
import { RecordingExits } from '../../test/support/server-admission.js';
import { standingsWith } from '../../test/support/server-standings.js';
import { ServerAdmission } from '../services/server-admission.js';
import { ServerAdoption } from '../services/server-adoption.js';
import { wireServerAdmission, type AdmissionClient } from './server-admission-wiring.js';
import { wireServerStart } from './server-start.js';
import { ShardReadiness } from './shard-readiness.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const SERVER_A = '412345678901234567';
const SERVER_B = '412345678901234568';
/** In shard 0's first READY, but unavailable at its ready. */
const DOWN = '412345678901234569';
/** Added the bot since. */
const JOINED = '412345678901234570';

interface FakeGuild {
  id: string;
  available: boolean;
  shardId: number;
  /** Its Discord owner, once it is available (plan 19C-1). */
  ownerId?: string;
}

/**
 * Who is in, wired by a test before the start (plan 19C-1): given the client, its shards and the
 * cache; gives the start's `admits`.
 */
type WhoIsIn = (
  client: EventEmitter,
  shards: ShardReadiness,
  cache: Map<string, FakeGuild>,
) => { admits: (serverId: string) => boolean };

/** A server's names: its bot lab only. */
const namesOf = (guild: FakeGuild): ServerNames => ({
  serverId: guild.id,
  channel: (name, kind) => (kind === 'text' && name === 'the-bot-lab' ? `5${guild.id}` : undefined),
  category: () => undefined,
  role: () => undefined,
  howMany: (name, kind) => (kind === 'text' && name === 'the-bot-lab' ? 1 : 0),
});

/** A promise and its resolve, for a step the test lets finish. */
function held<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A store whose writes of a server's first row each wait for the test (`release`). */
class HeldStore extends MemoryServerSettings {
  readonly creates: Array<{ serverId: string; release: () => void }> = [];
  readonly asked = new Map<string, ReturnType<typeof held<void>>>();

  override create(row: StoredServer): Promise<boolean> {
    const gate = held<void>();
    this.creates.push({ serverId: row.serverId, release: () => gate.resolve() });
    this.asked.get(row.serverId)?.resolve();
    return gate.promise.then(() => super.create(row));
  }

  /** Resolves once the fill asked to write the server's row. */
  createAsked(serverId: string): Promise<void> {
    if (this.creates.some((one) => one.serverId === serverId)) return Promise.resolve();
    const gate = held<void>();
    this.asked.set(serverId, gate);
    return gate.promise;
  }

  release(serverId: string): void {
    this.creates.find((one) => one.serverId === serverId)?.release();
  }

  /** Lets the server's row be written, and waits for the fill to ask it. */
  async allow(serverId: string): Promise<void> {
    await this.createAsked(serverId);
    this.release(serverId);
  }
}

/**
 * The start over a client of `count` shards on an EventEmitter, with discord.js's order of
 * events: a shard's READY (`Events.Raw`, its servers into the cache unavailable), each server
 * made available (`GuildAvailable`), the shard's ready, the client's ready after the last
 * shard's first; a server that adds the bot once the client is ready, `GuildCreate`.
 */
async function start(count = 1, refused: ReadonlySet<string> = new Set(), wire?: WhoIsIn) {
  const store = new HeldStore();
  const { log } = createTestLogger();
  const servers = new ServerSettings({ store, settings, log });
  await servers.load();
  const fill = new ServerFill({ servers, settings, log, notices: new RecordingNotices() });
  const client = new EventEmitter();
  const cache = new Map<string, FakeGuild>();
  /** What the start-up work did, in order; each sync of `Guild` rows waits for the test (`sync`). */
  const done: string[] = [];
  /** The test waiting for a line of `done`. */
  const awaited = new Map<string, () => void>();
  const say = (line: string): void => {
    done.push(line);
    awaited.get(line)?.();
  };
  const reached = (line: string): Promise<void> => {
    if (done.includes(line)) return Promise.resolve();
    const gate = held<void>();
    awaited.set(line, gate.resolve);
    return gate.promise;
  };
  const syncs: Array<{ servers: readonly string[]; release: () => void }> = [];
  /** The test waiting for the next sync to be asked. */
  const syncAsked: Array<() => void> = [];
  const work = shardStartWork({
    syncServers: (ids) => {
      const gate = held<void>();
      syncs.push({ servers: ids, release: () => gate.resolve() });
      syncAsked.shift()?.();
      return gate.promise.then(() => say(`synced ${ids.join(',')}`));
    },
    warnAtStart: (ids) => say(`warned ${ids.join(',')}`),
    prepareStanding: (ids) => say(`spawns ${ids.join(',')}`),
  });
  const shards = new ShardReadiness({
    log,
    shardIds: () => Array.from({ length: count }, (_, id) => id),
    serversOf: (shard) => [...cache.values()].filter((g) => g.shardId === shard).map((g) => g.id),
  }).attach(client as unknown as Pick<Client, 'on'>);
  const started = held<void>();
  let isStarted = false;
  const routed: Array<{ guildId: string | null; hadRow: boolean }> = [];
  const routedOnce = held<void>();
  /** The servers refused (told and left, plan 19C-1), each time. */
  const refusals: string[] = [];
  // Who is in, wired before the start's own listeners as `app.ts` does (plan 19C-1, J1).
  const who = wire?.(client, shards, cache);
  wireServerStart<FakeGuild, { guildId: string | null }>(client, {
    fill,
    namesOf,
    serverOf: (id) => cache.get(id),
    shards,
    work,
    started: () => {
      isStarted = true;
      say('started');
      started.resolve();
    },
    route: (interaction) => {
      routed.push({
        guildId: interaction.guildId,
        hadRow: interaction.guildId === null || servers.has(interaction.guildId),
      });
      routedOnce.resolve();
    },
    // Plan 19C-1: who may have this Pine, and what is done to a server that may not.
    admits: who?.admits ?? ((serverId) => !refused.has(serverId)),
    refuse: (serverId) => refusals.push(serverId),
    log,
  });
  const discord = {
    /** A shard's READY: its servers into the cache, unavailable. */
    readyPacket: (shard: number, ids: string[]) => {
      client.emit(
        Events.Raw,
        { op: 0, t: 'READY', s: 1, d: { guilds: ids.map((id) => ({ id, unavailable: true })) } },
        shard,
      );
      for (const id of ids) {
        const known = cache.get(id);
        if (known) known.available = false;
        else cache.set(id, { id, available: false, shardId: shard });
      }
    },
    available: (id: string) => {
      const guild = cache.get(id);
      if (!guild) throw new Error(`no server ${id}`);
      guild.available = true;
      client.emit(Events.GuildAvailable, guild);
    },
    shardReady: (shard: number, unavailable?: Set<string>) => {
      client.emit(Events.ShardReady, shard, unavailable);
    },
    clientReady: () => {
      client.emit(Events.ClientReady, { guilds: { cache } });
    },
    /** A server that adds the bot: in the cache, available; `GuildCreate` once the client is ready. */
    added: (id: string, shard: number, event: boolean) => {
      const guild = { id, available: true, shardId: shard };
      cache.set(id, guild);
      if (event) client.emit(Events.GuildCreate, guild);
    },
    interaction: (guildId: string | null) => {
      client.emit(Events.InteractionCreate, { guildId });
    },
  };
  /** Lets the next sync of `Guild` rows asked finish, once it is asked; the servers it was of. */
  const sync = async (): Promise<readonly string[]> => {
    if (syncs.length === 0) {
      const asked = held<void>();
      syncAsked.push(asked.resolve);
      await asked.promise;
    }
    const next = syncs.shift();
    if (!next) throw new Error('no sync was asked');
    next.release();
    return next.servers;
  };
  return {
    store,
    servers,
    fill,
    discord,
    done,
    reached,
    sync,
    started: started.promise,
    isStarted: () => isStarted,
    routed,
    routedOnce: routedOnce.promise,
    refusals,
  };
}

describe('the start of the servers over the shards (plan 19A-1, review F14; fix round 3, H1)', () => {
  it('does a shard’s start work once its servers are filled and recorded, and is started once every shard’s is', async () => {
    const made = await start(2);
    const { discord, store, done } = made;
    discord.readyPacket(0, [SERVER_A]);
    discord.readyPacket(1, [SERVER_B]);
    discord.available(SERVER_A);
    discord.available(SERVER_B);
    discord.shardReady(0);
    // Shard 0's work waits for its `Guild` row and its server's row.
    expect(await made.sync()).toEqual([SERVER_A]);
    expect(done).not.toContain(`warned ${SERVER_A}`);
    await store.allow(SERVER_A);
    await made.reached(`spawns ${SERVER_A}`);
    expect(done).toEqual([`synced ${SERVER_A}`, `warned ${SERVER_A}`, `spawns ${SERVER_A}`]);
    discord.shardReady(1);
    discord.clientReady();
    expect(await made.sync()).toEqual([SERVER_B]);
    // The start waits for shard 1's server's row.
    expect(made.isStarted()).toBe(false);
    await store.allow(SERVER_B);
    await made.started;
    expect(done.slice(3)).toEqual([
      `synced ${SERVER_B}`,
      `warned ${SERVER_B}`,
      `spawns ${SERVER_B}`,
      'started',
    ]);
    // Both in their shard's first READY: present at the upgrade, set up.
    expect(made.servers.setUpAt(SERVER_A)).not.toBeNull();
    expect(made.servers.setUpAt(SERVER_B)).not.toBeNull();
  });

  it('sets up a server of the first READY that was down at the login once it comes', async () => {
    const made = await start();
    const { discord, store } = made;
    discord.readyPacket(0, [SERVER_A, DOWN]);
    discord.available(SERVER_A);
    discord.shardReady(0, new Set([DOWN]));
    discord.clientReady();
    await made.sync();
    await store.allow(SERVER_A);
    await made.started;
    expect(made.servers.has(DOWN)).toBe(false);
    discord.available(DOWN);
    await store.allow(DOWN);
    await made.fill.whenFilled(DOWN);
    expect(made.servers.setUpAt(DOWN)).not.toBeNull();
  });

  it('does not set up a server that added the bot while its shard was away', async () => {
    const made = await start();
    const { discord, store } = made;
    discord.readyPacket(0, [SERVER_A]);
    discord.available(SERVER_A);
    discord.shardReady(0);
    discord.clientReady();
    await made.sync();
    await store.allow(SERVER_A);
    await made.started;
    // A new session: its READY names a server added meanwhile, which discord.js makes available.
    discord.readyPacket(0, [SERVER_A, JOINED]);
    discord.available(SERVER_A);
    discord.available(JOINED);
    discord.interaction(JOINED);
    await store.createAsked(JOINED);
    expect(made.routed).toEqual([]);
    discord.shardReady(0);
    expect(await made.sync()).toEqual([SERVER_A, JOINED]);
    store.release(JOINED);
    await made.routedOnce;
    expect(made.routed).toEqual([{ guildId: JOINED, hadRow: true }]);
    expect(made.servers.setUpAt(JOINED)).toBeNull();
    // A new session redoes no start work but the rows.
    expect(made.done.filter((line) => line.startsWith('warned'))).toEqual([`warned ${SERVER_A}`]);
  });

  it('fills a server added between a shard’s ready and the client’s, which has no event, before the start', async () => {
    const made = await start(2);
    const { discord, store } = made;
    discord.readyPacket(0, [SERVER_A]);
    discord.readyPacket(1, [SERVER_B]);
    discord.available(SERVER_A);
    discord.shardReady(0);
    await made.sync();
    await store.allow(SERVER_A);
    // Shard 1 still identifies: the client is not ready, so discord.js says nothing of it.
    discord.added(JOINED, 0, false);
    discord.available(SERVER_B);
    discord.shardReady(1);
    discord.clientReady();
    await made.sync();
    await store.allow(SERVER_B);
    expect(await made.sync()).toEqual([JOINED]);
    expect(made.isStarted()).toBe(false);
    await store.allow(JOINED);
    await made.started;
    expect(made.servers.setUpAt(JOINED)).toBeNull();
  });

  it('fills a server the bot joins before its first interaction is routed', async () => {
    const made = await start();
    const { discord, store } = made;
    discord.readyPacket(0, []);
    discord.shardReady(0);
    discord.clientReady();
    await made.sync();
    await made.started;
    discord.added(JOINED, 0, true);
    discord.interaction(JOINED);
    await store.createAsked(JOINED);
    expect(made.routed).toEqual([]);
    store.release(JOINED);
    await made.routedOnce;
    expect(made.routed).toEqual([{ guildId: JOINED, hadRow: true }]);
    // Joined since the start: not set up.
    expect(made.servers.setUpAt(JOINED)).toBeNull();
  });

  it('routes an interaction of a DM, or of a server with its row, at once', async () => {
    const made = await start();
    made.discord.interaction(null);
    await made.routedOnce;
    expect(made.routed).toEqual([{ guildId: null, hadRow: true }]);
  });

  it('fills, records and routes nothing of a server that may not have this Pine, and refuses one that joins (plan 19C-1)', async () => {
    const STRANGER = '412345678901234571';
    const made = await start(1, new Set([SERVER_B, STRANGER]));
    const { discord, store } = made;
    // SERVER_B added the bot while it was down: present at the ready, never filled nor recorded.
    discord.readyPacket(0, [SERVER_A, SERVER_B]);
    discord.available(SERVER_A);
    discord.available(SERVER_B);
    discord.shardReady(0);
    expect(await made.sync()).toEqual([SERVER_A]);
    await store.allow(SERVER_A);
    discord.clientReady();
    await made.started;
    expect(made.servers.has(SERVER_B)).toBe(false);
    expect(store.creates.map((one) => one.serverId)).toEqual([SERVER_A]);
    // One that adds the bot now is refused before any fill, and none of its interactions routed.
    discord.added(STRANGER, 0, true);
    expect(made.refusals).toEqual([STRANGER]);
    discord.interaction(STRANGER);
    discord.interaction(SERVER_A);
    await made.routedOnce;
    expect(made.routed).toEqual([{ guildId: SERVER_A, hadRow: true }]);
    expect(store.creates.map((one) => one.serverId)).toEqual([SERVER_A]);
  });
});

describe('a new install keeps its owner’s server (plan 19C-1, J1)', () => {
  const OWNER = '323456789012345670';
  const SOMEBODY = '323456789012345671';

  /**
   * A new install (nothing recorded, `servers` unset) whose application is public or not, the
   * servers' Discord owners by `owners`: real standings, adoption and admission, wired as
   * `app.ts` wires them.
   */
  function newInstall(publicBot: boolean, owners: ReadonlyMap<string, string>) {
    const { log } = createTestLogger();
    const { standings, store } = standingsWith({ recorded: [], log });
    // The adopted written: the test waits for it, never for a number of turns.
    const written = held<void>();
    const record = store.record.bind(store);
    store.record = async (serverIds, at) => {
      await record(serverIds, at);
      written.resolve();
    };
    const exits = new RecordingExits();
    const holder: { admission?: ServerAdmission } = {};
    const wire: WhoIsIn = (client, shards, cache) => {
      const adoption = new ServerAdoption({
        standings,
        publicBot,
        ownerOf: (serverId) =>
          cache.get(serverId)?.available === true ? owners.get(serverId) : undefined,
        nameOf: () => undefined,
        mayOwn: (userId) => userId === OWNER,
        ownerId: OWNER,
        dms: new RecordingDms(),
        refuse: (serverId) => holder.admission?.refuse(serverId),
        log,
      });
      const admission = new ServerAdmission({
        standings,
        exits,
        recorded: () => Promise.resolve([...store.guilds]),
        undecided: (serverId) => adoption.undecided(serverId),
        log,
      });
      holder.admission = admission;
      wireServerAdmission(client as unknown as AdmissionClient<FakeGuild>, {
        shards,
        adoption,
        admission,
      });
      return { admits: (serverId) => admission.admits(serverId) };
    };
    return { wire, standings, store, exits, written: written.promise, holder };
  }

  it('adopts and fills its server at its first start', async () => {
    const install = newInstall(false, new Map());
    const made = await start(1, new Set(), install.wire);
    const { discord, store } = made;
    discord.readyPacket(0, [SERVER_A]);
    discord.available(SERVER_A);
    discord.shardReady(0);
    expect(await made.sync()).toEqual([SERVER_A]);
    await store.allow(SERVER_A);
    discord.clientReady();
    await made.started;
    // Filled at that very start, as a server present at the upgrade: set up.
    expect(made.servers.setUpAt(SERVER_A)).not.toBeNull();
    await install.written;
    expect(install.store.rows.get(SERVER_A)?.recordedAt).not.toBeNull();
    expect(install.exits.left).toEqual([]);
  });

  it('with Public Bot on refuses a stranger’s server and adopts the owner’s; the window then stays closed', async () => {
    const owners = new Map([
      [SERVER_A, OWNER],
      [SERVER_B, SOMEBODY],
      [JOINED, OWNER],
    ]);
    const install = newInstall(true, owners);
    const made = await start(1, new Set(), install.wire);
    const { discord, store } = made;
    discord.readyPacket(0, [SERVER_A, SERVER_B]);
    discord.available(SERVER_A);
    discord.available(SERVER_B);
    discord.shardReady(0);
    expect(await made.sync()).toEqual([SERVER_A]);
    await store.allow(SERVER_A);
    await install.holder.admission?.idle();
    expect(install.exits.left).toEqual([SERVER_B]);
    expect(made.servers.has(SERVER_B)).toBe(false);
    discord.clientReady();
    await made.started;
    await install.written;
    expect(install.standings.adopting).toBe(false);
    // Recorded once: a later join, the owner's too, needs an allowance.
    discord.added(JOINED, 0, true);
    expect(made.refusals).toEqual([JOINED]);
    expect(install.standings.mayHave(JOINED)).toBe(false);
  });
});
