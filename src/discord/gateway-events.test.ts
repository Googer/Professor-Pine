import { EventEmitter } from 'node:events';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  attachGatewayHandlers,
  catchUpOnReturn,
  GatewayWatch,
  REAL_AWAY_MS,
  SESSION_CATCH_UP_EVERY_MS,
  type GatewayBack,
} from './gateway-events.js';

const closeEvent = { code: 4004, reason: '', wasClean: true };

describe('attachGatewayHandlers', () => {
  it('leaves a shard error to the watch (plan 8X-H): not fatal, not an error line', () => {
    const { log, entries } = createTestLogger();
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const onFatal = vi.fn();
    attachGatewayHandlers(client, log, onFatal);

    client.emit(Events.ShardError, new Error('socket hiccup'), 0);

    expect(onFatal).not.toHaveBeenCalled();
    expect(entries).toEqual([]);
  });

  it('logs fatal and calls onFatal when a shard disconnects for good', () => {
    const { log, entries } = createTestLogger();
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const onFatal = vi.fn();
    attachGatewayHandlers(client, log, onFatal);

    client.emit(Events.ShardDisconnect, closeEvent, 0);

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith(
      'Discord closed the gateway connection for good (code 4004)',
    );
    expect(entries.some((l) => l.level === 60 && l.code === 4004)).toBe(true);
  });
});

const SECOND = 1_000;
const START = Date.UTC(2026, 9, 23, 8, 0);

/** Windows' DNS away, as discord.js gives it every half second (staging of 8X-G). */
function notFound(): Error {
  return Object.assign(new Error('getaddrinfo ENOTFOUND gateway.discord.gg'), {
    code: 'ENOTFOUND',
  });
}

/**
 * A client on an EventEmitter (shard 0 unless a step names another), a clock the test moves, and
 * what the watch said.
 */
function watched(options: { lastAck?: number } = {}) {
  const { log, entries } = createTestLogger();
  const client = new EventEmitter();
  let now = START;
  const lastAcks = new Map<number, number | undefined>([[0, options.lastAck]]);
  const watch = new GatewayWatch({
    log,
    now: () => now,
    lastAck: (shard) => lastAcks.get(shard),
  }).attach(client as unknown as Pick<Client, 'on'>);
  const back: GatewayBack[] = [];
  watch.onBack((event) => {
    back.push(event);
  });
  return {
    entries,
    back,
    pass(ms: number) {
      now += ms;
    },
    ack(at: number, shard = 0) {
      lastAcks.set(shard, at);
    },
    ready: (shard = 0) => client.emit(Events.ShardReady, shard, undefined),
    reconnecting: (shard = 0) => client.emit(Events.ShardReconnecting, shard),
    resume: (shard = 0) => client.emit(Events.ShardResume, shard, 3),
    error: (err: Error = notFound(), shard = 0) => client.emit(Events.ShardError, err, shard),
    said: (msg: string) => entries.filter((entry) => entry['msg'] === msg),
  };
}

