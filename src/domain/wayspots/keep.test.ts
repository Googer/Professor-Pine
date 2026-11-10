import { describe, expect, it } from 'vitest';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import type { ExportedWayspot, WayspotKind } from '@pine/wayspot-core/export-file';
import { keptRowOf, planKept, scanStartOf, scanTimeOf, wasStop } from './keep.js';
import type { Wayspot } from './kept.js';

describe('scanTimeOf', () => {
  it('is when the scan finished, else when it started, else now', () => {
    const started = '2026-10-15T08:00:00.000Z';
    const finished = '2026-10-15T09:30:00.000Z';
    const now = Date.parse('2026-10-16T12:00:00.000Z');
    expect(scanTimeOf({ startedAt: started, finishedAt: finished }, now)).toBe(
      Date.parse(finished),
    );
    expect(scanTimeOf({ startedAt: started, finishedAt: '' }, now)).toBe(Date.parse(started));
    expect(scanTimeOf({ startedAt: 'never', finishedAt: '' }, now)).toBe(now);
  });

  it('is never later than now: a scan time in the future does not freeze the rows', () => {
    const now = Date.parse('2026-10-15T10:00:00.000Z');
    const file = { startedAt: '2026-10-15T08:00:00.000Z', finishedAt: '2027-01-01T00:00:00.000Z' };
    expect(scanTimeOf(file, now)).toBe(now);
  });
});

describe('scanStartOf', () => {
  it('is when the scan started, else when it finished, else now, never later than now', () => {
    const started = '2026-10-15T08:00:00.000Z';
    const finished = '2026-10-15T09:30:00.000Z';
    const now = Date.parse('2026-10-15T10:00:00.000Z');
    expect(scanStartOf({ startedAt: started, finishedAt: finished }, now)).toBe(
      Date.parse(started),
    );
    expect(scanStartOf({ startedAt: '', finishedAt: finished }, now)).toBe(Date.parse(finished));
    expect(scanStartOf({ startedAt: '', finishedAt: '' }, now)).toBe(now);
    expect(scanStartOf({ startedAt: '2027-01-01T00:00:00.000Z', finishedAt: '' }, now)).toBe(now);
  });
});

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

/** An invented Wayspot of a file, `n` hundred metres north of a corner of the invented town. */
function exported(n: number, kind: WayspotKind = 'stop', more: Partial<ExportedWayspot> = {}) {
  return {
    id: idOf(n),
    kind,
    status: 'ACTIVE',
    lat: 40.05 + n * 0.0009,
    lon: -80.05,
    title: `Wayspot ${n}`,
    address: `${n} Maple Avenue, Pinewood, PA 15999, USA`,
    description: 'A description Pine does not keep',
    image: `https://lh3.googleusercontent.com/w-${n}`,
    ...more,
  } satisfies ExportedWayspot;
}

/** The row an earlier import kept of a Wayspot. */
function kept(wayspot: ExportedWayspot, more: Partial<Wayspot> = {}): Wayspot {
  return { ...keptRowOf(wayspot, undefined), firstSeen: 1, lastSeen: 1, ...more };
}

const coveredBy = (...wayspots: { lat: number; lon: number }[]) =>
  new Set(wayspots.map(wayfarerCellAt));

