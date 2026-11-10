import { describe, expect, it } from 'vitest';
import { readKml, writeKml } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  applyEdits,
  emptyEdits,
  exportAreas,
  hasArea,
  isNewKey,
  kmlEdit,
  newKey,
  parseEdits,
  rebaseAfterSave,
  record,
  redo,
  regionsChanged,
  regionKey,
  saveRequest,
  serialiseEdits,
  undo,
  type Edit,
  type EditState,
  type LoadedRegion,
} from './edits.js';
import { regionVersion } from './version.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}

function loaded(
  id: number,
  name: string,
  outline: LatLon[] | null,
  more: Partial<LoadedRegion> = {},
): LoadedRegion {
  const description = more.description ?? null;
  return {
    id,
    channelId: `10000000000000000${id}`,
    name,
    category: 'Town',
    description,
    outline,
    version: regionVersion(outline, description),
    ...more,
  };
}

const WEST = square(40, -80.1, 40.1, -80);
const EAST = square(40, -80, 40.1, -79.9);
const LOADED = [loaded(1, 'west', WEST), loaded(2, 'east', EAST)];
const W = regionKey(1);
const E = regionKey(2);
const versionOf = (id: number): string => LOADED.find((one) => one.id === id)?.version ?? '';

/** Records the edits one after the other, as the page does. */
function staged(...edits: Edit[]): EditState {
  return edits.reduce((state, edit) => record(state, edit), emptyEdits());
}

