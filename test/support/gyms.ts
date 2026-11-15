import type { Gym } from '../../src/db/repositories/gym-repository.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';

/** Channel ids of the invented regions: two squares side by side, and one without an outline. */
export const WEST_CHANNEL = '100000000000000001';
export const EAST_CHANNEL = '100000000000000002';
export const UNBOUNDED_CHANNEL = '100000000000000003';
/** The forums holding the party posts of West and East. */
export const WEST_FORUM = '100000000000000011';
export const EAST_FORUM = '100000000000000012';
/** The board posts (summary threads) of West and East in `boardedRegions` (plan 8R-9). */
export const WEST_BOARD = '100000000000000051';
export const EAST_BOARD = '100000000000000052';
/** The server's channels for copies of raids: those that can be joined remotely, those at elite raid gyms. */
export const REMOTE_CHANNEL = '100000000000000021';
export const ELITE_GYM_CHANNEL = '100000000000000022';

function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

/**
 * West covers longitudes -80.10 to -80.00, East -80.00 to -79.90, both latitudes 40.00 to 40.10.
 * Enlarged by half, each reaches 0.025 degrees into the other.
 */
export function testRegions(): Region[] {
  return [
    {
      id: 1,
      guildId: 1,
      channelId: WEST_CHANNEL,
      description: null,
      bounds: square(40.0, -80.1, 40.1, -80.0),
      forumChannelId: WEST_FORUM,
      summaryMessageId: null,
    },
    {
      id: 2,
      guildId: 1,
      channelId: EAST_CHANNEL,
      description: null,
      bounds: square(40.0, -80.0, 40.1, -79.9),
      forumChannelId: EAST_FORUM,
      summaryMessageId: null,
    },
    {
      id: 3,
      guildId: 1,
      channelId: UNBOUNDED_CHANNEL,
      description: null,
      bounds: null,
      forumChannelId: null,
      summaryMessageId: null,
    },
  ];
}

/** The outlines of West and East, as an export of a scan over them holds them. */
export function testOutlines(): LatLon[][] {
  return testRegions().flatMap((region) => (region.bounds === null ? [] : [region.bounds]));
}

/** A second server (the guild of row 2) and the channel of its one region, North. */
/** `testRegions` with West's and East's boards recorded (plan 8R-9, review W4). */
export function boardedRegions(): Region[] {
  const boards = new Map([
    [WEST_CHANNEL, WEST_BOARD],
    [EAST_CHANNEL, EAST_BOARD],
  ]);
  return testRegions().map((region) => ({
    ...region,
    summaryMessageId: boards.get(region.channelId) ?? region.summaryMessageId,
  }));
}

export const OTHER_GUILD_ID = '412345678901234568';
export const OTHER_GUILD_ROW = 2;
/** The row of the test server (`FAKE_GUILD_ID`), whose regions `testRegions()` are. */
export const TEST_GUILD_ROW = 1;

/**
 * The servers of the gyms (plan 19B-2): every gym given (the invented ones unless told
 * otherwise) belongs to the test server, as an installation of one server has them after the
 * upgrade (gym 10, in no region, too: nobody else's).
 */
export function testLinks(
  gyms: readonly { id: number }[] = testGyms(),
  guildId = TEST_GUILD_ROW,
): { gymId: number; guildId: number }[] {
  return gyms.map((gym) => ({ gymId: gym.id, guildId }));
}
export const NORTH_CHANNEL = '100000000000000004';
/** A place in North, far from every invented gym. */
export const NORTH_PLACE: LatLon = { lat: 40.25, lon: -80.05 };

/**
 * North, the region of the second server: latitudes 40.20 to 40.30 above West, touching
 * neither West nor East. It is not among `testRegions()`: a test that needs two servers adds
 * it (`withOtherServer` of gym-admin.ts).
 */
export function northRegion(): Region {
  return {
    id: 4,
    guildId: OTHER_GUILD_ROW,
    channelId: NORTH_CHANNEL,
    description: null,
    bounds: square(40.2, -80.1, 40.3, -80.0),
    forumChannelId: null,
    summaryMessageId: null,
  };
}

/** The channel of Wide, the second server's region over West and East (`wideRegion`). */
export const WIDE_CHANNEL = '100000000000000006';

/**
 * Wide, a region of the second server over West and East together (plan 19B-2: regions of two
 * servers overlap freely). Not among `testRegions()`: a test of two servers adds it.
 */
export function wideRegion(): Region {
  return {
    id: 6,
    guildId: OTHER_GUILD_ROW,
    channelId: WIDE_CHANNEL,
    description: null,
    bounds: square(40.0, -80.1, 40.1, -79.9),
    forumChannelId: null,
    summaryMessageId: null,
  };
}

function geodata(route: string, extra: Record<string, string> = {}): string {
  return JSON.stringify({
    addressComponents: {
      street_number: '12',
      route,
      locality: 'Pinewood',
      administrative_area_level_1: 'Pennsylvania',
      country: 'United States',
      postal_code: '15999',
      ...extra,
    },
  });
}

function gym(id: number, name: string, lat: number, lon: number, more: Partial<Gym> = {}): Gym {
  return {
    id,
    pogoId: null,
    name,
    lat,
    lon,
    nickname: null,
    description: null,
    keywords: [],
    notice: null,
    taggedEx: false,
    confirmedEx: false,
    imageUrl: null,
    sponsor: null,
    geodata: null,
    places: null,
    wayfarerAddress: null,
    nearestGym: null,
    ...more,
  };
}

/** A gym with these values and nothing else, for a test that needs one beside `testGyms()`. */
export const testGym = gym;

/**
 * Invented gyms of an invented town. Ids 1 to 6 and 11, 12 lie in West, 7 to 9 in East, 10 in
 * no region. Gym 4 is close enough to the border to be a neighbour for East, gym 7 for West.
 */
export function testGyms(): Gym[] {
  return [
    gym(1, 'Pinewood Public Library', 40.05, -80.05, {
      nickname: 'The Stacks',
      description: 'Mural of readers beside the front doors',
      geodata: geodata('Maple Avenue', { neighborhood: 'Old Town' }),
      places: 'Corner Bakery, Maple Dental',
    }),
    gym(2, 'Old Stone Fountain', 40.06, -80.06, {
      keywords: ['plaza', 'square'],
      geodata: geodata('Market Street'),
      places: 'Riverside Plaza, Cafe Luna',
    }),
    gym(3, "St. Mary's Church", 40.07, -80.07, { geodata: geodata('Church Lane') }),
    gym(4, 'Veterans Memorial Bridge', 40.05, -80.01, { geodata: geodata('River Road') }),
    gym(5, 'Starbucks', 40.02, -80.08, {
      geodata: geodata('Maple Avenue'),
      description: 'Sponsored gym',
    }),
    gym(6, 'Maple Leaf Mosaic', 40.03, -80.03, { geodata: geodata('Birch Street') }),
    gym(7, 'Harbor Lighthouse Mural', 40.05, -79.99, { geodata: geodata('Harbor Street') }),
    gym(8, 'Café Élan Fresco', 40.05, -79.92, { geodata: geodata('Harbor Street') }),
    gym(9, 'Starbucks', 40.08, -79.95, { geodata: geodata('Harbor Street') }),
    gym(10, 'Lakeview Trailhead', 40.5, -80.05, { geodata: 'not json' }),
    gym(11, 'Riverside Park Gazebo', 40.09, -80.09, {
      notice: 'Park closes at dusk',
      geodata: geodata('River Road'),
    }),
    gym(12, 'Pinewood Post Office Gym', 40.04, -80.04, { geodata: geodata('Market Street') }),
  ];
}
