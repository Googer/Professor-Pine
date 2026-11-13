import { expect, it } from 'vitest';
import type { WayspotLookups } from '../../src/services/wayspot-lookups.js';

/** The two servers of the cases, by their `Guild` rows. */
export const SPOT_HOME = 1;
export const SPOT_AWAY = 2;

/**
 * What the line of PokéStops and Power Spots that wait for Google does, run against the
 * repository and its twin in memory alike. `made` gives a fresh, empty line of two servers
 * (`SPOT_HOME`, `SPOT_AWAY`): a Wayspot waits per server that keeps it (plan 19B-3).
 */
export function wayspotLookupCases(made: () => Promise<WayspotLookups>): void {
  const home = { guildId: SPOT_HOME };
  const away = { guildId: SPOT_AWAY };

  it('gives stops before Power Spots, each by rank, then by the time queued', async () => {
    const lookups = await made();
    expect(await lookups.next()).toBeUndefined();
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'powerspot', rank: 1 }], 1_000);
    await lookups.add(
      [
        { ...home, wayspotId: 'bb.16', kind: 'stop', rank: 0.5 },
        { ...home, wayspotId: 'cc.16', kind: 'stop', rank: 0.5 },
      ],
      2_000,
    );
    await lookups.add([{ ...home, wayspotId: 'pine-7', kind: 'stop', rank: 1 }], 3_000);
    expect((await lookups.list()).map((row) => row.wayspotId)).toEqual([
      'pine-7',
      'bb.16',
      'cc.16',
      'aa.16',
    ]);
    expect(await lookups.next()).toEqual({
      ...home,
      wayspotId: 'pine-7',
      kind: 'stop',
      rank: 1,
      queuedAt: 3_000,
    });
    await lookups.remove([
      { ...home, wayspotId: 'pine-7' },
      { ...home, wayspotId: 'bb.16' },
    ]);
    expect(await lookups.count()).toBe(2);
    expect((await lookups.next())?.wayspotId).toBe('cc.16');
  });

  it('keeps a Wayspot of two servers once per server, each with its rank, and takes out one alone', async () => {
    const lookups = await made();
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
    await lookups.add([{ ...away, wayspotId: 'aa.16', kind: 'stop', rank: 1 }], 2_000);
    expect(await lookups.list()).toEqual([
      { ...away, wayspotId: 'aa.16', kind: 'stop', rank: 1, queuedAt: 2_000 },
      { ...home, wayspotId: 'aa.16', kind: 'stop', rank: 0, queuedAt: 1_000 },
    ]);
    await lookups.remove([{ ...away, wayspotId: 'aa.16' }]);
    expect(await lookups.list()).toEqual([
      { ...home, wayspotId: 'aa.16', kind: 'stop', rank: 0, queuedAt: 1_000 },
    ]);
  });

  it('gives one server’s rows alone, and says whether any row waits', async () => {
    const lookups = await made();
    expect(await lookups.any()).toBe(false);
    expect(await lookups.ofServer(SPOT_HOME)).toEqual([]);
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
    await lookups.add([{ ...away, wayspotId: 'bb.16', kind: 'powerspot', rank: 1 }], 2_000);
    expect(await lookups.any()).toBe(true);
    expect(await lookups.ofServer(SPOT_AWAY)).toEqual([
      { ...away, wayspotId: 'bb.16', kind: 'powerspot', rank: 1, queuedAt: 2_000 },
    ]);
    expect((await lookups.ofServer(SPOT_HOME)).map((row) => row.wayspotId)).toEqual(['aa.16']);
  });

  it('passes over the Wayspots set aside, of every server', async () => {
    const lookups = await made();
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'stop', rank: 1 }], 1_000);
    await lookups.add([{ ...away, wayspotId: 'aa.16', kind: 'stop', rank: 1 }], 1_000);
    await lookups.add([{ ...home, wayspotId: 'bb.16', kind: 'powerspot', rank: 1 }], 2_000);
    expect((await lookups.next({ except: new Set(['aa.16']) }))?.wayspotId).toBe('bb.16');
    expect(await lookups.next({ except: new Set(['aa.16', 'bb.16']) })).toBeUndefined();
    expect((await lookups.next({ except: new Set() }))?.wayspotId).toBe('aa.16');
    expect(await lookups.count()).toBe(3);
  });

  it('keeps the time of a Wayspot queued again, with its new kind and rank', async () => {
    const lookups = await made();
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'stop', rank: 0 }], 1_000);
    await lookups.add([{ ...home, wayspotId: 'bb.16', kind: 'stop', rank: 0 }], 2_000);
    // A stop that became a Power Spot.
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'powerspot', rank: 0 }], 3_000);
    expect(await lookups.list()).toEqual([
      { ...home, wayspotId: 'bb.16', kind: 'stop', rank: 0, queuedAt: 2_000 },
      { ...home, wayspotId: 'aa.16', kind: 'powerspot', rank: 0, queuedAt: 1_000 },
    ]);
    // Ranked anew (`queueWayspots` queues it again with its new rank): its time stays.
    await lookups.add([{ ...home, wayspotId: 'aa.16', kind: 'powerspot', rank: 0.5 }], 4_000);
    expect((await lookups.list())[1]).toEqual({
      ...home,
      wayspotId: 'aa.16',
      kind: 'powerspot',
      rank: 0.5,
      queuedAt: 1_000,
    });
    expect(await lookups.count()).toBe(2);
  });
}
