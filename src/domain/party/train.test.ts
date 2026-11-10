import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
  gym,
  inGyms,
  stops,
} from '../../../test/support/parties.js';
import {
  createGroup,
  finishParty,
  joinGroup,
  labelGroup,
  leaveParty,
  setMeetingTime,
  setNotHere,
} from './attendance.js';
import {
  bossOf,
  hasGroups,
  isMeetup,
  isRaid,
  isTimed,
  isTrain,
  mayArrange,
  MAX_ROUTE_STOPS,
  partyWord,
  remoteAllowed,
  TRAIN_AT_END,
  type Change,
  type TrainAtEnd,
  type TrainDetails,
  type TrainParty,
} from './party.js';
import { partyState } from './party-state.js';
import { gymIdOf } from './stops.js';
import { PartyStatus } from './status.js';
import { OPEN_PARTY_HOURS, setStartTime } from './timed.js';
import {
  addStop,
  cannotMove,
  cannotReverse,
  clearConductor,
  clearRoute,
  createTrain,
  destinationOf,
  currentStop,
  isTrainMove,
  mayNotMove,
  moveStop,
  moveTrain,
  nextStop,
  placeOf,
  removeStop,
  replaceRoute,
  reverseRoute,
  routeAhead,
  routeFinished,
  setAtEnd,
  setConductor,
  setTrainBoss,
  targetOf,
  TRAIN_MOVES,
  turnAhead,
  type TrainMove,
  type TrainTurn,
} from './train.js';

const HOUR = 3_600_000;

describe('createTrain', () => {
  it('makes a train with its name and nothing else, in the region it was made in', () => {
    const made = createTrain({
      id: '00000000-0000-4000-8000-000000000009',
      guildId: 7,
      regionId: 2,
      createdById: REPORTER,
      name: 'Saturday legendaries',
      now: PARTY_NOW,
    });
    expect(inGyms(made)).toMatchObject({
      ok: true,
      party: {
        id: '00000000-0000-4000-8000-000000000009',
        type: 'train',
        guildId: 7,
        regionId: 2,
        status: 'active',
        // The column of a raid: the gym of a train is the stop it is at.
        gymId: null,
        hatchTime: null,
        endTime: null,
        forumPostId: null,
        createdById: REPORTER,
        anonymous: false,
        saved: false,
        createdAt: PARTY_NOW,
        timed: { name: 'Saturday legendaries', startTime: null },
        train: {
          route: [],
          stop: 0,
          finishedFrom: null,
          atEnd: 'finish',
          conductorId: null,
          boss: null,
        },
      },
    });
  });

  it('signs up who made it as interested in group A, and not as the conductor', () => {
    const train = testTrain();
    expect(inGyms(train.attendees)).toEqual({
      [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
    });
    expect(inGyms(train.groups)).toEqual([{ id: 'A' }]);
    expect(train.defaultGroupId).toBe('A');
    expect(train.train.conductorId).toBeNull();
  });

  it('signs up who made it as their automatic status says, or not at all', () => {
    for (const status of [PartyStatus.Interested, PartyStatus.Coming]) {
      expect(inGyms(testTrain({ autoStatus: status }).attendees)).toEqual({
        [REPORTER]: { number: 1, status, group: 'A', remote: false },
      });
    }
    // A train without a stop has no "here": Here signs the maker up as coming.
    expect(inGyms(testTrain({ autoStatus: PartyStatus.Present }).attendees)).toEqual({
      [REPORTER]: { number: 1, status: PartyStatus.Coming, group: 'A', remote: false },
    });
    // None is stored as not interested; anything else that is no way of coming counts the same.
    for (const status of [PartyStatus.NotInterested, PartyStatus.Complete]) {
      const train = testTrain({ autoStatus: status });
      expect(inGyms(train.attendees)).toEqual({});
      expect(train.createdById).toBe(REPORTER);
      expect(train.train.conductorId).toBeNull();
      // It is a train like any other: it survives the state document.
      expect(inGyms(partyState(train).attendees)).toEqual([]);
    }
  });

  it('lets who made it lay its route and set its start without being signed up', () => {
    const train = testTrain({ autoStatus: PartyStatus.NotInterested });
    expect(mayArrange(train, REPORTER)).toBe(true);
    expect(mayArrange(train, ALICE)).toBe(false);
    // Somebody else who is not signed up is refused as before.
    expect(inGyms(addStop(train, ALICE, gym(4)))).toEqual({ ok: false, reason: 'not-attending' });
    const first = addStop(train, REPORTER, gym(4));
    const second = first.ok ? addStop(first.party, REPORTER, gym(1)) : first;
    const third = second.ok ? addStop(second.party, REPORTER, gym(7)) : second;
    if (!third.ok) throw new Error(third.reason);
    expect(inGyms(third.party.train.route)).toEqual([4, 1, 7]);
    const moved = moveStop(third.party, REPORTER, 3, 2);
    if (!moved.ok) throw new Error(moved.reason);
    expect(inGyms(moved.party.train.route)).toEqual([4, 7, 1]);
    // A stop the train is not at is taken off; the one it is at would move the train.
    const removed = removeStop(moved.party, REPORTER, 3);
    if (!removed.ok) throw new Error(removed.reason);
    expect(inGyms(removed.party.train.route)).toEqual([4, 7]);
    expect(inGyms(removeStop(moved.party, REPORTER, 1))).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    expect(
      inGyms(setStartTime(train, { id: REPORTER, staff: false }, PARTY_NOW + HOUR, PARTY_NOW)),
    ).toMatchObject({
      ok: true,
    });
    expect(
      inGyms(setStartTime(train, { id: ALICE, staff: false }, PARTY_NOW + HOUR, PARTY_NOW)),
    ).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    // A first route may be loaded; one that replaces a route moves the train.
    expect(inGyms(replaceRoute(train, REPORTER, stops(4, 1)))).toMatchObject({
      ok: true,
      moved: false,
    });
    expect(inGyms(replaceRoute(train, ALICE, stops(4, 1)))).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    expect(inGyms(replaceRoute(removed.party, REPORTER, stops(1, 7)))).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    // Moving it and being its conductor still take a sign-up.
    expect(mayNotMove(removed.party, REPORTER, false)).toBe('not-attending');
    expect(inGyms(moveTrain(removed.party, REPORTER, 'next', false))).toMatchObject({
      ok: false,
      reason: 'not-attending',
    });
    expect(inGyms(setConductor(train, REPORTER))).toEqual({ ok: false, reason: 'not-attending' });
    // The maker of a meetup who left it arranges nothing by having made it; its times are theirs
    // all the same, by a rule of its own (`mayEditMeetup`, plan 8Z-2).
    const left = { ...testMeetup(), attendees: {} };
    expect(mayArrange(left, REPORTER)).toBe(false);
    const maker = { id: REPORTER, staff: false };
    expect(setStartTime(left, maker, PARTY_NOW + HOUR, PARTY_NOW)).toMatchObject({ ok: true });
  });

  it('names its maker unless they asked not to be named', () => {
    expect(testTrain().anonymous).toBe(false);
    expect(testTrain({ anonymous: false }).anonymous).toBe(false);
    const hidden = testTrain({ anonymous: true });
    expect(hidden.anonymous).toBe(true);
    expect(hidden.createdById).toBe(REPORTER);
    expect(partyState(hidden).anonymous).toBe(true);
  });

  it('counts a train without times as going on for a day after it was made', () => {
    expect(testTrain().lastPossibleTime).toBe(PARTY_NOW + OPEN_PARTY_HOURS * HOUR);
    expect(testTrain().deletionTime).toBeNull();
  });

  it('tidies the name as a meetup does, and refuses a text that is no name', () => {
    expect(testTrain({ name: '  Saturday \n  legendaries\t' }).timed.name).toBe(
      'Saturday legendaries',
    );
    const refusal = { ok: false, reason: 'bad-name' };
    const input = { id: 'x', guildId: 1, regionId: 1, createdById: REPORTER, now: PARTY_NOW };
    expect(inGyms(createTrain({ ...input, name: '   ' }))).toEqual(refusal);
    expect(inGyms(createTrain({ ...input, name: 'x'.repeat(81) }))).toEqual(refusal);
    expect(createTrain({ ...input, name: 'x'.repeat(80) }).ok).toBe(true);
  });
});

describe('a train among the kinds of party', () => {
  const [raid, meetup, train] = [testRaid(), testMeetup(), testTrain()];

  it('is a timed party like a meetup, and neither a raid nor a meetup', () => {
    expect(inGyms([raid, meetup, train].map(isTimed))).toEqual([false, true, true]);
    expect(inGyms([raid, meetup, train].map(isTrain))).toEqual([false, false, true]);
    expect(inGyms([raid, meetup, train].map(isMeetup))).toEqual([false, true, false]);
    expect(inGyms([raid, meetup, train].map(isRaid))).toEqual([true, false, false]);
  });

  it('has groups like a raid, and can be joined remotely', () => {
    expect(inGyms([raid, meetup, train].map(hasGroups))).toEqual([true, false, true]);
    expect(remoteAllowed(train)).toBe(true);
  });

  it('is called a train in a sentence', () => {
    expect(partyWord(train)).toBe('train');
  });
});

/** A train on a route, at the stop with this index; Alice and Bob are signed up beside its maker. */
function onRoute(
  route: readonly number[],
  stop = 0,
  more: Partial<Omit<TrainDetails, 'finishedFrom'>> & { finishedFrom?: number | null } = {},
): TrainParty {
  const train = withAttendees(testTrain(), { [ALICE]: {}, [BOB]: {} });
  const { finishedFrom, ...rest } = more;
  return {
    ...train,
    train: {
      ...train.train,
      route: stops(...route),
      stop,
      ...rest,
      ...(finishedFrom === undefined
        ? {}
        : { finishedFrom: finishedFrom === null ? null : gym(finishedFrom) }),
    },
  };
}

/** The route and the stop of what a change answered; throws when it was refused. */
function where(change: Change<TrainParty>): { route: readonly unknown[]; stop: number } {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  const { route, stop } = change.party.train;
  return { route: route.map((ref) => inGyms(ref)), stop };
}

const refusal = (reason: string) => ({ ok: false, reason });

describe('where a train is', () => {
  it('is at no gym without a route, at its current stop on one, and at none once finished', () => {
    expect(currentStop(testTrain())).toBeUndefined();
    expect(nextStop(testTrain())).toBeUndefined();
    expect(routeFinished(testTrain())).toBe(false);
    const train = onRoute([4, 1, 7], 1);
    expect(inGyms(currentStop(train))).toBe(1);
    expect(inGyms(nextStop(train))).toBe(7);
    expect(routeFinished(train)).toBe(false);
    const last = onRoute([4, 1, 7], 2);
    expect(inGyms(currentStop(last))).toBe(7);
    expect(nextStop(last)).toBeUndefined();
    const finished = onRoute([4, 1, 7], 3);
    expect(currentStop(finished)).toBeUndefined();
    expect(nextStop(finished)).toBeUndefined();
    expect(routeFinished(finished)).toBe(true);
  });
});

describe('routeAhead: what the post says lies ahead', () => {
  /** A route of seven gyms, 11 to 17, at the stop with this index. */
  const seven = (stop: number, atEnd: TrainAtEnd = 'finish') =>
    onRoute([11, 12, 13, 14, 15, 16, 17], stop, { atEnd });
  const stop = (number: number, turn?: TrainTurn) => ({
    number,
    stop: number + 10,
    ...(turn === undefined ? {} : { turn }),
  });

  it('says nothing of a train without a route', () => {
    expect(inGyms(routeAhead(testTrain()))).toEqual({ kind: 'no-route' });
  });

  it('gives a route of three stops or fewer whole, with where the train is and its mode', () => {
    expect(inGyms(routeAhead(onRoute([4, 1, 7], 1, { atEnd: 'loop' })))).toEqual({
      kind: 'whole',
      route: [4, 1, 7],
      current: 1,
      atEnd: 'loop',
    });
    // Finished: at no stop.
    expect(inGyms(routeAhead(onRoute([4, 1, 7], 3)))).toEqual({
      kind: 'whole',
      route: [4, 1, 7],
      current: undefined,
      atEnd: 'finish',
    });
    // A route of one stop finishes in every mode.
    expect(inGyms(routeAhead(onRoute([4], 0, { atEnd: 'turn-back' })))).toMatchObject({
      atEnd: 'finish',
    });
  });

  it('gives the next two stops of a longer route that finishes, and how many more to the end', () => {
    expect(inGyms(routeAhead(seven(0)))).toEqual({
      kind: 'next',
      stops: [stop(2), stop(3)],
      rest: { count: 4, toward: 'end' },
    });
    expect(inGyms(routeAhead(seven(1)))).toEqual({
      kind: 'next',
      stops: [stop(3), stop(4)],
      rest: { count: 3, toward: 'end' },
    });
    // When the two shown reach the last stop, the line says so.
    expect(inGyms(routeAhead(seven(4)))).toEqual({
      kind: 'next',
      stops: [stop(6), stop(7)],
      then: 'last-stop',
    });
    expect(inGyms(routeAhead(seven(5)))).toEqual({
      kind: 'next',
      stops: [stop(7)],
      then: 'last-stop',
    });
    expect(inGyms(routeAhead(seven(6)))).toEqual({ kind: 'last-stop' });
    expect(inGyms(routeAhead(seven(7)))).toEqual({ kind: 'finished' });
  });

  it('looks past the end of a loop: round again, and how many more round it', () => {
    expect(inGyms(routeAhead(seven(1, 'loop')))).toEqual({
      kind: 'next',
      stops: [stop(3), stop(4)],
      rest: { count: 4, toward: 'loop' },
    });
    expect(inGyms(routeAhead(seven(5, 'loop')))).toEqual({
      kind: 'next',
      stops: [stop(7), stop(1, 'round')],
      rest: { count: 4, toward: 'loop' },
    });
    expect(inGyms(routeAhead(seven(6, 'loop')))).toEqual({
      kind: 'next',
      stops: [stop(1, 'round'), stop(2)],
      rest: { count: 4, toward: 'loop' },
    });
    // A route finished by Finish is finished whatever the mode.
    expect(inGyms(routeAhead(seven(7, 'loop')))).toEqual({ kind: 'finished' });
  });

  it('looks past the end of a train that turns back, and counts the stops back to the start', () => {
    // On the way out: how many more before it turns.
    expect(inGyms(routeAhead(seven(1, 'turn-back')))).toEqual({
      kind: 'next',
      stops: [stop(3), stop(4)],
      rest: { count: 3, toward: 'turn' },
    });
    // The two shown reach the last stop, where it turns.
    expect(inGyms(routeAhead(seven(4, 'turn-back')))).toEqual({
      kind: 'next',
      stops: [stop(6), stop(7)],
      then: 'turns-back',
    });
    // One stop before the end the second next stop is this one (Matt, 2026-10-17: "then back
    // here").
    expect(inGyms(routeAhead(seven(5, 'turn-back')))).toEqual({
      kind: 'next',
      stops: [stop(7)],
      then: 'back-here',
      rest: { count: 5, toward: 'start' },
    });
    // At the last stop: back along the route, numbered as it is stored now.
    expect(inGyms(routeAhead(seven(6, 'turn-back')))).toEqual({
      kind: 'next',
      stops: [stop(6, 'back'), stop(5)],
      rest: { count: 4, toward: 'start' },
    });
    expect(inGyms(routeAhead(seven(7, 'turn-back')))).toEqual({ kind: 'finished' });
  });

  it('agrees with where Next takes the train, twice, for every length, mode and stop', () => {
    const routes = [4, 5, 6, 7].flatMap((length) => {
      const route = Array.from({ length }, (_, index) => 11 + index);
      // A route after a turn or a Reverse is stored the other way round.
      return [route, [...route].reverse()];
    });
    for (const route of routes) {
      for (const atEnd of TRAIN_AT_END) {
        for (let at = 0; at < route.length; at++) {
          const train = onRoute(route, at, { atEnd });
          const ahead = routeAhead(train);
          const where = `${route.join(',')} ${atEnd} at ${at}`;
          if (ahead.kind !== 'next') {
            expect([where, ahead.kind, nextStop(train)]).toEqual([where, 'last-stop', undefined]);
            continue;
          }
          const [first, second] = ahead.stops;
          expect([where, first?.stop, first?.turn]).toEqual([
            where,
            nextStop(train),
            turnAhead(train),
          ]);
          expect(first?.number).toBe((first ? route.indexOf(gymIdOf(first.stop) ?? -1) : -1) + 1);
          // Where Next leads from there.
          const step = destinationOf(train, 'next');
          const there = onRoute(
            step.route.map((ref) => gymIdOf(ref) ?? -1),
            step.stop,
            { atEnd },
          );
          if (ahead.then === 'back-here') {
            expect([where, second, nextStop(there)]).toEqual([
              where,
              undefined,
              currentStop(train),
            ]);
          } else if (second) {
            expect([where, second.stop, second.turn]).toEqual([
              where,
              nextStop(there),
              turnAhead(there),
            ]);
          }
          // How many more is said whenever there are more, and only then.
          expect(ahead.rest === undefined || ahead.rest.count > 0).toBe(true);
        }
      }
    }
    // The boundaries of a route of four stops.
    const four = (at: number, atEnd: TrainAtEnd) =>
      routeAhead(onRoute([11, 12, 13, 14], at, { atEnd }));
    expect(inGyms(four(0, 'finish'))).toEqual({
      kind: 'next',
      stops: [stop(2), stop(3)],
      rest: { count: 1, toward: 'end' },
    });
    expect(inGyms(four(1, 'finish'))).toEqual({
      kind: 'next',
      stops: [stop(3), stop(4)],
      then: 'last-stop',
    });
    expect(inGyms(four(0, 'turn-back'))).toEqual({
      kind: 'next',
      stops: [stop(2), stop(3)],
      rest: { count: 1, toward: 'turn' },
    });
    expect(inGyms(four(1, 'turn-back'))).toEqual({
      kind: 'next',
      stops: [stop(3), stop(4)],
      then: 'turns-back',
    });
    expect(inGyms(four(3, 'loop'))).toEqual({
      kind: 'next',
      stops: [stop(1, 'round'), stop(2)],
      rest: { count: 1, toward: 'loop' },
    });
  });
});

describe('addStop', () => {
  it('appends a gym, and the first stop is where the train is', () => {
    const first = addStop(testTrain(), REPORTER, gym(4));
    expect(inGyms(first)).toMatchObject({ ok: true, number: 1 });
    expect(inGyms(where(first))).toEqual({ route: [4], stop: 0 });
    const second = addStop(onRoute([4, 1], 1), ALICE, gym(7));
    expect(inGyms(second)).toMatchObject({ ok: true, number: 3 });
    expect(inGyms(where(second))).toEqual({ route: [4, 1, 7], stop: 1 });
  });

  it('is for members who are signed up', () => {
    expect(inGyms(addStop(testTrain(), CAROL, gym(4)))).toEqual(refusal('not-attending'));
  });

  it('refuses a gym that is on the route already, and a stop beyond what a route holds', () => {
    expect(inGyms(addStop(onRoute([4, 1]), ALICE, gym(1)))).toEqual(refusal('already-on-route'));
    const full = onRoute(Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1));
    expect(inGyms(addStop(full, ALICE, gym(99)))).toEqual(refusal('route-full'));
    const almost = onRoute(Array.from({ length: MAX_ROUTE_STOPS - 1 }, (_, index) => index + 1));
    expect(addStop(almost, ALICE, gym(99)).ok).toBe(true);
  });

  it('makes a train that had finished its route go on at the new stop', () => {
    const more = addStop(onRoute([4, 1], 2), ALICE, gym(7));
    expect(inGyms(where(more))).toEqual({ route: [4, 1, 7], stop: 2 });
    expect(inGyms(more.ok && currentStop(more.party))).toBe(7);
    expect(more.ok && routeFinished(more.party)).toBe(false);
  });
});

