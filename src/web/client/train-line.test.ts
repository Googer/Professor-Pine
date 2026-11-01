import { describe, expect, it } from 'vitest';
import type { MapAtEnd } from '../../domain/web/party-data.js';
import {
  ARROW_MIN_PIXELS,
  arrowElement,
  BADGE_GAP,
  BADGE_MIN_ZOOM,
  badgeAnchor,
  doneFlowLegs,
  legArrows,
  selectedBadges,
  selectedTrainId,
  STOP_DOT_PIXELS,
  stopMarkerPixels,
  trainLegs,
  type TrainLeg,
} from './train-line.js';

/** Stops on a line going east, a hundredth of a degree apart, by their gym ids. */
const GYMS = new Map([
  [1, { lat: 40, lon: -80 }],
  [2, { lat: 40, lon: -79.99 }],
  [3, { lat: 40, lon: -79.98 }],
  [4, { lat: 40, lon: -79.97 }],
]);
const SPOT = { key: 'wabc.16', name: 'Lake Gazebo', lat: 40.01, lon: -79.98 };

const train = (route: string[], stop: number | null, atEnd: MapAtEnd = 'finish') => ({
  route,
  stop,
  atEnd,
  spots: [SPOT],
});

/** A leg as the gyms it joins (by longitude), done or ahead, and whether it closes a loop. */
const legsOf = (legs: TrainLeg[]) =>
  legs.map((leg) => ({
    from: leg.from.lon,
    to: leg.to.lon,
    done: leg.done,
    ...(leg.closing ? { closing: true } : {}),
  }));

// Matt, 2026-10-30: the legs done flow too, the way they were traveled.
describe('doneFlowLegs', () => {
  const flows = (route: string[], stop: number | null, atEnd: MapAtEnd) =>
    legsOf(doneFlowLegs(trainLegs(train(route, stop, atEnd), GYMS), stop === null));

  it('flows over the legs done, in the order they were traveled, mid-route on a turn-back train', () => {
    expect(flows(['1', '2', '3'], 1, 'turn-back')).toEqual(
      legsOf(trainLegs(train(['1', '2', '3'], 1, 'turn-back'), GYMS)).slice(0, 1),
    );
  });

  it('leaves out the leg a turn-back train at its end runs back over', () => {
    const legs = legsOf(trainLegs(train(['1', '2', '3'], 2, 'turn-back'), GYMS));
    expect(flows(['1', '2', '3'], 2, 'turn-back')).toEqual(legs.slice(0, 1));
  });

  it('leaves out the leg a loop of two stops closes back over', () => {
    expect(flows(['1', '2'], 1, 'loop')).toEqual([]);
  });

  it('draws none once the route is finished, and none before a leg is done', () => {
    expect(flows(['1', '2', '3'], null, 'finish')).toEqual([]);
    expect(flows(['1', '2', '3'], 0, 'finish')).toEqual([]);
  });
});

