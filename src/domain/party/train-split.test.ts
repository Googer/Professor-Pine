import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testTrain,
  withAttendees,
  stops,
  gym,
} from '../../../test/support/parties.js';
import { createGroup } from './attendance.js';
import {
  MAX_PARTY_NAME,
  MAX_SPLITS_KEPT,
  type Attendee,
  type PartyGroup,
  type TrainDetails,
  type TrainParty,
} from './party.js';
import { partyFromStored, partyState } from './party-state.js';
import { PartyStatus } from './status.js';
import {
  carriedSplit,
  groupMark,
  mayNotSplit,
  splitDrawn,
  splitOffGroup,
  splitSettled,
  splitsPossible,
  splitTrain,
  splittableGroups,
} from './train.js';

const HOUR = 3_600_000;
const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
const OLD_POST = '910000000000000001';
const NEW_POST = '910000000000000002';
const DAVE = '200000000000000005';
const link = { partyId: NEW_ID, postId: NEW_POST };

/**
 * A train with these groups (A always first), its route and these members (coming in group A
 * unless they say otherwise), with its post. `REPORTER` made it and is in group A.
 */
function trainWith(
  groups: readonly PartyGroup[],
  attendees: Record<string, Partial<Attendee>>,
  train: Partial<TrainDetails> = {},
): TrainParty {
  const made = withAttendees(testTrain({ autoStatus: PartyStatus.Coming }), attendees);
  return {
    ...made,
    forumChannelId: '900000000000000001',
    forumPostId: OLD_POST,
    groups,
    defaultGroupId: groups.at(-1)?.id ?? 'A',
    train: { ...made.train, ...train },
  };
}

const TWO = [{ id: 'A' }, { id: 'B', label: 'Fast' }] as const satisfies readonly PartyGroup[];

/** Alice and Bob in group B (Fast), Carol in A with the maker. */
const fast = (train: Partial<TrainDetails> = {}) =>
  trainWith(
    TWO,
    { [ALICE]: { group: 'B', name: 'Dawn' }, [BOB]: { group: 'B', number: 2 }, [CAROL]: {} },
    train,
  );

