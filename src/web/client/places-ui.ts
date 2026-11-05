import * as L from 'leaflet';
import type { PowerSpotsView } from '../../domain/web/max-data.js';
import type { StopsView } from '../../domain/web/meetup-data.js';
import { PlacesInView, placesWanted, unoccupied } from './cluster.js';
import { getJson } from './common.js';
import { hoverName } from './hover-name.js';
import type { LayerRegistry } from './layer-registry.js';
import { StopLoads, stopsBox } from './meetup-forms.js';
import type { MapActivity } from './parties.js';
import { gymClicks } from './party-layer.js';
import { popupMaxHeight, renderNode } from './popup.js';
import type { RouteFocus } from './route-focus.js';
import { onThemeChange, theme, type DrawnColour } from './theme.js';

/**
 * The PokéStops and Power Spots layers of the live map (plan 8M-7): for a member, from street
 * level (`PLACES_FROM`), those of the view are asked for through the existing `/api/stops` and
 * `/api/powerspots` (the box kept to the world, `stopsBox`) at once and again 300 ms after the map
 * rests (`StopLoads`, only the last question's answer shown), drawn as small dots with their name
 * in a popup; a Power Spot's popup also offers "Report max battle here" (plan 8M-9A,
 * `PlacesHooks.spotControls`), and a spot with a battle is not drawn: the battle's marker is
 * (`occupied`, drawn again from the last answer as the parties change); in route mode a Power
 * Spot tapped is the train's next stop instead (plan 8M-8C, R5: `spotTapped`); "more than shown"
 * is told in one quiet line at the bottom of the map. Logged out the layers are not offered.
 */

/** The quiet line at the bottom of the map: one sentence per layer that has more than it shows. */
export interface QuietLine {
  set(id: string, text: string | undefined): void;
}

/**
 * The radius, in pixels, of the target a place offers a tap while the Report button's step 2
 * picks it (R1-10): a clear circle round its small dot.
 */
export const PICKED_TARGET = 16;

/** The words of the quiet line for a layer with more places in view than it shows. */
export const MORE_THAN_SHOWN: Readonly<Record<'stops' | 'spots', string>> = {
  stops: 'Zoom in to see every PokéStop here.',
  spots: 'Zoom in to see every Power Spot here.',
};

export function quietLine(map: L.Map): QuietLine {
  const lines = new Map<string, string>();
  const line = document.createElement('p');
  line.className = 'quiet-line';
  line.hidden = true;
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => line;
  control.addTo(map);
  return {
    set(id, text) {
      if (text === undefined) lines.delete(id);
      else lines.set(id, text);
      line.textContent = [...lines.values()].join(' ');
      line.hidden = lines.size === 0;
    },
  };
}

interface PlacesLayer {
  id: 'stops' | 'spots';
  url: (guild: string) => string;
  colour: DrawnColour;
  read: (answer: unknown) => StopsView;
}

const LAYERS: readonly PlacesLayer[] = [
  {
    id: 'stops',
    url: (guild) => `/s/${guild}/api/stops`,
    colour: 'stop',
    read: (answer) => answer as StopsView,
  },
  {
    id: 'spots',
    url: (guild) => `/s/${guild}/api/powerspots`,
    colour: 'powerSpot',
    read: (answer) => {
      const view = answer as PowerSpotsView;
      return { stops: view.spots, more: view.more };
    },
  },
];

/**
 * A Power Spot's marker as a gym's (plan 8M-8C, review C10): its clicks and Enter taken as a
 * gym's are (`gymClicks`): in route mode `routeTap` adds it as a stop (true: no popup, and a
 * double tap of it no zoom), otherwise `open` opens its popup. A Tab stop named for a screen
 * reader only while route mode is on (`focus`, re-review N1).
 */
export function placeClicks(
  marker: L.CircleMarker,
  name: string,
  routeTap: () => boolean,
  open: () => void,
  focus?: Pick<RouteFocus, 'watch'>,
): void {
  focus?.watch(marker, name);
  gymClicks(marker, routeTap, open);
}

