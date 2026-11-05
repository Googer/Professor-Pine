import { gymStop, spotStop } from '../party/stops.js';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
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
} from '../../../test/support/parties.js';
import { endParty, type Party, type RaidBossRef, type TrainParty } from '../party/party.js';
import { PartyStatus } from '../party/status.js';
import { finishParty } from '../party/attendance.js';
import {
  clearConductor,
  setConductor,
  splitOffGroup,
  splitSettled,
  splitTrain,
} from '../party/train.js';
import {
  historyCounts,
  historyMembers,
  historyOfParty,
  partySteps,
  withoutMembers,
  type HistoryBoss,
  type HistoryStep,
} from './party-history.js';

const T = PARTY_NOW;
const describeBoss = (ref: RaidBossRef): HistoryBoss =>
  'key' in ref ? { key: ref.key, dex: 717, species: 'YVELTAL', form: null } : { name: ref.name };

/** The steps of a party's life, one write after another, each `MINUTE` after the last. */
function stepsOf(writes: Party[]): HistoryStep[] {
  const steps: HistoryStep[] = [];
  let before: Party | undefined;
  for (const [n, after] of writes.entries()) {
    steps.push(...partySteps(before, after, T + n * MINUTE));
    before = after;
  }
  return steps;
}

function train(stop: number, route: number[] = [11, 12, 13]): TrainParty {
  const made = testTrain();
  return { ...made, train: { ...made.train, route: route.map(gymStop), stop } };
}

describe('historyOfParty: a max battle (plan 8X-3, design 3.5)', () => {
  const record = (party: Party) =>
    historyOfParty(
      { ...endParty(party), updatedAt: T + 9 * MINUTE },
      {
        end: { how: 'clock' },
        steps: stepsOf([party]),
        optedIn: new Set(),
        describeBoss,
        shiny: null,
      },
    );

  it('keeps its kind, tier, boss and the Wayspot of its Power Spot; no gym', () => {
    const done = withAttendees(testMax({ boss: { key: 'yveltal' } }), {
      [ALICE]: { status: PartyStatus.Complete },
    });
    expect(record(done)).toMatchObject({
      kind: 'max',
      tier: 'D2',
      gymId: null,
      wayspotId: TEST_SPOT.id,
      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
      shadow: false,
      mega: false,
      elite: false,
      hatchTime: null,
      endTime: testMax().endTime,
      ending: 'completed',
      name: null,
      startTime: null,
    });
  });

  it('keeps no Wayspot for a pin, a Gigantamax tier as G, and is completed only when done', () => {
    const pinned = testMax({ spot: TEST_PIN, tier: 'G' });
    expect(record(pinned)).toMatchObject({ wayspotId: null, tier: 'G', ending: 'expired' });
    // Here is not done: a battle takes place when somebody completed it, as a raid.
    const here = withAttendees(pinned, { [ALICE]: { status: PartyStatus.Present } });
    expect(record(here).ending).toBe('expired');
  });

  it('keeps no Wayspot for any other kind', () => {
    expect(record(testRaid()).wayspotId).toBeNull();
    expect(record(testMeetup()).wayspotId).toBeNull();
  });
});

