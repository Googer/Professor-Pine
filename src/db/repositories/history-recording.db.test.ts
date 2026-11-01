import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_SERVER } from '../../../test/support/history.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  ALICE,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  TEST_PIN,
  TEST_SPOT,
  testMax,
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
  stops,
} from '../../../test/support/parties.js';
import type { TestDatabase } from '../../../test/support/mysql.js';
import {
  historyMembers,
  historyOfParty,
  partySteps,
  type HistoryNote,
  type HistoryNoteEnd,
} from '../../domain/history/party-history.js';
import { endParty, type Party, type TrainParty } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { splitOffGroup, splitSettled, splitTrain } from '../../domain/party/train.js';
import { createDb } from '../kysely.js';
import { DEADLOCK_TRIES } from '../transaction.js';
import type { DB } from '../types.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { PartyStore } from '../../services/party-store.js';
import { HistoryRepository } from './history-repository.js';
import { PartyRepository } from './party-repository.js';

const T = PARTY_NOW;
const MOVED = '00000000-0000-4000-8000-000000000009';
const SPLIT = '00000000-0000-4000-8000-00000000000a';
const PAIRED = '00000000-0000-4000-8000-00000000000b';
const POST = '900000000000000001';
const FORUM = '900000000000000002';

/** A record end, as the party history service makes it; `broken` throws while building it. */
function recordOf(after: Party, broken?: 'build' | 'insert'): HistoryNoteEnd {
  return {
    kind: 'record',
    members: (stored) => historyMembers(after, stored),
    build: (stored, optedIn) => {
      if (broken === 'build') throw new Error('the record could not be made');
      const record = historyOfParty(after, {
        end: { how: 'clock' },
        steps: stored,
        optedIn,
        describeBoss: () => ({ name: 'Somebody' }),
        shiny: null,
      });
      // A group id the table cannot hold: its insert fails after the party's row is written.
      return broken === 'insert'
        ? {
            ...record,
            groups: [
              {
                ...record.groups[0],
                groupId: 'AB',
                label: null,
                meetingTime: null,
                members: 0,
                heads: 0,
              },
            ],
          }
        : record;
    },
  };
}

/** The note of a write, as the service makes it (a record when it ended). */
function noteOf(before: Party | undefined, after: Party, end?: HistoryNoteEnd): HistoryNote {
  const steps = partySteps(before, after, after.updatedAt);
  if (after.status !== 'ended') return { partyId: after.id, guildId: after.guildId, steps };
  return { partyId: after.id, guildId: after.guildId, steps, end: end ?? recordOf(after) };
}

