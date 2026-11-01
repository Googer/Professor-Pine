import { describe, expect, it } from 'vitest';
import { heldCall } from './held-call.js';

describe('heldCall', () => {
  it('is reached once the call waits, and goes on at release', async () => {
    const held = heldCall('the send in West');
    const order: string[] = [];
    const call = (async () => {
      held.arrive();
      await held.released;
      order.push('call went on');
    })();
    await held.reached;
    expect(order).toEqual([]);
    held.release();
    await call;
    expect(order).toEqual(['call went on']);
  });

  it('gives up waiting for a call that never comes, naming it (F8)', async () => {
    const held = heldCall('the edit in East', 10);
    await expect(held.reached).rejects.toThrow('still waiting for the edit in East to be reached');
  });

  it('resolves at once once the call has waited already', async () => {
    const held = heldCall('the send in West', 10);
    held.arrive();
    await held.reached;
    await held.reached;
  });
});