describe('partySteps', () => {
  it('notes the members a new party starts with', () => {
    expect(partySteps(undefined, testRaid(), T)).toEqual([
      { partyId: testRaid().id, at: T, kind: 'status', subject: REPORTER, value: 0 },
    ]);
  });

  it('notes a changed status, a member who left, and nothing that stayed', () => {
    const before = withAttendees(testRaid(), { [ALICE]: {}, [BOB]: {} });
    const { [BOB]: _bob, ...rest } = withAttendees(before, {
      [ALICE]: { status: PartyStatus.Present },
    }).attendees;
    const after = { ...before, attendees: rest };
    expect(
      partySteps(before, after, T).map(({ kind, subject, value }) => [kind, subject, value]),
    ).toEqual([
      ['status', ALICE, PartyStatus.Present],
      ['left', BOB, null],
    ]);
    expect(partySteps(after, { ...after }, T)).toEqual([]);
  });

  it('notes a meeting time when it is set or moved, not when it is cleared', () => {
    const raid = testRaid();
    const set = { ...raid, groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE }] };
    const moved = { ...raid, groups: [{ id: 'A' as const, startTime: T + 40 * MINUTE }] };
    expect(partySteps(raid, set, T)).toEqual([
      // The group by its letter and when it was opened (plan 8X-1B): letters are given again.
      {
        partyId: raid.id,
        at: T,
        kind: 'meet',
        subject: `A:${T.toString(36)}`,
        value: T + 30 * MINUTE,
      },
    ]);
    expect(partySteps(set, moved, T)[0]?.value).toBe(T + 40 * MINUTE);
    expect(partySteps(moved, raid, T)).toEqual([]);
  });

  it('notes the meeting time of a group opened again under a letter as that of another group', () => {
    const raid = testRaid();
    const before = { ...raid, groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE }] };
    const again = {
      ...raid,
      groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE, opened: T + MINUTE }],
    };
    expect(partySteps(before, again, T)).toEqual([
      {
        partyId: raid.id,
        at: T,
        kind: 'meet',
        subject: `A:${(T + MINUTE).toString(36)}`,
        value: T + 30 * MINUTE,
      },
    ]);
  });

  it('notes where a train is whenever that changes', () => {
    const empty = testTrain();
    const steps = partySteps(empty, train(0), T);
    expect(steps).toEqual([{ partyId: empty.id, at: T, kind: 'stop', subject: '11', value: 11 }]);
    expect(partySteps(train(0), train(1), T)[0]).toMatchObject({ subject: '12', value: 12 });
    expect(partySteps(train(2), train(3), T)[0]).toMatchObject({ subject: 'end', value: null });
    // A route edited around the train leaves it where it is.
    expect(partySteps(train(1), train(0, [12, 13]), T)).toEqual([]);
  });
});

describe('partySteps: who conducts a train (plan 8H-6A)', () => {
  /** The maker and Alice and Bob on a train, nobody conducting. */
  const riders = (): TrainParty => withAttendees(testTrain(), { [ALICE]: {}, [BOB]: {} });
  const conducted = (memberId: string): TrainParty => {
    const set = setConductor(riders(), memberId);
    if (!set.ok) throw new Error(set.reason);
    return set.party;
  };
  const kinds = (steps: HistoryStep[]) =>
    steps.map(({ kind, subject, value }) => [kind, subject, value]);

  it('notes a member who becomes the conductor', () => {
    expect(kinds(partySteps(riders(), conducted(ALICE), T))).toEqual([['conduct', ALICE, null]]);
  });

  it('notes the maker who becomes the conductor like anybody else', () => {
    expect(kinds(partySteps(riders(), conducted(REPORTER), T))).toEqual([
      ['conduct', REPORTER, null],
    ]);
  });

  it('notes a member who takes it over, and the end of the conductorship it took over', () => {
    const taken = setConductor(conducted(ALICE), BOB);
    if (!taken.ok) throw new Error(taken.reason);
    expect(kinds(partySteps(conducted(ALICE), taken.party, T))).toEqual([
      ['unlead', ALICE, null],
      ['conduct', BOB, null],
    ]);
  });

  it('notes each conductor of a handover, and the end of each, also by Done', () => {
    // Alice conducts, presses Done (on a train, she leaves), and Bob takes it on.
    const led = conducted(ALICE);
    const left = finishParty(led, ALICE, T, 5);
    if (!left.ok) throw new Error(left.reason);
    const taken = setConductor(left.party, BOB);
    if (!taken.ok) throw new Error(taken.reason);
    const steps = stepsOf([riders(), led, left.party, taken.party]);
    expect(
      kinds(steps.filter((step) => step.kind === 'conduct' || step.kind === 'unlead')),
    ).toEqual([
      ['conduct', ALICE, null],
      ['unlead', ALICE, null],
      ['conduct', BOB, null],
    ]);
    // A member step: the opt-in lookup sees Alice although she is neither on it nor conducts it.
    expect(historyMembers(taken.party, steps)).toContain(ALICE);
  });

  it('notes the end of a conductorship that was cleared, and nothing while it stays', () => {
    expect(partySteps(conducted(ALICE), { ...conducted(ALICE) }, T)).toEqual([]);
    const cleared = clearConductor(conducted(ALICE), ALICE, false);
    if (!cleared.ok) throw new Error(cleared.reason);
    expect(kinds(partySteps(conducted(ALICE), cleared.party, T))).toEqual([
      ['unlead', ALICE, null],
    ]);
    // Nor of a raid, which has none.
    expect(partySteps(testRaid(), { ...testRaid() }, T)).toEqual([]);
  });

  it('notes a train made with a conductor', () => {
    expect(kinds(partySteps(undefined, conducted(ALICE), T))).toContainEqual([
      'conduct',
      ALICE,
      null,
    ]);
  });

  it('notes where the train is before who conducts it, in a write that changes both', () => {
    // The place a write reaches is the doing of whoever conducted the train before it.
    const led = conducted(ALICE);
    const moved = { ...led, train: { ...led.train, route: [gymStop(11)], conductorId: BOB } };
    expect(kinds(partySteps(led, moved, T))).toEqual([
      ['stop', '11', 11],
      ['unlead', ALICE, null],
      ['conduct', BOB, null],
    ]);
  });
});