describe('keptRowOf', () => {
  it('keeps the title plain and cut to the column, no empty address, no long picture address', () => {
    const row = keptRowOf(
      exported(1, 'stop', {
        title: `  Tom & Jerry’s <Mural>\u0007 ${'x'.repeat(300)}`,
        address: '',
        image: `https://lh3.googleusercontent.com/${'p'.repeat(300)}`,
      }),
      undefined,
    );
    expect(row.title.startsWith('Tom & Jerry’s <Mural> x')).toBe(true);
    expect([...row.title]).toHaveLength(255);
    expect(row.address).toBeNull();
    expect(row.image).toBeNull();
    expect(row.formerKind).toBeNull();
  });

  it('remembers the kind a Wayspot had before it changed, and keeps it while it does not change again', () => {
    const stop = exported(1, 'stop');
    const promoted = keptRowOf({ ...stop, kind: 'gym' }, kept(stop));
    expect(promoted).toMatchObject({ kind: 'gym', formerKind: 'stop' });
    const again = keptRowOf({ ...stop, kind: 'gym' }, { ...kept(stop), ...promoted });
    expect(again.formerKind).toBe('stop');
    expect(wasStop(again)).toBe(true);
    expect(wasStop(kept(stop))).toBe(true);
    expect(wasStop(kept(exported(2, 'gym')))).toBe(false);
    expect(wasStop(undefined)).toBe(false);
  });
});

