import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { boxOf } from '@pine/wayspot-core/region-membership';
import { coverage, type Outlined } from './coverage.js';
import {
  findStretches,
  fixStretch,
  proposedCorner,
  type FixOutcome,
  type Stretch,
  type Stretches,
} from './fix.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });

/** A closed outline of the corners given. */
const ring = (...corners: LatLon[]): LatLon[] => [...corners, { ...corners[0]! }];

/** A closed square of latitudes and longitudes. */
const square = (south: number, west: number, north: number, east: number): LatLon[] =>
  ring(p(south, west), p(north, west), p(north, east), p(south, east));

const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });

/** The stretches of the regions' own overlaps and gaps. */
function stretchesOf(regions: readonly Outlined[]): Stretches {
  return findStretches(regions, coverage(regions));
}

/** The one stretch of the regions' overlaps and gaps. */
function onlyStretch(regions: readonly Outlined[]): Stretch {
  const { stretches } = stretchesOf(regions);
  expect(stretches).toHaveLength(1);
  return stretches[0]!;
}

/** The regions with the outlines a fix rebuilt. */
function fixed(regions: readonly Outlined[], outcome: FixOutcome): Outlined[] {
  if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
  const made = new Map(outcome.outlines.map((one) => [one.key, one.outline]));
  return regions.map((one) => ({ key: one.key, outline: made.get(one.key) ?? one.outline }));
}

/** How many overlaps and gaps the regions have. */
function piecesOf(regions: readonly Outlined[]): number {
  const found = coverage(regions);
  return found.overlaps.length + found.gaps.length;
}

const outlineOf = (regions: readonly Outlined[], key: string): readonly LatLon[] =>
  regions.find((one) => one.key === key)!.outline;

// At 40° north a thousandth of a degree of longitude is about 85 m.

/** West reaches 85 m into east all along their border. */
const strip = (): Outlined[] => [
  region('west', square(40, -80.1, 40.1, -79.999)),
  region('east', square(40, -80, 40.1, -79.9)),
];

/**
 * West reaches 85 m into east at both ends of their border, and east's border bows away from
 * west's in the middle by `bow` thousandths of a degree beyond it: an overlap, a gap, an overlap.
 */
function bowed(bow: number): Outlined[] {
  return [
    region('west', square(40, -80.1, 40.1, -79.999)),
    region(
      'east',
      ring(
        p(39.95, -80),
        p(40.02, -80),
        p(40.05, -79.999 + bow / 1000),
        p(40.08, -80),
        p(40.15, -80),
        p(40.15, -79.9),
        p(39.95, -79.9),
      ),
    ),
  ];
}

/** A strip 85 m wide between west and south (which reaches under west), closed by north. */
const junction = (): Outlined[] => [
  region('west', square(40, -80.1, 40.1, -80.001)),
  region(
    'south',
    ring(p(39.95, -80.1), p(39.95, -79.9), p(40.1, -79.9), p(40.1, -80), p(40, -80), p(40, -80.1)),
  ),
  region('north', square(40.1, -80.1, 40.2, -79.9)),
];

