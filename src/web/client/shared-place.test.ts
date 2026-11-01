import { describe, expect, it } from 'vitest';
import {
  hiddenGyms,
  placeListNode,
  sharedPlace,
  SHARED_PIXELS,
  startWords,
  trainPlace,
  type PlacedThing,
} from './shared-place.js';
import type { PageNode } from './popup.js';

/** A place on a screen of the test's: a degree is 10,000 pixels. */
const toPixel = (place: { lat: number; lon: number }) => ({
  x: place.lon * 10_000,
  y: -place.lat * 10_000,
});

const thing = (key: string, more: Partial<PlacedThing> = {}): PlacedThing => ({
  key,
  gymId: null,
  lat: 40.44,
  lon: -79.95,
  picture: null,
  name: key,
  time: 'in 5 min',
  ...more,
});

describe('several things at one place (plan 8M-7)', () => {
  it('are the shown things at the same gym, or within a few pixels at this zoom', () => {
    const raid = thing('gym:7', { gymId: 7 });
    const train = thing('train:t1', { gymId: 7, lat: 40.4401 });
    const meetup = thing('meetup:m1', { lon: -79.95 + 5 / 10_000 });
    const far = thing('meetup:m2', { lon: -79.95 + (SHARED_PIXELS * 3) / 10_000 });
    const all = [raid, train, meetup, far];
    expect(sharedPlace(raid, all, toPixel).map((one) => one.key)).toEqual([
      'gym:7',
      'train:t1',
      'meetup:m1',
    ]);
    expect(sharedPlace(far, all, toPixel).map((one) => one.key)).toEqual(['meetup:m2']);
    // A layer turned off takes its things out: the overlap is gone.
    expect(sharedPlace(raid, [raid, far], toPixel)).toEqual([raid]);
  });

  it("list each in one popup, a choice opening that thing's own popup", () => {
    const node: PageNode = placeListNode([
      thing('gym:7', {
        name: 'Schenley Fountain · Level 5 raid',
        picture: 'https://x.test/a.png',
        time: '12m',
      }),
      thing('train:t1', { name: 'Oakland loop', time: 'started' }),
    ]);
    const buttons = (node.children ?? []).flatMap((child) => child.children ?? []);
    expect(buttons.map((button) => button.attributes?.['data-open'])).toEqual([
      'gym:7',
      'train:t1',
    ]);
    const words = (one: PageNode): string[] => [
      ...(one.text === undefined ? [] : [one.text]),
      ...(one.children ?? []).flatMap(words),
    ];
    expect(words(node)).toEqual([
      'Nearby',
      'Schenley Fountain · Level 5 raid',
      '12m',
      'Oakland loop',
      'started',
    ]);
    expect(JSON.stringify(node)).toContain('https://x.test/a.png');
  });

  /** The list's lines in order: its heading, then each choice's name or the label between. */
  const lines = (things: PlacedThing[]): string[] => {
    const [heading, choices] = placeListNode(things).children ?? [];
    return [
      heading?.text ?? '',
      ...(choices?.children ?? []).map((child) =>
        child.tag === 'button' ? (child.children?.[1]?.text ?? '') : `[${child.text ?? ''}]`,
      ),
    ];
  };
  const fountain = { place: { key: 'gym:7', name: 'Schenley Fountain' } };

  // Plan 8M-15 (design 1): headed with the tapped place's name, the things at it first, then
  // "Also nearby" over the rest in the order given.
  it("is headed with the tapped place's name, its things first, then Also nearby", () => {
    expect(
      lines([
        thing('gym-dot:7', { ...fountain, name: 'Schenley Fountain' }),
        thing('meetup:m1', { name: 'Picnic' }),
        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
        thing('max:x1', { name: 'Machamp', place: { key: 'spot:w1', name: 'Mural' } }),
        thing('train:t1', { ...fountain, name: 'Oakland loop' }),
      ]),
    ).toEqual([
      'Schenley Fountain',
      'Schenley Fountain',
      'Level 5 raid',
      'Oakland loop',
      '[Also nearby]',
      'Picnic',
      'Machamp',
    ]);
  });

  it('has no Also nearby label when everything listed is at the tapped place', () => {
    expect(
      lines([
        thing('meetup:m1', { ...fountain, name: 'Picnic' }),
        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
      ]),
    ).toEqual(['Schenley Fountain', 'Picnic', 'Level 5 raid']);
  });

  it("decides by the place's key, never by its name or distance", () => {
    // Another gym of the same name, at the very same point, is only near it.
    expect(
      lines([
        thing('gym:7', { ...fountain, name: 'Level 5 raid' }),
        thing('train:t1', {
          name: 'Oakland loop',
          place: { key: 'gym:8', name: 'Schenley Fountain' },
        }),
      ]),
    ).toEqual(['Schenley Fountain', 'Level 5 raid', '[Also nearby]', 'Oakland loop']);
  });

  it('is headed Nearby for a pin tapped, with no label', () => {
    // A max battle at a pin beside the gym's raid: the pin has no place.
    expect(
      lines([thing('max:x1', { name: 'Machamp' }), thing('gym:7', { ...fountain, name: 'Raid' })]),
    ).toEqual(['Nearby', 'Machamp', 'Raid']);
    expect(lines([thing('meetup:m1'), thing('meetup:m2')])).toEqual([
      'Nearby',
      'meetup:m1',
      'meetup:m2',
    ]);
  });

  // Branch review S3: a train is at a place only where its ring is at the stop it is at, and the
  // place's name is the place's alone, so that the heading does not change with what was tapped.
  describe("a train's place", () => {
    const spot = { key: 'wabc.16', name: 'Lake Gazebo', lat: 40, lon: -80 };
    const gyms = new Map([[7, { name: 'Schenley Fountain', nickname: 'The Fountain' }]]);
    const at = (route: string[], stop: number | null) => ({ route, stop, spots: [spot] });

    it("is the gym's or Power Spot's own name, by the key the map's places have", () => {
      expect(trainPlace(at(['7', 'wabc.16'], 0), gyms)).toEqual({
        key: 'gym:7',
        name: 'Schenley Fountain',
      });
      expect(trainPlace(at(['7', 'wabc.16'], 1), gyms)).toEqual({
        key: 'spot:abc.16',
        name: 'Lake Gazebo',
      });
    });

    it('is none once finished, nor where the map cannot place its current stop', () => {
      expect(trainPlace(at(['7', 'wabc.16'], null), gyms)).toBeUndefined();
      expect(trainPlace(at(['9', '7'], 0), gyms)).toBeUndefined();
      expect(trainPlace(at(['wgone', '7'], 0), gyms)).toBeUndefined();
      expect(trainPlace(at([], null), gyms)).toBeUndefined();
    });
  });

  it('name when a train or meetup starts', () => {
    const now = Date.UTC(2026, 9, 13, 18);
    expect(startWords(now + 75 * 60_000, now, 'America/New_York')).toBe('starts 3:15 PM');
    expect(startWords(now - 60_000, now, 'America/New_York')).toBe('started');
    expect(startWords(null, now, 'America/New_York')).toBe('no start time');
  });

  it("hide a gym's dot under its raid while the raids are shown", () => {
    expect([...hiddenGyms([3, 7], true)]).toEqual([3, 7]);
    expect([...hiddenGyms([3, 7], false)]).toEqual([]);
  });
});
