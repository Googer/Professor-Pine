import { EventEmitter } from 'node:events';
import { Events } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../test/support/test-logger.js';
import { FakeGeoGateway } from '../test/support/geo.js';
import { gymDirectoryWith } from '../test/support/gym-store.js';
import { OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../test/support/gyms.js';
import { GymUpkeep } from './services/gym-upkeep.js';
import {
  DRATINI,
  REPORT_SERVER,
  REPORTER,
  researchReport,
} from '../test/support/stop-report-cases.js';
import { reportedRaid } from '../test/support/party-service.js';
import { TestServers, testServerValues, withZones } from '../test/support/server-values.js';
import { heldCall, type HeldCall } from '../test/support/held-call.js';
import { MemoryServerRecords, standingsWith } from '../test/support/server-standings.js';
import { admissionWith } from '../test/support/server-admission.js';
import { wireServerStart, type ServerStartClient } from './discord/server-start.js';
import type { ShardStart } from './discord/shard-readiness.js';
import { serverRecordRow } from '../test/support/server-record-cases.js';
import { MemoryServerSettings } from '../test/support/server-settings.js';
import { filledRow } from '../test/support/server-settings-cases.js';
import { TEST_SETTINGS_PATH } from '../test/support/test-settings.js';
import { loadSettings } from './config/settings.js';
import { ServerFill } from './services/server-fill.js';
import { ServerSettings } from './services/server-settings.js';
import { ServerStandings } from './services/server-standings.js';
import {
  afterDeletions,
  backAfterDeletion,
  bossSyncStep,
  directMessagesStep,
  forgetServerMemory,
  eventsFeedStep,
  followLeaving,
  followServers,
  followZones,
  liveSources,
  notOfQuietServers,
  picturesServed,
  reportPictures,
  serverSetUpWork,
  servesRow,
  servedOnWeb,
  serversNotQuiet,
  shardStartWork,
  stopReportSteps,
  wireServerSetup,
  type SetupLate,
} from './app-wiring.js';
import { PartyStatus } from './domain/party/status.js';
import { ENCOUNTER_PICTURE } from './domain/stops/pictures.js';
import { postKey } from './render/post-view.js';
import { createShutdown } from './shutdown.js';
import type { StopReportListener } from './services/stop-reports.js';
import { LIVE_PENDING_MS, LiveSignals } from './web/live-signals.js';

describe('the wiring of the live signals', () => {
  const SERVER = '100000000000000001';

  /** A raid with its services, wired to a hub with one stream open. */
  async function wired() {
    const made = await reportedRaid();
    const clock = { now: 1_000_000 };
    const timers = new Set<{ at: number; run: () => void }>();
    const live = new LiveSignals({
      now: () => clock.now,
      setTimer: (run, ms) => {
        const timer = { at: clock.now + ms, run };
        timers.add(timer);
        return () => {
          timers.delete(timer);
        };
      },
      random: () => 0,
    });
    const pass = (ms: number): void => {
      clock.now += ms;
      for (const timer of [...timers]) {
        if (timer.at > clock.now) continue;
        timers.delete(timer);
        timer.run();
      }
    };
    const reports: StopReportListener[] = [];
    const spawned: Array<(guildId: string) => void> = [];
    liveSources(live, {
      parties: made.store,
      posts: made.service,
      reports: {
        listen: (listener) => {
          reports.push(listener);
        },
      },
      spawns: {
        onReported: (listener) => {
          spawned.push(listener);
        },
      },
    });
    const written: string[] = [];
    /** The key of the raid's post as a map asking at each signal would read it. */
    const keysAtSignal: Array<string | undefined> = [];
    live.open({
      server: SERVER,
      row: made.party.guildId,
      address: 'a',
      member: 'm',
      session: 's',
      stillMember: () => Promise.resolve(true),
      sink: {
        write: (text) => {
          if (text.startsWith('event: changed')) {
            written.push(text);
            const layout = made.service.layoutOf(made.party.id);
            keysAtSignal.push(layout && postKey(layout));
          }
          return true;
        },
        end: () => undefined,
        destroy: () => undefined,
      },
    });
    return { made, written, keysAtSignal, pass, reports, spawned };
  }

  const ALICE = { id: '200000000000000071', name: 'Alice' };
  const PARTIES = 'event: changed\ndata: parties 1000\n\n';

  it('a party’s change is signaled once its post was drawn, which a map then reads', async () => {
    const { made, written, keysAtSignal } = await wired();
    const before = made.service.layoutOf(made.party.id);
    await made.attendance.signUp(made.party.id, ALICE, PartyStatus.Coming);
    expect(written).toEqual([]);
    await made.service.flush();
    expect(written).toEqual([PARTIES]);
    // A map that asks at the signal reads the new post, not the one before it.
    const now = made.service.layoutOf(made.party.id);
    if (!before || !now) throw new Error('no layout is kept');
    expect(postKey(now)).not.toBe(postKey(before));
    expect(keysAtSignal).toEqual([postKey(now)]);
  });

  it('a party’s change no draw follows is signaled by the timer', async () => {
    const { made, written, pass } = await wired();
    await made.store.update(made.party.id, (party) => ({ party: { ...party } }));
    expect(written).toEqual([]);
    pass(LIVE_PENDING_MS);
    expect(written).toEqual([PARTIES]);
  });

  it('a party that ended is signaled at once', async () => {
    const { made, written } = await wired();
    await made.store.update(made.party.id, (party) => ({
      party: { ...party, status: 'ended' as const },
      ended: { how: 'clock' as const },
    }));
    expect(written).toEqual([PARTIES]);
  });

  it('the reports’ word goes to the server named', async () => {
    const { written, reports } = await wired();
    for (const listener of reports) listener.listChanged?.(SERVER);
    expect(written).toEqual(['event: changed\ndata: stop-reports 1000\n\n']);
  });

  it('a spawn recorded is signaled to its server as the spawns’ list', async () => {
    const { written, spawned } = await wired();
    for (const listener of spawned) listener(SERVER);
    expect(written).toEqual(['event: changed\ndata: spawns 1000\n\n']);
  });
});

describe('the wiring of the pictures and the reports at stops (plan 8R-6)', () => {
  it('has a typed task’s reward made square when it is reported, which no list holds (plan 8M-9B)', () => {
    const prepared: string[][] = [];
    const listener = reportPictures({
      prepare: (sources) => Promise.resolve(void prepared.push([...sources])),
    });
    const research = { ...researchReport().research, rewards: [DRATINI], typed: true };
    listener.reported?.({
      serverId: REPORT_SERVER,
      reports: [{ ...researchReport({ research }), id: 1 }],
      reporter: REPORTER,
      period: { key: 'day:2026-10-21', kind: 'day', start: 0, end: 1 },
      replaced: [],
    });
    expect(prepared).toEqual([[ENCOUNTER_PICTURE, DRATINI.image]]);
  });

  it('tells the pictures of the stops that the web server listens, with the eggs', () => {
    const told: string[] = [];
    picturesServed({
      eggs: { serving: () => void told.push('eggs') },
      stops: { serving: () => void told.push('stops') },
    });
    expect(told).toEqual(['eggs', 'stops']);
  });

  it('closes the pictures of the stops before the grunts’ messages, the lines and the posts of the stops', async () => {
    const { log, entries } = createTestLogger();
    const closed: string[] = [];
    const closing = (name: string) => ({
      close: () => Promise.resolve(void closed.push(name)),
    });
    const steps = stopReportSteps({
      pictures: closing('pictures'),
      grunts: closing('grunts'),
      // The lines of the region channels (plan 8R-9) wait for the posts' links: closed first.
      lines: closing('lines'),
      posts: closing('posts'),
    });
    await createShutdown(steps, log)();
    expect(closed).toEqual(['pictures', 'grunts', 'lines', 'posts']);
    expect(
      entries.filter((entry) => entry.msg === 'shutdown step finished').map((e) => e.step),
    ).toEqual(['pictures of the stops', 'grunt reports', 'posts of the stops']);
    // Ten seconds in all: the stack's limits add up to 143 s with every optional step
    // (`operations.md`).
    expect(steps.reduce((sum, step) => sum + step.timeoutMs, 0)).toBe(10_000);
  });

  it('closes the pictures where there are no grunts’ messages or posts (rehearsal mode)', async () => {
    const { log } = createTestLogger();
    const closed: string[] = [];
    await createShutdown(
      stopReportSteps({
        pictures: { close: () => Promise.resolve(void closed.push('pictures')) },
        grunts: undefined,
        lines: undefined,
        posts: undefined,
      }),
      log,
    )();
    expect(closed).toEqual(['pictures']);
  });
});

describe('the shutdown step of the direct messages and the server notices (plan 19B-1)', () => {
  it('sends the notices on their way beside the queued DMs, in the DMs’ twelve seconds', async () => {
    const { log } = createTestLogger();
    const done: string[] = [];
    const draining = heldCall('the DMs’ drain');
    const step = directMessagesStep({
      dms: {
        drain: (ms) => {
          done.push(`drain ${String(ms)}`);
          draining.arrive();
          return draining.released;
        },
      },
      notices: { flush: () => Promise.resolve(void done.push('notices sent')) },
    });
    expect(step.timeoutMs).toBe(12_000);
    const stopping = createShutdown([step], log)();
    await draining.reached;
    // Not one after the other: the notices go while the DMs drain.
    expect(done).toEqual(['drain 10000', 'notices sent']);
    draining.release();
    await stopping;
  });
});

describe('the shutdown step of the boss syncs (fix round 3, J1)', () => {
  it('stops both syncs in one step of five seconds, then waits for both at once', async () => {
    const { log } = createTestLogger();
    const done: string[] = [];
    const raidSync = heldCall('the raid boss sync');
    const step = bossSyncStep({
      raid: {
        stop: () => void done.push('raid stopped'),
        whenIdle: () => {
          done.push('raid waited for');
          raidSync.arrive();
          return raidSync.released;
        },
      },
      max: {
        stop: () => void done.push('max stopped'),
        whenIdle: () => Promise.resolve(void done.push('max waited for')),
      },
    });
    expect(step.timeoutMs).toBe(5_000);
    const stopping = createShutdown([step], log)();
    await raidSync.reached;
    // Not one after the other: the max sync is waited for while the raid sync's write finishes.
    expect(done).toEqual(['raid stopped', 'max stopped', 'raid waited for', 'max waited for']);
    raidSync.release();
    await stopping;
  });
});

describe('the shutdown step of the events feed and the events forum (branch review BR-2)', () => {
  it('stops both in one step of a second, the forum first, and waits for both', async () => {
    const { log } = createTestLogger();
    const done: string[] = [];
    const step = eventsFeedStep({
      events: {
        stop: () => void done.push('feed stopped'),
        whenIdle: () => Promise.resolve(void done.push('feed idle')),
      },
      forum: {
        stop: () => void done.push('forum stopped'),
        flush: () => Promise.resolve(void done.push('forum idle')),
      },
    });
    expect(step.timeoutMs).toBe(1_000);
    await createShutdown([step], log)();
    expect(done).toEqual(['forum stopped', 'feed stopped', 'forum idle', 'feed idle']);
  });

  it('stops the feed alone where there is no events forum', async () => {
    const { log } = createTestLogger();
    const done: string[] = [];
    const step = eventsFeedStep({
      events: {
        stop: () => void done.push('feed stopped'),
        whenIdle: () => Promise.resolve(void done.push('feed idle')),
      },
      forum: undefined,
    });
    await createShutdown([step], log)();
    expect(done).toEqual(['feed stopped', 'feed idle']);
  });
});

describe('the start-up work of a shard (plan 19D)', () => {
  const SERVER_A = '100000000000000001';
  const SERVER_B = '100000000000000002';

  const SERVER_C = '100000000000000003';
  const SERVER_X = '100000000000000009';

  function work() {
    const done: [string, readonly string[]][] = [];
    const startWork = shardStartWork({
      syncServers: (servers) => {
        done.push(['sync', servers]);
        return Promise.resolve();
      },
      warnAtStart: (servers) => void done.push(['warn', servers]),
      prepareStanding: (servers) => void done.push(['spawns', servers]),
    });
    return { done, startWork };
  }

  it('records, checks and prepares the servers of a shard at its first ready', async () => {
    const { done, startWork } = work();
    await startWork.shardReady({
      shard: 1,
      servers: [SERVER_A, SERVER_B],
      gone: [],
      unavailable: new Set([SERVER_B]),
      first: true,
    });
    expect(done).toEqual([
      ['sync', [SERVER_A, SERVER_B]],
      // Every server: meetup safety passes over an unavailable one and names it (fix round 2, G5).
      ['warn', [SERVER_A, SERVER_B]],
      ['spawns', [SERVER_A, SERVER_B]],
    ]);
  });

  it('checks and prepares the servers only once their rows are filled (plan 19A-1, fix round 3, H1)', async () => {
    const { done, startWork } = work();
    let fill!: () => void;
    const filled = new Promise<void>((resolve) => {
      fill = resolve;
    });
    const working = startWork.shardReady(
      { shard: 0, servers: [SERVER_A], gone: [], unavailable: new Set(), first: true },
      filled,
    );
    expect(done).toEqual([['sync', [SERVER_A]]]);
    fill();
    await working;
    expect(done).toEqual([
      ['sync', [SERVER_A]],
      ['warn', [SERVER_A]],
      ['spawns', [SERVER_A]],
    ]);
  });

  it('only records the servers again after a new session', async () => {
    const { done, startWork } = work();
    await startWork.shardReady({
      shard: 0,
      servers: [SERVER_A],
      gone: [SERVER_B],
      unavailable: new Set(),
      first: false,
    });
    expect(done).toEqual([['sync', [SERVER_A]]]);
  });

  it('records at ClientReady a server that added the bot between two shards’ readies (19D fix round 1, F1; round 2, R2)', async () => {
    const { done, startWork } = work();
    await startWork.shardReady({
      shard: 0,
      servers: [SERVER_A],
      gone: [],
      unavailable: new Set(),
      first: true,
    });
    // Server X adds the bot on shard 0 while shard 1 still identifies: discord.js puts it in its
    // cache and says no GuildCreate, the client not being ready.
    await startWork.shardReady({
      shard: 1,
      servers: [SERVER_C],
      gone: [],
      unavailable: new Set(),
      first: true,
    });
    done.length = 0;
    await startWork.clientReady([SERVER_A, SERVER_X, SERVER_C]);
    expect(done).toEqual([['sync', [SERVER_X]]]);
    // From then on discord.js says GuildCreate: a second call records nothing more.
    await startWork.clientReady([SERVER_A, SERVER_X, SERVER_C, SERVER_B]);
    expect(done).toEqual([['sync', [SERVER_X]]]);
  });

  it('records nothing more at ClientReady when the shards covered every server', async () => {
    const { done, startWork } = work();
    await startWork.shardReady({
      shard: 0,
      servers: [SERVER_A],
      gone: [],
      unavailable: new Set(),
      first: true,
    });
    done.length = 0;
    await startWork.clientReady([SERVER_A]);
    expect(done).toEqual([]);
  });
});

describe('what follows the servers’ zones (plan 19A-2; fix round 1, N5, N7)', () => {
  const SERVER = '412345678901234567';
  const STAFF = { id: '200000000000000001' };

  /** The hooks, each recording what reached it. */
  function hooked(servers: TestServers) {
    const heard: string[] = [];
    const { log, entries } = createTestLogger();
    followZones(
      servers,
      {
        server: [
          (serverId) => heard.push(`posts ${serverId}`),
          () => {
            throw new Error('a hook broke');
          },
          (serverId) => heard.push(`activity ${serverId}`),
        ],
        zones: [() => heard.push('bosses'), () => heard.push('midnights')],
      },
      log,
    );
    return { heard, entries };
  }

  it('brings a change of a server’s zone to every hook, a hook that throws logged', async () => {
    const servers = new TestServers();
    const { heard, entries } = hooked(servers);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Europe/Berlin' }), STAFF);
    expect(heard).toEqual([`posts ${SERVER}`, `activity ${SERVER}`, 'bosses', 'midnights']);
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'a listener of a change of time zone failed' }),
    );
  });

  it('brings a server joining in a zone of its own to the hooks of the zones only', () => {
    const OTHER = '412345678901234599';
    const servers = withZones({ [OTHER]: 'Asia/Kolkata' });
    servers.present = [SERVER];
    const { heard } = hooked(servers);
    servers.presenceChanged([SERVER, OTHER]);
    expect(heard).toEqual(['bosses', 'midnights']);
    // Another in a zone already in use changes nothing.
    servers.presenceChanged([SERVER, OTHER, '412345678901234598']);
    expect(heard).toHaveLength(2);
  });

  it('brings a server taking another name of the default’s zone to the hooks of the zones only (fix round 3, Q4)', async () => {
    // A server whose values have no zone: the default's (America/New_York).
    const { timezone: _default, ...withoutZone } = testServerValues();
    const servers = new TestServers(withoutZone);
    servers.present = [SERVER];
    const { heard } = hooked(servers);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'US/Eastern' }), STAFF);
    expect(heard).toEqual(['bosses', 'midnights']);
  });
});