describe('the stretches of slivers between neighbours', () => {
  it('makes a strip where two regions overlap one stretch of the two', () => {
    const found = stretchesOf(strip());
    expect(found.stretches).toHaveLength(1);
    expect(found.stretches[0]?.sides).toEqual([['west'], ['east']]);
    expect(found.stretches[0]?.slivers.map((sliver) => sliver.piece)).toEqual([0]);
    expect(found.pieces).toEqual([{ stretch: found.stretches[0]?.id }]);
  });

  it('makes the overlaps and the gap along one border one stretch', () => {
    const regions = bowed(1);
    const pieces = coverage(regions);
    expect([pieces.overlaps.length, pieces.gaps.length]).toEqual([2, 1]);
    const found = findStretches(regions, pieces);
    expect(found.stretches).toHaveLength(1);
    const [stretch] = found.stretches;
    expect(stretch?.sides).toEqual([['west'], ['east']]);
    expect(stretch?.slivers.map((sliver) => sliver.piece).sort()).toEqual([0, 1, 2]);
    expect(found.pieces.every((piece) => 'stretch' in piece && piece.stretch === stretch?.id)).toBe(
      true,
    );
  });

  it('fixes no sliver wider than the reach: the overlaps on either side are stretches apart', () => {
    // The gap is 255 m wide at its widest.
    const regions = bowed(3);
    const pieces = coverage(regions);
    expect([pieces.overlaps.length, pieces.gaps.length]).toEqual([2, 1]);
    const found = findStretches(regions, pieces);
    expect(found.pieces[2]).toEqual({ cannot: 'too-wide' });
    expect(found.stretches).toHaveLength(2);
    expect(found.stretches.map((stretch) => stretch.slivers.map((sliver) => sliver.piece))).toEqual(
      [[0], [1]],
    );
  });

  it('makes a gap where three regions meet one stretch of the three', () => {
    const found = stretchesOf(junction());
    expect(found.stretches).toHaveLength(1);
    const [stretch] = found.stretches;
    // Along one side runs south alone; along the other west, then north across the strip's end.
    expect(stretch?.sides[0]).toEqual(['south']);
    expect([...(stretch?.sides[1] ?? [])].sort()).toEqual(['north', 'west']);
    expect(found.pieces).toEqual([{ stretch: stretch?.id }]);
  });

  it('fixes no gap that more than three regions close', () => {
    const found = stretchesOf([
      region('west', square(40, -80.1, 40.1, -80.001)),
      region('east', square(40, -80, 40.1, -79.9)),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
      region('south', square(39.9, -80.1, 40, -79.9)),
    ]);
    expect(found.pieces).toEqual([{ cannot: 'tangled' }]);
    expect(found.stretches).toEqual([]);
  });
});

/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
const metres = (x: number, y: number): LatLon => p(40 + y / 111_195, -80 + x / 85_180);

/**
 * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b` 20 m wide: `a`
 * runs round its outside and over the top of its right arm, `c` closes its left arm with a cut
 * 300 m long. The cut's ends lie farther apart than those of any other region's part of it.
 */
const uShaped = (): Outlined[] => [
  region(
    'a',
    ring(
      metres(-500, -500),
      metres(690, -500),
      metres(690, 1500),
      metres(105, 1500),
      metres(105, 1000),
      metres(190, 1000),
      metres(190, 0),
      metres(0, 0),
      metres(0, 1000),
      metres(-500, 1000),
    ),
  ),
  region('b', ring(metres(85, 100), metres(105, 100), metres(105, 1500), metres(85, 1500))),
  region(
    'c',
    ring(
      metres(-500, 1000),
      metres(0, 1000),
      metres(85, 700),
      metres(85, 1500),
      metres(-500, 1500),
    ),
  ),
];

/** West reaches 85 m into east, whose border touches west's halfway along: two overlaps. */
const pinched = (): Outlined[] => [
  region('west', square(40, -80.1, 40.1, -79.999)),
  region(
    'east',
    ring(
      p(39.9, -80.2),
      p(39.9, -79.9),
      p(40.2, -79.9),
      p(40.2, -80.2),
      p(40.15, -80.2),
      p(40.15, -80),
      p(40.1, -80),
      p(40.05, -79.999),
      p(40, -80),
      p(39.95, -80),
      p(39.95, -80.2),
    ),
  ),
];

describe('slivers of awkward shapes', () => {
  it('splits a gap of three regions into the two sides that lie closest together', () => {
    // Its sides are the outside of the U against the tongue and the cut, not the cut against
    // all the rest.
    const found = stretchesOf(uShaped());
    expect(found.stretches).toHaveLength(1);
    expect(found.pieces).toEqual([{ stretch: found.stretches[0]?.id }]);
    expect(found.stretches[0]?.sides.find((side) => side.length === 2)).toContain('c');
  });

  it('fixes no gap with a region inside it', () => {
    const island = region('island', square(40.045, -79.99855, 40.055, -79.99845));
    const found = stretchesOf([...bowed(2), island]);
    // The two overlaps at the ends can be fixed; the gap with the island in it cannot.
    expect(found.pieces).toEqual([
      { stretch: found.stretches[0]?.id },
      { stretch: found.stretches[1]?.id },
      { cannot: 'tangled' },
    ]);
  });

  it('fixes no overlap of a region that lies wholly inside another', () => {
    const found = stretchesOf([
      region('outer', square(40, -80.1, 40.1, -79.9)),
      region('inner', square(40.04, -80.01, 40.05, -80)),
    ]);
    expect(found.pieces).toEqual([{ cannot: 'tangled' }]);
  });

  it('makes the two slivers on either side of where two regions touch one stretch', () => {
    const found = stretchesOf(pinched());
    expect(found.stretches).toHaveLength(1);
    expect(found.stretches[0]?.slivers).toHaveLength(2);
  });
});

