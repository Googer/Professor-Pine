import { ComponentType } from 'discord.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { V2Message } from '../discord/party-gateway.js';
import {
  FakeDmGateway,
  FakeLoopDelay,
  MemoryDmContacts,
  pullUntilIdle,
  RecordingDms,
} from '../../test/support/dms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchImmediates } from '../../test/support/timers.js';
import {
  DM_CLOSED_MEMBERS,
  DM_CLOSED_MS,
  DM_CONCURRENCY,
  DM_MAX_DEPTH,
  DM_PRIORITY,
  DM_RATE_PER_SECOND,
  DM_SLOW_DOWN_MS,
  nodeLoopDelay,
  QueuedDmSender,
  type DmJob,
  type QueuedDmSenderOptions,
} from './dm-sender.js';

const NOW = 1_800_000_000_000;
/** Two servers, for the turns between them. */
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

/** A sender over the fake gateway whose timer the test holds: nothing goes out without `pull`. */
function setup(options: Partial<QueuedDmSenderOptions> = {}) {
  const gateway = new FakeDmGateway();
  const { log, entries } = createTestLogger();
  const clock = { now: NOW };
  const loopDelay = new FakeLoopDelay();
  const timer: { run?: () => void; ms?: number; starts: number; stops: number } = {
    starts: 0,
    stops: 0,
  };
  const sender = new QueuedDmSender({
    gateway,
    log,
    now: () => clock.now,
    loopDelay,
    startTimer: (run, ms) => {
      timer.run = run;
      timer.ms = ms;
      timer.starts += 1;
      return () => {
        timer.stops += 1;
        delete timer.run;
      };
    },
    ...options,
  });
  const job = (n: number, more: Partial<DmJob> = {}): DmJob => ({
    userId: idOf(n),
    serverId: HOME,
    message: { content: `message ${String(n)}` },
    priority: DM_PRIORITY.normal,
    eventAt: clock.now,
    expiresAt: clock.now + 3_600_000,
    ...more,
  });
  const logged = (msg: string) => entries.filter((entry) => entry.msg === msg);
  // What a pull began is done: every answer of the fakes has come, and what followed it.
  const immediates = watchImmediates();
  onTestFinished(() => {
    immediates.restore();
  });
  const settle = () => immediates.settle();
  return { sender, gateway, entries, clock, loopDelay, timer, job, logged, settle };
}

