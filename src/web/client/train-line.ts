import { arrivalNumbers } from '../../domain/party/stops-ahead.js';
import type { MapTrain } from '../../domain/web/party-data.js';
import { gymOfStop, stopPlace, type StopPlace } from './parties.js';

/**
 * A train's line on the live map shows its way (plan 8M-11B, S27): the legs it has done faint,
 * those ahead as before with an arrowhead at their middle pointing along the travel order, and a
 * looping train's closing leg, from its last stop back to its first, dashed with its arrowhead.
 * The order is the route's as stored: a turn-back train's route is reversed when it turns, so
 * after the turn the arrowheads point back by themselves. Pure; `party-layer.ts` draws it.
 */

/** A leg of a train's line: from one stop the map can place to the next one it can. */
export interface TrainLeg {
  from: StopPlace;
  to: StopPlace;
  /** Before the stop the train is at (or every leg once the route is finished): drawn faint. */
  done: boolean;
  /** A loop's leg from its last stop back to its first: dashed. */
  closing: boolean;
}

/**
 * The legs of a train's line, in its travel order, through the stops the map can place (a stop
 * it cannot place is passed over, as the line always did): a leg is done when the stop it leads
 * to is at or before the train's; a finished route (`stop` null) is done throughout and closes
 * no loop. A loop that can place two stops or more gets its closing leg, ahead; a turn-back
 * train at its last stop the leg back to the stop before it, ahead (BR-4).
 */
export function trainLegs(
  train: Pick<MapTrain, 'route' | 'stop' | 'spots' | 'atEnd'>,
  gyms: ReadonlyMap<number, StopPlace>,
): TrainLeg[] {
  const placed = train.route.flatMap((key, index) => {
    const place = stopPlace(train, key, gyms);
    return place ? [{ index, place }] : [];
  });
  const finished = train.stop === null;
  const legs: TrainLeg[] = [];
  for (let at = 1; at < placed.length; at += 1) {
    const from = placed[at - 1];
    const to = placed[at];
    if (!from || !to) continue;
    legs.push({
      from: from.place,
      to: to.place,
      done: finished || to.index <= (train.stop ?? 0),
      closing: false,
    });
  }
  const first = placed[0];
  const last = placed.at(-1);
  if (train.atEnd === 'loop' && !finished && first && last && placed.length > 1) {
    legs.push({ from: last.place, to: first.place, done: false, closing: true });
  }
  // A turn-back train at its last stop (branch review BR-4, Matt's S27: the arrows flip when it
  // turns): the way back, to the stop before it the map can place (BR-5: passing over one it
  // cannot, as the line does), is ahead, the rest faint. Only where the map places its own stop.
  const { route, stop } = train;
  const before = placed.at(-2);
  if (
    train.atEnd === 'turn-back' &&
    stop !== null &&
    stop === route.length - 1 &&
    last?.index === stop &&
    before
  ) {
    legs.push({ from: last.place, to: before.place, done: false, closing: false });
  }
  return legs;
}

/**
 * The legs done whose flow is drawn (Matt, 2026-10-30), each in the direction it was traveled: none
 * once the route is finished, and none on a leg the way ahead runs back over (a turn-back train at
 * its last stop, a loop of two stops), where the two flows would run against each other.
 */
export function doneFlowLegs(legs: readonly TrainLeg[], finished: boolean): TrainLeg[] {
  if (finished) return [];
  const same = (one: StopPlace, other: StopPlace): boolean =>
    one.lat === other.lat && one.lon === other.lon;
  const ahead = legs.filter((leg) => !leg.done);
  return legs.filter(
    (leg) =>
      leg.done && !ahead.some((other) => same(other.from, leg.to) && same(other.to, leg.from)),
  );
}

/** A leg ahead shorter than this on the screen, in pixels, gets no arrowhead. */
export const ARROW_MIN_PIXELS = 40;

/** An arrowhead of a train's line: where it is drawn, and its turn in degrees clockwise from east. */
export interface LegArrow {
  lat: number;
  lon: number;
  angle: number;
}

/**
 * The arrowheads of a train's legs ahead at the map's zoom (`project`: a place to the screen's
 * pixels, y down), recomputed whenever the zoom changes: one at the middle of each leg ahead at
 * least `ARROW_MIN_PIXELS` long on the screen, turned along it. A leg whose way back is drawn
 * ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two
 * do not meet at the middle.
 */
export function legArrows(
  legs: readonly TrainLeg[],
  project: (place: StopPlace) => { x: number; y: number },
): LegArrow[] {
  const ahead = legs.filter((leg) => !leg.done);
  return ahead.flatMap((leg) => {
    const from = project(leg.from);
    const to = project(leg.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) < ARROW_MIN_PIXELS) return [];
    const back = ahead.some((other) => other.from === leg.to && other.to === leg.from);
    const share = back ? 2 / 3 : 1 / 2;
    return [
      {
        lat: leg.from.lat + (leg.to.lat - leg.from.lat) * share,
        lon: leg.from.lon + (leg.to.lon - leg.from.lon) * share,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      },
    ];
  });
}

const SVG = 'http://www.w3.org/2000/svg';

/** The side of an arrowhead's square, in pixels: a triangle over the line's 4 (24 since plan 8M-13, T1). */
export const ARROW_PIXELS = 24;

