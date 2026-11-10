/**
 * What `GET /s/<guild>/api/geo` answers (`geoView`), as the page reads it. Types alone, with no
 * import: the page's bundle (`src/web/client/`) takes them without the server's code.
 */

/** A place as the page reads it: `[lat, lon]`, six decimals (about 10 cm). */
export type Point = [number, number];

export interface GeoView {
  /** By name. `outline` is closed. */
  regions: Array<{ id: number; name: string; outline: Point[] }>;
  /** By id. `regionIds` are those of this server the gym lies in. */
  gyms: Array<{
    id: number;
    name: string;
    nickname: string | null;
    lat: number;
    lon: number;
    regionIds: number[];
    /** The address line (`addressLine`), or null when nothing of it is known. */
    address: string | null;
    description: string | null;
    /** What members should know before they go (access, hours). */
    notice: string | null;
  }>;
}
