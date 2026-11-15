import { describe, expect, it } from 'vitest';
import {
  BudgetLine,
  CachedMemberDirectory,
  MembersBusy,
  NAMES_PER_MINUTE,
  type ServerMember,
} from './member-directory.js';
import { CachedViewers, MEMBERS_PER_LOOKUP } from './member-viewers.js';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';
const ALICE = '200000000000000001';
const BOB = '200000000000000002';

/** A directory over a fetch that is counted, with a clock a test moves. */
function setup(members: Record<string, string> = { [ALICE]: 'Alice' }, maxKept?: number) {
  const asked: string[] = [];
  const clock = { now: 1_000_000 };
  const state: { failing?: Error; hold?: Promise<void>; random?: number } = {};
  const directory = new CachedMemberDirectory(
    async (guildId, userId): Promise<ServerMember | undefined> => {
      asked.push(`${guildId}:${userId}`);
      if (state.hold) await state.hold;
      if (state.failing) throw state.failing;
      const name = guildId === GUILD ? members[userId] : undefined;
      return name === undefined ? undefined : { id: userId, name };
    },
    () => clock.now,
    () => state.random ?? 0,
    maxKept,
  );
  return { directory, asked, clock, state, members };
}

/** A user id of 18 digits for a number. */
const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

describe('CachedMemberDirectory: how long an answer is kept', () => {
  it('keeps each answer 60 to 90 seconds, at random per entry', async () => {
    const made = setup();
    made.state.random = 0;
    await made.directory.find(GUILD, ALICE);
    made.clock.now += 59_999;
    await made.directory.find(GUILD, ALICE);
    expect(made.asked).toHaveLength(1);
    made.clock.now += 1;
    made.state.random = 0.5;
    await made.directory.find(GUILD, ALICE);
    expect(made.asked).toHaveLength(2);
    made.clock.now += 74_999;
    await made.directory.find(GUILD, ALICE);
    expect(made.asked).toHaveLength(2);
    made.clock.now += 1;
    await made.directory.find(GUILD, ALICE);
    expect(made.asked).toHaveLength(3);
  });

  it('says whether it holds an answer, or one on its way, which needs no request of its own', async () => {
    const made = setup();
    made.state.random = 0;
    expect(made.directory.holds(GUILD, ALICE)).toBe(false);
    let release: () => void = () => undefined;
    made.state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asking = made.directory.find(GUILD, ALICE);
    expect(made.directory.holds(GUILD, ALICE)).toBe(true);
    release();
    await asking;
    expect(made.directory.holds(GUILD, ALICE)).toBe(true);
    made.clock.now += 60_000;
    expect(made.directory.holds(GUILD, ALICE)).toBe(false);
    expect(made.directory.holds(GUILD, 'not an id')).toBe(true);
  });
});

