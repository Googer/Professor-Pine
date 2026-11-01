import * as L from 'leaflet';
import { onThemeChange, theme } from './theme.js';
import type { LatLon } from './view.js';
import { STREET_ZOOM } from './view.js';
import { alreadyGranted, locationRefusal, type PermissionsLike } from './your-location.js';

/**
 * "Show where I am" on the live map (plan 8M-7): a button with a crosshair (bottom right, under
 * the zoom buttons' side) that asks the browser for the location only when pressed, then draws a
 * blue dot with a circle of its accuracy, centers the map on it and keeps it current
 * (`watchPosition`) while the page is open. Once the browser granted it, later visits show it
 * without asking (`startIfGranted`, which never asks). Refused or unavailable: one line under the
 * header (`say`), nothing else. Browsers share a location with https pages and with
 * `http://localhost`.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** The crosshair, as SVG of ours drawn in the button's own color (`currentColor`). */
function crosshair(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attributes: Record<string, string>): void => {
    const shape = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    shape.setAttribute('fill', 'none');
    shape.setAttribute('stroke', 'currentColor');
    shape.setAttribute('stroke-width', '2');
    svg.append(shape);
  };
  add('circle', { cx: '12', cy: '12', r: '7' });
  add('circle', { cx: '12', cy: '12', r: '2' });
  for (const d of ['M12 1v4', 'M12 19v4', 'M1 12h4', 'M19 12h4']) add('path', { d });
  return svg;
}

/** What the rest of the page asks of your location. */
export interface You {
  /** Where you are, once the browser said. */
  located(): LatLon | undefined;
  /** Starts showing it without asking, where the browser granted it already; the first fix. */
  startIfGranted(): Promise<LatLon | undefined>;
  /** Tells `listener` each new fix (the list's distances follow). */
  onMove(listener: (place: LatLon) => void): void;
}

export function showWhereYouAre(map: L.Map, say: (text: string) => void): You {
  let place: LatLon | undefined;
  let watching: number | undefined;
  /** The press that asked: the map is centered on the fix that answers it. */
  let centerNext = false;
  let firstFix: ((place: LatLon | undefined) => void) | undefined;
  const listeners: Array<(place: LatLon) => void> = [];
  const accuracy = L.circle([0, 0], {
    radius: 1,
    weight: 1,
    fillOpacity: 0.12,
    interactive: false,
  });
  const dot = L.circleMarker([0, 0], {
    radius: 7,
    weight: 3,
    fillOpacity: 1,
    interactive: false,
  });
  const paint = (): void => {
    const { you, youEdge } = theme().colours;
    accuracy.setStyle({ color: you, fillColor: you });
    dot.setStyle({ color: youEdge, fillColor: you });
  };
  paint();
  onThemeChange(paint);

  const fixed = (position: GeolocationPosition): void => {
    place = { lat: position.coords.latitude, lon: position.coords.longitude };
    const at = L.latLng(place.lat, place.lon);
    accuracy.setLatLng(at).setRadius(position.coords.accuracy);
    dot.setLatLng(at);
    if (!map.hasLayer(dot)) {
      accuracy.addTo(map);
      dot.addTo(map);
    }
    if (centerNext) {
      centerNext = false;
      map.setView(at, Math.max(map.getZoom(), STREET_ZOOM));
    }
    firstFix?.(place);
    firstFix = undefined;
    for (const listener of listeners) listener(place);
  };
  const failed = (error: GeolocationPositionError): void => {
    centerNext = false;
    firstFix?.(undefined);
    firstFix = undefined;
    say(locationRefusal(error.code));
    if (error.code === 1 && watching !== undefined) {
      navigator.geolocation.clearWatch(watching);
      watching = undefined;
    }
  };
  const watch = (): boolean => {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      say(locationRefusal('unsupported'));
      return false;
    }
    watching ??= navigator.geolocation.watchPosition(fixed, failed, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 30_000,
    });
    return true;
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'locate';
  button.title = 'Show where I am';
  button.setAttribute('aria-label', 'Show where I am');
  button.append(crosshair());
  L.DomEvent.disableClickPropagation(button);
  button.addEventListener('click', () => {
    if (place) {
      map.setView([place.lat, place.lon], Math.max(map.getZoom(), STREET_ZOOM));
      return;
    }
    centerNext = true;
    if (!watch()) centerNext = false;
  });
  const control = new L.Control({ position: 'bottomright' });
  control.onAdd = () => {
    const box = document.createElement('div');
    box.className = 'leaflet-control locate-control';
    box.append(button);
    return box;
  };
  control.addTo(map);

  return {
    located: () => place,
    async startIfGranted() {
      const permissions = (navigator as { permissions?: PermissionsLike }).permissions;
      if (!(await alreadyGranted(permissions))) return undefined;
      return new Promise((resolve) => {
        firstFix = resolve;
        if (!watch()) resolve(undefined);
      });
    },
    onMove(listener) {
      listeners.push(listener);
    },
  };
}