describe('a server joining and removing Pine (plan 19C-1)', () => {
  const RECORDED = '412345678901234567';
  const STRANGER = '412345678901234568';
  const NOW = Date.parse('2026-11-13T18:00:00Z');
  const OPERATOR = '323456789012345678';

  function followed(writing?: HeldCall) {
    const { log, entries } = createTestLogger();
    const { standings, store } = standingsWith({ recorded: [RECORDED], log, now: () => NOW });
    const rows: string[] = [];
    let presence = 0;
    const servers = followServers({
      admission: { admits: (serverId) => standings.mayHave(serverId) },
      standings,
      guilds: {
        ensure: async (serverId) => {
          rows.push(serverId);
          if (writing) {
            writing.arrive();
            await writing.released;
          }
          return rows.length;
        },
      },
      presenceChanged: () => {
        presence += 1;
      },
      log,
    });
    return { servers, standings, store, rows, presence: () => presence, entries };
  }

  it('marks a server that removes Pine left, keeping its row and everything on it', async () => {
    const made = followed();
    await made.servers.removed(RECORDED);
    expect(made.standings.isLeft(RECORDED)).toBe(true);
    expect(made.store.rows.get(RECORDED)?.leftAt).toBe(NOW);
    // Nothing else of it is written: no row is made, none deleted (there is no way to).
    expect(made.rows).toEqual([]);
    expect(made.presence()).toBe(1);
  });

  it('takes back that a server left when it adds Pine again, and writes its row', async () => {
    const made = followed();
    await made.servers.removed(RECORDED);
    await made.servers.joined(RECORDED);
    expect(made.standings.isLeft(RECORDED)).toBe(false);
    expect(made.rows).toEqual([RECORDED]);
    expect(made.presence()).toBe(2);
  });

  it('keeps a server left that removes Pine again while the row of its return is written', async () => {
    const writing = heldCall('the row of the server that came back');
    const made = followed(writing);
    await made.servers.removed(RECORDED);
    const joined = made.servers.joined(RECORDED);
    await writing.reached;
    // Its staff remove Pine again before the row of its return is written.
    const removed = made.servers.removed(RECORDED);
    writing.release();
    await Promise.all([joined, removed]);
    expect(made.standings.isLeft(RECORDED)).toBe(true);
    expect(made.store.rows.get(RECORDED)?.leftAt).not.toBeNull();
  });

  it('writes nothing of a server that may not have this Pine', async () => {
    const made = followed();
    await made.servers.joined(STRANGER);
    await made.servers.removed(STRANGER);
    expect(made.rows).toEqual([]);
    expect(made.store.rows.has(STRANGER)).toBe(false);
  });

  it('gives the servers Pine is in by their rows, never one it left (J6)', async () => {
    const made = followed();
    const recorded = serversNotQuiet(() => Promise.resolve([RECORDED, STRANGER]), {
      isQuiet: (serverId) => made.standings.isLeft(serverId),
    });
    expect(await recorded()).toEqual([RECORDED, STRANGER]);
    await made.servers.removed(RECORDED);
    expect(await recorded()).toEqual([STRANGER]);
  });

  it('drops the direct messages queued for a server it left, and tells Google’s line of it and of its return', async () => {
    const made = followed();
    const dropped: string[] = [];
    const served: (readonly number[])[] = [];
    followLeaving(made.standings, {
      dms: { dropServer: (serverId) => dropped.push(serverId) },
      line: { servingChanged: (rows) => served.push(rows) },
      rowOf: (serverId) => (serverId === RECORDED ? 7 : undefined),
    });
    await made.servers.removed(RECORDED);
    expect(dropped).toEqual([RECORDED]);
    expect(served).toEqual([[7]]);
    await made.servers.joined(RECORDED);
    // Nothing is dropped at its return; the line serves it again.
    expect(dropped).toEqual([RECORDED]);
    expect(served).toEqual([[7], [7]]);
  });

  it('tells Google’s line of a server an operator allows, blocks or unblocks, which neither leaves nor comes back', async () => {
    const made = followed();
    const dropped: string[] = [];
    const served: (readonly number[])[] = [];
    followLeaving(made.standings, {
      dms: { dropServer: (serverId) => dropped.push(serverId) },
      line: { servingChanged: (rows) => served.push(rows) },
      rowOf: (serverId) => (serverId === RECORDED ? 7 : undefined),
    });
    await made.standings.block(RECORDED, OPERATOR);
    await made.standings.unblock(RECORDED);
    await made.standings.allow(RECORDED, OPERATOR);
    // A server without a row has none in the line.
    await made.standings.allow(STRANGER, OPERATOR);
    expect(served).toEqual([[7], [7], [7]]);
    // Its direct messages go only when it is left.
    expect(dropped).toEqual([]);
  });

  it('logs what fails, and throws nothing', async () => {
    const made = followed();
    made.store.failing.set('markLeft', new Error('the database is away'));
    await made.servers.removed(RECORDED);
    expect(made.entries.some((entry) => entry['msg'] === 'could not mark a server left')).toBe(
      true,
    );
  });
});

