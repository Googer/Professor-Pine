import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  PARTY_NOW,
  REPORTER,
  testRaid,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  attendanceLimits,
  createGroup,
  joinChosen,
  joinStamped,
  newGroupChangesNothing,
} from './attendance.js';
import { groupStamp, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const B_OPENED = PARTY_NOW + 60_000;

/** A raid of two groups: the reporter in A, Bob in B (the default one). */
const two = (): RaidParty =>
  withAttendees(
    {
      ...testRaid(),
      groups: [{ id: 'A' }, { id: 'B', opened: B_OPENED }],
      defaultGroupId: 'B',
    },
    { [BOB]: { group: 'B', number: 2 } },
  );
const stampOf = (party: RaidParty, id: 'A' | 'B') => {
  const group = party.groups.find((one) => one.id === id);
  return group ? groupStamp(party, group) : '';
};

describe('joinChosen: the answer to "which group?" as things are at the Submit', () => {
  it('signs a newcomer up in the group they chose, with the status of the button', () => {
    const party = two();
    const change = joinChosen(
      party,
      ALICE,
      PartyStatus.Interested,
      { group: 'A', stamp: stampOf(party, 'A') },
      limits,
    );
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(change.ok && change.party.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      group: 'A',
    });
    expect(change.ok && 'stayed' in change).toBe(false);
  });

  it('refuses a group that went or whose letter another group has now', () => {
    const party = two();
    expect(
      joinChosen(party, ALICE, PartyStatus.Coming, { group: 'B', stamp: 'x' }, limits),
    ).toEqual({ ok: false, reason: 'group-changed' });
    expect(
      joinChosen(
        party,
        ALICE,
        PartyStatus.Coming,
        { group: 'C', stamp: stampOf(party, 'B') },
        limits,
      ),
    ).toEqual({ ok: false, reason: 'group-changed' });
  });

  it('changes only the status of a member who signed up meanwhile, in their own group', () => {
    const party = withAttendees(two(), { [ALICE]: { group: 'B', status: PartyStatus.Interested } });
    const change = joinChosen(
      party,
      ALICE,
      PartyStatus.Coming,
      { group: 'A', stamp: stampOf(party, 'A') },
      limits,
    );
    expect(change).toMatchObject({ ok: true, joined: false, stayed: 'B' });
    expect(change.ok && change.party.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
      group: 'B',
    });
    // Their own group chosen, or any: nothing to say of it.
    const own = joinChosen(
      party,
      ALICE,
      PartyStatus.Coming,
      { group: 'B', stamp: stampOf(party, 'B') },
      limits,
    );
    expect(own.ok && 'stayed' in own).toBe(false);
    expect(joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, limits).ok).toBe(true);
  });

  it('does not say they stayed when coming moved them out of a full group (a lobby size)', () => {
    // Alice is interested in B, which Bob and his +1 fill; coming takes her where there is room.
    const party = withAttendees(two(), { [ALICE]: { group: 'B', status: PartyStatus.Interested } });
    const sized = { ...limits, lobbySize: 2, now: PARTY_NOW + 120_000 };
    const change = joinChosen(
      party,
      ALICE,
      PartyStatus.Coming,
      { group: 'B', stamp: stampOf(party, 'B') },
      sized,
    );
    expect(change.ok && change.party.attendees[ALICE]?.group).toBe('A');
    expect(change.ok && 'stayed' in change).toBe(false);
  });

  it('joins a full group anyway, as a named group does, and places "any" by the lobby size', () => {
    const party = withAttendees(two(), { [REPORTER]: { group: 'A', number: 4 } });
    const sized = { ...limits, lobbySize: 4, now: PARTY_NOW + 120_000 };
    const full = joinChosen(
      party,
      ALICE,
      PartyStatus.Coming,
      { group: 'A', stamp: stampOf(party, 'A') },
      sized,
    );
    expect(full.ok && full.party.attendees[ALICE]?.group).toBe('A');
    const any = joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, sized);
    expect(any.ok && any.party.attendees[ALICE]?.group).toBe('B');
    // Without a size "any" is the default group.
    expect(joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, limits)).toMatchObject({
      ok: true,
      party: { attendees: { [ALICE]: { group: 'B' } } },
    });
  });
});

