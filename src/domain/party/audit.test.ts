import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  TEST_SPOT,
  stops,
  testMax,
  testMeetup,
  testRaid,
  testTrain,
} from '../../../test/support/parties.js';
import { OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../../../test/support/gyms.js';
import { auditEntries, auditEntryOf, type AuditNames } from './audit.js';
import { endParty, setSaved, type RaidBossRef } from './party.js';

const NAMES: AuditNames = {
  gym: (id) => ({ 1: 'Big Fountain', 2: 'Old Gym' })[id],
  spot: (id, guildId) =>
    id === TEST_SPOT.id && guildId === TEST_GUILD_ROW ? TEST_SPOT.title : undefined,
  boss: (ref: RaidBossRef) =>
    'name' in ref ? ref.name : ref.key === 'yveltal' ? 'Yveltal' : 'Machamp',
  move: (id) => ({ SNARL_FAST: 'Snarl', HURRICANE: 'Hurricane' })[id],
  channel: (regionId) => ({ 1: '300000000000000001', 2: '300000000000000002' })[regionId],
};

describe('auditEntries', () => {
  it('records a raid as it was reported, anonymous or not, with its gym and times', () => {
    const raid = { ...testRaid(), anonymous: true };
    expect(auditEntries(undefined, raid, NAMES)).toEqual([
      {
        action: 'created',
        kind: 'raid',
        what: 'Level 5 raid',
        boss: null,
        place: 'Big Fountain',
        anonymous: true,
        hatch: raid.hatchTime,
        end: raid.endTime,
        start: null,
      },
    ]);
  });

  it('records a raid reported hatched without its boss as hatched, not as an egg', () => {
    const raid = testRaid();
    const hatched = { ...raid, raid: { ...raid.raid, reportedHatched: true } };
    expect(auditEntries(undefined, hatched, NAMES)).toEqual([
      expect.objectContaining({ action: 'created', boss: null, hatched: true }),
    ]);
  });

  it('records a max battle, a meetup and a train as they were made', () => {
    const max = testMax();
    expect(auditEntries(undefined, max, NAMES)).toEqual([
      expect.objectContaining({
        action: 'created',
        kind: 'max',
        what: 'Dynamax 2★ max battle',
        boss: 'Machamp',
        place: 'Gazebo of the Park',
        end: max.endTime,
      }),
    ]);
    expect(auditEntries(undefined, testMeetup(), NAMES)).toEqual([
      expect.objectContaining({ action: 'created', kind: 'meetup', name: 'Community Day picnic' }),
    ]);
    expect(auditEntries(undefined, testTrain(), NAMES)).toEqual([
      expect.objectContaining({ action: 'created', kind: 'train', name: 'Saturday legendaries' }),
    ]);
  });

  it('records a raid that moved here from another region as a move, with where it was', () => {
    const old = testRaid({ gymId: 2, regionId: 2 });
    const raid = testRaid({ id: '00000000-0000-4000-8000-0000000000aa' });
    expect(auditEntries(undefined, raid, NAMES, { movedFrom: old })).toEqual([
      {
        action: 'moved',
        fromParty: old.id,
        fromPlace: 'Old Gym',
        fromChannel: '300000000000000002',
        kind: 'raid',
      },
    ]);
  });

  it('records nothing for a change of nothing it keeps (attendance, the stamp)', () => {
    const raid = testRaid();
    expect(auditEntries(raid, raid, NAMES)).toEqual([]);
    expect(
      auditEntries(raid, { ...raid, updatedAt: raid.updatedAt + 1, attendees: {} }, NAMES),
    ).toEqual([]);
  });

  it('records the boss and tier of a raid, and its moves', () => {
    const egg = testRaid();
    const hatched = { ...egg, raid: { ...egg.raid, boss: { key: 'yveltal' } } };
    expect(auditEntries(egg, hatched, NAMES)).toEqual([
      { action: 'boss', from: 'T5 egg', to: 'Yveltal (T5)' },
    ]);
    const moves = {
      ...hatched,
      raid: { ...hatched.raid, fastMove: 'SNARL_FAST', chargedMove: 'HURRICANE' },
    };
    expect(auditEntries(hatched, moves, NAMES)).toEqual([
      { action: 'moves', from: '? / ?', to: 'Snarl / Hurricane' },
    ]);
  });

  it('records a raid moved to another gym of its region, and its times', () => {
    const raid = testRaid();
    const moved = { ...raid, gymId: 2 };
    expect(auditEntries(raid, moved, NAMES)).toEqual([
      { action: 'place', from: 'Big Fountain', to: 'Old Gym' },
    ]);
    const later = {
      ...raid,
      hatchTime: (raid.hatchTime ?? 0) + 60_000,
      endTime: (raid.endTime ?? 0) + 60_000,
    };
    expect(auditEntries(raid, later, NAMES)).toEqual([
      { action: 'hatch', from: raid.hatchTime, to: later.hatchTime },
      { action: 'end', from: raid.endTime, to: later.endTime },
    ]);
  });

  it("records a max battle's boss and end", () => {
    const max = testMax();
    const changed = {
      ...max,
      endTime: at('2026-10-13T20:00'),
      max: { ...max.max, tier: 'D3' as const },
    };
    expect(auditEntries(max, changed, NAMES)).toEqual([
      { action: 'boss', from: 'Machamp (Dynamax 2★)', to: 'Machamp (Dynamax 3★)' },
      { action: 'end', from: max.endTime, to: changed.endTime },
    ]);
  });

  it("records a timed party's name, start and end, and that its information changed", () => {
    const meetup = testMeetup();
    const changed = {
      ...meetup,
      endTime: at('2026-10-13T18:00'),
      timed: { name: 'Picnic', startTime: at('2026-10-13T16:00') },
      meetup: { ...meetup.meetup, description: 'Bring snacks' },
    };
    expect(auditEntries(meetup, changed, NAMES)).toEqual([
      { action: 'name', from: 'Community Day picnic', to: 'Picnic' },
      { action: 'start', from: null, to: changed.timed.startTime },
      { action: 'end', from: null, to: changed.endTime },
      { action: 'info' },
    ]);
  });

  it("records a train's stops added and removed, a cleared route and its conductor", () => {
    const train = testTrain();
    const routed = { ...train, train: { ...train.train, route: stops(1, TEST_SPOT.id) } };
    // One entry per change of the route, however many stops it added or removed.
    expect(auditEntries(train, routed, NAMES)).toEqual([
      { action: 'route', added: ['Big Fountain', 'Gazebo of the Park'], removed: [] },
    ]);
    const swapped = { ...routed, train: { ...routed.train, route: stops(2, TEST_SPOT.id) } };
    expect(auditEntries(routed, swapped, NAMES)).toEqual([
      { action: 'route', added: ['Old Gym'], removed: ['Big Fountain'] },
    ]);
    // The same stops in another order is no edit of the route.
    const reversed = { ...routed, train: { ...routed.train, route: stops(TEST_SPOT.id, 1) } };
    expect(auditEntries(routed, reversed, NAMES)).toEqual([]);
    const cleared = { ...routed, train: { ...routed.train, route: [] } };
    expect(auditEntries(routed, cleared, NAMES)).toEqual([{ action: 'route-cleared' }]);
    const conducted = {
      ...train,
      attendees: { [ALICE]: { ...Object.values(train.attendees)[0]!, name: 'Alice' } },
      train: { ...train.train, conductorId: ALICE },
    };
    expect(auditEntries(train, conducted, NAMES)).toEqual([
      { action: 'conductor', from: null, to: { id: ALICE, name: 'Alice' } },
    ]);
  });

  it('names a Power Spot of a route as the train’s own server keeps it (plan 19B-3)', () => {
    const train = { ...testTrain(), guildId: OTHER_GUILD_ROW };
    const routed = { ...train, train: { ...train.train, route: stops(TEST_SPOT.id) } };
    // The test server's spot: the second server has none of that id, and names none.
    expect(auditEntries(train, routed, NAMES)).toEqual([
      { action: 'route', added: [null], removed: [] },
    ]);
  });

  it("records a train's boss and its kind", () => {
    const train = testTrain();
    const after = { ...train, train: { ...train.train, boss: { key: 'yveltal' } } };
    expect(auditEntries(train, after, NAMES)).toEqual([
      { action: 'boss', from: 'none', to: 'Yveltal' },
    ]);
    const max = { ...train, train: { ...train.train, kind: 'dynamax' as const } };
    expect(auditEntries(train, max, NAMES)).toEqual([
      { action: 'kind', from: 'raid', to: 'dynamax' },
    ]);
  });

  it('records a party kept from the clock and let go again', () => {
    const raid = testRaid();
    const kept = setSaved(raid, true);
    expect(auditEntries(raid, kept, NAMES)).toEqual([{ action: 'saved', saved: true }]);
    expect(auditEntries(kept, setSaved(kept, false), NAMES)).toEqual([
      { action: 'saved', saved: false },
    ]);
  });

  it('records how a party ended: the clock, staff with the post, the moderators, a move', () => {
    const raid = testRaid();
    const ended = endParty(raid);
    expect(auditEntries(raid, ended, NAMES, { ended: { how: 'clock' } })).toEqual([
      { action: 'ended', how: 'clock' },
    ]);
    expect(
      auditEntries(raid, ended, NAMES, {
        ended: { how: 'cancelled', by: 'staff' },
        removal: 'delete',
      }),
    ).toEqual([{ action: 'ended', how: 'closed', by: 'staff', removal: 'delete' }]);
    expect(
      auditEntries(raid, ended, NAMES, {
        ended: { how: 'cancelled', by: 'moderators' },
        removal: 'archive',
      }),
    ).toEqual([{ action: 'ended', how: 'closed', by: 'moderators', removal: 'archive' }]);
    const there = testRaid({ id: '00000000-0000-4000-8000-0000000000aa', gymId: 2, regionId: 2 });
    expect(
      auditEntries(raid, ended, NAMES, { ended: { how: 'moved', to: there.id }, movedTo: there }),
    ).toEqual([
      { action: 'ended', how: 'moved', toPlace: 'Old Gym', toChannel: '300000000000000002' },
    ]);
    // Somebody ended it without saying how: closed.
    expect(auditEntries(raid, ended, NAMES)).toEqual([{ action: 'ended', how: 'closed' }]);
  });

  it('names a stop or gym it no longer knows as such, never by its id', () => {
    const train = testTrain({});
    const routed = { ...train, train: { ...train.train, route: stops(99) } };
    expect(auditEntries(train, routed, NAMES)).toEqual([
      { action: 'route', added: [null], removed: [] },
    ]);
  });
});

describe('auditEntryOf', () => {
  it('reads back what was written, and nothing it does not know', () => {
    expect(auditEntryOf('boss', { from: 'T5 egg', to: 'Yveltal (T5)' })).toEqual({
      action: 'boss',
      from: 'T5 egg',
      to: 'Yveltal (T5)',
    });
    expect(auditEntryOf('info', null)).toEqual({ action: 'info' });
    expect(auditEntryOf('boss', { from: 3 })).toBeUndefined();
    expect(auditEntryOf('dance', {})).toBeUndefined();
  });

  it('reads a conductor by an id of at most 30 characters, as the log’s index holds it', () => {
    const conductor = (id: string) => ({ from: null, to: { id, name: 'Alice' } });
    expect(auditEntryOf('conductor', conductor('1'.repeat(30)))).toEqual({
      action: 'conductor',
      ...conductor('1'.repeat(30)),
    });
    expect(auditEntryOf('conductor', conductor('1'.repeat(31)))).toBeUndefined();
    expect(
      auditEntryOf('conductor', { from: { id: '1'.repeat(31) }, to: { id: ALICE } }),
    ).toBeUndefined();
  });
});
