import type { DroppedPin, Place } from '../domain/geo/place.js';
import type { PlaceKind } from '../domain/search/place-merge.js';
import { mapMarkdown } from './raid-post.js';

/** How each kind of place is named after its title: `Fountain Square (PokéStop)`. */
export const PLACE_KIND_WORDS: Readonly<Record<PlaceKind, string>> = {
  gym: 'gym',
  stop: 'PokéStop',
  powerspot: 'Power Spot',
};

/**
 * A pin in one line (Matt, 2026-10-17): by the place it is near (`📍 Near **Fountain Square**
 * (PokéStop)`), else the name its link gave, else `📍 Dropped pin`; then its Map, unless `map`
 * is false (a direct message's brief, whose Map is a button). `text` makes what a member or a
 * link wrote safe where it is shown (`plain`, `plainNoLinks`).
 */
export function pinLine(
  pin: DroppedPin,
  text: (raw: string) => string,
  { map = true }: { map?: boolean } = {},
): string {
  const named = pin.near
    ? `📍 Near **${text(pin.near.title)}** (${PLACE_KIND_WORDS[pin.near.kind]})`
    : pin.linkName !== null
      ? `📍 **${text(pin.linkName)}**`
      : '📍 Dropped pin';
  return map ? `${named} · ${mapMarkdown(pin)}` : named;
}

/**
 * Where a meetup is in a few words, without markdown of its own (a direct message): `Near
 * Fountain Square (PokéStop)`, a pin as `a pin near Fountain Square (PokéStop)`, else the name
 * its link gave, else `a dropped pin`; undefined without a place. `text` makes what a member or
 * a link wrote safe where it is shown.
 */
export function placeSummary(
  place: Place | null,
  text: (raw: string) => string,
): string | undefined {
  if (place === null) return undefined;
  if (place.kind === 'pin') {
    if (place.near) {
      return `a pin near ${text(place.near.title)} (${PLACE_KIND_WORDS[place.near.kind]})`;
    }
    return place.linkName === null ? 'a dropped pin' : text(place.linkName);
  }
  return `Near ${text(place.title)} (${PLACE_KIND_WORDS[place.kind]})`;
}

/** The picture of a place as it was named; none for a pin. */
export function placeImage(place: Place | undefined): string | null {
  return place === undefined || place.kind === 'pin' ? null : place.image;
}
