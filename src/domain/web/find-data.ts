/**
 * What Find on the live map asks of the server and gets (plan 8M-12; design
 * `docs/superpowers/specs/2026-10-28-find-design.md`), as a page reads it. Types and numbers
 * alone, with no import: a page's bundle (`src/web/client/`) may take them.
 */

/** The kinds of place Find finds by name: gyms, PokéStops and Power Spots. */
export type FoundPlaceKind = 'gym' | 'stop' | 'powerspot';

/**
 * A place Find found (`GET /s/<guild>/api/find-places`): its kind, its id (a gym's number as text,
 * a Wayspot's Wayfarer id, a stop of Pine's own as `pine-<id>`), its name and where it is.
 */
export interface FoundPlace {
  kind: FoundPlaceKind;
  id: string;
  name: string;
  lat: number;
  lon: number;
  /**
   * Found only by a misspelling (`placeFit` `guess`, plan 8M-13, O1): the page shows such places
   * only when Find found nothing else for the text. They come last within their kind.
   */
  guess: boolean;
}

/**
 * The places of the server whose names fit the text, in the order Discord's place search ranks
 * them (the fit, then the nearer to `near` of places that fit alike), at most
 * `FOUND_PLACES_PER_KIND` of each kind.
 */
export interface FoundPlacesView {
  places: FoundPlace[];
}

/** Find searches from two letters (the design): a shorter text finds nothing. */
export const FIND_MIN_LETTERS = 2;

/** The longest text Find sends: as long as a typed task or a gym's name may be. */
export const FIND_MAX_TEXT = 100;

/** The most places of each kind Find gives. */
export const FOUND_PLACES_PER_KIND = 10;