describe('mayNotSplit: who may split a group off', () => {
  it('refuses a train of one group, a group it does not have and an empty one, to everybody', () => {
    const one = trainWith([{ id: 'A' }], { [ALICE]: {} });
    expect(mayNotSplit(one, ALICE, true, 'A')).toBe('one-group');
    expect(mayNotSplit(fast(), ALICE, true, 'C')).toBe('no-such-group');
    const empty = trainWith(TWO, { [ALICE]: {} });
    expect(mayNotSplit(empty, ALICE, true, 'B')).toBe('empty-group');
  });

  it('lets staff split any group, and the conductor any group, in it or not', () => {
    const led = fast({ conductorId: CAROL });
    expect(mayNotSplit(led, DAVE, true, 'B')).toBeUndefined();
    expect(mayNotSplit(led, DAVE, true, 'A')).toBeUndefined();
    expect(mayNotSplit(led, CAROL, false, 'B')).toBeUndefined();
    expect(mayNotSplit(led, CAROL, false, 'A')).toBeUndefined();
  });

  it('lets a member split their own group, with no conductor or a conductor elsewhere', () => {
    expect(mayNotSplit(fast(), ALICE, false, 'B')).toBeUndefined();
    expect(mayNotSplit(fast({ conductorId: CAROL }), BOB, false, 'B')).toBeUndefined();
    // Any status counts: an interested member of the group too.
    const interested = trainWith(TWO, { [ALICE]: { group: 'B', status: PartyStatus.Interested } });
    expect(mayNotSplit(interested, ALICE, false, 'B')).toBeUndefined();
  });

  it('refuses a member of another group, somebody not signed up, and the maker who is not', () => {
    expect(mayNotSplit(fast(), CAROL, false, 'B')).toBe('not-in-group');
    expect(mayNotSplit(fast(), DAVE, false, 'B')).toBe('not-in-group');
    const away = { ...fast(), attendees: { [ALICE]: attendee('B'), [CAROL]: attendee('A') } };
    expect(mayNotSplit(away, REPORTER, false, 'B')).toBe('not-in-group');
  });

  it('refuses to split off a group that holds everybody: the old train would be left empty', () => {
    // Matt, 2026-10-17: group A is empty, so B is the whole train.
    const whole = { ...fast(), attendees: { [ALICE]: attendee('B'), [BOB]: attendee('B') } };
    expect(mayNotSplit(whole, ALICE, false, 'B')).toBe('whole-train');
    expect(mayNotSplit(whole, DAVE, true, 'B')).toBe('whole-train');
    expect(splittableGroups(whole, DAVE, true)).toEqual([]);
    expect(splitsPossible(whole)).toBe(false);
    expect(splitOffGroup(whole, ALICE, false, 'B', link)).toEqual({
      ok: false,
      reason: 'whole-train',
    });
    // Two groups with somebody in them: there is something to split.
    expect(splitsPossible(fast())).toBe(true);
    expect(splitsPossible(trainWith([{ id: 'A' }], { [ALICE]: {} }))).toBe(false);
  });

  it('refuses a train that has no post yet: the new one could not link to it', () => {
    const unposted = { ...fast(), forumPostId: null };
    expect(mayNotSplit(unposted, ALICE, true, 'B')).toBe('unposted');
    expect(splitOffGroup(unposted, ALICE, false, 'B', link)).toEqual({
      ok: false,
      reason: 'unposted',
    });
  });

  it('refuses a new train whose own split is not settled yet, and offers nothing of it', () => {
    // From its post until the paired write, a new train is pending: its groups stay as they are.
    const from = { partyId: '00000000-0000-4000-8000-0000000000bb', postId: OLD_POST };
    const pending = fast({ splitFrom: { ...from, pending: true } });
    expect(mayNotSplit(pending, ALICE, false, 'B')).toBe('split-pending');
    expect(mayNotSplit(pending, DAVE, true, 'B')).toBe('split-pending');
    expect(splitOffGroup(pending, DAVE, true, 'B', link)).toEqual({
      ok: false,
      reason: 'split-pending',
    });
    expect(splittableGroups(pending, DAVE, true)).toEqual([]);
    expect(splitsPossible(pending)).toBe(false);
    // Once settled it is a train like any other.
    const settledOne = fast({ splitFrom: from });
    expect(mayNotSplit(settledOne, ALICE, false, 'B')).toBeUndefined();
    expect(splitsPossible(settledOne)).toBe(true);
  });

  it('leaves a group with the conductor in it to the conductor and staff', () => {
    const led = fast({ conductorId: ALICE });
    expect(mayNotSplit(led, BOB, false, 'B')).toBe('conductor-in-group');
    expect(mayNotSplit(led, ALICE, false, 'B')).toBeUndefined();
    expect(mayNotSplit(led, DAVE, true, 'B')).toBeUndefined();
  });

  it('lists the groups a member may split, for the menu and the autocomplete', () => {
    const three = trainWith([...TWO, { id: 'C' }], {
      [ALICE]: { group: 'B' },
      [BOB]: { group: 'C' },
    });
    expect(splittableGroups(three, ALICE, false)).toEqual(['B']);
    expect(splittableGroups(three, DAVE, false)).toEqual([]);
    // Staff: every group that has somebody in it (C, B and the maker's A).
    expect(splittableGroups(three, DAVE, true)).toEqual(['A', 'B', 'C']);
    expect(
      splittableGroups({ ...three, train: { ...three.train, conductorId: BOB } }, BOB, false),
    ).toEqual(['A', 'B', 'C']);
  });
});

function attendee(group: 'A' | 'B'): Attendee {
  return { number: 1, status: PartyStatus.Coming, group, remote: false };
}

const split = (old: TrainParty, by = ALICE, anonymous = false) =>
  splitTrain(old, { id: NEW_ID, by, anonymous, group: 'B', now: PARTY_NOW + HOUR });