describe('QueuedDmSender', () => {
  it('sends nothing by itself: a timer pulls the line, one message a turn', async () => {
    const made = setup();
    for (let n = 0; n < 3; n++) made.sender.send(made.job(n));
    expect(made.gateway.sent).toHaveLength(0);
    expect(made.sender.depth).toBe(3);
    expect(made.timer.starts).toBe(1);
    expect(made.timer.ms).toBe(1000 / DM_RATE_PER_SECOND);
    made.sender.pull();
    await made.settle();
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(0)]);
    expect(made.sender.depth).toBe(2);
    expect(await pullUntilIdle(made.sender)).toBe(2);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(0), idOf(1), idOf(2)]);
    // The timer stops with the burst and starts again with the next message.
    expect(made.timer.stops).toBe(1);
    made.sender.send(made.job(3));
    expect(made.timer.starts).toBe(2);
    await pullUntilIdle(made.sender);
  });

  it('starts ten a second by default, and five at once at most', async () => {
    expect(DM_RATE_PER_SECOND).toBe(10);
    expect(DM_CONCURRENCY).toBe(5);
    const made = setup();
    made.gateway.hold = true;
    for (let n = 0; n < 20; n++) made.sender.send(made.job(n));
    for (let pulls = 0; pulls < 12; pulls++) made.sender.pull();
    await made.settle();
    expect(made.sender.sending).toBe(5);
    expect(made.sender.depth).toBe(15);
    made.gateway.release();
    await pullUntilIdle(made.sender);
    expect(made.gateway.most).toBe(5);
    expect(made.gateway.sent).toHaveLength(20);
  });

  it('starts no second send to a member while one is on its way, so that their messages keep their order', async () => {
    const made = setup();
    made.gateway.hold = true;
    made.sender.send(made.job(1, { message: { content: 'first' } }));
    made.sender.send(made.job(1, { message: { content: 'second' } }));
    made.sender.send(made.job(2));
    for (let pulls = 0; pulls < 4; pulls++) made.sender.pull();
    await made.settle();
    // The first to member 1 holds the second back; member 2's goes past it.
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2)]);
    expect(made.sender.depth).toBe(1);
    made.gateway.release();
    await pullUntilIdle(made.sender);
    expect(
      made.gateway.sent
        .filter((sent) => sent.userId === idOf(1))
        .map((sent) => (sent.message.v2 ? '' : sent.message.content)),
    ).toEqual(['first', 'second']);
  });

  it('sends what is urgent first, and within one priority the oldest event first', async () => {
    const made = setup();
    made.sender.send(made.job(1, { eventAt: NOW + 30 }));
    made.sender.send(made.job(2, { eventAt: NOW + 10 }));
    made.sender.send(made.job(3, { priority: DM_PRIORITY.urgent, eventAt: NOW + 40 }));
    made.sender.send(made.job(4, { eventAt: NOW + 20 }));
    made.sender.send(made.job(5, { priority: DM_PRIORITY.urgent, eventAt: NOW + 5 }));
    made.sender.send(made.job(6, { eventAt: NOW + 30 }));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual(
      [5, 3, 2, 4, 1, 6].map((n) => idOf(n)),
    );
  });

  it('has three priorities: what a member waits for, then spawns, then the other news', async () => {
    const made = setup();
    made.sender.send(made.job(1, { eventAt: NOW }));
    made.sender.send(made.job(2, { priority: DM_PRIORITY.spawn, eventAt: NOW + 20 }));
    made.sender.send(made.job(3, { priority: DM_PRIORITY.urgent, eventAt: NOW + 30 }));
    made.sender.send(made.job(4, { priority: DM_PRIORITY.spawn, eventAt: NOW + 10 }));
    made.sender.send(made.job(5, { eventAt: NOW - 10 }));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual(
      [3, 4, 2, 5, 1].map((n) => idOf(n)),
    );
    expect([DM_PRIORITY.urgent, DM_PRIORITY.spawn, DM_PRIORITY.normal]).toEqual([0, 1, 2]);
  });

  it('pauses for a minute when Discord says to slow down, says so once, and drops that message', async () => {
    const made = setup();
    made.gateway.slow.add(idOf(1)).add(idOf(2));
    for (let n = 1; n <= 4; n++) made.sender.send(made.job(n));
    made.sender.pull();
    await made.settle();
    // The message that got the answer is gone; nothing else starts while the pause lasts.
    expect(made.sender.depth).toBe(3);
    made.clock.now += DM_SLOW_DOWN_MS - 1;
    for (let pull = 0; pull < 5; pull++) {
      made.sender.pull();
      await made.settle();
    }
    expect(made.sender.depth).toBe(3);
    expect(made.sender.sending).toBe(0);
    expect(made.gateway.asked).toEqual([idOf(1)]);
    made.clock.now += 1;
    made.sender.pull();
    await made.settle();
    // Told to slow down again: another pause, and not another warning in this burst.
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2)]);
    made.sender.pull();
    await made.settle();
    expect(made.sender.depth).toBe(2);
    made.clock.now += DM_SLOW_DOWN_MS;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(3), idOf(4)]);
    expect(made.gateway.asked).toEqual([1, 2, 3, 4].map((n) => idOf(n)));
    const warned = made.logged('Discord says to slow down with direct messages; pausing');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ level: 40, pauseMs: DM_SLOW_DOWN_MS });
    expect(made.logged('direct messages sent')[0]).toMatchObject({
      sent: 2,
      failed: 2,
      slowedDown: 2,
    });
    expect(DM_SLOW_DOWN_MS).toBe(60_000);
  });

  it('lets a message expire while it pauses', async () => {
    const made = setup();
    made.gateway.slow.add(idOf(1));
    made.sender.send(made.job(1));
    made.sender.send(made.job(2, { expiresAt: NOW + 30_000 }));
    made.sender.pull();
    await made.settle();
    made.clock.now += DM_SLOW_DOWN_MS;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(0);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ expired: 1, failed: 1 });
  });

  it('ends a burst also when its numbers cannot be read, and says so', async () => {
    const made = setup();
    made.loopDelay.failing = new Error('no histogram');
    made.sender.send(made.job(1));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(1);
    expect(made.sender.idle).toBe(true);
    expect(made.timer.stops).toBe(1);
    expect(made.logged('could not log the numbers of a burst of direct messages')).toHaveLength(1);
    delete made.loopDelay.failing;
    made.sender.send(made.job(2));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(2);
  });

  it('drops a message whose time has passed when its turn comes', async () => {
    const made = setup();
    made.sender.send(made.job(1, { expiresAt: NOW + 1_000 }));
    made.sender.send(made.job(2));
    made.sender.send(made.job(3, { expiresAt: NOW + 500 }));
    made.clock.now += 1_000;
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(2)]);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 1, expired: 2 });
  });

  it('walks a long line of stale messages over several pulls, never in one', async () => {
    const made = setup();
    for (let n = 0; n < 1_000; n++) made.sender.send(made.job(n, { expiresAt: NOW + 1 }));
    made.sender.send(made.job(5_000));
    made.clock.now += 10;
    made.sender.pull();
    expect(made.sender.depth).toBe(801);
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(5_000)]);
  });

  it('counts a member who takes no direct messages, at debug, and goes on', async () => {
    const made = setup();
    made.gateway.closed.add(idOf(2));
    for (let n = 1; n <= 3; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(1), idOf(3)]);
    const [debug] = made.logged('a member takes no direct messages');
    expect(debug).toMatchObject({ level: 20, user: idOf(2) });
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 2, closed: 1, failed: 0 });
  });

  it('remembers a member who takes none for an hour, and asks Discord nothing for them meanwhile', async () => {
    expect(DM_CLOSED_MS).toBe(60 * 60_000);
    expect(DM_CLOSED_MEMBERS).toBe(10_000);
    const made = setup();
    made.gateway.closed.add(idOf(2));
    for (let n = 1; n <= 3; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2), idOf(3)]);
    // The next burst, and a message of every priority: counted as closed, Discord is not asked.
    made.clock.now += DM_CLOSED_MS - 1;
    made.sender.send(made.job(2, { priority: DM_PRIORITY.urgent }));
    made.sender.send(made.job(2, { priority: DM_PRIORITY.spawn }));
    made.sender.send(made.job(2));
    made.sender.send(made.job(4));
    expect(await pullUntilIdle(made.sender)).toBe(1);
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2), idOf(3), idOf(4)]);
    expect(made.logged('direct messages sent')[1]).toMatchObject({
      queued: 4,
      sent: 1,
      closed: 3,
      failed: 0,
    });
    // After the hour Discord is asked again: they may take messages by now.
    made.clock.now += 1;
    made.gateway.closed.delete(idOf(2));
    made.sender.send(made.job(2));
    await pullUntilIdle(made.sender);
    expect(made.gateway.asked.at(-1)).toBe(idOf(2));
    expect(made.gateway.to(idOf(2))).toHaveLength(1);
    // And is remembered anew when they still take none.
    made.gateway.closed.add(idOf(3));
    made.sender.send(made.job(3));
    await pullUntilIdle(made.sender);
    made.sender.send(made.job(3));
    await pullUntilIdle(made.sender);
    expect(made.gateway.asked.filter((id) => id === idOf(3))).toHaveLength(2);
  });

  it('remembers so many of them and no more: the one found longest ago is asked for again', async () => {
    const made = setup({ maxClosed: 2 });
    for (const n of [1, 2, 3]) made.gateway.closed.add(idOf(n));
    for (const n of [1, 2, 3]) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    for (const n of [3, 2, 1]) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2), idOf(3), idOf(1)]);
  });

  it('walks a long line for members who take none over several pulls, never in one', async () => {
    const made = setup();
    made.gateway.closed.add(idOf(1));
    made.sender.send(made.job(1));
    await pullUntilIdle(made.sender);
    for (let n = 0; n < 1_000; n++) made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    made.sender.pull();
    expect(made.sender.depth).toBe(801);
    await pullUntilIdle(made.sender);
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2)]);
    expect(made.logged('direct messages sent')[1]).toMatchObject({ sent: 1, closed: 1_000 });
  });

  it('logs a send that fails and drops it: nothing is tried twice', async () => {
    const made = setup();
    made.gateway.failing = new Error('Discord is away');
    for (let n = 0; n < 8; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(0);
    // The first few failures of a burst are logged one by one, the rest only counted.
    expect(made.logged('could not send a direct message')).toHaveLength(5);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 0, failed: 8 });
    delete made.gateway.failing;
    made.sender.send(made.job(9));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(1);
  });

  it('refuses nothing and throws nothing for a message Discord would refuse', async () => {
    const made = setup();
    expect(() => {
      made.sender.send(made.job(1, { message: {} }));
      made.sender.send(made.job(2, { message: { content: 'x'.repeat(2_001) } }));
    }).not.toThrow();
    await pullUntilIdle(made.sender);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ failed: 2 });
  });

  it('drops the least urgent, oldest message of a line that is too long, and says so once', async () => {
    const made = setup({ maxDepth: 4 });
    made.sender.send(made.job(1, { priority: DM_PRIORITY.urgent }));
    for (let n = 2; n <= 4; n++) made.sender.send(made.job(n, { eventAt: NOW + n }));
    // Full. The next ones push out the oldest of the normal ones, also when they are urgent.
    made.sender.send(made.job(5, { eventAt: NOW + 5 }));
    made.sender.send(made.job(6, { priority: DM_PRIORITY.urgent, eventAt: NOW + 6 }));
    expect(made.sender.depth).toBe(4);
    expect(
      made.logged('the line of direct messages is full; the least urgent, oldest are dropped'),
    ).toHaveLength(1);
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent.map((sent) => sent.userId)).toEqual([1, 6, 4, 5].map((n) => idOf(n)));
    expect(made.logged('direct messages sent')[0]).toMatchObject({
      queued: 6,
      sent: 4,
      overflowed: 2,
      deepest: 4,
    });
    // A new burst says it again.
    for (let n = 10; n < 16; n++) made.sender.send(made.job(n));
    expect(
      made.logged('the line of direct messages is full; the least urgent, oldest are dropped'),
    ).toHaveLength(2);
    await pullUntilIdle(made.sender);
  });

  it('logs the numbers of a burst when it ends: delivery times and the event-loop delay', async () => {
    const made = setup();
    made.loopDelay.measured = { meanMs: 1.5, maxMs: 12 };
    made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    made.sender.send(made.job(3));
    expect(made.loopDelay.running).toBe(true);
    for (const wait of [100, 300, 1_000]) {
      made.clock.now += wait;
      made.sender.pull();
      await made.settle();
    }
    await pullUntilIdle(made.sender);
    expect(made.loopDelay.running).toBe(false);
    const [numbers] = made.logged('direct messages sent');
    expect(numbers).toMatchObject({
      level: 30,
      queued: 3,
      sent: 3,
      closed: 0,
      failed: 0,
      expired: 0,
      overflowed: 0,
      waiting: 0,
      deepest: 3,
      tookMs: 1_400,
      deliveryMedianMs: 400,
      deliveryWorstMs: 1_400,
      loopDelayMeanMs: 1.5,
      loopDelayMaxMs: 12,
    });
    expect(made.logged('direct messages sent')).toHaveLength(1);
  });

  it('logs the numbers so far every minute while a burst lasts', async () => {
    const made = setup();
    for (let n = 0; n < 4; n++) made.sender.send(made.job(n));
    made.sender.pull();
    await made.settle();
    expect(made.logged('direct messages are going out')).toHaveLength(0);
    made.clock.now += 60_000;
    made.sender.pull();
    await made.settle();
    made.sender.pull();
    await made.settle();
    expect(made.logged('direct messages are going out')).toHaveLength(1);
    expect(made.logged('direct messages are going out')[0]).toMatchObject({ sent: 1, waiting: 3 });
    await pullUntilIdle(made.sender);
  });

  it('sends thousands without ever holding the event loop: one send per pull', async () => {
    // The heartbeat goes by the event loop itself, unwatched: it never stops, and the sends
    // must not wait for it to.
    const next = globalThis.setImmediate;
    const made = setup();
    const message = { content: 'A raid for **Yveltal** has been reported.' };
    let beats = 0;
    let beating = true;
    const beat = (): void => {
      beats += 1;
      if (beating) next(beat);
    };
    next(beat);
    for (let n = 0; n < 5_000; n++) {
      made.sender.send({
        userId: idOf(n),
        serverId: HOME,
        message,
        priority: DM_PRIORITY.normal,
        eventAt: NOW,
        expiresAt: NOW + 3_600_000,
      });
    }
    const pulls = await pullUntilIdle(made.sender);
    beating = false;
    expect(made.gateway.sent).toHaveLength(5_000);
    expect(new Set(made.gateway.sent.map((sent) => sent.userId)).size).toBe(5_000);
    // No pull started more than one send, and the event loop turned between all of them.
    expect(pulls).toBeGreaterThanOrEqual(5_000);
    expect(beats).toBeGreaterThanOrEqual(5_000);
    expect(made.gateway.most).toBeLessThanOrEqual(DM_CONCURRENCY);
    // Every job shares the one message: nothing was rendered or copied per member.
    expect(made.gateway.sent.every((sent) => sent.message === message)).toBe(true);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 5_000, deepest: 5_000 });
  });

  it('drains at shutdown: what the time allows goes out, the rest is dropped and nothing new is taken', async () => {
    // With the timer the sender starts itself, at a thousand a second (on the test's clock).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const fast = setup({ ratePerSecond: 1_000 });
    const gateway = new FakeDmGateway();
    const { log, entries } = createTestLogger();
    const sender = new QueuedDmSender({
      gateway,
      log,
      ratePerSecond: 1_000,
      loopDelay: fast.loopDelay,
    });
    for (let n = 0; n < 20; n++)
      sender.send({ ...fast.job(n), eventAt: Date.now(), expiresAt: Date.now() + 60_000 });
    const draining = sender.drain(5_000);
    // Twenty pulls, one a millisecond; each send is answered before the next pull.
    await vi.advanceTimersByTimeAsync(20);
    await draining;
    expect(gateway.sent).toHaveLength(20);
    expect(
      entries.some((entry) => entry.msg === 'direct messages were still waiting at shutdown'),
    ).toBe(false);
    sender.send(fast.job(99));
    expect(sender.depth).toBe(0);

    // A line that is not pulled in time is dropped, and the sends on their way are waited for.
    // The time of the drain is measured by `performance.now()`, of `node:perf_hooks`, which
    // vi's `performance` fake (a new global object) does not reach: it follows the fake clock.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const now = vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    onTestFinished(() => {
      now.mockRestore();
    });
    const made = setup();
    made.gateway.hold = true;
    for (let n = 0; n < 10; n++) made.sender.send(made.job(n));
    made.sender.pull();
    made.sender.pull();
    let ended = false;
    const drained = made.sender.drain(20).then(() => {
      ended = true;
    });
    // Within its time the line waits.
    vi.advanceTimersByTime(19);
    await made.settle();
    expect(made.sender.depth).toBe(8);
    expect(ended).toBe(false);
    vi.advanceTimersByTime(1);
    await made.settle();
    expect(made.sender.depth).toBe(0);
    expect(made.sender.sending).toBe(2);
    made.gateway.release();
    await drained;
    expect(made.gateway.sent).toHaveLength(2);
    expect(made.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
      abandoned: 8,
    });
    expect(made.sender.idle).toBe(true);
    expect(made.timer.stops).toBe(1);
  });

  it('goes on draining for a burst that began while it drained', async () => {
    const inner = new FakeDmGateway();
    const { log, entries } = createTestLogger();
    const later: DmJob = {
      userId: idOf(2),
      serverId: HOME,
      message: { content: 'later' },
      priority: DM_PRIORITY.normal,
      eventAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    let again = false;
    // Puts one more message in line as soon as the sender is idle again: in the very turn in
    // which the burst ended, before `drain` has looked (so it waits by microtasks, and gives
    // up rather than hold the event loop should the burst never end).
    const whenIdle = async (): Promise<void> => {
      for (let hops = 0; !sender.idle; hops++) {
        if (hops > 10_000) throw new Error('the burst did not end');
        await Promise.resolve();
      }
      sender.send(later);
    };
    const sender: QueuedDmSender = new QueuedDmSender({
      gateway: {
        send: (userId, message) => {
          const sent = inner.send(userId, message);
          if (!again) {
            again = true;
            void sent.then(whenIdle);
          }
          return sent;
        },
      },
      log,
      ratePerSecond: 1_000,
      loopDelay: new FakeLoopDelay(),
    });
    sender.send({ ...later, userId: idOf(1), message: { content: 'first' } });
    await sender.drain(5_000);
    expect(inner.sent.map((sent) => sent.userId)).toEqual([idOf(1), idOf(2)]);
    expect(
      entries.some((entry) => entry.msg === 'direct messages were still waiting at shutdown'),
    ).toBe(false);
    expect(sender.idle).toBe(true);
  });

  it('does not wait at shutdown for a pause that outlasts the time there is', async () => {
    // The timer of `drain` is held and never fires here: a drain that resolves did not wait
    // for its time to pass, whatever the machine is busy with. (`setImmediate`, which the
    // fakes answer on, stays real.)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Paused already when the draining begins: it never starts to wait.
      const made = setup();
      made.gateway.slow.add(idOf(1));
      for (let n = 1; n <= 3; n++) made.sender.send(made.job(n));
      made.sender.pull();
      await made.settle();
      await made.sender.drain(2_000);
      expect(vi.getTimerCount()).toBe(0);
      // The pause was still on: the clock of the sender has not moved.
      expect(made.clock.now).toBe(NOW);
      expect(made.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
        abandoned: 2,
      });
      expect(made.sender.idle).toBe(true);

      // Told to slow down while it drains: it was waiting, and the pause ends the wait.
      const other = setup();
      other.gateway.slow.add(idOf(1));
      other.gateway.hold = true;
      for (let n = 1; n <= 3; n++) other.sender.send(other.job(n));
      other.sender.pull();
      const drained = other.sender.drain(2_000);
      await other.settle();
      expect(vi.getTimerCount()).toBe(1);
      other.gateway.release();
      await drained;
      expect(vi.getTimerCount()).toBe(0);
      expect(other.clock.now).toBe(NOW);
      expect(other.gateway.sent).toEqual([]);
      expect(other.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
        abandoned: 2,
      });
      expect(other.sender.idle).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits at shutdown for a pause that ends within the time there is', async () => {
    const short = setup();
    short.gateway.slow.add(idOf(1));
    short.sender.send(short.job(1));
    short.sender.send(short.job(2));
    short.sender.pull();
    await short.settle();
    // Ten milliseconds of the pause are left, by the sender's clock.
    short.clock.now += DM_SLOW_DOWN_MS - 10;
    const waiting = short.sender.drain(5_000);
    await short.settle();
    expect(short.sender.depth).toBe(1);
    short.clock.now += 10;
    short.sender.pull();
    await waiting;
    expect(short.gateway.sent.map((sent) => sent.userId)).toEqual([idOf(2)]);
    expect(short.logged('direct messages were still waiting at shutdown')).toEqual([]);
  });

  it('drains at once when nothing waits', async () => {
    const made = setup();
    await made.sender.drain(10_000);
    expect(made.sender.idle).toBe(true);
  });
});

