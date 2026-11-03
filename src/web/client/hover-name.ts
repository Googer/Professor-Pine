import * as L from 'leaflet';

/** Whether this device's pointer hovers: a mouse or a trackpad, not a finger alone. */
const deviceHovers = (): boolean => window.matchMedia('(hover: hover)').matches;

/** What a hover name needs of a dot. */
export type Named = Pick<L.CircleMarker, 'on' | 'getLatLng'>;

/** What a hover name needs of the map: its popups opening and closing. */
export type NamesMap = Pick<L.Map, 'on'>;

/** A map's hover name shown now, of which dot, and where its open popup stands. */
interface MapNames {
  shown: { dot: Named; tip: L.Tooltip } | undefined;
  popupAt: L.LatLng | undefined;
}

const names = new WeakMap<NamesMap, MapNames>();

/**
 * The pointer last used on the page (review H2): `(hover: hover)` says what the device's main
 * pointer can do, not what was used, so a finger's tap on a touch laptop, whose compatibility
 * `mouseover` would show the name beside the popup, is told apart by its `pointerType`.
 */
let lastPointer = 'mouse';
let watching = false;
const watchPointer = (): void => {
  if (watching) return;
  watching = true;
  const seen = (event: PointerEvent): void => {
    lastPointer = event.pointerType;
  };
  document.addEventListener('pointerdown', seen, true);
  document.addEventListener('pointermove', seen, true);
};

/** The map's state, its popups watched once (a standalone popup opens no `popupopen` on a dot). */
function namesOf(map: NamesMap): MapNames {
  const made = names.get(map);
  if (made) return made;
  const state: MapNames = { shown: undefined, popupAt: undefined };
  names.set(map, state);
  map.on('popupopen', (event: L.PopupEvent) => {
    state.shown?.tip.remove();
    state.shown = undefined;
    state.popupAt = event.popup.getLatLng() ?? undefined;
  });
  map.on('popupclose', () => {
    state.popupAt = undefined;
  });
  return state;
}

/**
 * A place's name over its dot while a mouse is on it (Matt, 2026-11-02): a gym, a PokéStop or a
 * Power Spot, so that one sees which it is before clicking, in the Report button's step 2 too. Only
 * where the device's pointer hovers (`(hover: hover)`) and the pointer last used is a mouse; never
 * while the map's popup stands at the dot; closed by a press (`mousedown`: the dots' click handlers
 * are taken off and set anew by `gymClicks`) and by any popup opening (a stop's or Power Spot's
 * popup is the map's own, not the dot's). A touch device loses nothing: the name is the popup's
 * first line. Not Leaflet's `bindTooltip`, which opens its tooltip on a click too, beside the
 * popup. The name goes in as a node: Leaflet takes a string as HTML.
 */
export function hoverName(
  map: NamesMap,
  dot: Named,
  name: string,
  hovers: () => boolean = deviceHovers,
): void {
  const state = namesOf(map);
  watchPointer();
  const hide = (): void => {
    if (state.shown?.dot !== dot) return;
    state.shown.tip.remove();
    state.shown = undefined;
  };
  dot.on('mouseover', () => {
    if (state.shown?.dot === dot || lastPointer !== 'mouse' || !hovers()) return;
    const at = dot.getLatLng();
    if (state.popupAt?.equals(at) === true) return;
    state.shown?.tip.remove();
    const words = document.createElement('span');
    words.textContent = name;
    const tip = L.tooltip({ direction: 'top', offset: [0, -6], className: 'hover-name' })
      .setLatLng(at)
      .setContent(words)
      .openOn(map as L.Map);
    state.shown = { dot, tip };
  });
  for (const type of ['mouseout', 'mousedown', 'remove']) dot.on(type, hide);
}