describe('splitTrain: the new train', () => {
  it('is named after the old one and the group, in the same server and region, made now', () => {
    const made = split(fast());
    expect(made).toMatchObject({
      id: NEW_ID,
      type: 'train',
      status: 'active',
      guildId: 1,
      regionId: 1,
      gymId: null,
      hatchTime: null,
      forumChannelId: null,
      forumPostId: null,
      regionLinkMessageId: null,
      mirrorMessages: [],
      createdById: ALICE,
      anonymous: false,
      saved: false,
      createdAt: PARTY_NOW + HOUR,
      updatedAt: PARTY_NOW + HOUR,
      timed: { name: 'Saturday legendaries (Fast)' },
    });
    // The maker of the old train is no maker of this one.
    expect(made.makerName).toBeUndefined();
    // Without a label, by the group's letter.
    const plain = trainWith([{ id: 'A' }, { id: 'B' }], { [ALICE]: { group: 'B' } });
    expect(split(plain).timed.name).toBe('Saturday legendaries (B)');
  });

  it('cuts a long name so that the group still shows, within what a name may be', () => {
    const long = { ...fast(), timed: { name: 'x'.repeat(MAX_PARTY_NAME), startTime: null } };
    const name = split(long).timed.name;
    expect(name.length).toBeLessThanOrEqual(MAX_PARTY_NAME);
    expect(name).toMatch(/^x+… \(Fast\)$/u);
    const label = 'y'.repeat(100);
    const labelled = trainWith([{ id: 'A' }, { id: 'B', label }], { [ALICE]: { group: 'B' } });
    const both = split({ ...labelled, timed: long.timed }).timed.name;
    expect(both.length).toBeLessThanOrEqual(MAX_PARTY_NAME);
    expect(both).toMatch(/^x+… \(y+…\)$/u);
  });

  it('has the group as its one group A, with its label, and its members as they are', () => {
    const made = split(fast());
    expect(made.groups).toEqual([{ id: 'A', label: 'Fast' }]);
    expect(made.defaultGroupId).toBe('A');
    expect(made.attendees).toEqual({
      [ALICE]: { number: 1, status: PartyStatus.Coming, group: 'A', remote: false, name: 'Dawn' },
      [BOB]: { number: 2, status: PartyStatus.Coming, group: 'A', remote: false },
    });
    expect(made.prompts).toEqual({ completion: [], warning: null });
  });

  it('keeps who is here, remote and +1s as they were', () => {
    const old = trainWith(TWO, {
      [ALICE]: { group: 'B', status: PartyStatus.Present, remote: true, number: 3, team: 'mystic' },
    });
    expect(split(old).attendees[ALICE]).toEqual({
      number: 3,
      status: PartyStatus.Present,
      group: 'A',
      remote: true,
      team: 'mystic',
    });
  });

  it('carries the times and the end mode and the boss, before the train started', () => {
    const old = {
      ...fast({ atEnd: 'loop', boss: { key: 'yveltal' } }),
      endTime: PARTY_NOW + 4 * HOUR,
      timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + 2 * HOUR },
    };
    const made = split(old);
    expect(made.timed.startTime).toBe(PARTY_NOW + 2 * HOUR);
    expect(made.endTime).toBe(PARTY_NOW + 4 * HOUR);
    expect(made.lastPossibleTime).toBe(PARTY_NOW + 4 * HOUR);
    expect(made.deletionTime).toBeNull();
    expect(made.train).toEqual({
      kind: 'raid',
      route: [],
      stop: 0,
      finishedFrom: null,
      atEnd: 'loop',
      // Alice split it off, and she is in the group.
      conductorId: ALICE,
      boss: { key: 'yveltal' },
      splitFrom: { partyId: old.id, postId: OLD_POST, pending: true },
      splitOff: [],
    });
  });

  it('is where the old train is, mid-route, finished, and turned back', () => {
    expect(split(fast({ route: stops(4, 1, 7), stop: 1 })).train).toMatchObject({
      route: stops(4, 1, 7),
      stop: 1,
    });
    const finished = split(fast({ route: stops(4, 1, 7), stop: 3, finishedFrom: gym(1) }));
    expect(finished.train).toMatchObject({ route: stops(4, 1, 7), stop: 3, finishedFrom: gym(1) });
    // A turn-back train that has turned keeps its route as it is stored now.
    const turned = split(fast({ route: stops(7, 1, 4), stop: 1, atEnd: 'turn-back' }));
    expect(turned.train).toMatchObject({ route: stops(7, 1, 4), stop: 1, atEnd: 'turn-back' });
  });

  it('is led by the old conductor who goes with the group, else by the presser in it, else by nobody', () => {
    expect(split(fast({ conductorId: BOB }), ALICE).train.conductorId).toBe(BOB);
    expect(split(fast({ conductorId: CAROL }), ALICE).train.conductorId).toBe(ALICE);
    expect(split(fast(), ALICE).train.conductorId).toBe(ALICE);
    // The conductor of the old train, or staff, splitting a group they are not in.
    expect(split(fast({ conductorId: CAROL }), CAROL).train.conductorId).toBeNull();
    expect(split(fast(), DAVE).train.conductorId).toBeNull();
  });

  it('is not led by a presser who asked not to be named, but by the old conductor who goes', () => {
    // As a train made anonymously, it has none until /conductor set (Matt, 2026-10-17).
    expect(split(fast(), ALICE, true).train.conductorId).toBeNull();
    expect(split(fast({ conductorId: CAROL }), ALICE, true).train.conductorId).toBeNull();
    expect(split(fast({ conductorId: BOB }), ALICE, true).train.conductorId).toBe(BOB);
    expect(split(fast({ conductorId: ALICE }), ALICE, true).train.conductorId).toBe(ALICE);
  });

  it('names the presser as its maker, unless they asked not to be named', () => {
    expect(split(fast(), CAROL, false)).toMatchObject({ createdById: CAROL, anonymous: false });
    expect(split(fast(), ALICE, true)).toMatchObject({ createdById: ALICE, anonymous: true });
  });

  it('survives the state document', () => {
    const made = { ...split(fast({ route: stops(4, 1, 7), stop: 1 })), forumPostId: NEW_POST };
    const columns = { ...made, type: made.type };
    const back = partyFromStored(columns, partyState(made), made.mirrorMessages);
    expect(back).toEqual({ ok: true, party: made });
  });
});

