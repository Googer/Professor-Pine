import type { PlaceKind } from '../search/place-merge.js';
import { metresBetween } from '@pine/wayspot-core/distance';

/**
 * A gym, PokéStop or power spot as a member named it (`/wild near:`, a meetup's place): its kind
 * and id (a gym's number as text, a Wayspot's Wayfarer id), title, place, address line (a gym's
 * `addressLine`, a Wayspot's `wayspotAddressLine`; null or empty for none) and picture (shown
 * only as `wayspotPicture` allows), as it was when it was named: a snapshot (Matt, 2026-10-17),
 * since an import may delete a Wayspot and staff a gym while it is shown.
 */
export interface KnownPlace {
  kind: PlaceKind;
  id: string;
  title: string;
  lat: number;
  lon: number;
  address: string | null;
  image: string | null;
}

/**
 * A pin: a place a member gave by a maps link or coordinates (Matt, 2026-10-17). `near` is the
 * nearest gym, PokéStop or power spot within `PIN_NEAR_METRES` when it was set, `linkName` the
 * place its link named (Google's `/place/<name>/`), each null for none.
 */
export interface DroppedPin {
  kind: 'pin';
  lat: number;
  lon: number;
  near: { kind: PlaceKind; title: string } | null;
  linkName: string | null;
}

/** A place a member named: a known one, or a pin. */
export type Place = KnownPlace | DroppedPin;

/** A place's title (and a pin's `near.title`) is kept to this many code units, as its state takes. */
export const MAX_PLACE_TITLE = 255;

/** A pin's `linkName` is kept to this many code units, as its state takes. */
export const MAX_LINK_NAME = 100;

/**
 * A text in at most `limit` code units, cut at the end without a mark, never inside a character
 * of two code units (half an emoji is no character, and Discord refuses it).
 */
export function cutWhole(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
}

/** A pin is named by the nearest place at most this far away (Matt, 2026-10-17). */
export const PIN_NEAR_METRES = 50;

/**
 * A place that moved at most this far is still the place it was named as (as an import's
 * `REFETCH_METRES`): farther, it is no longer where the members agreed to meet.
 */
export const PLACE_MOVE_METRES = 25;

/**
 * What a meetup shows of the place it was named at (Matt, 2026-10-17): the place as it is `now`
 * (a rename, a new picture, an address show) while it still exists as the same kind within
 * `PLACE_MOVE_METRES` of where it was named; the snapshot once it is gone, of another kind or
 * moved farther. The snapshot itself is never rewritten.
 */
export function shownPlace(snapshot: KnownPlace, now: KnownPlace | undefined): KnownPlace {
  if (now === undefined || now.kind !== snapshot.kind) return snapshot;
  return metresBetween(snapshot, now) <= PLACE_MOVE_METRES ? now : snapshot;
}
