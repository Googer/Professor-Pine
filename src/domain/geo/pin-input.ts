import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { asUrl, isGoogle, readLocation, readPair, type LocationReading } from './location-input.js';
import { cutWhole, MAX_LINK_NAME } from './place.js';

/**
 * What a member's text says as a pin (Matt, 2026-10-17: a pasted maps link or typed coordinates
 * is a pin wherever a place is named). `pin`: the point, and the name the link gives the place
 * (`linkName`: Google's `/place/<name>/`, a `geo:` label), or null. `short-link`: an address that
 * only leads to one (`maps.app.goo.gl`, `goo.gl/maps`), which the bot does not follow: it fetches
 * nothing a member names. `out-of-range`: numbers that are no place on earth. `none`: no pin (a
 * name to search for, or nothing).
 */
export type PinReading =
  | { kind: 'pin'; point: LatLon; linkName: string | null }
  | { kind: 'short-link' }
  | { kind: 'out-of-range' }
  /** A link of a maps app that shows no one place: a search, a Street View, a bare map site. */
  | { kind: 'no-point' }
  | { kind: 'none' };

const NONE: PinReading = { kind: 'none' };
const NO_POINT: PinReading = { kind: 'no-point' };
const UNREADABLE: LocationReading = { kind: 'unreadable' };

/** A reading of `location-input.ts` as a pin with this name. */
function asPin(reading: LocationReading | undefined, linkName: string | null): PinReading {
  switch (reading?.kind) {
    case 'point':
      return { kind: 'pin', point: reading.point, linkName };
    case 'out-of-range':
      return { kind: 'out-of-range' };
    case 'short-link':
      return { kind: 'short-link' };
    default:
      return NONE;
  }
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/**
 * A name as one line: white space made single, at most `MAX_LINK_NAME` code units (never half of
 * an emoji); null for none.
 */
function nameOf(text: string): string | null {
  const name = cutWhole(text.replace(/\s+/g, ' ').trim(), MAX_LINK_NAME).trimEnd();
  return name === '' ? null : name;
}

/**
 * A `geo:` address (RFC 5870, and what Android shares): `geo:<lat>,<lon>[,<alt>][;…][?q=…]`. A
 * phone shares a place as `geo:0,0?q=<lat>,<lon>(<label>)`: the question's coordinates and label
 * then count.
 */
function readGeo(text: string): PinReading | undefined {
  const match = /^geo:([^?;]*)(?:;[^?]*)?(?:\?(.*))?$/i.exec(text);
  if (!match) return undefined;
  const [, where = '', query = ''] = match;
  const asked = new URLSearchParams(query).get('q');
  if (asked !== null) {
    const label = /\(([^()]*)\)\s*$/.exec(asked);
    const pair = readPair(asked.replace(/\s*\([^()]*\)\s*$/, ''));
    if (pair) return asPin(pair, label ? nameOf(label[1] ?? '') : null);
  }
  const [lat = '', lon = ''] = where.split(',');
  const reading = readPair(`${lat},${lon}`);
  // `geo:0,0` is a place known only by the address in its question (or none): no point.
  if (reading?.kind === 'point' && reading.point.lat === 0 && reading.point.lon === 0) {
    return NO_POINT;
  }
  return asPin(reading, null);
}

/** The name of the place a Google Maps address shows (`/place/<name>/…`), when it is no point. */
function googlePlaceName(url: URL): string | null {
  const segments = url.pathname.split('/');
  const at = segments.indexOf('place');
  const segment = at >= 0 ? decoded(segments[at + 1] ?? '') : '';
  if (segment === '' || readPair(segment) !== undefined) return null;
  return nameOf(segment);
}

/** The first of these query parameters that holds coordinates. */
function fromParams(url: URL, names: readonly string[]): LocationReading | undefined {
  for (const name of names) {
    const value = url.searchParams.get(name);
    const reading = value === null ? undefined : readPair(value);
    if (reading) return reading;
  }
  return undefined;
}

/** OpenStreetMap: its marker (`mlat`, `mlon`), else the middle of the map (`#map=<z>/<lat>/<lon>`). */
function readOsm(url: URL): LocationReading | undefined {
  const lat = url.searchParams.get('mlat');
  const lon = url.searchParams.get('mlon');
  if (lat !== null && lon !== null) return readPair(`${lat},${lon}`);
  const map = /(?:^#|&)map=\d+(?:\.\d+)?\/([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)/.exec(
    url.hash,
  );
  return map ? readPair(`${map[1] ?? ''},${map[2] ?? ''}`) : undefined;
}

/**
 * Apple Maps, beyond what `readLocation` reads: coordinates it was asked for (`q`), else, on a
 * map that asks for nothing, where it was centred (`sll`). A search for words near a point
 * (`q=coffee&sll=…`) shows no one place, as Google's search link does not (plan 8D, decision 3).
 */
function readApple(url: URL): LocationReading | undefined {
  const asked = url.searchParams.get('q');
  if (asked !== null && asked.trim() !== '') return readPair(asked);
  return fromParams(url, ['sll']);
}

function isOsm(host: string): boolean {
  return host === 'openstreetmap.org' || host === 'www.openstreetmap.org';
}

/**
 * The short links of Apple Maps (`maps.apple/p/…`) and OpenStreetMap (`osm.org/go/…`), which
 * `readLocation` does not know: like the Google Maps app's, they only lead to a place.
 */
function isOtherShortLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    (host === 'maps.apple' && url.pathname.length > 1) ||
    ((host === 'osm.org' || host === 'www.osm.org') && /^\/go\/./.test(url.pathname))
  );
}

/** Whether an address is one of a maps site: what it does not show as a point is no place. */
function isMapsSite(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    (isGoogle(host) && (host.startsWith('maps.') || url.pathname.startsWith('/maps'))) ||
    host === 'maps.apple.com' ||
    isOsm(host) ||
    host === 'intel.ingress.com'
  );
}

/**
 * Reads a pin from what a member typed or pasted (pure; nothing is followed or fetched):
 * coordinates, a `geo:` address, a Google Maps address (as `readLocation` reads it: the pin of a
 * place first, `!3d<lat>!4d<lon>`, then `q`, `query`, the place in the path, `ll` and `@`, the
 * name of `/place/<name>/` as `linkName`), Apple Maps (`ll`, `coordinate`, then `q` with
 * coordinates, then `sll` on a map that asks for nothing) or OpenStreetMap (`mlat`/`mlon`, `#map=`). A pin read from where a
 * map was centred counts: a member who pastes a map means its middle. A link of a maps site that
 * shows no one place (a search, a Street View) is `no-point`, as is `geo:0,0`; the short links
 * of the Google Maps app, Apple Maps (`maps.apple/p/…`) and OpenStreetMap (`osm.org/go/…`) are
 * `short-link`.
 */
export function readPin(text: string): PinReading {
  const trimmed = text.trim();
  const geo = readGeo(trimmed);
  if (geo) return geo;
  const url = asUrl(trimmed);
  const host = url?.hostname.toLowerCase();
  if (url && isOtherShortLink(url)) return { kind: 'short-link' };
  const read =
    url && host !== undefined && isOsm(host) ? (readOsm(url) ?? UNREADABLE) : readLocation(trimmed);
  const reading =
    read.kind === 'unreadable' && url && host === 'maps.apple.com'
      ? (readApple(url) ?? read)
      : read;
  if (reading.kind === 'unreadable') return url && isMapsSite(url) ? NO_POINT : NONE;
  const linkName =
    reading.kind === 'point' && url && host && isGoogle(host) ? googlePlaceName(url) : null;
  return asPin(reading, linkName);
}
