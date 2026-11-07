import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  withAttendees,
} from '../../../test/support/parties.js';
import { MAX_PARTY_NAME, type MeetupParty } from './party.js';
import {
  latestTime,
  nameOf,
  OPEN_PARTY_HOURS,
  setName,
  setStartTime,
  setTimedEnd,
  settled,
  startTimeOf,
  tidyName,
  timedOver,
  timesInOrder,
} from './timed.js';

const HOUR = 3_600_000;
const DAY = OPEN_PARTY_HOURS * HOUR;

/** The test meetup with these times, as they are stored (nothing is brought up to date). */
function withTimes(startTime: number | null, endTime: number | null): MeetupParty {
  const meetup = testMeetup();
  return { ...meetup, endTime, timed: { ...meetup.timed, startTime } };
}

describe('tidyName', () => {
  it('keeps a name on one line with single spaces', () => {
    expect(tidyName('  Raid \n hour\tmeet ')).toBe('Raid hour meet');
  });

  it('knows no name in white space, nor in a text that is too long', () => {
    expect(tidyName('')).toBeUndefined();
    expect(tidyName(' \n\t ')).toBeUndefined();
    expect(tidyName('x'.repeat(MAX_PARTY_NAME))).toHaveLength(MAX_PARTY_NAME);
    expect(tidyName('x'.repeat(MAX_PARTY_NAME + 1))).toBeUndefined();
    // What counts is the length once it is tidied.
    expect(tidyName(`${'x'.repeat(MAX_PARTY_NAME)}   `)).toHaveLength(MAX_PARTY_NAME);
  });

  it('drops what cannot be seen: a name of zero-width spaces is no name', () => {
    expect(tidyName('\u200b')).toBeUndefined();
    expect(tidyName(' \u200b\ufeff \u2060 ')).toBeUndefined();
    expect(tidyName('Pic\u200bnic\u0007')).toBe('Picnic');
    // Such characters do not count towards the length either.
    expect(tidyName(`${'x'.repeat(MAX_PARTY_NAME)}\u200b\u200b`)).toHaveLength(MAX_PARTY_NAME);
  });

  it('knows no name in characters nobody can see that are no control or format characters', () => {
    // Hangul fillers, the blank braille pattern, a lone joiner, a combining mark or a variation
    // selector on nothing: each looks like an empty title.
    for (const blank of [
      '\u3164',
      '\u2800\u2800',
      '\u200d',
      ' \u115f\u1160 \uffa0 ',
      '\u034f',
      '\ufe0f',
      '\u3164\u0301',
      '\u3000',
    ]) {
      expect(tidyName(blank)).toBeUndefined();
    }
    // Among visible characters they stay as they were typed.
    expect(tidyName('Picnic \u2800')).toBe('Picnic \u2800');
    expect(tidyName('\u2764\ufe0f')).toBe('\u2764\ufe0f');
    expect(tidyName('e\u0301')).toBe('e\u0301');
  });

  it('keeps the non-joiner of Persian words and the tags of a flag such as Scotland’s', () => {
    const zwnj = String.fromCodePoint(0x200c);
    const persian = `می${zwnj}روم`;
    expect(tidyName(`${persian} picnic`)).toBe(`${persian} picnic`);
    const scotland = String.fromCodePoint(
      0x1f3f4,
      0xe0067,
      0xe0062,
      0xe0073,
      0xe0063,
      0xe0074,
      0xe007f,
    );
    expect(tidyName(`${scotland} picnic`)).toBe(`${scotland} picnic`);
    expect(tidyName(scotland)).toBe(scotland);
  });

  it('drops a direction override, which would turn the title of the post around', () => {
    expect(tidyName('\u202ecinciP')).toBe('cinciP');
    expect(tidyName('a\u202db\u2066c\u2069d\u200ee\u200f')).toBe('abcde');
  });

  it('keeps the joiner that emoji are built with, and what is left of white space as one space', () => {
    const family = '\ud83d\udc69\u200d\ud83d\udc67';
    expect(tidyName(`${family} picnic`)).toBe(`${family} picnic`);
    expect(tidyName('a \u200b b')).toBe('a b');
  });
});