describe('removeStop', () => {
  it('takes a stop off by its number and says which gym it was', () => {
    const removed = removeStop(onRoute([4, 1, 7]), ALICE, 2);
    expect(inGyms(removed)).toMatchObject({ ok: true, stop: 1 });
    expect(inGyms(where(removed))).toEqual({ route: [4, 7], stop: 0 });
  });

  it('keeps the train at its gym when an earlier or a later stop goes', () => {
    // At gym 7 (the third stop); the legacy bot would have been at gym 9 afterwards.
    const earlier = removeStop(onRoute([4, 1, 7, 9], 2), ALICE, 1);
    expect(inGyms(where(earlier))).toEqual({ route: [1, 7, 9], stop: 1 });
    expect(inGyms(earlier.ok && currentStop(earlier.party))).toBe(7);
    const later = removeStop(onRoute([4, 1, 7, 9], 2), ALICE, 4);
    expect(inGyms(where(later))).toEqual({ route: [4, 1, 7], stop: 2 });
  });

  it('makes the stop after the current one current when the current one goes', () => {
    const removed = removeStop(onRoute([4, 1, 7, 9], 1), ALICE, 2);
    expect(inGyms(where(removed))).toEqual({ route: [4, 7, 9], stop: 1 });
    expect(inGyms(removed.ok && currentStop(removed.party))).toBe(7);
  });

  it('finishes the route when the current stop was the last one', () => {
    const removed = removeStop(onRoute([4, 1, 7], 2), ALICE, 3);
    expect(inGyms(where(removed))).toEqual({ route: [4, 1], stop: 2 });
    expect(removed.ok && routeFinished(removed.party)).toBe(true);
  });

  it('sends a loop train to the first stop when the current last stop goes', () => {
    const removed = removeStop(onRoute([4, 1, 7], 2, { atEnd: 'loop' }), ALICE, 3);
    expect(inGyms(removed)).toMatchObject({ ok: true, stop: 7, moved: true });
    expect(inGyms(where(removed))).toEqual({ route: [4, 1], stop: 0 });
    expect(removed.ok && routeFinished(removed.party)).toBe(false);
    expect(removed.ok && removed.party.train.atEnd).toBe('loop');
  });

  it('turns a turn-back train round at the gym before the current last stop that goes', () => {
    const removed = removeStop(onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }), ALICE, 3);
    expect(inGyms(removed)).toMatchObject({ ok: true, stop: 7, moved: true });
    expect(inGyms(where(removed))).toEqual({ route: [1, 4], stop: 0 });
    expect(inGyms(removed.ok && currentStop(removed.party))).toBe(1);
    expect(removed.ok && removed.party.train.atEnd).toBe('turn-back');
  });

  it('puts who was here back to coming when the last stop of a loop goes', () => {
    const train = onRoute([4, 1, 7], 2, { atEnd: 'loop' });
    const here = {
      ...train,
      attendees: {
        ...train.attendees,
        [ALICE]: { ...train.attendees[ALICE]!, status: PartyStatus.Present },
      },
    };
    const removed = removeStop(here, ALICE, 3);
    expect(removed.ok && removed.party.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
  });

  it('finishes a loop or turn-back train that is left with fewer than two stops', () => {
    for (const atEnd of ['loop', 'turn-back'] as const) {
      expect(inGyms(where(removeStop(onRoute([4, 1], 1, { atEnd }), ALICE, 2)))).toEqual({
        route: [4],
        stop: 1,
      });
    }
  });

  it('leaves a loop train where it is when another stop goes, and finishes one that finishes', () => {
    expect(inGyms(where(removeStop(onRoute([4, 1, 7], 2, { atEnd: 'loop' }), ALICE, 1)))).toEqual({
      route: [1, 7],
      stop: 1,
    });
    expect(inGyms(where(removeStop(onRoute([4, 1, 7], 1, { atEnd: 'loop' }), ALICE, 2)))).toEqual({
      route: [4, 7],
      stop: 1,
    });
    expect(inGyms(where(removeStop(onRoute([4, 1, 7], 2, { atEnd: 'finish' }), ALICE, 3)))).toEqual(
      {
        route: [4, 1],
        stop: 2,
      },
    );
  });

  it('keeps a finished route finished, and puts a train without stops at the start', () => {
    expect(inGyms(where(removeStop(onRoute([4, 1, 7], 3), ALICE, 1)))).toEqual({
      route: [1, 7],
      stop: 2,
    });
    expect(inGyms(where(removeStop(onRoute([4, 1, 7], 3, { atEnd: 'loop' }), ALICE, 1)))).toEqual({
      route: [1, 7],
      stop: 2,
    });
    const emptied = removeStop(onRoute([4], 0), ALICE, 1);
    expect(inGyms(where(emptied))).toEqual({ route: [], stop: 0 });
    expect(inGyms(where(removeStop(onRoute([4], 1), ALICE, 1)))).toEqual({ route: [], stop: 0 });
    expect(emptied.ok && routeFinished(emptied.party)).toBe(false);
  });

  it('refuses a number the route does not have, and a member who is not signed up', () => {
    const train = onRoute([4, 1, 7]);
    for (const number of [0, 4, -1, 1.5, Number.NaN]) {
      expect(inGyms(removeStop(train, ALICE, number))).toEqual(refusal('no-such-stop'));
    }
    expect(inGyms(removeStop(testTrain(), REPORTER, 1))).toEqual(refusal('no-such-stop'));
    expect(inGyms(removeStop(train, CAROL, 1))).toEqual(refusal('not-attending'));
  });
});

