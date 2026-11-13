import { describe, expect, it } from 'vitest';
import { OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../../test/support/gyms.js';
import { regionsFixture, twoServerGyms } from '../../test/support/providers.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { wayspotsInBox, wayspotsNear } from './wayspot-box.js';

/**
 * The map's lists of stops (`/api/stops`, the nearby stops) over two servers whose regions
 * overlap (plan 19B-3): the test server keeps a stop called Fountain in West; the second server,
 * whose Wide lies over West, keeps its own copy of it (Fountain Plaza) and a stop of its own,
 * Bench, the test server does not have.
 */
async function twoServers() {
  const { regions } = twoServerGyms();
  const { wayspots } = await wayspotsWith(
    [keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601 })],
    regionsFixture(regions),
    undefined,
    [
      {
        guildId: OTHER_GUILD_ROW,
        rows: [
          keptRow(1, { title: 'Fountain Plaza', lat: 40.0601, lon: -80.0601 }),
          keptRow(2, { title: 'Bench', lat: 40.0602, lon: -80.0602 }),
        ],
      },
    ],
  );
  return { regions: regionsFixture(regions), wayspots };
}

const BOX = { south: 40.05, west: -80.07, north: 40.07, east: -80.05 };
const titles = (rows: readonly (readonly [string, number, number, string, string | null])[]) =>
  rows.map(([, , , title]) => title);

describe('the map’s lists of stops in two servers (plan 19B-3)', () => {
  it('lists the server’s own stops alone, by its own titles', async () => {
    const ctx = await twoServers();
    expect(titles(wayspotsInBox(ctx, TEST_GUILD_ROW, BOX, 'stop', 10).found)).toEqual(['Fountain']);
    expect(
      titles(wayspotsNear(ctx, TEST_GUILD_ROW, { lat: 40.06, lon: -80.06 }, 'stop', 5)),
    ).toEqual(['Fountain']);
  });

  it('lists the other server’s own there (positive control)', async () => {
    const ctx = await twoServers();
    expect(titles(wayspotsInBox(ctx, OTHER_GUILD_ROW, BOX, 'stop', 10).found).sort()).toEqual([
      'Bench',
      'Fountain Plaza',
    ]);
    expect(
      titles(wayspotsNear(ctx, OTHER_GUILD_ROW, { lat: 40.06, lon: -80.06 }, 'stop', 5)).sort(),
    ).toEqual(['Bench', 'Fountain Plaza']);
  });
});
