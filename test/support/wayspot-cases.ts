import { expect, it } from 'vitest';
import type { WayspotStorage } from '../../src/db/repositories/wayspot-repository.js';
import type { WayspotRow } from '../../src/domain/wayspots/kept.js';

/** An invented Wayspot id of Wayfarer's form: `n` as its 32 hexadecimal digits. */
export function wayspotId(n: number): string {
  return `${n.toString(16).padStart(32, '0')}.16`;
}

/** An invented stop near the invented gyms, changed by `overrides`. */
export function keptRow(n: number, overrides: Partial<WayspotRow> = {}): WayspotRow {
  return {
    id: wayspotId(n),
    kind: 'stop',
    formerKind: null,
    lat: 40.44 + n / 100_000,
    lon: -79.95,
    title: `Stop ${n}`,
    address: `${n} Main St, Pittsburgh, PA 15213, USA`,
    image: `https://lh3.googleusercontent.com/stop-${n}`,
    ...overrides,
  };
}

/**
 * What the kept Wayspots do, run against the repository and its twin in memory alike. `made`
 * gives fresh, empty storage.
 */
export function wayspotCases(
  made: () => Promise<WayspotStorage>,
  /**
   * Makes a Wayspot found gone whose kind before is not known (none kept, or a later version's),
   * as only a row written outside this version can be.
   */
  goneOfUnknownKind: (storage: WayspotStorage, id: string, goneAt: number) => Promise<void>,
): void {
  it('keeps a Wayspot found gone whose kind before is not known, as a stop', async () => {
    const storage = await made();
    await goneOfUnknownKind(storage, wayspotId(1), 3_000);
    expect(await storage.gone()).toEqual(
      new Map([[wayspotId(1), { goneAt: 3_000, kind: 'stop' }]]),
    );
    // So an older scan does not bring it back either.
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 6_000, 2_000);
    expect(await storage.all()).toEqual([]);
  });

  it('keeps what an import writes, and when each Wayspot was seen first and last', async () => {
    const storage = await made();
    expect(await storage.all()).toEqual([]);
    await storage.saveFromImport(
      { upsert: [keptRow(2), keptRow(1, { kind: 'powerspot', address: null })], remove: [] },
      1_000,
    );
    expect(await storage.all()).toEqual([
      { ...keptRow(1, { kind: 'powerspot', address: null }), firstSeen: 1_000, lastSeen: 1_000 },
      { ...keptRow(2), firstSeen: 1_000, lastSeen: 1_000 },
    ]);
  });

  it('updates a Wayspot seen again, keeping when it was first seen, and deletes what it is told', async () => {
    const storage = await made();
    await storage.saveFromImport(
      { upsert: [keptRow(1), keptRow(2), keptRow(3)], remove: [] },
      1_000,
    );
    const promoted = keptRow(1, {
      kind: 'gym',
      formerKind: 'stop',
      title: 'Stop 1, renamed',
      lat: 40.5,
      image: null,
    });
    await storage.saveFromImport(
      { upsert: [promoted], remove: [wayspotId(2), wayspotId(9)] },
      2_000,
    );
    expect(await storage.all()).toEqual([
      { ...promoted, firstSeen: 1_000, lastSeen: 2_000 },
      { ...keptRow(3), firstSeen: 1_000, lastSeen: 1_000 },
    ]);
  });

  it('notes when an import first kept a Wayspot, and when the scan that saw it last was made', async () => {
    const storage = await made();
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 5_000, 1_000);
    expect(await storage.all()).toEqual([{ ...keptRow(1), firstSeen: 5_000, lastSeen: 1_000 }]);
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 9_000, 3_000);
    expect(await storage.all()).toEqual([{ ...keptRow(1), firstSeen: 5_000, lastSeen: 3_000 }]);
  });

  it('never lets a scan overwrite a row a newer scan wrote', async () => {
    const storage = await made();
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 5_000, 3_000);
    const older = keptRow(1, { title: 'An older name', kind: 'powerspot', lat: 40.5 });
    await storage.saveFromImport({ upsert: [older], remove: [] }, 6_000, 2_000);
    expect(await storage.all()).toEqual([{ ...keptRow(1), firstSeen: 5_000, lastSeen: 3_000 }]);
    // A scan made at the same time is the row's own (the same scan imported again).
    await storage.saveFromImport({ upsert: [older], remove: [] }, 7_000, 3_000);
    expect(await storage.all()).toEqual([{ ...older, firstSeen: 5_000, lastSeen: 3_000 }]);
  });

  it('keeps a Wayspot found gone out of what it holds, so that an older scan does not bring it back', async () => {
    const storage = await made();
    await storage.saveFromImport({ upsert: [keptRow(1), keptRow(2)], remove: [] }, 1_000);
    await storage.saveFromImport(
      { upsert: [], remove: [], gone: [wayspotId(1)] },
      5_000,
      3_000,
      2_500,
    );
    expect((await storage.all()).map((row) => row.id)).toEqual([wayspotId(2)]);
    expect(await storage.gone()).toEqual(
      new Map([[wayspotId(1), { goneAt: 3_000, kind: 'stop' }]]),
    );
    // An older scan still had it: it stays gone.
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 6_000, 2_000);
    expect((await storage.all()).map((row) => row.id)).toEqual([wayspotId(2)]);
    // A newer scan has it again: it is back, first seen when it was first kept.
    const back = keptRow(1, { title: 'Back again' });
    await storage.saveFromImport({ upsert: [back], remove: [] }, 9_000, 4_000);
    expect(await storage.all()).toEqual([
      { ...back, firstSeen: 1_000, lastSeen: 4_000 },
      { ...keptRow(2), firstSeen: 1_000, lastSeen: 1_000 },
    ]);
    expect(await storage.gone()).toEqual(new Map());
  });

  it('marks nothing gone that another scan saw after the scan began, but the scan’s own rows', async () => {
    const storage = await made();
    await storage.saveFromImport({ upsert: [keptRow(1)], remove: [] }, 1_000, 1_500);
    await storage.saveFromImport({ upsert: [keptRow(2)], remove: [] }, 1_000, 2_000);
    await storage.saveFromImport({ upsert: [keptRow(3)], remove: [] }, 1_000, 500);
    await storage.saveFromImport(
      { upsert: [], remove: [], gone: [wayspotId(1), wayspotId(2), wayspotId(3)] },
      3_000,
      2_000,
      1_000,
    );
    expect((await storage.all()).map((row) => row.id)).toEqual([wayspotId(1)]);
    expect(await storage.gone()).toEqual(
      new Map([
        [wayspotId(2), { goneAt: 2_000, kind: 'stop' }],
        [wayspotId(3), { goneAt: 2_000, kind: 'stop' }],
      ]),
    );
    // What a Pine gym is now goes whatever saw it, gone or kept.
    await storage.saveFromImport({ upsert: [], remove: [wayspotId(1), wayspotId(2)] }, 4_000, 200);
    expect(await storage.all()).toEqual([]);
    expect([...(await storage.gone()).keys()]).toEqual([wayspotId(3)]);
  });

  it('removes Wayspots by id and says how many there were', async () => {
    const storage = await made();
    await storage.saveFromImport({ upsert: [keptRow(1), keptRow(2)], remove: [] }, 1_000);
    expect(await storage.remove([])).toBe(0);
    expect(await storage.remove([wayspotId(2), wayspotId(7)])).toBe(1);
    expect((await storage.all()).map((row) => row.id)).toEqual([wayspotId(1)]);
  });

  it('keeps texts as they are written, with no encoding', async () => {
    const storage = await made();
    const row = keptRow(1, {
      title: 'Café “Ünïcode” 🍕 &amp; <b>Five</b> Points',
      address: 'Ave. d’Ivry & 5th, Pittsburgh',
    });
    await storage.saveFromImport({ upsert: [row], remove: [] }, 1_000);
    expect(await storage.all()).toEqual([{ ...row, firstSeen: 1_000, lastSeen: 1_000 }]);
  });

  it('writes a city at once', async () => {
    const storage = await made();
    const rows = Array.from({ length: 1_234 }, (_, i) => keptRow(i + 1));
    await storage.saveFromImport({ upsert: rows, remove: [] }, 1_000);
    expect(await storage.all()).toHaveLength(1_234);
    await storage.saveFromImport(
      { upsert: [], remove: rows.slice(0, 1_200).map((row) => row.id) },
      2_000,
    );
    expect(await storage.all()).toHaveLength(34);
  });
}
