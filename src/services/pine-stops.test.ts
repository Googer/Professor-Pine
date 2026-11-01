import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { OTHER_GUILD_ID, WEST_CHANNEL } from '../../test/support/gyms.js';
import { newPineStop, STAFF } from '../../test/support/pine-stop-cases.js';
import { MemoryPineStops } from '../../test/support/pine-stops.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { PineStopService } from './pine-stops.js';
import { PlaceFinder, readPlaceValue } from './place-finder.js';

/** A sponsored stop in West (server row 1), near a kept stop called Yellow Mural. */
async function stopsWith(stored = new MemoryPineStops()) {
  const { wayspots } = await wayspotsWith([
    keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06 }),
  ]);
  const { log } = createTestLogger();
  const stops = new PineStopService({
    storage: stored,
    wayspots,
    guilds: {
      idFor: (serverId) =>
        Promise.resolve(
          serverId === FAKE_GUILD_ID ? 1 : serverId === OTHER_GUILD_ID ? 2 : undefined,
        ),
    },
    log,
  });
  const finder = new PlaceFinder({ gyms: gymsFixture(), wayspots, regions: regionsFixture(), log });
  await stops.load();
  await finder.built();
  return { stored, stops, wayspots, finder };
}

const coffee = newPineStop({ serverId: FAKE_GUILD_ID, lat: 40.0601, lon: -80.0601 });

describe('PineStopService', () => {
  it('adds a stop that every stop search of its server finds, by value and as a pin’s name', async () => {
    const { stops, finder, wayspots } = await stopsWith();
    const generation = wayspots.generation;
    const made = await stops.add(coffee);
    expect(wayspots.generation).toBeGreaterThan(generation);
    await finder.built();
    const found = finder.find(1, WEST_CHANNEL, 'coffee corner', ['stop']);
    expect(found.map((one) => [one.kind, one.id, one.title])).toEqual([
      ['stop', `pine-${String(made.id)}`, 'Coffee Corner (sponsored)'],
    ]);
    expect(found[0]?.address).toBe('12 Market Street');
    expect(readPlaceValue(`stop:pine-${String(made.id)}`)).toEqual({
      kind: 'stop',
      id: `pine-${String(made.id)}`,
    });
    expect(finder.chosen(1, `stop:pine-${String(made.id)}`)?.title).toBe(
      'Coffee Corner (sponsored)',
    );
    expect(finder.pin(1, { lat: 40.0602, lon: -80.0601 }, null)?.near).toEqual({
      kind: 'stop',
      title: 'Coffee Corner (sponsored)',
    });
    // Another server finds none of it.
    expect(finder.find(2, undefined, 'coffee corner')).toEqual([]);
    expect(finder.chosen(2, `stop:pine-${String(made.id)}`)).toBeUndefined();
  });

  it('names the PokéStops a new stop of a server would stand beside: imported ones and its own', async () => {
    const { stops } = await stopsWith();
    await stops.add(newPineStop({ serverId: OTHER_GUILD_ID, lat: 40.06, lon: -80.0601 }));
    const own = await stops.add(
      newPineStop({ serverId: FAKE_GUILD_ID, lat: 40.06, lon: -80.0603 }),
    );
    const near = stops.nearStops({ lat: 40.06, lon: -80.0601 }, FAKE_GUILD_ID);
    expect(near.map(({ wayspot }) => wayspot.id)).toEqual([wayspotId(1), `pine-${String(own.id)}`]);
    expect(stops.nearStops({ lat: 40.07, lon: -80.07 }, FAKE_GUILD_ID)).toEqual([]);
  });

  it('changes and removes a stop of its own server, and the search follows', async () => {
    const { stops, finder } = await stopsWith();
    const made = await stops.add(coffee);
    expect(await stops.edit(made.id, OTHER_GUILD_ID, { name: 'Tea House' }, STAFF, 2)).toBe(
      undefined,
    );
    await stops.edit(made.id, FAKE_GUILD_ID, { name: 'Tea House' }, STAFF, 2);
    await finder.built();
    expect(finder.find(1, WEST_CHANNEL, 'tea house').map((one) => one.title)).toEqual([
      'Tea House',
    ]);
    expect(stops.get(FAKE_GUILD_ID, `pine-${String(made.id)}`)?.name).toBe('Tea House');
    expect(stops.get(OTHER_GUILD_ID, made.id)).toBeUndefined();
    expect(await stops.remove(made.id, FAKE_GUILD_ID, STAFF)).toMatchObject({ name: 'Tea House' });
    await finder.built();
    expect(finder.find(1, WEST_CHANNEL, 'tea house')).toEqual([]);
    expect(stops.ofServer(FAKE_GUILD_ID)).toEqual([]);
  });

  it('reads the stops kept at start', async () => {
    const stored = new MemoryPineStops();
    await stored.add(coffee);
    const { stops, finder } = await stopsWith(stored);
    expect(stops.ofServer(FAKE_GUILD_ID).map((stop) => stop.name)).toEqual([
      'Coffee Corner (sponsored)',
    ]);
    expect(stops.ofGuildRow(1)).toHaveLength(1);
    expect(stops.ofGuildRow(2)).toEqual([]);
    expect(finder.find(1, WEST_CHANNEL, 'coffee', ['stop'])).toHaveLength(1);
  });
});