describe('moveStop', () => {
  it('moves a stop to the number it is to have, also to the end and to the start', () => {
    const train = onRoute([4, 1, 7, 9], 3);
    expect(inGyms(where(moveStop(train, ALICE, 1, 4)).route)).toEqual([1, 7, 9, 4]);
    expect(inGyms(where(moveStop(train, ALICE, 4, 1)).route)).toEqual([9, 4, 1, 7]);
    expect(inGyms(where(moveStop(train, ALICE, 2, 3)).route)).toEqual([4, 7, 1, 9]);
    expect(inGyms(where(moveStop(train, ALICE, 3, 2)).route)).toEqual([4, 7, 1, 9]);
    expect(inGyms(moveStop(train, ALICE, 1, 4))).toMatchObject({ ok: true, stop: 4 });
  });

  it('keeps the train at the gym it is at, whichever stop moves', () => {
    // At gym 1, the second stop.
    const train = onRoute([4, 1, 7, 9], 1);
    const at = (change: Change<TrainParty>) => change.ok && currentStop(change.party);
    // The current stop itself moves: the train goes with it.
    expect(inGyms(where(moveStop(train, ALICE, 2, 4)))).toEqual({ route: [4, 7, 9, 1], stop: 3 });
    // A stop from before it moves behind it, and one from behind it before it.
    expect(inGyms(where(moveStop(train, ALICE, 1, 3)))).toEqual({ route: [1, 7, 4, 9], stop: 0 });
    expect(inGyms(where(moveStop(train, ALICE, 4, 1)))).toEqual({ route: [9, 4, 1, 7], stop: 2 });
    for (const [from, to] of [
      [2, 4],
      [1, 3],
      [4, 1],
      [3, 4],
    ] as const) {
      expect(inGyms(at(moveStop(train, ALICE, from, to)))).toBe(1);
    }
  });

  it('keeps a finished route finished', () => {
    expect(inGyms(where(moveStop(onRoute([4, 1, 7], 3), ALICE, 1, 3)))).toEqual({
      route: [1, 7, 4],
      stop: 3,
    });
  });

  it('returns the very same party when the stop stays where it is', () => {
    const train = onRoute([4, 1, 7]);
    const same = moveStop(train, ALICE, 2, 2);
    expect(same.ok && same.party).toBe(train);
  });

  it('refuses numbers the route does not have, and a member who is not signed up', () => {
    const train = onRoute([4, 1, 7]);
    expect(inGyms(moveStop(train, ALICE, 0, 2))).toEqual(refusal('no-such-stop'));
    expect(inGyms(moveStop(train, ALICE, 2, 4))).toEqual(refusal('no-such-stop'));
    expect(inGyms(moveStop(train, ALICE, 2.5, 1))).toEqual(refusal('no-such-stop'));
    expect(inGyms(moveStop(train, CAROL, 1, 2))).toEqual(refusal('not-attending'));
  });
});

describe('clearRoute and replaceRoute', () => {
  it('clears the route for the conductor and for staff, and puts the train at the start', () => {
    const train = onRoute([4, 1, 7], 2, { conductorId: ALICE });
    expect(inGyms(where(clearRoute(train, ALICE, false)))).toEqual({ route: [], stop: 0 });
    expect(inGyms(where(clearRoute(train, CAROL, true)))).toEqual({ route: [], stop: 0 });
    expect(inGyms(clearRoute(train, BOB, false))).toEqual(refusal('conductor-or-staff'));
    // Without a conductor it is for staff alone.
    expect(inGyms(clearRoute(onRoute([4]), ALICE, false))).toEqual(refusal('conductor-or-staff'));
    const empty = testTrain();
    const same = clearRoute(empty, CAROL, true);
    expect(same.ok && same.party).toBe(empty);
  });

  it('keeps the conductor and the boss when the route is cleared', () => {
    const train = onRoute([4, 1], 1, { conductorId: ALICE, boss: { key: 'yveltal' } });
    const cleared = clearRoute(train, ALICE, false);
    expect(inGyms(cleared.ok && cleared.party.train)).toEqual({
      kind: 'raid',
      route: [],
      stop: 0,
      finishedFrom: null,
      atEnd: 'finish',
      conductorId: ALICE,
      boss: { key: 'yveltal' },
      splitFrom: null,
      splitOff: [],
    });
  });

  it('replaces the route and starts at its first stop, wherever the train was', () => {
    expect(inGyms(where(replaceRoute(onRoute([4, 1, 7], 2), ALICE, stops(9, 7, 2))))).toEqual({
      route: [9, 7, 2],
      stop: 0,
    });
    expect(inGyms(where(replaceRoute(onRoute([4], 1), ALICE, stops(4))))).toEqual({
      route: [4],
      stop: 0,
    });
    // The very same party when it has that route and is at its first stop.
    const there = onRoute([9, 7, 2]);
    const same = replaceRoute(there, ALICE, stops(9, 7, 2));
    expect(same.ok && same.party).toBe(there);
  });

  it('takes each gym of a loaded route once, and no more than a route holds', () => {
    expect(inGyms(where(replaceRoute(testTrain(), REPORTER, stops(4, 1, 4, 7, 1))).route)).toEqual([
      4, 1, 7,
    ]);
    const long = Array.from({ length: 60 }, (_, index) => index + 1);
    expect(where(replaceRoute(testTrain(), REPORTER, stops(...long))).route).toHaveLength(
      MAX_ROUTE_STOPS,
    );
  });

  it('refuses a route without a gym, and a member who is not signed up', () => {
    expect(inGyms(replaceRoute(onRoute([4]), ALICE, stops()))).toEqual(refusal('empty-route'));
    expect(inGyms(replaceRoute(onRoute([4]), CAROL, stops(1)))).toEqual(refusal('not-attending'));
  });
});

