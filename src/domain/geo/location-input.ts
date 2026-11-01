import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * What a text says about where something is. `point`: coordinates; `approximate` when they are
 * only where a map was centred (an address without a pin: the place is somewhere near, and
 * whoever acts on it is told to check). `short-link`: an address that only leads to one (what
 * the Google Maps app shares): whoever may use the network follows it and reads the address it
 * leads to. `out-of-range`: numbers that are no place on earth. `unreadable`: anything else.
 */
export type LocationReading =
  | { kind: 'point'; point: LatLon; approximate?: true }
  | { kind: 'short-link'; url: string }
  | { kind: 'out-of-range' }
  | { kind: 'unreadable' };

/** The forms `readLocation` reads, as a sentence for whoever typed something else. */
export const LOCATION_FORMS =
  'Give the coordinates as `40.4406, -79.9959`, or paste a link to the place from Google Maps ' +
  '(also the short link its app shares), Apple Maps or the Ingress intel map.';

/** The hosts of the short links the Google Maps app shares. */
const SHORT_HOSTS: ReadonlySet<string> = new Set(['maps.app.goo.gl', 'goo.gl']);

const NUMBER = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*(?:,|;|\s)\s*(${NUMBER})\s*$`);
/** `40.4406° N, 79.9959° W`: decimal degrees with the letters of the compass. */
const COMPASS_PAIR = new RegExp(
  String.raw`^\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([NS])\s*[,;]?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])\s*$`,
  'i',
);
/** `40°26'46.3"N 79°58'55.9"W`: degrees, minutes and seconds, as Google Maps writes a pin. */
const DMS = String.raw`(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|'')\s*([NSEW])`;
const DMS_PAIR = new RegExp(String.raw`^\s*${DMS}\s*[,;+]?\s*${DMS}\s*$`, 'i');

function inRange(point: LatLon): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

function checked(point: LatLon): LocationReading {
  return inRange(point) ? { kind: 'point', point } : { kind: 'out-of-range' };
}

/** The reading as one of a map's centre: near the place, not the place. */
function approximately(reading: LocationReading): LocationReading {
  return reading.kind === 'point' ? { ...reading, approximate: true } : reading;
}

/**
 * Degrees, minutes and seconds with a letter of the compass, as decimal degrees; undefined when
 * the minutes or the seconds are 60 or more (that is no way to write an angle).
 */
function fromDms(
  degrees: string,
  minutes: string,
  seconds: string,
  letter: string,
): number | undefined {
  if (Number(minutes) >= 60 || Number(seconds) >= 60) return undefined;
  const value = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  return /[SW]/i.test(letter) ? -value : value;
}

/**
 * Two numbers as coordinates, latitude first: `40.44,-79.99`, with a space instead of the comma
 * or after it, with the letters of the compass, or as degrees, minutes and seconds. Undefined
 * for a text that is none of these. A run of white space counts as one space: the patterns take
 * white space in several places in a row, and long runs would make them try every way to share it.
 */
export function readPair(typed: string): LocationReading | undefined {
  const text = typed.replace(/\s+/g, ' ');
  const plain = PAIR.exec(text);
  if (plain) return checked({ lat: Number(plain[1]), lon: Number(plain[2]) });
  const compass = COMPASS_PAIR.exec(text);
  if (compass) {
    const [, lat = '', ns = '', lon = '', ew = ''] = compass;
    return checked({
      lat: /s/i.test(ns) ? -Number(lat) : Number(lat),
      lon: /w/i.test(ew) ? -Number(lon) : Number(lon),
    });
  }
  const dms = DMS_PAIR.exec(text);
  if (dms) {
    const [, d1 = '', m1 = '', s1 = '', l1 = '', d2 = '', m2 = '', s2 = '', l2 = ''] = dms;
    const first = fromDms(d1, m1, s1, l1);
    const second = fromDms(d2, m2, s2, l2);
    // Latitude first as a rule, but the letters say which is which.
    const latFirst = /[NS]/i.test(l1);
    if (first === undefined || second === undefined || latFirst === /[NS]/i.test(l2)) {
      return undefined;
    }
    return checked(latFirst ? { lat: first, lon: second } : { lat: second, lon: first });
  }
  return undefined;
}

/**
 * Whether a typed text is two whole numbers and nothing else (`40,44`): more likely one number
 * with a decimal comma than a place, since nobody knows a gym to the degree.
 */
function wholeNumbers(text: string): boolean {
  return /^\s*[-+]?\d+\s*(?:,|;|\s)\s*[-+]?\d+\s*$/.test(text);
}

/** The address a text is, when it is one: with `https://` put before a bare host and path. */
export function asUrl(text: string): URL | undefined {
  const trimmed = text.trim();
  const address = /^https?:\/\//i.test(trimmed);
  // A space inside an address that was pasted (after the comma of its coordinates, in the name
  // of its place) is a space of the address; any other text with a space is no address.
  if (!address && /\s/.test(trimmed)) return undefined;
  const candidate = address
    ? trimmed.replace(/\s+/g, '%20')
    : /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(trimmed)
      ? `https://${trimmed}`
      : undefined;
  if (candidate === undefined) return undefined;
  try {
    return new URL(candidate);
  } catch {
    return undefined;
  }
}