describe('splitOffGroup: the old train', () => {
  it('loses the group and its members; the others keep their letters', () => {
    const three = trainWith([...TWO, { id: 'C' }], {
      [ALICE]: { group: 'B' },
      [BOB]: { group: 'B' },
      [CAROL]: { group: 'C' },
    });
    const done = splitOffGroup(three, ALICE, false, 'B', link);
    if (!done.ok) throw new Error(done.reason);
    expect(Object.keys(done.party.attendees)).toEqual([REPORTER, CAROL]);
    expect(done.party.groups).toEqual([{ id: 'A' }, { id: 'C' }]);
    expect(done.party.defaultGroupId).toBe('C');
    expect(Object.keys(done.moved)).toEqual([ALICE, BOB]);
    expect(done.group).toEqual({ id: 'B', label: 'Fast' });
    expect(done.party.train.splitOff).toEqual([{ ...link, group: 'B', label: 'Fast' }]);
  });

  it('hands new sign-ups to the newest group left when the newest one went', () => {
    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
    expect(done.ok && done.party.defaultGroupId).toBe('A');
    // A group opened afterwards takes the next letter, never one in use.
    if (!done.ok) throw new Error(done.reason);
    const three = trainWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }], {
      [ALICE]: { group: 'B' },
      [CAROL]: { group: 'C' },
    });
    const middle = splitOffGroup(three, ALICE, false, 'B', link);
    if (!middle.ok) throw new Error(middle.reason);
    // Opened by a newcomer: Carol, alone in C, would change nothing by it.
    const opened = createGroup(middle.party, BOB, { maxNumber: 6 });
    expect(opened).toMatchObject({ ok: true, group: 'D' });
  });

  it('keeps its conductor, but for one who went with the group', () => {
    const kept = splitOffGroup(fast({ conductorId: CAROL }), ALICE, false, 'B', link);
    expect(kept.ok && kept.party.train.conductorId).toBe(CAROL);
    const gone = splitOffGroup(fast({ conductorId: BOB }), BOB, false, 'B', link);
    expect(gone.ok && gone.party.train.conductorId).toBeNull();
  });

  it('says who leads the new train, as the group is at the split', () => {
    const conductor = (old: TrainParty, by: string) => {
      const done = splitOffGroup(old, by, by === DAVE, 'B', link);
      return done.ok ? done.conductor : done.reason;
    };
    expect(conductor(fast({ conductorId: BOB }), BOB)).toBe(BOB);
    expect(conductor(fast({ conductorId: BOB }), DAVE)).toBe(BOB);
    expect(conductor(fast({ conductorId: CAROL }), ALICE)).toBe(ALICE);
    expect(conductor(fast({ conductorId: CAROL }), CAROL)).toBeNull();
    expect(conductor(fast(), DAVE)).toBeNull();
    // A presser who asked not to be named leads nothing; the old conductor who goes still does.
    const unnamed = (old: TrainParty, by: string) => {
      const done = splitOffGroup(old, by, by === DAVE, 'B', link, undefined, true);
      return done.ok ? done.conductor : done.reason;
    };
    expect(unnamed(fast({ conductorId: CAROL }), ALICE)).toBeNull();
    expect(unnamed(fast(), ALICE)).toBeNull();
    expect(unnamed(fast({ conductorId: BOB }), BOB)).toBe(BOB);
    expect(unnamed(fast({ conductorId: BOB }), DAVE)).toBe(BOB);
  });

  it('keeps its route, stop and mode', () => {
    const old = fast({ route: stops(4, 1, 7), stop: 1, atEnd: 'loop' });
    const done = splitOffGroup(old, ALICE, false, 'B', link);
    expect(done.ok && done.party.train).toMatchObject({
      route: stops(4, 1, 7),
      stop: 1,
      atEnd: 'loop',
    });
  });

  it('lists the splits newest first, as many as it keeps', () => {
    const older = Array.from({ length: MAX_SPLITS_KEPT }, (_, n) => ({
      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      postId: `92000000000000000${n}`,
      group: 'C' as const,
    }));
    const done = splitOffGroup(fast({ splitOff: older }), ALICE, false, 'B', link);
    if (!done.ok) throw new Error(done.reason);
    expect(done.party.train.splitOff).toHaveLength(MAX_SPLITS_KEPT);
    expect(done.party.train.splitOff[0]).toEqual({ ...link, group: 'B', label: 'Fast' });
    expect(done.party.train.splitOff.at(-1)).toEqual(older.at(-2));
  });

  it('refuses as mayNotSplit says', () => {
    expect(splitOffGroup(fast(), CAROL, false, 'B', link)).toEqual({
      ok: false,
      reason: 'not-in-group',
    });
    expect(splitOffGroup(fast({ conductorId: ALICE }), BOB, false, 'B', link)).toEqual({
      ok: false,
      reason: 'conductor-in-group',
    });
  });

  it('refuses a press drawn for a group that changed or went since', () => {
    const drawn = groupMark(fast(), 'B');
    expect(drawn).toBeDefined();
    expect(splitOffGroup(fast(), ALICE, false, 'B', link, drawn).ok).toBe(true);
    const renamed = { ...fast(), groups: [{ id: 'A' }, { id: 'B', label: 'Slow' }] } as TrainParty;
    expect(splitOffGroup(renamed, ALICE, false, 'B', link, drawn)).toEqual({
      ok: false,
      reason: 'group-changed',
    });
    // A group that went (pruned once it emptied, plan 8X-1B) is no such group, as it is for a
    // command, and so is one opened again under its letter since: another group.
    const gone = trainWith([{ id: 'A' }, { id: 'C' }], { [ALICE]: { group: 'C' } });
    expect(splitOffGroup(gone, ALICE, false, 'B', link, drawn)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
    const reopened = {
      ...fast(),
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast', opened: PARTY_NOW + HOUR }],
    } as TrainParty;
    expect(splitOffGroup(reopened, ALICE, false, 'B', link, drawn)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
    expect(splitOffGroup(reopened, ALICE, false, 'B', link, groupMark(reopened, 'B')).ok).toBe(
      true,
    );
    // A command draws nothing: the group it names is asked as it is.
    expect(splitOffGroup(gone, ALICE, false, 'B', link)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
  });

  it('marks a group by the splits so far too: a letter given again is another group', () => {
    // A and B (Fast); B is split off; a new group B (Fast) is opened: the old mark is stale.
    const drawn = groupMark(fast(), 'B');
    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
    if (!done.ok) throw new Error(done.reason);
    const again = {
      ...done.party,
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
      attendees: { ...done.party.attendees, [DAVE]: attendee('B') },
    } as TrainParty;
    expect(groupMark(again, 'B')).not.toBe(drawn);
    expect(splitOffGroup(again, DAVE, false, 'B', link, drawn)).toEqual({
      ok: false,
      reason: 'group-changed',
    });
  });

  it('tells which split a stale mark was drawn for: the group that went', () => {
    const drawn = groupMark(fast(), 'B') ?? '';
    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
    if (!done.ok) throw new Error(done.reason);
    expect(splitDrawn(done.party, 'B', drawn)).toEqual({ ...link, group: 'B', label: 'Fast' });
    // Not for another letter, another mark, or a train it was not split off.
    expect(splitDrawn(done.party, 'A', drawn)).toBeUndefined();
    expect(splitDrawn(done.party, 'B', groupMark(fast(), 'A') ?? '')).toBeUndefined();
    expect(splitDrawn(fast(), 'B', drawn)).toBeUndefined();
    // A group with a stamp of its own is remembered with it, and its split found by it.
    const stamped = {
      ...fast(),
      groups: [{ id: 'A' }, { id: 'B', label: 'Fast', opened: PARTY_NOW + HOUR }],
    } as TrainParty;
    const stampedMark = groupMark(stamped, 'B') ?? '';
    const split = splitOffGroup(stamped, ALICE, false, 'B', link);
    if (!split.ok) throw new Error(split.reason);
    expect(split.party.train.splitOff[0]).toEqual({
      ...link,
      group: 'B',
      label: 'Fast',
      opened: PARTY_NOW + HOUR,
    });
    expect(splitDrawn(split.party, 'B', stampedMark)).toMatchObject({ group: 'B' });
    expect(splitDrawn(split.party, 'B', drawn)).toBeUndefined();
    // A later split of another group: the mark is no longer of the newest split.
    const three = trainWith([...TWO, { id: 'C' }], {
      [ALICE]: { group: 'B' },
      [BOB]: { group: 'C' },
    });
    const first = splitOffGroup(three, ALICE, false, 'B', link);
    if (!first.ok) throw new Error(first.reason);
    const markOfB = groupMark(three, 'B') ?? '';
    const second = splitOffGroup(first.party, BOB, false, 'C', {
      partyId: '00000000-0000-4000-8000-0000000000bb',
      postId: '910000000000000003',
    });
    if (!second.ok) throw new Error(second.reason);
    expect(splitDrawn(second.party, 'B', markOfB)).toBeUndefined();
  });

  it('opens a group after a split under a letter no split named, while one is free', () => {
    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
    if (!done.ok) throw new Error(done.reason);
    expect(createGroup(done.party, CAROL, { maxNumber: 6 })).toMatchObject({
      ok: true,
      group: 'C',
    });
    // B to E all went: B comes again, the first letter that is free.
    const gone = (['B', 'C', 'D', 'E'] as const).map((group, n) => ({
      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      postId: `92000000000000000${n}`,
      group,
    }));
    const spent = trainWith([{ id: 'A' }], { [CAROL]: {} }, { splitOff: gone });
    expect(createGroup(spent, CAROL, { maxNumber: 6 })).toMatchObject({ ok: true, group: 'B' });
  });

  it('marks a group by its label, so that a mark tells one label from another', () => {
    expect(groupMark(fast(), 'B')).not.toBe(
      groupMark({ ...fast(), groups: [{ id: 'A' }, { id: 'B', label: 'Fast!' }] }, 'B'),
    );
    // When the group was opened, then the hash: `<stamp>.<hash>`, both in base 36.
    expect(groupMark(fast(), 'A')).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/u);
    expect(groupMark(fast(), 'A')?.split('.')[0]).toBe(PARTY_NOW.toString(36));
    expect(groupMark(fast(), 'C')).toBeUndefined();
  });
});

