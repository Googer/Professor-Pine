import { describe, expect, it } from 'vitest';
import type {
  MapAttendance,
  MapMax,
  MapMeetup,
  MapRaid,
  MapTrain,
  PartiesView,
} from '../../domain/web/party-data.js';
import {
  clockTime,
  countdown,
  gymPicture,
  gymRaidsPopup,
  maxPopup,
  meetupItem,
  meetupPopup,
  partiesAtKey,
  raidsDrawn,
  MapActivity,
  GroupPicks,
  nextPartyMoment,
  Poller,
  PRESS_FAILED,
  pressLabel,
  pressParty,
  raidPopup,
  raidsAtGyms,
  readOnlyLine,
  trainPlaces,
  trainPopup,
  type PressSteps,
  type ShowContext,
} from './parties.js';
import type { Me } from './notice.js';
import type { MapGym, PageNode } from './popup.js';

const ZONE = 'America/New_York';
/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;
const LINK = 'https://discord.com/channels/412345678901234567/700000000000000001';

const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
  groups: [{ id: 'A', interested: 1, coming: 3, present: 2 }],
  going: 5,
  mine: null,
  actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
  remote: { offered: true, on: false },
  count: true,
  ...more,
});

const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id: 'r1',
  gymId: 1,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid (egg)',
  boss: 'Yveltal',
  stage: 'egg',
  hatchTime: NOW + 30 * MINUTE,
  endTime: NOW + 75 * MINUTE,
  link: LINK,
  place: null,
  mayChange: false,
  attendance: attendance(),
  ...more,
});

const mapGym = (id: number, name: string, address: string | null): MapGym => ({
  id,
  name,
  nickname: null,
  lat: 40.4406,
  lon: -79.9959 + id / 100,
  regionIds: [1],
  address,
  description: null,
  notice: null,
});

/** The gyms of the map: the library with its address line, the fountain without one. */
const GYMS = new Map([
  [1, mapGym(1, 'Pinewood Public Library', '12 Main St, Pinewood')],
  [2, mapGym(2, 'Town Fountain', null)],
]);

