import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../test/support/test-logger.js';
import {
  DRATINI,
  REPORT_SERVER,
  REPORTER,
  researchReport,
} from '../test/support/stop-report-cases.js';
import { reportedRaid } from '../test/support/party-service.js';
import { TestServers, testServerValues, withZones } from '../test/support/server-values.js';
import { heldCall, type HeldCall } from '../test/support/held-call.js';
import { standingsWith } from '../test/support/server-standings.js';
import {
  bossSyncStep,
  directMessagesStep,
  eventsFeedStep,
  followLeaving,
  followServers,
  followZones,
  liveSources,
  notOfQuietServers,
  picturesServed,
  reportPictures,
  serversNotQuiet,
  shardStartWork,
  stopReportSteps,
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
});