/** The members of what was sent, in order. */
const ids = (sent: readonly { userId: string }[]) => sent.map((one) => one.userId);

describe('QueuedDmSender between servers', () => {
  it('takes turns between servers within a priority: one server’s burst does not hold back another’s message', async () => {
    const made = setup();
    for (let n = 0; n < 50; n++) made.sender.send(made.job(n, { serverId: HOME }));
    made.sender.send(made.job(100, { serverId: AWAY, eventAt: NOW + 1 }));
    made.sender.send(made.job(101, { serverId: AWAY, eventAt: NOW + 2 }));
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent).slice(0, 5)).toEqual([0, 100, 1, 101, 2].map((n) => idOf(n)));
    // Each server's own in the order of their events.
    expect(ids(made.gateway.sent).slice(4)).toEqual(
      Array.from({ length: 48 }, (_, n) => idOf(n + 2)),
    );
  });

  it('serves the messages of the instance (the owner’s) as one more server', async () => {
    const made = setup();
    for (let n = 0; n < 10; n++) made.sender.send(made.job(n, { serverId: HOME }));
    made.sender.send(made.job(99, { serverId: null }));
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent).slice(0, 3)).toEqual([0, 99, 1].map((n) => idOf(n)));
  });

  it('still sends everything urgent first, whichever server it is of', async () => {
    const made = setup();
    for (let n = 0; n < 3; n++) made.sender.send(made.job(n, { serverId: HOME }));
    made.sender.send(made.job(10, { serverId: AWAY, priority: DM_PRIORITY.spawn }));
    made.sender.send(made.job(11, { serverId: HOME, priority: DM_PRIORITY.urgent }));
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent)).toEqual([11, 10, 0, 1, 2].map((n) => idOf(n)));
  });

  it('when the line is full, drops the oldest of the least urgent of the server with the most waiting', async () => {
    const made = setup({ maxDepth: 4 });
    // Away's message is the oldest of all, but Home has the most waiting.
    made.sender.send(made.job(1, { serverId: AWAY, eventAt: NOW }));
    for (let n = 2; n <= 4; n++) made.sender.send(made.job(n, { eventAt: NOW + n }));
    made.sender.send(made.job(5, { eventAt: NOW + 5 }));
    made.sender.send(made.job(6, { priority: DM_PRIORITY.urgent, eventAt: NOW + 6 }));
    expect(made.sender.depth).toBe(4);
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent)).toEqual([6, 1, 4, 5].map((n) => idOf(n)));
    expect(made.logged('direct messages sent')[0]).toMatchObject({ overflowed: 2 });
  });

  it('drops what waits for a server Pine left, in both its lines, and sends the others’ (plan 19C-1)', async () => {
    const made = setup({ contacts: new MemoryDmContacts([idOf(1)]) });
    // Away's: one to a member written to before, one to a member never written to, an urgent one.
    made.sender.send(made.job(1, { serverId: AWAY }));
    made.sender.send(made.job(2, { serverId: AWAY }));
    made.sender.send(made.job(3, { serverId: AWAY, priority: DM_PRIORITY.urgent }));
    made.sender.send(made.job(10, { serverId: HOME }));
    made.sender.send(made.job(11, { serverId: null }));
    made.sender.dropServer(AWAY);
    expect(made.sender.depth).toBe(2);
    expect(made.logged('dropped the direct messages of a server Pine left')).toEqual([
      expect.objectContaining({ server: AWAY, dropped: 3 }),
    ]);
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent).sort()).toEqual([idOf(10), idOf(11)]);
    // A server with nothing waiting: nothing to say.
    made.sender.dropServer(HOME);
    expect(made.logged('dropped the direct messages of a server Pine left')).toHaveLength(1);
  });

  it('goes on to the next server when one has a long line of messages that wait', async () => {
    const made = setup();
    made.gateway.hold = true;
    made.sender.send(made.job(1));
    made.sender.pull();
    // Member 1 has a send on its way: their next thousand wait, and Away's goes past them.
    for (let n = 0; n < 1_000; n++) made.sender.send(made.job(1));
    made.sender.send(made.job(2, { serverId: AWAY }));
    made.sender.pull();
    made.sender.pull();
    expect(made.gateway.asked).toEqual([idOf(1), idOf(2)]);
    made.gateway.release();
    await pullUntilIdle(made.sender);
  });
});

