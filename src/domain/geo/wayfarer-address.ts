import { addressLine, FORMATTED_ADDRESS, geodataJson, type AddressComponents } from './google.js';

/**
 * A Wayspot's address as a gym's address parts (Matt, 2026-10-16): a gym a Wayfarer import adds
 * or moves takes the address Wayfarer has instead of asking Google's Geocoding for one. Pure.
 *
 * Wayfarer writes an address as Google formats one, often followed by the town, the postal code
 * and the country again (Pittsburgh's first scan, 2026-10-15):
 * `59-69 Ingram Avenue, Pittsburgh, PA 15205, USA, Pittsburgh, 15205, US`, sometimes with a
 * place's name in front (`Monroeville Community Park West, 2399 Tilbrook Rd, …`), sometimes
 * shorter (`1800 Morris Avenue, Irwin, US`). The parts are read as Google would name them, as far
 * as the text says: the street number and the street, the town, the state and the postal code,
 * a name in front as the premise; the address itself up to the country is kept as it is shown
 * (`FORMATTED_ADDRESS`). The search reads the street, the town, the postal code and the premise
 * (`ADDRESS_PARTS`) as it reads Google's.
 */

/** The names of the country that end the formatted part of an address. */
const COUNTRY = /^(USA|US|United States)$/u;

/** A state and its postal code: `PA 15205`, or the state alone. */
const STATE_POSTAL = /^([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/u;

/** A plus code in front of a town (`FHWQ+J2 Frankfort Springs`): Google's name for a place without a street. */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}\s+/u;

/** A street with its number (or numbers): `59-69 Ingram Avenue`, `2399 Tilbrook Rd`. */
const NUMBERED_STREET = /^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/u;

/** The address parts a Wayspot's address says; empty for none. */
export function wayfarerAddressParts(address: string): AddressComponents {
  const parts = address
    .split(',')
    .map((part) => part.trim().replace(PLUS_CODE, ''))
    .filter((part) => part !== '');
  if (parts.length === 0) return {};
  const components: AddressComponents = {};
  if (parts.some((part) => COUNTRY.test(part))) components.country = 'US';
  // The address as shown ends with the state (and the country right after it), else with the
  // first country, else with the text; what follows repeats the town and the postal code.
  const state = parts.findIndex((part) => STATE_POSTAL.test(part) && !COUNTRY.test(part));
  const country = parts.findIndex((part) => COUNTRY.test(part));
  const last =
    state >= 0
      ? COUNTRY.test(parts[state + 1] ?? '')
        ? state + 1
        : state
      : country >= 0
        ? country
        : parts.length - 1;
  const shown = parts.slice(0, last + 1);
  if (state >= 0) {
    const [, code, postal] = STATE_POSTAL.exec(parts[state]!) ?? [];
    if (code) components.administrative_area_level_1 = code;
    if (postal) components.postal_code = postal;
  }
  // What lies before the state (or the country, or the end): the street, the town, a name.
  const before = parts.slice(0, state >= 0 ? state : country >= 0 ? country : parts.length);
  const streetAt = before.findIndex((part) => NUMBERED_STREET.test(part));
  if (streetAt >= 0) {
    const [, number, route] = NUMBERED_STREET.exec(before[streetAt]!) ?? [];
    if (number) components.street_number = number;
    if (route) components.route = route;
    if (streetAt > 0) components.premise = before.slice(0, streetAt).join(' ');
    const town = before[streetAt + 1];
    if (town) components.locality = town;
  } else if (before.length >= 2) {
    // A street without a number, then the town: `Chestnut St, Donora, PA, …`.
    components.route = before[0]!;
    components.locality = before[1]!;
  } else if (before.length === 1) {
    components.locality = before[0]!;
  }
  // The postal code of the tail when the address itself had none.
  if (components.postal_code === undefined) {
    const postal = parts.slice(last + 1).find((part) => /^\d{5}(?:-\d{4})?$/u.test(part));
    if (postal) components.postal_code = postal;
  }
  components[FORMATTED_ADDRESS] = shown.join(', ');
  return components;
}

/**
 * A Wayspot's address as `GymMeta.geodata` holds address parts (`geodataJson`), when it names a
 * street; null otherwise, and Google's Geocoding is asked as for a gym added by hand. Of
 * Pittsburgh's 5,886 Wayfarer gyms, 18 had no address and 108 one without a street (a town, or
 * a plus code and a town): Google's nearest street finds those better.
 */
export function wayfarerGeodata(address: string): string | null {
  const parts = wayfarerAddressParts(address);
  return parts.route === undefined ? null : geodataJson(parts);
}

/**
 * A Wayspot's address as one line, as a gym made of it would show it (`addressLine` of its
 * parts): the address up to the country, never the town, postal code and country Wayfarer
 * repeats after it. Empty for none.
 */
export function wayspotAddressLine(address: string | null): string {
  return address === null ? '' : addressLine(geodataJson(wayfarerAddressParts(address)));
}
