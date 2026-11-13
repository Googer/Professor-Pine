import { describe, expect, it } from 'vitest';
import { EAST_FORUM, WEST_FORUM } from '../../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testMax,
  TEST_PIN,
  TEST_SPOT,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
  stops,
} from '../../../test/support/parties.js';
import type { Party, RaidParty, TrainParty } from '../party/party.js';
import { setHatchTime } from '../party/raid.js';
import { PartyStatus } from '../party/status.js';
import {
  mapParty,
  partyView,
  conductorOf,
  moveRefusalOf,
  trainMovesOf,
  trainRights,
  type MapMoves,
  type PartyViewInput,
} from './party-view.js';

const GUILD = '412345678901234567';
const EGG_PICTURE = 'https://raw.githubusercontent.com/PokeMiners/raid_egg_2_icon.png';
const BOSS_PICTURE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png';
const ORIGINS = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];
const MACHAMP_PICTURE = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm68.icon.png';

/** How the renderer shows `testMax()` (`maxLook`): the boss's picture, its name, the spot. */
const MAX_LOOK = () => ({
  picture: MACHAMP_PICTURE,
  boss: 'Machamp',
  place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
  spotId: TEST_SPOT.id,
});

/** A party with its post in a forum. */
function posted<P extends Party>(party: P, forum = WEST_FORUM, post = '700000000000000001'): P {
  return { ...party, forumChannelId: forum, forumPostId: post };
}

/** An egg at gym 1, posted, that hatches at 14:30 and ends at 15:15. */
const egg = posted(setHatchTime(testRaid(), at('2026-10-13T14:30'), testRaidRules(), PARTY_NOW));

function input(parties: readonly Party[], more: Partial<PartyViewInput> = {}): PartyViewInput {
  return {
    guildId: GUILD,
    guildRow: 1,
    parties,
    memberId: ALICE,
    barred: new Set(),
    now: PARTY_NOW,
    zone: PARTY_ZONE,
    readOnly: false,
    staff: false,
    // The renderer's (`raidLook`): the egg's picture until it hatches.
    look: (raid: RaidParty) => ({
      picture: raid.hatchTime !== null && PARTY_NOW < raid.hatchTime ? EGG_PICTURE : BOSS_PICTURE,
      boss: 'Yveltal',
      heading: 'Level 5 raid (egg)',
    }),
    pictureOrigins: ORIGINS,
    ...more,
  };
}

