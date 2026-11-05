import { describe, expect, it } from 'vitest';
import { BudgetLine, CachedMemberDirectory, type ServerMember } from './member-directory.js';

const GUILD = '100000000000000001';
const OTHER_GUILD = '100000000000000002';
const ALICE = '200000000000000001';
const BOB = '200000000000000002';

/** A directory over a fetch that is counted, with a clock a test moves. */
function setup(members: Record<string, string> = { [ALICE]: 'Alice' }) {
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
      line.run(async () => {
        // What had settled when this one started.
        seen.push([name, ...settled]);
        await Promise.resolve();
        settled.push(name);
        if (fails) throw new Error('refused');
        return name;
      });
    const all = Promise.allSettled([request('first'), request('second', true), request('third')]);
    expect((await all).map((one) => one.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(seen).toEqual([['first'], ['second', 'first'], ['third', 'first', 'second']]);
    expect(takes).toBe(3);
  });
});