describe('one fix', () => {
  it('makes the midline of a strip both regions’ border, and leaves no sliver', () => {
    const regions = strip();
    const after = fixed(regions, fixStretch(regions, onlyStretch(regions), 'midline'));
    expect(piecesOf(after)).toBe(0);
    expect(boxOf(outlineOf(after, 'west')).east).toBeCloseTo(-79.9995, 6);
    expect(boxOf(outlineOf(after, 'east')).west).toBeCloseTo(-79.9995, 6);
  });

  it('gives the other region the border of the region picked', () => {
    const regions = strip();
    const stretch = onlyStretch(regions);
    const westBorder = fixStretch(regions, stretch, 0);
    expect(westBorder).toMatchObject({ ok: true, outlines: [{ key: 'east' }] });
    const afterWest = fixed(regions, westBorder);
    expect(piecesOf(afterWest)).toBe(0);
    expect(boxOf(outlineOf(afterWest, 'east')).west).toBeCloseTo(-79.999, 6);
    const afterEast = fixed(regions, fixStretch(regions, stretch, 1));
    expect(piecesOf(afterEast)).toBe(0);
    expect(boxOf(outlineOf(afterEast, 'west')).east).toBeCloseTo(-80, 6);
  });

  it('removes every sliver of a stretch, overlaps and gap alike, with one fix', () => {
    const regions = bowed(1);
    const stretch = onlyStretch(regions);
    for (const choice of ['midline', 0, 1] as const) {
      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
    }
  });

  it('gives three regions one corner where they meet, proposed in the middle of the strip’s end', () => {
    const regions = junction();
    const stretch = onlyStretch(regions);
    const corner = proposedCorner(stretch);
    expect(corner?.lat).toBeCloseTo(40.1, 3);
    expect(corner?.lon).toBeCloseTo(-80.0005, 4);
    const after = fixed(regions, fixStretch(regions, stretch, 'midline'));
    expect(piecesOf(after)).toBe(0);
    for (const key of ['west', 'south', 'north']) {
      expect(outlineOf(after, key)).toContainEqual(corner);
    }
  });

  it('takes the corner where it was dragged', () => {
    const regions = junction();
    const moved = p(40.09, -80.0003);
    const after = fixed(
      regions,
      fixStretch(regions, onlyStretch(regions), 'midline', { corner: moved }),
    );
    expect(piecesOf(after)).toBe(0);
    for (const key of ['west', 'south', 'north']) {
      expect(outlineOf(after, key)).toContainEqual(moved);
    }
  });

  it('fixes a junction along either side’s borders too', () => {
    const regions = junction();
    const stretch = onlyStretch(regions);
    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 0)))).toBe(0);
    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 1)))).toBe(0);
  });

  it('refuses a corner dragged out of the sliver, which would move land beyond it', () => {
    const regions = junction();
    const stretch = onlyStretch(regions);
    // Into south, 400 m east of the strip.
    expect(fixStretch(regions, stretch, 'midline', { corner: p(40.05, -79.995) })).toEqual({
      ok: false,
      reason: 'corner-outside',
    });
    // Within a metre of the strip's edge is in it.
    expect(fixStretch(regions, stretch, 'midline', { corner: p(40.05, -80.001005) })).toMatchObject(
      { ok: true },
    );
    // The corner is the midline's: the borders do not take it.
    expect(fixStretch(regions, stretch, 0, { corner: p(40.05, -79.995) })).toMatchObject({
      ok: true,
    });
  });

  it('refuses an outline of more than 5,000 corners', () => {
    // West has 5,000 corners, so the bend of the midline takes it over the limit.
    const far = Array.from({ length: 4_996 }, (_unused, i) => p(40.1 - (i + 1) * 0.00002, -80.1));
    const regions = [
      region('west', ring(p(40, -80.1), p(40, -79.999), p(40.1, -79.999), p(40.1, -80.1), ...far)),
      region(
        'east',
        ring(p(40, -80), p(40.05, -80.0003), p(40.1, -80), p(40.1, -79.9), p(40, -79.9)),
      ),
    ];
    expect(fixStretch(regions, onlyStretch(regions), 'midline')).toEqual({
      ok: false,
      reason: 'too-many-corners',
    });
  });

  it('refuses a stretch whose borders changed since it was found', () => {
    const regions = strip();
    const stretch = onlyStretch(regions);
    const moved = [regions[0]!, region('east', square(40, -80.0002, 40.1, -79.9))];
    expect(fixStretch(moved, stretch, 'midline')).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses a fix that would make a new overlap or gap', () => {
    // A region drawn inside the gap since: the fix would cover it.
    const regions = bowed(1);
    const stretch = onlyStretch(regions);
    const island = region('island', square(40.045, -79.99855, 40.055, -79.99845));
    expect(fixStretch([...regions, island], stretch, 'midline')).toEqual({
      ok: false,
      reason: 'new-pieces',
    });
  });
});