describe('historyOfParty', () => {
  it('keeps a raid with its attendees in the order they came, their times and how far they got', () => {
    const made = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
      [ALICE]: { status: PartyStatus.Interested, number: 2, remote: true, team: 'mystic' },
    });
    const writes: Party[] = [
      made,
      withAttendees(made, { [ALICE]: { status: PartyStatus.Coming, number: 2, remote: true } }),
      withAttendees(made, { [ALICE]: { status: PartyStatus.Present, number: 2, remote: true } }),
      withAttendees(made, {
        [ALICE]: { status: PartyStatus.Complete, number: 2, remote: true, team: 'mystic' },
        [BOB]: { status: PartyStatus.Coming },
      }),
    ];
    const last = writes.at(-1) as Party;
    const ended = { ...endParty(last), updatedAt: T + 9 * MINUTE };
    const record = historyOfParty(ended, {
      end: { how: 'clock' },
      steps: stepsOf(writes),
      optedIn: new Set([ALICE]),
      describeBoss,
      shiny: true,
    });
    expect(record).toMatchObject({
      source: 'live',
      partyId: ended.id,
      legacyKey: null,
      kind: 'raid',
      regionId: 1,
      gymId: 1,
      tier: 'T5',
      shadow: false,
      mega: false,
      elite: false,
      ex: false,
      shiny: true,
      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
      createdAt: T,
      endedAt: T + 9 * MINUTE,
      ending: 'completed',
      createdById: null,
      anonymous: false,
    });
    expect(record.attendees).toEqual([
      {
        memberId: null,
        status: 'interested',
        furthest: 'interested',
        groupId: 'A',
        extras: 0,
        remote: false,
        team: null,
        signedUpAt: T,
        joinedAt: null,
        hereAt: null,
        doneAt: null,
        leftAt: null,
      },
      {
        memberId: ALICE,
        status: 'done',
        furthest: 'done',
        groupId: 'A',
        extras: 1,
        remote: true,
        team: 'mystic',
        signedUpAt: T,
        joinedAt: T + MINUTE,
        hereAt: T + 2 * MINUTE,
        doneAt: T + 3 * MINUTE,
        leftAt: null,
      },
      expect.objectContaining({ memberId: null, status: 'joined', joinedAt: T + 3 * MINUTE }),
    ]);
    expect(record.groups).toEqual([
      { groupId: 'A', label: null, meetingTime: null, members: 3, heads: 4 },
    ]);
    expect(historyCounts(record.attendees)).toEqual({
      attendees: 3,
      interested: 1,
      joined: 1,
      here: 0,
      done: 1,
      interestedHeads: 1,
      joinedHeads: 1,
      hereHeads: 0,
      doneHeads: 2,
      extras: 1,
      remote: 1,
      departed: 0,
    });
  });

  it('counts how far a member got, also when they went back or left', () => {
    const made = withAttendees(testRaid(), { [ALICE]: {}, [BOB]: {} });
    const back = withAttendees(made, {
      [ALICE]: { status: PartyStatus.Present },
      [BOB]: { status: PartyStatus.Present },
    });
    const { [BOB]: _bob, ...stayed } = withAttendees(back, {
      [ALICE]: { status: PartyStatus.Coming },
    }).attendees;
    const writes: Party[] = [made, back, { ...back, attendees: stayed }];
    const record = historyOfParty(endParty(writes.at(-1) as Party), {
      end: { how: 'clock' },
      steps: stepsOf(writes),
      optedIn: new Set([BOB]),
      describeBoss,
      shiny: null,
    });
    expect(record.ending).toBe('expired');
    expect(record.attendees.slice(1)).toEqual([
      expect.objectContaining({ memberId: null, status: 'joined', furthest: 'here' }),
      expect.objectContaining({
        memberId: BOB,
        status: null,
        furthest: 'here',
        groupId: null,
        hereAt: T + MINUTE,
        leftAt: T + 2 * MINUTE,
      }),
    ]);
    expect(historyCounts(record.attendees)).toMatchObject({ here: 2, departed: 1 });
  });

  it('names the member who made it and the conductor only with their opt-in', () => {
    const made = testTrain();
    const led = withAttendees(
      { ...made, train: { ...made.train, conductorId: ALICE } },
      { [ALICE]: {} },
    );
    const record = (optedIn: string[]) =>
      historyOfParty(endParty(led), {
        end: { how: 'cancelled' },
        steps: [],
        optedIn: new Set(optedIn),
        describeBoss,
        shiny: null,
      });
    expect(record([])).toMatchObject({ createdById: null, conductorId: null, ending: 'cancelled' });
    expect(record([REPORTER, ALICE])).toMatchObject({ createdById: REPORTER, conductorId: ALICE });
    expect(historyMembers(led, [])).toEqual([REPORTER, ALICE]);
  });

  it('keeps the members of the steps and of the party for the opt-in', () => {
    const made = withAttendees(testRaid(), { [ALICE]: {} });
    const steps: HistoryStep[] = [
      { partyId: made.id, at: T, kind: 'status', subject: CAROL, value: 0 },
      { partyId: made.id, at: T, kind: 'left', subject: CAROL, value: null },
    ];
    expect(historyMembers(made, steps)).toEqual([CAROL, REPORTER, ALICE]);
  });

  it('keeps the meeting time of a group after the clock cleared it', () => {
    const raid = testRaid();
    const set = { ...raid, groups: [{ id: 'A' as const, label: 'Bus', startTime: T + MINUTE }] };
    const cleared = { ...raid, groups: [{ id: 'A' as const, label: 'Bus' }] };
    const record = historyOfParty(endParty(cleared), {
      end: { how: 'clock' },
      steps: stepsOf([raid, set, cleared]),
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(record.groups).toEqual([
      { groupId: 'A', label: 'Bus', meetingTime: T + MINUTE, members: 1, heads: 1 },
    ]);
  });

  it('keeps a meeting time with the group that had it, not with a later group of its letter', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: { group: 'B' } });
    const opened = { ...raid, groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T }] };
    const met = {
      ...opened,
      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T, startTime: T + MINUTE }],
    };
    // The clock cleared it, Alice left, B was pruned; later a new B was opened.
    const { [ALICE]: _alice, ...rest } = met.attendees;
    const pruned = { ...raid, attendees: rest, groups: [{ id: 'A' as const }] };
    const again = withAttendees(
      { ...pruned, groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T + 9 * MINUTE }] },
      { [BOB]: { group: 'B' } },
    );
    // Steps of before the stamps (plan 8X-1B) name the letter alone, and count for it.
    const legacy: HistoryStep = { partyId: raid.id, at: T, kind: 'meet', subject: 'A', value: T };
    const record = historyOfParty(endParty(again), {
      end: { how: 'clock' },
      steps: [...stepsOf([raid, opened, met, pruned, again]), legacy],
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(record.groups.map((group) => [group.groupId, group.meetingTime])).toEqual([
      ['A', T],
      ['B', null],
    ]);
  });

  it('says how a party ended: by the clock, by somebody, or not known', () => {
    const ended = (party: Party, how?: 'clock' | 'cancelled') =>
      historyOfParty(endParty(party), {
        end: how === undefined ? undefined : { how },
        steps: [],
        optedIn: new Set(),
        describeBoss,
        shiny: null,
      }).ending;
    const here = withAttendees(testMeetup(), { [ALICE]: { status: PartyStatus.Present } });
    expect(ended(here, 'clock')).toBe('completed');
    expect(ended(testMeetup(), 'clock')).toBe('expired');
    // A raid is completed when somebody completed it, not when somebody was there.
    expect(
      ended(withAttendees(testRaid(), { [ALICE]: { status: PartyStatus.Present } }), 'clock'),
    ).toBe('expired');
    expect(ended(testRaid(), 'cancelled')).toBe('cancelled');
    expect(ended(testRaid())).toBe('unknown');
    // Closed by somebody, or for a reason not known, after it took place: completed all the same.
    const done = withAttendees(testRaid(), { [ALICE]: { status: PartyStatus.Complete } });
    expect(ended(done, 'cancelled')).toBe('completed');
    expect(ended(done)).toBe('completed');
    const rode = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Present } });
    expect(ended(rode, 'cancelled')).toBe('completed');
  });

  it('sums how many members its news reached, over the parties it went on from (plan 8H-3)', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: { status: PartyStatus.Coming } });
    const reach = (partyId: string, at: number, value: number): HistoryStep => ({
      partyId,
      at,
      kind: 'reach',
      subject: 'reported',
      value,
    });
    const steps = [
      ...stepsOf([raid]),
      // The raid it went on from after a move, and its own news.
      reach('00000000-0000-4000-8000-0000000000ff', T, 4),
      reach(raid.id, T + MINUTE, 3),
      reach(raid.id, T + 2 * MINUTE, 1),
    ];
    const record = (stepsGiven: readonly HistoryStep[]) =>
      historyOfParty(endParty(raid), {
        end: { how: 'clock' },
        steps: stepsGiven,
        optedIn: new Set(),
        describeBoss,
        shiny: null,
      });
    expect(record(steps).reached).toBe(8);
    expect(record(stepsOf([raid])).reached).toBe(0);
    // A count is no member, and no stop: who came stays as it was.
    expect(record(steps).attendees).toEqual(record(stepsOf([raid])).attendees);
    expect(historyMembers(raid, steps).sort()).toEqual([ALICE, REPORTER].sort());
  });

  it('writes @member for every member a name, a description or a group label names', () => {
    const meetup = testMeetup({ name: `Picnic with <@${BOB}>` });
    const labelled = {
      ...meetup,
      meetup: {
        description: `Ask <@!${ALICE}> or ${BOB} <:pine:123456789012345678>`,
        place: null,
      },
      groups: [{ id: 'A' as const, label: `Ride with <@${CAROL}>` }],
    };
    const record = historyOfParty(endParty(labelled), {
      end: { how: 'clock' },
      steps: [],
      optedIn: new Set([ALICE, BOB, CAROL]),
      describeBoss,
      shiny: null,
    });
    expect(record).toMatchObject({
      name: 'Picnic with @member',
      description: 'Ask @member or @member <:pine:123456789012345678>',
      groups: [expect.objectContaining({ label: 'Ride with @member' })],
    });
  });

  it('keeps the mentions of roles and channels as they are', () => {
    const text = 'Ping <@&412345678901234567> in <#512345678901234567>, not <@612345678901234567>';
    expect(withoutMembers(text)).toBe(
      'Ping <@&412345678901234567> in <#512345678901234567>, not @member',
    );
  });

  it('keeps a meetup with its name and words, at no gym', () => {
    const meetup = testMeetup();
    const record = historyOfParty(
      endParty({ ...meetup, meetup: { description: 'Bring snacks', place: null } }),
      { end: { how: 'clock' }, steps: [], optedIn: new Set(), describeBoss, shiny: null },
    );
    expect(record).toMatchObject({
      kind: 'meetup',
      name: 'Community Day picnic',
      description: 'Bring snacks',
      gymId: null,
      tier: null,
      boss: null,
      stops: [],
      routeStops: null,
      trainKind: null,
    });
  });

  it('keeps the stops a train made, when it got there and when it left', () => {
    // The first stop was laid before the start: the train got there at its start.
    const start = T + 1.5 * MINUTE;
    const timed = (party: TrainParty): TrainParty => ({
      ...party,
      timed: { ...party.timed, startTime: start },
    });
    const writes: Party[] = [
      timed(testTrain()),
      timed(train(0)),
      timed(train(1)),
      timed(train(0)),
      timed(train(1)),
      timed(train(3)),
    ];
    const record = historyOfParty(endParty(writes.at(-1) as Party), {
      end: { how: 'clock' },
      steps: stepsOf(writes),
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(record.routeStops).toBe(3);
    // The kind of train it was (plan 8X-4, migration 026).
    expect(record.trainKind).toBe('raid');
    const max = historyOfParty(
      endParty({ ...testTrain(), train: { ...testTrain().train, kind: 'gigantamax' } }),
      { end: { how: 'clock' }, steps: [], optedIn: new Set(), describeBoss, shiny: null },
    );
    expect(max.trainKind).toBe('gigantamax');
    expect(record.stops).toEqual([
      { gymId: 11, legacyGymId: null, wayspotId: null, arrivedAt: start, leftAt: T + 2 * MINUTE },
      {
        gymId: 12,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: T + 2 * MINUTE,
        leftAt: T + 3 * MINUTE,
      },
      {
        gymId: 11,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: T + 3 * MINUTE,
        leftAt: T + 4 * MINUTE,
      },
      {
        gymId: 12,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: T + 4 * MINUTE,
        leftAt: T + 5 * MINUTE,
      },
    ]);
  });

  it('keeps a Power Spot of the route as a stop made there, by its Wayfarer id (plan 8X-4)', () => {
    const spot = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
    const mixed = (stop: number): TrainParty => {
      const made = train(stop);
      return {
        ...made,
        train: { ...made.train, route: [gymStop(11), spotStop(spot), gymStop(13)] },
      };
    };
    // A step of kind `spot`: the bare Wayfarer id, no gym.
    expect(partySteps(mixed(0), mixed(1), T)).toEqual([
      { partyId: mixed(0).id, at: T, kind: 'spot', subject: spot, value: null },
    ]);
    expect(partySteps(mixed(1), mixed(2), T)[0]).toMatchObject({ kind: 'stop', subject: '13' });
    const writes: Party[] = [testTrain(), mixed(0), mixed(1), mixed(2), mixed(3)];
    const record = historyOfParty(endParty(writes.at(-1) as Party), {
      end: { how: 'clock' },
      steps: stepsOf(writes),
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(record.stops).toEqual([
      {
        gymId: 11,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: T + MINUTE,
        leftAt: T + 2 * MINUTE,
      },
      {
        gymId: null,
        legacyGymId: null,
        wayspotId: spot,
        arrivedAt: T + 2 * MINUTE,
        leftAt: T + 3 * MINUTE,
      },
      {
        gymId: 13,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: T + 3 * MINUTE,
        leftAt: T + 4 * MINUTE,
      },
    ]);
    // Without steps, as far as the route says: a power spot is a stop, no end of the route.
    const unseen = historyOfParty(endParty(mixed(3)), {
      end: { how: 'clock' },
      steps: [],
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(unseen.stops.map((stop) => stop.gymId ?? stop.wayspotId)).toEqual([11, spot, 13]);
  });

  it('keeps the stops of a train it saw no steps of as far as the route says, without times', () => {
    const record = (party: TrainParty) =>
      historyOfParty(endParty(party), {
        end: { how: 'clock' },
        steps: [],
        optedIn: new Set(),
        describeBoss,
        shiny: null,
      }).stops.map((stop) => stop.gymId);
    expect(record(train(3))).toEqual([11, 12, 13]);
    expect(record(train(1))).toEqual([11, 12]);
    // At its first stop: there once it started, not before.
    expect(record(train(0))).toEqual([]);
    const started = train(0);
    expect(
      record({ ...started, timed: { ...started.timed, startTime: started.updatedAt - MINUTE } }),
    ).toEqual([11]);
    expect(
      record({ ...started, timed: { ...started.timed, startTime: started.updatedAt + MINUTE } }),
    ).toEqual([]);
  });
});

describe('a train a group was split off (plan 8T)', () => {
  const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
  const NEW_POST = '910000000000000002';
  const OLD_POST = '910000000000000001';
  const DAVE = '200000000000000005';
  /** The maker in A, Alice (here) and Bob in B, on stop 1 of 3. */
  const before = (): TrainParty => {
    const made = withAttendees(train(1), {
      [ALICE]: { group: 'B', status: PartyStatus.Present },
      [BOB]: { group: 'B' },
    });
    return {
      ...made,
      forumPostId: OLD_POST,
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
      defaultGroupId: 'B',
    };
  };
  const old = (): TrainParty => {
    const split = splitOffGroup(before(), ALICE, false, 'B', { partyId: NEW_ID, postId: NEW_POST });
    if (!split.ok) throw new Error(split.reason);
    return split.party;
  };

  it('notes the members who went with the group as split off, not as left', () => {
    expect(
      partySteps(before(), old(), T).map(({ kind, subject, value }) => [kind, subject, value]),
    ).toEqual([
      ['split', ALICE, null],
      ['split', BOB, null],
    ]);
    // Who leaves the train afterwards has left it, as before.
    const { [REPORTER]: _maker, ...rest } = old().attendees;
    expect(partySteps(old(), { ...old(), attendees: rest }, T)[0]).toMatchObject({
      kind: 'left',
      subject: REPORTER,
    });
    // Who was split off is a member the record of the old train can name.
    const steps = partySteps(before(), old(), T);
    expect(historyMembers(old(), steps)).toEqual([ALICE, BOB, REPORTER]);
  });

  it('keeps them as attendees of the old train up to the split, and not as departed', () => {
    const writes: Party[] = [before(), old()];
    const record = historyOfParty(endParty(old()), {
      end: { how: 'clock' },
      steps: stepsOf(writes),
      optedIn: new Set([ALICE]),
      describeBoss,
      shiny: null,
    });
    const alice = record.attendees.find((attendee) => attendee.memberId === ALICE);
    expect(alice).toMatchObject({
      status: null,
      furthest: 'here',
      groupId: null,
      hereAt: T,
      leftAt: T + MINUTE,
    });
    expect(historyCounts(record.attendees)).toMatchObject({ attendees: 3, here: 1, departed: 0 });
    // Alice was here: the old train took place.
    expect(record.ending).toBe('completed');
    expect(record.splitFromId).toBeNull();
  });

  it('notes nothing of the new train while it is pending, and all of it when it is settled', () => {
    const made = splitTrain(before(), {
      id: NEW_ID,
      by: ALICE,
      anonymous: false,
      group: 'B',
      now: T,
    });
    expect(partySteps(undefined, made, T)).toEqual([]);
    const { [BOB]: _bob, ...alone } = made.attendees;
    expect(partySteps(made, { ...made, attendees: alone }, T + 1)).toEqual([]);
    // The write that settles it: as if it were new then.
    const settled = splitSettled(made);
    expect(partySteps(made, settled, T + 2)).toEqual(partySteps(undefined, settled, T + 2));
    expect(partySteps(made, settled, T + 2).map(({ kind, subject }) => [kind, subject])).toEqual([
      ['status', ALICE],
      ['status', BOB],
      ['stop', '12'],
      // Alice split it off and went with it: she leads it from the split (plan 8H-6A).
      ['conduct', ALICE],
    ]);
  });

  it('records nobody on the new train who was not on it once the split was settled', () => {
    // Bob left the group while the new post was made: the write that settles it drops him.
    const made = splitTrain(before(), {
      id: NEW_ID,
      by: ALICE,
      anonymous: false,
      group: 'B',
      now: T,
    });
    const { [BOB]: _bob, ...alone } = made.attendees;
    const settled = { ...splitSettled(made), attendees: alone };
    const steps = [...partySteps(undefined, made, T), ...partySteps(made, settled, T + MINUTE)];
    const record = historyOfParty(endParty({ ...settled, updatedAt: T + 30 * MINUTE }), {
      end: { how: 'clock' },
      steps,
      optedIn: new Set([ALICE, BOB]),
      describeBoss,
      shiny: null,
    });
    expect(record.attendees.map((attendee) => attendee.memberId)).toEqual([ALICE]);
    expect(historyCounts(record.attendees)).toMatchObject({ attendees: 1, departed: 0 });
    expect(historyMembers(settled, steps)).not.toContain(BOB);
  });

  it('starts the history of the new train at the split, and names the train it came from', () => {
    // Made with its post a moment before the split; the write that settles it is the split.
    const made = splitTrain(before(), {
      id: NEW_ID,
      by: ALICE,
      anonymous: false,
      group: 'B',
      now: T + 9 * MINUTE,
    });
    const at = T + 10 * MINUTE;
    const settled = splitSettled(made);
    const later = { ...settled, attendees: { ...made.attendees }, updatedAt: at + 30 * MINUTE };
    const record = historyOfParty(endParty(later), {
      end: { how: 'clock' },
      steps: [...partySteps(undefined, made, made.createdAt), ...partySteps(made, settled, at)],
      optedIn: new Set([ALICE, BOB]),
      describeBoss,
      shiny: null,
    });
    expect(record).toMatchObject({ createdAt: at, splitFromId: before().id, createdById: ALICE });
    expect(record.attendees).toEqual([
      expect.objectContaining({
        memberId: ALICE,
        signedUpAt: at,
        joinedAt: at,
        hereAt: at,
        status: 'here',
      }),
      expect.objectContaining({ memberId: BOB, signedUpAt: at, joinedAt: at, hereAt: null }),
    ]);
    // Its first stop is where it was split off, reached then.
    expect(record.stops).toEqual([
      { gymId: 12, legacyGymId: null, wayspotId: null, arrivedAt: at, leftAt: null },
    ]);
    expect(historyMembers(made, [])).toContain(ALICE);
    expect(historyMembers(made, [])).not.toContain(DAVE);
    // Without a step (nobody went with it, no route): when it was made.
    const empty = historyOfParty(endParty({ ...settled, attendees: {} }), {
      end: { how: 'clock' },
      steps: [],
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(empty.createdAt).toBe(T + 9 * MINUTE);
  });

  it('reaches the first stop of a train split before its start at the start', () => {
    const start = T + 60 * MINUTE;
    const waiting = { ...before(), timed: { ...before().timed, startTime: start } };
    const made = splitTrain(waiting, {
      id: NEW_ID,
      by: ALICE,
      anonymous: false,
      group: 'B',
      now: T,
    });
    const settled = splitSettled(made);
    const record = historyOfParty(endParty({ ...settled, updatedAt: start + MINUTE }), {
      end: { how: 'clock' },
      steps: partySteps(made, settled, T),
      optedIn: new Set(),
      describeBoss,
      shiny: null,
    });
    expect(record.stops[0]).toMatchObject({ gymId: 12, arrivedAt: start });
  });
});
