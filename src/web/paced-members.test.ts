import { afterEach, describe, expect, it } from 'vitest';
import type { ServerMember } from '../discord/member-directory.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { webServerWith, type TestWeb } from '../../test/support/web.js';
import { MembersClosingError, PACED_FETCH_PATIENCE_MS, PacedMembers } from './paced-members.js';

const GUILD = FAKE_GUILD_ID;
const member = (id: string): ServerMember => ({ id, name: id });

/** A directory whose answers are all cold unless `known`, each fetch counted and resolved at once. */
class ColdDirectory {
  readonly known = new Set<string>();
  readonly fetched: string[] = [];
  readonly fetches = new Tally('the fresh fetches of members');
  failing: Error | undefined;
  /** The fetches of these answer only when the test releases them. */
  readonly holding = new Map<string, () => void>();
  readonly held = new Set<string>();

  holds(_guildId: string, userId: string): boolean {
    return this.known.has(userId);
  }

  async find(_guildId: string, userId: string): Promise<ServerMember | undefined> {
    if (!this.known.has(userId)) {
      this.fetched.push(userId);
      this.fetches.add();
    }
    if (this.held.has(userId)) {
      await new Promise<void>((resolve) => {
        this.holding.set(userId, resolve);
      });
    }
    if (this.failing) throw this.failing;
    this.known.add(userId);
    return member(userId);
  }
}

