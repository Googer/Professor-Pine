import { describe, expect, it } from 'vitest';
import { ALICE, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
import { TEST_GUILD_ROW, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { endParty, isTrain } from '../domain/party/party.js';
import { splitOffGroup } from '../domain/party/train.js';
import { HISTORY_SERVER } from '../../test/support/history.js';
import { REGION_STAFF, regionAdminWith } from '../../test/support/region-admin.js';
import { gymsFixture } from '../../test/support/providers.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedMax,
  reportedRaid,
} from '../../test/support/party-service.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { NO_MAX_BOSSES } from '../../test/support/test-context.js';
import type { MaxBoss } from '../domain/pogo/max-bosses.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import { watchEachTest } from '../../test/support/timers.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

watchEachTest();

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(
  made: Pick<Made, 'clock' | 'scheduler' | 'attendance' | 'service'>,
  time: number,
) {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

/** Lets the clock end the party from `after` on: the warning first, then its end (some ticks). */
async function endedByClock(
  made: Pick<Made, 'clock' | 'scheduler' | 'attendance' | 'service' | 'store'> & {
    party: { id: string };
  },
  after: number,
) {
  for (let n = 0; n < 10 && made.store.get(made.party.id); n++) {
    await tickAt(made, after + n * 30 * MINUTE);
  }
}

describe('the party history of live parties', () => {
  it('records a raid the clock ended, naming only who opted in', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { hatch: HATCH } });
    made.history.optIn(1, ALICE);
    made.clock.now = HATCH + MINUTE;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
    made.clock.now = HATCH + 5 * MINUTE;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Interested);
    made.clock.now = HATCH + 20 * MINUTE;
    await made.attendance.done(made.party.id, alice);
    await endedByClock(made, END + 6 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();

    expect(made.history.records).toHaveLength(1);
    const [record] = made.history.records;
    expect(record).toMatchObject({
      source: 'live',
      partyId: made.party.id,
      kind: 'raid',
      serverId: HISTORY_SERVER,
      gymId: 1,
      tier: 'T5',
      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
      hatchTime: HATCH,
      endTime: END,
      ending: 'completed',
      createdById: null,
    });
    expect(record?.attendees).toEqual([
      expect.objectContaining({
        memberId: null,
        status: 'interested',
        signedUpAt: made.party.createdAt,
      }),
      expect.objectContaining({
        memberId: ALICE,
        status: 'done',
        extras: 1,
        joinedAt: HATCH + MINUTE,
        hereAt: HATCH + 5 * MINUTE,
        doneAt: HATCH + 20 * MINUTE,
      }),
      expect.objectContaining({ memberId: null, status: 'interested' }),
    ]);
    // Nothing of the party is left to become history twice.
    expect(made.history.steps).toEqual([]);
  });

  it('names the member who reported it once they opted in, and nobody before', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.history.optIn(1, REPORTER);
    await endedByClock(made, END + 6 * MINUTE);
    expect(made.history.records[0]).toMatchObject({
      createdById: REPORTER,
      ending: 'expired',
      attendees: [expect.objectContaining({ memberId: REPORTER })],
    });
  });

  it('records a party that somebody closed as cancelled', async () => {
    const made = await reportedRaid();
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.history.records.map((record) => record.ending)).toEqual(['cancelled']);
  });

  it('records a party whose post somebody deleted as cancelled', async () => {
    const made = await reportedRaid();
    made.gateway.gone.add(made.postId);
    // The next render finds it gone.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.history.records.map((record) => record.ending)).toEqual(['cancelled']);
  });

  it('records nothing of a raid that never got its post', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('createPost', new Error('no post today'));
    const gym = gymsFixture().stored(2);
    if (!gym) throw new Error('no gym 2');
    await expect(
      made.service.reportRaid({
        gym,
        guildRow: TEST_GUILD_ROW,
        reporterId: ALICE,
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: { level: 'T3', shadow: false },
        boss: null,
      }),
    ).rejects.toThrow('no post today');
    expect(made.history.records).toEqual([]);
    expect(made.history.steps.filter((step) => step.subject === ALICE)).toEqual([]);
  });

  it('records a raid that moved to another region once, as the party it went on as', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    made.clock.now += MINUTE;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    const cafe = gymsFixture().stored(8);
    const east = made.regions.byId(2);
    if (!cafe || !east) throw new Error('no café in East');
    made.clock.now += MINUTE;
    const outcome = await made.service.relocate(made.party.id, cafe, east);
    if (outcome.kind !== 'moved') throw new Error(`not moved: ${outcome.kind}`);
    await made.service.flush();
    expect(made.history.records).toEqual([]);

    expect(await made.service.end(outcome.party.id)).toBe(true);
    expect(made.history.records).toHaveLength(1);
    expect(made.history.records[0]).toMatchObject({
      partyId: outcome.party.id,
      gymId: 8,
      regionId: 2,
      createdAt: made.party.createdAt,
    });
    // Who signed up before the move did so when they did.
    expect(made.history.records[0]?.attendees[1]).toMatchObject({
      status: 'joined',
      joinedAt: made.party.createdAt + MINUTE,
    });
  });

  it('records a train with the stops it made', async () => {
    const made = await createdTrain({ route: [1, 2, 3] });
    made.history.optIn(1, REPORTER);
    await made.attendance.signUp(
      made.party.id,
      { id: REPORTER, name: 'Reporter' },
      PartyStatus.Present,
    );
    const start = made.clock.now;
    made.clock.now = start + 10 * MINUTE;
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    made.clock.now = start + 20 * MINUTE;
    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
    expect(await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } })).toBe(
      true,
    );
    const [record] = made.history.records;
    expect(record).toMatchObject({
      kind: 'train',
      name: 'Saturday legendaries',
      ending: 'completed',
      routeStops: 3,
      createdById: REPORTER,
    });
    expect(record?.stops).toEqual([
      {
        gymId: 1,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: start,
        leftAt: start + 10 * MINUTE,
        // The regions it lies in at the end (plan 8H-7A): West.
        regionIds: [1],
      },
      {
        gymId: 2,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: start + 10 * MINUTE,
        leftAt: start + 20 * MINUTE,
        regionIds: [1],
      },
    ]);
    // The most at once: the maker alone, Here from the start.
    expect(record?.peakRiders).toBe(1);
  });

  it('keeps the regions each stop of a train lies in at its end, in their order (plan 8H-7A)', async () => {
    // Gym 1 lies in West, gym 7 in East.
    const made = await createdTrain({ route: [1, 7] });
    await made.attendance.signUp(
      made.party.id,
      { id: REPORTER, name: 'Reporter' },
      PartyStatus.Present,
    );
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
    expect(made.history.records[0]?.stops.map((stop) => [stop.gymId, stop.regionIds])).toEqual([
      [1, [1]],
      [7, [2]],
    ]);
  });

  it('gives back the record the ending write committed, and none when it failed (plan 8H-7A)', async () => {
    const made = await createdTrain({ route: [1, 7] });
    const ended = await made.store.update(made.party.id, (party) => ({
      party: endParty(party),
      ended: { how: 'clock' as const },
    }));
    // With its id (plan 8H-7B): its place in the records, from 1.
    expect(ended?.recorded).toEqual({ ...made.history.records[0], historyId: 1 });
    expect(ended?.recorded).toMatchObject({ partyId: made.party.id, serverId: HISTORY_SERVER });
    // A change that ends nothing records nothing.
    const other = await createdTrain({ route: [1] });
    const renamed = await other.store.update(other.party.id, (party) => ({
      party: { ...party, anonymous: !party.anonymous },
    }));
    expect(renamed?.recorded).toBeUndefined();
    // A record that failed goes to its later tries: the end stands, with nothing to give back.
    other.history.failing = new Error('the history is down');
    const failed = await other.store.update(other.party.id, (party) => ({
      party: endParty(party),
      ended: { how: 'clock' as const },
    }));
    expect(failed?.written).toBe(true);
    expect(failed?.recorded).toBeUndefined();
    other.history.failing = undefined;
  });

  it('credits every conductor of a train with the stops they led, also one who pressed Done (plan 8H-6A)', async () => {
    const made = await createdTrain({ route: [1, 2, 3] });
    made.history.optIn(1, ALICE);
    made.history.optIn(1, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    expect((await made.trains.setConductor(made.party.id, alice)).kind).toBe('ok');
    made.clock.now += 10 * MINUTE;
    expect((await made.trains.move(made.party.id, alice, 'next', false)).kind).toBe('ok');
    // On a train Done means leave: Alice is no longer its conductor.
    await made.attendance.done(made.party.id, alice);
    expect((await made.trains.setConductor(made.party.id, bob)).kind).toBe('ok');
    made.clock.now += 10 * MINUTE;
    expect((await made.trains.move(made.party.id, bob, 'next', false)).kind).toBe('ok');
    made.clock.now += 10 * MINUTE;
    expect((await made.trains.move(made.party.id, bob, 'finish', false)).kind).toBe('ok');
    // A member who holds the role and lets go at once led nothing.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    expect((await made.trains.setConductor(made.party.id, alice)).kind).toBe('ok');
    expect((await made.trains.clearConductor(made.party.id, alice, false)).kind).toBe('ok');
    expect(await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } })).toBe(
      true,
    );
    const [record] = made.history.records;
    expect(record?.conductorId).toBeNull();
    expect(
      record?.attendees.map((attendee) => [attendee.memberId, attendee.conducted ?? 0]),
    ).toEqual([
      [null, 0],
      // Bob's Finish is no arrival.
      [ALICE, 1],
      [BOB, 1],
    ]);
  });

  it('records a meetup the clock ended', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await endedByClock(made, made.party.createdAt + 25 * 60 * MINUTE);
    expect(made.history.records).toEqual([
      expect.objectContaining({
        kind: 'meetup',
        name: 'Community Day picnic',
        ending: 'completed',
      }),
    ]);
  });

  // Final review, X3-F4: shiny as the max battle's post says it (`shownMaxBoss`).
  it('records whether a max battle boss could be shiny as the max boss list says', async () => {
    const machamp = catalogueFixture().byKey('machamp');
    const listed = (tier: MaxTier, shiny: boolean): MaxBoss => ({
      pokemonId: 'MACHAMP',
      form: null,
      key: 'machamp',
      tier,
      shiny,
      name: 'Machamp',
      entry: machamp,
      source: 'feed',
      autoset: false,
    });
    const shinyIn = async (bosses: MaxBoss[]) => {
      const made = await reportedMax({}, { maxBosses: { ...NO_MAX_BOSSES, bosses: () => bosses } });
      expect(await made.service.end(made.party.id)).toBe(true);
      return made.history.records.map((record) => record.shiny);
    };
    expect(await shinyIn([listed('D2', true)])).toEqual([true]);
    expect(await shinyIn([listed('D2', false)])).toEqual([false]);
    // Listed in another tier only: not known.
    expect(await shinyIn([listed('D3', true)])).toEqual([null]);
  });

  it('ends the party when its record cannot be written, and writes it once later', async () => {
    const made = await reportedRaid();
    made.history.failing = new Error('the history is down');
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.history.records).toEqual([]);
    expect(made.entries).toContainEqual(
      expect.objectContaining({ msg: 'could not write the party history; trying again later' }),
    );
    made.history.failing = undefined;
    await made.recorder.flush();
    await made.recorder.flush();
    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
  });

  it('records at start a party that ended without its record, and leaves active ones alone', async () => {
    const made = await reportedRaid();
    const other = await made.service.createMeetup({
      name: 'Still on',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error('no meetup');
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    for (let n = 0; n < 5; n++) await made.recorder.flush();
    made.history.failing = undefined;
    expect(made.history.records).toEqual([]);

    // As after a restart: what is left of it is found and recorded, its steps dropped.
    expect(await made.recorder.sweep()).toBe(1);
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: made.party.id, ending: 'unknown' }),
    ]);
    expect(made.history.steps.map((step) => step.partyId)).toEqual([other.party.id]);
    expect(await made.recorder.sweep()).toBe(0);
  });

  it('records at start a train a group was split off, its split members not departed', async () => {
    const made = await createdTrain({ route: [1, 2] });
    await made.attendance.newGroup(made.party.id, alice);
    await made.attendance.joinGroup(made.party.id, bob, 'B');
    const link = { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '910000000000000009' };
    made.clock.now += 5 * MINUTE;
    const split = await made.store.update(made.party.id, (party) =>
      isTrain(party) ? splitOffGroup(party, ALICE, false, 'B', link) : { party },
    );
    expect(split?.written).toBe(true);
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    for (let n = 0; n < 5; n++) await made.recorder.flush();
    made.history.failing = undefined;
    expect(made.history.records).toEqual([]);

    expect(await made.recorder.sweep()).toBe(1);
    const [record] = made.history.records;
    expect(record?.attendees).toEqual([
      expect.objectContaining({ status: 'interested' }),
      expect.objectContaining({ status: null, leftAt: made.clock.now, splitOff: true }),
      expect.objectContaining({ status: null, leftAt: made.clock.now, splitOff: true }),
    ]);
    expect(record?.attendees.filter((attendee) => attendee.splitOff)).toHaveLength(2);
  });

  it('records at start a train left without its record with its most at once and its stops’ regions (plan 8H-7A)', async () => {
    // Gym 1 lies in West, gym 7 in East.
    const made = await createdTrain({ route: [1, 7] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    made.clock.now += 5 * MINUTE;
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    for (let n = 0; n < 5; n++) await made.recorder.flush();
    made.history.failing = undefined;
    expect(made.history.records).toEqual([]);

    expect(await made.recorder.sweep()).toBe(1);
    const [record] = made.history.records;
    // Alice and Bob, still aboard after the move put them back to Coming.
    expect(record?.peakRiders).toBe(2);
    expect(record?.stops.map((stop) => [stop.gymId, stop.regionIds])).toEqual([
      [1, [1]],
      [7, [2]],
    ]);
  });

  it('records nothing of the new train of a split that ends before the split is settled', async () => {
    const made = await createdTrain({ route: [1, 2] });
    const from = {
      partyId: '00000000-0000-4000-8000-0000000000aa',
      postId: '910000000000000009',
      pending: true as const,
    };
    await made.store.update(made.party.id, (party) =>
      isTrain(party) ? { party: { ...party, train: { ...party.train, splitFrom: from } } } : {},
    );
    await made.service.end(made.party.id);
    await made.recorder.flush();
    expect(made.history.records).toEqual([]);
  });

  it('leaves a party whose row cannot be read, says so, and logs a sweep that fails', async () => {
    const made = await reportedRaid();
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    for (let n = 0; n < 5; n++) await made.recorder.flush();
    made.history.failing = undefined;
    made.storage.unreadable.add(made.party.id);
    expect(await made.recorder.sweep()).toBe(0);
    expect(made.storage.rows.has(made.party.id)).toBe(true);
    expect(made.history.steps).not.toEqual([]);
    expect(made.history.records).toEqual([]);
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'could not read a party left without its history; it stays',
        party: made.party.id,
      }),
    );
    // Nothing to record: one line every hour, not three.
    expect(made.entries.map((entry) => entry.msg)).not.toContain(
      'recording parties left without their history',
    );
    expect(made.entries.map((entry) => entry.msg)).not.toContain(
      'recorded parties left without their history',
    );

    made.history.failing = new Error('still down');
    expect(await made.recorder.sweep()).toBe(0);
    expect(made.entries).toContainEqual(
      expect.objectContaining({ msg: 'could not look for parties left without their history' }),
    );
  });

  it('leaves a party whose record waits for its next try to that try', async () => {
    const made = await reportedRaid();
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    made.history.failing = undefined;
    // The hourly sweep comes before the try: the party keeps the ending it had.
    expect(await made.recorder.sweep()).toBe(0);
    expect(made.history.records).toEqual([]);
    await made.recorder.flush();
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled' }),
    ]);
  });

  it('leaves a raid that moved in a hiccup to the party it goes on as', async () => {
    const made = await reportedRaid();
    const cafe = gymsFixture().stored(8);
    const east = made.regions.byId(2);
    if (!cafe || !east) throw new Error('no café in East');
    made.history.failing = new Error('the history is down');
    const outcome = await made.service.relocate(made.party.id, cafe, east);
    if (outcome.kind !== 'moved') throw new Error(`not moved: ${outcome.kind}`);
    await made.service.flush();
    made.history.failing = undefined;
    expect(await made.recorder.sweep()).toBe(0);
    await made.recorder.flush();
    expect(await made.service.end(outcome.party.id)).toBe(true);
    expect(made.history.records.map((record) => record.partyId)).toEqual([outcome.party.id]);
  });

  it('stops between two parties once it is told to', async () => {
    const parties = [1, 2, 3].map((n) => ({
      ...endParty({ ...testRaid(), id: `00000000-0000-4000-8000-00000000000${String(n)}` }),
      forumChannelId: WEST_FORUM,
      forumPostId: `90000000000000000${String(n)}`,
    }));
    const made = await partyServiceWith(parties);
    let asked = 0;
    // Told to stop once it has asked about two parties.
    expect(await made.recorder.sweep({ isStopped: () => ++asked > 2 })).toBeLessThan(3);
    expect(made.history.records.length).toBeLessThan(3);
    expect(made.storage.rows.size).toBeGreaterThan(0);
  });

  it('says how many parties it records, and how far it got', async () => {
    const parties = [1, 2, 3].map((n) => ({
      ...endParty({ ...testRaid(), id: `00000000-0000-4000-8000-00000000000${String(n)}` }),
      forumChannelId: WEST_FORUM,
      forumPostId: `90000000000000000${String(n)}`,
    }));
    const made = await partyServiceWith(parties, { historySweepProgressEvery: 2 });
    expect(await made.recorder.sweep()).toBe(3);
    expect(made.entries.map((entry) => entry.msg)).toEqual(
      expect.arrayContaining([
        'recording parties left without their history',
        'recorded 2 of the parties left without their history',
        'recorded parties left without their history',
      ]),
    );
    expect(made.entries).toContainEqual(
      expect.objectContaining({ msg: 'recording parties left without their history', parties: 3 }),
    );
  });

  it('deletes the row of a party once it is recorded, and keeps its post for the archiving', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.storage.rows.has(made.party.id)).toBe(false);
    expect(made.history.steps).toEqual([]);
    // A reopened post is still archived by the hourly sweep.
    expect(await made.store.endedPosts([made.postId])).toEqual([made.postId]);
  });

  it('records a raid closed by somebody after it took place as completed', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { hatch: HATCH } });
    made.clock.now = HATCH + 5 * MINUTE;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.done(made.party.id, alice);
    await made.service.end(made.party.id);
    expect(made.history.records.map((record) => record.ending)).toEqual(['completed']);
  });

  it('records the parties of a region that is removed as cancelled', async () => {
    const made = await regionAdminWith();
    const gym = gymsFixture().stored(1);
    if (!gym) throw new Error('no gym 1');
    const reported = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (reported.kind !== 'created') throw new Error('no raid');
    await made.service.flush();
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    expect(outcome).toMatchObject({ kind: 'removed', ended: 1 });
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: reported.party.id, ending: 'cancelled' }),
    ]);
  });

  it('records at start a party that ended without any step, and drops one without a post', async () => {
    // Rows of parties that ended before the history was kept: no step, no record.
    const posted = {
      ...endParty(testRaid()),
      forumChannelId: WEST_FORUM,
      forumPostId: '900000000000000001',
    };
    const unposted = endParty({ ...testRaid(), id: '00000000-0000-4000-8000-000000000008' });
    const made = await partyServiceWith([posted, unposted]);
    expect(await made.recorder.sweep()).toBe(1);
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: posted.id, ending: 'unknown' }),
    ]);
    expect(made.storage.rows.size).toBe(0);
    expect(await made.store.endedPosts(['900000000000000001'])).toEqual(['900000000000000001']);
    expect(await made.recorder.sweep()).toBe(0);
  });

  it('gives up on a record after its last try, and says so', async () => {
    const made = await reportedRaid();
    made.history.failing = new Error('the history is down');
    await made.service.end(made.party.id);
    for (let n = 0; n < 5; n++) await made.recorder.flush();
    expect(made.history.records).toEqual([]);
    expect(made.entries).toContainEqual(
      expect.objectContaining({ msg: 'gave up writing the party history of a party' }),
    );
  });
});
