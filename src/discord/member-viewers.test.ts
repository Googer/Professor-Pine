import { describe, expect, it } from 'vitest';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  answeredMembers,
  CachedViewers,
  GATEWAY_REST,
  GatewayWithFallback,
  MEMBER_REQUEST_BUDGET,
  MEMBERS_PER_LOOKUP,
  MEMBERS_PER_REQUEST,
  RequestBudget,
  SEES_MS,
  UNSEEN_MS,
  withSelf,
} from './member-viewers.js';

const GUILD = '100000000000000001';
const FORUM = '500000000000000001';
const CHANNEL = '500000000000000002';

/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));
const ids = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_unused, index) => idOf(from + index));

/** Viewers over a fetch that is recorded, with a clock a test moves. Odd members see nothing. */
function setup(options: { budget?: Pick<RequestBudget, 'take'> } = {}) {
  const requests: string[][] = [];
  const clock = { now: 1_000_000 };
  const state: { failing?: Error; running: number; most: number } = { running: 0, most: 0 };
  const sees = (id: string): boolean => BigInt(id) % 2n === 0n;
  const viewers = new CachedViewers(
    async (_guildId, _channelId, userIds) => {
      requests.push([...userIds]);
      state.running += 1;
      state.most = Math.max(state.most, state.running);
      await new Promise((resolve) => setImmediate(resolve));
      state.running -= 1;
      if (state.failing) throw state.failing;
      return new Set(userIds.filter(sees));
    },
    { now: () => clock.now, ...options },
  );
  return { viewers, requests, clock, state, sees };
}

