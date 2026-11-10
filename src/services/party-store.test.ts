import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MemoryPartyStorage,
  MINUTE,
  PARTY_NOW,
  partyStoreWith,
  REPORTER,
  testMeetup,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  attendanceLimits,
  createGroup,
  leaveParty,
  setAttendance,
} from '../domain/party/attendance.js';
import { endParty } from '../domain/party/party.js';
import type { Party, RaidParty } from '../domain/party/party.js';
import { setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { LockOverdueError } from './keyed-lock.js';
import { PARTY_LOCK_LIMIT_MS, PartyStore } from './party-store.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const join = (memberId: string) => (party: Party) =>
  setAttendance(party, memberId, PartyStatus.Coming, {}, limits);
const background = watchEachTest();

describe('PartyStore', () => {
  it('refuses to be read before it was loaded', () => {
    const { log } = createTestLogger();
    const store = new PartyStore({ storage: new MemoryPartyStorage(), log });
    expect(() => store.get(ID(1))).toThrow('Parties have not been loaded yet');
    expect(() => store.active()).toThrow('Parties have not been loaded yet');
  });

  it('loads the active parties and finds them by id, post, region and gym', async () => {
    const posted = { ...testRaid({ id: ID(1) }), forumPostId: '300000000000000001' };
    const east = testRaid({ id: ID(2), regionId: 2, gymId: 7, now: PARTY_NOW + MINUTE });
    const over = endParty(testRaid({ id: ID(3) }));
    const { store, entries } = await partyStoreWith([east, posted, over]);

    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(2)]);
    expect(store.get(ID(2))).toBe(east);
    expect(store.get(ID(3))).toBeUndefined();
    expect(store.byPost('300000000000000001')).toBe(posted);
    expect(store.byPost('300000000000000002')).toBeUndefined();
    expect(store.inRegion(2)).toEqual([east]);
    expect(entries.at(-1)).toMatchObject({ msg: 'parties loaded', parties: 2, unreadable: 0 });
  });

  it('keeps meetups beside raids, and never takes one for the raid at a gym', async () => {
    const raid = testRaid({ id: ID(1) });
    const meetup = testMeetup({ id: ID(2), now: PARTY_NOW + MINUTE });
    const { store, storage } = await partyStoreWith([raid]);
    await store.add({ ...meetup, forumPostId: '300000000000000002' });

    expect(store.active().map((party) => party.type)).toEqual(['raid', 'meetup']);
    expect(store.byPost('300000000000000002')?.id).toBe(ID(2));
    expect(store.inRegion(1).map((party) => party.id)).toEqual([ID(1), ID(2)]);
    expect(store.raidAt(1, 1, PARTY_NOW)?.id).toBe(ID(1));

    // A change of a meetup is written like any other, with the details of a meetup.
    const joined = await store.update(ID(2), join(ALICE));
    expect(joined).toMatchObject({ ok: true, written: true, party: { type: 'meetup' } });
    expect(storage.rows.get(ID(2))).toMatchObject({
      type: 'meetup',
      timed: { name: 'Community Day picnic' },
      attendees: { [ALICE]: { status: PartyStatus.Coming } },
    });
  });

  it('refuses a change that would make a party another kind of party', async () => {
    const raid = testRaid({ id: ID(1) });
    const { store, storage } = await partyStoreWith([raid]);
    const { timed, meetup } = testMeetup({ id: ID(1) });
    await expect(
      store.update(ID(1), (party) => ({
        party: { ...party, type: 'meetup', gymId: null, hatchTime: null, timed, meetup },
      })),
    ).rejects.toThrow(`A change of raid ${ID(1)} returned a meetup`);
    expect(store.get(ID(1))).toBe(raid);
    expect(storage.writes).toEqual([]);
  });

  it('logs rows it cannot read and carries on without them', async () => {
    const storage = new MemoryPartyStorage([testRaid()]);
    storage.listActive = () =>
      Promise.resolve({
        parties: [testRaid()],
        unreadable: [
          {
            id: ID(9),
            problem: 'state: bad',
            forumChannelId: '300000000000000001',
            forumPostId: null,
          },
        ],
      });
    const { log, entries } = createTestLogger();
    const store = new PartyStore({ storage, log });
    await store.load();
    expect(store.active()).toHaveLength(1);
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        party: ID(9),
        problem: 'state: bad',
        forumChannelId: '300000000000000001',
        forumPostId: null,
        msg: 'could not read a party',
      }),
    );
  });

  it('finds the raid that blocks a new report: same gym, any kind, not ended by the clock', async () => {
    const rules = testRaidRules();
    const raid = setEndTime(testRaid({ id: ID(1) }), at('2026-10-13T14:40'), rules, PARTY_NOW);
    const { store } = await partyStoreWith([raid]);
    expect(store.raidAt(1, 1, at('2026-10-13T14:39'))?.id).toBe(ID(1));
    expect(store.raidAt(1, 1, at('2026-10-13T14:40'))).toBeUndefined();
    expect(store.raidAt(1, 2, PARTY_NOW)).toBeUndefined();
  });

  // Plan 8E, goal 4: two raids stored at one gym before the rule stay; the oldest stands for it.
  it('answers the oldest of an elite and a standard raid stored at one gym before, until it ends', async () => {
    const rules = testRaidRules();
    const elite = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
    const raid = setEndTime(
      testRaid({ id: ID(1), now: PARTY_NOW - MINUTE }),
      at('2026-10-13T14:40'),
      rules,
      PARTY_NOW,
    );
    const { store } = await partyStoreWith([elite, raid]);
    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(2)]);
    expect(store.raidAt(1, 1, at('2026-10-13T14:39'))?.id).toBe(ID(1));
    expect(store.raidAt(1, 1, at('2026-10-13T14:40'))?.id).toBe(ID(2));
  });

  it('adds a party to the database and to memory', async () => {
    const { store, storage } = await partyStoreWith();
    const raid = testRaid();
    await expect(store.add(raid)).resolves.toBe(raid);
    expect(store.get(raid.id)).toBe(raid);
    expect(storage.rows.get(raid.id)).toBe(raid);
    await expect(store.add(raid)).rejects.toThrow('Duplicate');
  });

  it('writes a change, stamps it with the time, and hands back what the change returned', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid], () => PARTY_NOW + 5 * MINUTE);
    const result = await store.update(raid.id, join(ALICE));
    expect(result).toMatchObject({ ok: true, joined: true, written: true });
    const stored = storage.rows.get(raid.id);
    expect(stored).toMatchObject({ updatedAt: PARTY_NOW + 5 * MINUTE });
    expect(stored?.attendees).toHaveProperty(ALICE);
    expect(result?.party).toBe(stored);
    expect(store.get(raid.id)).toBe(stored);
  });

  it('writes nothing for a change that was refused or changed nothing', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    await expect(store.update(raid.id, (party) => leaveParty(party, ALICE))).resolves.toEqual({
      ok: false,
      reason: 'not-attending',
      written: false,
    });
    await expect(store.update(raid.id, (party) => ({ party }))).resolves.toEqual({
      party: raid,
      written: false,
    });
    expect(storage.writes).toEqual([]);
    expect(store.get(raid.id)).toBe(raid);
  });

  it('gives a group opened again under a pruned letter a fresh stamp, within one millisecond too', async () => {
    // The clock stands still: B is opened, emptied and pruned, and opened again.
    const { store } = await partyStoreWith([testRaid()], () => PARTY_NOW);
    const id = testRaid().id;
    const open = (memberId: string) =>
      store.update(id, (party) => createGroup(party, memberId, { ...limits, now: PARTY_NOW }));
    await open(ALICE);
    const first = store.get(id)?.groups.find((group) => group.id === 'B')?.opened;
    await store.update(id, (party) => leaveParty(party, ALICE));
    expect(store.get(id)?.groups.map((group) => group.id)).toEqual(['A']);
    await open(BOB);
    const again = store.get(id)?.groups.find((group) => group.id === 'B')?.opened;
    expect(first).toBeDefined();
    expect(again).toBeGreaterThan(first ?? Infinity);
    // The party's last write is never before a stamp of its own.
    expect(store.get(id)?.updatedAt).toBeGreaterThanOrEqual(again ?? Infinity);
  });

  it('prunes the groups nobody is in from a change that was written, and only from one', async () => {
    const raid = withAttendees(
      { ...testRaid(), groups: [{ id: 'A' }, { id: 'B', opened: PARTY_NOW + MINUTE }] },
      { [ALICE]: { group: 'B' } },
    );
    const { store, storage } = await partyStoreWith([raid]);
    // The reporter is the only one in A: a refusal and a change of nothing leave A alone.
    await store.update(raid.id, (party) => leaveParty(party, CAROL));
    await store.update(raid.id, (party) => ({ party }));
    expect(store.get(raid.id)?.groups.map((group) => group.id)).toEqual(['A', 'B']);
    const left = await store.update(raid.id, (party) => leaveParty(party, REPORTER));
    expect(left?.party?.groups).toEqual([{ id: 'B', opened: PARTY_NOW + MINUTE }]);
    expect(storage.rows.get(raid.id)?.groups).toEqual([{ id: 'B', opened: PARTY_NOW + MINUTE }]);
    expect(store.get(raid.id)?.defaultGroupId).toBe('B');
  });

  it('says whether anything was written: the first join is, an identical second is not', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    await expect(store.update(raid.id, join(ALICE))).resolves.toMatchObject({ written: true });
    expect(storage.writes).toHaveLength(1);
    await expect(store.update(raid.id, join(ALICE))).resolves.toMatchObject({
      ok: true,
      joined: false,
      written: false,
    });
    expect(storage.writes).toHaveLength(1);
  });

  it('refuses a party that would not survive storage, and keeps the old one', async () => {
    const raid = testRaid({ boss: { key: 'yveltal' } });
    const { store, storage } = await partyStoreWith([raid]);
    const bloated = {
      ...raid,
      raid: { ...raid.raid, boss: { key: 'yveltal', entry: { huge: true } } },
    } as unknown as RaidParty;
    await expect(store.update(raid.id, () => ({ party: bloated }))).rejects.toThrow(
      'would not survive storage',
    );
    expect(storage.rows.get(raid.id)).toBe(raid);
    expect(store.get(raid.id)).toBe(raid);
    expect(storage.writes).toEqual([]);
  });

  it('answers undefined for a party that is not active', async () => {
    const { store } = await partyStoreWith();
    await expect(store.update(ID(9), join(ALICE))).resolves.toBeUndefined();
  });

  it('applies changes to one party one after the other, each on the result of the last', async () => {
    const raid = testRaid();
    const { store } = await partyStoreWith([raid]);
    await Promise.all([store.update(raid.id, join(ALICE)), store.update(raid.id, join(BOB))]);
    expect(Object.keys(store.get(raid.id)?.attendees ?? {})).toEqual(
      expect.arrayContaining([ALICE, BOB]),
    );
  });

  it('keeps the party as it was when the write fails, and says so', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    storage.failing = new Error('connection lost');
    await expect(store.update(raid.id, join(ALICE))).rejects.toThrow('connection lost');
    expect(store.get(raid.id)).toBe(raid);
    storage.failing = undefined;
    await expect(store.update(raid.id, join(ALICE))).resolves.toMatchObject({ ok: true });
  });

  it('drops a party whose row has vanished', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    storage.rows.delete(raid.id);
    await expect(store.update(raid.id, join(ALICE))).rejects.toThrow('no longer in the database');
    expect(store.get(raid.id)).toBeUndefined();
  });

  it('takes an ended party out of memory once it is written', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const result = await store.update(raid.id, (party) => ({ party: endParty(party) }));
    expect(result?.party).toMatchObject({ status: 'ended' });
    expect(storage.rows.get(raid.id)).toMatchObject({ status: 'ended' });
    expect(store.get(raid.id)).toBeUndefined();
    expect(store.active()).toEqual([]);
  });

  it('refuses a change that returns another party', async () => {
    const raid = testRaid();
    const { store } = await partyStoreWith([raid]);
    await expect(store.update(raid.id, () => ({ party: testRaid({ id: ID(2) }) }))).rejects.toThrow(
      'returned party',
    );
  });

  it('never lets the time of the last change go backwards', async () => {
    const raid = { ...testRaid(), updatedAt: PARTY_NOW + 10 * MINUTE };
    const { store } = await partyStoreWith([raid], () => PARTY_NOW);
    const result = await store.update(raid.id, join(ALICE));
    expect(result?.party?.updatedAt).toBe(PARTY_NOW + 10 * MINUTE);
  });

  it('lets one report at a time look at a gym', async () => {
    const { store } = await partyStoreWith();
    const order: string[] = [];
    const report = (name: string) =>
      store.withGymLock(1, async () => {
        const free = store.raidAt(1, 1, PARTY_NOW) === undefined;
        order.push(`${name}: ${free ? 'free' : 'taken'}`);
        if (free) await store.add(testRaid());
      });
    await Promise.all([report('first'), report('second')]);
    expect(order).toEqual(['first: free', 'second: taken']);
    expect(store.active()).toHaveLength(1);
  });

  it('refuses a post id that another party already has, and keeps the party as it was', async () => {
    const posted = { ...testRaid({ id: ID(1) }), forumPostId: '300000000000000001' };
    const other = testRaid({ id: ID(2), gymId: 2 });
    const { store, storage } = await partyStoreWith([posted, other]);
    await expect(
      store.update(other.id, (party) => ({
        party: { ...party, forumPostId: '300000000000000001' },
      })),
    ).rejects.toThrow('Duplicate entry');
    expect(store.get(other.id)).toBe(other);
    expect(storage.rows.get(other.id)).toBe(other);
  });

  it('is loaded once, at start', async () => {
    const { store, storage } = await partyStoreWith([testRaid()]);
    let reads = 0;
    const listActive = storage.listActive.bind(storage);
    storage.listActive = () => {
      reads += 1;
      return listActive();
    };
    await expect(store.load()).rejects.toThrow('Parties were already loaded');
    expect(reads).toBe(0);
    expect(store.active()).toHaveLength(1);
  });

  it('is not loaded when the read failed', async () => {
    const storage = new MemoryPartyStorage();
    storage.failing = new Error('connection lost');
    const { log } = createTestLogger();
    const store = new PartyStore({ storage, log });
    await expect(store.load()).rejects.toThrow('connection lost');
    expect(() => store.active()).toThrow('Parties have not been loaded yet');
    storage.failing = undefined;
    await expect(store.load()).resolves.toBeUndefined();
  });

  it('leaves memory and storage alone when a change throws, and runs the next one', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const failed = store.update(raid.id, () => {
      throw new Error('bad decision');
    });
    const next = store.update(raid.id, join(ALICE));
    await expect(failed).rejects.toThrow('bad decision');
    await expect(next).resolves.toMatchObject({ ok: true });
    expect(storage.writes).toHaveLength(1);
    expect(store.get(raid.id)?.attendees).toHaveProperty(ALICE);
  });

  it('lets an update straight after an add see the party', async () => {
    const { store } = await partyStoreWith();
    const raid = testRaid();
    const added = store.add(raid);
    const joined = store.update(raid.id, join(ALICE));
    await added;
    await expect(joined).resolves.toMatchObject({ ok: true });
    expect(store.get(raid.id)?.attendees).toHaveProperty(ALICE);
  });

  it('is idle once the writes in flight are done', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    let writing = true;
    const save = storage.save.bind(storage);
    storage.save = async (party) => {
      const saved = await save(party);
      writing = false;
      return saved;
    };
    const updated = store.update(raid.id, join(ALICE));
    const added = store.add(testRaid({ id: ID(2), gymId: 2 }));
    await store.whenIdle();
    expect(writing).toBe(false);
    expect(store.get(ID(2))).toBeDefined();
    await Promise.all([updated, added]);
    await expect(store.whenIdle()).resolves.toBeUndefined();
  });

  describe('onChange', () => {
    it('tells a listener of an added party and of every stored change, after memory has it', async () => {
      const { store } = await partyStoreWith([testRaid({ id: ID(1) })]);
      const seen: string[] = [];
      store.onChange((before, after) => {
        const members = (party: Party | undefined): string =>
          party ? `${party.status}[${Object.keys(party.attendees).join(',')}]` : 'none';
        // What the listener reads from the store is what it is told.
        const stored = store.get(after.id);
        seen.push(`${after.id.at(-1) ?? ''}: ${members(before)} -> ${members(after)}`);
        expect(stored).toBe(after.status === 'active' ? after : undefined);
      });
      await store.update(ID(1), join(ALICE));
      await store.add(testRaid({ id: ID(2), gymId: 2 }));
      await store.update(ID(1), (party) => ({ party: endParty(party) }));
      expect(seen).toEqual([
        `1: active[${REPORTER}] -> active[${REPORTER},${ALICE}]`,
        `2: none -> active[${REPORTER}]`,
        `1: active[${REPORTER},${ALICE}] -> ended[${REPORTER},${ALICE}]`,
      ]);
    });

    it('says nothing for a change that was refused, changed nothing or could not be written', async () => {
      const { store, storage } = await partyStoreWith([testRaid({ id: ID(1) })]);
      const seen: Party[] = [];
      store.onChange((_before, after) => seen.push(after));
      await store.update(ID(1), (party) => leaveParty(party, BOB));
      await store.update(ID(1), (party) => ({ party }));
      await store.update(ID(9), join(ALICE));
      storage.failing = new Error('the database is away');
      await expect(store.update(ID(1), join(ALICE))).rejects.toThrow('away');
      await expect(store.add(testRaid({ id: ID(2), gymId: 2 }))).rejects.toThrow('away');
      expect(seen).toEqual([]);
    });

    it('tells a listener who made a change and why a party ended, as the caller said (staff audit log)', async () => {
      const { store } = await partyStoreWith([
        testRaid({ id: ID(1) }),
        testRaid({ id: ID(3), gymId: 3 }),
      ]);
      const told: unknown[] = [];
      store.onChange((_before, after, cause) => told.push([after.id.at(-1), cause]));
      const alice = { id: ALICE, name: 'Alice' };
      await store.update(ID(1), join(ALICE), { by: alice });
      // An add is made by the party's maker, unless the caller says who (a move).
      await store.add({ ...testRaid({ id: ID(2), gymId: 2 }), makerName: 'Rep' });
      await store.add(testRaid({ id: ID(4), gymId: 4 }), { movedFrom: ID(3), by: alice });
      await store.update(ID(1), (party) => ({ party: endParty(party), ended: { how: 'clock' } }));
      await store.updateBoth(
        [ID(2), ID(3)],
        (a, b) => ({ parties: [a && join(BOB)(a).party, b && endParty(b)] as const }),
        { by: { id: BOB }, removal: 'delete' },
      );
      expect(told).toEqual([
        ['1', { by: alice }],
        ['2', { by: { id: REPORTER, name: 'Rep' } }],
        ['4', { by: alice, movedFrom: ID(3) }],
        ['1', { ended: { how: 'clock' } }],
        ['2', { by: { id: BOB }, removal: 'delete' }],
        ['3', { by: { id: BOB }, removal: 'delete' }],
      ]);
    });

    it('logs what a listener throws and goes on: the change is stored and the others are told', async () => {
      const { store, entries } = await partyStoreWith([testRaid({ id: ID(1) })]);
      const told: string[] = [];
      store.onChange(() => {
        throw new Error('the listener broke');
      });
      store.onChange((_before, after) => told.push(after.id));
      const result = await store.update(ID(1), join(ALICE));
      expect(result?.written).toBe(true);
      expect(Object.keys(store.get(ID(1))?.attendees ?? {})).toEqual([REPORTER, ALICE]);
      expect(told).toEqual([ID(1)]);
      expect(entries.at(-1)).toMatchObject({
        level: 50,
        msg: 'a listener of the parties failed',
        party: ID(1),
      });
    });
  });

  describe('a save that never settles', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('holds the party’s other changes only up to the limit, then refuses them, and goes on once it settles', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { store, storage, entries } = await partyStoreWith([testRaid({ id: ID(1) })]);
      const save = storage.save.bind(storage);
      let release: () => void = () => undefined;
      const answered = new Promise<void>((resolve) => {
        release = resolve;
      });
      storage.save = (party, note) =>
        party.id === ID(1) ? answered.then(() => save(party, note)) : save(party, note);
      const stuck = store.update(ID(1), join(ALICE));
      const waiting = store.update(ID(1), join(BOB)).catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(PARTY_LOCK_LIMIT_MS);
      await expect(waiting).resolves.toBeInstanceOf(LockOverdueError);
      expect(entries.filter((entry) => entry.level === 40)).toMatchObject([
        { msg: 'a change of a party has not settled in time', party: ID(1) },
      ]);
      // Another party is not held up.
      await store.add(testRaid({ id: ID(2), gymId: 2 }));
      await expect(store.update(ID(2), join(CAROL))).resolves.toMatchObject({ written: true });
      // Once the save answers, the party takes changes again; the refused one was never made.
      release();
      await expect(stuck).resolves.toMatchObject({ written: true });
      storage.save = save;
      await expect(store.update(ID(1), join(CAROL))).resolves.toMatchObject({ written: true });
      expect(Object.keys(store.get(ID(1))?.attendees ?? {})).toEqual([REPORTER, ALICE, CAROL]);
    });
  });

  describe('updateBoth', () => {
    const two = (): [RaidParty, RaidParty] => [
      testRaid({ id: ID(1) }),
      testRaid({ id: ID(2), gymId: 2 }),
    ];
    /** Counts the storage's calls of each kind. */
    function counted(storage: MemoryPartyStorage): { save: number; saveBoth: number } {
      const calls = { save: 0, saveBoth: 0 };
      const save = storage.save.bind(storage);
      const saveBoth = storage.saveBoth.bind(storage);
      storage.save = (party, note) => {
        calls.save += 1;
        return save(party, note);
      };
      storage.saveBoth = (writes) => {
        calls.saveBoth += 1;
        return saveBoth(writes);
      };
      return calls;
    }

    it('writes a change of two parties in one call of the storage, then has both in memory', async () => {
      const { store, storage } = await partyStoreWith(two(), () => PARTY_NOW + 5 * MINUTE);
      const calls = counted(storage);
      const result = await store.updateBoth([ID(2), ID(1)], (second, first) => ({
        parties: [second && join(BOB)(second).party, first && join(ALICE)(first).party] as const,
        said: 'both',
      }));
      expect(calls).toEqual({ save: 0, saveBoth: 1 });
      expect(result.written).toBe(true);
      expect(result.said).toBe('both');
      const [second, first] = result.parties;
      expect(second).toMatchObject({ id: ID(2), updatedAt: PARTY_NOW + 5 * MINUTE });
      expect(first?.attendees).toHaveProperty(ALICE);
      expect(store.get(ID(1))).toBe(first);
      expect(store.get(ID(2))).toBe(second);
      expect(storage.rows.get(ID(1))).toBe(first);
      expect(storage.rows.get(ID(2))).toBe(second);
    });

    it('writes neither when the write fails: both stay in memory as they were', async () => {
      const [one, other] = two();
      const { store, storage } = await partyStoreWith([one, other]);
      const told: string[] = [];
      store.onChange((_before, after) => told.push(after.id));
      storage.failing = new Error('connection lost');
      await expect(
        store.updateBoth([ID(1), ID(2)], (a, b) => ({
          parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
        })),
      ).rejects.toThrow('connection lost');
      expect(store.get(ID(1))).toBe(one);
      expect(store.get(ID(2))).toBe(other);
      expect(told).toEqual([]);
    });

    it('writes neither when both parties of the pair would have the same post', async () => {
      const [one, other] = two();
      const { store, storage } = await partyStoreWith([one, other]);
      const post = '300000000000000001';
      await expect(
        store.updateBoth([ID(1), ID(2)], (a, b) => ({
          parties: [a && { ...a, forumPostId: post }, b && { ...b, forumPostId: post }] as const,
        })),
      ).rejects.toThrow('Duplicate entry');
      expect(store.get(ID(1))).toBe(one);
      expect(store.get(ID(2))).toBe(other);
      expect(storage.rows.get(ID(1))).toBe(one);
      expect(storage.writes).toEqual([]);
    });

    it('drops a party whose row is gone and writes neither', async () => {
      const [one, other] = two();
      const { store, storage } = await partyStoreWith([one, other]);
      storage.rows.delete(ID(2));
      await expect(
        store.updateBoth([ID(1), ID(2)], (a, b) => ({
          parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
        })),
      ).rejects.toThrow(`Party ${ID(2)} is no longer in the database`);
      expect(store.get(ID(1))).toBe(one);
      expect(storage.rows.get(ID(1))).toBe(one);
      expect(store.get(ID(2))).toBeUndefined();
    });

    it('hands the change undefined for a party that is not active, and writes the other alone', async () => {
      const [one] = two();
      const { store, storage } = await partyStoreWith([one]);
      const calls = counted(storage);
      const seen: (Party | undefined)[] = [];
      const result = await store.updateBoth([ID(1), ID(9)], (a, b) => {
        seen.push(a, b);
        return { parties: [a && join(ALICE)(a).party, b] as const };
      });
      expect(seen).toEqual([one, undefined]);
      expect(result.written).toBe(true);
      expect(result.parties[1]).toBeUndefined();
      expect(store.get(ID(1))?.attendees).toHaveProperty(ALICE);
      expect(calls).toEqual({ save: 1, saveBoth: 0 });
      // A party for the one that is not active cannot be written.
      await expect(
        store.updateBoth([ID(1), ID(9)], () => ({
          parties: [undefined, testRaid({ id: ID(9) })] as const,
        })),
      ).rejects.toThrow(`Party ${ID(9)} is not active`);
    });

    it('writes nothing for a change that changed nothing, and refuses what update refuses', async () => {
      const [one, other] = two();
      const { store, storage } = await partyStoreWith([one, other]);
      await expect(
        store.updateBoth([ID(1), ID(2)], (a, b) => ({ parties: [a, b] })),
      ).resolves.toEqual({ parties: [one, other], written: false });
      await expect(store.updateBoth([ID(1), ID(2)], () => ({}))).resolves.toEqual({
        parties: [one, other],
        written: false,
      });
      await expect(
        store.updateBoth([ID(1), ID(2)], (a) => ({
          parties: [a && { ...a, id: ID(3) }, undefined],
        })),
      ).rejects.toThrow('returned party');
      const { timed, meetup } = testMeetup({ id: ID(2) });
      await expect(
        store.updateBoth([ID(1), ID(2)], (_a, b) => ({
          parties: [
            undefined,
            b && { ...b, type: 'meetup', gymId: null, hatchTime: null, timed, meetup },
          ] as [Party | undefined, Party | undefined],
        })),
      ).rejects.toThrow(`A change of raid ${ID(2)} returned a meetup`);
      await expect(store.updateBoth([ID(1), ID(1)], () => ({}))).rejects.toThrow('two parties');
      expect(storage.writes).toEqual([]);
    });

    it('takes both locks in one order: two pairs the other way round both finish', async () => {
      const { store } = await partyStoreWith(two());
      const pair = (ids: readonly [string, string], member: string) =>
        store.updateBoth(ids, (a, b) => ({
          parties: [a && join(member)(a).party, b && join(member)(b).party] as const,
        }));
      await Promise.all([pair([ID(1), ID(2)], ALICE), pair([ID(2), ID(1)], BOB)]);
      for (const id of [ID(1), ID(2)]) {
        expect(Object.keys(store.get(id)?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
      }
    });

    it('makes a change of either party wait for the pair, and the pair for one before it', async () => {
      const { store, storage } = await partyStoreWith(two());
      const before = store.update(ID(2), join(CAROL));
      const paired = store.updateBoth([ID(1), ID(2)], (a, b) => ({
        parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
      }));
      const after = store.update(ID(1), join(BOB));
      await Promise.all([before, paired, after]);
      expect(Object.keys(store.get(ID(1))?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
      expect(Object.keys(store.get(ID(2))?.attendees ?? {})).toEqual([REPORTER, CAROL, ALICE]);
      expect(storage.writes.map((party) => party.id)).toEqual([ID(2), ID(1), ID(2), ID(1)]);
    });

    it('tells the listeners once both are written and in memory', async () => {
      const { store } = await partyStoreWith(two());
      const seen: string[] = [];
      store.onChange((before, after) => {
        const other = store.get(after.id === ID(1) ? ID(2) : ID(1));
        seen.push(
          `${after.id.at(-1) ?? ''}: ${Object.keys(before?.attendees ?? {}).length} -> ` +
            `${Object.keys(after.attendees).length}, other ${Object.keys(other?.attendees ?? {}).length}`,
        );
      });
      await store.updateBoth([ID(1), ID(2)], (a, b) => ({
        parties: [a && join(ALICE)(a).party, b && join(ALICE)(b).party] as const,
      }));
      expect(seen).toEqual(['1: 1 -> 2, other 2', '2: 1 -> 2, other 2']);
    });

    it('notes each write for the history, and takes an ended party out of memory', async () => {
      const notes: unknown[] = [];
      const storage = new MemoryPartyStorage(two());
      const { log } = createTestLogger();
      const store = new PartyStore({
        storage,
        log,
        history: {
          noteOf: (write) => {
            notes.push({ party: write.after.id, before: write.before?.status, ended: write.ended });
            return undefined;
          },
        },
      });
      await store.load();
      await store.updateBoth([ID(1), ID(2)], (a, b) => ({
        parties: [a && join(ALICE)(a).party, b && endParty(b)] as const,
        ended: [undefined, { how: 'cancelled' }] as const,
      }));
      expect(notes).toEqual([
        { party: ID(1), before: 'active', ended: undefined },
        { party: ID(2), before: 'active', ended: { how: 'cancelled' } },
      ]);
      expect(store.get(ID(2))).toBeUndefined();
      expect(storage.rows.get(ID(2))).toMatchObject({ status: 'ended' });
    });

    it('prunes the groups nobody is in of both parties it writes', async () => {
      const grouped = (party: RaidParty): RaidParty =>
        withAttendees(
          { ...party, groups: [{ id: 'A' }, { id: 'B', opened: PARTY_NOW + MINUTE }] },
          { [ALICE]: { group: 'B' } },
        );
      const [one, other] = two();
      const { store } = await partyStoreWith([grouped(one), grouped(other)]);
      const result = await store.updateBoth([ID(1), ID(2)], (a, b) => ({
        parties: [a && leaveParty(a, REPORTER).party, b && leaveParty(b, REPORTER).party] as const,
      }));
      for (const party of result.parties)
        expect(party?.groups.map((group) => group.id)).toEqual(['B']);
      expect(store.get(ID(1))?.groups.map((group) => group.id)).toEqual(['B']);
    });
  });

  describe('addRaidUnlessTaken', () => {
    it('stores one raid when two reports of a gym come at the same moment', async () => {
      const { store, storage } = await partyStoreWith();
      const [first, second] = await Promise.all([
        store.addRaidUnlessTaken(testRaid({ id: ID(1) }), PARTY_NOW),
        store.addRaidUnlessTaken(testRaid({ id: ID(2) }), PARTY_NOW),
      ]);
      expect(first).toMatchObject({ added: true });
      expect(second).toMatchObject({ added: false, existing: { id: ID(1) } });
      expect(store.active().map((party) => party.id)).toEqual([ID(1)]);
      expect(storage.writes).toHaveLength(1);
    });

    // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind.
    it('stores no raid at a gym that has a raid of the other kind, and hands that one back', async () => {
      const elite = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
      const atStandard = await partyStoreWith([testRaid({ id: ID(1) })]);
      await expect(atStandard.store.addRaidUnlessTaken(elite, PARTY_NOW)).resolves.toMatchObject({
        added: false,
        existing: { id: ID(1) },
      });
      expect(atStandard.store.active()).toHaveLength(1);

      const atElite = await partyStoreWith([elite]);
      await expect(
        atElite.store.addRaidUnlessTaken(testRaid({ id: ID(1) }), PARTY_NOW),
      ).resolves.toMatchObject({ added: false, existing: { id: ID(2) } });
      expect(atElite.store.active()).toHaveLength(1);
    });

    // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
    it('adds a raid at a gym where only a raid of another server stands', async () => {
      const { store } = await partyStoreWith([testRaid({ id: ID(1), guildId: 2 })]);
      const here = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
      await expect(store.addRaidUnlessTaken(here, PARTY_NOW)).resolves.toEqual({
        added: true,
        party: here,
      });
      await expect(
        store.addRaidUnlessTaken(testRaid({ id: ID(3), guildId: 2 }), PARTY_NOW),
      ).resolves.toMatchObject({ added: false, existing: { id: ID(1) } });
    });

    it('adds a raid when the one at the gym has ended by the clock', async () => {
      const ended = setEndTime(
        testRaid({ id: ID(1) }),
        at('2026-10-13T14:40'),
        testRaidRules(),
        PARTY_NOW,
      );
      const { store } = await partyStoreWith([ended]);
      const later = testRaid({ id: ID(2) });
      await expect(store.addRaidUnlessTaken(later, at('2026-10-13T14:40'))).resolves.toMatchObject({
        added: true,
      });
      await expect(
        store.addRaidUnlessTaken(testRaid({ id: ID(3) }), at('2026-10-13T14:41')),
      ).resolves.toMatchObject({ added: false, existing: { id: ID(2) } });
    });

    it('stores nothing for a gym that is gone, which it asks under the lock of the gym', async () => {
      const { store, storage } = await partyStoreWith();
      // Whoever deletes a gym holds its lock until the gym is gone.
      let gone = false;
      let release: () => void = () => undefined;
      const deleting = store.withGymLock(
        1,
        () =>
          new Promise<void>((resolve) => {
            release = () => {
              gone = true;
              resolve();
            };
          }),
      );
      const asked: boolean[] = [];
      const adding = store.addRaidUnlessTaken(testRaid({ id: ID(1) }), PARTY_NOW, () => {
        asked.push(gone);
        return !gone;
      });
      await background.settle();
      // Not asked before the lock is free.
      expect(asked).toEqual([]);
      release();
      await deleting;
      await expect(adding).resolves.toEqual({ added: false, existing: undefined });
      expect(asked).toEqual([true]);
      expect(storage.writes).toEqual([]);
      expect(store.active()).toEqual([]);
      // A gym that is there is stored as ever.
      await expect(
        store.addRaidUnlessTaken(testRaid({ id: ID(2) }), PARTY_NOW, () => true),
      ).resolves.toMatchObject({ added: true });
    });

    it('refuses a raid without a gym', async () => {
      const { store, storage } = await partyStoreWith();
      const raid: RaidParty = { ...testRaid(), gymId: null };
      await expect(store.addRaidUnlessTaken(raid, PARTY_NOW)).rejects.toThrow('gym');
      expect(storage.writes).toEqual([]);
    });
  });
});
