import { describe, expect, it } from 'vitest';
import type { PostView } from '../../domain/web/party-data.js';
import { prefetchOrder, PostViews } from './post-views.js';

const view = (key: string): PostView => ({ key, accent: 'egg', blocks: [] });

/** Posts the test answers by hand: each asked load waits until the test resolves it. */
function handLoads() {
  const asked: Array<{ id: string; key: string; answer: (view: PostView | undefined) => void }> =
    [];
  const loaded: string[] = [];
  const views = new PostViews({
    load: (id, key) =>
      new Promise((resolve) => {
        asked.push({ id, key, answer: resolve });
      }),
    loaded: (id) => {
      loaded.push(id);
    },
  });
  return { views, asked, loaded };
}

describe('PostViews: the posts asked for ahead after a signal', () => {
  /** Posts over timers a test runs by hand, each wait its share of the spread, in turn. */
  function spreading() {
    const timers = new Set<{ at: number; run: () => void }>();
    const asked: string[] = [];
    const keys: string[] = [];
    let active = true;
    let elapsed = 0;
    let next = 0;
    const randoms = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
    const views = new PostViews({
      load: (id, key) => {
        asked.push(id);
        keys.push(key);
        return Promise.resolve(undefined);
      },
      loaded: () => undefined,
      active: () => active,
      random: () => randoms[next++ % randoms.length] ?? 0,
      setTimer: (run, ms) => {
        const timer = { at: elapsed + ms, run };
        timers.add(timer);
        return () => {
          timers.delete(timer);
        };
      },
    });
    const pass = (ms: number): void => {
      elapsed += ms;
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at > elapsed) continue;
        timers.delete(timer);
        timer.run();
      }
    };
    return {
      views,
      asked,
      keys,
      pass,
      timers,
      setActive: (to: boolean): void => {
        active = to;
      },
    };
  }
  const six = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id) => ({ id, postKey: `${id}-new` }));

  it('asks the open popup’s post at once and the others inside the spread', () => {
    const { views, asked, pass, timers } = spreading();
    views.prefetch(six, 20, { ms: 4_000, atOnce: (id) => id === 'r4' });
    expect(asked).toEqual(['r4']);
    pass(4_000);
    expect([...asked].sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(timers.size).toBe(0);
    // Not at once, and not all in one instant.
    expect(asked[1]).toBe('r1');
  });

  it('holds them apart inside the spread', () => {
    const { views, asked, pass } = spreading();
    views.prefetch(six, 20, { ms: 4_000, atOnce: () => false });
    pass(1_000);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThan(6);
  });

  it('asks at once what a popup draws while its wait is on, once', () => {
    const { views, asked, pass } = spreading();
    views.prefetch(six, 20, { ms: 4_000, atOnce: () => false });
    const before = asked.length;
    const party = six[5];
    if (!party) throw new Error('no party');
    views.of(party);
    expect(asked.slice(before)).toEqual(['r6']);
    pass(4_000);
    expect(asked.filter((id) => id === 'r6')).toEqual(['r6']);
  });

  it('asks nothing for a party forgotten during its wait', () => {
    const { views, asked, pass } = spreading();
    views.prefetch(six, 20, { ms: 4_000, atOnce: (id) => id === 'r1' });
    views.keepOnly([{ id: 'r1' }]);
    pass(4_000);
    expect(asked).toEqual(['r1']);
  });

  it('takes the newer key of a party waiting, without a second wait', () => {
    const { views, asked, keys, pass } = spreading();
    const one = six.slice(0, 1);
    views.prefetch(one, 20, { ms: 4_000, atOnce: () => false });
    views.prefetch([{ id: 'r1', postKey: 'r1-newer' }], 20, { ms: 4_000, atOnce: () => false });
    pass(4_000);
    expect(asked).toEqual(['r1']);
    expect(keys).toEqual(['r1-newer']);
  });

  it('asks nothing when its wait ends on a page not in use, and asks when next drawn', () => {
    const { views, asked, pass, setActive } = spreading();
    const one = six.slice(0, 1);
    views.prefetch(one, 20, { ms: 4_000, atOnce: () => false });
    setActive(false);
    pass(4_000);
    expect(asked).toEqual([]);
    setActive(true);
    views.prefetch(one, 20);
    expect(asked).toEqual(['r1']);
  });

  it('asks every post at once without a spread: the first list of a visit, a press’s list', () => {
    const { views, asked, timers } = spreading();
    views.prefetch(six, 20);
    expect(asked).toHaveLength(6);
    expect(timers.size).toBe(0);
  });
});