describe('trainLegs (plan 8M-11B, S27)', () => {
  it('draws the legs before the stop the train is at faint, the rest ahead', () => {
    expect(legsOf(trainLegs(train(['1', '2', '3', '4'], 2), GYMS))).toEqual([
      { from: -80, to: -79.99, done: true },
      { from: -79.99, to: -79.98, done: true },
      { from: -79.98, to: -79.97, done: false },
    ]);
    // At its first stop (or before it starts) nothing is done.
    expect(trainLegs(train(['1', '2', '3'], 0), GYMS).map((leg) => leg.done)).toEqual([
      false,
      false,
    ]);
  });

  it('draws a finished route all faint, a loop without its closing leg', () => {
    expect(trainLegs(train(['1', '2', '3'], null), GYMS).map((leg) => leg.done)).toEqual([
      true,
      true,
    ]);
    expect(trainLegs(train(['1', '2', '3'], null, 'loop'), GYMS)).toHaveLength(2);
  });

  it('closes a loop with a leg from its last stop back to its first, ahead whatever stop it is at', () => {
    expect(legsOf(trainLegs(train(['1', '2', '3'], 2, 'loop'), GYMS))).toEqual([
      { from: -80, to: -79.99, done: true },
      { from: -79.99, to: -79.98, done: true },
      { from: -79.98, to: -80, done: false, closing: true },
    ]);
  });

  it("follows a turn-back train's route in the order it is stored: once turned, the way back", () => {
    // The route as stored after the turn at gym 3: reversed, the train at its index 1.
    expect(legsOf(trainLegs(train(['3', '2', '1'], 1, 'turn-back'), GYMS))).toEqual([
      { from: -79.98, to: -79.99, done: true },
      { from: -79.99, to: -80, done: false },
    ]);
  });

  // Branch review BR-4 (Matt's S27: the arrows flip when a back-and-forth train turns).
  it('draws the way back ahead at the last stop of a turn-back train, the rest faint', () => {
    expect(legsOf(trainLegs(train(['1', '2', '3'], 2, 'turn-back'), GYMS))).toEqual([
      { from: -80, to: -79.99, done: true },
      { from: -79.99, to: -79.98, done: true },
      { from: -79.98, to: -79.99, done: false },
    ]);
    // A shuttle of two stops after its first move (and after every turn, stored reversed at its
    // index 1): its one leg done, the way back ahead with its arrowhead.
    const shuttle = trainLegs(train(['1', '2'], 1, 'turn-back'), GYMS);
    expect(legsOf(shuttle)).toEqual([
      { from: -80, to: -79.99, done: true },
      { from: -79.99, to: -80, done: false },
    ]);
    const arrows = legArrows(shuttle, (place) => ({
      x: place.lon * 10_000,
      y: -place.lat * 10_000,
    }));
    expect(arrows.map((arrow) => Math.abs(Math.round(arrow.angle)))).toEqual([180]);
  });

  // Branch review BR-5: the way back passes over a stop the map cannot place, as the line does.
  it('draws the way back to the last stop it can place when the stop before is off the map', () => {
    expect(legsOf(trainLegs(train(['1', '99', '3'], 2, 'turn-back'), GYMS))).toEqual([
      { from: -80, to: -79.98, done: true },
      { from: -79.98, to: -80, done: false },
    ]);
    // The train's own stop off the map: no way back is drawn.
    expect(trainLegs(train(['1', '2', '99'], 2, 'turn-back'), GYMS).every((leg) => leg.done)).toBe(
      true,
    );
  });

  it('draws nothing ahead of a finished train, nor of a train that finishes at its last stop', () => {
    expect(
      trainLegs(train(['1', '2', '3'], null, 'turn-back'), GYMS).every((leg) => leg.done),
    ).toBe(true);
    expect(trainLegs(train(['1', '2', '3'], 2, 'finish'), GYMS).every((leg) => leg.done)).toBe(
      true,
    );
  });

  it('goes through the Power Spots it can place, and over the stops it cannot', () => {
    expect(legsOf(trainLegs(train(['1', SPOT.key, '99', '4'], 2), GYMS))).toEqual([
      { from: -80, to: -79.98, done: true },
      // The stop it is at is off the map: the leg that passes it is ahead.
      { from: -79.98, to: -79.97, done: false },
    ]);
    expect(trainLegs(train(['1'], 0), GYMS)).toEqual([]);
    expect(trainLegs(train(['1', '99'], 0, 'loop'), GYMS)).toEqual([]);
  });
});

