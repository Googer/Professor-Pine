import { afterEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../test/support/random.js';
import { Poller } from './parties.js';
import {
  listAskLimit,
  LiveConnection,
  LiveList,
  LIVE_FLOOR_MS,
  LIVE_POLL_MS,
  NOT_LIVE_AFTER_MS,
  POLL_MS,
  type LiveList as LiveListType,
  type LiveName,
  type LiveSource,
} from './live.js';

/** Timers a test runs by hand. */
class Hand {
  now = 1_000_000;
  private readonly timers = new Set<{ at: number; run: () => void }>();

  setTimer = (run: () => void, ms: number): (() => void) => {
    const timer = { at: this.now + ms, run };
    this.timers.add(timer);
    return () => {
      this.timers.delete(timer);
    };
  };

  get waiting(): number[] {
    return [...this.timers].map((timer) => timer.at - this.now).sort((a, b) => a - b);
  }

  pass(ms: number): void {
    const until = this.now + ms;
    for (;;) {
      const next = [...this.timers]
        .filter((timer) => timer.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers.delete(next);
      this.now = next.at;
      next.run();
    }
    this.now = until;
  }
}

/** A fake `EventSource`: what a test says arrives, whether it was closed. */
class FakeSource implements LiveSource {
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, (event: { data: unknown }) => void>();

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  ping(spread: number | string = 1_000): void {
    this.listeners.get('ping')?.({ data: String(spread) });
  }

  changed(data: string): void {
    this.listeners.get('changed')?.({ data });
  }

  error(): void {
    this.onerror?.();
  }
}

function connectionWith(random = 0.5) {
  const hand = new Hand();
  const sources: FakeSource[] = [];
  const told = {
    changed: [] as [LiveName, number][],
    live: [] as [boolean, number][],
  };
  let active = true;
  const connection = new LiveConnection({
    open: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    active: () => active,
    now: () => hand.now,
    random: () => random,
    setTimer: hand.setTimer,
    changed: (list, spread) => told.changed.push([list, spread]),
    liveChanged: (live, spread) => told.live.push([live, spread]),
  });
  connection.start();
  return {
    connection,
    hand,
    sources,
    told,
    source: () => {
      const last = sources.at(-1);
      if (!last) throw new Error('no stream was opened');
      return last;
    },
    setActive: (to: boolean): void => {
      active = to;
      connection.activeChanged();
    },
  };
}

describe('LiveConnection: what counts as live', () => {
  it('opens at start, and an open stream alone is not live', () => {
    const { sources, told } = connectionWith();
    expect(sources).toHaveLength(1);
    expect(told.live).toEqual([]);
  });

  it('is live from the first ping, with its spread', () => {
    const { source, told, connection } = connectionWith();
    source().ping(4_000);
    expect(told.live).toEqual([[true, 4_000]]);
    expect(connection.isLive).toBe(true);
    source().ping(4_000);
    expect(told.live).toHaveLength(1);
  });

  it('is live from a first signal too, then tells it', () => {
    const { source, told } = connectionWith();
    source().changed('parties 2000');
    expect(told.live).toEqual([[true, 2_000]]);
    expect(told.changed).toEqual([['parties', 2_000]]);
  });

  it('is not live after 60 seconds of nothing, and closes the stream', () => {
    const { source, hand, told } = connectionWith();
    source().ping();
    hand.pass(NOT_LIVE_AFTER_MS - 1);
    expect(told.live).toHaveLength(1);
    source().ping();
    hand.pass(NOT_LIVE_AFTER_MS - 1);
    expect(told.live).toHaveLength(1);
    hand.pass(1);
    expect(told.live.at(-1)?.[0]).toBe(false);
    expect(source().closed).toBe(true);
  });

  it('gives up on a stream that never says anything, which buffers or is blocked', () => {
    const { source, hand, sources } = connectionWith();
    hand.pass(NOT_LIVE_AFTER_MS);
    expect(source().closed).toBe(true);
    // And tries again later.
    hand.pass(5 * 60_000);
    expect(sources.length).toBeGreaterThan(1);
  });

  it('reads the spread sent, and keeps the last where one cannot be read', () => {
    const { source, told } = connectionWith();
    source().ping(4_000);
    source().changed('stop-reports');
    source().changed('stop-reports 20000');
    source().changed('stop-reports nonsense');
    expect(told.changed).toEqual([
      ['stop-reports', 4_000],
      ['stop-reports', 20_000],
      ['stop-reports', 20_000],
    ]);
  });

  it('passes on a word of the wild spawns', () => {
    const { source, told } = connectionWith();
    source().ping(4_000);
    source().changed('spawns 1000');
    expect(told.changed).toEqual([['spawns', 1_000]]);
  });

  it('ignores a list it does not know', () => {
    const { source, told } = connectionWith();
    source().ping();
    source().changed('gyms 1000');
    expect(told.changed).toEqual([]);
  });

  it('starts with a spread of a second', () => {
    const { source, told } = connectionWith();
    source().changed('parties');
    expect(told.changed).toEqual([['parties', 1_000]]);
  });
});

describe('LiveConnection: reconnecting', () => {
  it('closes the stream at every error, so that the browser’s own retry does not run beside it', () => {
    const { source, told } = connectionWith();
    source().ping();
    source().error();
    expect(source().closed).toBe(true);
    expect(told.live.at(-1)).toEqual([false, 1_000]);
  });

  it('never reopens within 20 seconds of opening', () => {
    const { source, hand, sources } = connectionWith(0);
    source().error();
    hand.pass(LIVE_FLOOR_MS - 1);
    expect(sources).toHaveLength(1);
    hand.pass(1);
    expect(sources).toHaveLength(2);
  });

  it('makes its first wait random across the whole of 5 seconds', () => {
    const waitAt = (random: number): number => {
      const { source, hand, sources } = connectionWith(random);
      // Opened long ago: the floor has passed.
      source().ping();
      hand.pass(LIVE_FLOOR_MS);
      source().ping();
      hand.pass(LIVE_FLOOR_MS);
      source().error();
      let waited = 0;
      while (sources.length === 1) {
        hand.pass(100);
        waited += 100;
      }
      return waited;
    };
    expect(waitAt(0.1)).toBe(500);
    expect(waitAt(0.5)).toBe(2_500);
    expect(waitAt(0.99)).toBe(5_000);
  });

  it('spreads it over the crowd’s spread where that is longer than 5 seconds', () => {
    const { source, hand, sources } = connectionWith(0.5);
    source().ping(20_000);
    hand.pass(LIVE_FLOOR_MS);
    source().ping(20_000);
    hand.pass(LIVE_FLOOR_MS);
    source().error();
    hand.pass(9_999);
    expect(sources).toHaveLength(1);
    hand.pass(1);
    expect(sources).toHaveLength(2);
  });

  it('doubles its wait to 5 minutes while no stream stays live', () => {
    const waits: number[] = [];
    const { source, hand, sources } = connectionWith(0.999999);
    for (let n = 0; n < 9; n++) {
      hand.pass(LIVE_FLOOR_MS);
      const before = sources.length;
      source().error();
      let waited = 0;
      while (sources.length === before) {
        hand.pass(1_000);
        waited += 1_000;
      }
      waits.push(waited);
    }
    expect(waits).toEqual([
      5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000,
    ]);
  });

  it('does not start over after one ping: a proxy that passes one and then buffers', () => {
    const { source, hand, sources } = connectionWith(0.999999);
    const waitOfError = (): number => {
      hand.pass(LIVE_FLOOR_MS);
      const before = sources.length;
      source().error();
      let waited = 0;
      while (sources.length === before) {
        hand.pass(1_000);
        waited += 1_000;
      }
      return waited;
    };
    source().ping();
    expect(waitOfError()).toBe(5_000);
    source().ping();
    expect(waitOfError()).toBe(10_000);
    source().ping();
    source().ping();
    expect(waitOfError()).toBe(5_000);
  });

  it('stops for good when told, a 401 or 403 found by polling', () => {
    const { connection, source, hand, sources, told } = connectionWith();
    source().ping();
    connection.stop();
    expect(source().closed).toBe(true);
    expect(told.live.at(-1)?.[0]).toBe(false);
    hand.pass(60 * 60_000);
    expect(sources).toHaveLength(1);
    connection.activeChanged();
    hand.pass(60 * 60_000);
    expect(sources).toHaveLength(1);
  });

  it('does nothing where the browser has no EventSource', () => {
    const hand = new Hand();
    const told: boolean[] = [];
    const connection = new LiveConnection({
      open: () => undefined,
      active: () => true,
      now: () => hand.now,
      random: () => 0.5,
      setTimer: hand.setTimer,
      changed: () => undefined,
      liveChanged: (live) => told.push(live),
    });
    connection.start();
    expect(hand.waiting).toEqual([]);
    expect(told).toEqual([]);
  });
});

describe('LiveConnection: hidden or under the region editor', () => {
  it('closes the stream and drops to not live at once', () => {
    const { source, told, setActive, connection } = connectionWith();
    source().ping();
    setActive(false);
    expect(source().closed).toBe(true);
    expect(connection.isLive).toBe(false);
    expect(told.live.at(-1)?.[0]).toBe(false);
  });

  it('opens no stream while hidden, and no late retry opens one', () => {
    const { source, hand, sources, setActive } = connectionWith();
    source().error();
    setActive(false);
    hand.pass(60 * 60_000);
    expect(sources).toHaveLength(1);
  });

  it('opens at once when shown, the floor passed', () => {
    const { hand, sources, setActive } = connectionWith();
    setActive(false);
    hand.pass(LIVE_FLOOR_MS);
    setActive(true);
    expect(sources).toHaveLength(2);
  });

  it('opens no sooner than the floor, however often it is hidden and shown', () => {
    const { hand, sources, setActive } = connectionWith();
    for (let n = 0; n < 4; n++) {
      setActive(false);
      hand.pass(2_000);
      setActive(true);
      hand.pass(2_000);
    }
    expect(sources).toHaveLength(1);
    hand.pass(LIVE_FLOOR_MS);
    expect(sources).toHaveLength(2);
  });

  it('keeps a wait of its backoff across a hide and a show', () => {
    const { source, hand, sources, setActive } = connectionWith(0.999999);
    for (let n = 0; n < 4; n++) {
      hand.pass(LIVE_FLOOR_MS);
      const before = sources.length;
      source().error();
      while (sources.length === before) hand.pass(1_000);
    }
    hand.pass(LIVE_FLOOR_MS);
    source().error();
    // 80 seconds to wait.
    hand.pass(30_000);
    setActive(false);
    hand.pass(10_000);
    setActive(true);
    const before = sources.length;
    hand.pass(39_000);
    expect(sources).toHaveLength(before);
    hand.pass(1_000);
    expect(sources).toHaveLength(before + 1);
  });
});

describe('a crowd of pages when every stream drops together (a bot or tunnel restart)', () => {
  const PAGES = 200;

  /** Pages with real pollers and lists on one clock, each with its random, all live. */
  async function crowd() {
    const hand = new Hand();
    const asks: number[] = [];
    const pages = await Promise.all(
      Array.from({ length: PAGES }, async (_, n) => {
        const random = seededRandom(n + 1);
        const poller = new Poller({
          everyMs: POLL_MS,
          now: () => hand.now,
          active: () => true,
          random,
          setTimer: hand.setTimer,
          load: () => {
            asks.push(hand.now);
            return Promise.resolve('go');
          },
        });
        await poller.start();
        const list = new LiveList({
          poller,
          now: () => hand.now,
          setTimer: hand.setTimer,
          spread: () => 1_000,
        });
        return { poller, list };
      }),
    );
    /** Moves on a second at a time, each question let finish. */
    const pass = async (ms: number): Promise<void> => {
      for (let done = 0; done < ms; done += 1_000) {
        hand.pass(1_000);
        await Promise.all(pages.map((page) => page.poller.idle()));
      }
    };
    /** The most asks that came in any one second of these. */
    const peak = (of: readonly number[]): number => {
      const bySecond = new Map<number, number>();
      for (const at of of) {
        const second = Math.floor(at / 1_000);
        bySecond.set(second, (bySecond.get(second) ?? 0) + 1);
      }
      return Math.max(0, ...bySecond.values());
    };
    return { hand, asks, pages, pass, peak };
  }

  it('scatters the asks of going not live over 20 seconds, none in the instant it drops', async () => {
    const { hand, asks, pages, pass, peak } = await crowd();
    for (const page of pages) page.list.setLive(true, 1_000);
    await pass(30_000);
    asks.length = 0;
    const dropped = hand.now;
    for (const page of pages) page.list.setLive(false, 1_000);
    expect(asks).toEqual([]);
    await pass(POLL_MS);
    const firsts = asks.filter((at) => at < dropped + POLL_MS);
    expect(firsts.length).toBeGreaterThan(PAGES * 0.9);
    // About 10 a second; never the crowd in one second.
    expect(peak(firsts)).toBeLessThan(PAGES / 8);
  });

  it('does not bring them back on one floor instant when all go live again', async () => {
    const { hand, asks, pages, pass, peak } = await crowd();
    // Their worst case: every page asked in one instant, then all live at once.
    asks.length = 0;
    const spread = 4_000;
    for (const page of pages) page.list.setLive(true, spread);
    await pass(LIVE_FLOOR_MS + spread);
    expect(asks).toHaveLength(PAGES);
    expect(Math.min(...asks)).toBeGreaterThanOrEqual(hand.now - spread - 1);
    // Spread over the 4 seconds on top of the floor: about 50 a second.
    expect(peak(asks)).toBeLessThan(PAGES / 2);
    expect(new Set(asks).size).toBeGreaterThan(PAGES * 0.9);
  });
});

describe('a list’s question’s time limit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a signal where the browser has AbortSignal.timeout', () => {
    expect(listAskLimit().signal).toBeInstanceOf(AbortSignal);
  });

  it('is nothing where it has not, so that the question is still asked', () => {
    vi.stubGlobal('AbortSignal', class {});
    expect(listAskLimit()).toEqual({});
  });

  it('is nothing where the browser has no AbortSignal at all', () => {
    vi.stubGlobal('AbortSignal', undefined);
    expect(listAskLimit()).toEqual({});
  });
});

