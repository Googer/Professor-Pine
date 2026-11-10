import { describe, expect, it } from 'vitest';
import {
  at,
  PARTY_ZONE,
  testMax,
  testMeetup,
  testRaid,
  testTrain,
} from '../../../test/support/parties.js';
import {
  changesPlanned,
  partyStartWords,
  plannedCounts,
  plannedDuring,
  startsDuringAny,
} from './event-parties.js';
import type { Party, TimedParty } from './party.js';

const HOUR = 60 * 60_000;
/** Into the Wild, Nov 9 10 AM to Nov 13 8 PM. */
const EVENT = { start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') };
const NOW = at('2026-11-07T12:00');

/** A timed party of server row 1 with a post, starting then. */
function posted<P extends TimedParty>(party: P, start: number | null, id: string): P {
  return {
    ...party,
    id,
    forumChannelId: '600000000000000001',
    forumPostId: `7000000000000000${id.slice(-2)}`,
    timed: { ...party.timed, startTime: start },
  };
}

describe('plannedDuring (trains and meetups in an event)', () => {
  it('takes the trains and meetups of the server that start within the event, by start', () => {
    const late = posted(testTrain(), at('2026-11-12T18:00'), 'p-01');
    const early = posted(testMeetup(), at('2026-11-09T10:00'), 'p-02');
    const parties: Party[] = [late, early];
    expect(plannedDuring(parties, 1, EVENT, NOW).map((party) => party.id)).toEqual([
      'p-02',
      'p-01',
    ]);
  });

  it('leaves out a start before the event, at its end or after, and a party without a start', () => {
    const parties: Party[] = [
      posted(testTrain(), EVENT.start - 1, 'p-01'),
      posted(testTrain(), EVENT.end, 'p-02'),
      posted(testMeetup(), null, 'p-03'),
      posted(testMeetup(), EVENT.end - 1, 'p-04'),
    ];
    expect(plannedDuring(parties, 1, EVENT, NOW).map((party) => party.id)).toEqual(['p-04']);
  });

  it('leaves out raids, max battles, other servers, parties without a post, ended or over', () => {
    const start = at('2026-11-10T18:00');
    const ended: Party = { ...posted(testTrain(), start, 'p-05'), status: 'ended' };
    const over: Party = { ...posted(testMeetup(), start, 'p-06'), endTime: NOW };
    const parties: Party[] = [
      testRaid(),
      testMax(),
      { ...posted(testTrain(), start, 'p-01'), guildId: 2 },
      { ...posted(testMeetup(), start, 'p-02'), forumPostId: null },
      ended,
      over,
      posted(testTrain(), start, 'p-07'),
    ];
    expect(plannedDuring(parties, 1, EVENT, NOW).map((party) => party.id)).toEqual(['p-07']);
  });

  it('counts the trains and the meetups', () => {
    const start = at('2026-11-10T18:00');
    const parties = [
      posted(testTrain(), start, 'p-01'),
      posted(testTrain(), start + HOUR, 'p-02'),
      posted(testMeetup(), start, 'p-03'),
    ];
    expect(plannedCounts(parties)).toEqual({ trains: 2, meetups: 1 });
    expect(plannedCounts([])).toEqual({ trains: 0, meetups: 0 });
  });
});

describe('changesPlanned (when the events forum draws again)', () => {
  const train = posted(testTrain(), at('2026-11-10T18:00'), 'p-01');

  it('is a train or meetup made, moved, ended, or whose start, end or post changed', () => {
    expect(changesPlanned(undefined, train)).toBe(true);
    const changed: Party[] = [
      { ...train, status: 'ended' },
      { ...train, regionId: 2, forumChannelId: '600000000000000002' },
      { ...train, forumPostId: null },
      { ...train, endTime: NOW },
      { ...train, timed: { ...train.timed, startTime: at('2026-11-15T18:00') } },
    ];
    for (const after of changed) expect(changesPlanned(train, after)).toBe(true);
  });

  it('is not a change of anything else, nor a raid or max battle', () => {
    expect(changesPlanned(train, { ...train, anonymous: true })).toBe(false);
    expect(changesPlanned(train, { ...train, timed: { ...train.timed, name: 'Other' } })).toBe(
      false,
    );
    expect(changesPlanned(undefined, testRaid())).toBe(false);
    expect(changesPlanned(undefined, testMax())).toBe(false);
  });
});

// Review EP-4: a change draws again only where the party starts, or started, within an event.
describe('startsDuringAny', () => {
  const train = posted(testTrain(), at('2026-11-10T18:00'), 'p-01');

  it('is a train or meetup whose start falls within one of the events', () => {
    expect(startsDuringAny(train, [EVENT])).toBe(true);
    expect(startsDuringAny(train, [{ start: EVENT.end, end: EVENT.end + HOUR }, EVENT])).toBe(true);
  });

  it('is not one starting outside them all, without a start, nor anything else', () => {
    const outside = posted(testTrain(), EVENT.end, 'p-02');
    expect(startsDuringAny(outside, [EVENT])).toBe(false);
    expect(startsDuringAny(posted(testMeetup(), null, 'p-03'), [EVENT])).toBe(false);
    expect(startsDuringAny(train, [])).toBe(false);
    expect(startsDuringAny(undefined, [EVENT])).toBe(false);
    expect(startsDuringAny(testRaid(), [{ start: 0, end: Number.MAX_SAFE_INTEGER }])).toBe(false);
  });
});

describe('partyStartWords', () => {
  it('says a start as plain local text, as the events forum says times', () => {
    expect(partyStartWords(at('2026-11-21T14:00'), PARTY_ZONE)).toBe('Sat, Nov 21, 2 PM');
    expect(partyStartWords(at('2026-11-09T09:30'), PARTY_ZONE)).toBe('Mon, Nov 9, 9:30 AM');
  });
});