const directions = (id: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=40.4406,${-79.9959 + id / 100}`;

const context: ShowContext = {
  now: NOW,
  zone: ZONE,
  gym: (id) => (id === null ? undefined : GYMS.get(id)),
};

/** Every text of a tree, in order. */
function texts(node: PageNode): string[] {
  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
}

/** The nodes of a tree with this tag. */
function tagged(node: PageNode, tag: string): PageNode[] {
  return [
    ...(node.tag === tag ? [node] : []),
    ...(node.children ?? []).flatMap((n) => tagged(n, tag)),
  ];
}

describe('countdown and clockTime', () => {
  it('count down in minutes, then hours and minutes', () => {
    expect(countdown(NOW + 12 * MINUTE + 30_000, NOW)).toBe('in 13 min');
    expect(countdown(NOW + 65 * MINUTE, NOW)).toBe('in 1 h 05 min');
    expect(countdown(NOW + 120 * MINUTE, NOW)).toBe('in 2 h');
    expect(countdown(NOW - MINUTE, NOW)).toBe('now');
  });

  it('give the time in the zone of the posts, with the day when it is not today', () => {
    expect(clockTime(NOW + 30 * MINUTE, ZONE, NOW)).toBe('2:30 PM');
    expect(clockTime(NOW + 24 * 60 * MINUTE, ZONE, NOW)).toBe('Wed, Oct 14, 2:00 PM');
  });
});

describe('pressLabel', () => {
  it("names the post's buttons", () => {
    expect(
      [
        { action: 'interested' },
        { action: 'join' },
        { action: 'join', group: 'B' },
        { action: 'here' },
        { action: 'done' },
        { action: 'leave' },
      ].map((press) => pressLabel(press as never)),
    ).toEqual(['Interested', 'Join', 'Join B', 'Here', 'Done', 'Leave']);
  });

  it("colors each button as the post's (plan 8M-7): Join blurple, Here green, Leave red", () => {
    const popup = raidPopup(
      raid({
        attendance: attendance({
          actions: [
            { action: 'interested' },
            { action: 'join' },
            { action: 'here' },
            { action: 'done' },
            { action: 'leave' },
          ],
        }),
      }),
      context,
    );
    expect(tagged(popup, 'button').map((button) => button.className)).toEqual([
      'press secondary',
      'press primary',
      'press success',
      'press secondary',
      'press danger',
    ]);
  });
});

const max = (more: Partial<MapMax> = {}): MapMax => ({
  kind: 'max',
  id: 'x1',
  spotId: 'spot-1',
  picture: null,
  level: 'D2',
  tier: 'Dynamax 2★',
  boss: 'Machamp',
  title: 'Dynamax Machamp (2★)',
  endTime: NOW + 40 * MINUTE,
  link: LINK,
  place: { name: 'Lake Gazebo', lat: 40.4406, lon: -79.9, address: '1 Lake Dr' },
  attendance: attendance({ actions: [{ action: 'join' }, { action: 'done' }] }),
  postKey: null,
  ...more,
});

// Plan 8M-9A (A2): until its post comes, a max battle's popup is the map's own summary.
describe('maxPopup', () => {
  it('shows the spot with its way there, the battle, its end with a countdown, counts and buttons', () => {
    const popup = maxPopup(max(), context);
    expect(texts(popup)).toEqual([
      'Lake Gazebo',
      '1 Lake Dr',
      'Directions',
      'Dynamax Machamp (2★)',
      'Ends at 2:40 PM',
      'in 40 min',
      'Interested 1 · Coming 3 · Here 2',
      'Join',
      'Done',
      'Open the post',
    ]);
    expect(popup.className).toBe('party-popup max');
    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-party'])).toEqual([
      'x1',
      'x1',
    ]);
    // A pin battle: its place's words, no address line.
    const pin = maxPopup(
      max({
        spotId: null,
        place: { name: 'Unlisted power spot', lat: 40.5, lon: -80, address: null },
      }),
      context,
    );
    expect(texts(pin).slice(0, 3)).toEqual([
      'Unlisted power spot',
      'Directions',
      'Dynamax Machamp (2★)',
    ]);
  });
});

// Plan 8M-9A (A2): every popup's key names the parties it shows, max battles by `max:<id>`.
// R2-1 (with C1): the raids' layer drawn while step 2 picks gyms, or while the party a step 3
// opened (its key) is the one a popup or the card shows; as the layer says otherwise.
describe('raidsDrawn', () => {
  it('draws the raids by their layer, a raid step 2, or the party a step 3 opened while shown', () => {
    const drawn = (more: Partial<Parameters<typeof raidsDrawn>[0]>) =>
      raidsDrawn({
        layerOn: false,
        picking: false,
        opened: undefined,
        opening: false,
        shown: [],
        ...more,
      });
    expect(drawn({ layerOn: true })).toBe(true);
    expect(drawn({ picking: true })).toBe(true);
    expect(drawn({})).toBe(false);
    expect(drawn({ opened: 'gym:2', shown: [undefined, 'gym:2'] })).toBe(true);
    // Its popup or card closed, or another shown: the layer says.
    expect(drawn({ opened: 'gym:2', shown: [undefined, undefined] })).toBe(false);
    expect(drawn({ opened: 'gym:2', shown: ['max:x1', undefined] })).toBe(false);
    // R3-1: drawn already while it is being opened, so that the parties are drawn with it.
    expect(drawn({ opened: 'gym:2', opening: true, shown: [undefined, undefined] })).toBe(true);
    expect(drawn({ opening: true })).toBe(false);
  });
});

describe('partiesAtKey', () => {
  it('finds the raids of a gym, a train by its ring or line, a meetup, a max battle', () => {
    const view: PartiesView = {
      zone: ZONE,
      readOnly: false,
      raids: [raid(), raid({ id: 'r2', gymId: 2 })],
      maxes: [max(), max({ id: 'x2' })],
      trains: [],
      meetups: [],
    };
    expect(partiesAtKey(view, 'gym:1').map((party) => party.id)).toEqual(['r1']);
    expect(partiesAtKey(view, 'max:x2').map((party) => party.id)).toEqual(['x2']);
    expect(partiesAtKey(view, 'max:x9')).toEqual([]);
    expect(partiesAtKey(undefined, 'max:x1')).toEqual([]);
  });
});

describe('raidPopup', () => {
  it('shows the gym, the raid, its time with a countdown, the counts, and the buttons', () => {
    const popup = raidPopup(raid(), context);
    expect(texts(popup)).toEqual([
      'Pinewood Public Library',
      '12 Main St, Pinewood',
      'Directions',
      'Level 5 raid (egg)',
      'Hatches as Yveltal',
      'Hatches at 2:30 PM',
      'in 30 min',
      'Interested 1 · Coming 3 · Here 2',
      'Interested',
      'Join',
      'Here',
      'Open the post',
    ]);
    const [timer] = tagged(popup, 'span').filter((node) => node.className === 'countdown');
    expect(timer?.attributes).toEqual({ 'data-until': String(NOW + 30 * MINUTE) });
    expect(tagged(popup, 'button').map((button) => button.attributes)).toEqual([
      { type: 'button', 'data-party': 'r1', 'data-action': 'interested' },
      { type: 'button', 'data-party': 'r1', 'data-action': 'join' },
      { type: 'button', 'data-party': 'r1', 'data-action': 'here' },
    ]);
    expect(tagged(popup, 'a').map((link) => link.attributes)).toEqual([
      { href: directions(1), target: '_blank', rel: 'noopener noreferrer' },
      { href: LINK, target: '_blank', rel: 'noopener noreferrer' },
    ]);
  });

  it("names the raid in its post's own heading words, its stage by the clock (fix round 1)", () => {
    const heading = 'Level 5 raid against Yveltal';
    const hatched = raidPopup(raid({ stage: 'egg', hatchTime: NOW - MINUTE, heading }), context);
    // Hatched since the list was made: its end, no hatch.
    expect(texts(hatched)).toContain(heading);
    expect(texts(hatched).join(' ')).toContain('Ends at');
    expect(texts(hatched).join(' ')).not.toContain('Hatches');
  });

  it('shows a raid at a gym the map does not show by where its post says it is', () => {
    const place = { name: 'Hilltop Shrine', lat: 40.5, lon: -80.25, address: '1 Hill Rd' };
    const popup = raidPopup(raid({ gymId: 77, place }), context);
    expect(texts(popup).slice(0, 4)).toEqual([
      'Hilltop Shrine',
      '1 Hill Rd',
      'Directions',
      'Level 5 raid (egg)',
    ]);
    expect(tagged(popup, 'a')[0]?.attributes).toEqual({
      href: 'https://www.google.com/maps/dir/?api=1&destination=40.5,-80.25',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    // Without an address: the name and Directions.
    const bare = raidPopup(raid({ gymId: 77, place: { ...place, address: null } }), context);
    expect(texts(bare).slice(0, 3)).toEqual(['Hilltop Shrine', 'Directions', 'Level 5 raid (egg)']);
  });

  it('shows a hatched raid against its boss, the end, the groups and how the member stands', () => {
    const popup = raidPopup(
      raid({
        stage: 'hatched',
        heading: 'Level 5 raid against Yveltal',
        attendance: attendance({
          groups: [
            { id: 'A', interested: 0, coming: 2, present: 0 },
            { id: 'B', interested: 1, coming: 0, present: 4 },
          ],
          mine: { status: 'present', group: 'B' },
          actions: [
            { action: 'join', group: 'A' },
            { action: 'join', group: 'B' },
            { action: 'done' },
            { action: 'leave' },
          ],
        }),
      }),
      { ...context, now: NOW + 40 * MINUTE },
    );
    expect(texts(popup)).toEqual([
      'Pinewood Public Library',
      '12 Main St, Pinewood',
      'Directions',
      'Level 5 raid against Yveltal',
      'Ends at 3:15 PM',
      'in 35 min',
      'Group A: Coming 2',
      'Group B: Interested 1 · Here 4',
      'You: Here, group B',
      'Join A',
      'Join B',
      'Done',
      'Leave',
      'Open the post',
    ]);
    expect(tagged(popup, 'button')[1]?.attributes).toMatchObject({ 'data-group': 'B' });
  });

  it('asks a newcomer which group in the popup, the first chosen to start with (plan 8X-1B)', () => {
    const popup = raidPopup(
      raid({
        attendance: attendance({
          groups: [
            { id: 'A', interested: 0, coming: 2, present: 0 },
            { id: 'B', interested: 1, coming: 0, present: 0 },
          ],
          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
          pick: [{ label: 'Any group with room' }, { group: 'B', label: 'Group B: <b>' }],
        }),
      }),
      context,
    );
    const [select] = tagged(popup, 'select');
    expect(select?.attributes).toMatchObject({
      // Whose it is: the choice is carried across draws by party (`GroupPicks`).
      'data-group-pick': raid({}).id,
      'aria-label': 'Which group?',
    });
    expect(tagged(popup, 'option').map((option) => [option.text, option.attributes])).toEqual([
      ['Any group with room', { value: '', selected: '' }],
      ['Group B: <b>', { value: 'B' }],
    ]);
    // The buttons after it, in the popup's row of buttons.
    expect(texts(popup).slice(-4)).toEqual(['Interested', 'Join', 'Here', 'Open the post']);
  });

  it('says what is not known, and sets every text as text, never markup', () => {
    const popup = raidPopup(
      raid({
        gymId: null,
        boss: null,
        hatchTime: null,
        endTime: null,
        link: 'javascript:alert(1)',
      }),
      context,
    );
    expect(texts(popup).slice(0, 3)).toEqual([
      'Unknown gym',
      'Level 5 raid (egg)',
      'Hatch time not known',
    ]);
    // Only an address of Discord is a link.
    expect(tagged(popup, 'a')).toEqual([]);
  });
});

// Plan 8X-5: the server's list gains `maxes` and every attendance its Remote switch. This page
// reads `raids`, `trains` and `meetups` alone (`party-layer.ts`), so it never sees `maxes`; nor
// does it draw Remote yet (follow-ups, the web UX pass): a raid with the switch is drawn as before.
describe('a raid with the Remote switch', () => {
  it('is drawn as before: its own buttons only, never one of an undefined label', () => {
    const remote = raid({ attendance: attendance({ remote: { offered: true, on: true } }) });
    const { atGyms } = raidsAtGyms([remote], (id) => GYMS.has(id));
    const popup = gymRaidsPopup(1, atGyms.get(1) ?? [], context);
    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-action'])).toEqual([
      'interested',
      'join',
      'here',
    ]);
    expect(texts(popup).join('\n')).not.toMatch(/undefined|Remote/);
  });
});

describe('the raids of a gym', () => {
  const elite = raid({
    id: 'r3',
    tier: 'Elite raid',
    heading: 'Elite raid (egg)',
    boss: 'Mewtwo',
    picture: 'https://example.test/mewtwo.png',
    hatchTime: NOW + 120 * MINUTE,
    endTime: NOW + 180 * MINUTE,
    attendance: attendance({ groups: [{ id: 'A', interested: 2, coming: 0, present: 0 }] }),
  });

  it('puts every raid of a gym the map shows on that gym, in order, and the others aside', () => {
    const atLibrary = raid();
    const atFountain = raid({ id: 'r2', gymId: 2 });
    const noGym = raid({ id: 'r4', gymId: null });
    const unknownGym = raid({ id: 'r5', gymId: 9 });
    const placed = raidsAtGyms([atLibrary, atFountain, elite, noGym, unknownGym], (id) => id < 3);
    expect([...placed.atGyms]).toEqual([
      [1, [atLibrary, elite]],
      [2, [atFountain]],
    ]);
    expect(placed.elsewhere).toEqual([noGym, unknownGym]);
  });

  it('shows the gym once and each raid of it with its own time, counts, buttons and post', () => {
    const popup = gymRaidsPopup(1, [raid(), elite], context);
    expect(texts(popup)).toEqual([
      'Pinewood Public Library',
      '12 Main St, Pinewood',
      'Directions',
      'Level 5 raid (egg)',
      'Hatches as Yveltal',
      'Hatches at 2:30 PM',
      'in 30 min',
      'Interested 1 · Coming 3 · Here 2',
      'Interested',
      'Join',
      'Here',
      'Open the post',
      'Elite raid (egg)',
      'Hatches as Mewtwo',
      'Hatches at 4:00 PM',
      'in 2 h',
      'Interested 2 · Coming 0 · Here 0',
      'Interested',
      'Join',
      'Here',
      'Open the post',
    ]);
    expect(tagged(popup, 'button').map((button) => button.attributes?.['data-party'])).toEqual([
      'r1',
      'r1',
      'r1',
      'r3',
      'r3',
      'r3',
    ]);
  });

  it("gives the gym's address line and its Directions at the top, as the gym's own popup does", () => {
    const popup = gymRaidsPopup(1, [raid()], context);
    const [first, second, third] = popup.children ?? [];
    expect(first).toMatchObject({ tag: 'strong', text: 'Pinewood Public Library' });
    expect(second).toMatchObject({ className: 'address', text: '12 Main St, Pinewood' });
    expect(third).toEqual({
      tag: 'a',
      className: 'directions',
      text: 'Directions',
      attributes: { href: directions(1), target: '_blank', rel: 'noopener noreferrer' },
    });
    // A gym without an address line: Directions alone.
    expect(texts(gymRaidsPopup(2, [raid({ gymId: 2 })], context)).slice(0, 3)).toEqual([
      'Town Fountain',
      'Directions',
      'Level 5 raid (egg)',
    ]);
  });

  it("takes the marker's picture from the first raid that has one", () => {
    expect(gymPicture([raid(), elite])).toBe('https://example.test/mewtwo.png');
    expect(gymPicture([raid()])).toBeNull();
  });
});

describe('readOnlyLine', () => {
  it('says the map is read-only only while it is', () => {
    expect(readOnlyLine(true)).toBe('Discord cannot be reached just now, so the map is read-only.');
    expect(readOnlyLine(false)).toBeUndefined();
  });
});

describe("a train's line and ring on the map (trainPlaces)", () => {
  const spotKey = 'wc0ffee00c0ffee00c0ffee00c0ffee00.16';
  const spot = { key: spotKey, name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 };
  const at = (stop: number | null, route = ['1', spotKey, '2']) => ({
    route,
    stop,
    spots: [spot],
  });

  it('draws the line through a Power Spot of the route and rings it where the train stands', () => {
    const library = GYMS.get(1);
    const fountain = GYMS.get(2);
    expect(trainPlaces(at(1), GYMS)).toEqual({
      line: [library, spot, fountain],
      ring: { at: spot, here: true },
    });
    // At a gym: the ring is the gym's; the line still runs through the spot.
    expect(trainPlaces(at(2), GYMS).ring).toEqual({ at: fountain, here: true });
  });

  it('rings the first stop it can place, pale, before it starts or when its stop is off the map, and nothing without one', () => {
    expect(trainPlaces(at(null, [spotKey, '1']), GYMS).ring).toEqual({ at: spot, here: false });
    expect(trainPlaces(at(0, ['99', spotKey]), GYMS)).toEqual({
      line: [spot],
      ring: { at: spot, here: false },
    });
    expect(trainPlaces({ route: ['99'], stop: 0, spots: [] }, GYMS)).toEqual({
      line: [],
      ring: undefined,
    });
  });
});

describe('trainPopup and meetupItem', () => {
  it('show where the train is on its route, and when a meetup is', () => {
    const train: MapTrain = {
      kind: 'train',
      postKey: null,
      trainKind: 'raid',
      trainKindWords: 'Raid Train',
      endTime: null,
      id: 't1',
      name: 'Saturday <b>legendaries</b>',
      startTime: NOW + 60 * MINUTE,
      route: ['1', '2', '3'],
      spots: [],
      stop: 1,
      atEnd: 'finish',
      stopsAhead: [2],
      ahead: null,
      link: LINK,
      attendance: attendance({ actions: [] }),
      may: { arrange: false, clear: false, load: false },
      moves: null,
      conductor: { who: null, mayTake: false, mayDrop: false },
      moveRefusal: { reason: 'not-attending', text: 'You are not signed up for this train.' },
      mayManage: false,
    };
    // What the member may do of the train on the map comes before the post.
    const extra = { tag: 'button', text: 'Edit route' };
    expect(texts(trainPopup(train, context, [extra])).slice(-2)).toEqual([
      'Edit route',
      'Open the post',
    ]);
    expect(texts(trainPopup(train, context))).toEqual([
      'Saturday <b>legendaries</b>',
      'Starts at 3:00 PM',
      'in 1 h',
      'At stop 2 of 3: Town Fountain',
      'Directions',
      'Interested 1 · Coming 3 · Here 2',
      'Open the post',
    ]);
    // At a power spot of its route (plan 8X-4): its name, and Directions to it.
    const spotKey = 'wc0ffee00c0ffee00c0ffee00c0ffee00.16';
    const atSpot = trainPopup(
      {
        ...train,
        route: ['1', spotKey, '3'],
        spots: [{ key: spotKey, name: 'Gazebo of the Lake', lat: 40.05, lon: -80.05 }],
      },
      context,
    );
    expect(texts(atSpot).slice(3, 5)).toEqual([
      'At stop 2 of 3: Gazebo of the Lake (Power Spot)',
      'Directions',
    ]);
    // The stop the train is at: its address line and Directions to it.
    const atLibrary = trainPopup({ ...train, stop: 0 }, context);
    expect(texts(atLibrary).slice(3, 6)).toEqual([
      'At stop 1 of 3: Pinewood Public Library',
      '12 Main St, Pinewood',
      'Directions',
    ]);
    expect(tagged(atLibrary, 'a')[0]?.attributes?.href).toBe(directions(1));
    // No stop, or a stop at a gym the map does not have: no way to it.
    for (const elsewhere of [
      { ...train, stop: null },
      { ...train, route: [], stop: null },
      { ...train, stop: 2 },
    ]) {
      expect(texts(trainPopup(elsewhere, context))).not.toContain('Directions');
    }
    expect(texts(trainPopup({ ...train, stop: null }, context))[3]).toBe('Route finished');
    expect(texts(trainPopup({ ...train, route: [], stop: null }, context))[3]).toBe('No route yet');
    const meetup: MapMeetup = {
      kind: 'meetup',
      postKey: null,
      id: 'm1',
      name: 'Community Day picnic',
      startTime: NOW + 24 * 60 * MINUTE,
      endTime: null,
      link: LINK,
      attendance: attendance({ mine: { status: 'interested', group: 'A' } }),
      place: null,
      info: null,
      panel: null,
    };
    expect(texts(meetupItem(meetup, context))).toEqual([
      'Community Day picnic',
      'Starts Wed, Oct 14, 2:00 PM',
      'Interested 1 · Coming 3 · Here 2',
      'You: Interested',
      'Interested',
      'Join',
      'Here',
      'Open the post',
    ]);
    // At a place, with its information as text, and what the member may do of it after the
    // buttons; Directions to its point.
    const placed: MapMeetup = {
      ...meetup,
      place: {
        kind: 'gym',
        words: 'At The Stacks',
        lat: 40.05,
        lon: -80.05,
        gymId: 1,
        at: { key: 'gym:1', name: 'The Stacks' },
      },
      info: 'Bring <b>snacks</b>.\nAnd cups.',
    };
    const extras = [{ tag: 'button', text: 'Manage…' }];
    expect(texts(meetupPopup(placed, context, extras))).toEqual([
      'Community Day picnic',
      'At The Stacks',
      'Directions',
      'Starts Wed, Oct 14, 2:00 PM',
      'Bring <b>snacks</b>.\nAnd cups.',
      'Interested 1 · Coming 3 · Here 2',
      'You: Interested',
      'Interested',
      'Join',
      'Here',
      'Manage…',
      'Open the post',
    ]);
    const pin: MapMeetup = {
      ...placed,
      place: {
        kind: 'pin',
        words: 'At a dropped pin',
        lat: 40.08,
        lon: -80.08,
        gymId: null,
        at: null,
      },
    };
    expect(texts(meetupPopup(pin, context))[1]).toBe('At a dropped pin');
    expect(meetupItem(placed, context).tag).toBe('li');
  });
});

/** The page's side of a press: the answers the POSTs get, and what `/api/me` says. */
function pressSteps(answers: Array<{ status: number; body: unknown } | Error>, me?: Me) {
  const posted: string[] = [];
  const steps: PressSteps = {
    post(csrf) {
      posted.push(csrf);
      const next = answers.shift();
      if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    me: () => Promise.resolve(me ?? { loggedIn: false }),
  };
  return { steps, posted };
}

describe('pressParty', () => {
  it("gives the server's answer", async () => {
    const { steps, posted } = pressSteps([
      { status: 200, body: { ok: true, text: 'You are coming.' } },
    ]);
    expect(await pressParty('token', steps)).toEqual({
      text: 'You are coming.',
      ok: true,
      csrf: 'token',
    });
    expect(posted).toEqual(['token']);
  });

  it('says a refusal in its words, and a failure in a few', async () => {
    const refused = pressSteps([
      { status: 422, body: { ok: false, text: 'This raid has not hatched yet.' } },
    ]);
    expect(await pressParty('token', refused.steps)).toMatchObject({
      text: 'This raid has not hatched yet.',
      ok: false,
    });
    const limited = pressSteps([
      { status: 429, body: { error: 'That was a lot of clicks. Try again in 1 minute.' } },
    ]);
    expect((await pressParty('token', limited.steps)).text).toBe(
      'That was a lot of clicks. Try again in 1 minute.',
    );
    const broken = pressSteps([new Error('offline')]);
    expect(await pressParty('token', broken.steps)).toEqual({
      text: PRESS_FAILED,
      ok: false,
      csrf: 'token',
    });
  });

  it('asks for the token again once when the page has a stale one (after a restart)', async () => {
    const me: Me = { loggedIn: true, name: 'Ash', csrf: 'new', member: true, readOnly: false };
    const { steps, posted } = pressSteps(
      [
        { status: 403, body: { error: 'Not allowed.' } },
        { status: 200, body: { ok: true, text: 'You are here.' } },
      ],
      me,
    );
    expect(await pressParty('old', steps)).toEqual({
      text: 'You are here.',
      ok: true,
      csrf: 'new',
    });
    expect(posted).toEqual(['old', 'new']);
    // A refusal with a token that is current is not tried again.
    const same = pressSteps([{ status: 403, body: { error: 'Not allowed.' } }], {
      ...me,
      csrf: 'old',
    });
    expect((await pressParty('old', same.steps)).text).toBe('Not allowed.');
    expect(same.posted).toEqual(['old']);
  });
});

/** A poller over timers a test runs by hand, a page whose visibility it sets. */
function pollerWith(answer: () => 'go' | 'stop' = () => 'go') {
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  let visible = true;
  let loads = 0;
  const clock = { now: 0 };
  const poller = new Poller({
    everyMs: 20_000,
    now: () => clock.now,
    load: () => {
      loads += 1;
      return Promise.resolve(answer());
    },
    active: () => visible,
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const pending = () => timers.filter((timer) => !timer.cancelled);
  return {
    poller,
    pending,
    clock,
    loads: () => loads,
    setVisible(to: boolean) {
      visible = to;
    },
    async fire() {
      const [next] = pending();
      if (!next) throw new Error('no timer is waiting');
      next.cancelled = true;
      next.run();
      await poller.idle();
    },
  };
}

describe('Poller and live signals', () => {
  /** A poller whose random is the test's, the first load done. */
  async function started(random = 0.5, answer: () => 'go' | 'stop' = () => 'go') {
    const told = { stopped: 0 };
    const timers: Array<{ at: number; run: () => void }> = [];
    const clock = { now: 0 };
    let visible = true;
    let loads = 0;
    const spreads: Array<number | undefined> = [];
    let release: (() => void) | undefined;
    let holding = false;
    const poller = new Poller({
      everyMs: 20_000,
      now: () => clock.now,
      random: () => random,
      load: async (spread) => {
        loads += 1;
        spreads.push(spread);
        if (holding) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return answer();
      },
      active: () => visible,
      stopped: () => {
        told.stopped += 1;
      },
      setTimer: (run, ms) => {
        const timer = { at: clock.now + ms, run };
        timers.push(timer);
        return () => {
          const place = timers.indexOf(timer);
          if (place >= 0) timers.splice(place, 1);
        };
      },
    });
    await poller.start();
    return {
      poller,
      clock,
      told,
      spreads,
      loads: () => loads,
      setVisible(to: boolean) {
        visible = to;
      },
      /** The soonest timer run, for a question held: nothing waits for it. */
      fireNext() {
        const next = timers.sort((a, b) => a.at - b.at)[0];
        if (!next) throw new Error('no timer is waiting');
        timers.splice(timers.indexOf(next), 1);
        clock.now = next.at;
        next.run();
      },
      /** The times of the timers waiting, from now. */
      waiting: () => timers.map((timer) => timer.at - clock.now).sort((a, b) => a - b),
      async pass(ms: number) {
        const until = clock.now + ms;
        for (;;) {
          const due = timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
          if (!due) break;
          timers.splice(timers.indexOf(due), 1);
          clock.now = due.at;
          due.run();
          await poller.idle();
        }
        clock.now = until;
      },
      hold() {
        holding = true;
      },
      release() {
        holding = false;
        release?.();
      },
    };
  }

  describe('setEveryScattered, for going not live', () => {
    it('never asks at once, however old the last question: it waits its random time', async () => {
      const made = await started(0.25);
      made.poller.setEvery(120_000);
      made.clock.now = 60_000;
      made.poller.setEveryScattered(20_000, 20_000);
      expect(made.loads()).toBe(1);
      expect(made.waiting()).toEqual([5_000]);
      await made.pass(4_999);
      expect(made.loads()).toBe(1);
      await made.pass(1);
      expect(made.loads()).toBe(2);
      // From then on the new interval.
      expect(made.waiting()).toEqual([20_000]);
    });

    it('only stores it while the page is hidden', async () => {
      const made = await started(0.25);
      made.poller.setEvery(120_000);
      made.setVisible(false);
      made.poller.activeChanged();
      made.poller.setEveryScattered(20_000, 20_000);
      expect(made.waiting()).toEqual([]);
      made.clock.now = 5_000;
      made.setVisible(true);
      made.poller.activeChanged();
      expect(made.waiting()).toEqual([15_000]);
    });

    it('only stores it while a question runs, which then waits the new one', async () => {
      const made = await started(0.25);
      made.poller.setEvery(120_000);
      made.hold();
      const asking = made.poller.now();
      made.poller.setEveryScattered(20_000, 20_000);
      made.release();
      await asking;
      expect(made.waiting()).toEqual([20_000]);
    });

    it('changes nothing when that is the interval already', async () => {
      const made = await started(0.25);
      made.clock.now = 3_000;
      made.poller.setEveryScattered(20_000, 20_000);
      expect(made.waiting()).toEqual([17_000]);
    });
  });

  describe('what a question is told of its cause', () => {
    it('gives a signal’s question its spread, and any other none', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.poller.signalled(4_000);
      await made.pass(2_000);
      made.clock.now = 50_000;
      made.poller.askOnce(20_000, 8_000);
      await made.pass(4_000);
      await made.poller.now();
      await made.pass(120_000);
      // The first question, the signal's, going live's, the press's, the poll's.
      expect(made.spreads).toEqual([undefined, 4_000, 8_000, undefined, undefined]);
    });

    it('gives a press that came while a signal waited none', async () => {
      const made = await started(0.5);
      made.poller.signalled(4_000);
      await made.poller.now();
      expect(made.spreads).toEqual([undefined, undefined]);
    });
  });

  describe('setEvery', () => {
    it('rearms from the last question, and asks at once when that is past', async () => {
      const made = await started();
      made.poller.setEvery(120_000);
      expect(made.waiting()).toEqual([120_000]);
      made.clock.now = 30_000;
      expect(made.loads()).toBe(1);
      made.poller.setEvery(20_000);
      await made.poller.idle();
      expect(made.loads()).toBe(2);
      expect(made.waiting()).toEqual([20_000]);
    });

    it('asks at the rest of the new interval when that is not past', async () => {
      const made = await started();
      made.poller.setEvery(120_000);
      made.clock.now = 5_000;
      made.poller.setEvery(20_000);
      expect(made.waiting()).toEqual([15_000]);
      expect(made.loads()).toBe(1);
    });

    it('only stores it while the page is hidden', async () => {
      const made = await started();
      made.setVisible(false);
      made.poller.activeChanged();
      made.poller.setEvery(120_000);
      expect(made.waiting()).toEqual([]);
      made.clock.now = 30_000;
      made.setVisible(true);
      made.poller.activeChanged();
      expect(made.waiting()).toEqual([90_000]);
      expect(made.loads()).toBe(1);
    });

    it('only stores it while a question runs, which then waits the new one', async () => {
      const made = await started();
      made.hold();
      const asking = made.poller.now();
      made.poller.setEvery(120_000);
      expect(made.waiting()).toEqual([]);
      made.release();
      await asking;
      expect(made.waiting()).toEqual([120_000]);
    });
  });

  describe('signalled', () => {
    it('asks after a random time up to the spread it was given', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.poller.signalled(4_000);
      expect(made.waiting()).toEqual([2_000, 120_000]);
      await made.pass(1_999);
      expect(made.loads()).toBe(1);
      await made.pass(1);
      expect(made.loads()).toBe(2);
      // It counts as a question: the poll waits from it.
      expect(made.waiting()).toEqual([120_000]);
    });

    it('keeps the wait of a signal that came first: no restart and no further ask', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.poller.signalled(4_000);
      await made.pass(1_000);
      made.poller.signalled(20_000);
      await made.pass(1_000);
      expect(made.loads()).toBe(2);
      await made.pass(20_000);
      expect(made.loads()).toBe(2);
    });

    it('leaves a press immediate, and the press’s question takes its place', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.poller.signalled(4_000);
      await made.poller.now();
      expect(made.loads()).toBe(2);
      await made.pass(4_000);
      expect(made.loads()).toBe(2);
    });

    it('does not ask when the page is hidden by then', async () => {
      const made = await started(0.5);
      made.poller.signalled(4_000);
      made.setVisible(false);
      await made.pass(2_000);
      expect(made.loads()).toBe(1);
    });

    it('asks after a question that was running when its wait ended', async () => {
      const made = await started(0.5);
      made.poller.signalled(4_000);
      made.hold();
      const asking = made.poller.now();
      made.poller.signalled(4_000);
      made.fireNext();
      expect(made.loads()).toBe(2);
      made.release();
      await asking;
      await made.poller.idle();
      expect(made.loads()).toBe(3);
    });

    it('asks nothing once stopped', async () => {
      let answer: 'go' | 'stop' = 'stop';
      const made = await started(0.5, () => answer);
      answer = 'go';
      made.poller.signalled(4_000);
      await made.pass(4_000);
      expect(made.loads()).toBe(1);
    });
  });

  describe('askOnce, for going live', () => {
    it('asks inside the spread where the floor has passed', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.clock.now = 30_000;
      made.poller.askOnce(20_000, 4_000);
      expect(made.waiting()[0]).toBe(2_000);
      expect(made.loads()).toBe(1);
      await made.pass(2_000);
      expect(made.loads()).toBe(2);
    });

    it('waits for the floor where that is later than its random wait', async () => {
      const made = await started(0.5);
      made.clock.now = 5_000;
      made.poller.setEvery(120_000);
      made.poller.askOnce(20_000, 4_000);
      // The floor's rest, and a random part of the spread on top, so that pages that asked in one
      // instant do not come back in one instant.
      expect(made.waiting()).toEqual([17_000, 115_000]);
      await made.pass(16_999);
      expect(made.loads()).toBe(1);
      await made.pass(1);
      expect(made.loads()).toBe(2);
    });

    it('gives way to a signal: a change does not wait out the floor', async () => {
      const made = await started(0.5);
      made.poller.setEvery(120_000);
      made.poller.askOnce(20_000, 1_000);
      made.poller.signalled(4_000);
      await made.pass(2_000);
      expect(made.loads()).toBe(2);
      // And only that one ask: the floor's went with it.
      await made.pass(30_000);
      expect(made.loads()).toBe(2);
    });

    it('keeps a signal’s wait, which asks for both', async () => {
      const made = await started(0.5);
      made.clock.now = 30_000;
      made.poller.signalled(1_000);
      made.poller.askOnce(20_000, 20_000);
      await made.pass(500);
      expect(made.loads()).toBe(2);
      await made.pass(20_000);
      // Its 20 seconds' poll only: no second ask of the two.
      expect(made.loads()).toBe(3);
    });
  });

  it('says that it stopped, once, when a question found it had no point', async () => {
    let answer: 'go' | 'stop' = 'go';
    const made = await started(0.5, () => answer);
    answer = 'stop';
    await made.poller.now();
    expect(made.told.stopped).toBe(1);
    await made.poller.now();
    expect(made.told.stopped).toBe(1);
  });
});

describe('GroupPicks', () => {
  /** A menu of the groups as a draw makes it, its first choice chosen. */
  const menu = (party: string, ...groups: string[]) => ({
    dataset: { groupPick: party } as DOMStringMap,
    value: groups[0] ?? '',
    options: groups.map((value) => ({ value })),
  });
  const inPage = (...menus: Array<ReturnType<typeof menu>>) => ({
    querySelectorAll: () => menus,
  });

  it('puts the member’s choice back in the party’s menu drawn anew', () => {
    const picks = new GroupPicks();
    picks.chose('r1', 'B');
    const drawn = menu('r1', '', 'B', 'C');
    picks.carry(inPage(drawn));
    expect(drawn.value).toBe('B');
  });

  it('leaves another party’s menu alone', () => {
    const picks = new GroupPicks();
    picks.chose('r1', 'B');
    const other = menu('r2', '', 'B');
    picks.carry(inPage(other));
    expect(other.value).toBe('');
  });

  it('forgets a choice no longer offered', () => {
    const picks = new GroupPicks();
    picks.chose('r1', 'B');
    const without = menu('r1', '', 'C');
    picks.carry(inPage(without));
    expect(without.value).toBe('');
    const again = menu('r1', '', 'B');
    picks.carry(inPage(again));
    expect(again.value).toBe('');
  });

  it('leaves the first choice where nothing was chosen', () => {
    const drawn = menu('r1', '', 'B');
    new GroupPicks().carry(inPage(drawn));
    expect(drawn.value).toBe('');
  });

  it('forgets the parties no longer listed', () => {
    const picks = new GroupPicks();
    picks.chose('r1', 'B');
    picks.chose('r2', 'B');
    picks.keepOnly([{ id: 'r2' }]);
    const gone = menu('r1', '', 'B');
    const kept = menu('r2', '', 'B');
    picks.carry(inPage(gone, kept));
    expect(gone.value).toBe('');
    expect(kept.value).toBe('B');
  });
});

describe('nextPartyMoment', () => {
  const view = {
    raids: [
      { hatchTime: 5_000, endTime: 9_000 },
      { hatchTime: null, endTime: 7_000 },
    ],
    maxes: [{ endTime: 12_000 }],
    trains: [{ endTime: null }, { endTime: 11_000 }],
    meetups: [{ endTime: 6_000 }],
  };

  it('is the next hatch or end of any party after now', () => {
    expect(nextPartyMoment(view, 0)).toBe(5_000);
    expect(nextPartyMoment(view, 5_000)).toBe(6_000);
    expect(nextPartyMoment(view, 6_500)).toBe(7_000);
    expect(nextPartyMoment(view, 11_500)).toBe(12_000);
  });

  it('is nothing once all have passed, or without a list', () => {
    expect(nextPartyMoment(view, 12_000)).toBeUndefined();
    expect(nextPartyMoment(undefined, 0)).toBeUndefined();
  });
});

describe('Poller', () => {
  it('asks at once, then every 20 seconds while the page is visible', async () => {
    const made = pollerWith();
    await made.poller.start();
    expect(made.loads()).toBe(1);
    expect(made.pending().map((timer) => timer.ms)).toEqual([20_000]);
    await made.fire();
    expect(made.loads()).toBe(2);
    expect(made.pending()).toHaveLength(1);
  });

  it('rests while the page is hidden, and asks at once when it is shown again', async () => {
    const made = pollerWith();
    await made.poller.start();
    made.setVisible(false);
    made.poller.activeChanged();
    expect(made.pending()).toEqual([]);
    made.clock.now = 20_000;
    made.setVisible(true);
    made.poller.activeChanged();
    await made.poller.idle();
    expect(made.loads()).toBe(2);
    expect(made.pending()).toHaveLength(1);
  });

  // The log of 2026-10-30: a page hidden and shown every 2 seconds asked 30 times a minute.
  it('asks no sooner than its 20 seconds, however often the page is hidden and shown', async () => {
    const made = pollerWith();
    await made.poller.start();
    for (const at of [2_000, 4_000, 18_000]) {
      made.clock.now = at;
      made.setVisible(false);
      made.poller.activeChanged();
      made.setVisible(true);
      made.poller.activeChanged();
      await made.poller.idle();
      expect(made.loads()).toBe(1);
      expect(made.pending().map((timer) => timer.ms)).toEqual([20_000 - at]);
    }
    made.clock.now = 20_000;
    await made.fire();
    expect(made.loads()).toBe(2);
    expect(made.pending().map((timer) => timer.ms)).toEqual([20_000]);
  });

  it('asks at once after a press, and waits its 20 seconds from then', async () => {
    const made = pollerWith();
    await made.poller.start();
    await made.poller.now();
    expect(made.loads()).toBe(2);
    expect(made.pending()).toHaveLength(1);
  });

  it('stops for good when the answer says so (logged out, no member any more)', async () => {
    const made = pollerWith(() => 'stop');
    await made.poller.start();
    expect(made.pending()).toEqual([]);
    made.poller.activeChanged();
    await made.poller.idle();
    expect(made.loads()).toBe(1);
  });
});

describe('MapActivity (plan 8M-10, C9)', () => {
  it('is active while the page is visible and the region editor is off', () => {
    let visible = true;
    const activity = new MapActivity(() => visible);
    const told: boolean[] = [];
    activity.onChange(() => told.push(activity.active()));
    expect(activity.active()).toBe(true);
    activity.setEditing(true);
    expect(told).toEqual([false]);
    // Shown again while the editor is on: still nothing to ask for.
    activity.changed();
    expect(told).toEqual([false, false]);
    activity.setEditing(true);
    expect(told).toHaveLength(2);
    visible = false;
    activity.setEditing(false);
    expect(told).toEqual([false, false, false]);
    visible = true;
    activity.changed();
    expect(told).toEqual([false, false, false, true]);
  });

  // Re-review V1: the hidden live map's moves (a resize) do their work once the editor is off.
  it('runs work while the editor is off, and what was missed once when it turns off', () => {
    const activity = new MapActivity(() => true);
    let runs = 0;
    const work = activity.whenLive(() => {
      runs += 1;
    });
    work();
    expect(runs).toBe(1);
    activity.setEditing(true);
    work();
    work();
    expect(runs).toBe(1);
    activity.changed();
    expect(runs).toBe(1);
    activity.setEditing(false);
    expect(runs).toBe(2);
    // Nothing missed the next time round: nothing to catch up.
    activity.setEditing(true);
    activity.setEditing(false);
    expect(runs).toBe(2);
  });

  it('pauses a poller while the editor is on, and asks at once when it is off', async () => {
    let editing = false;
    const made = pollerWith();
    await made.poller.start();
    const activity = new MapActivity(() => !editing);
    activity.onChange(() => {
      made.setVisible(activity.active());
      made.poller.activeChanged();
    });
    editing = true;
    activity.changed();
    expect(made.pending()).toEqual([]);
    made.clock.now = 20_000;
    editing = false;
    activity.changed();
    await made.poller.idle();
    expect(made.loads()).toBe(2);
  });
});