describe('the messages of a quiet server (plan 19C-2, S1)', () => {
  it('passes over a message of a server in setup or left before anything looks at it', () => {
    const SET_UP = '412345678901234567';
    const IN_SETUP = '412345678901234599';
    const seen: (string | null)[] = [];
    const listener = notOfQuietServers(
      { isQuiet: (serverId) => serverId === IN_SETUP },
      (message) => {
        seen.push(message.guildId);
      },
    );
    listener({ guildId: IN_SETUP });
    listener({ guildId: SET_UP });
    // A direct message is of no server.
    listener({ guildId: null });
    expect(seen).toEqual([SET_UP, null]);
  });

  it('has Google serve the rows of a server set up alone: not one in setup, left or refused', () => {
    const SET_UP = '412345678901234567';
    const IN_SETUP = '412345678901234599';
    const LEFT = '412345678901234598';
    const REFUSED = '412345678901234597';
    const servers = [SET_UP, IN_SETUP, LEFT, REFUSED];
    const serves = servesRow({
      serverOfRow: (row) => servers[row - 1],
      admits: (serverId) => serverId !== REFUSED,
      quiet: { isQuiet: (serverId) => serverId === IN_SETUP || serverId === LEFT },
    });
    expect([1, 2, 3, 4].map(serves)).toEqual([true, false, false, false]);
    // A row of no server known is served, as the line served it before.
    expect(serves(9)).toBe(true);
  });
});