describe('what a timed party has', () => {
  it('gives its name and its start', () => {
    expect(nameOf(testMeetup({ name: 'Picnic' }))).toBe('Picnic');
    expect(startTimeOf(testMeetup())).toBeNull();
    expect(startTimeOf(withTimes(PARTY_NOW + HOUR, null))).toBe(PARTY_NOW + HOUR);
  });
});

describe('latestTime', () => {
  it('is the end time when there is one, whatever the start and whenever it is asked', () => {
    expect(latestTime(withTimes(null, PARTY_NOW + 2 * HOUR), PARTY_NOW)).toBe(PARTY_NOW + 2 * HOUR);
    expect(latestTime(withTimes(PARTY_NOW + HOUR, PARTY_NOW + 2 * HOUR), PARTY_NOW + 9 * DAY)).toBe(
      PARTY_NOW + 2 * HOUR,
    );
  });

  it('is a day after the start for a party without an end, whenever it is asked', () => {
    expect(OPEN_PARTY_HOURS).toBe(24);
    const open = withTimes(PARTY_NOW + 5 * HOUR, null);
    expect(latestTime(open, PARTY_NOW)).toBe(PARTY_NOW + 5 * HOUR + DAY);
    expect(latestTime(open, PARTY_NOW + 9 * DAY)).toBe(PARTY_NOW + 5 * HOUR + DAY);
  });

  it('is a day after it was made for a party that never had a time', () => {
    expect(latestTime(withTimes(null, null), PARTY_NOW)).toBe(PARTY_NOW + DAY);
  });

  it('is a day from now for a party that has no time left: not the day it was made', () => {
    expect(latestTime(withTimes(null, null), PARTY_NOW + 3 * DAY)).toBe(PARTY_NOW + 4 * DAY);
    // Never less than a day from when it was made.
    expect(latestTime(withTimes(null, null), PARTY_NOW - HOUR)).toBe(PARTY_NOW + DAY);
  });
});

describe('settled', () => {
  it('records the latest time', () => {
    const meetup = settled(withTimes(PARTY_NOW + HOUR, null), PARTY_NOW);
    expect(meetup.lastPossibleTime).toBe(PARTY_NOW + HOUR + DAY);
  });

  it('lets an archiving stand while the party is still over', () => {
    const late = PARTY_NOW + 3 * HOUR;
    const warned = { ...withTimes(PARTY_NOW, PARTY_NOW + HOUR), deletionTime: late + HOUR };
    expect(settled(warned, late).deletionTime).toBe(late + HOUR);
  });

  it('calls off an archiving once the party turns out to be still going on', () => {
    const late = PARTY_NOW + DAY + 1;
    const warned = { ...withTimes(null, null), deletionTime: PARTY_NOW + DAY + HOUR };
    // Somebody set a start for next week: it is no longer over.
    const later = { ...warned, timed: { ...warned.timed, startTime: PARTY_NOW + 7 * DAY } };
    expect(settled(later, late)).toMatchObject({
      deletionTime: null,
      lastPossibleTime: PARTY_NOW + 8 * DAY,
    });
  });
});

describe('timedOver', () => {
  it('is over once its end time has passed, to the millisecond', () => {
    const meetup = withTimes(PARTY_NOW, PARTY_NOW + HOUR);
    expect(timedOver(meetup, PARTY_NOW + HOUR - 1)).toBe(false);
    expect(timedOver(meetup, PARTY_NOW + HOUR)).toBe(true);
  });

  it('is never over without an end time, however long ago it started', () => {
    expect(timedOver(withTimes(PARTY_NOW, null), PARTY_NOW + 30 * DAY)).toBe(false);
    expect(timedOver(withTimes(null, null), PARTY_NOW + 30 * DAY)).toBe(false);
  });
});

