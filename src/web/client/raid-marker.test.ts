import { describe, expect, it } from 'vitest';
import type { MapAttendance, MapMax, MapRaid } from '../../domain/web/party-data.js';
import {
  badgeFor,
  badgeWords,
  isDimmed,
  markerFacts,
  maxRing,
  raidBadge,
  raidMarkerNode,
  markerNow,
  leadRaid,
  markerSize,
  ringSizes,
  tapBox,
  tierColour,
} from './raid-marker.js';
import { ENDING_SOON_MINUTES } from '../../domain/time/ending-soon.js';
import type { PageNode } from './popup.js';

const ZONE = 'America/New_York';
/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;

const attendance = (groups: MapAttendance['groups'], going = 0): MapAttendance => ({
  groups,
  going,
  mine: null,
  actions: [],
  remote: { offered: false, on: false },
  count: false,
});

const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id: 'r1',
  gymId: 1,
  picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm150.icon.png',
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid',
  boss: 'Mewtwo',
  stage: 'hatched',
  hatchTime: NOW - 20 * MINUTE,
  endTime: NOW + 12 * MINUTE,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: false,
  attendance: attendance([{ id: 'A', interested: 2, coming: 3, present: 1 }], 4),
  ...more,
});

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

describe("a raid's marker (plan 8M-7)", () => {
  it('says the time left while it runs, and when it hatches before', () => {
    expect(raidBadge(raid(), NOW, ZONE)).toBe('12 min');
    expect(raidBadge(raid({ endTime: NOW + 65 * MINUTE }), NOW, ZONE)).toBe('1 h 05');
    expect(raidBadge(raid({ endTime: NOW + 30_000 }), NOW, ZONE)).toBe('1 min');
    expect(raidBadge(raid({ endTime: NOW - MINUTE }), NOW, ZONE)).toBe('Ended');
    const egg = raid({ stage: 'egg', hatchTime: NOW + 40 * MINUTE, endTime: NOW + 85 * MINUTE });
    expect(raidBadge(egg, NOW, ZONE)).toBe('hatches 2:40');
    // Hatched by the clock since the list was made: the time left.
    expect(raidBadge(egg, NOW + 41 * MINUTE, ZONE)).toBe('44 min');
    expect(raidBadge(raid({ stage: 'egg', hatchTime: null }), NOW, ZONE)).toBe('Egg');
    expect(raidBadge(raid({ endTime: null }), NOW, ZONE)).toBe('Hatched');
    expect(badgeWords('end', NOW + 3 * MINUTE, NOW, ZONE)).toBe('3 min');
    expect(badgeWords('hatch', NOW + 3 * MINUTE, NOW, ZONE)).toBe('hatches 2:03');
    // Not today: the day said, as the posts' times (`clockTime`), AM or PM kept.
    expect(badgeWords('hatch', NOW + 24 * 60 * MINUTE, NOW, ZONE)).toBe(
      'hatches Wed, Oct 14, 2:00 PM',
    );
  });

  it("shows the going the server counted, and rings by the tier's group", () => {
    // Never a sum of the page's own (one source for every fact, Matt 2026-10-25).
    const node = raidMarkerNode(
      raid({ attendance: attendance([{ id: 'A', interested: 5, coming: 2, present: 0 }], 9) }),
      NOW,
      ZONE,
    );
    expect(texts(node)).toContain('9');
    expect(tierColour('shadow')).toBe('--tier-shadow');
    expect(tierColour('5')).toBe('--tier-5');
  });

  it('draws a gym of several raids by one lead raid: the first with a picture, else the first', () => {
    const plain = raid({ id: 'r1', picture: null });
    const pictured = raid({ id: 'r2', tierGroup: 'elite' });
    expect(leadRaid([plain, pictured])?.id).toBe('r2');
    expect(leadRaid([plain, raid({ id: 'r3', picture: null })])?.id).toBe('r1');
    expect(leadRaid([])).toBeUndefined();
  });

  it('rings a train and a meetup outside the circle of a raid at their gym, at every size', () => {
    const alone = ringSizes(undefined);
    for (const circle of [44, 30, 20]) {
      const round = ringSizes(circle);
      // The raid's circle and its ring: the train's ring just outside, the meetup's outside that.
      expect(round.train.radius - round.train.weight / 2).toBeGreaterThanOrEqual(circle / 2 + 2);
      expect(round.meetup.radius - round.meetup.weight / 2).toBeGreaterThan(
        round.train.radius + round.train.weight / 2,
      );
    }
    expect(ringSizes(20).train.radius).toBeLessThan(ringSizes(44).train.radius);
    expect(alone.train.radius).toBeLessThan(ringSizes(20).train.radius);
  });

  it('shrinks as the map zooms out, never grouped (Matt, 2026-10-25)', () => {
    expect([18, 15, 14, 13, 10].map(markerSize)).toEqual([
      'full',
      'full',
      'middle',
      'small',
      'small',
    ]);
    // At 14 the count but no time badge; at 13 and below the ring alone; dimmed at every size.
    const middle = raidMarkerNode(raid(), NOW, ZONE, 'middle');
    expect(middle.className).toBe('raid-marker tier-5 size-middle');
    expect(texts(middle)).toEqual(['4']);
    const small = raidMarkerNode(raid({ endTime: NOW + 2 * MINUTE }), NOW, ZONE, 'small');
    expect(small.className).toBe('raid-marker tier-5 size-small dim');
    expect(texts(small)).toEqual([]);
    // The tap target is never under 32 pixels: a clear margin round a small circle.
    expect(tapBox(20)).toBe(32);
    expect(tapBox(44)).toBe(44);
  });

  it('is dimmed in its last five minutes', () => {
    // "Nearly over" is the domain's one rule (`endsSoon`), the one /max asks by.
    expect(isDimmed(raid({ endTime: NOW + ENDING_SOON_MINUTES * MINUTE - 1 }), NOW)).toBe(true);
    expect(isDimmed(raid({ endTime: NOW + ENDING_SOON_MINUTES * MINUTE }), NOW)).toBe(false);
    expect(isDimmed(raid({ endTime: null }), NOW)).toBe(false);
    // An egg is never in its last minutes.
    expect(
      isDimmed(raid({ stage: 'egg', hatchTime: NOW + 60_000, endTime: NOW + 3 * MINUTE }), NOW),
    ).toBe(false);
  });

  it('draws the picture in its ring, the badge under it and the green count', () => {
    const node = raidMarkerNode(raid(), NOW, ZONE);
    expect(node.className).toBe('raid-marker tier-5');
    expect(texts(node)).toEqual(['12 min', '4']);
    expect(node.attributes).toEqual({
      'data-stage': 'hatched',
      'data-hatch': String(NOW - 20 * MINUTE),
      'data-end': String(NOW + 12 * MINUTE),
    });
    // The page keeps it current from them, by the rules it was drawn by: an egg turning into its
    // time left as it hatches, a raid dimmed once it ends soon.
    expect(
      markerNow(
        { stage: 'egg', hatch: String(NOW + MINUTE), end: String(NOW + 46 * MINUTE) },
        NOW,
        ZONE,
      ),
    ).toEqual({ badge: 'hatches 2:01', dimmed: false });
    expect(
      markerNow(
        { stage: 'egg', hatch: String(NOW + MINUTE), end: String(NOW + 46 * MINUTE) },
        NOW + 2 * MINUTE,
        ZONE,
      ),
    ).toEqual({ badge: '44 min', dimmed: false });
    expect(markerNow({ stage: 'hatched', end: String(NOW + 4 * MINUTE) }, NOW, ZONE)).toEqual({
      badge: '4 min',
      dimmed: true,
    });
    expect(badgeFor('egg', null, null, NOW, ZONE)).toBe('Egg');
    // Nobody going: no count; its last minutes: dimmed; no picture: an empty ring.
    const last = raidMarkerNode(
      raid({
        picture: null,
        endTime: NOW + 2 * MINUTE,
        attendance: attendance([{ id: 'A', interested: 1, coming: 0, present: 0 }]),
      }),
      NOW,
      ZONE,
    );
    expect(last.className).toBe('raid-marker tier-5 dim');
    expect(texts(last)).toEqual(['2 min']);
    expect(JSON.stringify(last)).not.toContain('"img"');
  });
});

