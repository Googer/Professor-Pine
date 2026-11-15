import { describe, expect, it } from 'vitest';
import {
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testRegions,
  WEST_CHANNEL,
  WIDE_CHANNEL,
  wideRegion,
} from '../../test/support/gyms.js';
import { regionsFixture } from '../../test/support/providers.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { regionSpotChoices } from './place-option.js';

describe('regionSpotChoices in two servers whose regions overlap (plan 19B-3)', () => {
  it('offers a region’s Power Spots of its own server alone', async () => {
    const regions = [...testRegions(), wideRegion()];
    const spot = (n: number, title: string) =>
      keptRow(n, { kind: 'powerspot', title, lat: 40.05 + n / 1000, lon: -80.05 });
    const { wayspots } = await wayspotsWith(
      [spot(1, 'Gazebo')],
      regionsFixture(regions),
      undefined,
      [{ guildId: OTHER_GUILD_ROW, rows: [spot(2, 'Old Kiosk')] }],
    );
    const ctx = { wayspots };
    // Old Kiosk lies in West: the second server's alone.
    expect(regionSpotChoices(ctx, TEST_GUILD_ROW, WEST_CHANNEL).map((one) => one.value)).toEqual([
      `powerspot:${wayspotId(1)}`,
    ]);
    expect(regionSpotChoices(ctx, OTHER_GUILD_ROW, WIDE_CHANNEL).map((one) => one.name)).toEqual([
      'Old Kiosk (Power Spot)',
    ]);
    expect(regionSpotChoices(ctx, undefined, WEST_CHANNEL)).toEqual([]);
  });
});