describe('legArrows (plan 8M-11B, S27)', () => {
  /** A map where a hundredth of a degree is `pixels` on the screen, north up. */
  const projection = (pixels: number) => (place: { lat: number; lon: number }) => ({
    x: place.lon * pixels * 100,
    y: -place.lat * pixels * 100,
  });

  it('puts an arrowhead at the middle of each leg ahead, pointing along the travel order', () => {
    const legs = trainLegs(train(['1', '2', SPOT.key, '4'], 1), GYMS);
    const arrows = legArrows(legs, projection(100));
    // Leg 1 to 2 is done: no arrowhead. 2 to the spot goes north-east, the spot to 4 south-east.
    expect(arrows).toHaveLength(2);
    const [first, second] = arrows;
    expect(first?.lat).toBeCloseTo(40.005, 9);
    expect(first?.lon).toBeCloseTo(-79.985, 9);
    expect(first?.angle).toBeCloseTo(-45, 6);
    expect(second?.angle).toBeCloseTo(45, 6);
  });

  it('points east, south and west as the screen turns (degrees clockwise from east)', () => {
    const east = legArrows(trainLegs(train(['1', '2'], 0), GYMS), projection(100));
    expect(east.map((arrow) => Math.round(arrow.angle))).toEqual([0]);
    const west = legArrows(trainLegs(train(['2', '1'], 0), GYMS), projection(100));
    expect(Math.abs(Math.round(west[0]?.angle ?? 0))).toBe(180);
  });

  it(`gives none to a leg shorter on the screen than ${ARROW_MIN_PIXELS} pixels: zoomed out, none`, () => {
    const legs = trainLegs(train(['1', '2', '3'], 0), GYMS);
    expect(legArrows(legs, projection(ARROW_MIN_PIXELS + 1))).toHaveLength(2);
    expect(legArrows(legs, projection(ARROW_MIN_PIXELS - 1))).toEqual([]);
  });

  it("gives a loop's closing leg its arrowhead, and moves the two of a loop of two stops apart", () => {
    const three = legArrows(trainLegs(train(['1', '2', '3'], 0, 'loop'), GYMS), projection(100));
    expect(three).toHaveLength(3);
    expect(Math.abs(Math.round(three[2]?.angle ?? 0))).toBe(180);
    // Out and back on one line: each arrowhead two thirds of the way along its leg, not both at
    // the middle, where they would make a diamond.
    const two = legArrows(trainLegs(train(['1', '2'], 0, 'loop'), GYMS), projection(100));
    expect(two.map((arrow) => Math.round(arrow.angle * 1000) / 1000)).toEqual([0, 180]);
    expect(two[0]?.lon).toBeCloseTo(-80 + 0.01 * (2 / 3), 9);
    expect(two[1]?.lon).toBeCloseTo(-79.99 - 0.01 * (2 / 3), 9);
  });
});

// Plan 8M-13 (T1): the arrowheads were hard to see at 16 pixels.
describe('arrowElement', () => {
  /** A document that makes elements keeping their attributes and children. */
  const fakeDocument = () => {
    interface Made {
      name: string;
      attributes: Map<string, string>;
      children: Made[];
      setAttribute(name: string, value: string): void;
      append(child: Made): void;
    }
    const make = (_space: string, name: string): Made => {
      const made: Made = {
        name,
        attributes: new Map(),
        children: [],
        setAttribute: (key, value) => made.attributes.set(key, value),
        append: (child) => made.children.push(child),
      };
      return made;
    };
    return { createElementNS: make } as unknown as Document;
  };

  it('is a square of 24 pixels, its triangle filling it but for a margin of 3', () => {
    const svg = arrowElement(fakeDocument(), 'orange-ish', 90) as unknown as {
      attributes: Map<string, string>;
      children: Array<{ attributes: Map<string, string> }>;
    };
    expect(svg.attributes.get('width')).toBe('24');
    expect(svg.attributes.get('height')).toBe('24');
    expect(svg.attributes.get('viewBox')).toBe('0 0 24 24');
    expect(svg.children[0]?.attributes.get('points')).toBe('3,3 21,12 3,21');
    expect(svg.children[0]?.attributes.get('transform')).toBe('rotate(90.0 12 12)');
  });
});

// Matt, 2026-10-30: a train's numbers only while it is selected, one train at a time.
describe('selectedTrainId', () => {
  it('is the train whose popup or card is open, by either of its keys', () => {
    expect(selectedTrainId(true, 'train:t1', undefined)).toBe('t1');
    expect(selectedTrainId(true, 'route:t1', undefined)).toBe('t1');
    expect(selectedTrainId(false, undefined, 'train:t2')).toBe('t2');
    expect(selectedTrainId(false, undefined, 'route:t2')).toBe('t2');
  });

  it('is none with nothing open, or with anything else open', () => {
    expect(selectedTrainId(false, undefined, undefined)).toBeUndefined();
    expect(selectedTrainId(true, 'gym:7', undefined)).toBeUndefined();
    expect(selectedTrainId(false, undefined, 'meetup:m1')).toBeUndefined();
    // A popup with no key of a party (a gym's dot, a place) in front of the card with a train.
    expect(selectedTrainId(true, undefined, 'train:t2')).toBeUndefined();
    // A key to open once the list is drawn is not open yet.
    expect(selectedTrainId(false, 'train:t1', undefined)).toBeUndefined();
  });
});

