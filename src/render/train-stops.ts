import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
import type { StopRef } from '../domain/party/stops.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import type { Fit, PostBlock } from './party-post.js';
import { PLACE_KIND_WORDS } from './place.js';
import {
  gymMapsUrl,
  gymName,
  gymWhere,
  linkText,
  linkTextOf,
  mapMarkdown,
  placeSection,
  type PostGym,
} from './raid-post.js';
import { plain } from './text.js';

/**
 * A stop of a train's route as everything that shows it has it (plan 8X-4): a gym from the gym
 * list, or a power spot from the kept Wayspots, each undefined once it is gone (a deleted gym; a
 * Wayspot gone, or one that an import made another kind: design 6.2, a train's spot never
 * becomes a stop of another kind).
 */
export type PostStop =
  { kind: 'gym'; gym: PostGym | undefined } | { kind: 'powerspot'; spot: PostSpot | undefined };

/** A power spot as a stop shows it: its title, place, address line and picture. */
export interface PostSpot {
  title: string;
  lat: number;
  lon: number;
  /** One line (`wayspotAddressLine`); empty for none. */
  address: string;
  image: string | null;
}

/** What a power spot that Pine no longer keeps as one is called. */
export const UNKNOWN_SPOT = 'Unknown Power Spot';

/** What shows the stops of a route: the gym or power spot a reference names, as it is now. */
export type StopLookup = (ref: StopRef) => PostStop;

/**
 * The stops as the gyms and the kept Wayspots have them now (`stopsFrom`): a gym by its id, a
 * power spot by its Wayfarer id while it is kept as a power spot. Without Wayspots every power
 * spot is unknown.
 */
export function stopsFrom(
  gyms: { get(id: number): PostGym | undefined },
  wayspots?: { byId(id: string): Wayspot | undefined },
): StopLookup {
  return (ref) => {
    if (ref.kind === 'gym') return { kind: 'gym', gym: gyms.get(ref.id) };
    const kept = wayspots?.byId(ref.id);
    return {
      kind: 'powerspot',
      spot:
        kept?.kind === 'powerspot'
          ? {
              title: kept.title,
              lat: kept.lat,
              lon: kept.lon,
              address: wayspotAddressLine(kept.address),
              image: kept.image,
            }
          : undefined,
    };
  };
}

/** Whether a stop is gone: a gym the list no longer has, a power spot no longer kept as one. */
export function stopGone(stop: PostStop): boolean {
  return stop.kind === 'gym' ? stop.gym === undefined : stop.spot === undefined;
}

/**
 * A stop's name, raw: a gym's as the posts name it (`gymName`, its nickname first), a power
 * spot's title; `Unknown gym` and `Unknown Power Spot` for one that is gone. A title gone blank
 * is no name: `Unknown Power Spot` too.
 */
export function stopName(stop: PostStop): string {
  if (stop.kind === 'gym') return gymName(stop.gym);
  const title = stop.spot?.title.trim() ?? '';
  return title === '' ? UNKNOWN_SPOT : title;
}

/**
 * What a stop is called where a list could take a power spot for a gym (design 6.2): a power
 * spot's name with ` (Power Spot)` after it, a gym's alone. Raw; the caller makes it plain.
 */
export function stopLabel(stop: PostStop): string {
  const name = stopName(stop);
  return stop.kind === 'powerspot' && name !== UNKNOWN_SPOT
    ? `${name} (${PLACE_KIND_WORDS.powerspot})`
    : name;
}

/** `**The Stacks**`, `**Gazebo** (Power Spot)`: a stop in a sentence, made plain. */
export function stopInWords(stop: PostStop): string {
  const name = `**${plain(stopName(stop))}**`;
  return stop.kind === 'powerspot' && stopName(stop) !== UNKNOWN_SPOT
    ? `${name} (${PLACE_KIND_WORDS.powerspot})`
    : name;
}

/** Where a stop is, for its maps link; undefined for one that is gone. */
function pointOf(stop: PostStop): { lat: number; lon: number } | undefined {
  return stop.kind === 'gym' ? stop.gym : stop.spot;
}

/**
 * A stop as a link to its place in Google Maps, under its name (a power spot's with `(power
 * spot)` after the link). `bare` is for a components-v2 text or an embed, where a link shows no
 * preview; in a plain message the address stands in angle brackets so that it shows none
 * either. A stop that is gone is named as unknown, without a link.
 */
export function stopLink(stop: PostStop, bare = false): string {
  const point = pointOf(stop);
  if (point === undefined) return plain(stopName(stop));
  const text = stop.kind === 'gym' ? linkText(stop.gym) : linkTextOf(stopName(stop));
  const url = gymMapsUrl(point);
  const link = bare ? `[${text}](${url})` : `[${text}](<${url}>)`;
  return stop.kind === 'powerspot' ? `${link} (${PLACE_KIND_WORDS.powerspot})` : link;
}

/**
 * Where a train's current stop is, under `heading` (plan 8D): a gym as a raid's Where says it
 * (`gymWhere`); a power spot as a max battle's, `**<title>** (Power Spot) · <address> ·
 * [Map](<…>)` with its Wayfarer picture beside it (`placeSection`); one that is gone
 * `**Unknown Power Spot**` without a map.
 */
export function stopWhere(heading: string, stop: PostStop, fit: Fit): PostBlock {
  if (stop.kind === 'gym') return gymWhere(heading, stop.gym, fit);
  const { spot } = stop;
  if (spot === undefined) return { type: 'text', content: `${heading}\n**${UNKNOWN_SPOT}**` };
  return placeSection(fit, {
    heading,
    line: (address) =>
      [stopInWords(stop), ...(address === '' ? [] : [address]), mapMarkdown(spot)].join(' · '),
    address: plain(spot.address),
    picture: wayspotPicture(spot.image),
    under: [],
  });
}
