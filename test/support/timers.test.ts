import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeTimeoutSignals,
  watchBackground,
  watchEachTest,
  watchForTest,
  watchImmediates,
} from './timers.js';

const realImmediate = globalThis.setImmediate;
const realClear = globalThis.clearImmediate;

afterEach(() => {
  vi.useRealTimers();
});

describe('watchImmediates', () => {
  /** An answer as the fakes give it: in a later turn of the event loop. */
  const answer = (text: string) =>
    new Promise<string>((resolve) => {
      setImmediate(() => {
        resolve(text);
      });
    });

  it('settles once the answers and everything that follows from them are done, and no sooner', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const watch = watchImmediates();
    try {
      const said: string[] = [];
      // Work in the background, as a service does it: nobody awaits it.
      void (async () => {
        for (const text of ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']) {
          said.push(await answer(text));
          await Promise.resolve();
        }
        setTimeout(() => said.push('ten minutes later'), 600_000);
      })();
      await watch.settle();
      expect(said).toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'sixth']);
      // The timer the work asked for at its end is there, and it has not run.
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      watch.restore();
    }
  });

  it('settles at once when nothing waits, and gives the globals back', async () => {
    const watch = watchImmediates();
    await watch.settle();
    watch.restore();
    expect(globalThis.setImmediate).toBe(realImmediate);
    expect(globalThis.clearImmediate).toBe(realClear);
  });

  it('watchBackground fakes the timers and watches the immediates until the test ends', async () => {
    const watch = watchBackground();
    let answered = false;
    setTimeout(() => undefined, 600_000);
    setImmediate(() => {
      answered = true;
    });
    await watch.settle();
    expect(answered).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('gives the globals back once every watch is restored, in whatever order', async () => {
    const outer = watchImmediates();
    const inner = watchImmediates();
    let done = false;
    setImmediate(() => {
      done = true;
    });
    // Both see what was asked for while both watch.
    await outer.settle();
    expect(done).toBe(true);
    outer.restore();
    expect(globalThis.setImmediate).not.toBe(realImmediate);
    inner.restore();
    expect(globalThis.setImmediate).toBe(realImmediate);
    expect(globalThis.clearImmediate).toBe(realClear);
  });

  it('refuses to settle when setImmediate is no longer the watched one, and leaves it alone', async () => {
    const watch = watchImmediates();
    vi.useFakeTimers({ toFake: ['setImmediate', 'clearImmediate'] });
    const faked = globalThis.setImmediate;
    await expect(watch.settle()).rejects.toThrow('setImmediate is not the watched one (faked?)');
    // Ending the watch now does not take away the fake that stands over it.
    watch.restore();
    expect(globalThis.setImmediate).toBe(faked);
    vi.useRealTimers();
  });

  it('gives up settling a background that never ends, and says how much still waits', async () => {
    const watch = watchImmediates();
    let beating = true;
    const beat = (): void => {
      if (beating) setImmediate(beat);
    };
    try {
      setImmediate(beat);
      await expect(watch.settle()).rejects.toThrow(
        'the background never settled: 1 immediates still waiting',
      );
    } finally {
      beating = false;
      watch.restore();
    }
  });

  it('does not wait for a callback that was cleared', async () => {
    const watch = watchImmediates();
    try {
      let ran = false;
      clearImmediate(
        setImmediate(() => {
          ran = true;
        }),
      );
      await watch.settle();
      expect(ran).toBe(false);
    } finally {
      watch.restore();
    }
  });
});

describe('fakeTimeoutSignals', () => {
  it('gives AbortSignal.timeout signals that abort as a timeout only when the test says so', async () => {
    const timeouts = fakeTimeoutSignals();
    const signal = AbortSignal.timeout(30_000);
    const reason = new Promise<unknown>((resolve) => {
      signal.addEventListener('abort', () => {
        resolve(signal.reason);
      });
    });
    await timeouts.made.reached(1);
    expect(timeouts.lengths).toEqual([30_000]);
    expect(signal.aborted).toBe(false);
    timeouts.expire();
    expect(await reason).toMatchObject({ name: 'TimeoutError' });
    // The time is up for a limit made afterwards too.
    const later = AbortSignal.timeout(10);
    expect(later.aborted).toBe(true);
    expect(later.reason).toMatchObject({ name: 'TimeoutError' });
  });
});

describe('watchEachTest and watchForTest', () => {
  const each = watchEachTest();
  /** Work in the background that takes three answers. */
  const work = (said: string[]) => {
    void (async () => {
      for (const text of ['one', 'two', 'three']) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        said.push(text);
      }
    })();
  };

  it('settles the background of every test of the file', async () => {
    const said: string[] = [];
    work(said);
    await each.settle();
    expect(said).toEqual(['one', 'two', 'three']);
  });

  it('settles the background of the rest of the test', async () => {
    const watch = watchForTest();
    const said: string[] = [];
    work(said);
    await watch.settle();
    expect(said).toEqual(['one', 'two', 'three']);
  });
});