describe('moveTrain', () => {
  it('goes to the next stop, and from the last one finishes the route', () => {
    const train = onRoute([4, 1, 7]);
    const second = moveTrain(train, ALICE, 'next', false);
    expect(inGyms(second)).toMatchObject({ ok: true, move: 'next', at: 1, finished: false });
    expect(inGyms(where(second).stop)).toBe(1);
    const end = moveTrain(onRoute([4, 1, 7], 2), ALICE, 'next', false);
    expect(inGyms(end)).toMatchObject({ ok: true, move: 'next', at: undefined, finished: true });
    expect(inGyms(where(end).stop)).toBe(3);
    expect(inGyms(moveTrain(onRoute([4, 1, 7], 3), ALICE, 'next', false))).toEqual(
      refusal('route-finished'),
    );
  });

  it('goes back one stop, from a route that an edit finished to its last stop, and not from the first stop', () => {
    expect(inGyms(moveTrain(onRoute([4, 1, 7], 2), ALICE, 'previous', false))).toMatchObject({
      ok: true,
      at: 1,
      finished: false,
    });
    const back = moveTrain(onRoute([4, 1, 7], 3), ALICE, 'previous', false);
    expect(inGyms(back)).toMatchObject({ ok: true, at: 7, finished: false });
    expect(inGyms(where(back).stop)).toBe(2);
    expect(inGyms(moveTrain(onRoute([4, 1, 7], 0), ALICE, 'previous', false))).toEqual(
      refusal('at-first-stop'),
    );
  });

  it('skips the next stop and names it, when there is a stop after it', () => {
    const skipped = moveTrain(onRoute([4, 1, 7, 9]), ALICE, 'skip', false);
    expect(inGyms(skipped)).toMatchObject({
      ok: true,
      move: 'skip',
      at: 7,
      skipped: 1,
      finished: false,
    });
    expect(inGyms(where(skipped).stop)).toBe(2);
    // From the second to last stop there is a next one, but none after it.
    expect(inGyms(moveTrain(onRoute([4, 1, 7, 9], 2), ALICE, 'skip', false))).toEqual(
      refusal('no-stop-to-skip'),
    );
    expect(inGyms(moveTrain(onRoute([4, 1, 7, 9], 3), ALICE, 'skip', false))).toEqual(
      refusal('no-stop-to-skip'),
    );
    expect(inGyms(moveTrain(onRoute([4, 1, 7, 9], 4), ALICE, 'skip', false))).toEqual(
      refusal('no-stop-to-skip'),
    );
  });

  it('finishes the route from any stop, once, and changes neither status nor times of the party', () => {
    const train = onRoute([4, 1, 7], 1);
    const finished = moveTrain(train, ALICE, 'finish', false);
    expect(inGyms(finished)).toMatchObject({
      ok: true,
      move: 'finish',
      at: undefined,
      finished: true,
    });
    expect(inGyms(where(finished).stop)).toBe(3);
    expect(inGyms(finished.ok && finished.party)).toMatchObject({
      status: 'active',
      endTime: train.endTime,
      lastPossibleTime: train.lastPossibleTime,
      deletionTime: null,
    });
    expect(inGyms(moveTrain(onRoute([4, 1, 7], 3), ALICE, 'finish', false))).toEqual(
      refusal('route-finished'),
    );
  });

  it('refuses every move on a train without a route', () => {
    const train = withAttendees(testTrain(), { [ALICE]: {} });
    for (const move of TRAIN_MOVES) {
      expect(inGyms(moveTrain(train, ALICE, move, false))).toEqual(refusal('no-route'));
      expect(cannotMove(train, move)).toBe('no-route');
    }
  });

  it('puts everybody who is here back to coming, keeping count, group, remote, name and team', () => {
    const train: TrainParty = {
      ...withAttendees(onRoute([4, 1, 7, 9], 1), {
        [ALICE]: {
          status: PartyStatus.Present,
          number: 3,
          group: 'B',
          remote: true,
          name: 'Alice',
          team: 'valor',
        },
        [BOB]: { status: PartyStatus.Present },
        [CAROL]: { status: PartyStatus.Interested, number: 2 },
      }),
      groups: [{ id: 'A' }, { id: 'B' }],
    };
    // Not Finish: there is nowhere to come to then.
    for (const move of ['next', 'previous', 'skip'] as const) {
      const moved = moveTrain(train, BOB, move, false);
      if (!moved.ok) throw new Error(moved.reason);
      expect(inGyms(moved.party.attendees)).toEqual({
        [REPORTER]: train.attendees[REPORTER],
        [ALICE]: { ...train.attendees[ALICE], status: PartyStatus.Coming },
        [BOB]: { ...train.attendees[BOB], status: PartyStatus.Coming },
        [CAROL]: train.attendees[CAROL],
      });
      // Who signed up first is still first.
      expect(inGyms(Object.keys(moved.party.attendees))).toEqual(Object.keys(train.attendees));
    }
  });

  it('is for anybody who is signed up while there is no conductor, and for staff', () => {
    const train = onRoute([4, 1, 7]);
    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
    expect(inGyms(moveTrain(train, CAROL, 'next', false))).toEqual(refusal('not-attending'));
    expect(moveTrain(train, CAROL, 'next', true).ok).toBe(true);
    expect(mayNotMove(train, CAROL, false)).toBe('not-attending');
    expect(mayNotMove(train, ALICE, false)).toBeUndefined();
  });

  it('is for the conductor and for staff alone once there is a conductor', () => {
    const train = onRoute([4, 1, 7], 1, { conductorId: ALICE });
    for (const move of TRAIN_MOVES) {
      expect(inGyms(moveTrain(train, BOB, move, false))).toEqual(refusal('not-conductor'));
      expect(inGyms(moveTrain(train, CAROL, move, false))).toEqual(refusal('not-conductor'));
    }
    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
    expect(moveTrain(train, CAROL, 'previous', true).ok).toBe(true);
  });

  it('says who may not move before it says that the move cannot be made', () => {
    expect(inGyms(moveTrain(testTrain(), CAROL, 'next', false))).toEqual(refusal('not-attending'));
    const led = onRoute([4], 1, { conductorId: ALICE });
    expect(inGyms(moveTrain(led, BOB, 'next', false))).toEqual(refusal('not-conductor'));
  });

  it('knows its moves by name', () => {
    expect(TRAIN_MOVES.every(isTrainMove)).toBe(true);
    expect(isTrainMove('join')).toBe(false);
  });
});

describe('the conductor', () => {
  it('is a member who is signed up and says so', () => {
    const set = setConductor(onRoute([4]), ALICE);
    expect(inGyms(set)).toMatchObject({ ok: true, previous: null });
    expect(set.ok && set.party.train.conductorId).toBe(ALICE);
    expect(inGyms(setConductor(onRoute([4]), CAROL))).toEqual(refusal('not-attending'));
  });

  it('can be taken over from another conductor, whom the answer names', () => {
    const led = onRoute([4], 0, { conductorId: ALICE });
    const taken = setConductor(led, BOB);
    expect(inGyms(taken)).toMatchObject({ ok: true, previous: ALICE });
    expect(taken.ok && taken.party.train.conductorId).toBe(BOB);
    const same = setConductor(led, ALICE);
    expect(same.ok && same.party).toBe(led);
  });

  it('is taken off by themself or by staff, and by nobody else', () => {
    const led = onRoute([4], 0, { conductorId: ALICE });
    const own = clearConductor(led, ALICE, false);
    expect(inGyms(own)).toMatchObject({ ok: true, previous: ALICE });
    expect(own.ok && own.party.train.conductorId).toBeNull();
    expect(inGyms(clearConductor(led, CAROL, true))).toMatchObject({ ok: true, previous: ALICE });
    expect(inGyms(clearConductor(led, BOB, false))).toEqual(refusal('conductor-or-staff'));
    const none = onRoute([4]);
    const same = clearConductor(none, BOB, false);
    expect(inGyms(same)).toMatchObject({ ok: true, previous: null });
    expect(same.ok && same.party).toBe(none);
  });
});

describe('the boss of a train', () => {
  it('is the Pokémon the train is after, by key or by the name of the feed, or none', () => {
    const train = testTrain();
    expect(bossOf(train)).toBeNull();
    const set = setTrainBoss(train, { key: 'yveltal' });
    expect(inGyms(set.ok && bossOf(set.party))).toEqual({ key: 'yveltal' });
    const named = setTrainBoss(train, { name: 'Newmon' });
    expect(inGyms(named.ok && named.party.train.boss)).toEqual({ name: 'Newmon' });
    const again = set.ok ? setTrainBoss(set.party, { key: 'yveltal' }) : set;
    expect(again.ok && set.ok && again.party).toBe(set.ok && set.party);
    const none = set.ok ? setTrainBoss(set.party, null) : set;
    expect(none.ok && none.party.train.boss).toBeNull();
  });

  it('is asked of every kind of party in one way', () => {
    expect(bossOf(testRaid())).toBeNull();
    expect(inGyms(bossOf(testRaid({ boss: { key: 'yveltal' } })))).toEqual({ key: 'yveltal' });
    expect(bossOf(testMeetup())).toBeNull();
  });
});

describe('attendance in a train', () => {
  const limits = { maxNumber: 6 };

  it('has groups like a raid: open one, move between them, label them', () => {
    const train = withAttendees(testTrain(), { [ALICE]: {} });
    const opened = createGroup(train, ALICE, limits);
    expect(inGyms(opened)).toMatchObject({ ok: true, group: 'B', others: [REPORTER] });
    if (!opened.ok) throw new Error(opened.reason);
    expect(inGyms(opened.party.groups)).toEqual([{ id: 'A' }, { id: 'B', opened: PARTY_NOW + 1 }]);
    expect(opened.party.attendees[ALICE]?.group).toBe('B');
    const joined = joinGroup(opened.party, BOB, 'B', limits);
    expect(inGyms(joined.ok && joined.party.attendees[BOB])).toMatchObject({
      group: 'B',
      status: PartyStatus.Coming,
    });
    const labelled = labelGroup(opened.party, ALICE, 'by car');
    expect(inGyms(labelled.ok && labelled.party.groups[1])).toEqual({
      id: 'B',
      opened: PARTY_NOW + 1,
      label: 'by car',
    });
    // Each by a newcomer: a new group for a member alone in one of their own changes nothing.
    let five: TrainParty = train;
    for (const member of [BOB, CAROL, '200000000000000005', '200000000000000006']) {
      const more = createGroup(five, member, limits);
      if (!more.ok) throw new Error(more.reason);
      five = more.party;
    }
    expect(inGyms(createGroup(five, REPORTER, limits))).toEqual(refusal('too-many-groups'));
  });

  it('starts for everybody at once: a group has no meeting time of its own', () => {
    const train = withAttendees(testTrain(), { [ALICE]: {} });
    expect(inGyms(setMeetingTime(train, ALICE, PARTY_NOW + HOUR))).toEqual(
      refusal('party-wide-start'),
    );
    const started = setStartTime(train, { id: ALICE, staff: false }, PARTY_NOW + HOUR, PARTY_NOW);
    expect(started.ok && started.party.timed.startTime).toBe(PARTY_NOW + HOUR);
    expect(started.ok && started.party.lastPossibleTime).toBe(
      PARTY_NOW + HOUR + OPEN_PARTY_HOURS * HOUR,
    );
  });

  it('takes done for leave: nobody is asked, and nobody is ever complete', () => {
    const train = withAttendees(onRoute([4, 1]), { [BOB]: { status: PartyStatus.Present } });
    const done = finishParty(train, ALICE, PARTY_NOW, 5);
    expect(inGyms(done)).toMatchObject({ ok: true, asked: [], wasComplete: false, left: true });
    expect(inGyms(done.ok && Object.keys(done.party.attendees))).toEqual([REPORTER, BOB]);
    expect(done.ok && done.party.attendees[BOB]?.status).toBe(PartyStatus.Present);
    expect(done).not.toHaveProperty('conductorLeft');
  });

  it('frees the conductor who leaves, by leaving and by being done', () => {
    const led = onRoute([4, 1], 1, { conductorId: ALICE });
    const left = leaveParty(led, ALICE);
    expect(inGyms(left)).toMatchObject({ ok: true, conductorLeft: true });
    expect(left.ok && left.party.train).toEqual({ ...led.train, conductorId: null });
    const done = finishParty(led, ALICE, PARTY_NOW, 5);
    expect(inGyms(done)).toMatchObject({ ok: true, left: true, conductorLeft: true });
    expect(done.ok && done.party.train.conductorId).toBeNull();
  });

  it('keeps the conductor when somebody else leaves, and says nothing of it', () => {
    const led = onRoute([4, 1], 1, { conductorId: ALICE });
    const left = leaveParty(led, BOB);
    expect(left.ok && left.party.train).toBe(led.train);
    expect(left).not.toHaveProperty('conductorLeft');
    // In a raid and in a meetup nobody is a conductor.
    expect(leaveParty(testRaid(), REPORTER)).not.toHaveProperty('conductorLeft');
    expect(leaveParty(testMeetup(), REPORTER)).not.toHaveProperty('conductorLeft');
  });

  it('keeps the conductor who steps back to interested or goes remote', () => {
    const led = onRoute([4], 0, { conductorId: ALICE });
    const stepped = setNotHere(led, ALICE);
    expect(stepped.ok && stepped.party.train.conductorId).toBe(ALICE);
  });
});

