import { describe, expect, it } from 'vitest';
import { ALICE, testTrain, withAttendees } from '../../../test/support/parties.js';
import type { TrainParty } from './party.js';
import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
import type { Party } from './party.js';
import { PartyStatus } from './status.js';
import {
  gymStop,
  readStopKey,
  spotStop,
  stopHandle,
  stopKey,
  stopsByHandle,
  type StopRef,
} from './stops.js';
import {
  addStop,
  currentStop,
  moveTrain,
  placeOf,
  removeStop,
  replaceRoute,
  reverseRoute,
  targetOf,
} from './train.js';

const SPOT = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
const OTHER_SPOT = '0123456789abcdef0123456789abcdef.7';

/** A train with Alice coming, on this route, at the stop with this index. */
function onRoute(route: StopRef[], stop = 0): TrainParty {
  const train = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
  return { ...train, train: { ...train.train, route, stop } };
}

function columnsOf(party: Party): PartyColumns {
  const { anonymous: _a, attendees: _b, groups: _c, defaultGroupId: _d, ...rest } = party;
  const { prompts: _e, makerName: _f, ...kept } = rest;
  const columns = Object.fromEntries(
    Object.entries(kept).filter(
      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
    ),
  ) as PartyColumns;
  return { ...columns, mirrorMessages: [] };
}

describe('a stop: a gym or a Power Spot (plan 8X-4; design 6.2)', () => {
  it('has a key: a gym its id, a Power Spot w and its Wayfarer id, read back as the stop', () => {
    expect(stopKey(gymStop(12))).toBe('12');
    expect(stopKey(spotStop(SPOT))).toBe(`w${SPOT}`);
    expect(readStopKey('12')).toEqual(gymStop(12));
    expect(readStopKey(`w${SPOT}`)).toEqual(spotStop(SPOT));
    for (const text of ['', '0', '012', 'w', `p${SPOT}`, 'wnot-an-id', '12a', `w${SPOT}:x`]) {
      expect(readStopKey(text)).toBeUndefined();
    }
  });

  it('has a short handle for a control: a gym its id, a Power Spot eight characters of a hash', () => {
    expect(stopHandle(gymStop(12))).toBe('12');
    const handle = stopHandle(spotStop(SPOT));
    expect(handle).toMatch(/^[0-9a-f]{8}$/u);
    expect(stopHandle(spotStop(OTHER_SPOT))).not.toBe(handle);
    expect(stopsByHandle([gymStop(12), spotStop(SPOT), gymStop(4)], handle)).toEqual([1]);
    expect(stopsByHandle([gymStop(12)], handle)).toEqual([]);
  });

  it('is a stop of a route like a gym: added once, moved through, finished from, reversed', () => {
    const added = addStop(onRoute([gymStop(4)]), ALICE, spotStop(SPOT));
    expect(added.ok && added.party.train.route).toEqual([gymStop(4), spotStop(SPOT)]);
    if (!added.ok) return;
    expect(addStop(added.party, ALICE, spotStop(SPOT))).toEqual({
      ok: false,
      reason: 'already-on-route',
    });
    const next = moveTrain(added.party, ALICE, 'next', false, placeOf(added.party));
    expect(next.ok && currentStop(next.party)).toEqual(spotStop(SPOT));
    if (!next.ok) return;
    expect(placeOf(next.party)).toBe(stopHandle(spotStop(SPOT)));
    const done = moveTrain(next.party, ALICE, 'finish', false);
    expect(done.ok && done.party.train.finishedFrom).toEqual(spotStop(SPOT));
    if (!done.ok) return;
    const back = moveTrain(
      done.party,
      ALICE,
      'previous',
      false,
      'end',
      targetOf(done.party, 'previous'),
    );
    expect(back.ok && currentStop(back.party)).toEqual(spotStop(SPOT));
    const reversed = reverseRoute(done.party, ALICE, false, 'end', '4');
    expect(reversed.ok && reversed.party.train.route).toEqual([spotStop(SPOT), gymStop(4)]);
    const removed = removeStop(added.party, ALICE, 2);
    expect(removed.ok && removed.stop).toEqual(spotStop(SPOT));
    const loaded = replaceRoute(onRoute([]), ALICE, [spotStop(SPOT), gymStop(1), spotStop(SPOT)]);
    expect(loaded.ok && loaded.party.train.route).toEqual([spotStop(SPOT), gymStop(1)]);
  });

  it('refuses a press whose handle matches two stops of the route: the route changed', () => {
    // A power spot whose handle is all digits, and the gym of that id: one handle, two stops.
    let spot = SPOT;
    for (let n = 1; !/^[1-9]\d{7}$/u.test(stopHandle(spotStop(spot))); n++) {
      spot = `${n.toString(16).padStart(32, '0')}.16`;
    }
    const handle = stopHandle(spotStop(spot));
    const train = onRoute([spotStop(spot), gymStop(Number(handle)), gymStop(7)], 0);
    expect(stopsByHandle(train.train.route, handle)).toEqual([0, 1]);
    // Whatever the panel's handle meant, it cannot be told which stop it was.
    expect(moveTrain(train, ALICE, 'next', false, handle)).toEqual({
      ok: false,
      reason: 'route-changed',
    });
    const atGym = onRoute([gymStop(4), spotStop(spot), gymStop(Number(handle))], 0);
    expect(moveTrain(atGym, ALICE, 'next', false, '4', handle)).toEqual({
      ok: false,
      reason: 'route-changed',
    });
    // A handle of a stop the train is not at: it moved on.
    expect(moveTrain(train, ALICE, 'next', false, '7')).toEqual({
      ok: false,
      reason: 'train-moved-on',
    });
  });

  it('is kept in the state document; a route of numbers of an older document is gyms', () => {
    const train = onRoute([gymStop(4), spotStop(SPOT), gymStop(7)], 3);
    const finished = { ...train, train: { ...train.train, finishedFrom: spotStop(SPOT) } };
    const state = JSON.parse(JSON.stringify(partyState(finished))) as Record<string, unknown>;
    expect(state.train).toMatchObject({
      route: [gymStop(4), spotStop(SPOT), gymStop(7)],
      finishedFrom: spotStop(SPOT),
    });
    expect(partyFromStored(columnsOf(finished), state, [])).toEqual({ ok: true, party: finished });
    const { kind: _kind, ...older } = state.train as Record<string, unknown>;
    const v13 = { ...state, v: 13, train: { ...older, route: [4, 1, 7], finishedFrom: 1 } };
    expect(partyFromStored(columnsOf(finished), v13, [])).toEqual({
      ok: true,
      party: {
        ...finished,
        train: {
          ...finished.train,
          route: [gymStop(4), gymStop(1), gymStop(7)],
          finishedFrom: gymStop(1),
        },
      },
    });
    // A power spot of no Wayfarer id, or a stop twice, is refused.
    const bad = (route: unknown): boolean =>
      partyFromStored(
        columnsOf(finished),
        { ...state, train: { ...(state.train as object), route, finishedFrom: null } },
        [],
      ).ok;
    expect(bad([{ kind: 'powerspot', id: 'x' }])).toBe(false);
    expect(bad([spotStop(SPOT), spotStop(SPOT)])).toBe(false);
    expect(bad([{ kind: 'stop', id: SPOT }])).toBe(false);
  });
});
