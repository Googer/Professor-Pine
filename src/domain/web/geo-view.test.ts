import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  testGym,
  testGyms,
  testRegions,
  WEST_CHANNEL,
} from '../../../test/support/gyms.js';
import { geoView, type GeoInput } from './geo-view.js';

/** The invented server: West and East (and a region without an outline), its gyms by box. */
function input(more: Partial<GeoInput> = {}): GeoInput {
  const regions = testRegions();
  const lying = (gym: { lat: number; lon: number }): string[] =>
    gym.lat < 40 || gym.lat > 40.1
      ? []
      : gym.lon < -80
        ? [WEST_CHANNEL]
        : gym.lon > -80
          ? [EAST_CHANNEL]
          : [WEST_CHANNEL, EAST_CHANNEL];
  const gyms = testGyms();
  return {
    regions,
    channelNames: new Map([
      [WEST_CHANNEL, 'west-end'],
      [EAST_CHANNEL, 'east-side'],
    ]),
    gyms,
    regionsOf: (id) => {
      const gym = gyms.find((one) => one.id === id);
      return gym ? lying(gym) : [];
    },
    ...more,
  };
}

describe('geoView', () => {
  it('gives the regions with an outline, named by their channels, the outline as [lat, lon]', () => {
    const view = geoView(input());
    expect(view.regions.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 2, name: 'east-side' },
      { id: 1, name: 'west-end' },
    ]);
    expect(view.regions[1]?.outline).toEqual([
      [40, -80.1],
      [40.1, -80.1],
      [40.1, -80],
      [40, -80],
      [40, -80.1],
    ]);
  });

  it('names a region whose channel the bot does not see by its number', () => {
    const view = geoView(input({ channelNames: new Map([[WEST_CHANNEL, 'west-end']]) }));
    expect(view.regions.map((region) => region.name)).toEqual(['Region 2', 'west-end']);
  });

  it("gives the gyms in the server's regions, with the regions each lies in", () => {
    const view = geoView(input());
    expect(view.gyms.map((gym) => gym.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    expect(view.gyms.find((gym) => gym.id === 8)?.regionIds).toEqual([2]);
    expect(view.gyms.find((gym) => gym.id === 1)).toEqual({
      id: 1,
      name: 'Pinewood Public Library',
      nickname: 'The Stacks',
      lat: 40.05,
      lon: -80.05,
      regionIds: [1],
      address: '12 Maple Avenue, Pinewood, Pennsylvania 15999',
      description: 'Mural of readers beside the front doors',
      notice: null,
    });
    expect(view.gyms.find((gym) => gym.id === 11)?.notice).toBe('Park closes at dusk');
  });

  it('leaves out the gyms of no region of the server, and the regions of other servers', () => {
    const regions = testRegions().map((region) =>
      region.channelId === EAST_CHANNEL ? { ...region, guildId: 2 } : region,
    );
    const view = geoView(input({ regions: regions.filter((region) => region.guildId === 1) }));
    expect(view.regions.map((region) => region.id)).toEqual([1]);
    expect(view.gyms.map((gym) => gym.id)).toEqual([1, 2, 3, 4, 5, 6, 11, 12]);
  });

  it('marks no gym as an elite raid gym, whatever its flags, and rounds places to six decimals', () => {
    const gyms = [
      testGym(20, 'Tagged', 40.012345678, -80.012345649, { taggedEx: true }),
      testGym(21, 'Confirmed', 40.02, -80.02, { confirmedEx: true }),
      testGym(22, 'Plain', 40.03, -80.03),
    ];
    const view = geoView(input({ gyms, regionsOf: () => [WEST_CHANNEL] }));
    expect(view.gyms.map((gym) => gym.id)).toEqual([20, 21, 22]);
    expect(view.gyms.filter((gym) => 'elite' in gym)).toEqual([]);
    expect(view.gyms[0]).toMatchObject({ lat: 40.012346, lon: -80.012346, address: null });
  });

  it('is empty for a server without regions', () => {
    expect(geoView(input({ regions: [] }))).toEqual({ regions: [], gyms: [] });
  });
});
