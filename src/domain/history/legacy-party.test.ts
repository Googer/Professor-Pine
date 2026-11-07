import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { legacyBossResolver, legacyRecord, type LegacyContext } from './legacy-party.js';

// Invented ids: channels, members, gyms. Nothing here comes from a real server.
const REGION_CHANNEL = '300000000000000001';
const OTHER_CHANNEL = '300000000000000002';
const RAID_CHANNEL = '310000000000000001';
const MEMBER_A = '320000000000000001';
const MEMBER_B = '320000000000000002';
const SERVER = '400000000000000002';
const CREATED = 1_600_000_000_000;
const MINUTE = 60_000;

const boss = legacyBossResolver(catalogueFixture());

function context(overrides: Partial<LegacyContext> = {}): LegacyContext {
  return {
    part: 'complete',
    regionOf: (channelId) =>
      channelId === REGION_CHANNEL ? { regionId: 4, serverId: SERVER } : undefined,
    fallbackServerId: SERVER,
    gymExists: (id) => id === 17,
    boss,
    now: CREATED + 600 * MINUTE,
    ...overrides,
  };
}

/** A raid as the legacy bot kept it in `complete/` in its later years. */
function raid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'raid',
    channelId: RAID_CHANNEL,
    sourceChannelId: REGION_CHANNEL,
    createdById: MEMBER_A,
    originallyCreatedBy: MEMBER_A,
    creationTime: CREATED,
    gymId: 17,
    isExclusive: false,
    hatchTime: CREATED + 30 * MINUTE,
    endTime: CREATED + 75 * MINUTE,
    lastPossibleTime: CREATED + 75 * MINUTE,
    deletionTime: CREATED + 90 * MINUTE,
    pokemon: { name: 'Giratina', form: 'altered', number: 487, tier: 5, shiny: true },
    defaultGroupId: 'B',
    groups: [{ id: 'A' }, { id: 'B', label: 'After work', startTime: CREATED + 40 * MINUTE }],
    attendees: {
      [MEMBER_A]: { number: 2, status: 4, group: 'A', remote: true },
      [MEMBER_B]: { number: '1', status: 1, group: 'B' },
    },
    ...overrides,
  };
}

