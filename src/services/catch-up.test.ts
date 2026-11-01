import { describe, expect, it } from 'vitest';
import { heldCall } from '../../test/support/held-call.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { CatchUp, type CatchUpJob, type CatchUpOutcome } from './catch-up.js';

/** A job that records its runs and answers as the test says (by default, done). */
function job(
  name: string,
  ran: string[],
  answer: () => Promise<CatchUpOutcome> = () => Promise.resolve('done'),
): CatchUpJob {
  return {
    name,
    run: () => {
      ran.push(name);
      return answer();
    },
  };
}

describe('CatchUp (plan 8X-H): what failed while the gateway was away, run at once', () => {
  it('runs the jobs one after another, and says which ran, which failed again and which were not owed', async () => {
    const { log, entries } = createTestLogger();
    const ran: string[] = [];
    const held = heldCall('the sweep');
    const catchUp = new CatchUp({
      log,
      jobs: [
        job('sweep', ran, async () => {
          held.arrive();
          await held.released;
          return 'done';
        }),
        job('raid bosses', ran, () => Promise.resolve('failed')),
        job('lineups', ran, () => Promise.resolve('not-owed')),
        job('emoji', ran, () => Promise.reject(new Error('down'))),
      ],
    });
    catchUp.request();
    await held.reached;
    // One at a time: the next waits for the sweep.
    expect(ran).toEqual(['sweep']);
    held.release();
    await catchUp.whenIdle();
    expect(ran).toEqual(['sweep', 'raid bosses', 'lineups', 'emoji']);
    expect(entries.filter((entry) => entry['msg'] === 'caught up')).toEqual([
      expect.objectContaining({
        level: 30,
        ran: ['sweep'],
        failed: ['raid bosses', 'emoji'],
        notOwed: ['lineups'],
      }),
    ]);
    expect(entries.filter((entry) => entry['msg'] === 'could not catch up')).toEqual([
      expect.objectContaining({ level: 40, job: 'emoji' }),
    ]);
  });

  it('runs once more after a run when the gateway came back again meanwhile, not more', async () => {
    const { log } = createTestLogger();
    const ran: string[] = [];
    const held = heldCall('the first job');
    let first = true;
    const catchUp = new CatchUp({
      log,
      jobs: [
        job('sweep', ran, async () => {
          if (first) {
            first = false;
            held.arrive();
            await held.released;
          }
          return 'done';
        }),
      ],
    });
    catchUp.request();
    await held.reached;
    // A network that flaps: three returns while the first catch-up runs.
    catchUp.request();
    catchUp.request();
    catchUp.request();
    held.release();
    await catchUp.whenIdle();
    expect(ran).toEqual(['sweep', 'sweep']);
  });

  it('starts nothing once closed; close does not wait for a job that blocks, whenIdle does (review r0 B6)', async () => {
    const { log } = createTestLogger();
    const ran: string[] = [];
    const held = heldCall('the sweep');
    let done = false;
    const catchUp = new CatchUp({
      log,
      jobs: [
        job('sweep', ran, async () => {
          held.arrive();
          await held.released;
          done = true;
          return 'done';
        }),
        job('raid bosses', ran),
      ],
    });
    catchUp.request();
    await held.reached;
    // The shutdown's clock step closes it without waiting: a feed's read under way ends only at
    // the feed's own stop, a later step.
    expect(catchUp.close()).toBeUndefined();
    expect(done).toBe(false);
    const idle = catchUp.whenIdle();
    held.release();
    await idle;
    expect(done).toBe(true);
    expect(ran).toEqual(['sweep']);
    catchUp.request();
    await catchUp.whenIdle();
    expect(ran).toEqual(['sweep']);
  });
});
