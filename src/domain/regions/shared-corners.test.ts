import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { describe, expect, it } from 'vitest';
import { applyEdits, emptyEdits, record, undo, type Draft, type LoadedRegion } from './edits.js';
import {
  cornerRemoval,
  cornerSharers,
  movedCorner,
  removedCorner,
  sharedCornerEdit,
  sharedCornerRemoval,
} from './shared-corners.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}
const draft = (key: string, outline: LatLon[] | null, more: Partial<Draft> = {}): Draft => ({
  key,
  regionId: Number(key.slice(1)),
  channel: null,
  description: null,
  outline,
  removed: null,
  base: null,
  ...more,
});

// West and East share their border at lon -80.0, from 40.0 to 40.1: two corners shared. North sits
// on top of both, its south corners on their north edges (a T-junction at -80.02, a corner shared
// with West and East at -80.0 only where it has one there).
const WEST = draft('r1', square(40.0, -80.05, 40.1, -80.0));
const EAST = draft('r2', square(40.0, -80.0, 40.1, -79.95));
const NORTH = draft('r3', [
  p(40.1, -80.02),
  p(40.2, -80.02),
  p(40.2, -79.97),
  p(40.1, -79.97),
  p(40.1, -80.02),
]);
const CORNER = p(40.1, -80.0);

describe('shared corners (plan 8M-10, C13)', () => {
  it('are the same point at six decimals in other regions of the server', () => {
    expect(cornerSharers([WEST, EAST, NORTH], 'r1', CORNER)).toEqual(['r2']);
    expect(cornerSharers([WEST, EAST, NORTH], 'r1', p(40.1000004, -80.0000004))).toEqual(['r2']);
    expect(cornerSharers([WEST, EAST, NORTH], 'r1', p(40.000001, -80.0))).toEqual([]);
    // A corner of one region on the edge of another (a T-junction) is no shared corner.
    expect(cornerSharers([WEST, EAST, NORTH], 'r3', p(40.1, -80.02))).toEqual([]);
  });

  it('leave out regions staged for removal and those without an outline', () => {
    const removed = { ...EAST, removed: 'keep' as const };
    expect(cornerSharers([WEST, removed, NORTH], 'r1', CORNER)).toEqual([]);
    expect(cornerSharers([WEST, draft('n0', null)], 'r1', CORNER)).toEqual([]);
  });

  it('move every corner of an outline at the point, its closing corner too, tidied', () => {
    expect(movedCorner(EAST.outline ?? [], p(40.0, -80.0), p(40.0, -80.001))).toEqual(
      square(40.0, -80.001, 40.1, -79.95).map((corner, i) => (i === 1 ? p(40.1, -80.0) : corner)),
    );
    // Onto its neighbour: the corner the move repeats is dropped, as the editor keeps outlines.
    expect(movedCorner(EAST.outline ?? [], CORNER, p(40.1, -79.95))).toEqual([
      p(40.0, -80.0),
      p(40.1, -79.95),
      p(40.0, -79.95),
      p(40.0, -80.0),
    ]);
  });

  it('stage a drag of a shared corner as one batch: one step of undo', () => {
    const to = p(40.11, -80.001);
    const dragged = movedCorner(WEST.outline ?? [], CORNER, to);
    const bases = (keys: readonly string[]) =>
      Object.fromEntries(keys.map((key) => [key, `v${key}`]));
    expect(
      sharedCornerEdit([WEST, EAST, NORTH], { key: 'r1', outline: dragged }, CORNER, to, bases),
    ).toEqual({
      kind: 'batch',
      edits: [
        { kind: 'outline', key: 'r1', outline: dragged, bases: { r1: 'vr1' } },
        {
          kind: 'outline',
          key: 'r2',
          outline: movedCorner(EAST.outline ?? [], CORNER, to),
          bases: { r2: 'vr2' },
        },
      ],
    });
  });

  it('stage a corner nobody shares, or one dragged apart, as the region’s own outline edit', () => {
    const bases = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 'v']));
    const to = p(40.21, -80.02);
    const dragged = movedCorner(NORTH.outline ?? [], p(40.2, -80.02), to);
    const own = { kind: 'outline', key: 'r3', outline: dragged, bases: { r3: 'v' } };
    expect(
      sharedCornerEdit(
        [WEST, EAST, NORTH],
        { key: 'r3', outline: dragged },
        p(40.2, -80.02),
        to,
        bases,
      ),
    ).toEqual(own);
    // Dragged where it was: nothing moves the others.
    expect(
      sharedCornerEdit(
        [WEST, EAST],
        { key: 'r1', outline: WEST.outline ?? [] },
        CORNER,
        CORNER,
        bases,
      ),
    ).toEqual({
      kind: 'outline',
      key: 'r1',
      outline: WEST.outline,
      bases: { r1: 'v' },
    });
  });
});