describe('a route edit that changes where the train is', () => {
  /** The same train with Bob here, remotely, with a guest. */
  const withBobHere = (train: TrainParty): TrainParty =>
    withAttendees(train, { [BOB]: { status: PartyStatus.Present, number: 2, remote: true } });
  const bob = (change: Change<TrainParty>) => (change.ok ? change.party.attendees[BOB] : undefined);

  it('is a movement: with a conductor only they and staff may remove the stop the train is at', () => {
    const led = onRoute([4, 1, 7], 1, { conductorId: ALICE });
    expect(inGyms(removeStop(led, BOB, 2))).toEqual(refusal('not-conductor'));
    expect(inGyms(removeStop(led, ALICE, 2))).toMatchObject({ ok: true, stop: 1, moved: true });
    expect(inGyms(removeStop(led, BOB, 2, true))).toMatchObject({ ok: true, moved: true });
    // Another stop is anybody's who is signed up: the train stays where it is.
    expect(inGyms(removeStop(led, BOB, 1))).toMatchObject({ ok: true, stop: 4, moved: false });
    expect(inGyms(removeStop(led, BOB, 3))).toMatchObject({ ok: true, stop: 7, moved: false });
    expect(inGyms(removeStop(led, CAROL, 3))).toEqual(refusal('not-attending'));
    // Without a conductor, anybody who is signed up may.
    expect(inGyms(removeStop(onRoute([4, 1, 7], 1), BOB, 2))).toMatchObject({
      ok: true,
      moved: true,
    });
  });

  it('puts who is here back to coming when the train is at another gym by it', () => {
    const train = withBobHere(onRoute([4, 1, 7], 1));
    const removed = removeStop(train, ALICE, 2);
    expect(inGyms(removed.ok && currentStop(removed.party))).toBe(7);
    expect(inGyms(bob(removed))).toEqual({ ...train.attendees[BOB], status: PartyStatus.Coming });
    // Not when the train stays where it is.
    expect(bob(removeStop(train, ALICE, 1))).toBe(train.attendees[BOB]);
    expect(bob(moveStop(train, ALICE, 2, 3))).toBe(train.attendees[BOB]);
  });

  it('leaves who is here as they are when the edit finishes or empties the route', () => {
    const last = withBobHere(onRoute([4, 1], 1));
    const finished = removeStop(last, ALICE, 2);
    expect(inGyms(finished)).toMatchObject({ ok: true, moved: true });
    expect(finished.ok && routeFinished(finished.party)).toBe(true);
    expect(bob(finished)).toBe(last.attendees[BOB]);
    const only = withBobHere(onRoute([4], 0));
    const emptied = removeStop(only, ALICE, 1);
    expect(inGyms(emptied)).toMatchObject({ ok: true, moved: true });
    expect(bob(emptied)).toBe(only.attendees[BOB]);
  });

  it('is a movement to add a stop to a finished route', () => {
    const done = withBobHere(onRoute([4, 1], 2, { conductorId: ALICE }));
    expect(inGyms(addStop(done, BOB, gym(7)))).toEqual(refusal('not-conductor'));
    const on = addStop(done, ALICE, gym(7));
    expect(inGyms(on)).toMatchObject({ ok: true, number: 3, moved: true });
    expect(bob(on)?.status).toBe(PartyStatus.Coming);
    expect(inGyms(addStop(done, BOB, gym(7), true))).toMatchObject({ ok: true, moved: true });
    // A stop added behind the train moves nothing, and is anybody's who is signed up.
    const going = withBobHere(onRoute([4, 1], 0, { conductorId: ALICE }));
    const added = addStop(going, BOB, gym(7));
    expect(inGyms(added)).toMatchObject({ ok: true, number: 3, moved: false });
    expect(bob(added)).toBe(going.attendees[BOB]);
  });

  it('always takes the right to move the train to load a route: it puts the train at the start', () => {
    const led = withBobHere(onRoute([4, 1, 7], 1, { conductorId: ALICE }));
    expect(inGyms(replaceRoute(led, BOB, stops(9, 2)))).toEqual(refusal('not-conductor'));
    // Also for a route that would leave the train at the gym it is at.
    expect(inGyms(replaceRoute(led, BOB, stops(1, 2)))).toEqual(refusal('not-conductor'));
    const loaded = replaceRoute(led, ALICE, stops(9, 2));
    expect(inGyms(loaded)).toMatchObject({ ok: true, moved: true });
    expect(bob(loaded)?.status).toBe(PartyStatus.Coming);
    // Staff may, signed up or not; without a conductor anybody who is signed up.
    expect(inGyms(replaceRoute(led, CAROL, stops(9, 2), true))).toMatchObject({
      ok: true,
      moved: true,
    });
    expect(inGyms(replaceRoute(onRoute([4]), CAROL, stops(9)))).toEqual(refusal('not-attending'));
    // A route that begins where the train is leaves everybody as they are.
    const same = replaceRoute(withBobHere(onRoute([4, 1], 0)), ALICE, stops(4, 9));
    expect(inGyms(same)).toMatchObject({ ok: true, moved: false });
    expect(bob(same)?.status).toBe(PartyStatus.Present);
    expect(inGyms(replaceRoute(onRoute([9, 7, 2]), ALICE, stops(9, 7, 2)))).toMatchObject({
      moved: false,
    });
  });

  it('says whether clearing the route took the train from where it was', () => {
    const train = withBobHere(onRoute([4, 1], 1));
    const cleared = clearRoute(train, CAROL, true);
    expect(inGyms(cleared)).toMatchObject({ ok: true, moved: true });
    expect(bob(cleared)).toBe(train.attendees[BOB]);
    expect(inGyms(clearRoute(testTrain(), CAROL, true))).toMatchObject({ ok: true, moved: false });
  });
});

describe('Finish, and Next from the last stop', () => {
  it('leave who is here as here: there is nowhere to come to', () => {
    const train = withAttendees(onRoute([4, 1, 7], 2), { [BOB]: { status: PartyStatus.Present } });
    for (const move of ['finish', 'next'] as const) {
      const moved = moveTrain(train, ALICE, move, false);
      expect(inGyms(moved)).toMatchObject({ ok: true, finished: true });
      expect(moved.ok && moved.party.attendees).toBe(train.attendees);
    }
    const early = withAttendees(onRoute([4, 1, 7], 0), { [BOB]: { status: PartyStatus.Present } });
    const finished = moveTrain(early, ALICE, 'finish', false);
    expect(finished.ok && finished.party.attendees[BOB]?.status).toBe(PartyStatus.Present);
    // Back from the end of a route that nothing is remembered of, the train goes to another gym.
    const edited = withAttendees(onRoute([4, 1, 7], 3), { [BOB]: { status: PartyStatus.Present } });
    const back = moveTrain(edited, ALICE, 'previous', false);
    expect(back.ok && back.party.attendees[BOB]?.status).toBe(PartyStatus.Coming);
  });
});

describe('a move asked for from where the train was seen', () => {
  it('names where a train is: the gym of its stop, the end of its route, or nowhere yet', () => {
    expect(placeOf(onRoute([4, 1, 7], 1))).toBe('1');
    expect(placeOf(onRoute([4, 1, 7], 3))).toBe('end');
    expect(placeOf(testTrain())).toBe('none');
  });

  it('is made only while the train is still there', () => {
    const train = onRoute([4, 1, 7], 1);
    expect(inGyms(moveTrain(train, ALICE, 'next', false, '1'))).toMatchObject({ ok: true, at: 7 });
    expect(inGyms(moveTrain(train, ALICE, 'next', false, '4'))).toEqual(refusal('train-moved-on'));
    expect(inGyms(moveTrain(train, ALICE, 'previous', false, 'end'))).toEqual(
      refusal('train-moved-on'),
    );
    expect(inGyms(moveTrain(onRoute([4, 1], 2), ALICE, 'previous', false, 'end'))).toMatchObject({
      ok: true,
    });
    // The same number of the stop, but another gym: the route was edited.
    expect(inGyms(moveTrain(onRoute([4, 9, 7], 1), ALICE, 'next', false, '1'))).toEqual(
      refusal('train-moved-on'),
    );
    // Who may not move the train is told that first.
    expect(inGyms(moveTrain(train, CAROL, 'next', false, '4'))).toEqual(refusal('not-attending'));
    // Without it (a command), the move is made from wherever the train is.
    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
  });
});

describe('the first stop of a route', () => {
  /** A train without a route, led by Alice, with Bob here. */
  const empty: TrainParty = withAttendees(onRoute([], 0, { conductorId: ALICE }), {
    [BOB]: { status: PartyStatus.Present },
  });

  it('is an ordinary edit: anybody who is signed up may add it, also with a conductor', () => {
    const added = addStop(empty, BOB, gym(7));
    expect(inGyms(added)).toMatchObject({ ok: true, number: 1, moved: false });
    expect(inGyms(added.ok && currentStop(added.party))).toBe(7);
    // Nobody was on the way anywhere: who is here stays here.
    expect(added.ok && added.party.attendees).toBe(empty.attendees);
    expect(inGyms(addStop(empty, CAROL, gym(7)))).toEqual(refusal('not-attending'));
  });

  it('comes with a loaded route too, which still takes the right to move the train', () => {
    expect(inGyms(replaceRoute(empty, BOB, stops(9, 2)))).toEqual(refusal('not-conductor'));
    const loaded = replaceRoute(empty, ALICE, stops(9, 2));
    expect(inGyms(loaded)).toMatchObject({ ok: true, moved: false });
    expect(inGyms(loaded.ok && loaded.party.train)).toMatchObject({ route: [9, 2], stop: 0 });
    expect(loaded.ok && loaded.party.attendees).toBe(empty.attendees);
  });
});

describe('staff who are not signed up', () => {
  it('may add, remove and move stops, as they may move the train', () => {
    const train = onRoute([4, 1, 7], 1, { conductorId: ALICE });
    expect(inGyms(addStop(train, CAROL, gym(9)))).toEqual(refusal('not-attending'));
    expect(inGyms(addStop(train, CAROL, gym(9), true))).toMatchObject({ ok: true, number: 4 });
    expect(inGyms(removeStop(train, CAROL, 3))).toEqual(refusal('not-attending'));
    expect(inGyms(removeStop(train, CAROL, 3, true))).toMatchObject({ ok: true, stop: 7 });
    // Also the stop the train is at.
    expect(inGyms(removeStop(train, CAROL, 2, true))).toMatchObject({ ok: true, moved: true });
    expect(inGyms(moveStop(train, CAROL, 1, 3))).toEqual(refusal('not-attending'));
    expect(inGyms(where(moveStop(train, CAROL, 1, 3, true)).route)).toEqual([1, 7, 4]);
  });
});

describe('a move asked for with the stop it was promised to lead to', () => {
  it('names where a move would take the train: the gym of that stop, or the end', () => {
    const train = onRoute([4, 1, 7], 0);
    expect(targetOf(train, 'next')).toBe('1');
    expect(targetOf(train, 'skip')).toBe('7');
    expect(targetOf(train, 'finish')).toBe('end');
    expect(targetOf(onRoute([4, 1, 7], 2), 'next')).toBe('end');
    expect(targetOf(onRoute([4, 1, 7], 1), 'previous')).toBe('4');
    expect(targetOf(onRoute([4, 1, 7], 3), 'previous')).toBe('7');
  });

  it('is made only while the move still leads there', () => {
    // The panel was drawn at gym 4 with "next is gym 1"; gym 1 was removed since.
    const edited = onRoute([4, 7, 2], 0);
    expect(inGyms(moveTrain(edited, ALICE, 'next', false, '4', '1'))).toEqual(
      refusal('route-changed'),
    );
    expect(inGyms(moveTrain(edited, ALICE, 'next', false, '4', '7'))).toMatchObject({
      ok: true,
      at: 7,
    });
    expect(inGyms(moveTrain(edited, ALICE, 'skip', false, '4', '7'))).toEqual(
      refusal('route-changed'),
    );
    expect(inGyms(moveTrain(edited, ALICE, 'skip', false, '4', '2'))).toMatchObject({
      ok: true,
      at: 2,
    });
    // A stop was added behind the last one: Next no longer finishes the route.
    expect(inGyms(moveTrain(onRoute([4, 1], 1), ALICE, 'next', false, '1', 'end'))).toMatchObject({
      ok: true,
      finished: true,
    });
    expect(inGyms(moveTrain(onRoute([4, 1, 7], 1), ALICE, 'next', false, '1', 'end'))).toEqual(
      refusal('route-changed'),
    );
    // A wrong place is said first, and a move that cannot be made at all before the target.
    expect(inGyms(moveTrain(edited, ALICE, 'next', false, '9', '1'))).toEqual(
      refusal('train-moved-on'),
    );
    expect(inGyms(moveTrain(onRoute([4, 1], 0), ALICE, 'skip', false, '4', '7'))).toEqual(
      refusal('no-stop-to-skip'),
    );
    // Without a target (Finish, a command) only the place counts.
    expect(moveTrain(edited, ALICE, 'next', false, '4').ok).toBe(true);
  });
});

