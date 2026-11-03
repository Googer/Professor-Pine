import * as L from 'leaflet';

/** Whether this device's pointer hovers: a mouse or a trackpad, not a finger alone. */
const deviceHovers = (): boolean => window.matchMedia('(hover: hover)').matches;

/** What a hover name needs of a dot. */
export type Named = Pick<L.CircleMarker, 'on' | 'getLatLng' | 'isPopupOpen'>;

/**
 * A place's name over its dot while a mouse is on it (Matt, 2026-11-02): a gym, a PokéStop or a
 * Power Spot, so that one sees which it is before clicking, in the Report button's step 2 too. Only
 * where the pointer hovers (`(hover: hover)`), shown while no popup of the dot is open and closed
 * by a click: the tap opens the popup as before, and a touch device loses nothing, since the name
 * is the popup's first line. Not Leaflet's `bindTooltip`, which opens its tooltip on a click too,
 * beside the popup. The name goes in as a node: Leaflet takes a string as HTML.
 */
export function hoverName(
  map: L.Map,
  dot: Named,
  name: string,
  hovers: () => boolean = deviceHovers,
): void {
  let shown: L.Tooltip | undefined;
  const hide = (): void => {
    shown?.remove();
    shown = undefined;
  };
  dot.on('mouseover', () => {
    if (shown !== undefined || !hovers() || dot.isPopupOpen()) return;
    const words = document.createElement('span');
    words.textContent = name;
    shown = L.tooltip({ direction: 'top', offset: [0, -6], className: 'hover-name' })
      .setLatLng(dot.getLatLng())
      .setContent(words)
      .openOn(map);
  });
  for (const type of ['mouseout', 'click', 'popupopen', 'remove']) dot.on(type, hide);
}