describe('partyView', () => {
  it('shows a raid with its gym, picture, tier, boss, times and the link to its post', () => {
    const view = partyView(input([egg]));
    expect(view.zone).toBe(PARTY_ZONE);
    expect(view.readOnly).toBe(false);
    expect(view.raids).toEqual([
      {
        kind: 'raid',
        id: egg.id,
        gymId: 1,
        picture: EGG_PICTURE,
        tier: 'Level 5 raid',
        tierGroup: '5',
        // The post's own heading words (`raidLook`, plan 8M-7 fix round 1).
        heading: 'Level 5 raid (egg)',
        boss: 'Yveltal',
        stage: 'egg',
        hatchTime: at('2026-10-13T14:30'),
        endTime: egg.endTime,
        link: `https://discord.com/channels/${GUILD}/700000000000000001`,
        place: null,
        // Anybody the map shows the raid to (plan 8M-8B).
        mayChange: true,
        postKey: null,
        attendance: {
          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
          going: 0,
          mine: null,
          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
          remote: { offered: true, on: false },
          count: true,
        },
        // Report… for a member who sees the forum on Discord (review W-7).
        mayReport: true,
      },
    ]);
    expect(view.trains).toEqual([]);
    expect(view.meetups).toEqual([]);
  });

  it("says where a raid is as its post's Where does, for a gym the map may not show", () => {
    const place = { name: 'The Stacks', lat: 40.050000049, lon: -80.0500001, address: null };
    const [raid] = partyView(input([egg], { look: () => ({ place }) })).raids;
    expect(raid?.place).toEqual({ name: 'The Stacks', lat: 40.05, lon: -80.05, address: null });
  });

  it('counts heads per status and group as the post does, a +1 counted and a member asked as present', () => {
    const raid = withAttendees(egg, {
      [ALICE]: { status: PartyStatus.Coming, number: 3 },
      [BOB]: { status: PartyStatus.Present, group: 'A' },
      [CAROL]: { status: PartyStatus.CompletePending, group: 'A' },
      '200000000000000005': { status: PartyStatus.Complete },
    });
    const view = partyView(input([raid]));
    expect(view.raids[0]?.attendance.groups).toEqual([
      { id: 'A', interested: 1, coming: 3, present: 2 },
    ]);
    expect(view.raids[0]?.attendance.mine).toEqual({ status: 'coming', group: 'A' });
    // Going (plan 8M-7): the committed heads of the whole party, by the lobbies' own rule
    // (`goingCount`): coming, here and asked, +1s counted; never a sum made in the page.
    expect(view.raids[0]?.attendance.going).toBe(3 + 1 + 1);
  });

  it('gives a raid of several groups the buttons of one, and asks a newcomer which group', () => {
    // Plan 8X-1B: one Join, as the post has; the popup asks a member who is not signed up which
    // group, by the post's dialog's rules and order (in letter order, plan 8X-G).
    const groups = [
      { id: 'A' as const },
      { id: 'B' as const, label: 'park side', opened: egg.createdAt + 1 },
    ];
    const raid = withAttendees(
      { ...egg, groups, defaultGroupId: 'B' },
      { [ALICE]: { group: 'B' }, [BOB]: { group: 'A', status: PartyStatus.Interested } },
    );
    const { attendance } = partyView(input([raid])).raids[0] ?? {};
    expect(attendance?.groups).toEqual([
      { id: 'A', interested: 2, coming: 0, present: 0 },
      { id: 'B', interested: 0, coming: 1, present: 0 },
    ]);
    expect(attendance?.mine).toEqual({ status: 'coming', group: 'B' });
    expect(attendance?.actions).toEqual([
      { action: 'interested' },
      { action: 'join' },
      { action: 'here' },
      { action: 'leave' },
    ]);
    // Alice is signed up: nothing to ask.
    expect(attendance).not.toHaveProperty('pick');
    const newcomer = partyView(input([raid], { memberId: CAROL })).raids[0]?.attendance;
    expect(newcomer?.pick).toEqual([
      { group: 'A', label: 'Group A' },
      { group: 'B', label: 'Group B: park side' },
    ]);
    // Where the groups have a size, any group with room first.
    const sized = partyView(input([raid], { memberId: CAROL, lobbySize: () => 4 })).raids[0];
    expect(sized?.attendance.pick?.[0]).toEqual({ label: 'Any group with room' });
    // Nothing to ask while the map is read-only.
    expect(
      partyView(input([raid], { memberId: CAROL, readOnly: true })).raids[0]?.attendance,
    ).not.toHaveProperty('pick');
  });

  it('lists a letter given again by letter, in the counts and the question (review r0 A7)', () => {
    // Stored before plan 8X-G: C and D opened, A and B gone, A opened again last.
    const groups = [
      { id: 'C' as const, opened: egg.createdAt + 1 },
      { id: 'D' as const, opened: egg.createdAt + 2 },
      { id: 'A' as const, opened: egg.createdAt + 3 },
    ];
    const raid = withAttendees(
      { ...egg, groups, defaultGroupId: 'A' },
      { [ALICE]: { group: 'C' }, [BOB]: { group: 'D' } },
    );
    const view = partyView(input([raid], { memberId: CAROL })).raids[0]?.attendance;
    expect(view?.groups.map((group) => group.id)).toEqual(['A', 'C', 'D']);
    expect(view?.pick?.map((choice) => choice.group)).toEqual(['A', 'C', 'D']);
  });

  it('offers Done once the raid has hatched, and Leave to a member signed up', () => {
    const hatched = at('2026-10-13T14:40');
    const view = partyView(
      input([withAttendees(egg, { [ALICE]: { status: PartyStatus.Present } })], { now: hatched }),
    );
    expect(view.raids[0]).toMatchObject({ stage: 'hatched' });
    expect(view.raids[0]?.attendance.actions).toEqual([
      { action: 'interested' },
      { action: 'join' },
      { action: 'here' },
      { action: 'done' },
      { action: 'leave' },
    ]);
  });

  it('offers nothing to press while the map is read-only', () => {
    const view = partyView(input([egg], { readOnly: true }));
    expect(view.readOnly).toBe(true);
    expect(view.raids[0]?.attendance.actions).toEqual([]);
    expect(view.raids[0]?.attendance.count).toBe(false);
  });

  // Plan 8M-8B (X10): Group…'s choices as the caller words them, none while read-only.
  // Review W-7, N-2: Report… for a member who sees the party's forum on Discord, not while
  // read-only, and not from a forum they cannot see by their roles (`hidden`).
  it('offers Report… where the member sees the forum, not while read-only nor from a hidden forum', () => {
    expect(partyView(input([egg])).raids[0]?.mayReport).toBe(true);
    expect(partyView(input([egg], { readOnly: true })).raids[0]).not.toHaveProperty('mayReport');
    const hidden = partyView(input([egg], { hidden: new Set([WEST_FORUM]) })).raids[0];
    expect(hidden?.id).toBe(egg.id);
    expect(hidden).not.toHaveProperty('mayReport');
  });

  it('gives Group…’s choices of a party with groups, none while the map is read-only', () => {
    const regroup = () => ({ refused: 'You are done with this raid.' });
    expect(partyView(input([egg], { regroup })).raids[0]?.attendance.regroup).toEqual({
      refused: 'You are done with this raid.',
    });
    expect(
      partyView(input([egg], { regroup, readOnly: true })).raids[0]?.attendance,
    ).not.toHaveProperty('regroup');
    expect(partyView(input([egg])).raids[0]?.attendance).not.toHaveProperty('regroup');
  });

  // Plan 8M-8B: +1 and −1 for everybody, as the post has them; the completion question to the
  // member it asked, until when it waits for the answer (`pendingUntil`).
  it('offers +1 and −1, and asks the member the completion question asked them', () => {
    const until = at('2026-10-13T14:45');
    const asked = withAttendees(egg, {
      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: until },
      [BOB]: { status: PartyStatus.Present },
    });
    const view = partyView(input([asked]));
    expect(view.raids[0]?.attendance.count).toBe(true);
    // The party in the question's words, as the domain names it (`partyWord`; review W-4).
    expect(view.raids[0]?.attendance.asked).toEqual({ until, word: 'raid' });
    expect(partyView({ ...input([asked]), memberId: BOB }).raids[0]?.attendance).not.toHaveProperty(
      'asked',
    );
    expect(partyView(input([asked], { readOnly: true })).raids[0]?.attendance).not.toHaveProperty(
      'asked',
    );
  });

  // Plan 8M-8B (Matt's ruling, X5): Discord lets anybody in the post set the hatch, the end and
  // the boss; on the map that is anybody it shows the raid to (not barred from its forum).
  it('lets any member the map shows a raid to change it, signed up or not; nobody while read-only', () => {
    const signedUp = withAttendees(egg, { [ALICE]: { status: PartyStatus.Interested } });
    expect(partyView(input([signedUp])).raids[0]?.mayChange).toBe(true);
    expect(partyView(input([egg])).raids[0]?.mayChange).toBe(true);
    expect(partyView(input([egg], { readOnly: true })).raids[0]?.mayChange).toBe(false);
  });

  it('names Eternatus’s battle Eternamax, its tier as well as its title', () => {
    const max = posted(testMax({ tier: 'G', boss: { key: 'eternatus_eternamax' } }));
    const look = () => ({ ...MAX_LOOK(), boss: 'Eternatus (Eternamax)' });
    const [shown] = partyView(input([max], { maxLook: look })).maxes;
    expect(shown).toMatchObject({ tier: 'Eternamax', title: 'Eternamax Eternatus' });
  });

  // Plan 8X-5 (design 7): a max battle is drawn at its spot, as a raid at its gym.
  it('shows a max battle at its spot, with its boss, tier, end, post and buttons, Done among them', () => {
    const max = posted(testMax(), WEST_FORUM, '700000000000000009');
    const view = partyView(input([max, egg], { maxLook: MAX_LOOK }));
    expect(view.raids.map((raid) => raid.id)).toEqual([egg.id]);
    expect(view.maxes).toEqual([
      {
        kind: 'max',
        id: max.id,
        spotId: TEST_SPOT.id,
        picture: MACHAMP_PICTURE,
        level: 'D2',
        tier: 'Dynamax 2★',
        boss: 'Machamp',
        title: 'Dynamax Machamp (2★)',
        endTime: at('2026-10-13T21:00'),
        link: `https://discord.com/channels/${GUILD}/700000000000000009`,
        place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
        postKey: null,
        attendance: {
          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
          going: 0,
          mine: null,
          actions: [
            { action: 'interested' },
            { action: 'join' },
            { action: 'here' },
            { action: 'done' },
          ],
          remote: { offered: true, on: false },
          count: true,
        },
        // Report… for a member who sees the forum on Discord (review W-7).
        mayReport: true,
      },
    ]);
    expect([...view.trains, ...view.meetups]).toEqual([]);
  });

  it('shows a battle at a pin as an unlisted power spot, its place to six decimals', () => {
    const max = posted(testMax({ spot: TEST_PIN }), WEST_FORUM, '700000000000000009');
    const look = () => ({
      boss: 'Machamp',
      place: { name: 'Unlisted power spot', lat: 40.0020000004, lon: -80.002, address: null },
      spotId: null,
    });
    const [shown] = partyView(input([max], { maxLook: look })).maxes;
    expect(shown).toMatchObject({
      spotId: null,
      picture: null,
      place: { name: 'Unlisted power spot', lat: 40.002, lon: -80.002, address: null },
    });
  });

  it('leaves out a max battle once its end has come, and its picture from a host the page may not load', () => {
    const max = posted(testMax(), WEST_FORUM, '700000000000000009');
    const ended = input([max], { maxLook: MAX_LOOK, now: at('2026-10-13T21:00') });
    expect(mapParty(max, ended)).toBeNull();
    expect(partyView(ended).maxes).toEqual([]);
    const evil = () => ({ ...MAX_LOOK(), picture: 'https://evil.example/x.png' });
    expect(partyView(input([max], { maxLook: evil })).maxes[0]?.picture).toBeNull();
  });

  it('offers Remote where the post does, and says whether the member takes part remotely', () => {
    const remote = withAttendees(egg, { [ALICE]: { status: PartyStatus.Coming, remote: true } });
    expect(partyView(input([remote])).raids[0]?.attendance.remote).toEqual({
      offered: true,
      on: true,
    });
    expect(partyView(input([remote], { readOnly: true })).raids[0]?.attendance.remote).toEqual({
      offered: false,
      on: true,
    });
    // An elite raid is in person only: its post has no Remote either.
    const elite = posted(testRaid({ tier: { level: 'Elite', shadow: false } }));
    expect(partyView(input([elite])).raids[0]?.attendance.remote).toEqual({
      offered: false,
      on: false,
    });
  });

  it('leaves out a picture from a host the page may not load', () => {
    const view = partyView(
      input([egg], { look: () => ({ picture: 'https://evil.example/x.png', boss: 'Yveltal' }) }),
    );
    expect(view.raids[0]?.picture).toBeNull();
    const none = partyView(input([egg], { look: () => ({}) }));
    // A look without a heading (none drawn): the tier in the posts' words.
    expect(none.raids[0]?.heading).toBe('Level 5 raid');
    expect(none.raids[0]).toMatchObject({ picture: null, boss: null });
  });

  it('names the Power Spots of a route by their keys, with where they are (plan 8X-4)', () => {
    const spot = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';
    const gone = '0123456789abcdef0123456789abcdef.7';
    const train = posted(
      { ...testTrain(), train: { ...testTrain().train, route: stops(1, spot, gone), stop: 1 } },
      WEST_FORUM,
      '700000000000000002',
    );
    const spotOf = (_guildId: number, id: string) =>
      id === spot ? { name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 } : undefined;
    const [shown] = partyView(input([train], { spotOf })).trains;
    expect(shown?.route).toEqual(['1', `w${spot}`, `w${gone}`]);
    // Only a power spot Pine keeps has a place to draw the line through; a gone one has none.
    expect(shown?.spots).toEqual([
      { key: `w${spot}`, name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 },
    ]);
    // Without the Wayspots, none is known.
    expect(partyView(input([train])).trains[0]?.spots).toEqual([]);
  });

  // Plan 8M-11B (S27): the line's arrows and loop follow what the train does at its end, as the
  // domain decides it (`endMode`): a route under two stops finishes whatever its mode.
  it("gives a train's end mode as the domain applies it: a route under two stops finishes", () => {
    const withMode = (atEnd: TrainParty['train']['atEnd'], route: number[]) =>
      posted({
        ...testTrain(),
        train: { ...testTrain().train, route: stops(...route), stop: 0, atEnd },
      });
    const atEnd = (party: TrainParty) => partyView(input([party])).trains[0]?.atEnd;
    expect(atEnd(withMode('loop', [1, 2, 3]))).toBe('loop');
    expect(atEnd(withMode('turn-back', [1, 2]))).toBe('turn-back');
    expect(atEnd(withMode('finish', [1, 2, 3]))).toBe('finish');
    expect(atEnd(withMode('loop', [1]))).toBe('finish');
    expect(atEnd(withMode('turn-back', []))).toBe('finish');
  });

  it('shows a train with its route, the stop it is at, and a meetup with its times', () => {
    const train = posted(
      {
        ...testTrain(),
        timed: { name: 'Saturday legendaries', startTime: at('2026-10-13T15:00') },
        train: { ...testTrain().train, route: stops(1, 2, 3), stop: 1 },
      },
      EAST_FORUM,
      '700000000000000002',
    );
    const meetup = posted(
      {
        ...testMeetup(),
        timed: { name: 'Community Day picnic', startTime: at('2026-10-13T16:00') },
        endTime: at('2026-10-13T18:00'),
      },
      WEST_FORUM,
      '700000000000000003',
    );
    const view = partyView(input([train, meetup]));
    expect(view.trains).toEqual([
      {
        kind: 'train',
        id: train.id,
        name: 'Saturday legendaries',
        startTime: at('2026-10-13T15:00'),
        endTime: null,
        trainKind: 'raid',
        trainKindWords: 'Raid Train',
        route: ['1', '2', '3'],
        spots: [],
        stop: 1,
        atEnd: 'finish',
        // The stops ahead by their indices, as the domain counts them (plan 8M-15).
        stopsAhead: [2],
        // What lies ahead is the caller's words (plan 8M-8C): none given here.
        ahead: null,
        link: `https://discord.com/channels/${GUILD}/700000000000000002`,
        postKey: null,
        attendance: {
          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
          going: 0,
          mine: null,
          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
          remote: { offered: true, on: false },
          count: true,
        },
        mayReport: true,
        // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
        may: { arrange: false, clear: false, load: false },
        moves: null,
        conductor: { who: null, mayTake: false, mayDrop: false },
        moveRefusal: { reason: 'not-attending', text: '' },
        mayManage: false,
      },
    ]);
    expect(view.meetups).toEqual([
      {
        kind: 'meetup',
        id: meetup.id,
        name: 'Community Day picnic',
        startTime: at('2026-10-13T16:00'),
        endTime: at('2026-10-13T18:00'),
        link: `https://discord.com/channels/${GUILD}/700000000000000003`,
        postKey: null,
        attendance: {
          groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
          going: 0,
          mine: null,
          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
          remote: { offered: true, on: false },
          count: true,
        },
        mayReport: true,
        // Made before 8D: no place; no information; not the member's to change.
        place: null,
        info: null,
        panel: null,
      },
    ]);
    const finished = { ...train, train: { ...train.train, stop: 3 } };
    expect(partyView(input([finished])).trains[0]?.stop).toBeNull();
    expect(partyView(input([finished])).trains[0]?.stopsAhead).toEqual([]);
    const turning = { ...train, train: { ...train.train, atEnd: 'turn-back' as const } };
    expect(partyView(input([turning])).trains[0]?.stopsAhead).toEqual([2, 1, 0]);
  });

  it('shows a meetup at its place, with its information as written, and the editor for its maker and staff', () => {
    const atGym = posted({
      ...testMeetup({
        createdById: ALICE,
        place: {
          kind: 'gym',
          id: '2',
          title: 'Old Stone Fountain',
          lat: 40.06,
          lon: -80.06,
          address: '12 Market Street',
          image: null,
        },
        description: 'Bring **snacks** <@1>\nand cups.',
      }),
    });
    const [shown] = partyView(input([atGym])).meetups;
    expect(shown).toMatchObject({
      place: {
        kind: 'gym',
        words: 'At Old Stone Fountain',
        lat: 40.06,
        lon: -80.06,
        gymId: 2,
        at: { key: 'gym:2', name: 'Old Stone Fountain' },
      },
      // As written: the page sets it as text.
      info: 'Bring **snacks** <@1>\nand cups.',
      // Alice made it: every change, the start too.
      panel: { start: true },
    });
    const pin = posted({
      ...testMeetup({
        place: { kind: 'pin', lat: 40.08, lon: -80.08, near: null, linkName: 'Blue Tent' },
      }),
    });
    const [atPin] = partyView(input([pin])).meetups;
    expect(atPin?.place).toEqual({
      kind: 'pin',
      words: 'At Blue Tent (a pin)',
      lat: 40.08,
      lon: -80.08,
      gymId: null,
      at: null,
    });
    // Not the maker: nothing to change, but for staff, who set a start too without being signed
    // up (plan 8Z-2: a meetup's times are its maker's and staff's).
    expect(atPin?.panel).toBeNull();
    expect(partyView(input([pin], { staff: true })).meetups[0]?.panel).toEqual({ start: true });
    expect(partyView(input([atGym], { readOnly: true })).meetups[0]?.panel).toBeNull();
    const unnamed = posted({
      ...testMeetup({
        place: { kind: 'pin', lat: 40.08, lon: -80.08, near: null, linkName: null },
      }),
    });
    expect(partyView(input([unnamed])).meetups[0]?.place?.words).toBe('At a dropped pin');
    const nearStop = posted({
      ...testMeetup({
        place: {
          kind: 'pin',
          lat: 40.08,
          lon: -80.08,
          near: { kind: 'stop', title: 'Market Fountain' },
          linkName: null,
        },
      }),
    });
    expect(partyView(input([nearStop])).meetups[0]?.place?.words).toBe('Near Market Fountain');
    // Plan 8M-15: a PokéStop or Power Spot by the key the map's places have (`stop:<key>`,
    // `spot:<Wayfarer id>`), so that the list of things at one place groups the meetup with it.
    const known = (kind: 'stop' | 'powerspot', id: string) =>
      posted({
        ...testMeetup({
          place: { kind, id, title: 'Mural', lat: 40.08, lon: -80.08, address: null, image: null },
        }),
      });
    expect(partyView(input([known('stop', 'abc.16')])).meetups[0]?.place?.at).toEqual({
      key: 'stop:abc.16',
      name: 'Mural',
    });
    expect(partyView(input([known('stop', 'pine-3')])).meetups[0]?.place?.at?.key).toBe(
      'stop:pine-3',
    );
    expect(partyView(input([known('powerspot', 'def.16')])).meetups[0]?.place?.at).toEqual({
      key: 'spot:def.16',
      name: 'Mural',
    });
  });

  it('names nobody: no reporter, maker, attendee or their ids, whatever their privacy', () => {
    const anonymous = withAttendees(
      { ...egg, anonymous: true, makerName: 'Rita Reporter' },
      {
        [ALICE]: { name: 'Alice Allswell', team: 'mystic' },
        [BOB]: { name: 'Bob <@1> **bold**', status: PartyStatus.Present, remote: true },
      },
    );
    const train = posted(
      { ...testTrain({ anonymous: true }), makerName: 'Rita Reporter' },
      WEST_FORUM,
      '700000000000000002',
    );
    const view = partyView(input([anonymous, train], { memberId: CAROL }));
    const text = JSON.stringify(view);
    for (const hidden of [
      REPORTER,
      ALICE,
      BOB,
      'Rita',
      'Alice',
      'Bob',
      'mystic',
      'createdBy',
      'maker',
      'anonymous',
    ]) {
      expect(text).not.toContain(hidden);
    }
    // Only the member's own Remote is said (plan 8X-5): Bob takes part remotely, Carol does not.
    expect(view.raids[0]?.attendance.remote).toEqual({ offered: true, on: false });
  });

  it("leaves out other servers' parties, parties without a post, forums the member is barred from, and what is over", () => {
    const other = { ...egg, id: '00000000-0000-4000-8000-000000000009', guildId: 2 };
    const unposted = { ...testTrain(), id: '00000000-0000-4000-8000-000000000010' };
    const barred = posted(
      { ...testMeetup(), id: '00000000-0000-4000-8000-000000000011' },
      EAST_FORUM,
      '700000000000000004',
    );
    const ended = { ...egg, id: '00000000-0000-4000-8000-000000000012', status: 'ended' as const };
    const over = posted(
      {
        ...testMeetup(),
        id: '00000000-0000-4000-8000-000000000013',
        endTime: at('2026-10-13T13:00'),
      },
      WEST_FORUM,
      '700000000000000005',
    );
    const view = partyView(
      input([egg, other, unposted, barred, ended, over], { barred: new Set([EAST_FORUM]) }),
    );
    expect([...view.raids, ...view.trains, ...view.meetups].map((party) => party.id)).toEqual([
      egg.id,
    ]);
    // A raid is over at its end time, whatever the store says yet.
    expect(partyView(input([egg], { now: at('2026-10-13T15:15') })).raids).toEqual([]);
  });
});

