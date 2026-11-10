import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Tally } from '../../test/support/tally.js';
import { watchImmediates } from '../../test/support/timers.js';
import { Gathered } from './gathered.js';

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A gatherer whose messages are recorded; nothing goes out by itself during a test. `started`
 * counts the sends begun, `delivered` those done, `folded` the messages folded into another.
 */
function gatherer(delayMs = 3_600_000) {
  const sent: [string, string[]][] = [];
  const errors: [unknown, string][] = [];
  const started = new Tally('the sends begun');
  const delivered = new Tally('the sends done');
  const folded = new Tally('the messages folded');
  let failing: Error | undefined;
  let held: Promise<void> | undefined;
  const immediates = watchImmediates();
  onTestFinished(() => {
    immediates.restore();
  });
  const gathered = new Gathered<string[]>({
    delayMs,
    send: async (key, texts) => {
      started.add();
      await new Promise((resolve) => setImmediate(resolve));
      if (failing) throw failing;
      // A message says how things stand when it goes out: what it was given, as it is then.
      const saying = [...texts];
      await held;
      sent.push([key, saying]);
      delivered.add();
    },
    fold: (older, newer) => {
      folded.add();
      return [...older, ...newer];
    },
    onError: (err, key) => errors.push([err, key]),
  });
  const add = (key: string, text: string) => {
    gathered.later(key, (earlier) => [...(earlier ?? []), text]);
  };
  return {
    gathered,
    sent,
    errors,
    started,
    delivered,
    folded,
    add,
    fail: (err: Error | undefined) => {
      failing = err;
    },
    /** Lets every send hang from now on, until what it answers is called. */
    hold: (): (() => void) => {
      let release = (): void => undefined;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        held = undefined;
        release();
      };
    },
    /** Lets what is under way come as far as it can without anything being released. */
    settle: () => immediates.settle(),
  };
}

describe('Gathered', () => {
  it('sends nothing before the delay, and one message of several changes of a key', async () => {
    const made = gatherer();
    made.add('a', 'first');
    made.add('a', 'second');
    made.add('b', 'other');
    expect(made.sent).toEqual([]);
    await made.gathered.flush();
    expect(made.sent).toEqual([
      ['a', ['first', 'second']],
      ['b', ['other']],
    ]);
    // Nothing waits any more.
    await made.gathered.flush();
    expect(made.sent).toHaveLength(2);
  });

  it('sends what waits for one key at once, and leaves the others to their delay', async () => {
    const made = gatherer();
    made.add('a', 'first');
    made.add('b', 'other');
    await made.gathered.flushKey('a');
    expect(made.sent).toEqual([['a', ['first']]]);
    // What is on its way for the key is waited for too.
    const release = made.hold();
    made.add('a', 'second');
    const flushed = made.gathered.flushKey('a');
    await made.started.reached(2);
    release();
    await flushed;
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['second']],
    ]);
    await made.gathered.flush();
    expect(made.sent.at(-1)).toEqual(['b', ['other']]);
  });

  it('sends by itself once nothing has changed for the delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const made = gatherer(5);
    made.add('a', 'first');
    await vi.advanceTimersByTimeAsync(5);
    await made.delivered.reached(1);
    expect(made.sent).toEqual([['a', ['first']]]);
    // What comes afterwards is a message of its own.
    made.add('a', 'later');
    await made.gathered.flush();
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['later']],
    ]);
  });

  it('drops what waits for a key, and sends what comes afterwards as if nothing had waited', async () => {
    const made = gatherer();
    made.add('a', 'first');
    made.add('b', 'other');
    made.gathered.drop('a');
    made.gathered.drop('never waited');
    await made.gathered.flush();
    expect(made.sent).toEqual([['b', ['other']]]);
    made.add('a', 'later');
    await made.gathered.flush();
    // Not `['first', 'later']`: what was dropped is gone.
    expect(made.sent.at(-1)).toEqual(['a', ['later']]);
  });

  it('hands a failure to its owner and goes on with the next message', async () => {
    const made = gatherer();
    const down = new Error('Discord is down');
    made.fail(down);
    made.add('a', 'lost');
    await made.gathered.flush();
    expect(made.errors).toEqual([[down, 'a']]);
    made.fail(undefined);
    made.add('a', 'kept');
    await made.gathered.flush();
    expect(made.sent).toEqual([['a', ['kept']]]);
  });
});

describe('Gathered while a message is on its way', () => {
  it('makes one message of everything that comes for its key meanwhile', async () => {
    const made = gatherer();
    const release = made.hold();
    made.add('a', 'first');
    const first = made.gathered.flush();
    await made.settle();
    // The second has waited for its delay and stands behind the first; a third comes.
    made.add('a', 'second');
    const second = made.gathered.flush();
    await made.settle();
    made.add('a', 'third');
    made.add('b', 'other');
    release();
    await Promise.all([first, second, made.gathered.flush()]);
    // Not `['second']` and `['third']`: both would say how things stand after the third.
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['b', ['other']],
      ['a', ['second', 'third']],
    ]);
  });

  it('folds what waited for its delay into what is due already', async () => {
    const made = gatherer();
    const release = made.hold();
    made.add('a', 'first');
    const first = made.gathered.flush();
    await made.settle();
    made.add('a', 'second');
    const second = made.gathered.flush();
    await made.settle();
    made.add('a', 'third');
    // The third has waited for its delay too, before the first is out.
    const third = made.gathered.flush();
    await made.settle();
    release();
    await Promise.all([first, second, third]);
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['second', 'third']],
    ]);
  });

  it('sends by itself what was folded into a message that waits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const made = gatherer(10);
    const release = made.hold();
    made.add('a', 'first');
    // The first is on its way, and the second behind it, by their own delays.
    await vi.advanceTimersByTimeAsync(10);
    await made.started.reached(1);
    made.add('a', 'second');
    await vi.advanceTimersByTimeAsync(10);
    made.add('a', 'third');
    release();
    // The second's turn comes while the third waits for its delay: it joins the third.
    await made.folded.reached(1);
    expect(made.sent).toEqual([['a', ['first']]]);
    // The third goes by itself once its delay is over.
    await vi.advanceTimersByTimeAsync(10);
    await made.delivered.reached(2);
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['second', 'third']],
    ]);
  });

  it('drops also what is due behind a message on its way', async () => {
    const made = gatherer();
    const release = made.hold();
    made.add('a', 'first');
    const first = made.gathered.flush();
    await made.settle();
    made.add('a', 'second');
    const second = made.gathered.flush();
    await made.settle();
    made.gathered.drop('a');
    made.add('a', 'third');
    release();
    await Promise.all([first, second, made.gathered.flush()]);
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['third']],
    ]);
  });
});
