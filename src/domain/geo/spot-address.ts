import { metresBetween } from '@pine/wayspot-core/distance';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import { addressLine } from './google.js';
import { wayspotAddressLine } from './wayfarer-address.js';

/**
 * A Wayspot's address for every reader (design `2026-11-04-power-spot-address-design.md`): the
 * address Wayfarer gives (`wayspotAddressLine`) where there is one, else for a Power Spot the
 * address Google gave when the map asked for it, worded as a gym's (`addressLine` of its parts).
 * Wayfarer gives Power Spots none, and the Google line asks a Wayspot's nearby places, not its
 * address. Pure.
 */

/**
 * A PokéStop or Power Spot moved farther than this since Google was asked about it is asked
 * again: a few meters change no circle of places and no address, and an import corrects
 * thousands of points a little.
 */
export const WAYSPOT_MOVED_METRES = 10;

/** Where Google found no address, it is asked again only this long after (30 days). */
export const NONE_FOUND_AGAIN_MS = 30 * 86_400_000;

/**
 * The address Google gave for a Power Spot: where it was asked, the geocode's parts as a gym's
 * `geodata` (`geodataJson`; null where Google found none), and when, epoch milliseconds.
 */
export interface LookedUpAddress {
  lat: number;
  lon: number;
  geodata: string | null;
  askedAt: number;
}

/** What the address needs of a Wayspot. */
export interface AddressedWayspot {
  kind: WayspotKind;
  lat: number;
  lon: number;
  /** Wayfarer's address; null where it gives none. */
  address: string | null;
}

/** The looked-up address while it is the Power Spot's: asked within 10 meters of where it is. */
function keptFor(
  wayspot: AddressedWayspot,
  looked: LookedUpAddress | undefined,
): LookedUpAddress | undefined {
  return wayspot.kind === 'powerspot' &&
    looked !== undefined &&
    metresBetween(looked, wayspot) <= WAYSPOT_MOVED_METRES
    ? looked
    : undefined;
}

/**
 * A Wayspot's address as one line: Wayfarer's where it gives one, else a Power Spot's kept
 * looked-up address while the spot is where it was asked. Empty for none.
 */
export function wayspotAddress(
  wayspot: AddressedWayspot,
  looked: LookedUpAddress | undefined,
): string {
  const own = wayspotAddressLine(wayspot.address);
  if (own !== '') return own;
  return addressLine(keptFor(wayspot, looked)?.geodata ?? null);
}

/**
 * Whether Google is to be asked for a Wayspot's address: a Power Spot without one of Wayfarer's,
 * never asked where it is now, or asked and found none at least `NONE_FOUND_AGAIN_MS` ago.
 */
export function spotAddressWanted(
  wayspot: AddressedWayspot,
  looked: LookedUpAddress | undefined,
  now: number,
): boolean {
  if (wayspot.kind !== 'powerspot' || wayspotAddressLine(wayspot.address) !== '') return false;
  const kept = keptFor(wayspot, looked);
  if (kept === undefined) return true;
  return kept.geodata === null && now - kept.askedAt >= NONE_FOUND_AGAIN_MS;
}