function pacedWith(perSecond = 20) {
  const clock = { now: 1_000 };
  const timers = new Set<{ at: number; run: () => void }>();
  const directory = new ColdDirectory();
  const { log, entries } = createTestLogger();
  const paced = new PacedMembers(directory, {
    perSecond,
    now: () => clock.now,
    log,
    setTimer: (run, ms) => {
      const timer = { at: clock.now + ms, run };
      timers.add(timer);
      return () => {
        timers.delete(timer);
      };
    },
  });
  const pass = (ms: number): void => {
    const until = clock.now + ms;
    for (;;) {
      const next = [...timers].filter((one) => one.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers.delete(next);
      clock.now = next.at;
      next.run();
    }
    clock.now = until;
  };
  return {
    paced,
    directory,
    pass,
    timers,
    entries,
    /** The wall clock steps back; the timers already set keep their own count. */
    stepBack: (ms: number): void => {
      clock.now -= ms;
      for (const timer of timers) timer.at -= ms;
    },
  };
}

describe('PacedMembers', () => {
  it('lets the first fetch through at once, and the others at the pace, first in first out', async () => {
    const { paced, directory, pass } = pacedWith();
    const [a, b] = [paced.find(GUILD, 'a'), paced.find(GUILD, 'b'), paced.find(GUILD, 'c')];
    expect(directory.fetched).toEqual(['a']);
    await a;
    pass(49);
    expect(directory.fetched).toEqual(['a']);
    pass(1);
    expect(directory.fetched).toEqual(['a', 'b']);
    await b;
    pass(50);
    expect(directory.fetched).toEqual(['a', 'b', 'c']);
  });

  it('holds 100 members to their 5 seconds at 20 a second', async () => {
    const { paced, directory, pass } = pacedWith();
    const asks = Array.from({ length: 100 }, (_, n) => paced.find(GUILD, `m${n}`));
    for (const ask of asks) {
      await ask;
      pass(50);
    }
    expect(directory.fetched).toHaveLength(100);
    // A fetch each 50 ms and no sooner: no more than one had started before the first interval.
    const again = pacedWith();
    const first = again.paced.find(GUILD, 'x');
    void again.paced.find(GUILD, 'y');
    await first;
    again.pass(49);
    expect(again.directory.fetched).toEqual(['x']);
  });

  it('takes the limit it is given', async () => {
    const { paced, directory, pass } = pacedWith(10);
    const a = paced.find(GUILD, 'a');
    void paced.find(GUILD, 'b');
    await a;
    pass(99);
    expect(directory.fetched).toEqual(['a']);
    pass(1);
    expect(directory.fetched).toEqual(['a', 'b']);
  });

  it('starts no second fetch while one is on its way, past the interval too', async () => {
    const { paced, directory, pass } = pacedWith();
    directory.held.add('slow');
    const slow = paced.find(GUILD, 'slow');
    void paced.find(GUILD, 'next');
    pass(1_000);
    expect(directory.fetched).toEqual(['slow']);
    directory.holding.get('slow')?.();
    await slow;
    // The interval has long passed: the next goes as the last one settles.
    expect(directory.fetched).toEqual(['slow', 'next']);
  });

  it('lets a press past the fetch on its way', async () => {
    const { paced, directory } = pacedWith();
    directory.held.add('slow');
    void paced.find(GUILD, 'slow');
    void paced.find(GUILD, 'waiting');
    await expect(directory.find(GUILD, 'pressed')).resolves.toEqual(member('pressed'));
    expect(directory.fetched).toEqual(['slow', 'pressed']);
  });

  it('goes on after 5 seconds past a fetch that does not answer', async () => {
    const { paced, directory, pass } = pacedWith();
    directory.held.add('stuck');
    const stuck = paced.find(GUILD, 'stuck');
    const next = paced.find(GUILD, 'next');
    pass(PACED_FETCH_PATIENCE_MS - 1);
    expect(directory.fetched).toEqual(['stuck']);
    pass(1);
    expect(directory.fetched).toEqual(['stuck', 'next']);
    await expect(next).resolves.toEqual(member('next'));
    // The stuck one still answers whoever waited for it, and upsets no later fetch.
    directory.holding.get('stuck')?.();
    await expect(stuck).resolves.toEqual(member('stuck'));
  });

  it('makes one fetch of a member, however many asks wait on it', async () => {
    const { paced, directory, pass } = pacedWith();
    const first = paced.find(GUILD, 'first');
    const asks = [paced.find(GUILD, 'x'), paced.find(GUILD, 'x'), paced.find(GUILD, 'x')];
    await first;
    pass(50);
    expect(directory.fetched).toEqual(['first', 'x']);
    expect(await Promise.all(asks)).toEqual([member('x'), member('x'), member('x')]);
  });

  it('does not queue an answer the directory holds', async () => {
    const { paced, directory } = pacedWith();
    void paced.find(GUILD, 'first');
    directory.known.add('kept');
    await expect(paced.find(GUILD, 'kept')).resolves.toEqual(member('kept'));
    expect(directory.fetched).toEqual(['first']);
  });

  it('releases whoever waits as soon as the member is asked for again with a press’s answer', async () => {
    const { paced, directory } = pacedWith();
    directory.held.add('first');
    void paced.find(GUILD, 'first');
    const waiting = paced.find(GUILD, 'pressed');
    // A press goes to the directory itself, past the queue.
    await directory.find(GUILD, 'pressed');
    await paced.find(GUILD, 'pressed');
    // The page's own list goes on, though the queue has not moved.
    await expect(waiting).resolves.toEqual(member('pressed'));
    expect(directory.fetched).toEqual(['first', 'pressed']);
  });

  it('spends no turn on a member whose answer came meanwhile', async () => {
    const { paced, directory, pass } = pacedWith();
    const first = paced.find(GUILD, 'first');
    const waiting = paced.find(GUILD, 'pressed');
    void paced.find(GUILD, 'next');
    await directory.find(GUILD, 'pressed');
    await first;
    pass(50);
    expect(directory.fetched).toEqual(['first', 'pressed', 'next']);
    await expect(waiting).resolves.toEqual(member('pressed'));
  });

  it('gives a failure to everyone who waited, and goes on', async () => {
    const { paced, directory, pass } = pacedWith();
    const first = paced.find(GUILD, 'first');
    const failed = paced.find(GUILD, 'x');
    const next = paced.find(GUILD, 'y');
    await first;
    directory.failing = new Error('Discord is away');
    pass(50);
    await expect(failed).rejects.toThrow('Discord is away');
    directory.failing = undefined;
    pass(50);
    await expect(next).resolves.toEqual(member('y'));
  });

  it('refuses whoever waits when it closes, by the closing error, and leaves no timer', async () => {
    const { paced, timers, directory } = pacedWith();
    directory.held.add('first');
    const first = paced.find(GUILD, 'first');
    const waiting = paced.find(GUILD, 'x');
    paced.close();
    await expect(first).rejects.toBeInstanceOf(MembersClosingError);
    await expect(waiting).rejects.toBeInstanceOf(MembersClosingError);
    await expect(paced.find(GUILD, 'later')).rejects.toBeInstanceOf(MembersClosingError);
    expect(timers.size).toBe(0);
  });

  it('refuses at close the ask on its way, which does not hold the web server’s close', async () => {
    const { paced, directory } = pacedWith();
    directory.held.add('stuck');
    const stuck = paced.find(GUILD, 'stuck');
    paced.close();
    await expect(stuck).rejects.toBeInstanceOf(MembersClosingError);
    // A late answer upsets nothing.
    directory.holding.get('stuck')?.();
  });

  it('refuses at close an ask joined to one on its way', async () => {
    const { paced, directory } = pacedWith();
    // A press's fetch is on its way: the directory holds the answer, and the page's ask joins it.
    directory.held.add('pressed');
    directory.known.add('pressed');
    const joined = paced.find(GUILD, 'pressed');
    paced.close();
    await expect(joined).rejects.toBeInstanceOf(MembersClosingError);
    directory.holding.get('pressed')?.();
  });

  it('answers as ever when it does not close', async () => {
    const { paced } = pacedWith();
    await expect(paced.find(GUILD, 'a')).resolves.toEqual(member('a'));
  });

  it('is not stalled by a wall clock that steps back', async () => {
    const { paced, directory, pass, stepBack } = pacedWith();
    directory.held.add('first');
    const first = paced.find(GUILD, 'first');
    void paced.find(GUILD, 'next');
    // It steps back while the fetch is on its way, so that the next one's wait is worked out after.
    stepBack(3_600_000);
    directory.holding.get('first')?.();
    await first;
    pass(50);
    expect(directory.fetched).toEqual(['first', 'next']);
  });

  it('logs at debug how many wait, as they grow', () => {
    const { paced, entries } = pacedWith();
    void paced.find(GUILD, 'a');
    void paced.find(GUILD, 'b');
    void paced.find(GUILD, 'c');
    expect(
      entries
        .filter((entry) => entry.msg === 'member look-ups of the map wait')
        .map((entry) => [entry.level, entry.waiting]),
    ).toEqual([
      [20, 1],
      [20, 1],
      [20, 2],
    ]);
  });
});

describe('what waits in the queue, on the web', () => {
  let web: TestWeb;
  afterEach(async () => {
    await web.app.close();
  });
  const ask = (url: string, cookie: string) =>
    web.app.inject({
      method: 'GET',
      url: `/s/${GUILD}/api/${url}`,
      headers: { cookie },
      // `live` is a stream: its answer comes with its headers, and it ends with the server.
      payloadAsStream: true,
    });

  it.each(['parties', 'stop-reports', 'parties/none/post', 'live'])(
    'has %s wait, and the member’s /api/me go past',
    async (list) => {
      const directory = new ColdDirectory();
      web = webServerWith({ members: directory });
      const [first, second, third] = await Promise.all([
        web.loggedIn('200000000000000001', 'One'),
        web.loggedIn('200000000000000002', 'Two'),
        web.loggedIn('200000000000000003', 'Three'),
      ]);
      const answers = [ask(list, first), ask(list, second)];
      await directory.fetches.reached(1);
      await answers[0];
      // The second waits for its turn, while a member's own page goes past it.
      const me = await web.app.inject({
        method: 'GET',
        url: `/s/${GUILD}/api/me`,
        headers: { cookie: third },
      });
      expect(me.json()).toMatchObject({ member: true });
      expect(directory.fetched).toEqual(['200000000000000001', '200000000000000003']);
      web.liveTimers.pass(50);
      await directory.fetches.reached(3);
      expect(directory.fetched.at(-1)).toBe('200000000000000002');
      await Promise.all(answers);
    },
  );

  it('answers whoever waits when the server closes, with no warning', async () => {
    const directory = new ColdDirectory();
    web = webServerWith({ members: directory });
    const [first, second] = await Promise.all([
      web.loggedIn('200000000000000001', 'One'),
      web.loggedIn('200000000000000002', 'Two'),
    ]);
    const answers = [ask('parties', first), ask('parties', second)];
    await answers[0];
    const closing = web.app.close();
    expect((await answers[1])?.statusCode).toBe(503);
    await closing;
    expect(web.entries.filter((entry) => entry.level === 40)).toEqual([]);
  });
});
