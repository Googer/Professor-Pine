import { clockTime } from '../../domain/web/clock.js';
import { gymOfStop } from './parties.js';
import type { PageNode } from './popup.js';

/**
 * Several things at one place on the live map (plan 8M-7): a train's stop at a gym with a raid,
 * two parties at one gym, a meetup's pin beside a raid. When more than one shown thing sits at
 * the same place (the same gym, or within a few pixels at the current zoom), a tap on any of them
 * opens one popup listing each (picture, name, time), and a choice opens that thing's own popup.
 * Turning a layer off takes its things out, and the overlap with them. This replaces the tap on a
 * ring's line of plan 8S-4.
 */

/** How close on the screen two things are at one place. */
export const SHARED_PIXELS = 12;

/** A thing the map shows at a place, as the popup that lists them names it. */
export interface PlacedThing {
  /** Its popup's key (`gym:<id>`, `train:<id>`, `meetup:<id>`). */
  key: string;
  /** The gym it is at, or null. */
  gymId: number | null;
  lat: number;
  lon: number;
  picture: string | null;
  name: string;
  /** Its time in words: time left, the hatch, the start. */
  time: string;
  /**
   * The place it is at (a gym, a Power Spot, a stop), by a key of its own (`gym:<id>`, `spot:<id>`,
   * `stop:<key>`) and its name, which heads the list of the things there when it is the thing
   * tapped, those at the same key listed first (plan 8M-15); none for a pin.
   */
  place?: { key: string; name: string };
}

/**
 * The shown things at the place of `target` (itself first): those at its gym, and those within
 * `pixels` of it on the screen (`toPixel` at the current zoom), each once, in the order given.
 */
export function sharedPlace<T extends PlacedThing>(
  target: T,
  shown: readonly T[],
  toPixel: (place: { lat: number; lon: number }) => { x: number; y: number },
  pixels = SHARED_PIXELS,
): T[] {
  const at = toPixel(target);
  const near = shown.filter((thing) => {
    if (thing.key === target.key) return false;
    if (target.gymId !== null && thing.gymId === target.gymId) return true;
    const there = toPixel(thing);
    return Math.hypot(there.x - at.x, there.y - at.y) <= pixels;
  });
  return [target, ...near];
}

/**
 * The place key of a train's stop (`MapTrain.route`'s): a gym's `gym:<id>`, a Power Spot's
 * (`w<id>`) `spot:<id>`, as the other things at one place name theirs (review fix F5).
 */
export function placeKeyOfStop(stop: string): string {
  return stop.startsWith('w') ? `spot:${stop.slice(1)}` : `gym:${stop}`;
}

/**
 * The place a train is at, as the things at one place name it (branch review S3): the stop it is
 * at where the map can place it (as `ring.here` of `trainPlaces`), none once finished; its name
 * the place's alone, as a raid's and a max battle's are (no nickname, no "(Power Spot)"), so that
 * the list's heading does not change with what was tapped.
 */
export function trainPlace(
  train: {
    route: readonly string[];
    stop: number | null;
    spots: ReadonlyArray<{ key: string; name: string }>;
  },
  gyms: ReadonlyMap<number, { name: string }>,
): PlacedThing['place'] {
  const key = train.stop === null ? undefined : train.route[train.stop];
  if (key === undefined) return undefined;
  const gymId = gymOfStop(key);
  const name =
    gymId === null ? train.spots.find((one) => one.key === key)?.name : gyms.get(gymId)?.name;
  return name === undefined ? undefined : { key: placeKeyOfStop(key), name };
}

/** The label over the things only near the tapped place on the screen (plan 8M-15). */
export const ALSO_NEARBY = 'Also nearby';

/** The heading of a list whose tapped thing is at no named place (a pin). */
export const NEARBY = 'Nearby';

/**
 * The popup that lists the things at one place (plan 8M-15, design 1): headed with the name of
 * the tapped place (the first thing's, `sharedPlace` puts it first); the things at that place
 * (the same `place.key`, never by distance) first, then under "Also nearby" those only near it
 * on the screen, each group in the order given. A tapped thing at no named place (a pin) heads
 * the list "Nearby", without the label. A button for each, which opens its own popup.
 */
export function placeListNode(things: readonly PlacedThing[]): PageNode {
  const tapped = things[0]?.place;
  const atPlace = (thing: PlacedThing): boolean =>
    tapped !== undefined && thing.place?.key === tapped.key;
  const here = tapped === undefined ? [...things] : things.filter(atPlace);
  const near = tapped === undefined ? [] : things.filter((thing) => !atPlace(thing));
  return {
    tag: 'div',
    className: 'place-list',
    children: [
      { tag: 'strong', className: 'name', text: tapped?.name ?? NEARBY },
      {
        tag: 'div',
        className: 'choices',
        children: [
          ...here.map(choiceNode),
          ...(near.length === 0
            ? []
            : [
                { tag: 'span', className: 'also-nearby', text: ALSO_NEARBY },
                ...near.map(choiceNode),
              ]),
        ],
      },
    ],
  };
}

/** A thing's button in the list: its picture, name and time. */
function choiceNode(thing: PlacedThing): PageNode {
  return {
    tag: 'button',
    className: 'place-choice',
    attributes: { type: 'button', 'data-open': thing.key },
    children: [
      ...(thing.picture === null
        ? [{ tag: 'span', className: 'picture none' }]
        : [{ tag: 'img', className: 'picture', attributes: { src: thing.picture, alt: '' } }]),
      { tag: 'span', className: 'what', text: thing.name },
      { tag: 'span', className: 'when', text: thing.time },
    ],
  };
}

/** When a train or meetup starts, in a line: `starts 6:15 PM`, `started`, `no start time`. */
export function startWords(at: number | null, now: number, zone: string): string {
  if (at === null) return 'no start time';
  return at > now ? `starts ${clockTime(at, zone, now)}` : 'started';
}

/** The gyms whose dot is not drawn: a gym with a raid shows the raid, while raids are shown. */
export function hiddenGyms(raidGyms: Iterable<number>, raidsShown: boolean): Set<number> {
  return raidsShown ? new Set(raidGyms) : new Set();
}
