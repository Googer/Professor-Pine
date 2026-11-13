import { describe, expect, it } from 'vitest';
import {
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testRegions,
  WEST_CHANNEL,
  WIDE_CHANNEL,
  wideRegion,
} from '../../test/support/gyms.js';
import { regionsFixture, twoServerGyms } from '../../test/support/providers.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { stopRegionsInGuild } from '../services/region-directory.js';
import { stopsFrom, stopName } from './train-stops.js';

/**
 * Two servers whose regions overlap (plan 19B-3): the test server keeps Power Spot 1 in West;
 * the second keeps its own copy of 1 by another title and Power Spot 2 in West, which the test
 * server does not keep.
 */
async function twoServerSpots() {
  const regions = [...testRegions(), wideRegion()];
  const spot = (n: number, title: string) =>
    keptRow(n, { kind: 'powerspot', title, lat: 40.05 + n / 1000, lon: -80.05 });
  const { wayspots } = await wayspotsWith([spot(1, 'Gazebo')], regionsFixture(regions), undefined, [
    { guildId: OTHER_GUILD_ROW, rows: [spot(1, 'Gazebo of the Lake'), spot(2, 'Old Kiosk')] },
  ]);
  return { wayspots, regions: regionsFixture(regions), gyms: twoServerGyms().gyms };
}

const powerspot = (n: number) => ({ kind: 'powerspot' as const, id: wayspotId(n) });

describe('the stops of a route, each by its train’s server (plan 19B-3)', () => {
  it('names a Power Spot as the train’s server keeps it, and another server’s as unknown', async () => {
    const { wayspots, gyms } = await twoServerSpots();
    const home = stopsFrom(gyms, wayspots, TEST_GUILD_ROW);
    const away = stopsFrom(gyms, wayspots, OTHER_GUILD_ROW);
    expect(stopName(home(powerspot(1)))).toBe('Gazebo');
    expect(stopName(home(powerspot(2)))).toBe('Unknown Power Spot');
    // The second server's own: its copy of 1 by its own title, and 2.
    expect(stopName(away(powerspot(1)))).toBe('Gazebo of the Lake');
    expect(stopName(away(powerspot(2)))).toBe('Old Kiosk');
  });

  it('places a Power Spot stop in the regions of the server that keeps it alone', async () => {
    const { wayspots, gyms, regions } = await twoServerSpots();
    const places = { gyms, wayspots };
    const channels = (ref: ReturnType<typeof powerspot>, guildId: number) =>
      stopRegionsInGuild(places, regions, ref, guildId).map((region) => region.channelId);
    expect(channels(powerspot(1), TEST_GUILD_ROW)).toEqual([WEST_CHANNEL]);
    expect(channels(powerspot(2), TEST_GUILD_ROW)).toEqual([]);
    expect(channels(powerspot(2), OTHER_GUILD_ROW)).toEqual([WIDE_CHANNEL]);
  });
});
