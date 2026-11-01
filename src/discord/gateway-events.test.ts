import { EventEmitter } from 'node:events';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { attachGatewayHandlers, GatewayWatch, type GatewayBack } from './gateway-events.js';

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

/** A client of one shard, on an EventEmitter, a clock the test moves, and what the watch said. */
function watched(options: { lastAck?: number } = {}) {
  const { log, entries } = createTestLogger();
  const client = new EventEmitter();
  let now = START;
  let lastAck = options.lastAck;
  const watch = new GatewayWatch({
    log,
    now: () => now,
    lastAck: () => lastAck,
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
    ack(at: number) {
      lastAck = at;
    },
    ready: () => client.emit(Events.ShardReady, 0, undefined),
    reconnecting: () => client.emit(Events.ShardReconnecting, 0),
    resume: () => client.emit(Events.ShardResume, 0, 3),
    error: (err: Error = notFound()) => client.emit(Events.ShardError, err, 0),
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
    expect(made.back).toEqual([{ awayMs: 45 * SECOND, shardErrors: 0, newSession: false }]);
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
    expect(errors.back).toEqual([{ awayMs: 2 * SECOND, shardErrors: 1, newSession: false }]);
    // ECONNRESET and the like give no shard error: the shard comes back with a new session.
    const fresh = watched();
    fresh.ready();
    fresh.reconnecting();
    fresh.pass(3 * SECOND);
    fresh.ready();
    expect(fresh.back).toEqual([{ awayMs: 3 * SECOND, shardErrors: 0, newSession: true }]);
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
      { awayMs: 60 * 60 * SECOND + 5 * SECOND, shardErrors: 0, newSession: false },
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
    expect(made.back).toEqual([{ awayMs: 87 * SECOND, shardErrors: 0, newSession: false }]);
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
    expect(made.back).toEqual([{ awayMs: 87 * SECOND, shardErrors: 0, newSession: false }]);
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
