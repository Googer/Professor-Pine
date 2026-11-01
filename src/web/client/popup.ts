import type { GeoView } from '../../domain/web/geo-data.js';
import { distanceWords, metersBetween, type DistanceUnits, type Place } from './distance.js';

/** A gym as the page has it from `/api/geo`. */
export type MapGym = GeoView['gyms'][number];

/**
 * A piece of the page as data: an element, its class and attributes, and either its text or
 * its children. `renderNode` makes elements of it, setting text only as `textContent`: what
 * members wrote never becomes HTML.
 */
export interface PageNode {
  tag: string;
  className?: string;
  text?: string;
  attributes?: Record<string, string>;
  children?: PageNode[];
}

/** What `renderNode` needs of an element: the DOM's, or a test's. */
export interface ElementLike<E> {
  className: string;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  append(child: E): void;
}

/**
 * The tallest a popup is drawn: what the map leaves room for, or 260 px at least; a form or a post
 * taller than that scrolls inside it (Leaflet's `maxHeight`, set as it is made).
 */
export function popupMaxHeight(map: { getSize(): { y: number } }): number {
  return Math.max(260, map.getSize().y - 140);
}

/**
 * The room a popup keeps at the map's top left as it pans into view (Leaflet's
 * `autoPanPaddingTopLeft`, set for every popup in `main.ts`), clear of the zoom buttons there
 * (with a touch screen's size 44 px from the left, 75 from the top), by the map's size, not the
 * page's: the side pane leaves a 768 px page a map of 428. Leaflet lets the left and top rules win,
 * so what they ask must leave the popup whole: right of the buttons where the widest popup fits
 * beside them (429 px, a post's), else below them where the tallest fits under them
 * (`popupMaxHeight`, with 48 px of margins and tip). A map too small for both (a narrow phone on
 * its side) keeps all of the popup in sight, the buttons over its corner.
 */
export function popupPanPadding(map: { getSize(): { x: number; y: number } }): [number, number] {
  const size = map.getSize();
  if (size.x >= 490) return [52, 5];
  return 83 + popupMaxHeight(map) + 48 + 5 <= size.y ? [5, 83] : [5, 5];
}

/** Makes the elements of a node and its children. */
export function renderNode<E extends ElementLike<E>>(
  node: PageNode,
  document: { createElement(tag: string): E },
): E {
  const element = document.createElement(node.tag);
  if (node.className !== undefined) element.className = node.className;
  for (const [name, value] of Object.entries(node.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  if (node.text !== undefined) element.textContent = node.text;
  for (const child of node.children ?? []) element.append(renderNode(child, document));
  return element;
}

/**
 * The label of a region on the map: its channel's name as text. Leaflet sets a string given as
 * a tooltip's or popup's content as HTML, so names go to it as nodes built from this.
 */
export function regionLabel(name: string): PageNode {
  return { tag: 'span', className: 'region-name', text: name };
}

const line = (className: string, text: string | null): PageNode[] =>
  text === null || text.trim() === '' ? [] : [{ tag: 'div', className, text }];

/** A gym's address line, when anything of it is known (the gym's popup, the parties' popups). */
export function addressLine(gym: Pick<MapGym, 'address'>): PageNode[] {
  return line('address', gym.address);
}

/**
 * "Directions": Google Maps, a route to the gym's place, in a new tab that does not learn where
 * it came from.
 */
export function directionsLink(gym: Pick<MapGym, 'lat' | 'lon'>): PageNode {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lon}`;
  return {
    tag: 'a',
    className: 'directions',
    text: 'Directions',
    attributes: { href: directions, target: '_blank', rel: 'noopener noreferrer' },
  };
}

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * The map's line: how far a place is once your location is known, "Directions", the post on
 * Discord where given, and `controls`; a place's and a party's popup alike.
 */
export function mapLine(
  place: Place | undefined,
  link: string,
  located: Place | undefined,
  units: DistanceUnits,
  controls: readonly PageNode[] = [],
): PageNode {
  const parts: PageNode[] = [
    ...(place !== undefined && located !== undefined
      ? [
          {
            tag: 'span',
            className: 'distance',
            text: distanceWords(metersBetween(located, place), units),
          },
        ]
      : []),
    ...(place === undefined ? [] : [directionsLink(place)]),
    ...(link.startsWith('https://discord.com/channels/')
      ? [
          {
            tag: 'a',
            className: 'post-link',
            text: 'Open on Discord',
            attributes: { href: link, ...NEW_TAB },
          },
        ]
      : []),
    ...controls,
  ];
  return {
    tag: 'div',
    className: 'map-line',
    children: parts.flatMap((part, index) =>
      index === 0 ? [part] : [{ tag: 'span', className: 'sep', text: ' · ' }, part],
    ),
  };
}

/** Where the reader is, for how far a place is: none until the browser said. */
export interface PopupWhere {
  located: Place | undefined;
  units: DistanceUnits;
}

/**
 * How every place's popup opens, a gym's, a PokéStop's and a Power Spot's alike (Matt, 2026-11-01):
 * its name, its address where anything of it is known, how far it is and Directions.
 */
export function placeHead(
  place: { name: string; address: string | null; lat: number; lon: number },
  where: PopupWhere,
  nickname: readonly PageNode[] = [],
): PageNode[] {
  return [
    { tag: 'strong', className: 'name', text: place.name },
    ...nickname,
    ...addressLine(place),
    mapLine(place, '', where.located, where.units),
  ];
}

/**
 * The popup of a gym (spec 3.1): `placeHead` with its nickname, then its notice and description.
 */
export function gymPopup(
  gym: MapGym,
  where: PopupWhere = { located: undefined, units: 'imperial' },
): PageNode {
  return {
    tag: 'div',
    className: 'gym-popup',
    children: [
      ...placeHead(gym, where, line('nickname', gym.nickname)),
      ...line('notice', gym.notice),
      ...line('description', gym.description),
    ],
  };
}