describe('LiveList: a list’s pace', () => {
  function listWith() {
    const hand = new Hand();
    const asked: Array<[string, ...number[]]> = [];
    let latest = 1_000;
    const list: LiveListType = new LiveList({
      poller: {
        setEvery: (ms) => asked.push(['setEvery', ms]),
        setEveryScattered: (ms, scatter) => asked.push(['setEveryScattered', ms, scatter]),
        signalled: (spread) => asked.push(['signalled', spread]),
        askOnce: (floor, spread) => asked.push(['askOnce', floor, spread]),
      },
      now: () => hand.now,
      setTimer: hand.setTimer,
      spread: () => latest,
    });
    return {
      hand,
      asked,
      list,
      setSpread: (to: number): void => {
        latest = to;
      },
    };
  }

  it('polls slowly only while live, the last answer good and the list not read-only', () => {
    const { list, asked } = listWith();
    list.setLive(true, 1_000);
    expect(asked[0]).toEqual(['setEvery', LIVE_POLL_MS]);
    asked.length = 0;
    list.answered(false, false);
    expect(asked).toEqual([['setEvery', POLL_MS]]);
    list.answered(true, false);
    expect(asked.at(-1)).toEqual(['setEvery', LIVE_POLL_MS]);
    list.answered(true, true);
    expect(asked.at(-1)).toEqual(['setEvery', POLL_MS]);
    list.answered(true, false);
    list.setLive(false, 1_000);
    expect(asked.at(-1)).toEqual(['setEveryScattered', POLL_MS, POLL_MS]);
  });

  it('scatters going not live over the polling’s interval, or a longer spread', () => {
    const { list, asked } = listWith();
    list.setLive(true, 4_000);
    list.setLive(false, 4_000);
    expect(asked.at(-1)).toEqual(['setEveryScattered', POLL_MS, POLL_MS]);
    list.setLive(true, POLL_MS * 2);
    list.setLive(false, POLL_MS * 2);
    expect(asked.at(-1)).toEqual(['setEveryScattered', POLL_MS, POLL_MS * 2]);
  });

  it('asks once on going live, inside the ping’s spread and under the floor', () => {
    const { list, asked } = listWith();
    list.setLive(true, 4_000);
    expect(asked).toContainEqual(['askOnce', LIVE_FLOOR_MS, 4_000]);
    asked.length = 0;
    list.setLive(false, 4_000);
    expect(asked.filter(([what]) => what === 'askOnce')).toEqual([]);
  });

  it('passes a signal on with its spread', () => {
    const { list, asked } = listWith();
    list.signal(4_000);
    expect(asked).toEqual([['signalled', 4_000]]);
  });

  it('asks at a party’s next hatch or end while live, inside the latest spread', () => {
    const { hand, list, asked, setSpread } = listWith();
    list.setLive(true, 1_000);
    asked.length = 0;
    list.atNext(hand.now + 10_000);
    hand.pass(10_999);
    expect(asked).toEqual([]);
    // The spread as it is when the timer fires, which pings may have raised since.
    setSpread(8_000);
    hand.pass(1);
    expect(asked).toEqual([['signalled', 8_000]]);
  });

  it('scatters a party’s end inside the spread the pings have raised it to', () => {
    const { connection, hand, source } = connectionWith();
    const asked: number[] = [];
    const list = new LiveList({
      poller: {
        setEvery: () => undefined,
        setEveryScattered: () => undefined,
        signalled: (spread) => asked.push(spread),
        askOnce: () => undefined,
      },
      now: () => hand.now,
      setTimer: hand.setTimer,
      spread: () => connection.latestSpread,
    });
    source().ping(1_000);
    list.setLive(true, 1_000);
    list.atNext(hand.now + 40_000);
    hand.pass(20_000);
    source().ping(20_000);
    hand.pass(21_000);
    expect(asked).toEqual([20_000]);
  });

  it('asks nothing at a moment while it is not live: the poll has it', () => {
    const { hand, list, asked } = listWith();
    list.atNext(hand.now + 10_000);
    hand.pass(20_000);
    expect(asked).toEqual([]);
  });

  it('keeps one timer: the next list’s moment replaces the one before', () => {
    const { hand, list, asked } = listWith();
    list.setLive(true, 1_000);
    asked.length = 0;
    list.atNext(hand.now + 10_000);
    list.atNext(hand.now + 30_000);
    hand.pass(20_000);
    expect(asked).toEqual([]);
    list.atNext(undefined);
    hand.pass(60_000);
    expect(asked).toEqual([]);
  });
});
