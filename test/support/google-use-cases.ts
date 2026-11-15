import { expect, it } from 'vitest';
import type { GoogleUse } from '../../src/services/google-use.js';

/**
 * What the counts of questions to Google do, run against the repository and its twin alike.
 * `made` gives fresh counts; `legacy` writes a day of the old count of gyms (`GymLookupDay`);
 * `servers` two servers' `Guild` rows that exist.
 */
export function googleUseCases(
  made: () => Promise<{
    use: GoogleUse;
    legacy: (day: string, gyms: number) => Promise<void>;
    servers: readonly [number, number];
  }>,
): void {
  it('counts what a server asked beside the instance’s count, per server and summed over the days asked (plan 19B-5)', async () => {
    const { use, servers } = await made();
    const [home, away] = servers;
    await use.use('2026-10-25', 'places', home);
    await use.use('2026-10-25', 'places', home);
    await use.use('2026-10-26', 'places', home);
    await use.use('2026-10-25', 'geocode', home);
    await use.use('2026-10-25', 'map', home);
    await use.use('2026-10-25', 'places', away);
    await use.use('2026-10-26', 'hand', away);
    // A question of no server (a lookup by hand's own) counts for the instance alone.
    await use.use('2026-10-25', 'places');
    await use.use('2026-11-01', 'places', home);
    const days = ['2026-10-25', '2026-10-26'];
    expect(await use.usedOn(days)).toEqual(
      new Map([
        ['2026-10-25', { places: 4, geocodes: 1, byHand: 0, maps: 1 }],
        ['2026-10-26', { places: 1, geocodes: 0, byHand: 1, maps: 0 }],
      ]),
    );
    expect(await use.serversUsedOn(days)).toEqual(
      new Map([
        [home, { places: 3, geocodes: 1, byHand: 0, maps: 1 }],
        [away, { places: 1, geocodes: 0, byHand: 1, maps: 0 }],
      ]),
    );
    expect(await use.serversUsedOn(days, away)).toEqual(
      new Map([[away, { places: 1, geocodes: 0, byHand: 1, maps: 0 }]]),
    );
    expect(await use.serversUsedOn(['2026-10-27'], home)).toEqual(new Map());
    expect(await use.serversUsedOn([])).toEqual(new Map());
    // One kind of every server (fix round 4, R4): the floors' read.
    expect(await use.serversCountedOn(days, 'places')).toEqual(
      new Map([
        [home, 3],
        [away, 1],
      ]),
    );
    expect(await use.serversCountedOn(days, 'hand')).toEqual(new Map([[away, 1]]));
    expect(await use.serversCountedOn(['2026-10-27'], 'map')).toEqual(new Map());
    expect(await use.serversCountedOn([], 'map')).toEqual(new Map());
  });

  it('counts the questions per day and kind, with the old count of gyms as places', async () => {
    const { use, legacy } = await made();
    expect(await use.usedOn(['2026-10-25'])).toEqual(new Map());
    await use.use('2026-10-25', 'places');
    await use.use('2026-10-25', 'places');
    await use.use('2026-10-25', 'geocode');
    await use.use('2026-10-26', 'geocode');
    await legacy('2026-10-24', 40);
    await legacy('2026-10-25', 3);
    const used = await use.usedOn(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(used).toEqual(
      new Map([
        ['2026-10-24', { places: 40, geocodes: 0, byHand: 0, maps: 0 }],
        ['2026-10-25', { places: 5, geocodes: 1, byHand: 0, maps: 0 }],
        ['2026-10-26', { places: 0, geocodes: 1, byHand: 0, maps: 0 }],
      ]),
    );
  });

  it('counts a lookup by hand apart, never as a question of the budget (plan 8Z)', async () => {
    const { use } = await made();
    await use.use('2026-10-25', 'hand');
    await use.use('2026-10-25', 'hand');
    await use.use('2026-10-25', 'places');
    await use.use('2026-10-26', 'hand');
    const used = await use.usedOn(['2026-10-25', '2026-10-26']);
    expect(used).toEqual(
      new Map([
        ['2026-10-25', { places: 1, geocodes: 0, byHand: 2, maps: 0 }],
        ['2026-10-26', { places: 0, geocodes: 0, byHand: 1, maps: 0 }],
      ]),
    );
  });

  it('counts a map of a place apart, never as a question of the budget (plan 8Z-2)', async () => {
    const { use } = await made();
    await use.use('2026-10-25', 'map');
    await use.use('2026-10-25', 'map');
    await use.use('2026-10-25', 'geocode');
    await use.use('2026-10-26', 'map');
    const used = await use.usedOn(['2026-10-25', '2026-10-26']);
    expect(used).toEqual(
      new Map([
        ['2026-10-25', { places: 0, geocodes: 1, byHand: 0, maps: 2 }],
        ['2026-10-26', { places: 0, geocodes: 0, byHand: 0, maps: 1 }],
      ]),
    );
  });
}