describe('QueuedDmSender and members written to for the first time', () => {
  const WINDOW_MS = 10 * 60_000;
  const capped = (perWindow: number, known: readonly string[] = []) => {
    const contacts = new MemoryDmContacts(known);
    const made = setup({ contacts, firstContacts: { perWindow, windowMs: WINDOW_MS } });
    /** Pulls as a timer would, `times` turns, each one's sends answered before the next. */
    const pulls = async (times: number) => {
      for (let turn = 0; turn < times; turn++) {
        made.sender.pull();
        await made.settle();
      }
    };
    return { ...made, contacts, pulls };
  };

  it('opens at most so many new DM channels per server in a window; the rest wait for it', async () => {
    const made = capped(2, [idOf(9)]);
    for (const n of [1, 2, 3, 4, 9]) made.sender.send(made.job(n, { serverId: HOME }));
    made.sender.send(made.job(20, { serverId: AWAY }));
    made.sender.send(made.job(30, { serverId: null }));
    await made.pulls(30);
    // Home's third and fourth new member wait; its known member, Away's and the owner's do not.
    expect(new Set(ids(made.gateway.sent))).toEqual(new Set([1, 2, 9, 20, 30].map((n) => idOf(n))));
    expect(made.sender.depth).toBe(2);
    expect(
      made.logged('a server opened as many new direct messages as it may; the rest wait'),
    ).toEqual([expect.objectContaining({ server: HOME, perWindow: 2, windowMinutes: 10 })]);
    // Once the window has passed, they go.
    made.clock.now += WINDOW_MS;
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent).slice(-2)).toEqual([idOf(3), idOf(4)]);
    // Every member written to is remembered as such, the owner too; the known one is not again.
    expect(made.contacts.added.toSorted()).toEqual([1, 2, 3, 4, 20, 30].map((n) => idOf(n)));
  });

  it('lets a message that waits for the window expire as any does', async () => {
    const made = capped(1);
    made.sender.send(made.job(1));
    made.sender.send(made.job(2, { expiresAt: NOW + 1_000 }));
    await made.pulls(10);
    expect(made.sender.depth).toBe(1);
    made.clock.now += 1_000;
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent)).toEqual([idOf(1)]);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ sent: 1, expired: 1 });
  });

  it('counts a member written to from then on as known: their next message is not held back', async () => {
    const made = capped(1);
    made.sender.send(made.job(1, { message: { content: 'first' } }));
    made.sender.send(made.job(2));
    made.sender.send(made.job(1, { message: { content: 'second' } }));
    await made.pulls(20);
    expect(ids(made.gateway.sent)).toEqual([idOf(1), idOf(1)]);
    expect(made.sender.depth).toBe(1);
  });

  it('does not take a member who takes no direct messages for one written to', async () => {
    const made = capped(5);
    made.gateway.closed.add(idOf(1));
    made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    await pullUntilIdle(made.sender);
    expect(made.contacts.added).toEqual([idOf(2)]);
  });

  it('takes a member as new when it cannot tell, and says so', async () => {
    const made = capped(1);
    made.contacts.failing = new Error('the database is away');
    made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    await made.pulls(10);
    expect(ids(made.gateway.sent)).toEqual([idOf(1)]);
    expect(made.logged('could not read whom direct messages went to before')).toHaveLength(1);
    made.clock.now += WINDOW_MS;
    await pullUntilIdle(made.sender);
  });

  it('asks the database about many members at once, not once per message', async () => {
    const made = capped(10_000);
    for (let n = 0; n < 500; n++) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(500);
    expect(made.contacts.asked.length).toBeLessThanOrEqual(5);
    expect(made.contacts.asked.flat().toSorted()).toEqual(
      Array.from({ length: 500 }, (_, n) => idOf(n)).toSorted(),
    );
  });

  it('asks nothing about the owner’s messages and holds none back', async () => {
    const made = capped(0);
    made.sender.send(made.job(1, { serverId: null }));
    await pullUntilIdle(made.sender);
    expect(ids(made.gateway.sent)).toEqual([idOf(1)]);
    expect(made.contacts.asked).toEqual([]);
  });

  it.each([
    { held: 'urgent', other: 'normal' },
    { held: 'normal', other: 'urgent' },
  ] as const)(
    'a server its cap holds back stops no other server: its $held messages wait, another’s $other one goes',
    async ({ held, other }) => {
      const made = capped(5, [idOf(1_000)]);
      for (let n = 0; n < 400; n++) {
        made.sender.send(made.job(n, { priority: DM_PRIORITY[held] }));
      }
      made.sender.send(made.job(1_000, { serverId: AWAY, priority: DM_PRIORITY[other] }));
      await made.pulls(20);
      expect(ids(made.gateway.sent)).toContain(idOf(1_000));
      // Home opened its five and no more.
      expect(made.gateway.sent).toHaveLength(6);
      expect(made.sender.depth).toBe(395);
    },
  );

  it('sends a server’s message to a member written to before at once, past its own messages its cap holds back', async () => {
    const made = capped(5, [idOf(1_000)]);
    for (let n = 0; n < 400; n++) made.sender.send(made.job(n));
    made.sender.send(made.job(1_000, { eventAt: NOW + 1 }));
    await made.pulls(20);
    expect(ids(made.gateway.sent)).toContain(idOf(1_000));
    expect(made.gateway.sent).toHaveLength(6);
  });

  it('keeps a member’s order when a read finds them written to before', async () => {
    const made = capped(1, [idOf(7)]);
    made.sender.send(made.job(1));
    made.sender.send(made.job(2));
    made.sender.send(made.job(7, { message: { content: 'first' } }));
    made.sender.send(made.job(7, { message: { content: 'second' }, eventAt: NOW + 1 }));
    await made.pulls(20);
    expect(made.gateway.to(idOf(7)).map((message) => (message.v2 ? '' : message.content))).toEqual([
      'first',
      'second',
    ]);
  });

  it('reads a member whose message comes behind a full line of first messages: the newest is never left unread', async () => {
    const made = capped(5, [idOf(20_000)]);
    for (let n = 0; n < DM_MAX_DEPTH; n++) made.sender.send(made.job(n));
    made.sender.send(made.job(20_000, { eventAt: NOW + 1 }));
    await made.pulls(20);
    // Home is at its cap long before the pulls reach its member written to before: only the
    // read, which the full list of members to read pushed its oldest out for, lets it go.
    expect(ids(made.gateway.sent)).toContain(idOf(20_000));
    expect(made.gateway.sent).toHaveLength(6);
  });

  it('takes a read that has not answered in ten seconds for one that failed, and reads on', async () => {
    // Only the timers of the sender's own: the fakes answer on `setImmediate`, which stays real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const made = capped(5, [idOf(2)]);
      made.contacts.hold = true;
      made.sender.send(made.job(1));
      await made.pulls(3);
      made.contacts.hold = false;
      made.sender.send(made.job(2));
      await made.pulls(3);
      // The read on its way holds the next back, and nothing goes out meanwhile.
      expect(made.contacts.asked).toEqual([[idOf(1)]]);
      expect(made.gateway.sent).toEqual([]);
      vi.advanceTimersByTime(10_000);
      await made.pulls(5);
      expect(made.logged('could not read whom direct messages went to before')).toHaveLength(1);
      expect(made.contacts.asked).toEqual([[idOf(1)], [idOf(2)]]);
      // Member 1 taken as new (within the cap), member 2 read as written to.
      expect(new Set(ids(made.gateway.sent))).toEqual(new Set([idOf(1), idOf(2)]));
      // The read that answered in its time left no timer behind.
      expect(vi.getTimerCount()).toBe(0);
      // Its late answer changes nothing.
      made.contacts.release();
      await made.settle();
      expect(made.logged('could not read whom direct messages went to before')).toHaveLength(1);
      await pullUntilIdle(made.sender);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts the members it could not record as written to, and says so once a burst', async () => {
    const made = capped(5);
    made.contacts.addFailing = new Error('the database is away');
    for (const n of [1, 2, 3]) made.sender.send(made.job(n));
    await pullUntilIdle(made.sender);
    expect(made.gateway.sent).toHaveLength(3);
    const said = 'could not record that a direct message went to a member';
    expect(made.logged(said)).toHaveLength(1);
    expect(made.logged('direct messages sent')[0]).toMatchObject({ contactsNotRecorded: 3 });
    made.sender.send(made.job(4));
    await pullUntilIdle(made.sender);
    expect(made.logged(said)).toHaveLength(2);
    expect(made.logged('direct messages sent')[1]).toMatchObject({ contactsNotRecorded: 1 });
  });

  it('takes a record of a member written to that has not answered in ten seconds for one that failed: it holds no send back', async () => {
    // Only the timers of the sender's own: the fakes answer on `setImmediate`, which stays real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const made = capped(1_000);
      made.contacts.addHold = true;
      for (let n = 1; n <= 7; n++) made.sender.send(made.job(n));
      await made.pulls(20);
      // Five sends on their way at most: the five records that do not answer hold the rest.
      expect(made.gateway.sent).toHaveLength(5);
      vi.advanceTimersByTime(10_000);
      await made.pulls(20);
      expect(made.gateway.sent).toHaveLength(7);
      vi.advanceTimersByTime(10_000);
      await made.settle();
      expect(made.sender.idle).toBe(true);
      const said = 'could not record that a direct message went to a member';
      expect(made.logged(said)).toHaveLength(1);
      expect(made.logged('direct messages sent')[0]).toMatchObject({
        sent: 7,
        contactsNotRecorded: 7,
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads first whether the members of the messages it looked at were written to, before the rest', async () => {
    const made = capped(10_000);
    for (let n = 0; n < 500; n++) made.sender.send(made.job(n));
    made.sender.send(made.job(1_000, { serverId: AWAY, priority: DM_PRIORITY.urgent }));
    await made.pulls(3);
    // Away's urgent message was looked at in the first pull: its member is in the second read,
    // not behind the four hundred of Home's burst that wait to be read.
    expect(made.contacts.asked.findIndex((batch) => batch.includes(idOf(1_000)))).toBe(1);
    expect(ids(made.gateway.sent)[0]).toBe(idOf(1_000));
  });

  it('does not wait at shutdown when only first messages its cap holds back are left', async () => {
    // The timer of `drain` is held and never fires here: a drain that resolves did not wait
    // for its time to pass. (`setImmediate`, which the fakes answer on, stays real.)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Held back already when the draining begins: it never starts to wait.
      const made = capped(1);
      made.sender.send(made.job(1));
      made.sender.send(made.job(2));
      await made.pulls(5);
      expect(made.sender.depth).toBe(1);
      let ended = false;
      const drained = made.sender.drain(2_000).then(() => {
        ended = true;
      });
      await made.settle();
      expect(ended).toBe(true);
      await drained;
      expect(vi.getTimerCount()).toBe(0);
      expect(made.logged('direct messages were still waiting at shutdown')[0]).toMatchObject({
        abandoned: 1,
      });

      // Held back only once it drains (its member read meanwhile): the pull that finds nothing
      // to start ends the wait.
      const late = capped(1);
      late.sender.send(late.job(1));
      await late.pulls(3);
      late.sender.send(late.job(2));
      let lateEnded = false;
      const lateDrained = late.sender.drain(2_000).then(() => {
        lateEnded = true;
      });
      await late.settle();
      expect(vi.getTimerCount()).toBe(1);
      await late.pulls(3);
      expect(lateEnded).toBe(true);
      await lateDrained;
      expect(vi.getTimerCount()).toBe(0);
      expect(ids(late.gateway.sent)).toEqual([idOf(1)]);

      // The window frees within the time there is: it waits for that.
      const soon = capped(1);
      soon.sender.send(soon.job(1));
      soon.sender.send(soon.job(2));
      await soon.pulls(5);
      soon.clock.now += WINDOW_MS - 10;
      const waiting = soon.sender.drain(5_000);
      await soon.settle();
      expect(vi.getTimerCount()).toBe(1);
      soon.clock.now += 10;
      await soon.pulls(2);
      await waiting;
      expect(ids(soon.gateway.sent)).toEqual([idOf(1), idOf(2)]);
      expect(soon.logged('direct messages were still waiting at shutdown')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('nodeLoopDelay', () => {
  it('measures the delay of the event loop between start and stop', async () => {
    const meter = nodeLoopDelay();
    expect(meter.read()).toEqual({ meanMs: 0, maxMs: 0 });
    meter.start();
    const until = Date.now() + 80;
    while (Date.now() < until) {
      // Hold the loop.
    }
    // eslint-disable-next-line no-restricted-syntax -- it measures the real event loop: real time is what it reads
    await new Promise((resolve) => setTimeout(resolve, 60));
    const read = meter.read();
    meter.stop();
    expect(read.maxMs).toBeGreaterThan(20);
    expect(read.meanMs).toBeGreaterThan(0);
  });
});

describe('the fakes of direct messages', () => {
  it('FakeDmGateway is as strict as Discord about a message', async () => {
    const gateway = new FakeDmGateway();
    await expect(gateway.send(idOf(1), {})).rejects.toThrow('content or an embed');
    await expect(gateway.send(idOf(1), { embeds: [{ title: 'x'.repeat(257) }] })).rejects.toThrow(
      'embed title',
    );
    const row = { type: 1 as const, components: [] };
    await expect(
      gateway.send(idOf(1), { content: 'x', components: [row, row, row, row, row, row] }),
    ).rejects.toThrow('5 rows');
    await expect(
      gateway.send(idOf(1), { content: 'x', mention: { users: [idOf(1)] } }),
    ).rejects.toThrow('pings nobody');
    gateway.closed.add(idOf(2));
    expect(await gateway.send(idOf(2), { content: 'x' })).toBe('closed');
    expect(await gateway.send(idOf(1), { content: 'x' })).toBe('sent');
    expect(gateway.to(idOf(1))).toEqual([{ content: 'x' }]);
  });

  it('FakeDmGateway takes a components-v2 message and refuses one Discord would refuse', async () => {
    const gateway = new FakeDmGateway();
    const text = (content: string) => ({ type: ComponentType.TextDisplay as const, content });
    const box = (components: ReturnType<typeof text>[]) => ({
      type: ComponentType.Container as const,
      components,
    });
    const good: V2Message = { v2: true, components: [box([text('News.')])] };
    expect(await gateway.send(idOf(1), good)).toBe('sent');
    expect(gateway.to(idOf(1))).toEqual([good]);
    // The checks of the party gateway: 40 components at most, no content beside the flag.
    const many: V2Message = {
      v2: true,
      components: [box(Array.from({ length: 40 }, (_, n) => text(String(n))))],
    };
    await expect(gateway.send(idOf(1), many)).rejects.toThrow('at most 40 components');
    const withContent = { ...good, content: 'x' } as unknown as V2Message;
    await expect(gateway.send(idOf(1), withContent)).rejects.toThrow('no content or embeds');
    await expect(gateway.send(idOf(1), { ...good, mention: { users: [idOf(1)] } })).rejects.toThrow(
      'pings nobody',
    );
  });

  it('RecordingDms keeps what was put in line', () => {
    const dms = new RecordingDms();
    const job: DmJob = {
      userId: idOf(1),
      serverId: null,
      message: { content: 'x' },
      priority: DM_PRIORITY.urgent,
      eventAt: NOW,
      expiresAt: NOW + 1,
    };
    dms.send(job);
    dms.send({ ...job, userId: idOf(2) });
    dms.send(job);
    expect(dms.recipients).toEqual([idOf(1), idOf(2)]);
    expect(dms.to(idOf(1))).toHaveLength(2);
  });
});