/**
 * What the parties add to the places (plan 8M-9A): a Power Spot's controls in its popup ("Report
 * max battle here", for a member who may report), and the places whose own thing is drawn in their
 * place (a spot with a battle: the battle's marker, A6), by layer.
 */
export interface PlacesHooks {
  spotControls(spot: { id: string; title: string; lat: number; lon: number }): HTMLElement[];
  occupied(layer: 'stops' | 'spots'): ReadonlySet<string>;
  /** The places are to be tapped (the Report button's step 2, A4): drawn whatever the layer says. */
  forced(layer: 'stops' | 'spots'): boolean;
  /**
   * The battle that stands at a Power Spot opened on a tap of the spot's dot (true), in place of
   * the spot's popup (review B1: with the Raids layer off the dot is drawn though a battle is on).
   */
  openBattle(spotId: string): boolean;
  /**
   * A PokéStop's dot tapped: true where the Report button's step 2 took it (the pin at its place,
   * review B6), its popup not opened.
   */
  stopTapped(stop: PlaceSpot): boolean;
  /**
   * A PokéStop's popup (plan 8M-9B, B11): its name, how far it is, Directions and the stop's own
   * actions, made by the parties; none: its name alone.
   */
  stopPopup?(stop: PlaceSpot): HTMLElement | undefined;
  /** A Power Spot's popup, its controls then added under it (`placeHead`); none: its name alone. */
  spotPopup?(spot: PlaceSpot): HTMLElement | undefined;
  /**
   * A Power Spot's popup opened (design 2026-11-04): its address asked for where it has none, and
   * drawn in the popup when it comes (`SpotAddresses.fill`).
   */
  spotAddress?(spot: PlaceSpot, popup: HTMLElement | undefined): void;
  /**
   * A dot tapped that nothing took (Matt, 2026-10-30): what it opens, `own` or the list of what is
   * at its place; none: `own`.
   */
  placeTapped?(layer: 'stops' | 'spots', place: PlaceSpot, own: () => void): void;
  /**
   * A layer's dots were drawn anew, or taken off (review 8H4H-3: the Activity layer's circles go
   * where the dots are not, `ShownPlaces.spotDrawn`).
   */
  drawn?(layer: 'stops' | 'spots'): void;
}

/** A PokéStop or Power Spot as the page has it from `/api/stops` and `/api/powerspots`. */
export interface PlaceSpot {
  id: string;
  title: string;
  lat: number;
  lon: number;
  address?: string | null;
}

/** What the places give the page: asked for anew, or drawn again from their last answers. */
export interface ShownPlaces {
  /** The layer, the zoom or who asks changed: asked for when wanted, taken off when not. */
  refresh(): void;
  /** What the parties draw changed (a battle at a spot): drawn again from the last answers. */
  redrawn(): void;
  /** A Power Spot's popup opened at it, whether its dot is drawn or not (plan 8M-9A, A6). */
  openSpot(spot: PlaceSpot): HTMLElement | undefined;
  /** A PokéStop's popup opened at it, whether its dot is drawn or not (plan 8M-9B, B9). */
  openStop(stop: PlaceSpot): HTMLElement | undefined;
  /** Tells `listener` each answer of the Power Spots of the view, or why none came (step 2, R1-6). */
  onSpots(listener: (spots: readonly PlaceSpot[] | 'failed' | 'zoom') => void): void;
  /** Tells `listener` each answer of the PokéStops of the view (plan 8M-9B, B9), as `onSpots`. */
  onStops(listener: (stops: readonly PlaceSpot[] | 'failed' | 'zoom') => void): void;
  /**
   * An address came for a Power Spot (design 2026-11-04): kept in the last list of the Power
   * Spots, so that the spot's next popup has it at once.
   */
  addressFound(spotId: string, address: string): void;
  /**
   * Whether a Power Spot's own dot is drawn now (review 8H4H-3): not where its layer is off, the
   * map is zoomed out, the spot is not in the last answer (past the most drawn, none yet, failed)
   * or a battle stands in its place.
   */
  spotDrawn(spotId: string): boolean;
}