describe('the moves of Group… (plan 8X-1B)', () => {
  it('moves a member to the group of that stamp, and signs a newcomer up there as coming', () => {
    const party = withAttendees(two(), { [ALICE]: { group: 'A', status: PartyStatus.Present } });
    const moved = joinStamped(party, ALICE, 'B', stampOf(party, 'B'), limits);
    expect(moved.ok && moved.party.attendees[ALICE]).toMatchObject({
      group: 'B',
      status: PartyStatus.Present,
    });
    const fresh = joinStamped(two(), ALICE, 'A', stampOf(party, 'A'), limits);
    expect(fresh.ok && fresh.party.attendees[ALICE]).toMatchObject({
      group: 'A',
      status: PartyStatus.Coming,
    });
    expect(joinStamped(two(), ALICE, 'B', 'x', limits)).toEqual({
      ok: false,
      reason: 'group-changed',
    });
  });

  it('opens a group with a label, tidied, and refuses one too long', () => {
    const opened = createGroup(
      two(),
      ALICE,
      { ...limits, now: PARTY_NOW + 1 },
      '  by the  bridge ',
    );
    expect(opened.ok && opened.party.groups.at(-1)).toEqual({
      id: 'C',
      // After the newest group, B (stamps strictly increase).
      opened: B_OPENED + 1,
      label: 'by the bridge',
    });
    // An empty one is none.
    const blank = createGroup(two(), ALICE, limits, ' ');
    expect(blank.ok && blank.party.groups.at(-1)).not.toHaveProperty('label');
    expect(createGroup(two(), ALICE, limits, 'x'.repeat(101))).toEqual({
      ok: false,
      reason: 'label-too-long',
    });
  });

  it('knows when a new group would change nothing: the member alone in a plain group of their own', () => {
    const alone = { ...testRaid(), groups: [{ id: 'A' as const }] };
    expect(newGroupChangesNothing(alone, REPORTER)).toBe(true);
    expect(newGroupChangesNothing(withAttendees(alone, { [ALICE]: {} }), REPORTER)).toBe(false);
    expect(newGroupChangesNothing(alone, ALICE)).toBe(false);
    // Any number of groups: the reporter is alone in A, Bob is in B.
    expect(newGroupChangesNothing(two(), REPORTER)).toBe(true);
    expect(
      newGroupChangesNothing(withAttendees(two(), { [ALICE]: { group: 'A' } }), REPORTER),
    ).toBe(false);
    // A group with a label or a meeting time stays when they leave it: a new group changes that.
    const labelled = {
      ...two(),
      groups: [{ id: 'A' as const, label: 'park' }, ...two().groups.slice(1)],
    };
    expect(newGroupChangesNothing(labelled, REPORTER)).toBe(false);
    const timed = {
      ...two(),
      groups: [{ id: 'A' as const, startTime: PARTY_NOW }, ...two().groups.slice(1)],
    };
    expect(newGroupChangesNothing(timed, REPORTER)).toBe(false);
  });

  it('refuses a new group that would change nothing, before any other refusal of a full party', () => {
    const alone = { ...testRaid(), groups: [{ id: 'A' as const }] };
    expect(createGroup(alone, REPORTER, limits)).toEqual({
      ok: false,
      reason: 'nothing-to-change',
    });
    // Alone in a plain group of several: the reporter in A, Bob in B.
    expect(createGroup(two(), REPORTER, limits)).toEqual({
      ok: false,
      reason: 'nothing-to-change',
    });
    // With somebody else in their group, or for a newcomer, it opens one.
    expect(createGroup(withAttendees(alone, { [ALICE]: {} }), REPORTER, limits).ok).toBe(true);
    expect(createGroup(alone, ALICE, limits).ok).toBe(true);
  });
});