describe('legacyRecord', () => {
  it('reads a raid of the later years, with no member id anywhere', () => {
    const read = legacyRecord(raid(), context());
    expect(read).toEqual({
      ok: true,
      byFallback: false,
      // Beside the record, never in it (plan 8H-10): the member index alone takes them.
      attendeeIds: [MEMBER_A, MEMBER_B],
      reporterId: MEMBER_A,
      record: {
        source: 'legacy',
        partyId: null,
        legacyKey: `${RAID_CHANNEL}:${String(CREATED)}`,
        kind: 'raid',
        serverId: SERVER,
        regionId: 4,
        gymId: 17,
        legacyGymId: 17,
        wayspotId: null,
        name: null,
        description: null,
        tier: 'T5',
        shadow: false,
        mega: false,
        elite: false,
        ex: false,
        shiny: true,
        boss: { key: 'giratina_altered', dex: 487, species: 'GIRATINA', form: 'GIRATINA_ALTERED' },
        fastMove: null,
        chargedMove: null,
        createdAt: CREATED,
        hatchTime: CREATED + 30 * MINUTE,
        startTime: null,
        endTime: CREATED + 75 * MINUTE,
        endedAt: CREATED + 90 * MINUTE,
        ending: 'completed',
        closedBy: null,
        createdById: null,
        conductorId: null,
        anonymous: false,
        routeStops: null,
        trainKind: null,
        splitFromId: null,
        // No reach was counted then: not recorded.
        reached: 0,
        attendees: [
          {
            memberId: null,
            status: 'done',
            furthest: 'done',
            groupId: 'A',
            extras: 1,
            remote: true,
            team: null,
            signedUpAt: null,
            joinedAt: null,
            hereAt: null,
            doneAt: null,
            leftAt: null,
          },
          expect.objectContaining({ memberId: null, status: 'joined', groupId: 'B', extras: 0 }),
        ],
        groups: [
          { groupId: 'A', label: null, meetingTime: null, members: 1, heads: 2 },
          {
            groupId: 'B',
            label: 'After work',
            meetingTime: CREATED + 40 * MINUTE,
            members: 1,
            heads: 1,
          },
        ],
        stops: [],
      },
    });
    expect(JSON.stringify(read.ok && read.record)).not.toContain(MEMBER_A);
    expect(JSON.stringify(read.ok && read.record)).not.toContain(MEMBER_B);
  });

  it('reads an early egg: tier alone, no groups, an end time that was never set', () => {
    const read = legacyRecord(
      raid({
        pokemon: { egg: true, tier: 3, weakness: [] },
        endTime: 'unset',
        hatchTime: undefined,
        deletionTime: undefined,
        groups: undefined,
        defaultGroupId: undefined,
        attendees: { [MEMBER_A]: { number: 1, status: 0 } },
      }),
      context(),
    );
    expect(read.ok && read.record).toMatchObject({
      tier: 'T3',
      boss: null,
      shiny: null,
      endTime: null,
      hatchTime: null,
      endedAt: CREATED + 75 * MINUTE,
      ending: 'unknown',
      groups: [],
      attendees: [expect.objectContaining({ status: 'interested', groupId: null })],
    });
  });

  it('reads the tiers and flags of every era', () => {
    const tierOf = (pokemon: object, flags: object = {}) => {
      const read = legacyRecord(raid({ pokemon, ...flags }), context());
      return read.ok
        ? [read.record.tier, read.record.mega, read.record.elite, read.record.ex]
        : read.reason;
    };
    expect(tierOf({ tier: 4 })).toEqual(['T4', false, false, false]);
    expect(tierOf({ tier: 2 })).toEqual(['T2', false, false, false]);
    expect(tierOf({ tier: 5 }, { isExclusive: true })).toEqual(['EX', false, false, true]);
    expect(tierOf({ tier: 5 }, { isElite: true })).toEqual(['Elite', false, true, false]);
    expect(tierOf({ name: 'mega', mega: true }, { isMega: true })).toEqual([
      'Mega',
      true,
      false,
      false,
    ]);
    expect(tierOf({ tier: 6, mega: true }, { isMega: true })).toEqual([
      'MegaLegendary',
      true,
      false,
      false,
    ]);
    expect(tierOf({ name: 'pokemon', tier: '????', placeholder: true })).toEqual([
      null,
      false,
      false,
      false,
    ]);
    expect(tierOf({ tier: 7, name: 'ditto' })).toEqual([null, false, false, false]);
    expect(tierOf({ backupTier: 1, name: 'magikarp' })).toEqual(['T1', false, false, false]);
  });

  it('keeps a raid at a gym that is gone, of a region that is gone, in the only server', () => {
    const read = legacyRecord(raid({ gymId: '23', sourceChannelId: OTHER_CHANNEL }), context());
    expect(read.ok && read.byFallback).toBe(true);
    expect(read.ok && read.record).toMatchObject({
      gymId: null,
      legacyGymId: 23,
      regionId: null,
      serverId: SERVER,
    });
    expect(
      legacyRecord(
        raid({ sourceChannelId: OTHER_CHANNEL }),
        context({ fallbackServerId: undefined }),
      ),
    ).toEqual({ ok: false, reason: 'no-server' });
  });

  it('keeps no gym id that cannot be one, and one group of each name', () => {
    const read = legacyRecord(
      raid({
        gymId: -4,
        groups: [{ id: 'A' }, { id: 'A', label: 'again' }, { id: 'AB', label: 'cut to A' }],
      }),
      context(),
    );
    expect(read.ok && read.record).toMatchObject({ gymId: null, legacyGymId: null });
    expect(read.ok && read.record.groups.map((group) => group.groupId)).toEqual(['A']);
  });

  it('writes @member for every member a name, a description or a label of the files names', () => {
    const read = legacyRecord(
      {
        type: 'meet-up',
        channelId: RAID_CHANNEL,
        sourceChannelId: REGION_CHANNEL,
        createdById: MEMBER_A,
        creationTime: CREATED,
        meetupName: `Picnic with <@${MEMBER_B}>`,
        description: `Ask <@!${MEMBER_A}> or ${MEMBER_B} <:pine:123456789012345678>`,
        defaultGroupId: 'A',
        groups: [{ id: 'A', label: `Ride with <@${MEMBER_B}>` }],
        attendees: { [MEMBER_A]: { number: 1, status: 0, group: 'A' } },
      },
      context({ part: 'active' }),
    );
    expect(read.ok && read.record).toMatchObject({
      name: 'Picnic with @member',
      description: 'Ask @member or @member <:pine:123456789012345678>',
      groups: [expect.objectContaining({ label: 'Ride with @member' })],
    });
    expect(JSON.stringify(read.ok && read.record)).not.toContain(MEMBER_A);
    expect(JSON.stringify(read.ok && read.record)).not.toContain(MEMBER_B);
  });

  it('counts the first stop of a train that started, also at its first stop', () => {
    const train = (startTime: number) =>
      legacyRecord(
        {
          type: 'raid train',
          channelId: RAID_CHANNEL,
          sourceChannelId: REGION_CHANNEL,
          createdById: MEMBER_A,
          creationTime: CREATED,
          startTime,
          trainName: 'Early',
          route: [17, 23],
          currentGym: 0,
          attendees: { [MEMBER_A]: { number: 1, status: 1, group: 'A' } },
        },
        context({ part: 'active' }),
      );
    const started = train(CREATED + MINUTE);
    expect(started.ok && started.record.stops.map((stop) => stop.legacyGymId)).toEqual([17]);
    const ahead = train(CREATED + 9_999 * MINUTE);
    expect(ahead.ok && ahead.record.stops).toEqual([]);
  });

  it('skips what is no party, and says why', () => {
    const skip = (value: unknown, part: 'active' | 'complete' = 'complete') => {
      const read = legacyRecord(value, context({ part }));
      return read.ok ? 'read' : read.reason;
    };
    expect(skip('a string')).toBe('not-a-party');
    expect(skip(raid({ type: 'potluck' }))).toBe('unknown-kind');
    expect(skip(raid({ creationTime: 'yesterday' }))).toBe('no-creation-time');
    expect(skip(raid({ channelId: undefined }))).toBe('no-channel');
    // An ended raid counts however little it has; one still going on needs a maker and a member.
    expect(skip(raid({ attendees: {} }))).toBe('read');
    expect(skip(raid({ attendees: {} }), 'active')).toBe('no-attendees');
    expect(skip(raid({ createdById: undefined }), 'active')).toBe('no-creator');
  });

  it('names each kept attendee beside it, in its order, past an attendee it skipped', () => {
    const read = legacyRecord(
      raid({
        attendees: {
          // No status the history knows: skipped, so the next one is the first attendee.
          [MEMBER_B]: { number: 1, status: 9, group: 'A' },
          // A key that is no member id: kept as an attendee, named by nobody.
          'not-a-member': { number: 1, status: 0, group: 'A' },
          [MEMBER_A]: { number: 3, status: 2, group: 'B' },
        },
      }),
      context(),
    );
    expect(read.ok && read.attendeeIds).toEqual([null, MEMBER_A]);
    expect(read.ok && read.record.attendees.map((attendee) => attendee.extras)).toEqual([0, 2]);
  });

  it('takes the reporter only from a maker written as a member id', () => {
    const reporter = (createdById: unknown) => {
      const read = legacyRecord(raid({ createdById, originallyCreatedBy: MEMBER_B }), context());
      return read.ok ? read.reporterId : 'skipped';
    };
    expect(reporter(MEMBER_A)).toBe(MEMBER_A);
    // A number lost its last digits in the legacy bot's JSON; the anonymous raid's real reporter
    // (`originallyCreatedBy`) asked not to be named, and is not.
    expect(reporter(320000000000000000)).toBeNull();
    expect(reporter(undefined)).toBeNull();
    expect(reporter('somebody')).toBeNull();
  });

  it('keeps a raid the legacy bot made anonymous as anonymous, naming nobody (A7)', () => {
    // The legacy bot wrote an anonymous raid's maker as a negative number.
    const read = legacyRecord(raid({ createdById: -1, originallyCreatedBy: MEMBER_A }), context());
    expect(read.ok && read.record.anonymous).toBe(true);
    expect(read.ok && read.reporterId).toBeNull();
    expect(legacyRecord(raid(), context())).toMatchObject({ record: { anonymous: false } });
  });

  it('reads a train that was still going on as ended by the cutover, with the stops it made', () => {
    const read = legacyRecord(
      {
        type: 'raid train',
        channelId: RAID_CHANNEL,
        sourceChannelId: REGION_CHANNEL,
        createdById: MEMBER_A,
        creationTime: CREATED,
        startTime: CREATED + 60 * MINUTE,
        trainName: 'Sunday legendaries',
        route: [17, 23, 31],
        currentGym: 1,
        conductor: null,
        defaultGroupId: 'A',
        groups: [{ id: 'A' }],
        attendees: { [MEMBER_A]: { number: 1, status: 2, group: 'A' } },
      },
      context({ part: 'active' }),
    );
    expect(read.ok && read.record).toMatchObject({
      kind: 'train',
      name: 'Sunday legendaries',
      startTime: CREATED + 60 * MINUTE,
      ending: 'cutover',
      endedAt: null,
      routeStops: 3,
      // The legacy bot's trains were all raid trains.
      trainKind: 'raid',
      stops: [
        { gymId: 17, legacyGymId: 17, arrivedAt: null, leftAt: null },
        { gymId: null, legacyGymId: 23, arrivedAt: null, leftAt: null },
      ],
      attendees: [expect.objectContaining({ status: 'here', memberId: null })],
    });
  });

  it('reads a meetup with what it said about itself', () => {
    const read = legacyRecord(
      {
        type: 'meet-up',
        channelId: RAID_CHANNEL,
        sourceChannelId: REGION_CHANNEL,
        createdById: MEMBER_A,
        creationTime: CREATED,
        meetupName: 'Picnic',
        description: 'At the park',
        defaultGroupId: 'A',
        groups: [{ id: 'A' }],
        attendees: { [MEMBER_A]: { number: 1, status: 0, group: 'A' } },
      },
      context({ part: 'active' }),
    );
    expect(read.ok && read.record).toMatchObject({
      kind: 'meetup',
      name: 'Picnic',
      description: 'At the park',
      gymId: null,
      tier: null,
      ending: 'cutover',
    });
  });
});