/** Outlines at six decimals, as the editor keeps them. */
const sixDecimals = (outline: readonly LatLon[]): LatLon[] =>
  outline.map(({ lat, lon }) => p(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6));

/**
 * West and east along a border that runs 30° east of north for 5 km, west reaching 60 m into
 * east, the corners at six decimals.
 */
function slanted(): Outlined[] {
  const turn = (Math.PI / 180) * 30;
  const at = (x: number, y: number): LatLon =>
    metres(x * Math.cos(turn) + y * Math.sin(turn), y * Math.cos(turn) - x * Math.sin(turn));
  return [
    region('west', sixDecimals(ring(at(-3000, 0), at(-3000, 5000), at(30, 5000), at(30, 0)))),
    region('east', sixDecimals(ring(at(-30, 0), at(-30, 5000), at(3000, 5000), at(3000, 0)))),
  ];
}

/**
 * A gap 85 m wide with straight sides: west and north stacked along its west side, east shaped
 * like a C round it (under it, along its east side and over it).
 */
const stacked = (): Outlined[] => [
  region(
    'east',
    ring(
      p(39.9, -80.1),
      p(39.9, -79.9),
      p(40.3, -79.9),
      p(40.3, -80.1),
      p(40.2, -80.1),
      p(40.2, -80),
      p(40, -80),
      p(40, -80.1),
    ),
  ),
  region('west', square(40, -80.1, 40.13, -80.001)),
  region('north', square(40.13, -80.1, 40.2, -80.001)),
];

describe('fixes of awkward shapes', () => {
  const choices = ['midline', 0, 1] as const;

  it('fixes a U-shaped gap of three regions by its midline or the side of two', () => {
    const regions = uShaped();
    const stretch = onlyStretch(regions);
    expect(stretch.sides).toEqual([['b'], ['c', 'a']]);
    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 'midline')))).toBe(0);
    expect(piecesOf(fixed(regions, fixStretch(regions, stretch, 1)))).toBe(0);
  });

  it('refuses a choice that would make an outline cross itself', () => {
    // On b's border, c and a would meet where it comes nearest their meeting place: at the top
    // of the U's right arm, so that c's new border would cross its own.
    const regions = uShaped();
    expect(fixStretch(regions, onlyStretch(regions), 0)).toEqual({
      ok: false,
      reason: 'crosses-itself',
    });
  });

  it('fixes the slivers on either side of where two regions touch as one', () => {
    const regions = pinched();
    const stretch = onlyStretch(regions);
    for (const choice of choices) {
      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
    }
  });

  it('fixes a strip whichever way the outlines run', () => {
    const [west, east] = strip() as [Outlined, Outlined];
    const regions = [west, region('east', [...east.outline].reverse())];
    const stretch = onlyStretch(regions);
    expect(stretch.sides).toEqual([['west'], ['east']]);
    for (const choice of choices) {
      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
    }
  });

  it('fixes a gap whose straight side runs along two regions, one above the other', () => {
    // West and north are stacked along the gap's west side, which polyclip keeps as one
    // segment from its south end to its north end; east runs round the gap on its other sides.
    const regions = stacked();
    const stretch = onlyStretch(regions);
    expect(stretch.sides[0]).toEqual(['east']);
    expect([...stretch.sides[1]].sort()).toEqual(['north', 'west']);
    for (const choice of choices) {
      expect(piecesOf(fixed(regions, fixStretch(regions, stretch, choice)))).toBe(0);
    }
  });

  it('fixes a slanted border of outlines at six decimals, and its outlines stay so', () => {
    const regions = slanted();
    const stretch = onlyStretch(regions);
    for (const choice of choices) {
      const after = fixed(regions, fixStretch(regions, stretch, choice));
      expect(piecesOf(after)).toBe(0);
      for (const one of after) expect(one.outline).toEqual(sixDecimals(one.outline));
    }
  });
});