describe('CachedViewers', () => {
  it('asks for many members in requests of ninety-nine, one after the other', async () => {
    const made = setup();
    const asked = ids(0, 250);
    const seen = await made.viewers.viewers(GUILD, FORUM, asked);
    // One short of what a request may name: the bot itself is named too (`withSelf`).
    expect(made.requests.map((request) => request.length)).toEqual([99, 99, 52]);
    expect(MEMBERS_PER_LOOKUP).toBe(99);
    expect(made.requests.flat()).toEqual(asked);
    expect(made.state.most).toBe(1);
    expect([...seen].sort()).toEqual(asked.filter(made.sees).sort());
    expect(MEMBERS_PER_REQUEST).toBe(100);
  });

  it('never runs two requests at once, whoever asks', async () => {
    const made = setup();
    const [first, second] = await Promise.all([
      made.viewers.viewers(GUILD, FORUM, ids(0, 150)),
      made.viewers.viewers(GUILD, CHANNEL, ids(1000, 150)),
    ]);
    expect(made.state.most).toBe(1);
    expect(made.requests).toHaveLength(4);
    expect(first.size).toBe(75);
    expect(second.size).toBe(75);
  });

  it('keeps "sees it" for ten minutes and "cannot see it" for one, per channel', async () => {
    const made = setup();
    const asked = [idOf(1), idOf(2)];
    expect(await made.viewers.viewers(GUILD, FORUM, asked)).toEqual(new Set([idOf(2)]));
    made.clock.now += SEES_MS > UNSEEN_MS ? UNSEEN_MS - 1 : 0;
    expect(await made.viewers.viewers(GUILD, FORUM, asked)).toEqual(new Set([idOf(2)]));
    expect(made.requests).toHaveLength(1);
    // Another channel is another question.
    await made.viewers.viewers(GUILD, CHANNEL, asked);
    expect(made.requests).toHaveLength(2);
    // After a minute who could not see it is asked about again, who could is not.
    made.clock.now += 1;
    expect(await made.viewers.viewers(GUILD, FORUM, [...asked, idOf(4)])).toEqual(
      new Set([idOf(2), idOf(4)]),
    );
    expect(made.requests[2]).toEqual([idOf(1), idOf(4)]);
    made.clock.now += SEES_MS - UNSEEN_MS - 1;
    await made.viewers.viewers(GUILD, FORUM, [idOf(2)]);
    expect(made.requests).toHaveLength(3);
    made.clock.now += 1;
    await made.viewers.viewers(GUILD, FORUM, [idOf(2)]);
    expect(made.requests[3]).toEqual([idOf(2)]);
    expect(SEES_MS).toBe(600_000);
    expect(UNSEEN_MS).toBe(60_000);
  });

  it('asks only for whom it does not know yet', async () => {
    const made = setup();
    await made.viewers.viewers(GUILD, FORUM, ids(0, 10));
    const seen = await made.viewers.viewers(GUILD, FORUM, ids(5, 10));
    expect(made.requests[1]).toEqual(ids(10, 5));
    expect([...seen].sort()).toEqual(ids(5, 10).filter(made.sees).sort());
  });

  it('does not ask again for a member whom a request ahead in the line answers', async () => {
    const made = setup();
    const [first, second] = await Promise.all([
      made.viewers.viewers(GUILD, FORUM, ids(0, 4)),
      made.viewers.viewers(GUILD, FORUM, ids(2, 4)),
    ]);
    expect(made.requests).toEqual([ids(0, 4), ids(4, 2)]);
    expect([...first].sort()).toEqual([idOf(0), idOf(2)]);
    expect([...second].sort()).toEqual([idOf(2), idOf(4)]);
  });

  it('asks once for a member named twice, and never for what is no user id', async () => {
    const made = setup();
    const seen = await made.viewers.viewers(GUILD, FORUM, [idOf(2), idOf(2), '', '12', 'abc']);
    expect(made.requests).toEqual([[idOf(2)]]);
    expect(seen).toEqual(new Set([idOf(2)]));
    expect(await made.viewers.viewers(GUILD, FORUM, [])).toEqual(new Set());
    expect(await made.viewers.viewers(GUILD, FORUM, [''])).toEqual(new Set());
    expect(made.requests).toHaveLength(1);
  });

  it('rejects when a request fails, keeps nothing of it, and goes on with the next call', async () => {
    const made = setup();
    made.state.failing = new Error('Discord is away');
    await expect(made.viewers.viewers(GUILD, FORUM, ids(0, 150))).rejects.toThrow('away');
    delete made.state.failing;
    const seen = await made.viewers.viewers(GUILD, FORUM, ids(0, 4));
    expect([...seen].sort()).toEqual([idOf(0), idOf(2)]);
    expect(made.state.most).toBe(1);
  });

  it('waits for the budget before every request, and not for an answer from memory', async () => {
    let taken = 0;
    const made = setup({
      budget: {
        take: () => {
          taken += 1;
          return Promise.resolve();
        },
      },
    });
    await made.viewers.viewers(GUILD, FORUM, ids(0, 250));
    expect(taken).toBe(3);
    await made.viewers.viewers(GUILD, FORUM, ids(0, 250));
    expect(taken).toBe(3);
  });
});