describe('mapParty', () => {
  it('is the one party as the view shows it, or nothing for what the member may not see', () => {
    expect(mapParty(egg, input([]))).toEqual(partyView(input([egg])).raids[0]);
    expect(mapParty(egg, input([], { barred: new Set([WEST_FORUM]) }))).toBeNull();
    expect(mapParty({ ...egg, status: 'ended' }, input([]))).toBeNull();
  });
});

describe('trainRights', () => {
  const route = (party = testTrain()) => ({
    ...party,
    train: { ...party.train, route: stops(1, 2) },
  });

  it('lets who may arrange the route arrange it, the conductor and staff clear it, and who may move it load one', () => {
    const train = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
    expect(trainRights(train, input([]))).toEqual({
      arrange: true,
      clear: false,
      load: true,
    });
    expect(trainRights(train, input([], { memberId: BOB }))).toEqual({
      arrange: false,
      clear: false,
      load: false,
    });
    const conducted = { ...train, train: { ...train.train, conductorId: BOB } };
    expect(trainRights(conducted, input([]))).toEqual({
      arrange: true,
      clear: false,
      load: false,
    });
    expect(trainRights(train, input([], { memberId: CAROL, staff: true }))).toEqual({
      arrange: true,
      clear: true,
      load: true,
    });
    // A bot developer clears a route, as `/route clear` lets them; nothing else.
    expect(trainRights(train, input([], { memberId: CAROL, botStaff: true }))).toEqual({
      arrange: false,
      clear: true,
      load: false,
    });
  });

  it('lets the maker who is not signed up give the train its first route, and nothing while read-only', () => {
    const empty = testTrain({ autoStatus: PartyStatus.NotInterested });
    const maker = input([], { memberId: REPORTER });
    expect(trainRights(empty, maker)).toEqual({
      arrange: true,
      clear: false,
      load: true,
    });
    expect(trainRights(route(empty), maker)).toEqual({
      arrange: true,
      clear: false,
      load: false,
    });
    const signedUp = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
    expect(trainRights(signedUp, input([], { readOnly: true, staff: true }))).toEqual({
      arrange: false,
      clear: false,
      load: false,
    });
    // Plan 8M-8C: a train planned ahead, before it has a route, has no moves; Manage… (its kind)
    // opens for who may move it, the reason being only that it has no route.
    const planned = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
    expect(moveRefusalOf(planned, input([]))).toBe('no-route');
    expect(trainMovesOf(planned, input([]))).toBeNull();
  });
});

