import * as L from 'leaflet';
import type { AreaWords } from './activity.js';
import { inCellsOf } from './cluster.js';
import { ClusterLayer } from './cluster-layer.js';
import { shownGyms } from './gym-dots.js';
import { hoverName } from './hover-name.js';
import type { LayerRegistry } from './layer-registry.js';
import { GYM_DOT, gymClicks } from './party-layer.js';
import { gymPopup, popupMaxHeight, renderNode, type MapGym, type PopupWhere } from './popup.js';
import type { RouteFocus } from './route-focus.js';
import { stopName } from './train-forms.js';
import { heldContent } from './raid-forms.js';
import { onThemeChange, theme } from './theme.js';

/**
 * The gyms on the live map (plan 8M-7): the Gyms layer, drawn at every zoom and clustered below
 * street level by Pine's grid (`clustersAt`: a circle with its count, a tap zooms in on it); each
 * gym a dot whose popup is the gym's (`gymPopup`) with what the parties add (`extras`: "Report
 * raid" and the rest), opened by our own click handler (`gymClicks`: in route mode a click adds
 * the gym as a stop). Off by default since the Report button (plan 8M-9A, `MAP_LAYERS`); while "Find
 * a gym" holds a word its matches are drawn whatever the layer, and while a gym is to be clicked
 * (route mode, a meetup's place picked) every gym (`shownGyms`). The registry is told how many gyms are in view.
 */
export interface GymDots {
  /** Draws the gyms anew (the zoom, the layer, the filter or the parties changed). */
  refresh(): void;
  /** The dot of a gym, made on first use. */
  dot(gym: MapGym): L.CircleMarker;
  /** A gym's own popup opened, its dot drawn for it; the popup's element. */
  open(gym: MapGym): HTMLElement | undefined;
  /** The clusters named anew: what the Activity layer says of them changed (review R3). */
  names(): void;
}

export interface GymDotsDeps {
  map: L.Map;
  gyms: readonly MapGym[];
  /** Where the reader is, for how far a gym is, as its popup opens. */
  where(): PopupWhere;
  registry: LayerRegistry;
  filter: HTMLInputElement;
  /** What a gym's popup shows beyond the gym: "Report raid" and the rest, for a member. */
  extras(gym: MapGym): HTMLElement[];
  /** A form is open in the popup that is open: its content is held. */
  editing(): boolean;
  /** A gym clicked: true when route mode or a place picked took it (no popup). */
  clicked(gym: MapGym): boolean;
  /** A gym is to be clicked: every gym is drawn. */
  forced(): boolean;
  /** The gyms not drawn as dots: a gym with a raid shows the raid (plan 8M-7, `hiddenGyms`). */
  hidden(): ReadonlySet<number>;
  /** The gyms' dots as Tab stops in route mode only (re-review N1); left out: never. */
  focus?: Pick<RouteFocus, 'watch'>;
  /** A gym's dot tapped: the list of the things at its place, or `own`, its own popup. */
  tapped(gym: MapGym, own: () => void): void;
  /**
   * Whether the box is "Find a gym", which thins the dots to the gyms it finds; false for a
   * member's Find (plan 8M-12: the map stays as it is while typing). Left out: always.
   */
  thins?: () => boolean;
  /**
   * What a mouse over a cluster shows of its gyms (plan 8H-4H: their parties while the Activity
   * layer is on, `ActivityCounts.area`); none: nothing. Its badge counts gyms whatever it says.
   */
  area?: (gyms: readonly MapGym[]) => AreaWords | undefined;
  /** Whether the Activity layer has counts now: nothing is worked out without (review R4). */
  counting?: () => boolean;
}

/** A cluster's title (the first of its words on hover and in its `aria-label`). */
const gymsTitle = (count: number): string => `${String(count)} gyms`;