describe('PostViews: the posts the page has, by their keys (plan 8M-8A)', () => {
  it('asks for a post once, and has it once it came', async () => {
    const { views, asked, loaded } = handLoads();
    const party = { id: 'r1', postKey: 'a' };
    expect(views.of(party)).toBeUndefined();
    expect(views.of(party)).toBeUndefined();
    expect(asked.map((one) => [one.id, one.key])).toEqual([['r1', 'a']]);
    asked[0]?.answer(view('a'));
    await views.idle();
    expect(loaded).toEqual(['r1']);
    expect(views.of(party)).toEqual(view('a'));
    expect(asked).toHaveLength(1);
  });

  it('shows the post it has while it asks for the post of a new key', async () => {
    const { views, asked } = handLoads();
    views.of({ id: 'r1', postKey: 'a' });
    asked[0]?.answer(view('a'));
    await views.idle();
    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('a'));
    expect(asked.map((one) => one.key)).toEqual(['a', 'b']);
    asked[1]?.answer(view('b'));
    await views.idle();
    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('b'));
  });

  it('asks nothing for a party without a post, and asks again after a failed load', async () => {
    const { views, asked, loaded } = handLoads();
    expect(views.of({ id: 'r1', postKey: null })).toBeUndefined();
    expect(asked).toEqual([]);
    views.of({ id: 'r2', postKey: 'a' });
    asked[0]?.answer(undefined);
    await views.idle();
    expect(loaded).toEqual([]);
    views.of({ id: 'r2', postKey: 'a' });
    expect(asked).toHaveLength(2);
  });

  it('fetches ahead at most the parties it is given up to its bound, those it has not got (8A-3)', async () => {
    const { views, asked } = handLoads();
    views.of({ id: 'r0', postKey: 'k0' });
    asked[0]?.answer(view('k0'));
    await views.idle();
    const parties = Array.from({ length: 30 }, (_, n) => ({ id: `r${n}`, postKey: `k${n}` }));
    views.prefetch(parties, 20);
    // Of the first 20: r0 it has, r1 to r19 asked; nothing beyond the bound, nothing twice.
    expect(asked.slice(1).map((one) => one.id)).toEqual(
      Array.from({ length: 19 }, (_, n) => `r${n + 1}`),
    );
    views.prefetch(parties, 20);
    expect(asked).toHaveLength(20);
    views.prefetch([{ id: 'x', postKey: null }], 20);
    expect(asked).toHaveLength(20);
  });

  it('forgets the posts of parties a list no longer has (review W-5)', async () => {
    const { views, asked } = handLoads();
    views.of({ id: 'r1', postKey: 'a' });
    views.of({ id: 'r2', postKey: 'b' });
    asked[0]?.answer(view('a'));
    asked[1]?.answer(view('b'));
    await views.idle();
    // Asking ahead for a few (a popup's parties under the pointer) forgets nothing.
    views.prefetch([{ id: 'r2', postKey: 'b' }], 20);
    expect(views.of({ id: 'r1', postKey: 'a' })).toEqual(view('a'));
    views.keepOnly([{ id: 'r2' }]);
    expect(views.of({ id: 'r2', postKey: 'b' })).toEqual(view('b'));
    // r1 ended: its post is gone from the page, asked for anew should it come back.
    expect(views.of({ id: 'r1', postKey: 'a' })).toBeUndefined();
    expect(asked.map((one) => one.id)).toEqual(['r1', 'r2', 'r1']);
  });

  it('asks ahead on a page’s first list for the parties in view alone, later for the rest too (N6)', () => {
    const parties = ['a', 'b', 'c', 'd'].map((id) => ({ id, postKey: 'k' }));
    const inView = (party: { id: string }) => party.id === 'b' || party.id === 'd';
    expect(prefetchOrder(parties, inView, true).map((one) => one.id)).toEqual(['b', 'd']);
    expect(prefetchOrder(parties, inView, false).map((one) => one.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('keeps a post that came only while its key is the one asked for last', async () => {
    const { views, asked } = handLoads();
    views.of({ id: 'r1', postKey: 'a' });
    views.of({ id: 'r1', postKey: 'b' });
    asked[1]?.answer(view('b'));
    asked[0]?.answer(view('a'));
    await views.idle();
    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('b'));
  });
});
