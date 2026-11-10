import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../test/support/test-logger.js';
import {
  DRATINI,
  REPORT_SERVER,
  REPORTER,
  researchReport,
} from '../test/support/stop-report-cases.js';
import { reportedRaid } from '../test/support/party-service.js';
import {
  eventsFeedStep,
  liveSources,
  picturesServed,
  reportPictures,
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
    // Ten seconds in all: the stack's limits add up to 145 s (`operations.md`).
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
