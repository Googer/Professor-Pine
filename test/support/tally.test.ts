import { describe, expect, it } from 'vitest';
import { Tally, TALLY_LIMIT_MS } from './tally.js';

describe('Tally', () => {
  it('resolves once it has been added to as often as asked, and not before', async () => {
    const tally = new Tally();
    const order: string[] = [];
    const two = tally.reached(2).then(() => order.push('two'));
    const one = tally.reached(1).then(() => order.push('one'));
    tally.add();
    await one;
    expect(order).toEqual(['one']);
    tally.add();
    await two;
    expect(order).toEqual(['one', 'two']);
    expect(tally.count).toBe(2);
  });

  it('fails with what it waited for and what it saw when the count does not come', async () => {
    const tally = new Tally('requests to the gateway', 10);
    tally.add();
    await expect(tally.reached(3)).rejects.toThrow(
      'still waiting for requests to the gateway to reach 3, saw 1',
    );
    // A wait that gave up is forgotten: the count goes on as before.
    tally.add();
    tally.add();
    await tally.reached(3);
  });

  it('waits far longer than any count takes to come, and well under the test timeout', () => {
    expect(TALLY_LIMIT_MS).toBeGreaterThanOrEqual(10_000);
    expect(TALLY_LIMIT_MS).toBeLessThan(15_000);
  });

  it('resolves at once for a count it has reached already', async () => {
    const tally = new Tally();
    tally.add();
    tally.add();
    await tally.reached(1);
    await tally.reached(2);
    await tally.reached(0);
    expect(tally.count).toBe(2);
  });
});

// In this order, also in a shuffled run: the second test looks at what the first left behind.
describe('Tally: a wait left behind by a test that ended', { shuffle: false }, () => {
  let quiet: () => boolean = () => true;

  it('is given up with its test', () => {
    let settled = false;
    void new Tally('the forgotten count', 20).reached(1).then(
      () => (settled = true),
      () => (settled = true),
    );
    quiet = () => !settled;
  });

  it('never rejects into a later test', async () => {
    // Past the 20 ms of the wait left behind, measured by a wait of this test that does give up.
    await expect(new Tally('a wait that gives up', 60).reached(1)).rejects.toThrow(
      'still waiting for a wait that gives up to reach 1, saw 0',
    );
    expect(quiet()).toBe(true);
  });
});
