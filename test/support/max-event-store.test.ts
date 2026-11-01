import { describe, expect, it } from 'vitest';
import { maxEventCases } from './max-event-store-cases.js';
import { MemoryMaxEvents } from './max-event-store.js';

describe('MemoryMaxEvents', () => {
  maxEventCases(() => Promise.resolve(new MemoryMaxEvents()));

  // Review r0, X5-2: as the repository fails, by a rejected promise, never a throw at the call.
  it('fails a method it is told to fail by rejecting its promise', async () => {
    const store = new MemoryMaxEvents();
    const down = new Error('database down');
    store.failing.set('all', down);
    store.failing.set('replace', down);
    let all: Promise<unknown> | undefined;
    let replace: Promise<unknown> | undefined;
    expect(() => {
      all = store.all();
      replace = store.replace({ max: [], big: [] });
    }).not.toThrow();
    await expect(all).rejects.toBe(down);
    await expect(replace).rejects.toBe(down);
  });
});