describe('setName', () => {
  it('gives the party another name, tidied', () => {
    const meetup = testMeetup();
    const renamed = setName(meetup, '  Raid  hour\nmeet ');
    expect(renamed.ok && nameOf(renamed.party)).toBe('Raid hour meet');
    // Nothing else changed.
    expect(renamed.ok && { ...renamed.party, timed: meetup.timed }).toEqual(meetup);
  });

  it('returns the very same party for the name it has', () => {
    const meetup = testMeetup();
    expect(setName(meetup, ' Community Day  picnic ')).toEqual({ ok: true, party: meetup });
    expect(setName(meetup, 'Community Day picnic').party).toBe(meetup);
  });

  it('refuses a text that is no name', () => {
    expect(setName(testMeetup(), '   ')).toEqual({ ok: false, reason: 'bad-name' });
    expect(setName(testMeetup(), 'x'.repeat(MAX_PARTY_NAME + 1))).toEqual({
      ok: false,
      reason: 'bad-name',
    });
  });
});

describe('setStartTime', () => {
  const START = PARTY_NOW + 3 * HOUR;
  const meetup = withAttendees(testMeetup(), { [ALICE]: {}, [BOB]: {} });

  it('sets the start for everybody, drops the seconds and tells the others', () => {
    const set = setStartTime(meetup, ALICE, START + 45_678, PARTY_NOW);
    expect(set).toMatchObject({ ok: true, others: [REPORTER, BOB] });
    expect(set.ok && startTimeOf(set.party)).toBe(START);
    // The groups have no meeting time: a meetup starts for everybody at once.
    expect(set.ok && set.party.groups).toEqual([{ id: 'A' }]);
  });

  it('moves the last possible time: a day after the start while there is no end', () => {
    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
    expect(set.ok && set.party.lastPossibleTime).toBe(START + DAY);
    const ending = { ...meetup, endTime: START + HOUR, lastPossibleTime: START + HOUR };
    const withEnd = setStartTime(ending, ALICE, START, PARTY_NOW);
    expect(withEnd.ok && withEnd.party.lastPossibleTime).toBe(START + HOUR);
  });

  it('is only for somebody who is signed up', () => {
    expect(setStartTime(meetup, '200000000000000099', START, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
    expect(setStartTime(meetup, '200000000000000099', null, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });

  it('refuses a start that does not lie before the end', () => {
    const ending = { ...meetup, endTime: START };
    expect(setStartTime(ending, ALICE, START - MINUTE, PARTY_NOW).ok).toBe(true);
    expect(setStartTime(ending, ALICE, START, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'start-after-end',
    });
    // Seconds are dropped before the comparison.
    expect(setStartTime(ending, ALICE, START - 1, PARTY_NOW).ok).toBe(true);
    expect(setStartTime(ending, ALICE, START + HOUR, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'start-after-end',
    });
  });

  it('holds a start and an end to one rule, to the minute, either of them none', () => {
    expect(timesInOrder(START, START + MINUTE)).toBe(true);
    expect(timesInOrder(START, START)).toBe(false);
    expect(timesInOrder(START + MINUTE, START)).toBe(false);
    // Seconds are dropped before the comparison, of both.
    expect(timesInOrder(START + 1, START + 59_000)).toBe(false);
    expect(timesInOrder(START - 1, START)).toBe(true);
    expect(timesInOrder(null, START)).toBe(true);
    expect(timesInOrder(START, null)).toBe(true);
  });

  it('removes the start with null, and tells the others', () => {
    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
    if (!set.ok) throw new Error(set.reason);
    const removed = setStartTime(set.party, BOB, null, PARTY_NOW);
    expect(removed).toMatchObject({ ok: true, others: [REPORTER, ALICE] });
    expect(removed.ok && startTimeOf(removed.party)).toBeNull();
    expect(removed.ok && removed.party.lastPossibleTime).toBe(PARTY_NOW + DAY);
  });

  it('gives an old meetup a day from now when its only time is taken away', () => {
    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
    if (!set.ok) throw new Error(set.reason);
    // Three days on, long past the day it had from its start, and warned.
    const late = START + 3 * DAY;
    const warned = { ...set.party, deletionTime: late + HOUR };
    const removed = setStartTime(warned, ALICE, null, late);
    expect(removed).toMatchObject({
      ok: true,
      party: { lastPossibleTime: late + DAY, deletionTime: null },
    });
  });

  it('returns the very same party, and tells nobody, when the start is what it was', () => {
    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
    if (!set.ok) throw new Error(set.reason);
    const again = setStartTime(set.party, BOB, START + 30_000, PARTY_NOW);
    expect(again).toEqual({ ok: true, party: set.party, others: [] });
    expect(again.party).toBe(set.party);
    expect(setStartTime(meetup, ALICE, null, PARTY_NOW).party).toBe(meetup);
  });

  it('takes a warning away: a start that makes the meetup go on calls the archiving off', () => {
    const late = PARTY_NOW + DAY + HOUR;
    const warned = { ...meetup, deletionTime: late + HOUR };
    const set = setStartTime(warned, ALICE, late + 2 * HOUR, late);
    expect(set.ok && set.party.deletionTime).toBeNull();
    // A start in the past that leaves it over changes nothing about the archiving.
    const past = setStartTime(warned, ALICE, PARTY_NOW + MINUTE, late);
    expect(past.ok && past.party.deletionTime).toBe(late + HOUR);
  });
});

describe('setTimedEnd', () => {
  const START = PARTY_NOW + 3 * HOUR;
  const END = START + 2 * HOUR;

  it('sets the end, drops the seconds, and makes it the last possible time', () => {
    const set = setTimedEnd(withTimes(START, null), END + 59_000, PARTY_NOW);
    expect(set).toMatchObject({ ok: true, party: { endTime: END, lastPossibleTime: END } });
  });

  it('works for a meetup without a start, and for anybody (it asks for no member)', () => {
    const set = setTimedEnd(testMeetup(), END, PARTY_NOW);
    expect(set).toMatchObject({ ok: true, party: { endTime: END, lastPossibleTime: END } });
  });

  it('refuses an end that does not lie after the start', () => {
    const started = withTimes(START, null);
    expect(setTimedEnd(started, START - HOUR, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'end-before-start',
    });
    expect(setTimedEnd(started, START + 30_000, PARTY_NOW)).toEqual({
      ok: false,
      reason: 'end-before-start',
    });
    expect(setTimedEnd(started, START + MINUTE, PARTY_NOW).ok).toBe(true);
  });

  it('removes the end with null: the meetup is open again, for a day after its start', () => {
    const ending = settled(withTimes(START, END), PARTY_NOW);
    const open = setTimedEnd(ending, null, PARTY_NOW);
    expect(open).toMatchObject({
      ok: true,
      party: { endTime: null, lastPossibleTime: START + DAY },
    });
  });

  it('gives an old meetup without a start a day from now when its end is taken away', () => {
    const ended = settled(withTimes(null, END), PARTY_NOW);
    const late = END + 3 * DAY;
    const open = setTimedEnd({ ...ended, deletionTime: late + HOUR }, null, late);
    expect(open).toMatchObject({
      ok: true,
      party: { endTime: null, lastPossibleTime: late + DAY, deletionTime: null },
    });
    // With a start it is the start that counts, however long ago: it stays over.
    const started = { ...settled(withTimes(START, END), PARTY_NOW), deletionTime: late + HOUR };
    expect(setTimedEnd(started, null, late)).toMatchObject({
      ok: true,
      party: { lastPossibleTime: START + DAY, deletionTime: late + HOUR },
    });
  });

  it('returns the very same party when the end is what it was', () => {
    const ending = settled(withTimes(START, END), PARTY_NOW);
    expect(setTimedEnd(ending, END + 1_000, PARTY_NOW).party).toBe(ending);
    const open = testMeetup();
    expect(setTimedEnd(open, null, PARTY_NOW).party).toBe(open);
  });

  it('takes a warning away when the new end lies ahead', () => {
    const late = END + HOUR;
    const warned = { ...settled(withTimes(START, END), PARTY_NOW), deletionTime: late + HOUR };
    const longer = setTimedEnd(warned, late + 2 * HOUR, late);
    expect(longer.ok && longer.party.deletionTime).toBeNull();
    // Removing the end of a meetup that started less than a day ago does the same.
    const open = setTimedEnd(warned, null, late);
    expect(open.ok && open.party.deletionTime).toBeNull();
  });
});
