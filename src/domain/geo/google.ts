import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * Reading what Google's Geocoding API and Places API (New) answer, and asking the latter. Pure:
 * the requests themselves are made by `GoogleGeo` (`src/services/geo-gateway.ts`).
 */

/** The parts of an address by their type, each with its short names joined by spaces. */
export type AddressComponents = Record<string, string>;

/**
 * What a Geocoding answer says. `ok`: the address parts of the point (none when Google knows
 * nothing there). `denied`: the key may not use the API. `failed`: anything else, with what
 * Google called it.
 */
export type GeocodeReading =
  | { kind: 'ok'; components: AddressComponents }
  | { kind: 'denied'; message: string }
  | { kind: 'failed'; status: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * The address parts of a reverse geocoding answer, as the legacy bot kept them: every type
 * (lower case) of every address component of every result collects the distinct short names of
 * its components, in the order Google gave them, joined by spaces. With them, under
 * `FORMATTED_ADDRESS`, the address as Google writes it for the first result (the nearest
 * one): joined parts cannot be put together to an address again (`addressLine` shows it).
 */
export function readGeocode(body: unknown): GeocodeReading {
  if (!isRecord(body)) return { kind: 'failed', status: 'not an answer' };
  const status = typeof body.status === 'string' ? body.status : 'no status';
  if (status === 'ZERO_RESULTS') return { kind: 'ok', components: {} };
  if (status === 'REQUEST_DENIED') {
    const message = typeof body.error_message === 'string' ? body.error_message : status;
    return { kind: 'denied', message };
  }
  if (status !== 'OK') return { kind: 'failed', status };
  const names = new Map<string, string[]>();
  let formatted: string | undefined;
  for (const result of Array.isArray(body.results) ? body.results : []) {
    if (!isRecord(result) || !Array.isArray(result.address_components)) continue;
    if (formatted === undefined && typeof result.formatted_address === 'string') {
      formatted = result.formatted_address.trim();
    }
    for (const component of result.address_components) {
      if (!isRecord(component) || typeof component.short_name !== 'string') continue;
      const name = component.short_name.trim();
      if (name === '') continue;
      for (const type of strings(component.types)) {
        const key = type.toLowerCase();
        const known = names.get(key) ?? [];
        if (!known.includes(name)) known.push(name);
        names.set(key, known);
      }
    }
  }
  const components: AddressComponents = {};
  for (const [type, known] of names) components[type] = known.join(' ');
  if (formatted && names.size > 0) components[FORMATTED_ADDRESS] = formatted;
  return { kind: 'ok', components };
}

/**
 * The key under which the address parts hold the address as Google writes it. No type of
 * Google's is called so, the search does not read it (`ADDRESS_PARTS`), and the legacy bot
 * reads the parts it knows by name.
 */
export const FORMATTED_ADDRESS = 'formatted_address';

/**
 * The address parts as `GymMeta.geodata` holds them (`{"addressComponents": {…}}`, which
 * `addressText` and the legacy bot read); null when there are none.
 */
export function geodataJson(components: AddressComponents): string | null {
  return Object.keys(components).length === 0
    ? null
    : JSON.stringify({ addressComponents: components });
}

/**
 * The address parts of a stored geocoding result, type by type, for showing them. Empty for
 * text that is missing, is not JSON or has another shape.
 */
export function geodataParts(geodata: string | null): { type: string; value: string }[] {
  if (!geodata) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(geodata);
  } catch {
    return [];
  }
  const components = isRecord(parsed) ? parsed.addressComponents : undefined;
  if (!isRecord(components)) return [];
  return Object.entries(components).flatMap(([type, value]) => {
    const text = typeof value === 'string' ? value : strings(value).join(' ');
    return text.trim() === '' ? [] : [{ type, value: text }];
  });
}

/**
 * The address of a stored geocoding result as one line for a reader: the address as Google
 * wrote it, where the row has it. An older row has only the parts, each the names of several
 * results joined by spaces: its line is the street (with its number only when there is one
 * number), the town, the state and the postal code, as far as they are there. Empty when
 * nothing of that is known.
 */