describe('staged edits', () => {
  it('leave the loaded regions as they are until something is done', () => {
    const drafts = applyEdits(LOADED, emptyEdits()).drafts;
    expect(drafts.map((draft) => draft.key)).toEqual([W, E]);
    expect(drafts[0]).toMatchObject({ regionId: 1, outline: WEST, removed: null, base: null });
    expect(saveRequest(LOADED, drafts)).toEqual({
      request: { changes: [], additions: [], removals: [] },
      missingChannel: [],
    });
  });

  it('change an outline, add a region, remove one, each remembering what it was loaded as', () => {
    const moved = square(40, -80.1, 40.1, -80.01);
    const fresh = square(40.1, -80.1, 40.2, -80);
    const state = staged(
      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
      {
        kind: 'add',
        key: newKey(0),
        outline: fresh,
        channel: { create: 'North Hills' },
        description: 'Suburbs',
      },
      { kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } },
    );
    const { drafts } = applyEdits(LOADED, state);
    expect(drafts.map((draft) => [draft.key, draft.removed])).toEqual([
      [W, null],
      [E, 'keep'],
      [newKey(0), null],
    ]);
    const { request } = saveRequest(LOADED, drafts);
    expect(request.changes).toEqual([
      {
        regionId: 1,
        outline: moved.map(({ lat, lon }) => [lat, lon]),
        version: versionOf(1),
      },
    ]);
    expect(request.additions).toEqual([
      {
        channel: { name: 'North Hills' },
        description: 'Suburbs',
        outline: fresh.map(({ lat, lon }) => [lat, lon]),
      },
    ]);
    expect(request.removals).toEqual([{ regionId: 2, forum: 'keep', version: versionOf(2) }]);
  });

  it('send an outline at six decimals, and none that is only a rounding away', () => {
    const near = WEST.map(({ lat, lon }) => p(lat + 1e-9, lon));
    const state = staged({ kind: 'outline', key: W, outline: near, bases: { [W]: versionOf(1) } });
    expect(saveRequest(LOADED, applyEdits(LOADED, state).drafts).request.changes).toEqual([]);
    const off = WEST.map(({ lat, lon }, i) =>
      i === 1 ? p(lat + 0.00123456789, lon) : p(lat, lon),
    );
    const sent = saveRequest(
      LOADED,
      applyEdits(LOADED, staged({ kind: 'outline', key: W, outline: off, bases: {} })).drafts,
    ).request.changes[0]?.outline;
    expect(sent?.[1]).toEqual([40.101235, -80.1]);
  });

  it('split a region: the part it keeps, a new region of the other, and swap them', () => {
    const keep = square(40, -80.1, 40.1, -80.03);
    const other = square(40, -80.03, 40.1, -80);
    const state = staged({
      kind: 'split',
      key: W,
      keep,
      newKey: newKey(0),
      other,
      bases: { [W]: versionOf(1) },
    });
    let { drafts } = applyEdits(LOADED, state);
    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(keep);
    expect(drafts.find((draft) => draft.key === newKey(0))).toMatchObject({
      regionId: null,
      channel: null,
      outline: other,
    });
    expect(saveRequest(LOADED, drafts).missingChannel).toEqual([newKey(0)]);
    drafts = applyEdits(
      LOADED,
      record(state, { kind: 'swap', a: W, b: newKey(0), bases: {} }),
    ).drafts;
    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(other);
    expect(drafts.find((draft) => draft.key === newKey(0))?.outline).toEqual(keep);
  });

  it('give a new region its channel and category, never a loaded one', () => {
    const state = staged(
      { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
      {
        kind: 'details',
        key: newKey(0),
        channel: { id: '100000000000000005', name: 'south' },
        description: null,
      },
      { kind: 'details', key: W, channel: { create: 'elsewhere' }, description: 'Other' },
    );
    const { drafts } = applyEdits(LOADED, state);
    expect(drafts.find((draft) => draft.key === newKey(0))?.channel).toEqual({
      id: '100000000000000005',
      name: 'south',
    });
    expect(drafts.find((draft) => draft.key === W)?.channel).toEqual({
      id: LOADED[0]?.channelId,
      name: 'west',
    });
    expect(saveRequest(LOADED, drafts).request.additions[0]?.channel).toEqual({
      id: '100000000000000005',
    });
  });

  it('take a new region off the list when it is removed, without a removal to send', () => {
    const state = staged(
      { kind: 'add', key: newKey(0), outline: EAST, channel: { create: 'x' }, description: null },
      { kind: 'remove', key: newKey(0), forum: 'keep', bases: {} },
    );
    const { drafts } = applyEdits(LOADED, state);
    expect(saveRequest(LOADED, drafts).request).toEqual({
      changes: [],
      additions: [],
      removals: [],
    });
  });

  it('take a removal back, whenever it was staged', () => {
    const state = staged(
      { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } },
      { kind: 'outline', key: W, outline: square(40, -80.1, 40.1, -80.02), bases: {} },
      { kind: 'restore', key: E, bases: {} },
    );
    const { drafts } = applyEdits(LOADED, state);
    expect(drafts.find((draft) => draft.key === E)?.removed).toBeNull();
    expect(saveRequest(LOADED, drafts).request.removals).toEqual([]);
  });
});

