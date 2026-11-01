import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coalescer } from './coalescer.js';

function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('Coalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function make(
    work: (key: string) => Promise<void> = () => Promise.resolve(),
    onError: (err: unknown, key: string) => void = () => undefined,
  ) {
    const runs: string[] = [];
    const errors: unknown[] = [];
    const coalescer = new Coalescer<string>({
      delayMs: 2_000,
      work: (key) => {
        runs.push(key);
        return work(key);
      },
      onError: (err, key) => {
        errors.push(err);
        onError(err, key);
      },
    });
    return { coalescer, runs, errors };
  }

  it('runs the first request after a quiet time at once, per key', async () => {
    const { coalescer, runs } = make();
    coalescer.request('a');
    coalescer.request('b');
    expect(runs).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(0);
    expect(coalescer.pending).toBe(0);
  });

  it('forgets the last start of a key once it is older than the delay and the key is idle', async () => {
    const { coalescer } = make();
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(coalescer.tracked).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    coalescer.request('b');
    await vi.advanceTimersByTimeAsync(0);
    expect(coalescer.tracked).toBe(1);
  });

  it('gathers later requests into one run, delayMs after the last start', async () => {
    const { coalescer, runs } = make();
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(500);
    coalescer.request('a');
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(1_499);
    expect(runs).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(['a', 'a']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual(['a', 'a']);
  });

  it('runs a request at once when the last run started long enough ago', async () => {
    const { coalescer, runs } = make();
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(2_000);
    coalescer.request('a');
    expect(runs).toEqual(['a', 'a']);
  });

  it('runs once more after a run during which it was asked for again, never two at once', async () => {
    const first = gate();
    let active = 0;
    let most = 0;
    const { coalescer, runs } = make(async () => {
      active++;
      most = Math.max(most, active);
      if (runs.length === 1) await first.opened;
      active--;
    });
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(2_500);
    coalescer.request('a');
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual(['a']);
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    // The run started 12.5 seconds ago, so the follow-up is not held back.
    expect(runs).toEqual(['a', 'a']);
    expect(most).toBe(1);
  });

  it('holds the follow-up run back until delayMs after the start of the run before it', async () => {
    const first = gate();
    const { coalescer, runs } = make(() => (runs.length === 1 ? first.opened : Promise.resolve()));
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(300);
    coalescer.request('a');
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1_699);
    expect(runs).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(['a', 'a']);
  });

  it('hands a failure to onError and carries on', async () => {
    const { coalescer, runs, errors } = make((key) =>
      key === 'bad' ? Promise.reject(new Error('broken')) : Promise.resolve(),
    );
    coalescer.request('bad');
    coalescer.request('good');
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([new Error('broken')]);
    await vi.advanceTimersByTimeAsync(2_000);
    coalescer.request('bad');
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(['bad', 'good', 'bad']);
  });

  it('survives work that throws at once, and an onError that throws', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { coalescer, runs, errors } = make(
        () => {
          throw new Error('sync');
        },
        () => {
          throw new Error('handler');
        },
      );
      coalescer.request('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(errors).toEqual([new Error('sync')]);
      expect(coalescer.pending).toBe(0);
      await vi.advanceTimersByTimeAsync(2_000);
      coalescer.request('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(runs).toEqual(['a', 'a']);
      await vi.advanceTimersByTimeAsync(0);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('flushes what is waiting at once, and what was asked for meanwhile', async () => {
    const { coalescer, runs } = make((key) => {
      if (key === 'a' && runs.length === 1) coalescer.request('c');
      return Promise.resolve();
    });
    coalescer.request('a');
    coalescer.request('a');
    coalescer.request('b');
    expect(coalescer.pending).toBe(3);
    await vi.advanceTimersByTimeAsync(0);
    const flushed = coalescer.flush();
    await vi.advanceTimersByTimeAsync(0);
    await flushed;
    expect(runs).toEqual(['a', 'c', 'b', 'a']);
    expect(coalescer.pending).toBe(0);
  });

  it('flushes a run that is going on and the request queued behind it', async () => {
    const first = gate();
    const { coalescer, runs } = make(() => (runs.length === 1 ? first.opened : Promise.resolve()));
    coalescer.request('a');
    coalescer.request('a');
    const flushed = coalescer.flush();
    let done = false;
    void flushed.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    await flushed;
    expect(runs).toEqual(['a', 'a']);
    expect(coalescer.pending).toBe(0);
  });

  it('ignores requests from the moment stop is called', async () => {
    const first = gate();
    const { coalescer, runs } = make(() => (runs.length === 1 ? first.opened : Promise.resolve()));
    coalescer.request('a');
    const stopped = coalescer.stop();
    coalescer.request('b');
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual(['a']);
  });
});