describe('GatewayWatch (plan 8X-H): when the gateway is back after a real disconnect', () => {
  it('takes a routine resume of a few seconds without errors for none', () => {
    const made = watched();
    made.ready();
    made.reconnecting();
    made.pass(2 * SECOND);
    made.resume();
    expect(made.back).toEqual([]);
    expect(made.said('discord gateway back')).toEqual([]);
  });

  it('is back for real after half a minute away, and says how long', () => {
    const made = watched();
    made.ready();
    made.pass(10 * SECOND);
    made.reconnecting();
    // discord.js says it reconnects with every try: only the first counts.
    made.pass(20 * SECOND);
    made.reconnecting();
    made.pass(25 * SECOND);
    made.resume();
    expect(made.back).toEqual([
      { shard: 0, awayMs: 45 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
    ]);
    expect(made.said('discord gateway back')).toEqual([
      expect.objectContaining({ level: 30, awayMs: 45 * SECOND, shardErrors: 0 }),
    ]);
    // Nothing is said of each reconnection.
    expect(made.entries.map((entry) => entry['msg'])).toEqual(['discord gateway back']);
    // Once back, a later routine resume is none.
    made.reconnecting();
    made.pass(SECOND);
    made.resume();
    expect(made.back).toHaveLength(1);
  });

  it('is back for real after a shard error, or with a new session, however short', () => {
    const errors = watched();
    errors.ready();
    errors.reconnecting();
    errors.error();
    errors.pass(2 * SECOND);
    errors.resume();
    expect(errors.back).toEqual([
      { shard: 0, awayMs: 2 * SECOND, shardErrors: 1, newSession: false, real: 'errors' },
    ]);
    // ECONNRESET and the like give no shard error: the shard comes back with a new session.
    const fresh = watched();
    fresh.ready();
    fresh.reconnecting();
    fresh.pass(3 * SECOND);
    fresh.ready();
    expect(fresh.back).toEqual([
      { shard: 0, awayMs: 3 * SECOND, shardErrors: 0, newSession: true, real: 'session' },
    ]);
  });

  it('counts nothing before the first ready: the login and its own reconnections', () => {
    const made = watched();
    made.reconnecting();
    made.pass(60 * SECOND);
    made.ready();
    expect(made.back).toEqual([]);
  });

  it('counts the time away from the last heartbeat Discord acknowledged, when it is older (a laptop asleep)', () => {
    const made = watched({ lastAck: START });
    made.ready();
    // Asleep for an hour while connected: the first reconnection comes at wake.
    made.pass(60 * 60 * SECOND);
    made.reconnecting();
    made.pass(5 * SECOND);
    made.resume();
    expect(made.back).toEqual([
      {
        shard: 0,
        awayMs: 60 * 60 * SECOND + 5 * SECOND,
        shardErrors: 0,
        newSession: false,
        real: 'time',
      },
    ]);
  });

  it('takes a routine resume whose last acknowledgement is under a minute old for none', () => {
    // Discord acknowledges a heartbeat every 41.25 s: at a routine reconnection the last one can
    // be some 35 s old without any trouble.
    const made = watched({ lastAck: START });
    made.ready();
    made.pass(35 * SECOND);
    made.reconnecting();
    made.pass(SECOND);
    made.resume();
    expect(made.back).toEqual([]);
    expect(made.said('discord gateway resumed')).toEqual([
      expect.objectContaining({ level: 20, awayMs: SECOND }),
    ]);
  });

  it('counts from the last acknowledgement of a zombie connection, 85 s old', () => {
    // Two heartbeats without an answer: discord.js gives the connection up some 82 s after the
    // last acknowledgement.
    const made = watched({ lastAck: START });
    made.ready();
    made.pass(85 * SECOND);
    made.reconnecting();
    made.pass(2 * SECOND);
    made.resume();
    expect(made.back).toEqual([
      { shard: 0, awayMs: 87 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
    ]);
  });

  it('takes the last acknowledgement at the reconnection: the new connection’s first one comes before the resume (review F3)', () => {
    const made = watched({ lastAck: START });
    made.ready();
    made.pass(85 * SECOND);
    made.reconnecting();
    made.pass(2 * SECOND);
    // The new connection's first heartbeat is acknowledged before Discord says RESUMED.
    made.ack(START + 86 * SECOND);
    made.resume();
    expect(made.back).toEqual([
      { shard: 0, awayMs: 87 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
    ]);
  });

  it('is not away for a shard error while connected: only a reconnection starts it', () => {
    const made = watched();
    made.ready();
    made.error();
    // Said all the same.
    expect(made.said('discord shard error')).toHaveLength(1);
    made.pass(60 * SECOND);
    made.reconnecting();
    made.pass(2 * SECOND);
    made.resume();
    expect(made.back).toEqual([]);
  });
});

describe('GatewayWatch (plan 19D): each shard by itself', () => {
  it('keeps each shard’s time away: one shard’s return does not end another’s', () => {
    const made = watched();
    made.ready(0);
    made.ready(1);
    made.reconnecting(0);
    made.pass(10 * SECOND);
    made.reconnecting(1);
    made.pass(25 * SECOND);
    made.resume(0);
    made.pass(20 * SECOND);
    made.resume(1);
    expect(made.back).toEqual([
      { shard: 0, awayMs: 35 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
      { shard: 1, awayMs: 45 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
    ]);
    // The line names the shard and how long it was away.
    expect(made.said('discord gateway back')).toEqual([
      expect.objectContaining({ shard: 0, awayMs: 35 * SECOND }),
      expect.objectContaining({ shard: 1, awayMs: 45 * SECOND }),
    ]);
  });

  it('arms each shard by its own first ready: a late shard’s login is no return', () => {
    const made = watched();
    made.ready(0);
    // Shard 1 identifies seconds later, after a try that failed.
    made.reconnecting(1);
    made.pass(60 * SECOND);
    made.ready(1);
    expect(made.back).toEqual([]);
  });

  it('counts a shard error for its own shard only', () => {
    const made = watched();
    made.ready(0);
    made.ready(1);
    made.reconnecting(1);
    // Shard 0, connected, has an error meanwhile: shard 1's resume stays routine.
    made.error(notFound(), 0);
    made.pass(2 * SECOND);
    made.resume(1);
    expect(made.back).toEqual([]);
    made.reconnecting(0);
    made.error(notFound(), 0);
    made.pass(2 * SECOND);
    made.resume(0);
    expect(made.back).toEqual([
      { shard: 0, awayMs: 2 * SECOND, shardErrors: 1, newSession: false, real: 'errors' },
    ]);
  });

  it('takes each shard’s own last acknowledgement', () => {
    const made = watched();
    made.ack(START, 1);
    made.ready(0);
    made.ready(1);
    made.pass(90 * SECOND);
    made.ack(START + 85 * SECOND, 0);
    made.reconnecting(0);
    made.reconnecting(1);
    made.pass(SECOND);
    made.resume(0);
    made.resume(1);
    // Shard 0's last acknowledgement was fresh: routine. Shard 1's was a zombie's.
    expect(made.back).toEqual([
      { shard: 1, awayMs: 91 * SECOND, shardErrors: 0, newSession: false, real: 'time' },
    ]);
  });

  it('says a kind of shard error once for every shard, and counts each shard’s own (fix round 1, F6)', () => {
    const made = watched();
    made.ready(0);
    made.ready(1);
    made.ready(2);
    // The network away: every shard reconnects, and each tries twice a second.
    made.reconnecting(0);
    made.reconnecting(1);
    made.reconnecting(2);
    for (let n = 0; n < 40; n++) {
      made.pass(500);
      for (const shard of [0, 1, 2]) made.error(notFound(), shard);
    }
    expect(made.said('discord shard error')).toHaveLength(1);
    expect(made.said('discord shard errors repeated')).toEqual([]);
    for (let n = 0; n < 81; n++) {
      made.pass(500);
      for (const shard of [0, 1, 2]) made.error(notFound(), shard);
    }
    // Once a minute for all of them, with how many since.
    expect(made.said('discord shard errors repeated')).toEqual([
      expect.objectContaining({ count: 120 * 3 }),
    ]);
    made.resume(0);
    made.resume(1);
    made.resume(2);
    expect(made.back.map((back) => [back.shard, back.shardErrors])).toEqual([
      [0, 121],
      [1, 121],
      [2, 121],
    ]);
    // Back for every shard: the next outage's first error is said again.
    made.reconnecting(1);
    made.error(notFound(), 1);
    expect(made.said('discord shard error')).toHaveLength(2);
  });
});

describe('catchUpOnReturn (fix round 1, F5)', () => {
  const MINUTE = 60 * SECOND;
  /** A short return with a new session, unless the test says otherwise. */
  const back = (overrides: Partial<GatewayBack> = {}): GatewayBack => ({
    shard: 0,
    awayMs: 5 * SECOND,
    shardErrors: 0,
    newSession: true,
    real: 'session',
    ...overrides,
  });

  function requests(shards = 3) {
    let now = START;
    let asked = 0;
    const listener = catchUpOnReturn(
      () => {
        asked += 1;
      },
      { shards: () => shards, now: () => now },
    );
    return {
      listener,
      asked: () => asked,
      pass(ms: number) {
        now += ms;
      },
    };
  }

  it('asks for the catch-up at every return real by its time away or its errors', () => {
    const made = requests();
    made.listener(back({ awayMs: REAL_AWAY_MS, newSession: false, real: 'time' }));
    made.listener(back({ shardErrors: 1, newSession: false, real: 'errors' }));
    made.listener(back({ awayMs: 10 * MINUTE, real: 'time' }));
    expect(made.asked()).toBe(3);
  });

  it('asks at every return with one shard, as before (19D fix round 2, R3)', () => {
    const made = requests(1);
    made.listener(back());
    made.pass(MINUTE);
    made.listener(back());
    expect(made.asked()).toBe(2);
  });

  it('asks at most once in ten minutes for a short return with a new session of one of several shards', () => {
    const made = requests();
    made.listener(back({ shard: 0 }));
    made.pass(MINUTE);
    made.listener(back({ shard: 1 }));
    made.pass(SESSION_CATCH_UP_EVERY_MS - MINUTE - 1);
    made.listener(back({ shard: 2 }));
    expect(made.asked()).toBe(1);
    made.pass(1);
    made.listener(back({ shard: 2 }));
    expect(made.asked()).toBe(2);
    // A real outage meanwhile counts as the catch-up of those ten minutes.
    made.pass(SESSION_CATCH_UP_EVERY_MS);
    made.listener(back({ awayMs: MINUTE, real: 'time' }));
    made.listener(back());
    expect(made.asked()).toBe(3);
  });
});

describe('GatewayWatch (plan 8X-H): a run of shard errors', () => {
  it('says the first of a kind with the error, then how many more at most once a minute', () => {
    const made = watched();
    made.ready();
    made.reconnecting();
    made.error();
    // discord.js tries about twice a second.
    for (let n = 0; n < 119; n++) {
      made.pass(500);
      made.error();
    }
    expect(made.said('discord shard error')).toEqual([
      expect.objectContaining({ level: 40, shard: 0, err: expect.objectContaining({}) as unknown }),
    ]);
    expect(made.said('discord shard errors repeated')).toEqual([]);
    made.pass(500);
    made.error();
    expect(made.said('discord shard errors repeated')).toEqual([
      expect.objectContaining({
        level: 40,
        count: 120,
        error: 'getaddrinfo ENOTFOUND gateway.discord.gg',
      }),
    ]);
    // Another kind is said by itself at once.
    made.error(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    expect(made.said('discord shard error')).toHaveLength(2);
    // The rest, not said yet, are counted in the line of the gateway back.
    for (let n = 0; n < 10; n++) {
      made.pass(500);
      made.error();
    }
    made.resume();
    expect(made.said('discord gateway back')).toEqual([
      expect.objectContaining({ shardErrors: 132, unsaid: 10 }),
    ]);
    // The next outage's first error is said again.
    made.reconnecting();
    made.error();
    expect(made.said('discord shard error')).toHaveLength(3);
  });

  it('says an error of a kind seen while connected anew when the outage begins (review r1 C5)', () => {
    const made = watched();
    made.ready();
    made.error();
    made.pass(10 * SECOND);
    made.reconnecting();
    made.error();
    expect(made.said('discord shard error')).toHaveLength(2);
  });
});