describe('the wiring of a server’s setup (plan 19C-2, S5)', () => {
  const IN_SETUP = '412345678901234599';
  const WAITED = '412345678901234598';

  /** A promise and its resolve. */
  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve = (): void => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function wired() {
    const connected = deferred();
    const asked: string[] = [];
    const times = (what: string): number => asked.filter((one) => one === what).length;
    /** Resolves once the setup was asked `what` (`check <server>`, `checkAll`) `n` times. */
    const waiting: { what: string; n: number; resolve: () => void }[] = [];
    const ask = (what: string): Promise<boolean> => {
      asked.push(what);
      for (const one of waiting) if (one.what === what && times(what) >= one.n) one.resolve();
      return Promise.resolve(false);
    };
    const asking = (what: string, n = 1): Promise<void> =>
      times(what) >= n
        ? Promise.resolve()
        : new Promise((resolve) => {
            waiting.push({ what, n, resolve });
          });
    const changeListeners: ((serverId: string) => void)[] = [];
    const outlineListeners: (() => void)[] = [];
    const allowedListeners: ((serverId: string) => void)[] = [];
    const late: SetupLate = {};
    wireServerSetup({
      setup: {
        check: (serverId) => ask(`check ${serverId}`),
        checkAll: () => ask('checkAll').then(() => undefined),
      },
      servers: { onChange: (listener) => changeListeners.push(listener) },
      regions: { whenOutlinesChanged: (listener) => outlineListeners.push(listener) },
      admission: { onAllowed: (listener) => allowedListeners.push(listener) },
      late,
      connected: connected.promise,
    });
    return {
      connected,
      asked,
      asking,
      late,
      changed: (serverId: string) => {
        for (const listener of changeListeners) listener(serverId);
      },
      outlinesChanged: () => {
        for (const listener of outlineListeners) listener();
      },
      allowed: (serverId: string) => {
        for (const listener of allowedListeners) listener(serverId);
      },
      listeners: () => [changeListeners, outlineListeners, allowedListeners].map((l) => l.length),
    };
  }

  it('listens before the login, and checks only once the bot is connected', async () => {
    const made = wired();
    // Registered at once, before the login.
    expect(made.listeners()).toEqual([1, 1, 1]);
    made.changed(IN_SETUP);
    expect(made.asked).toEqual([]);
    made.connected.resolve();
    // The change asked meanwhile, and every server in setup at the start.
    await made.asking(`check ${IN_SETUP}`);
    await made.asking('checkAll');
    // A region saved or imported: every server in setup again.
    made.outlinesChanged();
    await made.asking('checkAll', 2);
    made.changed(WAITED);
    await made.asking(`check ${WAITED}`);
  });

  it('begins a server an operator allowed on the client the login kept, once', () => {
    const made = wired();
    const begun: string[] = [];
    // Before the client is made: nothing to begin on, nothing thrown.
    made.allowed(WAITED);
    made.late.serverStart = { admitted: (serverId) => begun.push(`fill ${serverId}`) };
    made.late.joined = (serverId) => {
      begun.push(`joined ${serverId}`);
      return Promise.resolve();
    };
    made.allowed(WAITED);
    expect(begun).toEqual([`fill ${WAITED}`, `joined ${WAITED}`]);
    // A client the login dropped leaves nothing: the holder names the live one's.
    made.late.serverStart = { admitted: (serverId) => begun.push(`live fill ${serverId}`) };
    made.allowed(IN_SETUP);
    expect(begun.slice(2)).toEqual([`live fill ${IN_SETUP}`, `joined ${IN_SETUP}`]);
  });

  it('begins what waited for a server once it is set up, a step that throws logged (S10)', () => {
    const { log, entries } = createTestLogger();
    const done: string[] = [];
    const late: SetupLate = {};
    const setUp = serverSetUpWork({
      presenceChanged: () => done.push('zones'),
      checkSummaries: () => {
        done.push('summaries');
        return Promise.resolve();
      },
      warnAtStart: (servers) => done.push(`meetup safety ${servers.join(',')}`),
      line: { servingChanged: (rows) => done.push(`google ${rows.join(',')}`) },
      rowOf: (serverId) => (serverId === IN_SETUP ? 7 : undefined),
      late,
      log,
    });
    // The events forum and the posts of the stops are made after the setup's hook.
    late.eventForum = {
      zonesChanged: () => {
        throw new Error('the forum is away');
      },
    };
    late.stopPosts = { zonesChanged: () => done.push('posts of the stops') };
    setUp(IN_SETUP);
    expect(done).toEqual([
      'zones',
      'summaries',
      'posts of the stops',
      `meetup safety ${IN_SETUP}`,
      // Google's line serves its rows from now on (its shares, its Wayspots, the line hurried).
      'google 7',
    ]);
    expect(
      entries.filter((entry) => entry['msg'] === 'could not begin what waited for a server set up'),
    ).toHaveLength(1);
  });
});

