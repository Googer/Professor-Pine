import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { setMeetingTime } from './attendance.js';
import { setSaved } from './party.js';
import type { RaidParty } from './party.js';
import { setHatchTime } from './raid.js';
import { carriedOver, relocatedRaid } from './relocate.js';
import { PartyStatus } from './status.js';

const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
const PLACE = { id: NEW_ID, guildId: 1, regionId: 2, gymId: 8 };

/** A raid in full swing: a post, a link line, copies, a question, a warning, two groups. */
function busyRaid(): RaidParty {
  const hatched = setHatchTime(
    testRaid({ boss: { key: 'yveltal' } }),
    at('2026-10-13T13:50'),
    testRaidRules(),
    PARTY_NOW,
  );
  const withMembers = withAttendees(hatched, {
    [ALICE]: { status: PartyStatus.Complete, name: 'Alice', team: 'mystic' },
    [BOB]: {
      status: PartyStatus.CompletePending,
      pendingUntil: PARTY_NOW + 60_000,
      askedBy: ALICE,
      number: 3,
      remote: true,
    },
    [CAROL]: { status: PartyStatus.Present, group: 'B' },
  });
  return {
    ...withMembers,
    groups: [{ id: 'A', label: 'early' }, { id: 'B' }],
    defaultGroupId: 'B',
    forumChannelId: '100000000000000011',
    forumPostId: '300000000000000001',
    regionLinkMessageId: '300000000000000002',
    mirrorMessages: [
      { channelId: '100000000000000021', messageId: '300000000000000003', kind: 'remote' },
    ],
    prompts: {
      completion: [{ id: '300000000000000004', members: [BOB] }],
      warning: '300000000000000005',
    },
    deletionTime: PARTY_NOW + 600_000,
    updatedAt: PARTY_NOW + 5,
  };
}

describe('relocatedRaid', () => {
  it('is the same raid in the new place, with nothing on Discord yet', () => {
    const source = busyRaid();
    const moved = relocatedRaid(source, PLACE);
    // Who reported it is still named in the new post.
    expect(relocatedRaid({ ...source, makerName: 'Rae' }, PLACE).makerName).toBe('Rae');
    // So is the screenshot it was reported from, and whether its time is a guess.
    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
    expect(
      relocatedRaid({ ...source, raid: { ...source.raid, screenshot } }, PLACE).raid.screenshot,
    ).toEqual(screenshot);
    expect(moved).toMatchObject({
      id: NEW_ID,
      type: 'raid',
      status: 'active',
      guildId: 1,
      regionId: 2,
      gymId: 8,
      forumChannelId: null,
      forumPostId: null,
      regionLinkMessageId: null,
      mirrorMessages: [],
      prompts: { completion: [], warning: null },
      deletionTime: null,
      createdById: REPORTER,
      createdAt: source.createdAt,
      hatchTime: source.hatchTime,
      endTime: source.endTime,
      lastPossibleTime: source.lastPossibleTime,
      groups: source.groups,
      defaultGroupId: 'B',
    });
    expect(moved.raid).toEqual(source.raid);
    // The source is not touched.
    expect(source.forumPostId).toBe('300000000000000001');
  });

  it('keeps the members as they are, but nobody stays asked: the question was in the old post', () => {
    const moved = relocatedRaid(busyRaid(), PLACE);
    expect(Object.keys(moved.attendees)).toEqual([REPORTER, ALICE, BOB, CAROL]);
    expect(moved.attendees[ALICE]).toMatchObject({ status: PartyStatus.Complete, name: 'Alice' });
    expect(moved.attendees[BOB]).toEqual({
      status: PartyStatus.Present,
      number: 3,
      remote: true,
      group: 'A',
    });
    expect(moved.attendees[CAROL]).toMatchObject({ status: PartyStatus.Present, group: 'B' });
  });

  it('keeps a kept raid kept and a meeting time', () => {
    const source = busyRaid();
    const met = setMeetingTime(source, CAROL, at('2026-10-13T14:10'));
    if (!met.ok) throw new Error(met.reason);
    const moved = relocatedRaid(setSaved(met.party, true), PLACE);
    expect(moved.saved).toBe(true);
    expect(moved.groups.find((group) => group.id === 'B')?.startTime).toBe(at('2026-10-13T14:10'));
  });
});

describe('carriedOver', () => {
  it('gives the new party what the raid was when the old one ended, and keeps its own place and messages', () => {
    const source = busyRaid();
    const target: RaidParty = {
      ...relocatedRaid(source, PLACE),
      forumChannelId: '100000000000000012',
      forumPostId: '300000000000000011',
      regionLinkMessageId: '300000000000000012',
      mirrorMessages: [
        { channelId: '100000000000000021', messageId: '300000000000000013', kind: 'remote' },
      ],
      updatedAt: PARTY_NOW + 9,
    };
    // Meanwhile, in the old post: Carol left, the hatch time was corrected.
    const { [CAROL]: _carol, ...others } = source.attendees;
    const later = setHatchTime(
      { ...source, attendees: others },
      at('2026-10-13T13:55'),
      testRaidRules(),
      PARTY_NOW,
    );
    const carried = carriedOver(target, later, relocatedRaid(source, PLACE));
    expect(carried).toMatchObject({
      id: NEW_ID,
      regionId: 2,
      gymId: 8,
      status: 'active',
      forumChannelId: '100000000000000012',
      forumPostId: '300000000000000011',
      regionLinkMessageId: '300000000000000012',
      mirrorMessages: target.mirrorMessages,
      prompts: { completion: [], warning: null },
      hatchTime: at('2026-10-13T13:55'),
      updatedAt: PARTY_NOW + 9,
      createdAt: source.createdAt,
    });
    expect(Object.keys(carried.attendees)).toEqual([REPORTER, ALICE, BOB]);
    expect(carried.attendees[BOB]?.status).toBe(PartyStatus.Present);
  });

  it('keeps the archiving the clock scheduled for the new party with its warning', () => {
    const source = busyRaid();
    const start = relocatedRaid(source, PLACE);
    const warned: RaidParty = {
      ...start,
      deletionTime: PARTY_NOW + 900_000,
      prompts: { completion: [], warning: '300000000000000021' },
    };
    expect(carriedOver(warned, source, start)).toMatchObject({
      deletionTime: PARTY_NOW + 900_000,
      prompts: { completion: [], warning: '300000000000000021' },
    });
  });

  it('keeps what a member did in the new party meanwhile', () => {
    const source = busyRaid();
    const start = relocatedRaid(source, PLACE);
    const dave = '200000000000000009';
    // In the new party: Dave signed up (in a group the raid does not have), Alice is back,
    // and the reporter left.
    const joined = withAttendees(start, {
      [dave]: { status: PartyStatus.Coming, group: 'C' },
      [ALICE]: { status: PartyStatus.Present, name: 'Alice', team: 'mystic' },
    });
    const { [REPORTER]: _reporter, ...stayed } = joined.attendees;
    const target = { ...joined, attendees: stayed };
    // In the old one, meanwhile: Carol left.
    const { [CAROL]: _carol, ...others } = source.attendees;
    const carried = carriedOver(target, { ...source, attendees: others }, start);
    expect(Object.keys(carried.attendees)).toEqual([ALICE, BOB, dave]);
    expect(carried.attendees[ALICE]?.status).toBe(PartyStatus.Present);
    expect(carried.attendees[dave]).toMatchObject({ status: PartyStatus.Coming, group: 'B' });
  });
});
