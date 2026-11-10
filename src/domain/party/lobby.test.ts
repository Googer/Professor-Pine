import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  REPORTER,
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
} from '../../../test/support/parties.js';
import { DEFAULT_LOBBIES, lobbySize, splitLobby } from './lobby.js';
import { goingCount, lobbyCount, type Party } from './party.js';
import { PartyStatus } from './status.js';

const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;

describe('lobbySize', () => {
  it('is none for every kind of party there is today: a raid, a meetup, a train', () => {
    const lobbies = { raid: 20, dynamax: 4, gigantamax: 100 };
    expect(DEFAULT_LOBBIES).toEqual(lobbies);
    expect(lobbySize(testRaid(), lobbies)).toBeUndefined();
    expect(lobbySize(testRaid({ tier: { level: 'Elite', shadow: false } }), lobbies)).toBe(
      undefined,
    );
    expect(lobbySize(testMeetup(), lobbies)).toBeUndefined();
    expect(lobbySize(testTrain(), lobbies)).toBeUndefined();
  });

  it('refuses a kind of party it does not know, rather than give it no size', () => {
    const unknown = { ...testRaid(), type: 'carnival' } as unknown as Party;
    expect(() => lobbySize(unknown, DEFAULT_LOBBIES)).toThrow(/carnival/);
  });
});

describe('splitLobby', () => {
  it('tells a raid and a train to split up above the raid lobby, a meetup never', () => {
    const lobbies = { raid: 12, dynamax: 4, gigantamax: 100 };
    expect(splitLobby(testRaid(), lobbies)).toBe(12);
    expect(splitLobby(testTrain(), lobbies)).toBe(12);
    expect(splitLobby(testMeetup(), lobbies)).toBeUndefined();
  });

  it('refuses a kind of party it does not know', () => {
    const unknown = { ...testRaid(), type: 'carnival' } as unknown as Party;
    expect(() => splitLobby(unknown, DEFAULT_LOBBIES)).toThrow(/carnival/);
  });
});

describe('lobbyCount', () => {
  it('counts the heads of the committed members of a group: coming, here and asked', () => {
    const party = withAttendees(testRaid(), {
      [REPORTER]: { status: Interested, number: 5 },
      [ALICE]: { status: Coming, number: 2, remote: true },
      [BOB]: { status: Present, number: 3 },
      [CAROL]: { status: CompletePending, pendingUntil: 1, number: 4 },
      '200000000000000005': { status: Complete, number: 6 },
      '200000000000000006': { status: Coming, number: 7, group: 'B' },
    });
    expect(lobbyCount(party, 'A')).toBe(2 + 3 + 4);
    expect(lobbyCount(party, 'B')).toBe(7);
    expect(lobbyCount(party, 'C')).toBe(0);
    // Going, on the map (plan 8M-7): the same rule over the whole party.
    expect(goingCount(party)).toBe(2 + 3 + 4 + 7);
    expect(goingCount(party)).toBe(lobbyCount(party, 'A') + lobbyCount(party, 'B'));
  });
});