describe('a Finish that is taken back', () => {
  /** The train after a change; throws when it was refused. */
  const after = (change: Change<TrainParty>): TrainParty => {
    if (!change.ok) throw new Error(`refused: ${change.reason}`);
    return change.party;
  };
  /** A route of four stops that was finished from its second, gym 1. */
  const finished = after(moveTrain(onRoute([4, 1, 7, 9], 1), ALICE, 'finish', false));

  it('remembers the gym the train was at when a move finished its route', () => {
    expect(inGyms(finished.train)).toMatchObject({ stop: 4, finishedFrom: 1 });
    const last = after(moveTrain(onRoute([4, 1, 7], 2), ALICE, 'next', false));
    expect(inGyms(last.train)).toMatchObject({ stop: 3, finishedFrom: 7 });
    // Nothing is remembered on a route that is not finished.
    expect(onRoute([4, 1, 7], 1).train.finishedFrom).toBeNull();
    for (const move of ['next', 'skip'] as const) {
      expect(
        after(moveTrain(onRoute([4, 1, 7]), ALICE, move, false)).train.finishedFrom,
      ).toBeNull();
    }
  });

  it('goes back to that stop with Previous, and remembers nothing afterwards', () => {
    expect(targetOf(finished, 'previous')).toBe('1');
    const back = moveTrain(finished, ALICE, 'previous', false);
    expect(inGyms(back)).toMatchObject({ ok: true, move: 'previous', at: 1, finished: false });
    expect(inGyms(after(back).train)).toMatchObject({
      route: [4, 1, 7, 9],
      stop: 1,
      finishedFrom: null,
    });
    // From there the train goes on as if nothing had happened.
    expect(inGyms(moveTrain(after(back), ALICE, 'next', false))).toMatchObject({ ok: true, at: 7 });
    expect(inGyms(moveTrain(after(back), ALICE, 'previous', false))).toMatchObject({
      ok: true,
      at: 4,
    });
  });

  it('leaves who is here as here on the way back: nobody went anywhere', () => {
    const train = withAttendees(onRoute([4, 1, 7, 9], 1), {
      [BOB]: { status: PartyStatus.Present },
    });
    const end = after(moveTrain(train, ALICE, 'finish', false));
    expect(end.attendees).toBe(train.attendees);
    const back = after(moveTrain(end, ALICE, 'previous', false));
    expect(inGyms(currentStop(back))).toBe(1);
    expect(back.attendees).toBe(train.attendees);
    // A second Previous is a move to another gym like any other.
    const further = after(moveTrain(back, ALICE, 'previous', false));
    expect(further.attendees[BOB]?.status).toBe(PartyStatus.Coming);
  });

  it('puts who is here back to coming when the train goes back to another stop than it finished from', () => {
    // The stop it finished from is no longer on the route: back to the last stop.
    const train = withAttendees(finished, { [BOB]: { status: PartyStatus.Present } });
    const forgotten = after(removeStop(train, ALICE, 2));
    const back = after(moveTrain(forgotten, ALICE, 'previous', false));
    expect(inGyms(currentStop(back))).toBe(9);
    expect(back.attendees[BOB]?.status).toBe(PartyStatus.Coming);
  });

  it('follows its gym when other stops are removed or moved', () => {
    const removed = removeStop(finished, ALICE, 1);
    expect(inGyms(removed)).toMatchObject({ ok: true, moved: false });
    expect(inGyms(after(removed).train)).toMatchObject({
      route: [1, 7, 9],
      stop: 3,
      finishedFrom: 1,
    });
    expect(inGyms(moveTrain(after(removed), ALICE, 'previous', false))).toMatchObject({
      ok: true,
      at: 1,
    });
    const moved = after(moveStop(finished, ALICE, 2, 4));
    expect(inGyms(moved.train)).toMatchObject({ route: [4, 7, 9, 1], stop: 4, finishedFrom: 1 });
    expect(targetOf(moved, 'previous')).toBe('1');
    expect(inGyms(after(moveTrain(moved, ALICE, 'previous', false)).train.stop)).toBe(3);
  });

  it('is forgotten when its gym is taken off the route: Previous leads to the last stop', () => {
    const removed = removeStop(finished, ALICE, 2);
    // The train is where it was, at the end: that is no movement.
    expect(inGyms(removed)).toMatchObject({ ok: true, stop: 1, moved: false });
    expect(inGyms(after(removed).train)).toMatchObject({
      route: [4, 7, 9],
      stop: 3,
      finishedFrom: null,
    });
    expect(targetOf(after(removed), 'previous')).toBe('9');
    expect(inGyms(moveTrain(after(removed), ALICE, 'previous', false))).toMatchObject({
      ok: true,
      at: 9,
    });
  });

  it('is not remembered for a route that an edit finished', () => {
    const removed = removeStop(onRoute([4, 1, 7], 2), ALICE, 3);
    expect(inGyms(removed)).toMatchObject({ ok: true, moved: true });
    expect(inGyms(after(removed).train)).toMatchObject({
      route: [4, 1],
      stop: 2,
      finishedFrom: null,
    });
    expect(targetOf(after(removed), 'previous')).toBe('1');
  });

  it('is forgotten when the train goes on, and with the route', () => {
    const added = addStop(finished, ALICE, gym(2));
    expect(inGyms(added)).toMatchObject({ ok: true, number: 5, moved: true });
    expect(inGyms(after(added).train)).toMatchObject({ stop: 4, finishedFrom: null });
    expect(inGyms(moveTrain(after(added), ALICE, 'previous', false))).toMatchObject({
      ok: true,
      at: 9,
    });
    expect(inGyms(after(clearRoute(finished, ALICE, true)).train)).toMatchObject({
      route: [],
      stop: 0,
      finishedFrom: null,
    });
    expect(inGyms(after(replaceRoute(finished, ALICE, stops(4, 1, 7, 9))).train)).toMatchObject({
      route: [4, 1, 7, 9],
      stop: 0,
      finishedFrom: null,
    });
    // The one stop of a route, removed after the route was finished from it.
    const single = after(moveTrain(onRoute([4]), ALICE, 'finish', false));
    expect(inGyms(after(removeStop(single, ALICE, 1)).train)).toMatchObject({
      route: [],
      stop: 0,
      finishedFrom: null,
    });
  });

  it('stays through what is not about the route: the conductor and the boss', () => {
    const led = after(setConductor(finished, ALICE));
    expect(inGyms(led.train.finishedFrom)).toBe(1);
    expect(inGyms(after(clearConductor(led, ALICE, false)).train.finishedFrom)).toBe(1);
    expect(inGyms(after(setTrainBoss(finished, { key: 'yveltal' })).train.finishedFrom)).toBe(1);
  });

  it('refuses a Previous that would lead elsewhere than its control said', () => {
    // The panel was drawn at the end with "back to gym 1"; gym 1 was removed since.
    const forgotten = after(removeStop(finished, ALICE, 2));
    expect(inGyms(moveTrain(forgotten, ALICE, 'previous', false, 'end', '1'))).toEqual(
      refusal('route-changed'),
    );
    expect(inGyms(moveTrain(forgotten, ALICE, 'previous', false, 'end', '9'))).toMatchObject({
      ok: true,
      at: 9,
    });
    expect(inGyms(moveTrain(finished, ALICE, 'previous', false, 'end', '1'))).toMatchObject({
      ok: true,
      at: 1,
    });
    expect(inGyms(moveTrain(finished, ALICE, 'previous', false, 'end', '9'))).toEqual(
      refusal('route-changed'),
    );
  });
});

