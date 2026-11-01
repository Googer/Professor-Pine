import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { squareRing } from '../../test/support/region-admin.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { SaveCheckWorker, inThisThread, SaveChecks, type SaveChecker } from './save-check.js';

const HANGING = fileURLToPath(new URL('../../test/support/hanging-thread.ts', import.meta.url));

const WEST = { key: 'r1', outline: squareRing(40.0, -80.1, 40.1, -80.0) };
const EAST = { key: 'r2', outline: squareRing(40.0, -80.0, 40.1, -79.9) };
/** West grown into east: a new overlap. */
const GROWN = { key: 'r1', outline: squareRing(40.0, -80.1, 40.1, -79.99) };

describe('the check of a save in a thread of its own', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('works out the new overlaps and gaps as on the bot thread', async () => {
    // A generous limit: starting a thread through tsx takes seconds on a busy machine.
    const worker = new SaveCheckWorker({ log: createTestLogger().log, limitMs: 60_000 });
    const verdict = await worker.check([WEST, EAST], [GROWN, EAST]);
    expect(verdict.kind).toBe('checked');
    const local = await inThisThread.check([WEST, EAST], [GROWN, EAST]);
    expect(verdict).toEqual(local);
    if (verdict.kind === 'checked') expect(verdict.coverage.overlaps).toHaveLength(1);
  });

  it('gives up on a check past its time limit, and runs one check at a time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const worker = new SaveCheckWorker({ log: createTestLogger().log, file: HANGING });
    const first = worker.check([WEST], [GROWN]);
    const second = worker.check([WEST], [GROWN]);
    // The second waits: one limit runs.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toEqual({ kind: 'too-complex' });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await second).toEqual({ kind: 'too-complex' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('says it cannot check when the thread does not start, rather than letting the save through', async () => {
    const worker = new SaveCheckWorker({
      log: createTestLogger().log,
      file: fileURLToPath(new URL('./no-such-thread.js', import.meta.url)),
    });
    expect(await worker.check([WEST], [GROWN])).toMatchObject({ kind: 'unavailable' });
  });

  it('lets at most three checks wait beyond the one running', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const worker = new SaveCheckWorker({ log: createTestLogger().log, file: HANGING });
    const accepted = [1, 2, 3, 4].map(() => worker.check([WEST], [GROWN]));
    expect(await worker.check([WEST], [GROWN])).toEqual({ kind: 'busy' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await accepted[0]).toEqual({ kind: 'too-complex' });
    // The first is over: one more may wait.
    const fifth = worker.check([WEST], [GROWN]);
    expect(await worker.check([WEST], [GROWN])).toEqual({ kind: 'busy' });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(await Promise.all([...accepted.slice(1), fifth])).toEqual(
      Array.from({ length: 4 }, () => ({ kind: 'too-complex' })),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the checks of the saves', () => {
  it('keep a verdict for a few minutes, by what it was of', async () => {
    const checks = new Tally();
    const counting: SaveChecker = {
      check: (before, after) => {
        checks.add();
        return inThisThread.check(before, after);
      },
    };
    const clock = { now: 0 };
    const saves = new SaveChecks(counting, () => clock.now);
    const verdict = await saves.check('a', [WEST, EAST], [GROWN, EAST]);
    expect(await saves.check('a', [WEST, EAST], [GROWN, EAST])).toEqual(verdict);
    expect(checks.count).toBe(1);
    await saves.check('b', [WEST, EAST], [GROWN, EAST]);
    expect(checks.count).toBe(2);
    clock.now += 5 * 60_000;
    await saves.check('a', [WEST, EAST], [GROWN, EAST]);
    expect(checks.count).toBe(3);
  });

  it('keep no verdict of a check that did not come to one', async () => {
    const checks = new Tally();
    const saves = new SaveChecks(
      {
        check: () => {
          checks.add();
          return Promise.resolve({ kind: 'too-complex' });
        },
      },
      () => 0,
    );
    await saves.check('a', [WEST], [GROWN]);
    await saves.check('a', [WEST], [GROWN]);
    expect(checks.count).toBe(2);
  });
});