describe('trainMovesOf and conductorOf', () => {
  /** A train of three stops at this one, Alice signed up as coming. */
  const stoppedAt = (stop: number, more: Partial<TrainParty['train']> = {}): TrainParty => {
    const train = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
    return { ...train, train: { ...train.train, route: stops(4, 1, 7), stop, ...more } };
  };
  /** Move… as the caller draws it (the post's dialog's builder, `movesOnTheMap`). */
  const drawn = (party: TrainParty): MapMoves => ({
    title: 'Move the train',
    place: String(party.train.stop),
    text: 'the dialog',
    label: 'Where to',
    moves: [{ move: 'next', target: 'x', label: 'Next: X' }],
  });
  const asking = (more: Partial<PartyViewInput> = {}) => input([], { trainMoves: drawn, ...more });

  it("gives who may move the train Move… as the caller draws it (the post's dialog's builder)", () => {
    expect(trainMovesOf(stoppedAt(1), asking())).toEqual(drawn(stoppedAt(1)));
    expect(
      trainMovesOf(stoppedAt(0, { conductorId: REPORTER }), asking({ staff: true })),
    ).not.toBeNull();
    // Without a caller's drawing, none.
    expect(trainMovesOf(stoppedAt(1), input([]))).toBeNull();
  });

  it('gives no Move… to who may not move the train, for a train without a route, or while read-only', () => {
    expect(trainMovesOf(stoppedAt(0), asking({ memberId: BOB }))).toBeNull();
    expect(trainMovesOf(stoppedAt(0, { conductorId: REPORTER }), asking())).toBeNull();
    expect(trainMovesOf(stoppedAt(0, { route: [] }), asking())).toBeNull();
    expect(trainMovesOf(stoppedAt(0), asking({ readOnly: true }))).toBeNull();
  });
  it('says why the member may not move the train, as the commands decide it (review N1)', () => {
    expect(moveRefusalOf(stoppedAt(0), input([]))).toBeNull();
    expect(moveRefusalOf(stoppedAt(0), input([], { memberId: BOB }))).toBe('not-attending');
    expect(moveRefusalOf(stoppedAt(0, { conductorId: REPORTER }), input([]))).toBe('not-conductor');
    // The conductor of a train with no route yet may move it once it has one.
    expect(moveRefusalOf(stoppedAt(0, { route: [], conductorId: ALICE }), input([]))).toBe(
      'no-route',
    );
    expect(moveRefusalOf(stoppedAt(0), input([], { readOnly: true }))).toBe('read-only');
  });

  // Branch review B2 of 8M-8C: whether Manage… opens is the server's, as Discord decides it
  // before the dialog opens (`manageRefusal`): who may move the train and staff, also without a
  // route (its kind alone); never while read-only.
  it('says whether Manage… opens for the member, as the dialog decides it', () => {
    const manages = (party: TrainParty, more: Partial<PartyViewInput> = {}) =>
      partyView(input([posted(party)], more)).trains[0]?.mayManage;
    expect(manages(stoppedAt(0))).toBe(true);
    expect(manages(stoppedAt(0, { route: [] }))).toBe(true);
    expect(manages(stoppedAt(0), { memberId: BOB })).toBe(false);
    expect(manages(stoppedAt(0, { conductorId: REPORTER }))).toBe(false);
    expect(manages(stoppedAt(0, { conductorId: REPORTER }), { staff: true })).toBe(true);
    expect(manages(stoppedAt(0), { readOnly: true })).toBe(false);
    expect(manages(stoppedAt(0, { route: [] }), { readOnly: true, staff: true })).toBe(false);
  });

  // Review C1 of 8M-8C: the page says why not in the commands' words, which the caller gives.
  it('sends why not with the train in the words the caller gives for the reason', () => {
    const train = posted(stoppedAt(0, { conductorId: REPORTER }));
    const words = (reason: string) => `Discord's words for ${reason}`;
    const shown = (more: Partial<PartyViewInput>) =>
      partyView(input([train], { trainRefusal: words, ...more })).trains[0]?.moveRefusal;
    expect(shown({})).toEqual({
      reason: 'not-conductor',
      text: "Discord's words for not-conductor",
    });
    expect(shown({ readOnly: true })).toEqual({
      reason: 'read-only',
      text: "Discord's words for read-only",
    });
    expect(shown({ staff: true })).toBeNull();
  });

  it('says whose the conductor role is without naming them, and who may take or drop it', () => {
    expect(conductorOf(stoppedAt(0), input([]))).toEqual({
      who: null,
      mayTake: true,
      mayDrop: false,
    });
    expect(conductorOf(stoppedAt(0, { conductorId: ALICE }), input([]))).toEqual({
      who: 'you',
      mayTake: false,
      mayDrop: true,
    });
    expect(conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { memberId: BOB }))).toEqual(
      {
        who: 'other',
        mayTake: false,
        mayDrop: false,
      },
    );
    expect(
      conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { memberId: BOB, staff: true })),
    ).toEqual({ who: 'other', mayTake: false, mayDrop: true });
    expect(
      conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { readOnly: true })),
    ).toEqual({
      who: 'you',
      mayTake: false,
      mayDrop: false,
    });
  });
});
