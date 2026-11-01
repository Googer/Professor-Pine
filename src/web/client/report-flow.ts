import type { GeoView } from '../../domain/web/geo-data.js';
import { nearestPlaces } from '../../domain/search/nearest.js';
import { distanceWords, type DistanceUnits } from './distance.js';
import type { PageNode } from './popup.js';
import { iconNode, type ReportKind, type ReportPick } from './report-menu.js';
import { regionsAt } from './spawn-forms.js';
import type { LatLon } from './view.js';

/**
 * The Report button's step 2, where (plan 8M-9A; design "Reporting"): the places that fit drawn on
 * the map whatever the layers say (gyms for a raid, Power Spots for a max battle, any point for a
 * spawn), and in the side pane's box (docked under the map on a phone) what to tap, the nearest
 * few with their distances (from your location, else the map's middle: `nearestLines`), a way back
 * to step 1 and Cancel. A tap on a place or a line goes to step 3, the kind's own form with the
 * place. A train and a meetup have none: their forms ask their place (a train's region prefilled
 * where one region alone holds the place, `regionHolding`). Pure; the page's side is
 * `report-ui.ts`.
 */

/** What step 2 says to tap, by how the kind's place is picked. */
const PICK_HINTS: Readonly<Record<Exclude<ReportPick, 'form'>, string>> = {
  gyms: 'Tap a gym on the map to report its raid.',
  spots: 'Tap a Power Spot, or anywhere on the map for an unlisted power spot.',
  stops: 'Tap a PokéStop on the map.',
  point: 'Tap the map where the Pokémon is.',
};

/** How many of the nearest places step 2 lists. */
export const NEAREST_COUNT = 5;

/** A place step 2 may list: a gym, a Power Spot, a PokéStop, by its id. */
export interface NearPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** A line of the nearest places: the place's id, its name, how far it is in words. */
export interface NearLine {
  id: string;
  name: string;
  distance: string;
}

/**
 * The `count` places nearest to `origin` (your location, else the map's middle), nearest first,
 * as near by name (`nearestPlaces`, the order Discord's lists of nearby stops have too), their
 * distances in the settings' units (`distanceWords`, as every distance Pine says).
 */
export function nearestLines(
  places: readonly NearPlace[],
  origin: LatLon,
  units: DistanceUnits,
  count = NEAREST_COUNT,
): NearLine[] {
  return nearestPlaces(places, [origin], {
    pointOf: (place) => place,
    nameOf: (place) => place.name,
    count,
  }).map(({ item, metres }) => ({
    id: item.id,
    name: item.name,
    distance: distanceWords(metres, units),
  }));
}

/**
 * The region a new train is prefilled with (A5): the one region whose outline holds the place
 * (your location, else the map's middle); none where it lies in several or in none.
 */
export function regionHolding(place: LatLon, regions: GeoView['regions']): number | undefined {
  const holding = regionsAt(place, regions);
  return holding.length === 1 ? holding[0]?.id : undefined;
}

/**
 * The nearest places of step 2: their lines, still asked for (`loading`), not to be had
 * (`failed`), or not drawn at this zoom (`zoom`; R1-6).
 */
export type Nearest = readonly NearLine[] | 'loading' | 'failed' | 'zoom';

/**
 * What step 2 says of the places it asks for while it has none to list, by the kind of place
 * (R1-6; the PokéStops since plan 8M-9B, B9: a report needs a stop, so no pin is offered).
 */
const NEAREST_WORDS: Readonly<
  Record<'spots' | 'stops', Record<Exclude<Nearest, readonly NearLine[]>, string>>
> = {
  spots: {
    loading: 'Finding the nearest…',
    failed: 'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
    zoom: 'Zoom in to see the Power Spots near here.',
  },
  stops: {
    loading: 'Finding the nearest…',
    failed: 'The PokéStops could not be loaded. Try again in a moment.',
    zoom: 'Zoom in to see the PokéStops near here.',
  },
};

/** What step 2 says of a tap on open map while it picks PokéStops (plan 8M-9B): no pin. */
export const TAP_A_STOP = 'Tap a PokéStop.';

/**
 * The nearest places as buttons (`data-report-near`), or what is said while it has none; also
 * the research form's while it adds stops (branch review W6 of 8M-9B).
 */
