import { describe, expect, it } from 'vitest';
import { ALICE, BOB, testMeetup, testRaid, testTrain } from '../../../test/support/parties.js';
import { MAX_OPEN_PARTIES, mayOpenParty, openPartiesOf } from './open-parties.js';

describe('openPartiesOf', () => {
  const train = testTrain({ id: 'a', createdById: ALICE });
  const meetup = testMeetup({ id: 'b', createdById: ALICE });

  it('counts the trains and meetups this member made in this server', () => {
    expect(openPartiesOf([train, meetup], 1, ALICE)).toBe(2);
  });

  it("leaves out others' parties, other servers' and raids", () => {
    const parties = [
      train,
      testTrain({ id: 'c', createdById: BOB }),
      testMeetup({ id: 'd', createdById: ALICE, guildId: 2 }),
      { ...testRaid(), createdById: ALICE },
    ];
    expect(openPartiesOf(parties, 1, ALICE)).toBe(1);
  });
});

describe('mayOpenParty', () => {
  it('allows up to the cap, what waits for a moderator counted', () => {
    expect(mayOpenParty(MAX_OPEN_PARTIES - 1, 0, false)).toBe(true);
    expect(mayOpenParty(MAX_OPEN_PARTIES, 0, false)).toBe(false);
    expect(mayOpenParty(MAX_OPEN_PARTIES - 1, 1, false)).toBe(false);
    expect(mayOpenParty(0, MAX_OPEN_PARTIES, false)).toBe(false);
  });

  it('holds staff to nothing', () => {
    expect(mayOpenParty(MAX_OPEN_PARTIES * 2, 3, true)).toBe(true);
  });

  it('is five', () => {
    expect(MAX_OPEN_PARTIES).toBe(5);
  });
});