describe('planKept', () => {
  it('keeps every Wayspot of the file but those Pine gyms are, and counts the stops and Power Spots', () => {
    const stop = exported(1, 'stop');
    const spot = exported(2, 'powerspot');
    const wayfarerGym = exported(3, 'gym');
    const pineGym = exported(4, 'gym');
    const plan = planKept({
      wayspots: [stop, spot, wayfarerGym, pineGym],
      covered: coveredBy(stop, spot, wayfarerGym, pineGym),
      kept: [],
      gymIds: new Set([pineGym.id]),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.writes.upsert.map((row) => row.id)).toEqual([stop.id, spot.id, wayfarerGym.id]);
    expect(plan.writes.remove).toEqual([]);
    expect(plan.counts).toEqual({ added: 2, changed: 0, gone: 0, gyms: 1 });
    expect(plan.byKind).toEqual({
      stops: { added: 1, changed: 0, gone: 0 },
      powerSpots: { added: 1, changed: 0, gone: 0 },
    });
  });

  it('marks gone what left a covered cell, and deletes what a Pine gym is now', () => {
    const gone = exported(1, 'stop');
    const notSeen = exported(40, 'stop');
    const takenBefore = exported(3, 'gym');
    const stays = exported(4, 'powerspot');
    const plan = planKept({
      wayspots: [stays, takenBefore],
      covered: coveredBy(gone, stays, takenBefore),
      kept: [kept(gone), kept(notSeen), kept(takenBefore), kept(stays)],
      gymIds: new Set([takenBefore.id]),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.writes.remove).toEqual([takenBefore.id]);
    expect(plan.writes.gone).toEqual([gone.id]);
    expect(plan.writes.upsert.map((row) => row.id)).toEqual([stays.id]);
    // The stop whose cell the file did not cover stays, unseen.
    expect(plan.counts).toEqual({ added: 0, changed: 0, gone: 1, gyms: 1 });
  });

  it('counts a change of title, place, address, picture or kind, and a stop turned gym as gone', () => {
    const moved = exported(1, 'stop');
    const renamed = exported(2, 'powerspot');
    const same = exported(3, 'stop');
    const promoted = exported(5, 'stop');
    const plan = planKept({
      wayspots: [
        { ...moved, lat: moved.lat + 0.0001 },
        { ...renamed, title: 'Another Name', kind: 'stop' },
        same,
        { ...promoted, kind: 'gym' },
      ],
      covered: coveredBy(moved, renamed, same, promoted),
      kept: [kept(moved), kept(renamed), kept(same), kept(promoted)],
      gymIds: new Set(),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.counts).toEqual({ added: 0, changed: 2, gone: 1, gyms: 1 });
    // By the kind each is now; the stop that became a gym is no stop gone from the map.
    expect(plan.byKind).toEqual({
      stops: { added: 0, changed: 2, gone: 0 },
      powerSpots: { added: 0, changed: 0, gone: 0 },
    });
    // Every Wayspot of the file is written: it was seen now.
    expect(plan.writes.upsert).toHaveLength(4);
    expect(plan.writes.upsert.find((row) => row.id === promoted.id)).toMatchObject({
      kind: 'gym',
      formerKind: 'stop',
    });
  });

  it('tells members of a change of title, kind or a move over 10 m, not of an address or picture', () => {
    const moved = exported(1, 'stop');
    const renamed = exported(2, 'stop');
    const turned = exported(3, 'powerspot');
    const nudged = exported(4, 'stop');
    const pictured = exported(5, 'powerspot');
    const addressed = exported(6, 'stop');
    const plan = planKept({
      wayspots: [
        // About 15 m and 7 m north.
        { ...moved, lat: moved.lat + 0.000135 },
        { ...renamed, title: 'Another Name' },
        { ...turned, kind: 'stop' },
        { ...nudged, lat: nudged.lat + 0.000063 },
        { ...pictured, image: 'https://lh3.googleusercontent.com/another' },
        { ...addressed, address: '7 Oak Street, Pinewood, PA 15999, USA' },
      ],
      covered: coveredBy(moved, renamed, turned, nudged, pictured, addressed),
      kept: [moved, renamed, turned, nudged, pictured, addressed].map((one) => kept(one)),
      gymIds: new Set(),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.byKind).toEqual({
      stops: { added: 0, changed: 3, gone: 0 },
      powerSpots: { added: 0, changed: 0, gone: 0 },
    });
    // The preview still counts every change, and every row is written as the file has it.
    expect(plan.counts).toEqual({ added: 0, changed: 6, gone: 0, gyms: 0 });
    expect(plan.writes.upsert.find((row) => row.id === pictured.id)?.image).toBe(
      'https://lh3.googleusercontent.com/another',
    );
    expect(plan.writes.upsert.find((row) => row.id === addressed.id)?.address).toBe(
      '7 Oak Street, Pinewood, PA 15999, USA',
    );
  });

  it('leaves alone a row a newer scan wrote: neither deleted nor changed nor counted', () => {
    const renamed = exported(1, 'stop');
    const goneHere = exported(2, 'powerspot');
    const older = exported(3, 'stop');
    const plan = planKept({
      wayspots: [{ ...renamed, title: 'An older name' }, older],
      covered: coveredBy(renamed, goneHere, older),
      kept: [
        kept(renamed, { lastSeen: 5_000 }),
        kept(goneHere, { lastSeen: 5_000 }),
        kept(older, { lastSeen: 1_000 }),
      ],
      gymIds: new Set(),
      scannedAt: 2_000,
      startedAt: 2_000,
    });
    // Only the row an older scan wrote is written again.
    expect(plan.writes).toEqual({ upsert: [keptRowOf(older, kept(older))], remove: [], gone: [] });
    expect(plan.counts).toEqual({ added: 0, changed: 0, gone: 0, gyms: 0 });
    // A row of a scan made at the same time is the file's own (an earlier import of the same
    // scan): the file deletes it, though it was seen after the file's scan started.
    const same = planKept({
      wayspots: [],
      covered: coveredBy(goneHere),
      kept: [kept(goneHere, { lastSeen: 2_000 })],
      gymIds: new Set(),
      scannedAt: 2_000,
      startedAt: 1_000,
    });
    expect(same.writes.gone).toEqual([goneHere.id]);
  });

  it('does not delete a row another scan saw after this one started, though before it finished', () => {
    const seenMeanwhile = exported(1, 'stop');
    const seenBefore = exported(2, 'stop');
    const plan = planKept({
      wayspots: [],
      covered: coveredBy(seenMeanwhile, seenBefore),
      kept: [kept(seenMeanwhile, { lastSeen: 1_500 }), kept(seenBefore, { lastSeen: 500 })],
      gymIds: new Set(),
      scannedAt: 2_000,
      startedAt: 1_000,
    });
    expect(plan.writes.gone).toEqual([seenBefore.id]);
    expect(plan.counts).toEqual({ added: 0, changed: 0, gone: 1, gyms: 0 });
  });

  it('does not bring back a Wayspot a newer scan found gone, and brings back one an older found gone', () => {
    const goneSince = exported(1, 'stop');
    const goneBefore = exported(2, 'powerspot');
    const nowGym = exported(3, 'gym');
    const plan = planKept({
      wayspots: [goneSince, goneBefore, nowGym],
      covered: coveredBy(goneSince, goneBefore, nowGym),
      kept: [],
      gone: new Map([
        [goneSince.id, { goneAt: 5_000, kind: 'stop' as const }],
        [goneBefore.id, { goneAt: 1_000, kind: 'powerspot' as const }],
        [nowGym.id, { goneAt: 1_000, kind: 'stop' as const }],
      ]),
      gymIds: new Set([nowGym.id]),
      scannedAt: 2_000,
      startedAt: 2_000,
    });
    expect(plan.writes.upsert.map((row) => row.id)).toEqual([goneBefore.id]);
    // A Wayspot found gone that a Pine gym is now lives in `Gym`: its row goes.
    expect(plan.writes.remove).toEqual([nowGym.id]);
    expect(plan.counts).toEqual({ added: 1, changed: 0, gone: 0, gyms: 0 });
    expect(plan.byKind.powerSpots).toEqual({ added: 1, changed: 0, gone: 0 });
  });

  it('remembers what a Wayspot was before it went: a stop back as a Wayfarer gym was a stop', () => {
    const back = exported(1, 'gym');
    const plan = planKept({
      wayspots: [back],
      covered: coveredBy(back),
      kept: [],
      gone: new Map([[back.id, { goneAt: 1_000, kind: 'stop' as const }]]),
      gymIds: new Set(),
      scannedAt: 2_000,
      startedAt: 2_000,
    });
    expect(plan.writes.upsert).toEqual([
      expect.objectContaining({ id: back.id, kind: 'gym', formerKind: 'stop' }),
    ]);
  });

  it('still writes a row of the file that another scan saw between its start and its finish', () => {
    const renamed = exported(1, 'stop');
    const plan = planKept({
      wayspots: [{ ...renamed, title: 'A newer name' }],
      covered: coveredBy(renamed),
      kept: [kept(renamed, { lastSeen: 1_500 })],
      gymIds: new Set(),
      scannedAt: 2_000,
      startedAt: 1_000,
    });
    expect(plan.writes.upsert.map((row) => row.title)).toEqual(['A newer name']);
  });

  it('counts by kind the stops and Power Spots gone from the map, not those that became gyms', () => {
    const goneStop = exported(1, 'stop');
    const goneSpot = exported(2, 'powerspot');
    const pineGymNow = exported(3, 'stop');
    const unseenPineGym = exported(4, 'powerspot');
    const plan = planKept({
      wayspots: [{ ...pineGymNow, kind: 'gym' }],
      covered: coveredBy(goneStop, goneSpot, pineGymNow),
      kept: [kept(goneStop), kept(goneSpot), kept(pineGymNow), kept(unseenPineGym)],
      gymIds: new Set([pineGymNow.id, unseenPineGym.id]),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.counts).toEqual({ added: 0, changed: 0, gone: 4, gyms: 0 });
    expect(plan.byKind).toEqual({
      stops: { added: 0, changed: 0, gone: 1 },
      powerSpots: { added: 0, changed: 0, gone: 1 },
    });
  });

  it('counts a Wayfarer gym that became a stop as a new stop', () => {
    const demoted = exported(1, 'gym');
    const plan = planKept({
      wayspots: [{ ...demoted, kind: 'stop' }],
      covered: coveredBy(demoted),
      kept: [kept(demoted)],
      gymIds: new Set(),
      scannedAt: 2,
      startedAt: 2,
    });
    expect(plan.counts).toEqual({ added: 1, changed: 0, gone: 0, gyms: 0 });
  });
});
