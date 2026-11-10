import { describe, expect, it } from 'vitest';
import {
  ALICE,
  AS_MAKER,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
  stops,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { leaveParty } from './attendance.js';
import { endParty, setSaved, type TrainParty } from './party.js';
import { PartyStatus } from './status.js';
import { partyTick, warningAddressee, type TickInput } from './tick.js';
import { OPEN_PARTY_HOURS, setStartTime, setTimedEnd } from './timed.js';
import { moveTrain, setConductor } from './train.js';

const rules = testRaidRules();
/** Grace 5 minutes; the warning of a raid 10, that of a train or meetup 60. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const HOUR = 60 * MINUTE;
const DAY = OPEN_PARTY_HOURS * HOUR;

function tick(party: TrainParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    // A train never asks what an egg hatches as.
    autoset: () => {
      throw new Error('a train has no egg');
    },
    ...extra,
  });
}

function changed<T extends { ok: boolean; party?: TrainParty }>(change: T): TrainParty {
  if (!change.party) throw new Error('refused');
  return change.party;
}

const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
/** A train on a route of three gyms, with Alice and Bob here. */
const boarded: TrainParty = {
  ...withAttendees(testTrain(), {
    [ALICE]: { status: PartyStatus.Present },
    [BOB]: { status: PartyStatus.Present },
  }),
  train: {
    kind: 'raid',
    route: stops(4, 1, 7),
    stop: 0,
    finishedFrom: null,
    atEnd: 'finish',
    conductorId: null,
    boss: { key: 'yveltal' },
    splitFrom: null,
    splitOff: [],
  },
};
/** The same from 16:00 to 18:00. */
const planned = changed(
  setTimedEnd(
    changed(setStartTime(boarded, { id: ALICE, staff: false }, START, PARTY_NOW)),
    AS_MAKER,
    END,
    PARTY_NOW,
  ),
);

describe('partyTick for a train: the clock of a timed party', () => {
  it('does nothing while nothing is due', () => {
    for (const now of [PARTY_NOW + MINUTE, START - 1, START + MINUTE, END - MINUTE]) {
      expect(tick(planned, now)).toEqual({ party: planned, effects: [], render: false });
      expect(tick(planned, now).party).toBe(planned);
    }
  });

  it('has the post shown anew when the start and when the end passes, and says nothing', () => {
    expect(tick(planned, START)).toEqual({ party: planned, effects: [], render: true });
    expect(tick(planned, END)).toEqual({ party: planned, effects: [], render: true });
    expect(tick(planned, END + MINUTE).render).toBe(false);
  });

  it('never moves the train, asks nobody whether they are done and completes nobody', () => {
    for (const now of [START + 11 * MINUTE, END, END + 4 * MINUTE, END + DAY]) {
      const result = tick(planned, now);
      expect(result.party.train).toBe(planned.train);
      expect(result.party.attendees).toBe(planned.attendees);
      expect(result.effects.filter((effect) => effect.kind !== 'warn')).toEqual([]);
    }
  });

  it('is not over because its route is finished: only its times say so', () => {
    const finished = changed(moveTrain(planned, ALICE, 'finish', false));
    expect(tick(finished, START + HOUR)).toEqual({ party: finished, effects: [], render: false });
    const open = changed(moveTrain(boarded, ALICE, 'finish', false));
    expect(tick(open, PARTY_NOW + DAY).effects).toEqual([]);
    expect(open.lastPossibleTime).toBe(boarded.lastPossibleTime);
  });
});

describe('partyTick for a train: archiving', () => {
  it('schedules it five minutes after the end, an hour ahead, with a warning', () => {
    expect(tick(planned, END + 5 * MINUTE).effects).toEqual([]);
    const now = END + 5 * MINUTE + 1;
    const result = tick(planned, now);
    expect(result.party.deletionTime).toBe(now + 60 * MINUTE);
    expect(result).toMatchObject({
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
      render: true,
    });
    expect(tick(result.party, now + MINUTE)).toEqual({
      party: result.party,
      effects: [],
      render: false,
    });
  });

  it('asks for the end at the archiving time, every tick until the party is ended', () => {
    const warned = tick(planned, END + 6 * MINUTE).party;
    const due = (warned.deletionTime ?? 0) + 1;
    expect(tick(warned, due - 2).effects).toEqual([]);
    expect(tick(warned, due)).toEqual({ party: warned, effects: [{ kind: 'end' }], render: false });
    expect(tick(warned, due + MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(endParty(warned), due + MINUTE)).toMatchObject({ effects: [], render: false });
  });

  it('gives a train without an end a day from its start, and one without times a day from when it was made', () => {
    const open = changed(setStartTime(boarded, { id: ALICE, staff: false }, START, PARTY_NOW));
    expect(tick(open, START + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = START + DAY + 6 * MINUTE;
    expect(tick(open, now).effects).toEqual([{ kind: 'warn', deletionTime: now + 60 * MINUTE }]);
    const untimed = testTrain();
    expect(tick(untimed, PARTY_NOW + DAY + 5 * MINUTE).effects).toEqual([]);
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    expect(tick(untimed, late).effects).toEqual([
      { kind: 'warn', deletionTime: late + 60 * MINUTE },
    ]);
  });

  it('starts over when a time that was set called the archiving off', () => {
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    const warned = tick(testTrain(), late).party;
    expect(warned.deletionTime).not.toBeNull();
    const going = changed(setTimedEnd(warned, AS_MAKER, late + 2 * HOUR, late + MINUTE));
    expect(going.deletionTime).toBeNull();
    expect(tick(going, late + 2 * MINUTE).effects).toEqual([]);
  });

  it('never schedules or ends a train a moderator saved', () => {
    expect(tick(setSaved(planned, true), END + 2 * DAY).effects).toEqual([]);
  });
});

describe('warningAddressee', () => {
  it('is the conductor of a train without an end time, and its maker while it has none', () => {
    expect(warningAddressee(boarded)).toBe(REPORTER);
    const led = changed(setConductor(boarded, ALICE));
    expect(warningAddressee(led)).toBe(ALICE);
  });

  it('is nobody for a train that has an end time: everybody saw when it was over', () => {
    expect(warningAddressee(planned)).toBeUndefined();
    expect(warningAddressee(changed(setConductor(planned, ALICE)))).toBeUndefined();
  });

  it('is the maker again once the conductor has left, and nobody once the maker has left too', () => {
    const led = changed(setConductor(boarded, ALICE));
    const without = changed(leaveParty(led, ALICE));
    expect(warningAddressee(without)).toBe(REPORTER);
    expect(warningAddressee(changed(leaveParty(without, REPORTER)))).toBeUndefined();
    // A conductor leads the train also when its maker has left it.
    expect(warningAddressee(changed(leaveParty(led, REPORTER)))).toBe(ALICE);
  });

  it('is the maker of a meetup without an end time who is still signed up, and nobody for a raid', () => {
    expect(warningAddressee(testMeetup())).toBe(REPORTER);
    const left = leaveParty(testMeetup(), REPORTER);
    expect(left.ok && warningAddressee(left.party)).toBeUndefined();
    expect(warningAddressee(testRaid())).toBeUndefined();
  });
});