// Plan 8M-11C, S32: a corner deleted with "Move shared corners together" on.
describe('a shared corner deleted', () => {
  const bases = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, `v${key}`]));
  const TRIANGLE = draft('r4', [p(40.1, -80.0), p(40.15, -80.0), p(40.15, -79.99), p(40.1, -80.0)]);

  it('leaves an outline without every corner at the point, still closed when it was', () => {
    // West's corner at the point is its third: the ring keeps its first corner as its last.
    expect(removedCorner(WEST.outline ?? [], CORNER)).toEqual([
      p(40.0, -80.05),
      p(40.1, -80.05),
      p(40.0, -80.0),
      p(40.0, -80.05),
    ]);
    // Its first corner (and so its closing one) taken: closed again at its new first.
    expect(removedCorner(EAST.outline ?? [], p(40.0, -80.0))).toEqual([
      p(40.1, -80.0),
      p(40.1, -79.95),
      p(40.0, -79.95),
      p(40.1, -80.0),
    ]);
    // An open ring stays open.
    expect(
      removedCorner([p(40, -80), p(40.1, -80), p(40.1, -79.9), p(40, -79.9)], p(40, -80)),
    ).toEqual([p(40.1, -80), p(40.1, -79.9), p(40, -79.9)]);
  });

  it('is refused for an outline left with fewer than three distinct corners', () => {
    expect(removedCorner(TRIANGLE.outline ?? [], CORNER)).toBeUndefined();
    expect(removedCorner([p(40, -80), p(40.1, -80), p(40.1, -79.9)], p(40, -80))).toBeUndefined();
  });

  it('is deleted in every region of the server that has it, as one batch', () => {
    const removal = sharedCornerRemoval([WEST, EAST, NORTH], 'r1', CORNER, bases);
    expect(removal).toEqual({
      ok: true,
      edit: {
        kind: 'batch',
        edits: [
          {
            kind: 'outline',
            key: 'r1',
            outline: removedCorner(WEST.outline ?? [], CORNER),
            bases: { r1: 'vr1' },
          },
          {
            kind: 'outline',
            key: 'r2',
            outline: removedCorner(EAST.outline ?? [], CORNER),
            bases: { r2: 'vr2' },
          },
        ],
      },
    });
  });

  it('is one step of undo', () => {
    const loaded = (one: Draft): LoadedRegion => ({
      id: one.regionId ?? 0,
      channelId: '1',
      name: one.key,
      category: null,
      description: null,
      outline: one.outline,
      version: `v${one.key}`,
    });
    const removal = sharedCornerRemoval([WEST, EAST], 'r1', CORNER, bases);
    if (!removal.ok) throw new Error('expected the corner deleted');
    const state = record(emptyEdits(), removal.edit);
    const outlines = (drafts: Draft[]) => drafts.map((one) => one.outline);
    const regions = [loaded(WEST), loaded(EAST)];
    expect(outlines(applyEdits(regions, state).drafts)).toEqual([
      removedCorner(WEST.outline ?? [], CORNER),
      removedCorner(EAST.outline ?? [], CORNER),
    ]);
    expect(outlines(applyEdits(regions, undo(state)).drafts)).toEqual([WEST.outline, EAST.outline]);
  });

  it('is refused whole when a region that has it would keep fewer than three corners', () => {
    expect(sharedCornerRemoval([WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
      ok: false,
      region: 'r4',
    });
    // The region it is deleted from counts too.
    expect(sharedCornerRemoval([TRIANGLE, WEST], 'r4', CORNER, bases)).toEqual({
      ok: false,
      region: 'r4',
    });
  });

  it('never touches a region staged for removal, nor one that only has it on a side', () => {
    const removed = { ...EAST, removed: 'keep' as const };
    expect(sharedCornerRemoval([WEST, removed, NORTH], 'r1', CORNER, bases)).toEqual({
      ok: true,
      edit: {
        kind: 'outline',
        key: 'r1',
        outline: removedCorner(WEST.outline ?? [], CORNER),
        bases: { r1: 'vr1' },
      },
    });
  });
});

// Review C5: what the editor does with a corner Geoman is about to delete, decided in one place.
describe('a corner about to be deleted', () => {
  const bases = (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, `v${key}`]));
  const TRIANGLE = draft('r4', [p(40.1, -80.0), p(40.15, -80.0), p(40.15, -79.99), p(40.1, -80.0)]);

  it('is left to Geoman with "Move shared corners together" off', () => {
    expect(cornerRemoval(false, [WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
      kind: 'allow',
    });
  });

  it('is left to Geoman where nobody shares it', () => {
    expect(cornerRemoval(true, [WEST, EAST], 'r1', p(40.0, -80.05), bases)).toEqual({
      kind: 'allow',
    });
  });

  it('is refused, naming the region, where one that has it would keep fewer than three corners', () => {
    expect(cornerRemoval(true, [WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
      kind: 'refuse',
      region: 'r4',
    });
  });

  // Branch review BR-1: one ring rule for every deletion, shared or not, the option on or off.
  it('is refused, naming the region, where its own ring would keep fewer than three corners', () => {
    expect(cornerRemoval(false, [TRIANGLE], 'r4', p(40.15, -80.0), bases)).toEqual({
      kind: 'refuse',
      region: 'r4',
    });
    expect(cornerRemoval(false, [WEST, TRIANGLE], 'r4', CORNER, bases)).toEqual({
      kind: 'refuse',
      region: 'r4',
    });
    // The triangle's corner nobody shares, with the option on.
    expect(cornerRemoval(true, [WEST, TRIANGLE], 'r4', p(40.15, -79.99), bases)).toEqual({
      kind: 'refuse',
      region: 'r4',
    });
  });

  it('is staged as one batch where every region that has it keeps three corners', () => {
    const removal = sharedCornerRemoval([WEST, EAST], 'r1', CORNER, bases);
    if (!removal.ok) throw new Error('expected the corner deleted');
    expect(cornerRemoval(true, [WEST, EAST], 'r1', CORNER, bases)).toEqual({
      kind: 'stage',
      edit: removal.edit,
    });
    expect(removal.edit.kind).toBe('batch');
  });
});