export function showPlaces(
  map: L.Map,
  guild: string,
  registry: LayerRegistry,
  quiet: QuietLine,
  member: () => boolean,
  /** A Power Spot tapped: true where route mode took it as a stop (plan 8M-8C, R5). */
  spotTapped: (spot: { id: string; title: string; lat: number; lon: number }) => boolean = () =>
    false,
  /** Power Spots as Tab stops in route mode only (re-review N1); left out: never. */
  focus?: Pick<RouteFocus, 'watch'>,
  hooks?: PlacesHooks,
  /**
   * Whether the live map is in use (plan 8M-10): its moves while the region editor hides it ask
   * nothing, and are caught up once it is off (re-review V1); left out: always.
   */
  activity?: Pick<MapActivity, 'whenLive'>,
): ShownPlaces {
  const checks: Array<() => void> = [];
  const redraws: Array<() => void> = [];
  /** Who hears of the places of the view, by layer (the PokéStops' since plan 8M-9B, B9). */
  const placeListeners: Record<
    'stops' | 'spots',
    Array<(places: readonly PlaceSpot[] | 'failed' | 'zoom') => void>
  > = { stops: [], spots: [] };
  /** Tells a layer's listeners an answer, or why none came (R1-6). */
  const told = (layer: 'stops' | 'spots', answer: readonly PlaceSpot[] | 'failed' | 'zoom') => {
    for (const listener of placeListeners[layer]) listener(answer);
  };
  /**
   * A place's popup at it: its name, as text of an element of ours (Leaflet sets a string as
   * HTML), and for a Power Spot what the parties offer there ("Report max battle here", plan
   * 8M-9A); its element.
   */
  const placePopup = (id: 'stops' | 'spots', place: PlaceSpot): HTMLElement | undefined => {
    const made = id === 'stops' ? hooks?.stopPopup?.(place) : hooks?.spotPopup?.(place);
    const content =
      made ??
      renderNode(
        {
          tag: 'div',
          className: 'place-popup',
          children: [{ tag: 'strong', className: 'place-name', text: place.title }],
        },
        document,
      );
    if (id === 'spots') content.append(...(hooks?.spotControls(place) ?? []));
    const popup = L.popup({ maxHeight: popupMaxHeight(map) })
      .setLatLng([place.lat, place.lon])
      .setContent(content)
      .openOn(map);
    const element = popup.getElement();
    if (id === 'spots') hooks?.spotAddress?.(place, element);
    return element;
  };
  /** The last answer of each layer shown, drawn again when what the parties draw changes. */
  const lasts: Record<'stops' | 'spots', StopsView | undefined> = {
    stops: undefined,
    spots: undefined,
  };
  /** The places whose own dot is drawn now, by layer (review 8H4H-3). */
  const drawnIds: Record<'stops' | 'spots', ReadonlySet<string>> = {
    stops: new Set(),
    spots: new Set(),
  };
  for (const layer of LAYERS) {
    const group = L.layerGroup().addTo(map);
    /**
     * The places of an answer as dots, but those whose own thing the parties draw in their place
     * (`unoccupied`: a Power Spot with a battle shows the battle, plan 8M-9A).
     */
    const draw = (view: StopsView): void => {
      group.clearLayers();
      const colour = theme().colours[layer.colour];
      const shown = unoccupied(view.stops, hooks?.occupied(layer.id) ?? new Set<string>());
      // While the Report button's step 2 picks them, each has a larger target to tap (R1-10).
      const picked = hooks?.forced(layer.id) === true;
      for (const place of shown) {
        const [id, lat, lon, title] = place;
        // Read as the popup opens: an address found since is in the tuple (`addressFound`).
        const address = (): string | null | undefined => place[4];
        const marker = L.circleMarker([lat, lon], {
          radius: 5,
          weight: 2,
          color: colour,
          fillOpacity: 0.7,
          // Ringed while the Report button's step 2 picks them (plan 8M-9A, `map.css`).
          className: layer.id === 'spots' ? 'spot-dot' : 'stop-dot',
        });
        // Opened by our own handler rather than bound, which would open it before anything of ours;
        // a Power Spot where a battle stands opens the battle (review B1).
        const open = (): void => {
          if (layer.id === 'spots' && hooks?.openBattle(id) === true) return;
          placePopup(layer.id, { id, title, lat, lon, address: address() });
        };
        const tapped = (): void => {
          if (hooks?.placeTapped)
            hooks.placeTapped(layer.id, { id, title, lat, lon, address: address() }, open);
          else open();
        };
        const targets = [
          marker,
          ...(picked
            ? [
                L.circleMarker([lat, lon], {
                  radius: PICKED_TARGET,
                  stroke: false,
                  fillOpacity: 0,
                  className: 'place-target',
                }),
              ]
            : []),
        ];
        for (const target of targets) {
          hoverName(map, target, title);
          // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
          // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
          if (layer.id === 'spots') {
            placeClicks(
              target,
              title,
              () => spotTapped({ id, title, lat, lon }),
              tapped,
              target === marker ? focus : undefined,
            );
          } else {
            target.on('click', (event: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(event);
              if (hooks?.stopTapped({ id, title, lat, lon }) !== true) tapped();
            });
          }
          target.addTo(group);
        }
      }
      registry.setCount(layer.id, shown.length);
      drawnIds[layer.id] = new Set(shown.map(([id]) => id));
      hooks?.drawn?.(layer.id);
    };
    redraws.push(() => {
      const last = lasts[layer.id];
      if (last) draw(last);
    });
    const loads = new StopLoads({
      load: async () => {
        const bounds = map.getBounds();
        const box = stopsBox({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        });
        const query = new URLSearchParams({
          south: String(box.south),
          west: String(box.west),
          north: String(box.north),
          east: String(box.east),
        });
        return layer.read(await getJson<unknown>(`${layer.url(guild)}?${query.toString()}`));
      },
      show: (view) => {
        lasts[layer.id] = view;
        draw(view);
        told(
          layer.id,
          view.stops.map(([id, lat, lon, title, address]) => ({ id, title, lat, lon, address })),
        );
      },
      more: (more) => {
        quiet.set(layer.id, more ? MORE_THAN_SHOWN[layer.id] : undefined);
      },
      failed: () => {
        told(layer.id, 'failed');
      },
      delayMs: 300,
      setTimer: (run, ms) => {
        const timer = window.setTimeout(run, ms);
        return () => {
          window.clearTimeout(timer);
        };
      },
    });
    const places = new PlacesInView({
      loads,
      clear: () => {
        lasts[layer.id] = undefined;
        group.clearLayers();
        quiet.set(layer.id, undefined);
        registry.setCount(layer.id, 0);
        drawnIds[layer.id] = new Set();
        hooks?.drawn?.(layer.id);
        told(layer.id, 'zoom');
      },
    });
    const wanted = (): boolean =>
      placesWanted(registry.isOn(layer.id), map.getZoom(), member(), hooks?.forced(layer.id));
    const moved = (): void => {
      places.changed(wanted(), true);
    };
    map.on('moveend', activity?.whenLive(moved) ?? moved);
    registry.onChange((id) => {
      if (id === layer.id) places.changed(wanted());
    });
    onThemeChange((drawn) => {
      group.eachLayer((marker) => {
        if (marker instanceof L.CircleMarker)
          marker.setStyle({ color: drawn.colours[layer.colour] });
      });
    });
    checks.push(() => {
      places.changed(wanted());
    });
  }
  const refresh = (): void => {
    for (const check of checks) check();
  };
  refresh();
  return {
    refresh,
    redrawn: () => {
      for (const redraw of redraws) redraw();
    },
    openSpot: (spot) => placePopup('spots', spot),
    openStop: (stop) => placePopup('stops', stop),
    onSpots: (listener) => {
      placeListeners.spots.push(listener);
    },
    onStops: (listener) => {
      placeListeners.stops.push(listener);
    },
    addressFound: (spotId, address) => {
      const place = lasts.spots?.stops.find(([id]) => id === spotId);
      if (place) place[4] = address;
    },
    spotDrawn: (spotId) => drawnIds.spots.has(spotId),
  };
}