describe('undo and redo', () => {
  const first: Edit = {
    kind: 'outline',
    key: W,
    outline: square(40, -80.1, 40.1, -80.02),
    bases: { [W]: versionOf(1) },
  };
  const second: Edit = { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } };

  it('step back and forth over every edit, and a new edit forgets what was undone', () => {
    let state = staged(first, second);
    state = undo(state);
    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === E)?.removed).toBeNull();
    state = undo(state);
    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === W)?.outline).toEqual(
      WEST,
    );
    expect(undo(state)).toBe(state);
    state = redo(state);
    expect(applyEdits(LOADED, state).drafts.find((draft) => draft.key === W)?.outline).toEqual(
      first.outline,
    );
    expect(state.undone).toHaveLength(1);
    state = record(state, { kind: 'remove', key: W, forum: 'keep', bases: {} });
    expect(state.undone).toEqual([]);
    expect(redo(state)).toBe(state);
  });

  it('take the steps of one drag of a region as one, and no more than 200 steps', () => {
    const reshaped = (east: number): Edit => ({
      kind: 'outline',
      key: W,
      outline: square(40, -80.1, 40.1, east),
      bases: { [W]: versionOf(1) },
    });
    // A drag: one region's outline again and again, each within two seconds of the last.
    let state = record(emptyEdits(), reshaped(-80.01), { at: 1_000 });
    state = record(state, reshaped(-80.02), { at: 2_500 });
    state = record(state, reshaped(-80.03), { at: 4_400 });
    expect(state.edits).toEqual([reshaped(-80.03)]);
    // A pause, another region, or an undo between: steps of their own.
    state = record(state, reshaped(-80.04), { at: 7_000 });
    expect(state.edits).toHaveLength(2);
    state = record(state, { kind: 'outline', key: E, outline: EAST, bases: {} }, { at: 7_100 });
    state = record(state, reshaped(-80.05), { at: 7_200 });
    expect(state.edits).toHaveLength(4);
    state = record(undo(state), reshaped(-80.06), { at: 7_300 });
    expect(state.edits).toHaveLength(4);

    let long = emptyEdits();
    for (let i = 0; i < 205; i++) {
      long = record(long, {
        kind: 'add',
        key: newKey(i),
        outline: square(41 + i * 0.01, -80, 41.005 + i * 0.01, -79.99),
        channel: null,
        description: null,
      });
    }
    expect(long.edits).toHaveLength(200);
    expect(applyEdits(LOADED, long).drafts).toHaveLength(207);
    expect(long.next).toBe(205);
    // The last step back takes the oldest edits back together.
    let back = long;
    for (let i = 0; i < 199; i++) back = undo(back);
    expect(applyEdits(LOADED, back).drafts).toHaveLength(8);
    expect(applyEdits(LOADED, undo(back)).drafts).toHaveLength(2);
  });

  it('keep outlines at six decimals, without a corner the rounding repeats', () => {
    const near = WEST.map(({ lat, lon }) => p(lat + 1e-9, lon - 1e-9));
    const repeated = [p(40, -80), p(40.0000001, -80), ...EAST.slice(1)];
    const state = staged(
      { kind: 'outline', key: W, outline: near, bases: {} },
      { kind: 'add', key: newKey(0), outline: repeated, channel: null, description: null },
    );
    const { drafts } = applyEdits(LOADED, state);
    expect(drafts.find((draft) => draft.key === W)?.outline).toEqual(WEST);
    expect(drafts.find((draft) => draft.key === newKey(0))?.outline).toEqual(EAST);
  });

  it('undo a loaded file as one edit', () => {
    const file = kmlEdit(
      [
        { name: 'West', description: null, outline: square(40, -80.2, 40.1, -80), holes: false },
        {
          name: 'Far Away',
          description: 'Edge',
          outline: square(41, -80, 41.1, -79.9),
          holes: false,
        },
      ],
      LOADED,
      applyEdits(LOADED, emptyEdits()).drafts,
      [],
      emptyEdits(),
    );
    const state = record(emptyEdits(), file);
    expect(applyEdits(LOADED, state).drafts).toHaveLength(3);
    expect(applyEdits(LOADED, undo(state)).drafts).toHaveLength(2);
  });
});