describe('a server added back while its data is deleted (plan 19C-3)', () => {
  const GONE = '412345678901234567';
  const PRESENT = '412345678901234568';
  const DAY = 24 * 3_600_000;
  const NOW = Date.parse('2026-12-20T18:00:00Z');

  /**
   * GONE's deletion held as it runs; what its return begins (`backAfterDeletion`, as `app.ts`
   * wires it): its fill as one that joins (`admitted`), then its `Guild` row (`rows`).
   */
  function deleting() {
    const { log, entries } = createTestLogger();
    const { standings, store } = standingsWith({
      recorded: [GONE, PRESENT],
      log,
      now: () => NOW,
    });
    const row = store.rows.get(GONE);
    if (row) row.leftAt = NOW - 31 * DAY;
    const held = heldCall('the deletion');
    const deletion = standings.load().then(() =>
      standings.deleteIfDue(GONE, 30 * DAY, async () => {
        held.arrive();
        await held.released;
      }),
    );
    const rows: string[] = [];
    const admitted: string[] = [];
    const guilds = {
      ensure: (serverId: string) => {
        rows.push(serverId);
        return Promise.resolve(1);
      },
    };
    standings.whenBackAfterDeletion(
      backAfterDeletion({
        late: { serverStart: { admitted: (serverId) => admitted.push(serverId) } },
        guilds,
        log,
      }),
    );
    return { standings, store, held, deletion, log, entries, rows, admitted, guilds };
  }

  it('writes the Guild row of a server added back only once its deletion is over, and begins its fill', async () => {
    const made = deleting();
    await made.held.reached;
    const servers = followServers({
      admission: { admits: () => true },
      standings: made.standings,
      guilds: made.guilds,
      presenceChanged: () => undefined,
      log: made.log,
    });
    // Its joining does not wait for the deletion, and another server is not held behind it.
    await servers.joined(GONE);
    await servers.joined(PRESENT);
    expect(made.rows).toEqual([PRESENT]);
    expect(made.admitted).toEqual([]);
    expect(made.standings.isLeft(GONE)).toBe(true);
    made.held.release();
    await made.deletion;
    await made.standings.settled(GONE);
    // Taken back, then what its joining would have begun.
    expect(made.rows).toEqual([PRESENT, GONE]);
    expect(made.admitted).toEqual([GONE]);
    expect(made.standings.isLeft(GONE)).toBe(false);
    expect(made.store.rows.get(GONE)).toMatchObject({ leftAt: null, deletedAt: NOW });
  });

  it('begins no fill of a server while its deletion is pending, and has nothing wait for it', async () => {
    const made = deleting();
    await made.held.reached;
    const begun: string[] = [];
    let filled = 0;
    const fill = afterDeletions(made.standings).fill({
      begin: (names) => {
        begun.push(names.serverId);
      },
      whenFilled: () => {
        filled += 1;
        return Promise.resolve();
      },
    });
    const names = (serverId: string) => ({
      serverId,
      channel: () => undefined,
      category: () => undefined,
      role: () => undefined,
      howMany: () => 0,
    });
    fill.begin(names(GONE), 'joined');
    fill.begin(names(PRESENT), 'joined');
    // Neither its shard's start nor its interactions wait for the deletion (they are answered
    // that Pine is getting the server ready).
    await fill.whenFilled(GONE);
    await fill.whenFilled(PRESENT);
    await fill.whenFilled(null);
    expect(begun).toEqual([PRESENT]);
    expect(filled).toBe(2);
    made.held.release();
    await made.deletion;
    // Once it is over, its fill as it was: its return begins it (`backAfterDeletion`).
    fill.begin(names(GONE), 'joined');
    expect(begun).toEqual([PRESENT, GONE]);
  });

  it('records at a ready the servers not being deleted, and none being deleted: its return does', async () => {
    const made = deleting();
    await made.held.reached;
    const synced: (readonly string[])[] = [];
    const sync = afterDeletions(made.standings).syncServers((servers) => {
      synced.push(servers);
      return Promise.resolve();
    });
    await sync([GONE, PRESENT]);
    await sync([GONE]);
    expect(synced).toEqual([[PRESENT]]);
    made.held.release();
    await made.deletion;
    // The ready's own return of it.
    await made.standings.cameBack([GONE, PRESENT]);
    await made.standings.settled(GONE);
    expect(made.rows).toEqual([GONE]);
    expect(made.admitted).toEqual([GONE]);
  });

  it('logs what fails of what a server added back begins, and goes on', async () => {
    const { log, entries } = createTestLogger();
    const begin = backAfterDeletion({
      late: {
        serverStart: {
          admitted: () => {
            throw new Error('the cache is away');
          },
        },
      },
      guilds: { ensure: () => Promise.reject(new Error('the database went away')) },
      log,
    });
    await begin(GONE);
    expect(entries.filter((entry) => entry.level === 50)).toMatchObject([
      { msg: 'could not begin the fill of a server added back', guild: GONE },
      { msg: 'could not record guild', guild: GONE },
    ]);
  });

  it('reaches the start with a server whose unfinished deletion fails, tried once', async () => {
    const { log } = createTestLogger();
    const { admission, standings, store } = admissionWith({
      recorded: [GONE, PRESENT],
      rows: [
        serverRecordRow({
          serverId: GONE,
          recordedAt: NOW - 90 * DAY,
          leftAt: NOW - 31 * DAY,
          deletingAt: NOW - DAY,
        }),
      ],
      log,
      now: () => NOW,
    });
    await standings.load();
    let tries = 0;
    standings.finishDeletionsWith(() => {
      tries += 1;
      return Promise.reject(new Error('the database went away'));
    });
    const client = new EventEmitter();
    const shard: { ready?: (start: ShardStart) => void } = {};
    const cache = new Map([
      [GONE, { id: GONE, available: true }],
      [PRESENT, { id: PRESENT, available: true }],
    ]);
    const servers = new ServerSettings({
      store: new MemoryServerSettings(),
      settings: loadSettings(TEST_SETTINGS_PATH),
      log,
    });
    await servers.load();
    const fill = new ServerFill({
      servers,
      settings: loadSettings(TEST_SETTINGS_PATH),
      log,
      notices: { tell: () => undefined },
      recorded: (serverId) => standings.setUpOnRecord(serverId),
    });
    const synced: string[] = [];
    let started = false;
    let markStarted!: () => void;
    const startedNow = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    wireServerStart(
      client as unknown as ServerStartClient<
        { id: string; available: boolean },
        { guildId: string | null }
      >,
      {
        fill: afterDeletions(standings).fill(fill),
        namesOf: (guild) => ({
          serverId: guild.id,
          channel: () => undefined,
          category: () => undefined,
          role: () => undefined,
          howMany: () => 0,
        }),
        serverOf: (serverId) => cache.get(serverId),
        shards: {
          onShardReady: (listener) => {
            shard.ready = listener;
          },
        },
        work: shardStartWork({
          syncServers: afterDeletions(standings).syncServers((servers) => {
            synced.push(...servers);
            return Promise.resolve();
          }),
          warnAtStart: () => undefined,
          prepareStanding: () => undefined,
        }),
        started: () => {
          started = true;
          markStarted();
        },
        route: () => undefined,
        admits: () => true,
        refuse: () => undefined,
        log,
      },
    );
    // The login: each server made available, the shard's first ready, the client's ready.
    for (const guild of cache.values()) client.emit(Events.GuildAvailable, guild);
    shard.ready?.({
      shard: 0,
      servers: [GONE, PRESENT],
      gone: [],
      unavailable: new Set(),
      first: true,
    });
    client.emit(Events.ClientReady, { guilds: { cache } });
    await startedNow;
    // Every shard ready, then the client's ready: its return tried once.
    await admission.everyShardReady({
      present: new Set([GONE, PRESENT]),
      isPresent: (serverId) => cache.has(serverId),
    });
    await admission.clientReady([GONE]);
    await standings.settled(GONE);
    expect(started).toBe(true);
    expect(synced).toEqual([PRESENT]);
    expect(tries).toBe(1);
    expect(standings.isLeft(GONE)).toBe(true);
    expect(store.rows.get(GONE)?.deletingAt).toBe(NOW - DAY);
  });
});