export function isGoogle(host: string): boolean {
  return /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** The first of these query parameters that holds coordinates. */
function fromParams(url: URL, names: readonly string[]): LocationReading | undefined {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value === null) continue;
    // `q=loc:40.44,-79.99` and `q=40.44,-79.99(Name)` are what some apps share.
    const reading = readPair(value.replace(/^loc:/i, '').replace(/\s*\([^()]*\)\s*$/, ''));
    if (reading) return reading;
  }
  return undefined;
}

/** The last match of a pair of numbers in an address, as `[first, second]`. */
function lastPair(href: string, pattern: RegExp): [number, number] | undefined {
  const found = [...href.matchAll(pattern)];
  const last = found[found.length - 1];
  return last ? [Number(last[1]), Number(last[2])] : undefined;
}

/**
 * A route (`/maps/dir/<from>/<to>/…`): the gym is where the route ends, never where it starts.
 * That is what the address was asked for (`destination`), or the last stop of the path when it
 * is coordinates. When the last stop is a name, the data of the address may have where Google
 * found each named stop (`!1d<lon>!2d<lat>`, longitude first, in the order of the stops): the
 * last of them is the end only when there is one for every named stop (a stop Google did not
 * find has none, and the last one would be some earlier stop), and it is only near the place
 * (`approximate`). Anything else says nothing: the middle of the map of a route is the middle
 * of the route, and a pin in its data is not known to be its end.
 */
function readRoute(url: URL, segments: readonly string[]): LocationReading | undefined {
  const asked = fromParams(url, ['destination']);
  if (asked) return asked;
  // Not a stop: the map's centre (`@…`) and what sets the view (`data=…`, `am=t`).
  const stops = segments
    .slice(segments.indexOf('dir') + 1)
    .filter((segment) => segment !== '' && !segment.startsWith('@') && !/^[a-z]+=/.test(segment));
  const end = readPair(stops[stops.length - 1] ?? '');
  if (end) return end;
  const named = stops.filter((stop) => readPair(stop) === undefined).length;
  const waypoints = [...url.href.matchAll(new RegExp(`!1d(${NUMBER})!2d(${NUMBER})`, 'g'))];
  const last = waypoints[waypoints.length - 1];
  if (!last || named === 0 || waypoints.length !== named) return undefined;
  return approximately(checked({ lat: Number(last[2]), lon: Number(last[1]) }));
}

/**
 * A Google Maps address. The pin (`!3d<lat>!4d<lon>`) is the place itself and wins; then what
 * the address was asked for when that is coordinates (`q`, `query`, `destination`) and the
 * place in its path (`/place/<coordinates>`, `/search/<coordinates>`). A route is read by where it ends (`readRoute`).
 *
 * Where a map was centred (`ll`, `@lat,lon,<zoom>z`) is beside the place whenever the map was
 * moved, so it is read only when the address has nothing better and is of a kind where the
 * centre is near the place: a bare map or a place page, never a search (`/search/`, `q=name`),
 * a route or a Street View (`@lat,lon,3a,…`, which is where the camera stood). Such a reading
 * is `approximate`.
 */
function readGoogle(url: URL): LocationReading | undefined {
  const segments = url.pathname.split('/').map(decoded);
  if (segments.includes('dir')) return readRoute(url, segments);
  const pin = lastPair(url.href, new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`, 'g'));
  if (pin) return checked({ lat: pin[0], lon: pin[1] });
  const asked = fromParams(url, ['q', 'query', 'destination']);
  if (asked) return asked;
  // The place of the path, or what was searched for, when that is coordinates.
  for (const kind of ['place', 'search']) {
    const at = segments.indexOf(kind);
    const named = at >= 0 ? readPair(segments[at + 1] ?? '') : undefined;
    if (named) return named;
  }
  // Asked for by name: the map shows results, and its centre is none of them.
  const searched =
    segments.includes('search') || url.searchParams.has('q') || url.searchParams.has('query');
  if (searched) return undefined;
  const centred = fromParams(url, ['ll']);
  if (centred) return approximately(centred);
  const centre = new RegExp(`/@(${NUMBER}),(${NUMBER}),\\d+(?:\\.\\d+)?z(?:/|$)`).exec(
    url.pathname,
  );
  if (centre) return approximately(checked({ lat: Number(centre[1]), lon: Number(centre[2]) }));
  return undefined;
}

/**
 * Reads where a gym is from what a moderator typed or pasted: coordinates (latitude first), or
 * a link to the place from Google Maps, Apple Maps (`ll`, `coordinate`: its place) or the
 * Ingress intel map (`pll`, the portal: its `ll` is only the middle of the map). It is pure: a
 * short link is named as one (`short-link`), not followed.
 */
export function readLocation(text: string): LocationReading {
  const pair = readPair(text);
  if (pair) return wholeNumbers(text) ? { kind: 'unreadable' } : pair;
  const url = asUrl(text);
  if (!url) return { kind: 'unreadable' };
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) {
    // Only what the Maps app shares: `goo.gl` shortens anything.
    const maps =
      host === 'maps.app.goo.gl' ? url.pathname.length > 1 : /^\/maps\/./.test(url.pathname);
    return maps
      ? { kind: 'short-link', url: `https://${host}${url.pathname}${url.search}` }
      : { kind: 'unreadable' };
  }
  let reading: LocationReading | undefined;
  if (isGoogle(host)) reading = readGoogle(url);
  else if (host === 'maps.apple.com') reading = fromParams(url, ['ll', 'coordinate']);
  else if (host === 'intel.ingress.com' || host === 'www.ingress.com' || host === 'ingress.com') {
    reading = fromParams(url, ['pll']);
  }
  return reading ?? { kind: 'unreadable' };
}