describe('RequestBudget', () => {
  /** A budget whose sleeping moves the clock, and records how long it slept. */
  function budgetOf(gapMs: number, perMinute: number) {
    const clock = { now: 5_000_000 };
    const slept: number[] = [];
    const budget = new RequestBudget({
      gapMs,
      perMinute,
      now: () => clock.now,
      sleep: (ms) => {
        slept.push(ms);
        clock.now += ms;
        return Promise.resolve();
      },
    });
    return { budget, clock, slept };
  }

  it('lets the first request start at once and spaces the next ones', async () => {
    const { budget, clock, slept } = budgetOf(1_000, 30);
    await budget.take();
    expect(slept).toEqual([]);
    await budget.take();
    expect(slept).toEqual([1_000]);
    clock.now += 400;
    await budget.take();
    expect(slept).toEqual([1_000, 600]);
    clock.now += 5_000;
    await budget.take();
    expect(slept).toHaveLength(2);
  });

  it('lets no more start in any minute than it allows', async () => {
    const { budget, clock } = budgetOf(1_000, 30);
    const starts: number[] = [];
    for (let i = 0; i < 95; i++) {
      await budget.take();
      starts.push(clock.now);
    }
    for (let i = 0; i < starts.length; i++) {
      const within = starts.filter(
        (at) => at >= (starts[i] ?? 0) && at < (starts[i] ?? 0) + 60_000,
      );
      expect(within.length).toBeLessThanOrEqual(30);
      if (i > 0) expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(1_000);
    }
    // 95 requests need more than three minutes.
    expect((starts.at(-1) ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(180_000);
  });

  it('is budgeted far below what the gateway allows in a minute', () => {
    expect(MEMBER_REQUEST_BUDGET.perMinute).toBeLessThanOrEqual(40);
    expect(60_000 / MEMBER_REQUEST_BUDGET.gapMs).toBeLessThanOrEqual(60);
  });
});

describe('GatewayWithFallback', () => {
  /** A gateway that fails while `down`, a fallback that always answers, and a clock. */
  function fallbackOf() {
    const clock = { now: 9_000_000 };
    const { log, entries } = createTestLogger();
    const state: { down?: Error } = {};
    const asked: string[] = [];
    const asking = new GatewayWithFallback({
      now: () => clock.now,
      log,
      retryAfterMs: (err) => (err as { retryAfterMs?: number }).retryAfterMs,
    });
    const ask = () =>
      asking.ask(
        () => {
          asked.push('gateway');
          return state.down ? Promise.reject(state.down) : Promise.resolve('gateway');
        },
        () => {
          asked.push('rest');
          return Promise.resolve('rest');
        },
      );
    const warnings = () => entries.filter((entry) => entry.level === 40);
    const infos = () => entries.filter((entry) => entry.level === 30);
    return { clock, state, asked, ask, warnings, infos, asking };
  }

  it('asks the gateway, and the other way only when that fails', async () => {
    const made = fallbackOf();
    expect(await made.ask()).toBe('gateway');
    expect(made.asked).toEqual(['gateway']);
    made.state.down = new Error('timed out');
    expect(await made.ask()).toBe('rest');
    expect(made.asked).toEqual(['gateway', 'gateway', 'rest']);
  });

  it('leaves the gateway alone for a minute after a failure, and doubles that up to six hours', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    const rests: number[] = [];
    for (let failure = 0; failure < 12; failure++) {
      made.asked.length = 0;
      await made.ask();
      expect(made.asked).toEqual(['gateway', 'rest']);
      const rest = made.asking.restsUntil - made.clock.now;
      rests.push(rest);
      // While it rests only the other way is asked.
      made.clock.now += rest - 1;
      made.asked.length = 0;
      expect(await made.ask()).toBe('rest');
      expect(made.asked).toEqual(['rest']);
      made.clock.now += 1;
    }
    expect(rests.slice(0, 4)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(rests.at(-1)).toBe(6 * 3_600_000);
    expect(Math.max(...rests)).toBe(GATEWAY_REST.maxMs);
  });

  it('starts at a minute again after a success', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    await made.ask();
    made.clock.now = made.asking.restsUntil;
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(120_000);
    made.clock.now = made.asking.restsUntil;
    delete made.state.down;
    expect(await made.ask()).toBe('gateway');
    made.state.down = new Error('again');
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(60_000);
  });

  it('rests for as long as Discord says when that is longer', async () => {
    const made = fallbackOf();
    made.state.down = Object.assign(new Error('rate limited'), { retryAfterMs: 300_000 });
    await made.ask();
    expect(made.asking.restsUntil - made.clock.now).toBe(300_000);
  });

  it('warns at the first failure and says when the gateway answers again, nothing between', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    for (let failure = 0; failure < 4; failure++) {
      await made.ask();
      made.clock.now = made.asking.restsUntil;
    }
    expect(made.warnings()).toHaveLength(1);
    expect(made.infos()).toHaveLength(0);
    delete made.state.down;
    await made.ask();
    await made.ask();
    expect(made.warnings()).toHaveLength(1);
    expect(made.infos()).toHaveLength(1);
    made.state.down = new Error('timed out');
    await made.ask();
    expect(made.warnings()).toHaveLength(2);
  });

  it('takes an answer without the bot itself for no answer: the other way is asked, and the rest begins', async () => {
    const SELF = idOf(999);
    const members = (...numbers: number[]) => numbers.map((n) => ({ id: idOf(n) }));
    const made = fallbackOf();
    const answers: { id: string }[][] = [members(1, 999), members(), members(1)];
    const requested: string[][] = [];
    const ask = () =>
      made.asking.ask(
        () => {
          requested.push(withSelf([idOf(1), idOf(2)], SELF));
          return Promise.resolve(answeredMembers(answers.shift() ?? [], SELF, [idOf(1), idOf(2)]));
        },
        () => Promise.resolve(members(2)),
      );
    // The bot is named in every request, once.
    expect(await ask()).toEqual(members(1));
    expect(requested[0]).toEqual([idOf(1), idOf(2), SELF]);
    expect(made.asking.restsUntil).toBe(0);
    // An empty answer says "none of them is a member" only when the bot is in it.
    expect(await ask()).toEqual(members(2));
    expect(made.asking.restsUntil).toBe(made.clock.now + GATEWAY_REST.firstMs);
    expect(made.warnings()).toEqual([
      expect.objectContaining({
        msg: 'the gateway request for members failed; asking for them one by one until it works again',
      }),
    ]);
    // Members without the bot are no answer either.
    made.clock.now = made.asking.restsUntil;
    expect(await ask()).toEqual(members(2));
    expect(requested).toHaveLength(3);
  });

  it('names the bot once in a request, and gives its member only to who asked for it', () => {
    const SELF = idOf(999);
    expect(withSelf([idOf(1), SELF, idOf(1)], SELF)).toEqual([idOf(1), SELF]);
    expect(withSelf([], SELF)).toEqual([SELF]);
    expect(withSelf(ids(0, MEMBERS_PER_LOOKUP), SELF)).toHaveLength(MEMBERS_PER_REQUEST);
    const found = [{ id: idOf(1) }, { id: SELF }];
    expect(answeredMembers(found, SELF, [idOf(1)])).toEqual([{ id: idOf(1) }]);
    expect(answeredMembers(found, SELF, [idOf(1), SELF])).toEqual(found);
    expect(() => answeredMembers([{ id: idOf(1) }], SELF, [idOf(1)])).toThrow(
      'without the bot itself',
    );
  });

  it('rejects when the other way fails too', async () => {
    const made = fallbackOf();
    made.state.down = new Error('timed out');
    await expect(
      made.asking.ask(
        () => Promise.reject(new Error('gateway')),
        () => Promise.reject(new Error('rest is away')),
      ),
    ).rejects.toThrow('rest is away');
  });
});

describe('FakeMemberDirectory.viewers', () => {
  it('answers for members of the server who can see the channel', async () => {
    const members = new FakeMemberDirectory()
      .add(idOf(1), 'One', GUILD)
      .add(idOf(2), 'Two', GUILD)
      .add(idOf(3), 'Three', '100000000000000009')
      .hide(FORUM, idOf(2));
    expect(await members.viewers(GUILD, FORUM, [idOf(1), idOf(2), idOf(3), idOf(4)])).toEqual(
      new Set([idOf(1)]),
    );
    expect(await members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).toEqual(
      new Set([idOf(1), idOf(2)]),
    );
    members.sees = (_channelId, userId) => userId !== idOf(1);
    expect(await members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).toEqual(new Set([idOf(2)]));
    expect(members.batches).toHaveLength(3);
    members.batchLimit = 1;
    await expect(members.viewers(GUILD, CHANNEL, [idOf(1), idOf(2)])).rejects.toThrow('at once');
    members.failing = new Error('away');
    await expect(members.viewers(GUILD, CHANNEL, [idOf(1)])).rejects.toThrow('away');
  });
});