describe('keeping staged edits in the browser', () => {
  it('reads back what it wrote', () => {
    const state = undo(
      staged(
        { kind: 'outline', key: W, outline: WEST, bases: { [W]: versionOf(1) } },
        { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
      ),
    );
    expect(parseEdits(serialiseEdits(state))).toEqual(state);
  });

  // Branch review BR-1: a browser that kept an outline of fewer than three corners (a deleted
  // corner of a triangle, before the fix) opens the editor again, without that outline.
  it('drops a reshaped outline of fewer than three distinct corners', () => {
    const bases = { [W]: versionOf(1), [E]: versionOf(2) };
    const good: Edit = { kind: 'outline', key: W, outline: WEST, bases };
    const empty: Edit = { kind: 'outline', key: E, outline: [], bases };
    const line: Edit = {
      kind: 'outline',
      key: W,
      outline: [p(40, -80), p(40.1, -80), p(40, -80)],
      bases,
    };
    const text = serialiseEdits({
      edits: [
        good,
        empty,
        { kind: 'batch', edits: [line, good] },
        { kind: 'batch', edits: [empty] },
      ],
      undone: [line],
      next: 0,
    });
    expect(parseEdits(text)).toEqual({
      edits: [good, { kind: 'batch', edits: [good] }],
      undone: [],
      next: 0,
    });
    expect(hasArea(WEST)).toBe(true);
    expect(hasArea([p(40, -80), p(40.1, -80), p(40.1, -80), p(40, -80)])).toBe(false);
    expect(hasArea([])).toBe(false);
  });

  it('reads nothing of a text that is not its own', () => {
    for (const text of [
      '',
      'null',
      '{}',
      '[]',
      '{"v":2,"edits":[],"undone":[],"next":0}',
      '{"v":1,"edits":[{"kind":"explode"}],"undone":[],"next":0}',
      '{"v":1,"edits":[{"kind":"outline","key":"r1","outline":[{"lat":"x","lon":1}],"bases":{}}],"undone":[],"next":0}',
      '{"v":1,"edits":[],"undone":[],"next":-1}',
      'not json',
    ]) {
      expect(parseEdits(text), text).toBeUndefined();
    }
  });
});

// Plan 8M-11C, S31: what "Edit regions · 3 unsaved" and the editor's line count.
describe('the regions the staged edits change', () => {
  const bases = { [W]: versionOf(1), [E]: versionOf(2) };

  // Review C6: one rule for a new region's key, which the count and `record` read.
  it('know a new region by its key', () => {
    expect(isNewKey(newKey(0))).toBe(true);
    expect(isNewKey(newKey(12))).toBe(true);
    expect(isNewKey(regionKey(3))).toBe(false);
    expect(isNewKey('n')).toBe(false);
    expect(isNewKey('nx')).toBe(false);
  });

  it('are counted once each, however many steps changed them', () => {
    expect(regionsChanged(emptyEdits())).toBe(0);
    const state = staged(
      { kind: 'outline', key: W, outline: WEST, bases },
      { kind: 'remove', key: E, forum: 'keep', bases },
      { kind: 'restore', key: E, bases },
      { kind: 'outline', key: W, outline: EAST, bases },
    );
    expect(state.edits).toHaveLength(4);
    // Branch review BR-2: East removed and restored again changes nothing.
    expect(regionsChanged(state)).toBe(1);
  });

  it('count a region restored only where it was changed before its removal', () => {
    expect(
      regionsChanged(
        staged(
          { kind: 'remove', key: E, forum: 'keep', bases },
          { kind: 'restore', key: E, bases },
          { kind: 'remove', key: E, forum: 'delete', bases },
          { kind: 'restore', key: E, bases },
        ),
      ),
    ).toBe(0);
    expect(
      regionsChanged(
        staged(
          { kind: 'outline', key: E, outline: WEST, bases },
          { kind: 'remove', key: E, forum: 'keep', bases },
          { kind: 'restore', key: E, bases },
        ),
      ),
    ).toBe(1);
    expect(
      regionsChanged(
        staged(
          { kind: 'remove', key: E, forum: 'keep', bases },
          { kind: 'restore', key: E, bases },
          { kind: 'outline', key: E, outline: WEST, bases },
        ),
      ),
    ).toBe(1);
  });

  it('count a split as both its parts, and a batch by what is in it', () => {
    expect(
      regionsChanged(
        staged({ kind: 'split', key: W, keep: WEST, newKey: newKey(0), other: EAST, bases }),
      ),
    ).toBe(2);
    expect(
      regionsChanged(
        staged({
          kind: 'batch',
          edits: [
            { kind: 'outline', key: W, outline: WEST, bases },
            { kind: 'outline', key: E, outline: EAST, bases },
          ],
        }),
      ),
    ).toBe(2);
  });

  it('leave out what is undone, a new region removed again and a region taken as theirs', () => {
    const added = staged(
      { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
      { kind: 'outline', key: W, outline: EAST, bases },
    );
    expect(regionsChanged(added)).toBe(2);
    expect(regionsChanged(undo(added))).toBe(1);
    expect(
      regionsChanged(
        staged(
          { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
          { kind: 'remove', key: newKey(0), forum: 'keep', bases: {} },
        ),
      ),
    ).toBe(0);
    expect(
      regionsChanged(
        staged(
          { kind: 'outline', key: W, outline: EAST, bases },
          { kind: 'take-theirs', key: W, version: versionOf(1) },
        ),
      ),
    ).toBe(0);
  });
});

describe('regions changed by somebody else', () => {
  it('are told by the version they were loaded as', () => {
    const state = staged({
      kind: 'outline',
      key: W,
      outline: square(40, -80.1, 40.1, -80.02),
      bases: { [W]: versionOf(1) },
    });
    // Somebody moved west's outline meanwhile, and removed east.
    const theirs = square(40, -80.1, 40.1, -79.99);
    const now = [loaded(1, 'west', theirs)];
    const applied = applyEdits(now, state);
    expect(applied.conflicts).toEqual([1]);
    expect(applied.gone).toEqual([]);
    // Take theirs: the outline as it is now, and no conflict.
    const taken = record(state, { kind: 'take-theirs', key: W, version: now[0]!.version });
    const afterTaking = applyEdits(now, taken);
    expect(afterTaking.conflicts).toEqual([]);
    expect(afterTaking.drafts[0]?.outline).toEqual(theirs);
    // Keep mine: the outline staged, sent with the version it has now.
    const kept = record(state, { kind: 'keep-mine', key: W, version: now[0]!.version });
    const afterKeeping = applyEdits(now, kept);
    expect(afterKeeping.conflicts).toEqual([]);
    expect(saveRequest(now, afterKeeping.drafts).request.changes[0]?.version).toBe(now[0]!.version);
  });

  it('are none where the server has the very outline staged: it was saved', () => {
    const moved = square(40, -80.1, 40.1, -80.02);
    const state = staged(
      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
      { kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } },
    );
    // A save whose answer never came: west was saved; east was changed by somebody else.
    const now = [loaded(1, 'west', moved), loaded(2, 'east', square(40, -80, 40.1, -79.95))];
    const applied = applyEdits(now, state);
    expect(applied.conflicts).toEqual([2]);
    expect(saveRequest(now, applied.drafts).request.changes).toEqual([]);
  });

  it('are told when they are gone, until their edits are dropped', () => {
    const state = staged({ kind: 'remove', key: E, forum: 'keep', bases: { [E]: versionOf(2) } });
    const now = [LOADED[0]!];
    expect(applyEdits(now, state).gone).toEqual([2]);
    const dropped = record(state, { kind: 'take-theirs', key: E, version: '' });
    expect(applyEdits(now, dropped).gone).toEqual([]);
  });
});

describe('after a save', () => {
  it('keeps staged only what the server does not have yet', () => {
    const moved = square(40, -80.1, 40.1, -80.01);
    const state = staged(
      { kind: 'outline', key: W, outline: moved, bases: { [W]: versionOf(1) } },
      { kind: 'remove', key: E, forum: 'delete', bases: { [E]: versionOf(2) } },
      {
        kind: 'add',
        key: newKey(0),
        outline: square(40.1, -80.1, 40.2, -80),
        channel: { create: 'North' },
        description: null,
      },
      {
        kind: 'add',
        key: newKey(1),
        outline: square(39.9, -80.1, 40, -80),
        channel: { create: 'South' },
        description: null,
      },
    );
    const { drafts } = applyEdits(LOADED, state);
    // West was saved and North created; east could not be removed and South not created.
    const now = [
      loaded(1, 'west', moved),
      loaded(2, 'east', EAST),
      loaded(7, 'north', square(40.1, -80.1, 40.2, -80)),
    ];
    const left = rebaseAfterSave(drafts, now, state);
    const after = applyEdits(now, left);
    expect(after.conflicts).toEqual([]);
    const { request } = saveRequest(now, after.drafts);
    expect(request.changes).toEqual([]);
    expect(request.removals).toEqual([{ regionId: 2, forum: 'delete', version: now[1]!.version }]);
    expect(request.additions.map((one) => one.channel)).toEqual([{ name: 'South' }]);
    expect(left.undone).toEqual([]);
    // A save of the very drafts again, after which somebody else moved west: still staged,
    // against the version it was first edited from, so that it is a conflict, never overwritten.
    const theirs = [loaded(1, 'west', square(40, -80.1, 40.1, -79.99)), now[1]!];
    const unsaved = rebaseAfterSave(drafts, theirs, state);
    expect(applyEdits(theirs, unsaved).conflicts).toEqual([1]);
    expect(saveRequest(theirs, applyEdits(theirs, unsaved).drafts).request.changes).toEqual([
      expect.objectContaining({ regionId: 1, version: versionOf(1) }),
    ]);
    // Everything saved: nothing staged.
    expect(rebaseAfterSave(applyEdits(now, emptyEdits()).drafts, now, emptyEdits()).edits).toEqual(
      [],
    );
  });
});

describe('a KML file in the editor', () => {
  it('reshapes the regions it names, adds the channels it names, and new ones', () => {
    const drafts = applyEdits(LOADED, emptyEdits()).drafts;
    const edit = kmlEdit(
      [
        { name: 'West', description: null, outline: square(40, -80.2, 40.1, -80), holes: false },
        { name: 'south', description: null, outline: square(39.9, -80.1, 40, -80), holes: false },
        {
          name: 'Far Away',
          description: 'Edge',
          outline: square(41, -80, 41.1, -79.9),
          holes: false,
        },
      ],
      LOADED,
      drafts,
      [{ id: '100000000000000005', name: 'south' }],
      emptyEdits(),
    );
    const after = applyEdits(LOADED, record(emptyEdits(), edit)).drafts;
    expect(after.find((draft) => draft.key === W)?.outline).toEqual(square(40, -80.2, 40.1, -80));
    expect(after.slice(2).map((draft) => [draft.channel, draft.description])).toEqual([
      [{ id: '100000000000000005', name: 'south' }, null],
      [{ create: 'Far Away' }, 'Edge'],
    ]);
  });

  it('takes at most 200 characters of a description as the category of a new channel', () => {
    const long = 'Suburbs '.repeat(40);
    const edit = kmlEdit(
      [
        {
          name: 'Far Away',
          description: long,
          outline: square(41, -80, 41.1, -79.9),
          holes: false,
        },
      ],
      LOADED,
      applyEdits(LOADED, emptyEdits()).drafts,
      [],
      emptyEdits(),
    );
    const [, , fresh] = applyEdits(LOADED, record(emptyEdits(), edit)).drafts;
    expect(fresh?.description).toBe(long.slice(0, 200));
  });

  it('exports what the editor shows, which reads back as the same areas', () => {
    const state = staged(
      { kind: 'outline', key: W, outline: square(40, -80.1, 40.1, -80.02), bases: {} },
      { kind: 'remove', key: E, forum: 'keep', bases: {} },
      {
        kind: 'add',
        key: newKey(0),
        outline: EAST,
        channel: { create: 'North Hills' },
        description: 'Suburbs',
      },
    );
    const areas = exportAreas(LOADED, applyEdits(LOADED, state).drafts);
    expect(areas.map((area) => [area.name, area.description])).toEqual([
      ['west', 'Town'],
      ['North Hills', 'Suburbs'],
    ]);
    const read = readKml(writeKml(areas));
    expect(read.ok && read.areas.map((area) => area.outline)).toEqual([
      square(40, -80.1, 40.1, -80.02),
      EAST,
    ]);
  });
});
