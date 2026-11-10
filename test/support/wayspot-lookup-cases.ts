import { expect, it } from 'vitest';
import type { WayspotLookups } from '../../src/services/wayspot-lookups.js';

/**
 * What the line of PokéStops and Power Spots that wait for Google does, and the places it keeps,
 * run against the repository and its twin in memory alike. `made` gives a fresh, empty line.
 */
export function wayspotLookupCases(made: () => Promise<WayspotLookups>): void {
  it('gives stops before Power Spots, each by rank, then by the time queued', async () => {
    const lookups = await made();
    expect(await lookups.next()).toBeUndefined();
    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }], 1_000);
    await lookups.add(
      [
        { wayspotId: 'bb.16', kind: 'stop', rank: 0.5 },
        { wayspotId: 'cc.16', kind: 'stop', rank: 0.5 },
      ],
      2_000,
    );
    await lookups.add([{ wayspotId: 'pine-7', kind: 'stop', rank: 1 }], 3_000);
    expect((await lookups.list()).map((row) => row.wayspotId)).toEqual([
      'pine-7',
      'bb.16',
      'cc.16',
      'aa.16',
    ]);
    expect(await lookups.next()).toEqual({
      wayspotId: 'pine-7',
      kind: 'stop',
      rank: 1,
      queuedAt: 3_000,
    });
    await lookups.remove(['pine-7', 'bb.16']);
    expect(await lookups.count()).toBe(2);
    expect((await lookups.next())?.wayspotId).toBe('cc.16');
  });

  it('passes over the Wayspots set aside', async () => {
    const lookups = await made();
    await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 1 }], 1_000);
    await lookups.add([{ wayspotId: 'bb.16', kind: 'powerspot', rank: 1 }], 2_000);
    expect((await lookups.next({ except: new Set(['aa.16']) }))?.wayspotId).toBe('bb.16');
    expect(await lookups.next({ except: new Set(['aa.16', 'bb.16']) })).toBeUndefined();
    expect((await lookups.next({ except: new Set() }))?.wayspotId).toBe('aa.16');
    expect(await lookups.count()).toBe(2);
  });

  it('keeps the time of a Wayspot queued again, with its new kind and rank', async () => {
    const lookups = await made();
    await lookups.add([{ wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
    await lookups.add([{ wayspotId: 'bb.16', kind: 'stop', rank: 0 }], 2_000);
    // A stop that became a Power Spot.
    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 0 }], 3_000);
    expect(await lookups.list()).toEqual([
      { wayspotId: 'bb.16', kind: 'stop', rank: 0, queuedAt: 2_000 },
      { wayspotId: 'aa.16', kind: 'powerspot', rank: 0, queuedAt: 1_000 },
    ]);
    // Ranked anew (`queueWayspots` queues it again with its new rank): its time stays.
    await lookups.add([{ wayspotId: 'aa.16', kind: 'powerspot', rank: 0.5 }], 4_000);
    expect((await lookups.list())[1]).toEqual({
      wayspotId: 'aa.16',
      kind: 'powerspot',
      rank: 0.5,
      queuedAt: 1_000,
    });
    expect(await lookups.count()).toBe(2);
  });

  it('keeps the places asked about a Wayspot, the newest over the older, until dropped', async () => {
    const lookups = await made();
    expect(await lookups.asked()).toEqual([]);
    const asked = {
      wayspotId: 'aa.16',
      kind: 'stop' as const,
      lat: 40.01,
      lon: -80.02,
      places: 'Corner Bakery Maple Dental',
      askedAt: 5_000,
    };
    await lookups.saveAsked(asked);
    await lookups.saveAsked({ ...asked, wayspotId: 'bb.16', places: null });
    await lookups.saveAsked({ ...asked, places: 'Corner Bakery', askedAt: 6_000 });
    const kept = await lookups.asked();
    expect(kept.sort((a, b) => a.wayspotId.localeCompare(b.wayspotId))).toEqual([
      { ...asked, places: 'Corner Bakery', askedAt: 6_000 },
      { ...asked, wayspotId: 'bb.16', places: null },
    ]);
    await lookups.dropAsked(['aa.16']);
    expect((await lookups.asked()).map((row) => row.wayspotId)).toEqual(['bb.16']);
  });
}