/**
 * An arrowhead as SVG of ours (no markup string: the page's CSP lets no `style` attribute in):
 * a triangle pointing east in `color` (the theme's train color), turned by `angle` about its
 * middle.
 */
export function arrowElement(document: Document, color: string, angle: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  const size = String(ARROW_PIXELS);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const middle = ARROW_PIXELS / 2;
  const triangle = document.createElementNS(SVG, 'polygon');
  const near = '3';
  const far = String(ARROW_PIXELS - 3);
  triangle.setAttribute('points', `${near},${near} ${far},${String(middle)} ${near},${far}`);
  triangle.setAttribute('fill', color);
  triangle.setAttribute(
    'transform',
    `rotate(${angle.toFixed(1)} ${String(middle)} ${String(middle)})`,
  );
  svg.append(triangle);
  return svg;
}

/** How wide a train's line takes a tap, in pixels, its invisible stroke over the legs. */
export const TRAIN_HIT_PIXELS = 20;

/** The room between two numbers of one stop, in pixels. */
export const BADGE_GAP = 3;
/** The numbers show from this zoom up. */
export const BADGE_MIN_ZOOM = 15;
/** A stop's dot, whole: a gym's (`GYM_DOT`: radius 6, line 2) is 14, a Power Spot's 12, as near. */
export const STOP_DOT_PIXELS = 14;

// The numbers' pane, in a module of its own that the stylesheet tests can take (no DOM).
export { BADGE_PANE, BADGE_PANE_Z } from './panes.js';

/**
 * The train selected on the map (Matt, 2026-10-30): the one whose popup or phone card is open,
 * however it was opened, by either of its keys (`train:<id>`, `route:<id>`); what is open last is
 * what counts, so a popup of anything else in front of a card with a train selects nothing, and
 * a key waiting to be opened (`OpenPopup.openNext`) does not count until it is.
 */
export function selectedTrainId(
  popupOpen: boolean,
  popupKey: string | undefined,
  cardKey: string | undefined,
): string | undefined {
  const key = popupOpen ? popupKey : cardKey;
  const found = key === undefined ? null : /^(?:train|route):(.+)$/su.exec(key);
  return found?.[1];
}

/** A number on a stop of the selected train: how far away, where, its place in the stop's row. */
export interface StopBadge {
  /** The stop by its key in the route (`MapTrain.route`). */
  stop: string;
  /** How many stops away its next arrival is, from 1 (`arrivalNumbers`). */
  number: number;
  lat: number;
  lon: number;
  /** Its place in the row of the stop's numbers, from 0: only a stop listed twice has a second. */
  slot: number;
}

/**
 * The numbers of the selected train (`selectedTrainId`) among those drawn (`drawnTrains`: one
 * being routed is not; one that ended is gone), from `BADGE_MIN_ZOOM` (plan 8M-13, S7; counted
 * from the train and only while selected, plan 8M-15, Matt 2026-10-30): one per stop of
 * `stopsAhead` the map can place, by its next arrival (`arrivalNumbers`; none for a finished train
 * nor the current stop, which keeps the ring).
 */
export function selectedBadges(
  trains: ReadonlyArray<Pick<MapTrain, 'id' | 'route' | 'stop' | 'spots' | 'stopsAhead'>>,
  selected: string | undefined,
  zoom: number,
  gyms: ReadonlyMap<number, StopPlace>,
): StopBadge[] {
  const train = selected === undefined ? undefined : trains.find((one) => one.id === selected);
  if (!train || train.stop === null || zoom < BADGE_MIN_ZOOM) return [];
  const row = new Map<string, number>();
  return [...arrivalNumbers(train.stopsAhead, train.stop)].flatMap(([index, number]) => {
    const stop = train.route[index];
    const place = stopPlace(train, stop, gyms);
    if (stop === undefined || !place) return [];
    const slot = row.get(stop) ?? 0;
    row.set(stop, slot + 1);
    return [{ stop, number, lat: place.lat, lon: place.lon, slot }];
  });
}

/**
 * How wide what the map draws at a stop is, for its number's corner: a raid's or max battle's
 * marker (`raid`, its circle as it was drawn: a form holds the raids at their size through a zoom)
 * where one is drawn, else a dot.
 */
export function stopMarkerPixels(
  stop: string,
  raid: number,
  raidGyms: readonly number[],
  battleSpots: ReadonlySet<string>,
): number {
  const gymId = gymOfStop(stop);
  const drawn = gymId === null ? battleSpots.has(stop.slice(1)) : raidGyms.includes(gymId);
  return drawn ? raid : STOP_DOT_PIXELS;
}

/**
 * Where a number sits on its stop, as Leaflet's `iconAnchor` (the stop's point within the
 * number's own square of `numberPixels`, `--badge-size`): centered on the upper left corner of the
 * square round a marker `markerPixels` wide, so that the boss stays recognizable; on the left
 * because a raid's count of who is going has the upper right, and its time the foot. A second
 * number of the stop (`slot`) further left, whole beside the first.
 */
export function badgeAnchor(
  slot: number,
  markerPixels: number,
  numberPixels: number,
): [number, number] {
  const corner = markerPixels / 2;
  return [numberPixels / 2 + corner + slot * (numberPixels + BADGE_GAP), numberPixels / 2 + corner];
}
