import { describe, expect, it } from 'vitest';
import { INTO_THE_WILD_WINDOW } from '../../test/support/event-window-store-cases.js';
import { MemoryEventWindows } from '../../test/support/event-window-store.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { EventWindowService } from './event-window-service.js';

const MINUTE = 60_000;
const window = INTO_THE_WILD_WINDOW;

function service(store = new MemoryEventWindows()) {
  const { log, entries } = createTestLogger();
  return { windows: new EventWindowService({ store, log }), store, entries };
}

describe('EventWindowService', () => {
  it('has no window until one is set, then keeps it in the store and gives it at once', async () => {
    const { windows, store } = service();
    expect(windows.current()).toBeUndefined();
    await windows.set(window);
    expect(windows.current()).toEqual(window);
    expect(await store.current()).toEqual(window);
  });

  it('survives a restart: the kept window is loaded', async () => {
    const store = new MemoryEventWindows(window);
    const { windows, entries } = service(store);
    expect(windows.current()).toBeUndefined();
    await windows.load();
    expect(windows.current()).toEqual(window);
    expect(entries.find((entry) => entry.msg === 'event window loaded')).toMatchObject({
      start: window.start,
      end: window.end,
    });
  });

  it('keeps nothing in memory when the store refuses, and says so on a load', async () => {
    const store = new MemoryEventWindows();
    store.failing.set('keep', new Error('the database is down'));
    const { windows } = service(store);
    await expect(windows.set(window)).rejects.toThrow('the database is down');
    expect(windows.current()).toBeUndefined();
    const broken = new MemoryEventWindows();
    broken.failing.set('current', new Error('the database is down'));
    const after = service(broken);
    await after.windows.load();
    expect(after.windows.current()).toBeUndefined();
    expect(
      after.entries.find((entry) => entry.msg === 'could not read the event window'),
    ).toMatchObject({ level: 40 });
  });

  it('ends a window on now: what came before stays, nothing after; none to end is said', async () => {
    const { windows, store } = service();
    expect(await windows.end(window.start)).toBeUndefined();
    await windows.set(window);
    const now = window.start + 90 * MINUTE;
    expect(await windows.end(now)).toEqual({ ...window, end: now });
    expect(windows.current()).toEqual({ ...window, end: now });
    expect(await store.current()).toEqual({ ...window, end: now });
    // Over already: nothing to end.
    expect(await windows.end(now + MINUTE)).toBeUndefined();
    expect(windows.ongoing(now + MINUTE)).toBeUndefined();
  });

  it('ends a window that has not begun as none at all', async () => {
    const { windows } = service();
    await windows.set(window);
    const before = window.start - 60 * MINUTE;
    expect(windows.ongoing(before)).toEqual(window);
    expect(await windows.end(before)).toEqual({ ...window, end: window.start });
    // An empty window is none: no event of it reaches a reader (no start to cut a battle at).
    expect(windows.current()).toBeUndefined();
  });
});