describe('what the web answers of a server (plan 19C-3, fix round 1)', () => {
  it('answers a server whose deletion is pending as one Pine is not in, as one it left', async () => {
    const BEING = '412345678901234567';
    const BACK = '412345678901234568';
    const LEFT = '412345678901234569';
    const { standings } = standingsWith({
      recorded: [BEING, BACK, LEFT],
      rows: [
        serverRecordRow({ serverId: BEING, recordedAt: 1, leftAt: 1, deletingAt: 2 }),
        serverRecordRow({ serverId: LEFT, recordedAt: 1, leftAt: 1 }),
      ],
    });
    await standings.load();
    const served = servedOnWeb(standings);
    expect([BEING, BACK, LEFT].filter(served)).toEqual([BACK]);
  });
});

describe('a server whose data was deleted, added back (plan 19C-3)', () => {
  const GONE = '412345678901234567';
  const KEPT = '412345678901234568';
  const DAY = 24 * 3_600_000;
  const NOW = Date.parse('2026-12-20T18:00:00Z');
  const fileSettings = loadSettings(TEST_SETTINGS_PATH);
  const names = (serverId: string) => ({
    serverId,
    channel: () => undefined,
    category: () => undefined,
    role: () => undefined,
    howMany: () => 0,
  });

  /**
   * One start of the bot: its standings over `records`, its servers' rows over `rows` (each kept
   * set up), its fill as `app.ts` wires it (by `setUpOnRecord`, around `afterDeletions`), and the
   * deletion's work, which deletes the server's row of settings and forgets it.
   */
  async function start(records: MemoryServerRecords, rows: string[]) {
    const { log } = createTestLogger();
    const standings = new ServerStandings({
      store: records,
      settings: { servers: undefined },
      log,
      now: () => NOW,
    });
    await standings.load();
    const settingsStore = new MemoryServerSettings(rows.map((serverId) => filledRow({ serverId })));
    const servers = new ServerSettings({
      store: settingsStore,
      settings: fileSettings,
      log,
      now: () => NOW,
    });
    await servers.load();
    // Its row deleted with its data (`ServerDataRepository`), then forgotten.
    const work = (serverId: string) => {
      settingsStore.rows.delete(serverId);
      return servers.forget(serverId);
    };
    standings.finishDeletionsWith(work);
    const fill = afterDeletions(standings).fill(
      new ServerFill({
        servers,
        settings: fileSettings,
        log,
        notices: { tell: () => undefined },
        recorded: (serverId) => standings.setUpOnRecord(serverId),
      }),
    );
    /** The server is named at a shard's ready, or joins: filled once its deletion is over. */
    const named = async (serverId: string, how: 'present' | 'joined') => {
      fill.begin(names(serverId), how);
      await standings.settled(serverId);
      await fill.whenFilled(serverId);
    };
    return { standings, servers, work, named };
  }

  /** Both servers recorded at the upgrade; GONE left 31 days ago, KEPT 10. */
  function records() {
    return new MemoryServerRecords(
      [
        serverRecordRow({ serverId: GONE, recordedAt: NOW - 90 * DAY, leftAt: NOW - 31 * DAY }),
        serverRecordRow({ serverId: KEPT, recordedAt: NOW - 90 * DAY, leftAt: NOW - 10 * DAY }),
      ],
      [GONE, KEPT],
    );
  }

  it('starts in setup, still allowed, when added back while Pine runs', async () => {
    const store = records();
    const made = await start(store, [GONE, KEPT]);
    expect(await made.standings.deleteIfDue(GONE, 30 * DAY, () => made.work(GONE))).toBe(true);
    await made.standings.cameBack([GONE, KEPT]);
    await made.named(GONE, 'joined');
    expect(made.servers.inSetup(GONE)).toBe(true);
    expect(made.standings.mayHave(GONE)).toBe(true);
    // Back within 30 days: as it was.
    expect(made.servers.inSetup(KEPT)).toBe(false);
  });

  it('starts in setup, still allowed, when added back while Pine was down', async () => {
    const store = records();
    const before = await start(store, [GONE, KEPT]);
    expect(await before.standings.deleteIfDue(GONE, 30 * DAY, () => before.work(GONE))).toBe(true);
    // The next start: its row of settings went with its data; both are present at the login.
    const made = await start(store, [KEPT]);
    await made.named(GONE, 'present');
    await made.named(KEPT, 'present');
    await made.standings.cameBack([GONE, KEPT]);
    expect(made.servers.inSetup(GONE)).toBe(true);
    expect(made.standings.mayHave(GONE)).toBe(true);
    expect(made.servers.inSetup(KEPT)).toBe(false);
    // Its fill tried again after its return reads the same.
    expect(made.standings.setUpOnRecord(GONE)).toBe(false);
    expect(made.standings.setUpOnRecord(KEPT)).toBe(true);
  });

  it('starts in setup when added back while Pine was down, its deletion cut short by the stop', async () => {
    const store = records();
    const before = await start(store, [GONE, KEPT]);
    await expect(
      before.standings.deleteIfDue(GONE, 30 * DAY, () => Promise.reject(new Error('stopped'))),
    ).rejects.toThrow('stopped');
    const made = await start(store, [GONE, KEPT]);
    // Its return, at the ready, finishes the deletion first.
    await made.standings.cameBack([GONE]);
    expect(await made.standings.settled(GONE)).toBe(true);
    await made.named(GONE, 'present');

    expect(made.servers.inSetup(GONE)).toBe(true);
    expect(made.standings.mayHave(GONE)).toBe(true);
    expect(made.standings.isLeft(GONE)).toBe(false);
  });
});