const max = (more: Partial<MapMax> = {}): MapMax => ({
  kind: 'max',
  id: 'x1',
  spotId: 'spot-1',
  picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm68.icon.png',
  level: 'D2',
  tier: 'Dynamax 2★',
  boss: 'Machamp',
  title: 'Dynamax Machamp (2★)',
  endTime: NOW + 40 * MINUTE,
  link: 'https://discord.com/channels/1/9',
  place: { name: 'Lake Gazebo', lat: 40.44, lon: -79.95, address: null },
  attendance: attendance([{ id: 'A', interested: 0, coming: 2, present: 1 }], 3),
  postKey: null,
  ...more,
});

// Plan 8M-9A (A1, A2): a max battle is drawn as a raid is, from the same marker.
describe("a max battle's marker (plan 8M-9A)", () => {
  it('rings the boss in the color of Dynamax or Gigantamax, with its time left and count', () => {
    const node = raidMarkerNode(max(), NOW, ZONE);
    expect(node.className).toBe('raid-marker tier-dynamax');
    expect(texts(node)).toEqual(['40 min', '3']);
    // No egg and no hatch: what the page keeps current is its end alone.
    expect(node.attributes).toEqual({
      'data-stage': 'hatched',
      'data-end': String(NOW + 40 * MINUTE),
    });
    expect(raidMarkerNode(max({ level: 'G' }), NOW, ZONE).className).toBe(
      'raid-marker tier-gigantamax',
    );
    expect(maxRing('D5')).toBe('dynamax');
    expect(maxRing('G')).toBe('gigantamax');
  });

  it('is dimmed in its last five minutes, by the rule raids are', () => {
    const soon = max({ endTime: NOW + 4 * MINUTE });
    expect(raidMarkerNode(soon, NOW, ZONE).className).toBe('raid-marker tier-dynamax dim');
    expect(raidBadge(soon, NOW, ZONE)).toBe('4 min');
    expect(markerFacts(soon)).toEqual({
      picture: soon.picture,
      ring: 'dynamax',
      stage: 'hatched',
      hatchTime: null,
      endTime: NOW + 4 * MINUTE,
      going: 3,
    });
  });
});