describe('selectedBadges', () => {
  const shown = (
    id: string,
    route: string[],
    stop: number | null,
    stopsAhead: number[],
    atEnd: MapAtEnd = 'finish',
  ) => ({ id, ...train(route, stop, atEnd), stopsAhead });
  /** A badge as its number, its stop (by longitude) and its place in the row there. */
  const badgesOf = (
    trains: Array<ReturnType<typeof shown>>,
    selected: string | undefined,
    zoom = 16,
  ) =>
    selectedBadges(trains, selected, zoom, GYMS).map((badge) => ({
      number: badge.number,
      at: badge.lon,
      slot: badge.slot,
    }));
  const OURS = shown('t', ['1', '2', '3', '4'], 1, [2, 3]);
  const OTHER = shown('o', ['4', '3'], 0, [1]);

  it("numbers the selected train's stops ahead from it, and no other train's", () => {
    expect(badgesOf([OTHER, OURS], 't')).toEqual([
      { number: 1, at: -79.98, slot: 0 },
      { number: 2, at: -79.97, slot: 0 },
    ]);
    // A Power Spot ahead too, by its own place.
    expect(badgesOf([shown('t', ['1', SPOT.key], 0, [1])], 't')).toEqual([
      { number: 1, at: -79.98, slot: 0 },
    ]);
  });

  it('gives none with nothing selected, a train not drawn, or below zoom 15', () => {
    expect(badgesOf([OURS], undefined)).toEqual([]);
    // A train being routed is not among those drawn; one that ended is gone.
    expect(badgesOf([OTHER], 't')).toEqual([]);
    expect(badgesOf([OURS], 't', BADGE_MIN_ZOOM - 1)).toEqual([]);
    expect(badgesOf([OURS], 't', BADGE_MIN_ZOOM)).toHaveLength(2);
  });

  it('gives none to a finished train', () => {
    expect(badgesOf([shown('t', ['1', '2', '3'], null, [])], 't')).toEqual([]);
  });

  it("gives a turn-back train's stops their next arrival: gaps where it passes stops again", () => {
    // At gym 2 of 1 to 4: on to 3 and 4, back through 3 and 2, then 1.
    expect(
      badgesOf([shown('t', ['1', '2', '3', '4'], 1, [2, 3, 2, 1, 0], 'turn-back')], 't'),
    ).toEqual([
      { number: 1, at: -79.98, slot: 0 },
      { number: 2, at: -79.97, slot: 0 },
      { number: 5, at: -80, slot: 0 },
    ]);
  });

  it('counts a stop the map cannot place, which gets no number', () => {
    expect(badgesOf([shown('t', ['1', '9', '3'], 0, [1, 2])], 't')).toEqual([
      { number: 2, at: -79.98, slot: 0 },
    ]);
  });

  it('sets two numbers side by side only for a stop listed twice', () => {
    expect(badgesOf([shown('t', ['1', '2', '3', '2'], 0, [1, 2, 3])], 't')).toEqual([
      { number: 1, at: -79.99, slot: 0 },
      { number: 2, at: -79.98, slot: 0 },
      { number: 3, at: -79.99, slot: 1 },
    ]);
  });
});

describe('badgeAnchor', () => {
  const NUMBER = 20;
  /** A number's center from the stop as Leaflet places it, y down. */
  const center = (slot: number, marker: number) => {
    const [x, y] = badgeAnchor(slot, marker, NUMBER);
    return { x: NUMBER / 2 - x, y: NUMBER / 2 - y };
  };

  // Up and to the left: a raid's count of who is going has the upper right, its time the foot.
  it("sits on the marker's upper left corner, whatever the marker's size", () => {
    expect(center(0, 44)).toEqual({ x: -22, y: -22 });
    expect(center(0, 14)).toEqual({ x: -7, y: -7 });
  });

  it('sets a second number of one stop beside the first, further left, not overlapping', () => {
    expect(center(1, 44)).toEqual({ x: -22 - NUMBER - BADGE_GAP, y: -22 });
  });
});

describe('stopMarkerPixels', () => {
  const FULL = 44;

  it("is a raid's or max battle's full marker where one is drawn, else a dot's", () => {
    expect(stopMarkerPixels('12', FULL, [12], new Set())).toBe(FULL);
    expect(stopMarkerPixels('wabc', FULL, [], new Set(['abc']))).toBe(FULL);
    expect(stopMarkerPixels('13', FULL, [12], new Set(['abc']))).toBe(STOP_DOT_PIXELS);
    expect(stopMarkerPixels('wdef', FULL, [12], new Set(['abc']))).toBe(STOP_DOT_PIXELS);
  });
});
