import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Party } from '../../src/domain/party/party.js';
import { RegionAdminService, type RegionStaff } from '../../src/services/region-admin-service.js';
import { gymAdminWith, OTHER_STAFF, STAFF } from './gym-admin.js';
import {
  EAST_CHANNEL,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
} from './gyms.js';
import type { Outliving } from './party-service.js';

/** A text channel of the fakes' server that is no region, and the category it is in. */
export const SOUTH_CHANNEL = '100000000000000005';
export const TOWN_CATEGORY = '100000000000000041';

/** A staff member of the fakes' server (the guild of row 1). */
export const REGION_STAFF: RegionStaff = {
  staffId: STAFF,
  guildId: 1,
  server: '412345678901234567',
  mayManageChannels: true,
};
/** A staff member of the second server (the guild of row 2). */
export const OTHER_REGION_STAFF: RegionStaff = {
  staffId: OTHER_STAFF,
  guildId: OTHER_GUILD_ROW,
  server: OTHER_GUILD_ID,
  mayManageChannels: true,
};

/** A closed square, as the invented regions are. */
export function squareRing(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

/** The outline of West as it is, and of a strip south of West and East that holds no gym. */
export const WEST_RING = squareRing(40.0, -80.1, 40.1, -80.0);
export const SOUTH_RING = squareRing(39.9, -80.1, 40.0, -79.9);
/** The western half of West: the Library (gym 1) lies in it, the Bridge (gym 4) does not. */
export const WEST_HALF_RING = squareRing(40.0, -80.1, 40.1, -80.045);

/** An area of a file, as `readKml` gives it. */
export function kmlArea(name: string, outline: LatLon[], more: Partial<KmlArea> = {}): KmlArea {
  return { name, description: null, outline, holes: false, ...more };
}

/**
 * Region administration over fakes, with everything `gymAdminWith` gives over the same gyms,
 * regions and lock: the invented regions West, East and the one without an outline, whose
 * channels the fake server has as `west`, `east` and `unbounded` (in the category `Town`), a
 * text channel `south` that is no region, and the forums of West and East. What goes with a
 * region's row in the database (its saved routes, the region of its parties' rows) goes with
 * it here too.
 */
export async function regionAdminWith(parties: readonly Party[] = [], kept?: Partial<Outliving>) {
  const made = await gymAdminWith(parties, kept);
  const { gateway, regions } = made;
  gateway.addChannel(TOWN_CATEGORY, 'Town', { kind: 'category' });
  gateway.addChannel(WEST_CHANNEL, 'west', { categoryId: TOWN_CATEGORY });
  gateway.addChannel(EAST_CHANNEL, 'east', { categoryId: TOWN_CATEGORY });
  gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: TOWN_CATEGORY });
  gateway.addChannel(SOUTH_CHANNEL, 'south');
  regions.cascade = { routes: made.routes, parties: made.storage };
  const regionAdmin = new RegionAdminService({
    lock: made.lock,
    storage: regions,
    regions,
    gyms: made.directory,
    store: made.store,
    posts: made.service,
    routes: made.routes,
    gateway,
    settings: made.settings,
    log: made.log,
  });
  return { ...made, regionAdmin };
}