describe('the party history, written with the parties', () => {
  let stop: () => Promise<void>;
  let database: TestDatabase;
  let db: Kysely<DB>;
  let failures: { note: HistoryNote; err: unknown }[];
  let parties: PartyRepository;
  let history: HistoryRepository;
  const historyFailed = (note: HistoryNote, err: unknown) => {
    failures.push({ note, err });
  };

  beforeAll(async () => {
    ({ database, db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, ${HISTORY_SERVER})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Fountain'), (11, 'A'), (12, 'B')`.execute(db);
    parties = new PartyRepository(db, { historyFailed });
    history = new HistoryRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    failures = [];
    await db.deleteFrom('Party').execute();
    await db.deleteFrom('PartyHistory').execute();
    await db.deleteFrom('HistoryOptIn').execute();
    await db.deleteFrom('EndedPartyPost').execute();
  });

  const stepsOf = (partyId: string) =>
    db
      .selectFrom('PartyHistoryStep')
      .select(['kind', 'subject', 'value', 'at'])
      .where('partyId', '=', partyId)
      .orderBy('id')
      .execute();
  const kept = () => db.selectFrom('PartyHistory').selectAll().execute();
  const rowOf = (partyId: string) =>
    db.selectFrom('Party').select('status').where('id', '=', partyId).executeTakeFirst();
  const attendees = () =>
    db
      .selectFrom('PartyHistoryAttendee')
      .select(['seq', 'memberId', 'status', 'furthest', 'extras', 'joinedAt', 'doneAt'])
      .orderBy('seq')
      .execute();
  const optIn = (member: string) =>
    sql`insert into HistoryOptIn (serverId, memberId, createdAt)
        values (${HISTORY_SERVER}, ${member}, 0)`.execute(db);

  /** Writes a party's life one write after another, the first an insert, each a minute later. */
  async function live(writes: Party[], extra: { from?: string } = {}): Promise<Party> {
    let before: Party | undefined;
    for (const [n, party] of writes.entries()) {
      const after = { ...party, updatedAt: T + n * MINUTE };
      if (before === undefined) {
        const note = noteOf(undefined, after);
        const from = extra.from;
        const steps =
          from === undefined
            ? note.steps
            : [
                ...note.steps,
                {
                  partyId: after.id,
                  at: after.updatedAt,
                  kind: 'from' as const,
                  subject: from,
                  value: null,
                },
              ];
        await parties.insert(after, { ...note, steps });
      } else expect(await parties.save(after, noteOf(before, after))).toBe(true);
      before = after;
    }
    return before as Party;
  }
  const ending = (party: Party, at: number): Party => ({ ...endParty(party), updatedAt: at });

  it('records a max battle: its kind, tier and Power Spot, and no Wayspot for a pin (plan 8X-3)', async () => {
    const battle = { ...testMax(), forumChannelId: FORUM, forumPostId: POST };
    const ended = await live([
      battle,
      withAttendees(battle, { [ALICE]: { status: PartyStatus.Complete } }),
    ]);
    const last = ending(ended, T + 2 * MINUTE);
    expect(await parties.save(last, noteOf(ended, last))).toBe(true);
    const pinned = {
      ...testMax({ id: SPLIT, spot: TEST_PIN, tier: 'G' }),
      forumChannelId: FORUM,
      forumPostId: '900000000000000003',
    };
    const over = await live([pinned]);
    const gone = ending(over, T + MINUTE);
    expect(await parties.save(gone, noteOf(over, gone))).toBe(true);
    const rows = await db
      .selectFrom('PartyHistory')
      .select(['partyId', 'kind', 'tier', 'gymId', 'wayspotId', 'bossName', 'ending', 'endTime'])
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      {
        partyId: battle.id,
        kind: 'max',
        tier: 'D2',
        gymId: null,
        wayspotId: TEST_SPOT.id,
        bossName: 'Somebody',
        ending: 'completed',
        endTime: String(battle.endTime),
      },
      {
        partyId: SPLIT,
        kind: 'max',
        tier: 'G',
        gymId: null,
        wayspotId: null,
        bossName: 'Somebody',
        ending: 'expired',
        endTime: String(pinned.endTime),
      },
    ]);
  });

  it('makes the steps of a party its record when it ends, then deletes its row', async () => {
    await optIn(ALICE);
    const raid = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
    const ended = await live([
      raid,
      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming, number: 3 } }),
      withAttendees(raid, { [ALICE]: { status: PartyStatus.Complete, number: 3 } }),
    ]);
    expect(await stepsOf(raid.id)).toEqual([
      { kind: 'status', subject: REPORTER, value: '0', at: String(T) },
      { kind: 'status', subject: ALICE, value: '1', at: String(T + MINUTE) },
      { kind: 'status', subject: ALICE, value: '4', at: String(T + 2 * MINUTE) },
    ]);
    expect(await kept()).toEqual([]);

    const last = ending(ended, T + 3 * MINUTE);
    expect(await parties.save(last, noteOf(ended, last))).toBe(true);
    expect(await stepsOf(raid.id)).toEqual([]);
    expect(await kept()).toEqual([
      expect.objectContaining({
        source: 'live',
        partyId: raid.id,
        kind: 'raid',
        serverId: HISTORY_SERVER,
        regionId: 1,
        gymId: 1,
        tier: 'T5',
        createdAt: String(T),
        endedAt: String(T + 3 * MINUTE),
        ending: 'completed',
        createdById: null,
        attendees: 2,
        interested: 1,
        done: 1,
        doneHeads: 3,
        extras: 2,
      }),
    ]);
    expect(await attendees()).toEqual([
      {
        seq: 0,
        memberId: null,
        status: 'interested',
        furthest: 'interested',
        extras: 0,
        joinedAt: null,
        doneAt: null,
      },
      {
        seq: 1,
        memberId: ALICE,
        status: 'done',
        furthest: 'done',
        extras: 2,
        joinedAt: String(T + MINUTE),
        doneAt: String(T + 2 * MINUTE),
      },
    ]);
    // Its row is gone; what the archiving of reopened posts needs is kept, without a member.
    expect(await rowOf(raid.id)).toBeUndefined();
    expect(await parties.endedPosts([POST])).toEqual([POST]);
    expect(await parties.partyForums(1)).toEqual([{ forumChannelId: FORUM, guildId: 1 }]);
    expect(failures).toEqual([]);
  });

  it('leaves no id of a member who did not opt in anywhere once a party is recorded', async () => {
    await optIn(ALICE);
    const raid = testRaid();
    const ended = await live([
      raid,
      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming } }),
      withAttendees(raid, { [ALICE]: { status: PartyStatus.Coming }, [BOB]: {} }),
      withAttendees(raid, { [ALICE]: { status: PartyStatus.Complete } }),
    ]);
    await parties.save(ending(ended, T + 5 * MINUTE), noteOf(ended, ending(ended, T + 5 * MINUTE)));
    // A meetup whose own words name Bob, in its name, its description and a group's label.
    const meetup = testMeetup({ name: `Picnic with <@${BOB}>` });
    const told = await live([
      {
        ...meetup,
        meetup: { description: `Ask ${BOB} first`, place: null },
        groups: [{ id: 'A', label: `Ride with <@!${BOB}>` }],
      },
    ]);
    await parties.save(ending(told, T + 6 * MINUTE), noteOf(told, ending(told, T + 6 * MINUTE)));
    const everything = JSON.stringify(
      await Promise.all(
        [
          'Party',
          'PartyHistoryStep',
          'PartyHistory',
          'PartyHistoryAttendee',
          'PartyHistoryGroup',
          'PartyHistoryStop',
          'EndedPartyPost',
        ].map(async (table) => (await sql`select * from ${sql.table(table)}`.execute(db)).rows),
      ),
    );
    expect(everything).not.toContain(REPORTER);
    expect(everything).not.toContain(BOB);
    expect(everything).toContain(ALICE);
  });

  it('never takes along a party it went on from that is still going on', async () => {
    // The move failed (the old raid stayed): the new party's record leaves it alone.
    const old = testRaid();
    await live([old, withAttendees(old, { [ALICE]: {} })]);
    const moved = await live([{ ...testRaid(), id: MOVED }], { from: old.id });
    await parties.save(ending(moved, T + 5 * MINUTE), noteOf(moved, ending(moved, T + 5 * MINUTE)));
    expect((await kept()).map((row) => row.partyId)).toEqual([MOVED]);
    expect(await rowOf(old.id)).toEqual({ status: 'active' });
    expect((await stepsOf(old.id)).map((step) => step.subject)).toEqual([REPORTER, ALICE]);
    expect(await attendees()).toHaveLength(1);
  });

  it('keeps a Power Spot a train stopped at by its Wayfarer id, and its step (plan 8X-4)', async () => {
    const made = testTrain();
    const on = (stop: number): Party => ({
      ...made,
      train: { ...made.train, route: stops(11, TEST_SPOT.id), stop },
    });
    const ended = await live([made, on(0), on(1), on(2)]);
    expect((await stepsOf(made.id)).filter((step) => step.kind === 'spot')).toEqual([
      { kind: 'spot', subject: TEST_SPOT.id, value: null, at: String(T + 2 * MINUTE) },
    ]);
    await parties.save(ending(ended, T + 4 * MINUTE), noteOf(ended, ending(ended, T + 4 * MINUTE)));
    expect(
      await db
        .selectFrom('PartyHistoryStop')
        .select(['seq', 'gymId', 'wayspotId', 'arrivedAt', 'leftAt'])
        .orderBy('seq')
        .execute(),
    ).toEqual([
      {
        seq: 0,
        gymId: 11,
        wayspotId: null,
        arrivedAt: String(T + MINUTE),
        leftAt: String(T + 2 * MINUTE),
      },
      {
        seq: 1,
        gymId: null,
        wayspotId: TEST_SPOT.id,
        arrivedAt: String(T + 2 * MINUTE),
        leftAt: String(T + 3 * MINUTE),
      },
    ]);
  });

  it('keeps the stops and groups of a train', async () => {
    const made = testTrain();
    const on = (stop: number): Party => ({
      ...made,
      train: { ...made.train, route: stops(11, 12), stop },
    });
    const ended = await live([made, on(0), on(1), on(2)]);
    await parties.save(ending(ended, T + 4 * MINUTE), noteOf(ended, ending(ended, T + 4 * MINUTE)));
    expect(
      await db
        .selectFrom('PartyHistoryStop')
        .select(['seq', 'gymId', 'arrivedAt', 'leftAt'])
        .orderBy('seq')
        .execute(),
    ).toEqual([
      { seq: 0, gymId: 11, arrivedAt: String(T + MINUTE), leftAt: String(T + 2 * MINUTE) },
      { seq: 1, gymId: 12, arrivedAt: String(T + 2 * MINUTE), leftAt: String(T + 3 * MINUTE) },
    ]);
    expect(await db.selectFrom('PartyHistoryGroup').selectAll().execute()).toEqual([
      expect.objectContaining({ groupId: 'A', members: 1, heads: 1 }),
    ]);
    expect(await kept()).toEqual([
      expect.objectContaining({
        kind: 'train',
        name: 'Saturday legendaries',
        routeStops: 2,
        trainKind: 'raid',
      }),
    ]);
  });

  it('records each train of a split on its own, the new one naming the old (plan 8T)', async () => {
    await optIn(ALICE);
    const made = withAttendees(testTrain(), {
      [ALICE]: { group: 'B', status: PartyStatus.Present },
    });
    const before: TrainParty = {
      ...made,
      forumChannelId: FORUM,
      forumPostId: POST,
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
      defaultGroupId: 'B',
      train: { ...made.train, route: stops(11, 12), stop: 0 },
    };
    const link = { partyId: SPLIT, postId: '900000000000000003' };
    const split = splitOffGroup(before, ALICE, false, 'B', link);
    if (!split.ok) throw new Error(split.reason);
    const first = await live([before]);
    // The new train: made with its post in the same forum a moment before the split, and
    // pending until the write that settles it, at the split.
    const fresh = {
      ...splitTrain(before, {
        id: SPLIT,
        by: ALICE,
        anonymous: false,
        group: 'B',
        now: T + MINUTE / 2,
      }),
      forumChannelId: FORUM,
      forumPostId: link.postId,
    };
    await parties.insert(fresh, noteOf(undefined, fresh));
    // The split's one write: the old train without the group, the new one settled.
    const old = { ...split.party, updatedAt: T + MINUTE };
    const settled = { ...splitSettled(fresh), updatedAt: T + MINUTE };
    expect(
      await parties.saveBoth([
        { party: old, note: noteOf(first, old) },
        { party: settled, note: noteOf(fresh, settled) },
      ]),
    ).toEqual([true, true]);
    await parties.save(ending(old, T + 5 * MINUTE), noteOf(old, ending(old, T + 5 * MINUTE)));
    const over = ending(settled, T + 9 * MINUTE);
    await parties.save(over, noteOf(settled, over));
    const records = await db
      .selectFrom('PartyHistory')
      .select(['id', 'partyId', 'splitFromId', 'attendees', 'here', 'departed', 'createdAt'])
      .orderBy('id')
      .execute();
    expect(records).toEqual([
      expect.objectContaining({
        partyId: before.id,
        splitFromId: null,
        attendees: 2,
        here: 1,
        departed: 0,
      }),
      expect.objectContaining({
        partyId: SPLIT,
        splitFromId: before.id,
        attendees: 1,
        here: 1,
        departed: 0,
        createdAt: String(T + MINUTE),
      }),
    ]);
    // Alice on the old train: there until the split, at its first stop; on the new from then.
    expect(
      await db
        .selectFrom('PartyHistoryAttendee')
        .select(['historyId', 'memberId', 'status', 'hereAt', 'leftAt', 'signedUpAt', 'splitOff'])
        .where('memberId', '=', ALICE)
        .orderBy('historyId')
        .execute(),
    ).toEqual([
      {
        historyId: records[0]?.id,
        memberId: ALICE,
        status: null,
        hereAt: String(T),
        leftAt: String(T + MINUTE),
        signedUpAt: String(T),
        splitOff: 1,
      },
      {
        historyId: records[1]?.id,
        memberId: ALICE,
        status: 'here',
        hereAt: String(T + MINUTE),
        leftAt: null,
        signedUpAt: String(T + MINUTE),
        splitOff: 0,
      },
    ]);
    // Both rows are gone, and nothing is left behind of either.
    expect(await rowOf(before.id)).toBeUndefined();
    expect(await rowOf(SPLIT)).toBeUndefined();
  });

  it('records a party once, whatever is written again, and drops a late step', async () => {
    const raid = testRaid();
    const ended = await live([raid]);
    const last = ending(ended, T + MINUTE);
    const note = noteOf(ended, last);
    await parties.save(last, note);
    await history.write(note, { retry: true });
    await history.write(note);
    expect(await kept()).toHaveLength(1);
    expect(await attendees()).toHaveLength(1);
    await history.write(noteOf(raid, withAttendees(raid, { [BOB]: {} })), { retry: true });
    expect(await stepsOf(raid.id)).toEqual([]);
  });

  it('records a raid that moved once, as the party it went on as, with the steps of both', async () => {
    const old = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
    const before = await live([old, withAttendees(old, { [ALICE]: {} })]);
    const moved = await live([{ ...testRaid(), id: MOVED }], { from: old.id });
    const left = ending(before, T + 2 * MINUTE);
    await parties.save(left, noteOf(before, left, { kind: 'move', to: MOVED }));
    expect(await kept()).toEqual([]);
    // Left to the new party: the sweep records no such party by itself.
    expect(await history.unrecorded()).toEqual([{ partyId: old.id, movedTo: MOVED }]);
    // A late step of the old party is no step any more.
    await history.write(noteOf(before, withAttendees(before, { [BOB]: {} })), { retry: true });
    expect((await stepsOf(old.id)).map((step) => step.subject)).toEqual([REPORTER, ALICE]);

    await parties.save(ending(moved, T + 9 * MINUTE), noteOf(moved, ending(moved, T + 9 * MINUTE)));
    expect(await kept()).toEqual([expect.objectContaining({ partyId: MOVED })]);
    // Who signed up before the move did so when they did.
    expect((await attendees()).map((row) => row.joinedAt)).toEqual([null, String(T + MINUTE)]);
    expect(await rowOf(old.id)).toBeUndefined();
    expect(await rowOf(MOVED)).toBeUndefined();
    expect(await stepsOf(old.id)).toEqual([]);
    expect(await parties.endedPosts([POST])).toEqual([POST]);
    expect(await history.unrecorded()).toEqual([]);
  });

  it('knows where a raid moved also when only the end of the old one said so', async () => {
    const old = testRaid();
    const before = await live([old]);
    await live([{ ...testRaid(), id: MOVED }]);
    const left = ending(before, T + 2 * MINUTE);
    await parties.save(left, noteOf(before, left, { kind: 'move', to: MOVED }));
    expect(await history.unrecorded()).toEqual([{ partyId: old.id, movedTo: MOVED }]);
  });

  it('drops a party that never was one: its steps and row go, nothing is recorded', async () => {
    const ended = await live([testRaid()]);
    await parties.save(
      ending(ended, T + MINUTE),
      noteOf(ended, ending(ended, T + MINUTE), { kind: 'drop' }),
    );
    expect(await kept()).toEqual([]);
    expect(await rowOf(ended.id)).toBeUndefined();
    expect(await history.unrecorded()).toEqual([]);
  });

  it('ends the party although its record cannot be made, and says so after', async () => {
    const ended = await live([testRaid()]);
    const last = ending(ended, T + MINUTE);
    const note = noteOf(ended, last, recordOf(last, 'build'));
    expect(await parties.save(last, note)).toBe(true);
    expect(await parties.findById(last.id)).toEqual({ ok: true, party: last });
    expect(await kept()).toEqual([]);
    // Its steps and its row stay for a later try, or the sweep at start.
    expect(await stepsOf(last.id)).toHaveLength(1);
    expect(await history.unrecorded()).toEqual([{ partyId: last.id, movedTo: null }]);
    expect(failures).toEqual([{ note, err: new Error('the record could not be made') }]);
  });

  it('undoes what the record wrote before it failed, and keeps the end', async () => {
    const ended = await live([testRaid()]);
    const last = ending(ended, T + MINUTE);
    await parties.save(last, noteOf(ended, last, recordOf(last, 'insert')));
    expect(await kept()).toEqual([]);
    expect(await rowOf(last.id)).toEqual({ status: 'ended' });
    expect(failures).toHaveLength(1);
  });

  it('ends the party alone when the record took its whole transaction with it', async () => {
    const killing = new PartyRepository(db, {
      historyFailed,
      // A deadlock: MySQL rolls the whole transaction back, the savepoint with it.
      history: (on) => ({
        write: async () => {
          await sql`rollback`.execute(on);
          throw new Error('Deadlock found when trying to get lock');
        },
      }),
    });
    const ended = await live([testRaid()]);
    const last = ending(ended, T + MINUTE);
    expect(await killing.save(last, noteOf(ended, last))).toBe(true);
    expect(await rowOf(last.id)).toEqual({ status: 'ended' });
    expect(failures.map((failure) => String(failure.err))).toEqual([
      'Error: Deadlock found when trying to get lock',
    ]);
  });

  // A deadlock is made here in the record, where a test can put it; one on the party's own row
  // takes the same way (`retryOnDeadlock` around the whole transaction) but is not made by a test.
  it('runs the end of a party again when MySQL chose its transaction as a deadlock victim', async () => {
    let tries = 0;
    const once = new PartyRepository(db, {
      historyFailed,
      // The first try deadlocks: MySQL rolls the whole transaction back; the next one works.
      history: (on) => ({
        write: async (note) => {
          tries++;
          if (tries > 1) return new HistoryRepository(on).write(note);
          await sql`rollback`.execute(on);
          throw deadlock();
        },
      }),
    });
    const ended = await live([testRaid()]);
    const last = ending(ended, T + MINUTE);
    expect(await once.save(last, noteOf(ended, last))).toBe(true);
    // The record is written with the end after all, and nothing is handed over.
    expect((await kept()).map((row) => row.partyId)).toEqual([last.id]);
    expect(await rowOf(last.id)).toBeUndefined();
    expect(failures).toEqual([]);
  });

  it('ends the party alone when every try deadlocked', async () => {
    let tries = 0;
    const always = new PartyRepository(db, {
      historyFailed,
      history: (on) => ({
        write: async () => {
          tries++;
          await sql`rollback`.execute(on);
          throw deadlock();
        },
      }),
    });
    const ended = await live([testRaid()]);
    const last = ending(ended, T + MINUTE);
    const note = noteOf(ended, last);
    expect(await always.save(last, note)).toBe(true);
    expect(tries).toBe(DEADLOCK_TRIES);
    expect(await rowOf(last.id)).toEqual({ status: 'ended' });
    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
      [note, 'Error: Deadlock found when trying to get lock'],
    ]);
  });

  /** Two raids that have been written once; the second is joined by Alice in the pair. */
  async function pair(): Promise<[Party, Party]> {
    const one = await live([testRaid()]);
    const two = await live([{ ...testRaid(), id: PAIRED, gymId: 11 }]);
    return [one, two];
  }
  const joined = (party: Party, at: number): Party => ({
    ...withAttendees(party, { [ALICE]: {} }),
    updatedAt: at,
  });

  it('writes the notes of two parties saved together: the end in the transaction, steps after it', async () => {
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const next = joined(two, T + MINUTE);
    expect(
      await parties.saveBoth([
        { party: last, note: noteOf(one, last) },
        { party: next, note: noteOf(two, next) },
      ]),
    ).toEqual([true, true]);
    expect((await kept()).map((row) => row.partyId)).toEqual([one.id]);
    expect(await rowOf(one.id)).toBeUndefined();
    expect((await stepsOf(PAIRED)).map((step) => step.subject)).toEqual([REPORTER, ALICE]);
    expect(await parties.findById(PAIRED)).toEqual({ ok: true, party: next });
    expect(failures).toEqual([]);
  });

  it('ends both parties saved together although a record cannot be made, and says so after', async () => {
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const over = ending(two, T + MINUTE);
    const broken = noteOf(one, last, recordOf(last, 'insert'));
    await parties.saveBoth([
      { party: last, note: broken },
      { party: over, note: noteOf(two, over) },
    ]);
    // The first record is undone alone; the second is written, in the same transaction.
    expect((await kept()).map((row) => row.partyId)).toEqual([PAIRED]);
    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
    expect(await rowOf(PAIRED)).toBeUndefined();
    expect(failures.map((failure) => failure.note)).toEqual([broken]);
  });

  it('writes both parties alone when a record took the whole transaction with it', async () => {
    const killing = new PartyRepository(db, {
      historyFailed,
      // A deadlock: MySQL rolls the whole transaction back, the savepoint with it.
      history: (on) => ({
        write: async () => {
          await sql`rollback`.execute(on);
          throw new Error('Deadlock found when trying to get lock');
        },
      }),
    });
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const next = joined(two, T + MINUTE);
    const ended = noteOf(one, last);
    const steps = noteOf(two, next);
    expect(
      await killing.saveBoth([
        { party: last, note: ended },
        { party: next, note: steps },
      ]),
    ).toEqual([true, true]);
    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
    expect(await parties.findById(PAIRED)).toEqual({ ok: true, party: next });
    // The end and the steps are both handed over, to be tried again.
    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
      [ended, 'Error: Deadlock found when trying to get lock'],
      [steps, 'Error: Deadlock found when trying to get lock'],
    ]);
  });

  /** MySQL's deadlock as the driver throws it (`isDeadlock`: errno 1213). */
  const deadlock = (): Error =>
    Object.assign(new Error('Deadlock found when trying to get lock'), { errno: 1213 });

  it('runs the transaction of two parties again when MySQL chose it as a deadlock victim', async () => {
    let tries = 0;
    const once = new PartyRepository(db, {
      historyFailed,
      // The first try deadlocks: MySQL rolls the whole transaction back; the next one works.
      history: (on) => ({
        write: async (note) => {
          tries++;
          if (tries > 1) return new HistoryRepository(on).write(note);
          await sql`rollback`.execute(on);
          throw deadlock();
        },
      }),
    });
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const over = ending(two, T + MINUTE);
    const broken = noteOf(one, last, recordOf(last, 'build'));
    expect(
      await once.saveBoth([
        { party: last, note: broken },
        { party: over, note: noteOf(two, over) },
      ]),
    ).toEqual([true, true]);
    // Both ends in one transaction after all: the second record written, the first failed alone
    // (once: what the deadlocked try had collected is not handed over).
    expect((await kept()).map((row) => row.partyId)).toEqual([PAIRED]);
    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
    expect(await rowOf(PAIRED)).toBeUndefined();
    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
      [broken, 'Error: the record could not be made'],
    ]);
  });

  it('writes both parties alone when every try deadlocked', async () => {
    let tries = 0;
    const always = new PartyRepository(db, {
      historyFailed,
      history: (on) => ({
        write: async () => {
          tries++;
          await sql`rollback`.execute(on);
          throw deadlock();
        },
      }),
    });
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const ended = noteOf(one, last);
    expect(
      await always.saveBoth([
        { party: last, note: ended },
        { party: joined(two, T + MINUTE), note: undefined },
      ]),
    ).toEqual([true, true]);
    expect(tries).toBe(DEADLOCK_TRIES);
    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
      [ended, 'Error: Deadlock found when trying to get lock'],
    ]);
  });

  it('hands over each end with its own error when a later record took the transaction with it', async () => {
    const killing = new PartyRepository(db, {
      historyFailed,
      // The second party's record deadlocks; the first's is written as ever (and fails here).
      history: (on) => ({
        write: async (note) => {
          if (note.partyId !== PAIRED) return new HistoryRepository(on).write(note);
          await sql`rollback`.execute(on);
          throw new Error('Deadlock found when trying to get lock');
        },
      }),
    });
    const [one, two] = await pair();
    const last = ending(one, T + MINUTE);
    const over = ending(two, T + MINUTE);
    const broken = noteOf(one, last, recordOf(last, 'build'));
    const killed = noteOf(two, over);
    expect(
      await killing.saveBoth([
        { party: last, note: broken },
        { party: over, note: killed },
      ]),
    ).toEqual([true, true]);
    expect(await rowOf(one.id)).toEqual({ status: 'ended' });
    expect(await rowOf(PAIRED)).toEqual({ status: 'ended' });
    expect(failures.map((failure) => [failure.note, String(failure.err)])).toEqual([
      [broken, 'Error: the record could not be made'],
      [killed, 'Error: Deadlock found when trying to get lock'],
    ]);
  });

  it('writes no note of two parties that were not saved because a row was gone', async () => {
    const [one] = await pair();
    const last = ending(one, T + MINUTE);
    const stray = { ...testRaid(), id: SPLIT };
    expect(
      await parties.saveBoth([
        { party: last, note: noteOf(one, last) },
        { party: stray, note: noteOf(undefined, stray) },
      ]),
    ).toEqual([true, false]);
    expect(await kept()).toEqual([]);
    expect(await rowOf(one.id)).toEqual({ status: 'active' });
    expect(await stepsOf(SPLIT)).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('names nobody who opted out while the party ended (the opt-ins are read under a lock)', async () => {
    await optIn(ALICE);
    const raid = testRaid();
    const ended = await live([raid, withAttendees(raid, { [ALICE]: {} })]);
    const other = createDb<DB>(database.config);
    try {
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let deleted = (): void => undefined;
      const isDeleted = new Promise<void>((resolve) => {
        deleted = resolve;
      });
      const optingOut = other.transaction().execute(async (trx) => {
        await trx.deleteFrom('HistoryOptIn').where('memberId', '=', ALICE).execute();
        deleted();
        await held;
      });
      await isDeleted;
      const last = ending(ended, T + 2 * MINUTE);
      const saving = parties.save(last, noteOf(ended, last));
      // eslint-disable-next-line no-restricted-syntax -- a real MySQL: nothing tells when the statement waits for the lock
      await new Promise((resolve) => setTimeout(resolve, 300));
      // The record waits for the opt-out's lock; if not, the timing did not hold and the test
      // would prove nothing. Of this database's sessions alone: the server is shared.
      const waits = await sql<{ waits: number | string }>`
        select count(*) as waits
        from information_schema.innodb_trx t
        join information_schema.processlist p on p.id = t.trx_mysql_thread_id
        where t.trx_state = 'LOCK WAIT' and p.user = substring_index(current_user(), '@', 1)`.execute(
        db,
      );
      expect(Number(waits.rows[0]?.waits)).toBe(1);
      release();
      await optingOut;
      await saving;
    } finally {
      await other.destroy();
    }
    expect((await attendees()).map((row) => row.memberId)).toEqual([null, null]);
  });

  it('keeps the write of a party whose steps cannot be written, and says so', async () => {
    const raid = testRaid();
    const note: HistoryNote = {
      partyId: raid.id,
      guildId: 1,
      steps: [{ partyId: raid.id, at: T, kind: 'status', subject: 'x'.repeat(40), value: 0 }],
    };
    await parties.insert(raid, note);
    expect(await parties.findById(raid.id)).toEqual({ ok: true, party: raid });
    expect(failures.map((failure) => failure.note)).toEqual([note]);
    expect(failures[0]?.err).toBeInstanceOf(Error);
  });

  it('writes a party without a note as before', async () => {
    const raid = testRaid();
    await parties.insert(raid);
    expect(await stepsOf(raid.id)).toEqual([]);
  });

  it('keeps a meeting time with the group that had it, not with a group of its letter opened after it was pruned', async () => {
    // Plan 8X-1B, through the store, which prunes a group nobody is in.
    let now = T;
    const { log } = createTestLogger();
    const store = new PartyStore({
      storage: parties,
      log,
      now: () => now,
      history: { noteOf: (write) => noteOf(write.before, write.after) },
    });
    await store.load();
    const raid = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
    await store.add(raid);
    const step = async (change: (party: Party) => Party) => {
      now += MINUTE;
      await store.update(raid.id, (party) => ({ party: change(party) }));
    };
    const withGroups = (party: Party, groups: Party['groups']): Party => ({ ...party, groups });
    // Bob opens B and sets its meeting time; the clock clears it; Bob leaves and B goes.
    await step((party) =>
      withAttendees(withGroups(party, [{ id: 'A' }, { id: 'B', opened: now }]), {
        [BOB]: { group: 'B' },
      }),
    );
    await step((party) =>
      withGroups(party, [
        party.groups[0] ?? { id: 'A' },
        { id: 'B', opened: T + MINUTE, startTime: T + 30 * MINUTE },
      ]),
    );
    await step((party) =>
      withGroups(party, [party.groups[0] ?? { id: 'A' }, { id: 'B', opened: T + MINUTE }]),
    );
    await step((party) => {
      const { [BOB]: _bob, ...rest } = party.attendees;
      return { ...party, attendees: rest };
    });
    expect(store.get(raid.id)?.groups.map((group) => group.id)).toEqual(['A']);
    // Alice opens a new B, and the raid ends.
    await step((party) =>
      withAttendees(withGroups(party, [...party.groups, { id: 'B', opened: now }]), {
        [ALICE]: { group: 'B' },
      }),
    );
    now += MINUTE;
    await store.update(raid.id, (party) => ({ party: endParty(party), ended: { how: 'clock' } }));
    const groups = await db
      .selectFrom('PartyHistoryGroup')
      .select(['groupId', 'meetingTime', 'members'])
      .orderBy('groupId')
      .execute();
    expect(groups).toEqual([
      { groupId: 'A', meetingTime: null, members: 1 },
      { groupId: 'B', meetingTime: null, members: 1 },
    ]);
  });
});