describe('what the bot forgets of a server whose data was deleted (plan 19C-3)', () => {
  it('forgets each thing it keeps of the server, a step that fails logged and the rest done', async () => {
    const { log, entries } = createTestLogger();
    const done: string[] = [];
    const forget = forgetServerMemory({
      rowIds: { forgetServer: (serverId) => done.push(`row ids ${serverId}`) },
      servers: {
        forget: (serverId) => {
          done.push(`settings ${serverId}`);
          return Promise.resolve();
        },
      },
      notices: { forget: (serverId) => done.push(`notices ${serverId}`) },
      neighbors: {
        forgetServer: (serverId) => {
          done.push(`neighbors ${serverId}`);
          return Promise.resolve();
        },
      },
      parties: { forgetServer: (row) => done.push(`parties ${String(row)}`) },
      access: { forgetServer: (row) => done.push(`access ${String(row)}`) },
      regions: {
        load: () => {
          done.push('regions');
          return Promise.reject(new Error('the database went away'));
        },
      },
      gyms: {
        forget: (id) => done.push(`gym gone ${String(id)}`),
        unlink: (id, row) => done.push(`gym unlinked ${String(id)} ${String(row)}`),
      },
      wayspots: {
        load: (row) => {
          done.push(`wayspots ${String(row)}`);
          return Promise.resolve();
        },
      },
      matches: { forgetRow: (row) => done.push(`matches ${String(row)}`) },
      pineStops: {
        load: () => {
          done.push('pine stops');
          return Promise.resolve();
        },
      },
      nicknames: {
        load: (servers) => {
          done.push(`nicknames ${servers.join()}`);
          return Promise.resolve();
        },
      },
      line: {
        serverGone: (removed, unlinked) => {
          done.push(`line gone ${removed.join()}, unlinked ${unlinked.join()}`);
          return Promise.resolve();
        },
        servingChanged: (rows) => done.push(`line serving ${rows.join()}`),
      },
      log,
    });
    await forget('412345678901234567', {
      counts: {},
      guildRow: 5,
      gyms: { unlinked: [7], deleted: [8] },
    });
    expect(done).toEqual([
      'row ids 412345678901234567',
      'settings 412345678901234567',
      'notices 412345678901234567',
      'neighbors 412345678901234567',
      'parties 5',
      'access 5',
      'regions',
      'gym gone 8',
      'gym unlinked 7 5',
      'wayspots 5',
      'matches 5',
      'pine stops',
      'nicknames 412345678901234567',
      'line gone 8, unlinked 7',
      'line serving 5',
    ]);
    expect(
      entries.filter(
        (entry) =>
          entry.msg === 'could not forget what was kept of a server whose data was deleted',
      ),
    ).toMatchObject([{ what: 'regions', server: '412345678901234567' }]);
  });

  it('works out the nearest gyms of the server’s gyms once for all of them, as one by one', async () => {
    const GONE_ROW = OTHER_GUILD_ROW;
    const { gyms, directory, answers } = await gymDirectoryWith();
    const geo = new FakeGeoGateway();
    // Without Google: what is measured is the nearest gyms alone, not the line.
    geo.enabled = false;
    const upkeep = new GymUpkeep({
      gyms,
      directory,
      geo,
      parties: { active: () => [] },
      posts: { changed: () => undefined },
      log: createTestLogger().log,
      setTimer: () => () => undefined,
      answers,
    });
    // Beside gym 10, far from the others: two gyms both servers have, and one the server deleted
    // alone had, nearest to both.
    const make = async (lat: number, servers: number[]) => {
      const gym = await gyms.create({ name: 'Gym', lat, lon: -80.05 }, servers[0]!);
      for (const row of servers.slice(1)) gyms.link(gym.id, row);
      return gym.id;
    };
    const near = await make(40.5009, [TEST_GUILD_ROW, GONE_ROW]);
    const gone = await make(40.501, [GONE_ROW]);
    const far = await make(40.503, [TEST_GUILD_ROW, GONE_ROW]);
    await gyms.update(10, { nearestGym: near });
    await gyms.update(near, { nearestGym: gone });
    await gyms.update(far, { nearestGym: gone });
    await directory.load();
    gyms.writes.length = 0;
    // What the database's deletion did.
    await gyms.delete(gone);
    gyms.unlink(near, GONE_ROW);
    gyms.unlink(far, GONE_ROW);
    const passes = vi.spyOn(directory, 'all');
    const nothing = () => Promise.resolve();
    const forget = forgetServerMemory({
      rowIds: { forgetServer: () => undefined },
      servers: { forget: nothing },
      notices: { forget: () => undefined },
      neighbors: { forgetServer: nothing },
      parties: { forgetServer: () => undefined },
      access: { forgetServer: () => undefined },
      regions: { load: nothing },
      gyms: directory,
      wayspots: { load: nothing },
      matches: { forgetRow: () => undefined },
      pineStops: { load: nothing },
      nicknames: { load: nothing },
      line: upkeep,
      log: createTestLogger().log,
    });
    await forget('412345678901234567', {
      counts: {},
      guildRow: GONE_ROW,
      gyms: { unlinked: [near, far], deleted: [gone] },
    });
    // The kept server's gyms only: the one beside gym 10 takes it, the farther one the nearer.
    expect(gyms.written('nearestGym')).toEqual([
      [near, 10],
      [far, near],
    ]);
    expect(directory.stored(near)?.nearestGym).toBe(10);
    expect(directory.stored(10)?.nearestGym).toBe(near);
    // One pass over every gym, not one per gym.
    expect(passes).toHaveBeenCalledTimes(1);
  });

  it('forgets only what is the server’s by its snowflake where it had no Guild row any more', async () => {
    const { log } = createTestLogger();
    const done: string[] = [];
    const nothing = () => Promise.resolve();
    const forget = forgetServerMemory({
      rowIds: { forgetServer: () => done.push('row ids') },
      servers: {
        forget: () => {
          done.push('settings');
          return nothing();
        },
      },
      notices: { forget: () => done.push('notices') },
      neighbors: {
        forgetServer: () => {
          done.push('neighbors');
          return nothing();
        },
      },
      parties: { forgetServer: () => done.push('parties') },
      access: { forgetServer: () => done.push('access') },
      regions: {
        load: () => {
          done.push('regions');
          return nothing();
        },
      },
      gyms: { forget: () => done.push('gym'), unlink: () => done.push('gym') },
      wayspots: {
        load: () => {
          done.push('wayspots');
          return nothing();
        },
      },
      matches: { forgetRow: () => done.push('matches') },
      pineStops: {
        load: () => {
          done.push('pine stops');
          return nothing();
        },
      },
      nicknames: {
        load: () => {
          done.push('nicknames');
          return nothing();
        },
      },
      line: { serverGone: nothing, servingChanged: () => done.push('line') },
      log,
    });
    await forget('412345678901234567', {
      counts: {},
      guildRow: undefined,
      gyms: { unlinked: [], deleted: [] },
    });
    expect(done).toEqual([
      'row ids',
      'settings',
      'notices',
      'neighbors',
      'regions',
      'pine stops',
      'nicknames',
    ]);
  });
});
