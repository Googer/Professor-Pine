/**
 * Your location on the live map (plan 8M-7), the parts that need no Leaflet: whether the browser
 * granted it already (asked of `navigator.permissions`, which never asks the member: the page
 * never asks for the location on load), and the one line said when it is refused or unavailable.
 * The button "Show where I am", the blue dot and `watchPosition` are `you-ui.ts`.
 */

/** What the page needs of `navigator.permissions`. */
export interface PermissionsLike {
  query(descriptor: { name: 'geolocation' }): Promise<{ state: string }>;
}

/**
 * Whether the browser granted this page the location already, so that it is shown without
 * asking; false where it cannot say.
 */
export async function alreadyGranted(permissions: PermissionsLike | undefined): Promise<boolean> {
  if (!permissions) return false;
  try {
    return (await permissions.query({ name: 'geolocation' })).state === 'granted';
  } catch {
    return false;
  }
}

/** Said when the member refused to share the location. */
export const LOCATION_DENIED = 'Your browser did not share your location.';

/**
 * Why the location is not shown, in one line: refused (`GeolocationPositionError` code 1),
 * unavailable or too slow (2, 3), or a browser or page that cannot share it (no geolocation, or
 * plain http on another machine than this one).
 */
export function locationRefusal(code: number | 'unsupported'): string {
  if (code === 'unsupported') return 'This browser cannot share your location with this page.';
  return code === 1 ? LOCATION_DENIED : 'Your location is not available just now.';
}
