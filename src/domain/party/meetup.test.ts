import { describe, expect, it } from 'vitest';
import { PARTY_NOW, REPORTER, testMeetup, testRaid } from '../../../test/support/parties.js';
import { attendanceLimits, setRemote } from './attendance.js';
import type { DroppedPin, KnownPlace } from '../geo/place.js';
import { createMeetup, setDescription, type NewMeetup } from './meetup.js';
import {
  hasGroups,
  isRaid,
  isTimed,
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  partyWord,
  remoteAllowed,
  type Party,
} from './party.js';
import { PartyStatus } from './status.js';

const HOUR = 3_600_000;
const ALICE = '200000000000000002';

const fresh: NewMeetup = {
  id: '00000000-0000-4000-8000-000000000009',
  guildId: 1,
  regionId: 2,
  createdById: REPORTER,
  name: 'Community Day picnic',
  now: PARTY_NOW,
};

describe('createMeetup', () => {
  it('makes a meetup with its name and nothing else, in the region it was made in', () => {
    const made = createMeetup(fresh);
    expect(made).toMatchObject({
      ok: true,
      party: {
        id: fresh.id,
        type: 'meetup',
        status: 'active',
        guildId: 1,
        regionId: 2,
        gymId: null,
        hatchTime: null,
        endTime: null,
        deletionTime: null,
        saved: false,
        forumPostId: null,
        createdById: REPORTER,
        anonymous: false,
        createdAt: PARTY_NOW,
        timed: { name: 'Community Day picnic', startTime: null },
        meetup: { description: null },
      },
    });
  });

  it('signs up who made it as interested, in the one group a meetup has', () => {
    const { attendees, groups, defaultGroupId } = testMeetup();
    expect(attendees).toEqual({
      [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
    });
    expect(groups).toEqual([{ id: 'A' }]);
    expect(defaultGroupId).toBe('A');
  });

  it('counts a meetup without times as going on for a day after it was made', () => {
    expect(testMeetup().lastPossibleTime).toBe(PARTY_NOW + 24 * HOUR);
  });

  it('tidies the name: one line, single spaces, no white space at the ends', () => {
    const made = createMeetup({ ...fresh, name: '  Community\n Day \t picnic ' });
    expect(made.ok && made.party.timed.name).toBe('Community Day picnic');
  });

  it('starts with its start and information when they are given (plan 8S-1), at once', () => {
    const start = PARTY_NOW + 3 * HOUR + 59_999;
    const made = createMeetup({
      ...fresh,
      startTime: start,
      description: '  Bring snacks. \n\n\n\nSee you! ',
    });
    if (!made.ok) throw new Error(made.reason);
    expect(made.party.timed.startTime).toBe(PARTY_NOW + 3 * HOUR);
    expect(made.party.meetup.description).toBe('Bring snacks.\n\nSee you!');
    // A day after its start, as a start set later would give it.
    expect(made.party.lastPossibleTime).toBe(PARTY_NOW + 27 * HOUR);
    expect(createMeetup({ ...fresh, description: ' \n ' })).toMatchObject({
      ok: true,
      party: { meetup: { description: null } },
    });
    expect(createMeetup({ ...fresh, description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })).toEqual(
      { ok: false, reason: 'description-too-long' },
    );
  });

  it('refuses a name that is empty or too long', () => {
    expect(createMeetup({ ...fresh, name: ' \n ' })).toEqual({ ok: false, reason: 'bad-name' });
    expect(createMeetup({ ...fresh, name: 'x'.repeat(MAX_PARTY_NAME) }).ok).toBe(true);
    expect(createMeetup({ ...fresh, name: 'x'.repeat(MAX_PARTY_NAME + 1) })).toEqual({
      ok: false,
      reason: 'bad-name',
    });
  });
});

describe('the kinds of party', () => {
  const raid: Party = testRaid();
  const meetup: Party = testMeetup();

  it('tells a raid from a meetup, which is a timed party', () => {
    expect([isRaid(raid), isTimed(raid)]).toEqual([true, false]);
    expect([isRaid(meetup), isTimed(meetup)]).toEqual([false, true]);
  });

  it('gives a raid groups and a meetup its one group for good', () => {
    expect(hasGroups(raid)).toBe(true);
    expect(hasGroups(meetup)).toBe(false);
  });

  it('names each kind for a sentence', () => {
    expect(partyWord(raid)).toBe('raid');
    expect(partyWord(meetup)).toBe('meetup');
    expect(partyWord({ type: 'train' })).toBe('train');
  });

  it('lets members take part in a meetup remotely', () => {
    expect(remoteAllowed(meetup)).toBe(true);
    expect(remoteAllowed(testRaid({ tier: { level: 'Elite', shadow: false } }))).toBe(false);
    const limits = attendanceLimits({ maximumAdditionalAttendees: 5 });
    const remote = setRemote(testMeetup(), ALICE, true, {}, limits);
    expect(remote.ok && remote.party.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      remote: true,
    });
  });
});

describe('setDescription', () => {
  it('sets what the post says about the meetup, keeping its lines', () => {
    const meetup = testMeetup();
    const set = setDescription(
      meetup,
      '  Bring snacks.  \r\nWe meet at the fountain.\n\n\n\nSee you! ',
    );
    expect(set.ok && set.party.meetup.description).toBe(
      'Bring snacks.\nWe meet at the fountain.\n\nSee you!',
    );
    expect(set.ok && { ...set.party, meetup: meetup.meetup }).toEqual(meetup);
  });

  it('removes it with a text of nothing but white space', () => {
    const set = setDescription(testMeetup(), 'Bring snacks.');
    if (!set.ok) throw new Error(set.reason);
    const cleared = setDescription(set.party, ' \n ');
    expect(cleared.ok && cleared.party.meetup.description).toBeNull();
  });

  it('refuses a text that is too long once it is tidied', () => {
    const meetup = testMeetup();
    expect(setDescription(meetup, `${'x'.repeat(MAX_MEETUP_DESCRIPTION)}  `).ok).toBe(true);
    expect(setDescription(meetup, 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1))).toEqual({
      ok: false,
      reason: 'description-too-long',
    });
  });

  it('returns the very same party when the text is what it was', () => {
    const meetup = testMeetup();
    expect(setDescription(meetup, '  ').party).toBe(meetup);
    const set = setDescription(meetup, 'Bring snacks.');
    if (!set.ok) throw new Error(set.reason);
    expect(setDescription(set.party, 'Bring snacks.  ').party).toBe(set.party);
  });
});

describe('the place of a meetup', () => {
  const STOP: KnownPlace = {
    kind: 'stop',
    id: '0123456789abcdef0123456789abcdef.16',
    title: 'Fountain Square',
    lat: 40.0601,
    lon: -80.0601,
    address: '20 Market Street, Pinewood',
    image: 'https://lh3.googleusercontent.com/square',
  };
  const PIN: DroppedPin = {
    kind: 'pin',
    lat: 40.02,
    lon: -80.02,
    near: null,
    linkName: 'Blue Tent',
  };

  it('is set when the meetup is made, and none without one', () => {
    for (const place of [STOP, PIN]) {
      const made = createMeetup({ ...fresh, place });
      expect(made.ok && made.party.meetup).toEqual({ description: null, place });
    }
    expect(testMeetup().meetup).toEqual({ description: null, place: null });
  });

  it('stays as it was when the information is changed', () => {
    const made = createMeetup({ ...fresh, place: STOP });
    if (!made.ok) throw new Error(made.reason);
    const set = setDescription(made.party, 'Bring snacks.');
    expect(set.ok && set.party.meetup.place).toBe(STOP);
  });
});
