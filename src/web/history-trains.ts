import type { TrainCardRows } from '../db/repositories/history-repository.js';
import {
  stopWindows,
  trainCard,
  type RaidAlongRow,
  type TrainCard,
} from '../domain/history/train-card.js';
import { trainShownOnWeb } from '../domain/history/trains-on-web.js';
import { clockWords, shortDateWords, shortDayWords, zoned } from '../domain/time/zoned.js';
import type {
  TrainCardLineView,
  TrainItemView,
  TrainRouteView,
} from '../domain/web/train-history-data.js';
import type { Fit } from '../render/party-post.js';
import { count } from '../render/text.js';
import { legacyTrainWords, trainCardText } from '../render/train-card.js';
import { pageWords } from './page-words.js';

/*
 * Ended trains on the map's History (plan 8H-7B), the server's words and places: which stops a
 * train's line goes through, what its list item and its card say, which regions decide who may
 * see it. Pure; the routes are `history-routes.ts`'s.
 */

/** Where the map has a gym or Power Spot now; undefined for one gone. */
export interface TrainPlaces {
  gym(id: number): { lat: number; lon: number } | undefined;
  spot(id: string): { lat: number; lon: number } | undefined;
  /**
   * The server's regions (`Region.id`) a gym lies in now (review A1: what gates a legacy train's
   * stop, which kept no regions); none for a gym gone or in none.
   */
  gymRegions(id: number): readonly number[];
}

/** The fit that never cuts: the web has room for a whole card (review G7). */
const WHOLE: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };

/** Small print in the bot's words (`-# `), which the page shows as such. */
const SMALL = /^-# /u;

/**
 * The stops a train's line goes through, in order (review G9): a live train's that its card
 * counts (`stopWindows`, one path with its stops' count), a legacy train's every stop of its
 * record (the route up to where it got, review G3). Each as its gym or its Power Spot.
 */
function lineStops(rows: TrainCardRows): { gymId: number | null; wayspotId: string | null }[] {
  if (rows.listing.source === 'legacy') return rows.stops;
  return stopWindows(rows.record, rows.stops, rows.attendees);
}

/**
 * A train's line as the page draws it: the places of its stops that the map has now, each once
 * (`points`), and its stops in order as indexes into them (`route`, a loop repeats one); a stop
 * whose place is gone is passed over and the line joins its neighbours.
 */
export function trainLine(
  rows: TrainCardRows,
  places: TrainPlaces,
): Pick<TrainRouteView, 'points' | 'route'> {
  const points: TrainRouteView['points'] = [];
  const indexOf = new Map<string, number>();
  const route: number[] = [];
  for (const stop of lineStops(rows)) {
    const key = stop.gymId !== null ? `g${String(stop.gymId)}` : `w${stop.wayspotId ?? ''}`;
    let index = indexOf.get(key);
    if (index === undefined) {
      const place =
        stop.gymId !== null
          ? places.gym(stop.gymId)
          : stop.wayspotId === null
            ? undefined
            : places.spot(stop.wayspotId);
      if (place === undefined) continue;
      index = points.length;
      points.push({ lat: place.lat, lon: place.lon });
      indexOf.set(key, index);
    }
    route.push(index);
  }
  return { points, route };
}

/**
 * Whether the web may list and draw a train (reviews G2, G3): three members or more came to it
 * (`trainShownOnWeb`), and a legacy train, which has only its line, has a stop the map can place
 * and a region to judge who may see it by (review A1: its own or a stop's; one with none is left
 * out). Who may see it is the regions' (`trainRegionIds`).
 */
export function trainListed(rows: TrainCardRows, places: TrainPlaces): boolean {
  if (!trainShownOnWeb(rows.listing)) return false;
  if (rows.listing.source === 'live') return true;
  return trainLine(rows, places).route.length > 0 && trainRegionIds(rows, places).length > 0;
}

/**
 * The regions that decide who may see a train (reviews G5, A1): its own (`regionId`), and every
 * region each of its stops lay in when it ended (`regionIds`); a legacy train's stops, which kept
 * none, by the regions their gyms lie in now (`gymRegions`). A member barred from any of them sees
 * nothing of it.
 */
export function trainRegionIds(rows: TrainCardRows, places: TrainPlaces): number[] {
  const ids = new Set<number>();
  if (rows.listing.regionId !== null) ids.add(rows.listing.regionId);
  const legacy = rows.listing.source === 'legacy';
  for (const stop of rows.stops) {
    const regions = legacy
      ? stop.gymId === null
        ? []
        : places.gymRegions(stop.gymId)
      : (stop.regionIds ?? []);
    for (const id of regions) ids.add(id);
  }
  return [...ids];
}

/** The card of a live train, as its post made it (raids undefined: none read). */
function cardOf(rows: TrainCardRows, raids: readonly RaidAlongRow[] | undefined): TrainCard {
  return trainCard(rows.record, rows.stops, rows.attendees, raids);
}

/** A train of a month's list (`id` its record's), in the server's words. */
export function trainItem(id: number, rows: TrainCardRows, zone: string): TrainItemView {
  const { listing } = rows;
  const time = zoned(listing.createdAt, zone);
  // In the card's words (review A3): its riders and its count of stops; a legacy train, which
  // has no card, its record's riders and the one phrase of its stops (`legacyTrainWords`).
  let stops: string;
  let riders: string;
  if (listing.source === 'legacy') {
    stops = legacyTrainWords(rows.stops.length);
    riders = count(listing.here + listing.done, 'rider');
  } else {
    const card = cardOf(rows, undefined);
    stops = card.stops === null ? 'It never left' : `About ${count(card.stops.count, 'stop')}`;
    riders = count(card.riders.members, 'rider');
  }
  return {
    id,
    name: listing.name ?? 'A train',
    when: `${shortDayWords(time)}, ${shortDateWords(time)}, ${clockWords(time)}`,
    about: `${stops} · ${riders}`,
  };
}

/**
 * A train's card as the page shows it (review G7): `trainCardText`, the post's own words, with
 * the regions in the web's words and room for all of it, made page text line by line
 * (`pageWords`), its small print marked. A legacy train has no card (review G3): one line of its
 * stops. `raids` as the post reads them (undefined: not read, and the card says nothing of them).
 */
export function trainCardLines(
  rows: TrainCardRows,
  raids: readonly RaidAlongRow[] | undefined,
  regionWords: (regionId: number) => string | undefined,
  zone: string,
  now: number,
): TrainCardLineView[] {
  if (rows.listing.source === 'legacy') {
    return [{ text: legacyTrainWords(rows.stops.length), small: false }];
  }
  const text = trainCardText(cardOf(rows, raids), regionWords, WHOLE);
  return text.split('\n').map((line) => ({
    text: pageWords(line.replace(SMALL, ''), zone, now),
    small: SMALL.test(line),
  }));
}