export function showGymDots(deps: GymDotsDeps): GymDots {
  const { map, registry } = deps;
  const group = L.layerGroup().addTo(map);
  const dots = new Map<number, L.CircleMarker>();
  /** The gym whose popup is open. */
  let open: number | undefined;

  const dot = (gym: MapGym): L.CircleMarker => {
    const made = dots.get(gym.id);
    if (made) return made;
    const marker = L.circleMarker([gym.lat, gym.lon], {
      ...GYM_DOT,
      color: theme().colours.gym,
      fillOpacity: 0.8,
      // Ringed while the Report button's step 2 picks gyms (plan 8M-9A, `map.css`).
      className: 'gym-dot',
    }).bindPopup(
      heldContent(
        () => {
          const popup = renderNode(gymPopup(gym, deps.where()), document);
          popup.append(...deps.extras(gym));
          return popup;
        },
        () => deps.editing(),
      ),
      { maxHeight: popupMaxHeight(map) },
    );
    // In route mode a click (or Enter on the dot, a Tab stop then: `focus`) adds the gym as a
    // stop: its popup is not opened.
    deps.focus?.watch(marker, stopName(gym, String(gym.id)));
    hoverName(map, marker, gym.name);
    gymClicks(
      marker,
      () => deps.clicked(gym),
      () => {
        deps.tapped(gym, () => marker.openPopup());
      },
    );
    // The open gym is never taken away nor clustered (`wantedDots`); once closed, drawn as wanted.
    marker.on('popupopen', () => {
      open = gym.id;
    });
    marker.on('popupclose', () => {
      if (open === gym.id) open = undefined;
      window.setTimeout(refresh, 0);
    });
    dots.set(gym.id, marker);
    return marker;
  };

  /** The gyms a raid's marker hides, as last drawn: they count in their cluster's sum (review P7). */
  let hiddenSeen: ReadonlySet<number> = new Set();
  let underRaids: MapGym[] = [];

  /**
   * The gyms' dots and clusters (`ClusterLayer`, shared with the region editor's places, plan
   * 8M-11C review C1).
   */
  const clusters = new ClusterLayer<MapGym>(map, group, {
    className: '',
    title: gymsTitle,
    dot,
    // Its area's parties: its gyms and those of its cells a raid's marker hides (review P7).
    hover: (points) => {
      if (deps.area === undefined || deps.counting?.() === false) return undefined;
      return deps.area([...points, ...inCellsOf(points, underRaids, map.getZoom())]);
    },
  });

  /**
   * Draws what is wanted for the view and a margin (`wantedDots`), touching only the difference
   * (`planDots`): a pan or a new list of parties does not draw every gym anew, the dot whose popup
   * is open is never taken off (fix round 1), a cluster whose gyms changed changes its count and
   * place in place, and one no longer wanted gives its marker to a new one (plan 8M-11B, S13).
   */
  /** The words that thin the dots: "Find a gym"'s, none for a member's Find (plan 8M-12). */
  const thinning = (): string => ((deps.thins?.() ?? true) ? deps.filter.value : '');
  const refresh = (): void => {
    const hidden = deps.hidden();
    // The gyms under raids, for the clusters' sums, worked out again only when they changed (R4).
    if (hidden.size !== hiddenSeen.size || [...hidden].some((id) => !hiddenSeen.has(id))) {
      hiddenSeen = new Set(hidden);
      underRaids = deps.gyms.filter((gym) => hidden.has(gym.id));
    }
    const shown = shownGyms(deps.gyms, {
      on: registry.isOn('gyms'),
      filter: thinning(),
      forced: deps.forced(),
    }).filter((gym) => !hidden.has(gym.id));
    const bounds = map.getBounds();
    const view = {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    };
    clusters.draw(shown, view, map.getZoom(), open);
    registry.setCount('gyms', shown.filter((gym) => bounds.contains([gym.lat, gym.lon])).length);
  };

  map.on('moveend', refresh);
  registry.onChange((id) => {
    // A gym with a raid shows its raid while the raids are shown, its dot while they are not.
    if (id === 'gyms' || id === 'raids') refresh();
  });
  onThemeChange(({ colours }) => {
    for (const marker of dots.values()) marker.setStyle({ color: colours.gym });
  });

  deps.filter.addEventListener('input', () => {
    // A member's keystroke is Find's: the dots are as the layer says (plan 8M-12, review F2).
    if (deps.thins?.() === false) return;
    // A search with the Gyms layer off turns it on, ticked in the layers' menu, which draws its
    // matches (fix round 1 of 8M-13, Matt's A); not while a gym is to be clicked, which shows
    // every gym whatever the layer says.
    if (thinning().trim() !== '' && !registry.isOn('gyms') && !deps.forced()) {
      registry.set('gyms', true);
      return;
    }
    refresh();
  });
  deps.filter.addEventListener('keydown', (event) => {
    // A member's Enter is Find's (plan 8M-12).
    if (event.key !== 'Enter' || thinning() === '') return;
    // The matches drawn: none while the Gyms layer hides them (plan 8M-13, L2).
    const matches = shownGyms(deps.gyms, {
      on: registry.isOn('gyms'),
      filter: thinning(),
      forced: deps.forced(),
    });
    if (matches.length === 0) return;
    map.fitBounds(L.latLngBounds(matches.map((gym) => [gym.lat, gym.lon])), {
      maxZoom: 17,
      padding: [40, 40],
    });
    const [only] = matches;
    if (matches.length === 1 && only) {
      // Once the map rests at the gym, where its dot is drawn on its own.
      map.once('moveend', () => {
        if (group.hasLayer(dot(only))) dot(only).openPopup();
      });
    }
  });
  /**
   * A gym's own popup opened (the Report button's step 3 of a raid, plan 8M-9A), its dot drawn for
   * it whatever the layer says: the open gym is kept on its own (`wantedDots`) once open.
   */
  const openGym = (gym: MapGym): HTMLElement | undefined => {
    const marker = dot(gym);
    clusters.keep(gym);
    marker.openPopup();
    return marker.getPopup()?.getElement();
  };
  return {
    refresh,
    dot,
    open: openGym,
    names: () => {
      clusters.names();
    },
  };
}