describe('CachedMemberDirectory between servers (plan 19B-5)', () => {
  it('keeps what one server knows through another server’s burst of look-ups', async () => {
    const made = setup({ [ALICE]: 'Alice' }, 10);
    expect(await made.directory.find(GUILD, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    for (let n = 0; n < 50; n++) await made.directory.find(OTHER_GUILD, idOf(n));
    const before = made.asked.length;
    expect(await made.directory.find(GUILD, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    expect(made.asked.length).toBe(before);
  });
});

describe('CachedMemberDirectory', () => {
  it('asks once for a member and keeps the answer for a minute', async () => {
    const made = setup();
    expect(await made.directory.find(GUILD, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    made.members[ALICE] = 'Alice the Second';
    made.clock.now += 59_999;
    expect(await made.directory.find(GUILD, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    expect(made.asked).toEqual([`${GUILD}:${ALICE}`]);
    made.clock.now += 1;
    expect(await made.directory.find(GUILD, ALICE)).toEqual({
      id: ALICE,
      name: 'Alice the Second',
    });
    expect(made.asked).toHaveLength(2);
  });

  it('keeps "not a member" for a minute too, per server', async () => {
    const made = setup();
    expect(await made.directory.find(GUILD, BOB)).toBeUndefined();
    made.members[BOB] = 'Bob';
    expect(await made.directory.find(GUILD, BOB)).toBeUndefined();
    expect(made.asked).toEqual([`${GUILD}:${BOB}`]);
    // Another server is another question.
    expect(await made.directory.find(OTHER_GUILD, ALICE)).toBeUndefined();
    expect(made.asked).toEqual([`${GUILD}:${BOB}`, `${OTHER_GUILD}:${ALICE}`]);
    made.clock.now += 60_000;
    expect(await made.directory.find(GUILD, BOB)).toEqual({ id: BOB, name: 'Bob' });
  });

  it('makes two look-ups of one member at the same time one request', async () => {
    const made = setup();
    let release: () => void = () => undefined;
    made.state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = made.directory.find(GUILD, ALICE);
    const second = made.directory.find(GUILD, ALICE);
    const other = made.directory.find(GUILD, BOB);
    release();
    expect(await Promise.all([first, second, other])).toEqual([
      { id: ALICE, name: 'Alice' },
      { id: ALICE, name: 'Alice' },
      undefined,
    ]);
    expect(made.asked).toEqual([`${GUILD}:${ALICE}`, `${GUILD}:${BOB}`]);
  });

  it('answers undefined without asking for what cannot be a user id', async () => {
    const made = setup();
    for (const bad of ['', ' ', 'alice', '1234', '20000000000000', `${ALICE}0000`, `${ALICE} `]) {
      expect(await made.directory.find(GUILD, bad)).toBeUndefined();
    }
    expect(made.asked).toEqual([]);
    // 17 and 20 digits are ids.
    await made.directory.find(GUILD, '20000000000000001');
    await made.directory.find(GUILD, '20000000000000000001');
    expect(made.asked).toHaveLength(2);
  });

  it('does not remember a failure: the next look-up asks again', async () => {
    const made = setup();
    made.state.failing = new Error('Discord is away');
    await expect(made.directory.find(GUILD, ALICE)).rejects.toThrow('Discord is away');
    await expect(made.directory.find(GUILD, ALICE)).rejects.toThrow('Discord is away');
    delete made.state.failing;
    expect(await made.directory.find(GUILD, ALICE)).toEqual({ id: ALICE, name: 'Alice' });
    expect(made.asked).toHaveLength(3);
  });

  it('remembers 5,000 answers and forgets the oldest for the next', async () => {
    const made = setup();
    for (let n = 0; n < 5_000; n++) await made.directory.find(GUILD, idOf(n));
    expect(made.asked).toHaveLength(5_000);
    // All of them are still known.
    await made.directory.find(GUILD, idOf(0));
    await made.directory.find(GUILD, idOf(4_999));
    expect(made.asked).toHaveLength(5_000);
    // One more pushes out the oldest, and only that one.
    await made.directory.find(GUILD, idOf(5_000));
    await made.directory.find(GUILD, idOf(1));
    await made.directory.find(GUILD, idOf(5_000));
    expect(made.asked).toHaveLength(5_001);
    await made.directory.find(GUILD, idOf(0));
    expect(made.asked).toHaveLength(5_002);
    expect(made.asked.at(-1)).toBe(`${GUILD}:${idOf(0)}`);
  });
});

describe('BudgetLine: one request for members at a time (R-A4)', () => {
  it('starts a request only once the one before it has settled, failed or not', async () => {
    let takes = 0;
    const line = new BudgetLine({ take: () => Promise.resolve(void takes++) });
    const settled: string[] = [];
    const seen: string[][] = [];
    const request = (name: string, fails = false) =>
      line.run(
        async () => {
          // What had settled when this one started.
          seen.push([name, ...settled]);
          await Promise.resolve();
          settled.push(name);
          if (fails) throw new Error('refused');
          return name;
        },
        { server: GUILD },
      );
    const all = Promise.allSettled([request('first'), request('second', true), request('third')]);
    expect((await all).map((one) => one.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(seen).toEqual([['first'], ['second', 'first'], ['third', 'first', 'second']]);
    expect(takes).toBe(3);
  });

  it('lets who sees a channel (the notifier) go ahead of the names waiting (W1)', async () => {
    const line = new BudgetLine({ take: () => Promise.resolve() });
    const started: string[] = [];
    const request = (name: string, names: boolean) =>
      line.run(
        () => {
          started.push(name);
          return Promise.resolve(name);
        },
        { server: GUILD, names },
      );
    // Chosen once the budget's turn is taken (F2): the viewers go first, also ahead of names asked
    // before them.
    await Promise.all([
      request('names 1', true),
      request('names 2', true),
      request('viewers', false),
      request('names 3', true),
    ]);
    expect(started).toEqual(['viewers', 'names 1', 'names 2', 'names 3']);
  });

  it('refuses names beyond ten requests a minute, viewers never (W1)', async () => {
    let now = 1_000;
    const line = new BudgetLine({ take: () => Promise.resolve() }, () => now);
    const names = () => {
      line.reserveNames(1);
      return line.run(() => Promise.resolve('named'), { server: GUILD, names: true });
    };
    for (let n = 0; n < NAMES_PER_MINUTE; n++) await names();
    expect(() => line.reserveNames(1)).toThrow(MembersBusy);
    expect(await line.run(() => Promise.resolve('seen'), { server: GUILD })).toBe('seen');
    now += 60_000;
    expect(await names()).toBe('named');
  });

  it('reserves every batch of an ask at once, or none, spending nothing on a refusal (F1)', () => {
    const line = new BudgetLine({ take: () => Promise.resolve() }, () => 1_000);
    line.reserveNames(NAMES_PER_MINUTE - 1);
    // 200 ids are three batches: with one start left, refused at once.
    expect(() => line.reserveNames(Math.ceil(200 / MEMBERS_PER_LOOKUP))).toThrow(MembersBusy);
    // The start left is still there.
    expect(() => line.reserveNames(1)).not.toThrow();
    expect(() => line.reserveNames(1)).toThrow(MembersBusy);
  });

  it('takes turns between servers among the viewers, and among the names (plan 19B-5)', async () => {
    const HOME = '412345678901234567';
    const AWAY = '412345678901234568';
    const line = new BudgetLine({ take: () => Promise.resolve() });
    const started: string[] = [];
    const request = (name: string, server: string, names = false) =>
      line.run(
        () => {
          started.push(name);
          return Promise.resolve(name);
        },
        { server, names },
      );
    await Promise.all([
      request('home 1', HOME),
      request('home 2', HOME),
      request('home 3', HOME),
      request('away 1', AWAY),
      request('home names 1', HOME, true),
      request('home names 2', HOME, true),
      request('away names', AWAY, true),
    ]);
    // Away's come last and go in Home's burst; every viewer still goes before every name.
    expect(started).toEqual([
      'home 1',
      'away 1',
      'home 2',
      'home 3',
      'home names 1',
      'away names',
      'home names 2',
    ]);
  });

  it('lets the second request of a lookup of viewers go ahead of the names waiting (F2)', async () => {
    const line = new BudgetLine({ take: () => Promise.resolve() });
    const started: string[] = [];
    const viewers = new CachedViewers((guild, _channel, ids) =>
      line.run(
        () => {
          started.push(`viewers of ${String(ids.length)}`);
          return Promise.resolve(new Set(ids));
        },
        { server: guild },
      ),
    );
    const many = Array.from({ length: MEMBERS_PER_LOOKUP + 1 }, (_, n) =>
      String(312345678901234567n + BigInt(n)),
    );
    const seeing = viewers.viewers('412345678901234567', '512345678901234567', many);
    const named = line.run(
      () => {
        started.push('names');
        return Promise.resolve();
      },
      { server: '412345678901234567', names: true },
    );
    await Promise.all([seeing, named]);
    expect(started).toEqual([`viewers of ${String(MEMBERS_PER_LOOKUP)}`, 'viewers of 1', 'names']);
  });
});