export function nearestPart(nearest: Nearest | undefined, pick: ReportPick): PageNode[] {
  if (nearest === undefined) return [];
  const label: PageNode = { tag: 'div', className: 'near-label', text: 'Nearest' };
  if (typeof nearest === 'string') {
    const words = NEAREST_WORDS[pick === 'stops' ? 'stops' : 'spots'];
    return [label, { tag: 'p', className: 'near-none', text: words[nearest] }];
  }
  if (nearest.length === 0) {
    return [label, { tag: 'p', className: 'near-none', text: 'None near here.' }];
  }
  return [
    label,
    {
      tag: 'div',
      className: 'near-places',
      children: nearest.map((line): PageNode => ({
        tag: 'button',
        className: 'near-place',
        attributes: { type: 'button', 'data-report-near': line.id },
        children: [
          { tag: 'span', className: 'near-name', text: line.name },
          { tag: 'span', className: 'near-distance', text: line.distance },
        ],
      })),
    },
  ];
}

/** What a pin of step 2 is called in its line (R1-1). */
const PIN_WORDS: Readonly<Partial<Record<ReportPick, string>>> = {
  spots: 'Unlisted power spot here',
  point: 'Spawn here',
};

/**
 * The line of the pin a tap put (R1-1): what it is, and "Report here", which opens the kind's
 * form there; a second tap moves the pin, so a double tap only zooms the map. A pin in no region
 * says so in place of "Report here" (`refused`, review B6: `pressedWhere`, as a long press says it).
 */
function pinPart(kind: ReportKind, pin: LatLon | undefined, refused?: string): PageNode[] {
  const words = PIN_WORDS[kind.pick];
  if (pin === undefined || words === undefined) return [];
  return [
    {
      tag: 'div',
      className: 'pin-line',
      children: [
        { tag: 'span', text: words },
        refused === undefined
          ? {
              tag: 'button',
              className: 'press primary',
              text: 'Report here',
              attributes: { type: 'button', 'data-report-pin': '' },
            }
          : { tag: 'span', className: 'pin-refused', text: refused },
      ],
    },
  ];
}

/**
 * The part of step 2's box that changes (R2-2): the pin a tap put (R1-1), or why it cannot be
 * reported there (`refused`, review B6), and the nearest places, in an element that stays in the
 * page while only its content is drawn anew, told as it changes (`aria-live`, R1-3).
 */
export function pickLive(
  kind: ReportKind,
  nearest?: Nearest,
  pin?: LatLon,
  refused?: string,
  /** What a tap said that took nothing (plan 8M-9B: "Tap a PokéStop."). */
  note?: string,
): PageNode {
  return {
    tag: 'div',
    className: 'pick-live',
    attributes: { 'aria-live': 'polite', 'data-pick-live': '' },
    children: [
      ...(note === undefined ? [] : [{ tag: 'p', className: 'pick-note', text: note }]),
      ...pinPart(kind, pin, refused),
      ...nearestPart(nearest, kind.pick),
    ],
  };
}

/**
 * Step 2 of a kind: its heading with its icon (a heading that takes the focus as step 2 begins,
 * R1-3), what to tap, the part that changes (`pickLive`: the pin, the nearest places, none for a
 * spawn's point), ← Back and Cancel.
 */
export function pickBox(kind: ReportKind, nearest?: Nearest, pin?: LatLon): PageNode {
  const hint = kind.pick === 'form' ? '' : PICK_HINTS[kind.pick];
  return {
    tag: 'div',
    className: 'report-pick',
    attributes: {
      'data-form': 'report-pick',
      role: 'group',
      'aria-label': kind.heading,
    },
    children: [
      {
        tag: 'div',
        className: 'report-pick-head',
        children: [
          iconNode(kind.icon),
          {
            tag: 'span',
            text: kind.heading,
            attributes: { tabindex: '-1', 'data-pick-heading': '' },
          },
        ],
      },
      { tag: 'p', className: 'hint', text: hint },
      pickLive(kind, nearest, pin),
      {
        tag: 'div',
        className: 'form-buttons',
        children: [
          {
            tag: 'button',
            className: 'press',
            text: '← Back',
            attributes: { type: 'button', 'data-report-back': '' },
          },
          {
            tag: 'button',
            className: 'press',
            text: 'Cancel',
            attributes: { type: 'button', 'data-cancel': '' },
          },
        ],
      },
    ],
  };
}