export function addressLine(geodata: string | null): string {
  const parts = new Map(geodataParts(geodata).map(({ type, value }) => [type, value.trim()]));
  const formatted = parts.get(FORMATTED_ADDRESS);
  if (formatted) return formatted;
  const route = parts.get('route');
  const number = parts.get('street_number');
  const street = route && number && !/\s/.test(number) ? `${number} ${route}` : route;
  const region = [parts.get('administrative_area_level_1'), parts.get('postal_code')]
    .filter(Boolean)
    .join(' ');
  return [street, parts.get('locality'), region].filter(Boolean).join(', ');
}

/**
 * The kinds of place whose names help to find a gym: the legacy bot's list (`evaluatePlace`).
 * A place is kept when one of its types is among them.
 */
export const PLACE_TYPES: ReadonlySet<string> = new Set(
  (
    'accounting airport amusement_park aquarium art_gallery atm bakery bank bar beauty_salon ' +
    'bicycle_store book_store bowling_alley bus_station cafe campground car_dealer car_rental ' +
    'car_repair car_wash casino cemetery church city_hall clothing_store convenience_store ' +
    'courthouse dentist department_store doctor electrician electronics_store embassy ' +
    'establishment finance fire_station florist food funeral_home furniture_store gas_station ' +
    'general_contractor grocery_or_supermarket gym hair_care hardware_store health hindu_temple ' +
    'home_goods_store hospital insurance_agency jewelry_store laundry lawyer library ' +
    'liquor_store local_government_office locksmith lodging meal_delivery meal_takeaway mosque ' +
    'movie_rental movie_theater moving_company museum night_club painter park parking pet_store ' +
    'pharmacy physiotherapist place_of_worship plumber police post_office real_estate_agency ' +
    'restaurant roofing_contractor rv_park school shoe_store shopping_mall spa stadium storage ' +
    'store subway_station synagogue taxi_stand train_station travel_agency university ' +
    'veterinary_care zoo'
  ).split(' '),
);

/** Where the Places API (New) answers a Nearby Search. */
export const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
/** The fields asked for: the name and the types, nothing that costs more. */
export const PLACES_FIELD_MASK = 'places.displayName,places.types';
/** Where the Geocoding API answers. */
export const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

/** The body of a Nearby Search around a point: the twenty places Google ranks first, in English. */
export function placesRequest(point: LatLon, radiusMetres: number): unknown {
  return {
    maxResultCount: 20,
    languageCode: 'en',
    locationRestriction: {
      circle: { center: { latitude: point.lat, longitude: point.lon }, radius: radiusMetres },
    },
  };
}

/**
 * The names of the places of a Nearby Search answer that are of a kind worth keeping
 * (`PLACE_TYPES`), each once, in Google's order. An answer without places has none.
 */
export function readPlaces(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.places)) return [];
  const names: string[] = [];
  for (const place of body.places) {
    if (!isRecord(place) || !isRecord(place.displayName)) continue;
    const text = place.displayName.text;
    if (typeof text !== 'string') continue;
    const name = text.replace(/\s+/g, ' ').trim();
    if (name === '' || names.includes(name)) continue;
    if (strings(place.types).some((type) => PLACE_TYPES.has(type))) names.push(name);
  }
  return names;
}

/** The names as `GymMeta.places` holds them: joined by spaces; null for none. */
export function placesText(names: readonly string[]): string | null {
  return names.length === 0 ? null : names.join(' ');
}

/** The smallest and the largest circle places are looked for in, in metres. */
const PLACES_RADIUS = { min: 25, max: 500 } as const;

/**
 * How far around a gym places are looked for: half the way to the nearest other gym, so that a
 * place counts for the gym it is nearest to, but never less than `min` or more than `max`
 * metres; `max` when there is no other gym.
 */
export function placesRadius(nearestMetres: number | undefined): number {
  if (nearestMetres === undefined || !Number.isFinite(nearestMetres)) return PLACES_RADIUS.max;
  return Math.min(PLACES_RADIUS.max, Math.max(PLACES_RADIUS.min, nearestMetres / 2));
}