describe('legacyBossResolver', () => {
  const key = (pokemon: object) => {
    const found = boss(pokemon);
    return found === null ? null : 'key' in found ? found.key : { raw: found.name };
  };

  it('finds the bosses as the legacy bot named them over the years', () => {
    expect(key({ name: 'rayquaza', form: 'normal', number: 384 })).toBe('rayquaza');
    expect(key({ name: 'Giratina', form: 'altered', number: 487 })).toBe('giratina_altered');
    expect(key({ name: 'Giratina - Origin', form: 'origin', number: '487' })).toBe(
      'giratina_origin',
    );
    expect(key({ name: 'Alolan Marowak', form: 'alola', number: 105 })).toBe('marowak_alola');
    expect(key({ name: 'ho-oh' })).toBe('ho_oh');
    expect(key({ name: 'Mega Charizard X', mega: true })).toBe('charizard_mega_x');
    expect(key({ name: 'Deoxys - Normal', form: 'normal', number: 386 })).toBe('deoxys');
  });

  it('keeps a name it does not know as it was given, and finds no boss in an egg', () => {
    expect(key({ name: 'Unheardofmon' })).toEqual({ raw: 'Unheardofmon' });
    expect(key({ egg: true, tier: 5 })).toBeNull();
    expect(key({ name: 'pokemon', tier: '????', placeholder: true })).toBeNull();
    expect(key({ name: 'mega', mega: true })).toBeNull();
    expect(key({ name: 'elite', elite: true })).toBeNull();
    expect(key({ name: 'egg', tier: '????' })).toBeNull();
  });
});