/** The party a change answered; throws when it was refused. */
function changed<T extends TrainParty>(change: Change<T, object>): T {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

/**
 * Where a move leaves the train, by the drafts' rules table: the gym it is at (`end` once the
 * route is finished), the route afterwards when a turn changed its order, how it went past the
 * end and what it skipped; or the reason it is refused.
 */
type Rule = string | { at: number | 'end'; route?: number[]; turn?: TrainTurn; skipped?: number };

const R1 = [4];
const R2 = [4, 1];
const R3 = [4, 1, 7];
const R4 = [4, 1, 7, 9];

/** Every mode, every move, from the first, a middle, the second to last and the last stop, and the end. */
const RULES: [TrainAtEnd, number[], number, TrainMove, Rule][] = [
  // A route that finishes: as before there were modes.
  ['finish', R4, 0, 'next', { at: 1 }],
  ['finish', R4, 1, 'next', { at: 7 }],
  ['finish', R4, 2, 'next', { at: 9 }],
  ['finish', R4, 3, 'next', { at: 'end' }],
  ['finish', R4, 4, 'next', 'route-finished'],
  ['finish', R4, 0, 'previous', 'at-first-stop'],
  ['finish', R4, 1, 'previous', { at: 4 }],
  ['finish', R4, 3, 'previous', { at: 7 }],
  ['finish', R4, 4, 'previous', { at: 9 }],
  ['finish', R4, 0, 'skip', { at: 7, skipped: 1 }],
  ['finish', R4, 1, 'skip', { at: 9, skipped: 7 }],
  ['finish', R4, 2, 'skip', 'no-stop-to-skip'],
  ['finish', R4, 3, 'skip', 'no-stop-to-skip'],
  ['finish', R4, 4, 'skip', 'no-stop-to-skip'],
  ['finish', R4, 0, 'finish', { at: 'end' }],
  ['finish', R4, 3, 'finish', { at: 'end' }],
  ['finish', R4, 4, 'finish', 'route-finished'],
  // A route that loops: round from the last stop to the first, and back from the first.
  ['loop', R4, 0, 'next', { at: 1 }],
  ['loop', R4, 2, 'next', { at: 9 }],
  ['loop', R4, 3, 'next', { at: 4, turn: 'round' }],
  ['loop', R4, 4, 'next', 'route-finished'],
  ['loop', R4, 0, 'previous', { at: 9 }],
  ['loop', R4, 1, 'previous', { at: 4 }],
  ['loop', R4, 4, 'previous', { at: 9 }],
  ['loop', R4, 0, 'skip', { at: 7, skipped: 1 }],
  ['loop', R4, 1, 'skip', { at: 9, skipped: 7 }],
  ['loop', R4, 2, 'skip', { at: 4, turn: 'round', skipped: 9 }],
  ['loop', R4, 3, 'skip', { at: 1, turn: 'round', skipped: 4 }],
  ['loop', R4, 4, 'skip', 'no-stop-to-skip'],
  ['loop', R4, 1, 'finish', { at: 'end' }],
  ['loop', R4, 3, 'finish', { at: 'end' }],
  ['loop', R4, 4, 'finish', 'route-finished'],
  // A route that turns back: at the last stop it is run backwards.
  ['turn-back', R4, 0, 'next', { at: 1 }],
  ['turn-back', R4, 2, 'next', { at: 9 }],
  ['turn-back', R4, 3, 'next', { at: 7, route: [9, 7, 1, 4], turn: 'back' }],
  ['turn-back', R4, 4, 'next', 'route-finished'],
  ['turn-back', R4, 0, 'previous', 'at-first-stop'],
  ['turn-back', R4, 3, 'previous', { at: 7 }],
  ['turn-back', R4, 4, 'previous', { at: 9 }],
  ['turn-back', R4, 0, 'skip', { at: 7, skipped: 1 }],
  ['turn-back', R4, 1, 'skip', { at: 9, skipped: 7 }],
  // The stop after the next one would be the stop it is at.
  ['turn-back', R4, 2, 'skip', 'no-stop-to-skip'],
  ['turn-back', R4, 3, 'skip', { at: 1, route: [9, 7, 1, 4], turn: 'back', skipped: 7 }],
  ['turn-back', R4, 4, 'skip', 'no-stop-to-skip'],
  ['turn-back', R4, 3, 'finish', { at: 'end' }],
  ['turn-back', R4, 4, 'finish', 'route-finished'],
  // Three stops: the edges of Skip.
  ['loop', R3, 1, 'skip', { at: 4, turn: 'round', skipped: 7 }],
  ['loop', R3, 2, 'skip', { at: 1, turn: 'round', skipped: 4 }],
  ['turn-back', R3, 0, 'skip', { at: 7, skipped: 1 }],
  ['turn-back', R3, 1, 'skip', 'no-stop-to-skip'],
  ['turn-back', R3, 2, 'skip', { at: 4, route: [7, 1, 4], turn: 'back', skipped: 1 }],
  ['turn-back', R3, 2, 'next', { at: 1, route: [7, 1, 4], turn: 'back' }],
  // Two stops: round and back go to the other stop, and nothing is left to skip.
  ['finish', R2, 1, 'next', { at: 'end' }],
  ['finish', R2, 0, 'skip', 'no-stop-to-skip'],
  ['loop', R2, 1, 'next', { at: 4, turn: 'round' }],
  ['loop', R2, 0, 'previous', { at: 1 }],
  ['loop', R2, 0, 'skip', 'no-stop-to-skip'],
  ['loop', R2, 1, 'skip', 'no-stop-to-skip'],
  ['turn-back', R2, 1, 'next', { at: 4, route: [1, 4], turn: 'back' }],
  ['turn-back', R2, 0, 'previous', 'at-first-stop'],
  ['turn-back', R2, 0, 'skip', 'no-stop-to-skip'],
  ['turn-back', R2, 1, 'skip', 'no-stop-to-skip'],
  // One stop: every mode finishes, there is nowhere to go round or back to.
  ...TRAIN_AT_END.flatMap((atEnd): [TrainAtEnd, number[], number, TrainMove, Rule][] => [
    [atEnd, R1, 0, 'next', { at: 'end' }],
    [atEnd, R1, 0, 'previous', 'at-first-stop'],
    [atEnd, R1, 0, 'skip', 'no-stop-to-skip'],
    [atEnd, R1, 0, 'finish', { at: 'end' }],
    [atEnd, R1, 1, 'next', 'route-finished'],
    [atEnd, R1, 1, 'previous', { at: 4 }],
  ]),
];

describe('the modes of a train at the end of its route', () => {
  it.each(RULES)('%s, route %j at index %i: %s', (atEnd, route, stop, move, rule) => {
    const train = onRoute(route, stop, { atEnd });
    const moved = moveTrain(train, ALICE, move, false);
    if (typeof rule === 'string') {
      expect(inGyms(moved)).toEqual(refusal(rule));
      expect(cannotMove(train, move)).toBe(rule);
      return;
    }
    expect(cannotMove(train, move)).toBeUndefined();
    if (!moved.ok) throw new Error(`refused: ${moved.reason}`);
    const { party } = moved;
    expect(placeOf(party)).toBe(String(rule.at));
    // The control that leads there says so beforehand.
    expect(targetOf(train, move)).toBe(String(rule.at));
    expect(inGyms(party.train.route)).toEqual(rule.route ?? route);
    expect(party.train.atEnd).toBe(atEnd);
    expect(inGyms(moved)).toMatchObject({ finished: rule.at === 'end' });
    expect(moved.turn).toBe(rule.turn);
    expect(inGyms(moved.skipped)).toBe(rule.skipped);
  });

  it('makes a new train finish its route unless it was told otherwise', () => {
    expect(testTrain().train.atEnd).toBe('finish');
    expect(testTrain({ atEnd: 'loop' }).train.atEnd).toBe('loop');
    expect(testTrain({ atEnd: 'turn-back' }).train.atEnd).toBe('turn-back');
  });

  it('names where Next leads from the last stop, and how', () => {
    expect(nextStop(onRoute(R4, 3, { atEnd: 'finish' }))).toBeUndefined();
    expect(turnAhead(onRoute(R4, 3, { atEnd: 'finish' }))).toBeUndefined();
    expect(inGyms(nextStop(onRoute(R4, 3, { atEnd: 'loop' })))).toBe(4);
    expect(turnAhead(onRoute(R4, 3, { atEnd: 'loop' }))).toBe('round');
    expect(inGyms(nextStop(onRoute(R4, 3, { atEnd: 'turn-back' })))).toBe(7);
    expect(turnAhead(onRoute(R4, 3, { atEnd: 'turn-back' }))).toBe('back');
    // Anywhere else Next goes on, whatever the mode; at the end of the route it goes nowhere.
    for (const atEnd of TRAIN_AT_END) {
      expect(inGyms(nextStop(onRoute(R4, 1, { atEnd })))).toBe(7);
      expect(turnAhead(onRoute(R4, 1, { atEnd }))).toBeUndefined();
      expect(nextStop(onRoute(R4, 4, { atEnd }))).toBeUndefined();
      expect(turnAhead(onRoute(R4, 4, { atEnd }))).toBeUndefined();
      expect(nextStop(onRoute(R1, 0, { atEnd }))).toBeUndefined();
    }
  });

  it('puts who is here back to coming when it goes round or turns back', () => {
    for (const atEnd of ['loop', 'turn-back'] as const) {
      const train = withAttendees(onRoute(R4, 3, { atEnd }), {
        [ALICE]: { status: PartyStatus.Present },
      });
      const moved = changed(moveTrain(train, ALICE, 'next', false));
      expect(moved.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
      expect(routeFinished(moved)).toBe(false);
      expect(moved.train.finishedFrom).toBeNull();
    }
  });

  it('runs a turned route on to its end, and turns it again there', () => {
    let train = onRoute(R3, 2, { atEnd: 'turn-back' });
    train = changed(moveTrain(train, ALICE, 'next', false));
    expect(inGyms(train.train)).toMatchObject({ route: [7, 1, 4], stop: 1 });
    train = changed(moveTrain(train, ALICE, 'next', false));
    expect(inGyms(currentStop(train))).toBe(4);
    train = changed(moveTrain(train, ALICE, 'next', false));
    expect(inGyms(train.train)).toMatchObject({ route: [4, 1, 7], stop: 1 });
    // Previous after a turn takes it back to the gym it turned at, the first of the new order.
    const turned = changed(moveTrain(onRoute(R3, 2, { atEnd: 'turn-back' }), ALICE, 'next', false));
    const back = changed(moveTrain(turned, ALICE, 'previous', false));
    expect(inGyms(back.train)).toMatchObject({ route: [7, 1, 4], stop: 0 });
    expect(inGyms(moveTrain(back, ALICE, 'previous', false))).toEqual(refusal('at-first-stop'));
  });

  it('decides a turn against what the panel showed: where it was and where the turn leads', () => {
    const train = onRoute(R4, 3, { atEnd: 'turn-back' });
    expect(inGyms(changed(moveTrain(train, ALICE, 'next', false, '9', '7')).train.stop)).toBe(1);
    expect(inGyms(moveTrain(train, ALICE, 'next', false, '7', '7'))).toEqual(
      refusal('train-moved-on'),
    );
    // The panel was drawn while the train still finished its route there.
    expect(inGyms(moveTrain(train, ALICE, 'next', false, '9', 'end'))).toEqual(
      refusal('route-changed'),
    );
    const loop = onRoute(R4, 3, { atEnd: 'loop' });
    expect(inGyms(moveTrain(loop, ALICE, 'next', false, '9', '7'))).toEqual(
      refusal('route-changed'),
    );
    expect(inGyms(changed(moveTrain(loop, ALICE, 'next', false, '9', '4')).train.stop)).toBe(0);
  });

  it('takes a Finish of a train that loops back with Previous, as for any train', () => {
    const finished = changed(moveTrain(onRoute(R4, 1, { atEnd: 'loop' }), ALICE, 'finish', false));
    expect(inGyms(finished.train)).toMatchObject({ stop: 4, finishedFrom: 1 });
    expect(inGyms(changed(moveTrain(finished, ALICE, 'previous', false)).train.stop)).toBe(1);
  });
});

describe('reverseRoute', () => {
  it('reverses a route that finishes at its first and its last stop, the train at the same gym', () => {
    const first = changed(reverseRoute(onRoute(R4, 0), ALICE, false));
    expect(inGyms(first.train)).toMatchObject({ route: [9, 7, 1, 4], stop: 3, atEnd: 'finish' });
    expect(inGyms(currentStop(first))).toBe(4);
    const last = changed(reverseRoute(onRoute(R4, 3), ALICE, false));
    expect(inGyms(last.train)).toMatchObject({ route: [9, 7, 1, 4], stop: 0 });
    expect(inGyms(currentStop(last))).toBe(9);
    expect(inGyms(reverseRoute(onRoute(R4, 1), ALICE, false))).toEqual(
      refusal('reverse-mid-route'),
    );
    expect(inGyms(reverseRoute(onRoute(R4, 2), ALICE, false))).toEqual(
      refusal('reverse-mid-route'),
    );
  });

  it('starts a route that was finished from its last stop again, from that gym', () => {
    const finished = changed(moveTrain(onRoute(R4, 3), ALICE, 'next', false));
    expect(inGyms(finished.train.finishedFrom)).toBe(9);
    const reversed = reverseRoute(finished, ALICE, false);
    expect(inGyms(reversed)).toMatchObject({ ok: true, restarted: true });
    expect(inGyms(changed(reversed).train)).toMatchObject({
      route: [9, 7, 1, 4],
      stop: 0,
      finishedFrom: null,
    });
    expect(routeFinished(changed(reversed))).toBe(false);
    // Not one finished from another stop, nor one that remembers nothing.
    const early = changed(moveTrain(onRoute(R4, 1), ALICE, 'finish', false));
    expect(inGyms(reverseRoute(early, ALICE, false))).toEqual(
      refusal('reverse-finished-elsewhere'),
    );
    expect(inGyms(reverseRoute(onRoute(R4, 4), ALICE, false))).toEqual(
      refusal('reverse-finished-elsewhere'),
    );
    // A finished loop is a finished route like any other.
    const loopEarly = changed(moveTrain(onRoute(R4, 1, { atEnd: 'loop' }), ALICE, 'finish', false));
    expect(inGyms(reverseRoute(loopEarly, ALICE, false))).toEqual(
      refusal('reverse-finished-elsewhere'),
    );
  });

  it('reverses a route that loops at any stop, and keeps the mode', () => {
    for (const stop of [0, 1, 2, 3]) {
      const reversed = reverseRoute(onRoute(R4, stop, { atEnd: 'loop' }), ALICE, false);
      expect(inGyms(reversed)).toMatchObject({ ok: true, restarted: false });
      expect(inGyms(changed(reversed).train)).toMatchObject({
        route: [9, 7, 1, 4],
        stop: 3 - stop,
        atEnd: 'loop',
      });
    }
  });

  it('never reverses a route that turns back, one of fewer than two stops, or none', () => {
    for (const stop of [0, 1, 3]) {
      expect(inGyms(reverseRoute(onRoute(R4, stop, { atEnd: 'turn-back' }), ALICE, false))).toEqual(
        refusal('reverse-turns-back'),
      );
    }
    for (const atEnd of TRAIN_AT_END) {
      expect(inGyms(reverseRoute(onRoute(R1, 0, { atEnd }), ALICE, false))).toEqual(
        refusal('one-stop-route'),
      );
      expect(inGyms(reverseRoute(onRoute([], 0, { atEnd }), ALICE, false))).toEqual(
        refusal('no-route'),
      );
    }
    expect(cannotReverse(onRoute(R2, 1))).toBeUndefined();
    expect(cannotReverse(onRoute(R2, 0, { atEnd: 'loop' }))).toBeUndefined();
  });

  it('is no movement: who is here stays here', () => {
    const train = withAttendees(onRoute(R4, 0), { [ALICE]: { status: PartyStatus.Present } });
    expect(inGyms(changed(reverseRoute(train, ALICE, false)).attendees)).toEqual(train.attendees);
  });

  it('takes the right to move the train, and the place the panel was drawn at', () => {
    const led = onRoute(R4, 0, { conductorId: ALICE });
    expect(inGyms(reverseRoute(led, BOB, false))).toEqual(refusal('not-conductor'));
    expect(reverseRoute(led, CAROL, true).ok).toBe(true);
    expect(inGyms(reverseRoute(onRoute(R4, 0), CAROL, false))).toEqual(refusal('not-attending'));
    expect(inGyms(reverseRoute(onRoute(R4, 0), ALICE, false, '1'))).toEqual(
      refusal('train-moved-on'),
    );
    expect(reverseRoute(onRoute(R4, 0), ALICE, false, '4').ok).toBe(true);
    // Who may not move it is told so before anything else.
    expect(inGyms(reverseRoute(onRoute(R1, 0), CAROL, false))).toEqual(refusal('not-attending'));
  });

  it('reverses once for a panel: a second press, or a panel drawn before another Reverse, does nothing', () => {
    // The panel was drawn at the first stop of 4, 1, 7, 9: the route began with gym 4.
    const once = changed(reverseRoute(onRoute(R4, 0), ALICE, false, '4', '4'));
    expect(inGyms(once.train)).toMatchObject({ route: [9, 7, 1, 4], stop: 3 });
    // The train is still at gym 4, but the route no longer begins there: no flip back.
    expect(inGyms(reverseRoute(once, ALICE, false, '4', '4'))).toEqual(refusal('route-changed'));
    expect(inGyms(reverseRoute(once, BOB, false, '4', '4'))).toEqual(refusal('route-changed'));
    // A panel drawn after the Reverse reverses it again.
    expect(inGyms(changed(reverseRoute(once, BOB, false, '4', '9')).train)).toMatchObject({
      route: R4,
      stop: 0,
    });
    // Where the train is is asked first.
    expect(inGyms(reverseRoute(once, ALICE, false, '9', '9'))).toEqual(refusal('train-moved-on'));
  });
});

describe('setAtEnd', () => {
  it('sets the mode for whoever may arrange the route: signed up, its maker, and staff', () => {
    expect(changed(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop')).train.atEnd).toBe('loop');
    expect(inGyms(setAtEnd(onRoute(R4, 1), CAROL, false, 'loop'))).toEqual(
      refusal('not-attending'),
    );
    // The mode never moves the train: with a conductor, others who are signed up may set it.
    const led = onRoute(R4, 1, { conductorId: ALICE });
    expect(changed(setAtEnd(led, BOB, false, 'loop')).train.atEnd).toBe('loop');
    expect(setAtEnd(led, CAROL, true, 'loop').ok).toBe(true);
    // So may the maker who is not signed up, as they may give the train its route.
    const { [REPORTER]: _maker, ...others } = led.attendees;
    const unsigned: TrainParty = { ...led, attendees: others };
    expect(changed(setAtEnd(unsigned, REPORTER, false, 'turn-back')).train.atEnd).toBe('turn-back');
  });

  it('is refused from a panel drawn where the train no longer is', () => {
    expect(inGyms(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop', '4'))).toEqual(
      refusal('train-moved-on'),
    );
    expect(changed(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop', '1')).train.atEnd).toBe('loop');
  });

  it('returns the very same party for the mode it has', () => {
    const train = onRoute(R4, 1, { atEnd: 'turn-back' });
    expect(setAtEnd(train, ALICE, false, 'turn-back')).toEqual({ ok: true, party: train });
    expect(changed(setAtEnd(train, ALICE, false, 'turn-back'))).toBe(train);
  });

  it('never moves the train, and leaves a finished route finished', () => {
    const train = withAttendees(onRoute(R4, 3), { [ALICE]: { status: PartyStatus.Present } });
    const looping = changed(setAtEnd(train, ALICE, false, 'loop'));
    expect(inGyms(looping.train)).toMatchObject({ route: R4, stop: 3 });
    expect(inGyms(looping.attendees)).toEqual(train.attendees);
    const finished = changed(moveTrain(onRoute(R4, 2), ALICE, 'finish', false));
    const after = changed(setAtEnd(finished, ALICE, false, 'turn-back'));
    expect(inGyms(after.train)).toMatchObject({ stop: 4, finishedFrom: 7, atEnd: 'turn-back' });
    expect(routeFinished(after)).toBe(true);
  });
});

describe('a loaded route with its mode', () => {
  it('sets the mode with the route, and keeps the mode when none is given', () => {
    const train = onRoute(R4, 2);
    expect(
      inGyms(changed(replaceRoute(train, ALICE, stops(1, 7), false, 'loop')).train),
    ).toMatchObject({
      route: [1, 7],
      stop: 0,
      atEnd: 'loop',
    });
    const looping = onRoute(R4, 2, { atEnd: 'loop' });
    expect(changed(replaceRoute(looping, ALICE, stops(1, 7))).train.atEnd).toBe('loop');
  });

  it('is the very same party only when the route, the stop and the mode are what they were', () => {
    const train = onRoute(R4, 0);
    expect(changed(replaceRoute(train, ALICE, stops(...R4), false, 'finish'))).toBe(train);
    const looping = replaceRoute(train, ALICE, stops(...R4), false, 'loop');
    expect(inGyms(looping)).toMatchObject({ ok: true, moved: false });
    expect(changed(looping).train.atEnd).toBe('loop');
  });
});

/**
 * The rules of the design brief (T1), written out a second time and on their own, without
 * `destinationOf`: where a move or a Reverse leaves a train on `route`, at index `stop` (its
 * length: finished, with `finishedFrom`), or why it is refused.
 */
function oracle(
  atEnd: TrainAtEnd,
  route: readonly number[],
  stop: number,
  finishedFrom: number | null,
  move: TrainMove | 'reverse',
): { route: readonly number[]; stop: number } | string {
  const n = route.length;
  const finished = stop === n;
  const back = [...route].reverse();
  // A route of one stop behaves as Finish in every mode.
  const mode = n < 2 ? 'finish' : atEnd;
  const at = (index: number) => ({ route, stop: index });
  switch (move) {
    case 'next':
      if (finished) return 'route-finished';
      if (stop < n - 1) return at(stop + 1);
      if (mode === 'loop') return at(0);
      if (mode === 'turn-back') return { route: back, stop: 1 };
      return at(n);
    case 'finish':
      return finished ? 'route-finished' : at(n);
    case 'previous': {
      if (finished) {
        const from = finishedFrom === null ? -1 : route.indexOf(finishedFrom);
        return at(from >= 0 ? from : n - 1);
      }
      if (stop > 0) return at(stop - 1);
      return mode === 'loop' ? at(n - 1) : 'at-first-stop';
    }
    case 'skip':
      if (finished) return 'no-stop-to-skip';
      if (stop + 2 < n) return at(stop + 2);
      if (mode === 'loop') return n >= 3 ? at((stop + 2) % n) : 'no-stop-to-skip';
      if (mode === 'turn-back' && stop === n - 1 && n >= 3) return { route: back, stop: 2 };
      return 'no-stop-to-skip';
    case 'reverse':
      if (n < 2) return 'one-stop-route';
      if (atEnd === 'turn-back') return 'reverse-turns-back';
      if (finished) {
        return finishedFrom === route[n - 1]
          ? { route: back, stop: 0 }
          : 'reverse-finished-elsewhere';
      }
      if (atEnd === 'loop' || stop === 0 || stop === n - 1) {
        return { route: back, stop: n - 1 - stop };
      }
      return 'reverse-mid-route';
  }
}

describe('every mode, route, place and move against the rules of the brief', () => {
  const ROUTES = [[4], [4, 1], [4, 1, 7], [4, 1, 7, 9]];
  const cases: [TrainAtEnd, number[], number, number | null, TrainMove | 'reverse'][] = [];
  for (const atEnd of TRAIN_AT_END) {
    for (const route of ROUTES) {
      for (let stop = 0; stop <= route.length; stop++) {
        // Only a finished route remembers where it was finished from (or nothing).
        const remembered = stop === route.length ? [null, ...route] : [null];
        for (const finishedFrom of remembered) {
          for (const move of [...TRAIN_MOVES, 'reverse' as const]) {
            cases.push([atEnd, route, stop, finishedFrom, move]);
          }
        }
      }
    }
  }

  it('has every combination', () => {
    // 3 modes × (a route of n stops: n + 1 places, the finished one once more per gym) × 5.
    expect(cases).toHaveLength(3 * (3 + 5 + 7 + 9) * 5);
  });

  it.each(cases)(
    '%s, route %j at index %i (finished from %s): %s',
    (atEnd, route, stop, finishedFrom, move) => {
      const train = onRoute(route, stop, { atEnd, finishedFrom });
      const expected = oracle(atEnd, route, stop, finishedFrom, move);
      const result =
        move === 'reverse'
          ? reverseRoute(train, ALICE, false)
          : moveTrain(train, ALICE, move, false);
      if (typeof expected === 'string') {
        expect(inGyms(result)).toEqual(refusal(expected));
        return;
      }
      if (!result.ok) throw new Error(`refused: ${result.reason}`);
      expect(inGyms({ route: result.party.train.route, stop: result.party.train.stop })).toEqual(
        expected,
      );
      expect(result.party.train.atEnd).toBe(atEnd);
      // What the panel promises is where the move leads.
      if (move !== 'reverse') expect(targetOf(train, move)).toBe(placeOf(result.party));
    },
  );
});