describe('carriedSplit: what changed while the new post was made', () => {
  const start = split(fast({ conductorId: CAROL }), ALICE);

  it('moves whoever is in the group at the split, as they are then', () => {
    // Bob left the group before the split; Carol joined it.
    const moved = {
      [ALICE]: attendee('B'),
      [CAROL]: { ...attendee('B'), status: PartyStatus.Present },
    };
    // The conductor of the old train went with the group after all.
    const carried = carriedSplit(start, start, moved, CAROL);
    expect(carried.attendees).toEqual({
      [ALICE]: { ...attendee('B'), group: 'A' },
      [CAROL]: { ...attendee('B'), group: 'A', status: PartyStatus.Present },
    });
    expect(carried.train.conductorId).toBe(CAROL);
  });

  it('keeps what members did on the new train meanwhile, and who left it stays out', () => {
    const moved = { [ALICE]: attendee('B'), [BOB]: attendee('B') };
    const target: TrainParty = {
      ...start,
      attendees: {
        [ALICE]: { ...attendee('B'), group: 'A', status: PartyStatus.Present },
        [DAVE]: { ...attendee('B'), group: 'A' },
      },
    };
    const carried = carriedSplit(target, start, moved, ALICE);
    expect(Object.keys(carried.attendees)).toEqual([ALICE, DAVE]);
    expect(carried.attendees[ALICE]?.status).toBe(PartyStatus.Present);
  });

  it('keeps a conductor somebody set on the new train meanwhile', () => {
    const moved = { [ALICE]: attendee('B'), [BOB]: attendee('B') };
    const target = { ...start, train: { ...start.train, conductorId: BOB } };
    expect(carriedSplit(target, start, moved, ALICE).train.conductorId).toBe(BOB);
  });

  it('gives back the very same train when nothing changed meanwhile', () => {
    const moved = { [ALICE]: { ...attendee('B'), name: 'Dawn' }, [BOB]: start.attendees[BOB] };
    const same = carriedSplit(start, start, moved as Record<string, Attendee>, ALICE);
    expect(same).toBe(start);
    const was = at(fast({ conductorId: CAROL }));
    expect(carriedSplit(start, start, moved as Record<string, Attendee>, ALICE, was)).toBe(start);
  });

  it('takes the stop, route and times of the old train at the split, unless they changed on the new one', () => {
    const old = fast({ route: stops(4, 1, 7), stop: 1, conductorId: CAROL });
    const made = split(old, ALICE);
    const moved = { [ALICE]: made.attendees[ALICE], [BOB]: made.attendees[BOB] } as Record<
      string,
      Attendee
    >;
    // The old train moved on and had its start set while the new post was made.
    const later: Partial<TrainParty> = {
      train: { ...old.train, route: stops(4, 1, 7, 9), stop: 2 },
      timed: { ...old.timed, startTime: PARTY_NOW + 2 * HOUR },
      endTime: PARTY_NOW + 5 * HOUR,
    };
    const carried = carriedSplit(made, made, moved, ALICE, at({ ...old, ...later }));
    expect(carried.train).toMatchObject({
      route: stops(4, 1, 7, 9),
      stop: 2,
      conductorId: ALICE,
      splitFrom: made.train.splitFrom,
      splitOff: [],
    });
    expect(carried.timed).toEqual({
      name: 'Saturday legendaries (Fast)',
      startTime: PARTY_NOW + 2 * HOUR,
    });
    expect(carried.endTime).toBe(PARTY_NOW + 5 * HOUR);
    // Somebody moved the new train itself meanwhile: that counts, as for the conductor.
    const moving = { ...made, train: { ...made.train, stop: 0 } };
    expect(carriedSplit(moving, made, moved, ALICE, at({ ...old, ...later })).train.stop).toBe(0);
  });
});

/** What `splitOffGroup` says of the old train at the split: its train and times. */
function at(old: TrainParty) {
  const done = splitOffGroup(old, REPORTER, true, 'B', link);
  if (!done.ok) throw new Error(done.reason);
  return done.was;
}

describe('the new train of a split waits for the old one (pending)', () => {
  it('is pending from its making until the split is settled', () => {
    const made = split(fast());
    expect(made.train.splitFrom).toEqual({ partyId: fast().id, postId: OLD_POST, pending: true });
    const settledNow = splitSettled(made);
    expect(settledNow.train.splitFrom).toEqual({ partyId: fast().id, postId: OLD_POST });
    expect(splitSettled(settledNow)).toBe(settledNow);
    expect(splitSettled(fast())).toEqual(fast());
  });
});
