import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { tidyOutline } from '@pine/wayspot-core/outline';
import { ringContains } from '@pine/wayspot-core/region-membership';
import { coverage, newPieces, type Outlined } from './coverage.js';
import {
  answer,
  changedOutlines,
  fixAllFinish,
  fixAllStart,
  fixOptions,
  nextQuestion,
  type FixAllState,
  type Place,
  type Question,
} from './fix-all.js';
import { findStretches, type Stretch } from './fix.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
const ring = (...corners: LatLon[]): LatLon[] => [...corners, { ...corners[0]! }];
const square = (south: number, west: number, north: number, east: number): LatLon[] =>
  ring(p(south, west), p(north, west), p(north, east), p(south, east));
const region = (key: string, outline: LatLon[]): Outlined => ({ key, outline });

/** How many overlaps and gaps the regions have. */
function piecesOf(regions: readonly Outlined[]): number {
  const found = coverage(regions);
  return found.overlaps.length + found.gaps.length;
}

/**
 * Two pairs of neighbours, each reaching 85 m into the other along their border (at 40° north a
 * thousandth of a degree of longitude is about 85 m): north-west and north-east, and further
 * south south-west and south-east.
 */
const twoStrips = (): Outlined[] => [
  region('nw', square(40, -80.1, 40.1, -79.999)),
  region('ne', square(40, -80, 40.1, -79.9)),
  region('sw', square(39.8, -80.1, 39.9, -79.999)),
  region('se', square(39.8, -80, 39.9, -79.9)),
];

/** A gym in the southern strip, nearer south-west's border than south-east's. */
const gymInSouth = { index: 7, lat: 39.85, lon: -79.9993 };

describe('Fix all slivers', () => {
  it('takes the midline of every stretch with nothing in it, and asks about none', () => {
    const regions = twoStrips();
    const state = fixAllStart(regions, []);
    expect(state.fixed).toBe(2);
    expect(nextQuestion(state).question).toBeUndefined();
    expect(piecesOf(state.regions)).toBe(0);
    expect(changedOutlines(regions, state).map((one) => one.key)).toEqual(['nw', 'ne', 'sw', 'se']);
  });

  it('asks about a stretch with something in it, naming where it ends up under each choice', () => {
    const state = fixAllStart(twoStrips(), [gymInSouth]);
    expect(state.fixed).toBe(1);
    const asked = nextQuestion(state);
    expect(asked.question?.stretch.sides).toEqual([['sw'], ['se']]);
    expect(asked.question?.places).toEqual([7]);
    expect(
      asked.question?.options.map((option) => [option.choice, option.ok, option.landings]),
    ).toEqual([
      // South-west's border kept: south-east gives the strip up.
      [0, true, [{ place: 7, key: 'sw' }]],
      [1, true, [{ place: 7, key: 'se' }]],
      ['midline', true, [{ place: 7, key: 'se' }]],
    ]);
  });

  it('applies what was answered, and leaves what was skipped', () => {
    const regions = twoStrips();
    const started = fixAllStart(regions, [gymInSouth]);
    const asked = nextQuestion(started);
    const taken = answer(asked.state, asked.question!, 0);
    expect(piecesOf(taken.regions)).toBe(0);
    expect(taken.fixed).toBe(2);
    expect(nextQuestion(taken).question).toBeUndefined();
    // South-west's border was kept: it is not changed.
    expect(changedOutlines(regions, taken).map((one) => one.key)).toEqual(['nw', 'ne', 'se']);

    const skipped: FixAllState = answer(asked.state, asked.question!, 'skip');
    expect(skipped.skipped).toBe(1);
    expect(piecesOf(skipped.regions)).toBe(1);
    expect(changedOutlines(regions, skipped).map((one) => one.key)).toEqual(['nw', 'ne']);
  });

  it('finds a stretch again whose border an answer before moved', () => {
    // Three regions overlapping where they meet: each answer moves the others' borders there.
    const regions = [
      region('west', square(40, -80.1, 40.1, -79.999)),
      region('east', square(40, -80, 40.1, -79.9)),
      region('north', square(40.099, -80.1, 40.2, -79.9)),
    ];
    const places = [
      { index: 0, lat: 40.05, lon: -79.9993 },
      { index: 1, lat: 40.0995, lon: -80.05 },
      { index: 2, lat: 40.0995, lon: -79.95 },
    ];
    let state = fixAllStart(regions, places);
    expect(state.pending).toHaveLength(3);
    for (let asked = nextQuestion(state); asked.question; asked = nextQuestion(state)) {
      state = answer(asked.state, asked.question, 'midline');
    }
    expect([state.fixed, state.skipped, state.refused]).toEqual([3, 0, 0]);
    expect(piecesOf(state.regions)).toBe(0);
  });

  it('asks once about the stretch found again for two whose borders moved', () => {
    // Two stretches between west and east were waiting, found where east's border lay before
    // an answer moved it 17 m: the stretch there now is found again for both, asked once.
    const regions = [
      region('west', square(40, -80.1, 40.1, -79.999)),
      region('east', square(40, -80.0002, 40.1, -79.9)),
    ];
    const asked = nextQuestion(waitingFor(regions, staleStretches()));
    const question = asked.question!;
    expect(question.stretch.sides).toEqual([['west'], ['east']]);
    expect(question.options.every((option) => option.ok)).toBe(true);
    const ended = nextQuestion(answer(asked.state, question, 'skip'));
    expect(ended.question).toBeUndefined();
    expect([ended.state.skipped, ended.state.refused]).toEqual([1, 0]);
  });

  it('ends the run at a stretch found again for which no choice can be made', () => {
    // Every choice would take west or east over 5,000 corners: the stretch found again for
    // both waiting is refused once, and not looked for again.
    const ended = nextQuestion(waitingFor(crowded(), staleStretches()));
    expect(ended.question).toBeUndefined();
    expect(ended.state.refused).toBe(1);
    expect(ended.state.pending).toEqual([]);
  });

  it('fixes where three regions meet', () => {
    const regions = [
      region('west', square(40, -80.1, 40.1, -80.001)),
      region(
        'south',
        ring(
          p(39.95, -80.1),
          p(39.95, -79.9),
          p(40.1, -79.9),
          p(40.1, -80),
          p(40, -80),
          p(40, -80.1),
        ),
      ),
      region('north', square(40.1, -80.1, 40.2, -79.9)),
    ];
    const state = fixAllStart(regions, []);
    expect(state.fixed).toBe(1);
    expect(piecesOf(state.regions)).toBe(0);
  });

  it('fixes a gap whose straight side runs along two regions, one above the other', () => {
    // West and north stacked along the gap's west side; east shaped like a C round the gap.
    const regions = [
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
    const state = fixAllStart(regions, []);
    expect([state.fixed, state.refused]).toEqual([1, 0]);
    expect(piecesOf(state.regions)).toBe(0);
  });

  it('asks about a stretch whose midline moves a place outside its slivers into another region', () => {
    // A gym in c, 30 m from the gap: the midline gives the bend of c's border to a.
    const gym = place(3, metres(10, 940));
    const regions = bentU();
    const state = fixAllStart(regions, [gym]);
    expect(state.fixed).toBe(0);
    const asked = nextQuestion(state);
    expect(asked.question?.places).toEqual([3]);
    const midline = asked.question?.options.find((option) => option.choice === 'midline');
    expect(midline).toMatchObject({ ok: true, landings: [{ place: 3, key: 'a' }] });
  });

  it('counts a stretch that cannot be fixed once', () => {
    // West has 5,000 corners: the midlines along its east and north borders would take it over
    // the limit, round after round.
    const far = Array.from({ length: 4_996 }, (_unused, i) => p(40.09 - (i + 1) * 0.000018, -80.1));
    const regions = [
      region('west', ring(p(40, -80.1), p(40, -79.999), p(40.1, -79.999), p(40.1, -80.1), ...far)),
      region(
        'east',
        ring(
          p(40, -80),
          p(40.02, -80.0003),
          p(40.04, -80),
          p(40.06, -80.0003),
          p(40.08, -80),
          p(40.1, -80),
          p(40.1, -79.9),
          p(40, -79.9),
        ),
      ),
      region('north', square(40.0995, -80.1, 40.2, -79.9)),
    ];
    const state = fixAllStart(regions, []);
    expect([state.fixed, state.refused]).toEqual([1, 2]);
    expect(nextQuestion(state).question).toBeUndefined();
  });

  it('takes back at the end the fixes that made an overlap or gap the regions as loaded lack', () => {
    const regions = [
      ...twoStrips(),
      region('w', square(40.2, -80.1, 40.3, -80)),
      region('e', square(40.2, -80, 40.3, -79.9)),
    ];
    const started = fixAllStart(regions, []);
    expect(started.fixed).toBe(2);
    // An answer that would push e into w (as no choice of Fix all should).
    const pushed = square(40.2, -80.0005, 40.3, -79.9);
    const question: Question = {
      stretch: { id: 'w/e#9', sides: [['w'], ['e']], slivers: [] },
      places: [],
      options: [{ choice: 0, ok: true, outlines: [region('e', pushed)], landings: [] }],
    };
    const answered = answer(started, question, 0);
    expect(answered.fixed).toBe(3);
    const done = fixAllFinish(regions, answered, coverage(regions));
    expect([done.fixed, done.undone]).toEqual([2, 1]);
    expect(done.regions.find((one) => one.key === 'e')?.outline).toEqual(
      regions.find((one) => one.key === 'e')?.outline,
    );
    expect(piecesOf(done.regions)).toBe(0);
  });
});

describe('the choices of a stretch', () => {
  it('names every place whose region a choice changes, also outside the slivers', () => {
    // The corner where the three meet dragged to the bottom of the U, under b's tongue: the
    // midline then cuts the tongue's foot off.
    const regions = uShaped();
    const stretch = findStretches(regions, coverage(regions)).stretches[0]!;
    const inTongue = place(1, metres(88, 150));
    const elsewhere = place(2, metres(300, 300));
    const options = fixOptions(regions, stretch, [inTongue, elsewhere], {
      corner: metres(92, 62),
    });
    const midline = options.find((option) => option.choice === 'midline');
    expect(midline?.ok).toBe(true);
    expect(midline?.landings.map((landing) => landing.place)).toEqual([1]);
    expect(midline?.landings[0]?.key).not.toBe('b');
  });

  it('keeps its promise on generated borders: tidy outlines, nothing new, every move named', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = seeded(seed);
      const regions = wavy(random);
      const loaded = coverage(regions);
      const places = Array.from({ length: 300 }, (_unused, index) =>
        place(index, metres(-150 + random() * 300, -50 + random() * 3100)),
      );
      const { stretches } = findStretches(regions, loaded);
      expect(stretches.length).toBeGreaterThan(0);
      for (const stretch of stretches) {
        for (const option of fixOptions(regions, stretch, places)) {
          if (!option.ok) continue;
          for (const one of option.outlines) expect(tidyOutline(one.outline).ok).toBe(true);
          const made = new Map(option.outlines.map((one) => [one.key, one.outline]));
          const after = regions.map((one) =>
            region(one.key, [...(made.get(one.key) ?? one.outline)]),
          );
          const now = coverage(after);
          expect(newPieces(now.overlaps, loaded.overlaps)).toEqual([]);
          expect(newPieces(now.gaps, loaded.gaps)).toEqual([]);
          const named = new Set(option.landings.map((landing) => landing.place));
          for (const one of places) {
            const moved = holders(regions, one) !== holders(after, one);
            expect(named.has(one.index)).toBe(moved);
          }
        }
      }
    }
  });
});

/**
 * The two stretches between west and east where west reaches into east at both ends of their
 * border and east's bows 255 m away in the middle: found on outlines an answer since changed.
 */
function staleStretches(): Stretch[] {
  const before = [
    region('west', square(40, -80.1, 40.1, -79.999)),
    region(
      'east',
      ring(
        p(39.95, -80),
        p(40.02, -80),
        p(40.05, -79.996),
        p(40.08, -80),
        p(40.15, -80),
        p(40.15, -79.9),
        p(39.95, -79.9),
      ),
    ),
  ];
  const { stretches } = findStretches(before, coverage(before));
  expect(stretches.map((stretch) => stretch.sides)).toEqual([
    [['west'], ['east']],
    [['west'], ['east']],
  ]);
  return stretches;
}

/** Fix all with the regions as answers left them and the stretches waiting, a gym in each. */
const waitingFor = (regions: Outlined[], stretches: readonly Stretch[]): FixAllState => ({
  regions,
  places: [place(0, p(40.05, -79.9995))],
  pending: stretches.map((stretch) => ({ stretch, places: [0] })),
  log: [],
  fixed: 0,
  skipped: 0,
  refused: 0,
  undone: 0,
});

/**
 * West and east of 5,000 corners each (their northern edges traced with thousands, a metre up
 * and down), west's border bent and east's reaching into west between the bend's ends: every
 * choice adds corners to one of them.
 */
function crowded(): Outlined[] {
  const traced = (from: number, to: number, count: number): LatLon[] =>
    Array.from({ length: count }, (_unused, i) =>
      p(40.2 + (i % 2) * 0.00001, from + ((i + 1) * (to - from)) / (count + 1)),
    );
  return [
    region(
      'west',
      ring(
        p(39.9, -80.1),
        p(39.9, -79.999),
        p(40.05, -79.9985),
        p(40.2, -79.999),
        ...traced(-79.999, -80.1, 4_995),
        p(40.2, -80.1),
      ),
    ),
    region(
      'east',
      ring(
        p(39.9, -79.998),
        p(40, -80),
        p(40.1, -80),
        p(40.2, -79.998),
        ...traced(-79.998, -79.9, 4_994),
        p(40.2, -79.9),
        p(39.9, -79.9),
      ),
    ),
  ];
}

/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
const metres = (x: number, y: number): LatLon => p(40 + y / 111_195, -80 + x / 85_180);

const place = (index: number, at: LatLon): Place => ({ index, ...at });

/** The keys of the regions that hold a place. */
const holders = (regions: readonly Outlined[], at: LatLon): string =>
  regions
    .filter((one) => ringContains(one.outline, at))
    .map((one) => one.key)
    .join(',');

/** A generator of numbers in [0, 1) from a seed, the same every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/**
 * West and east along a border 3 km long, each drawn with its own wavy line within 40 m of it,
 * so that they cross back and forth (overlaps and gaps); the corners at six decimals.
 */
function wavy(random: () => number): Outlined[] {
  const line = (): LatLon[] => {
    const corners = 15 + Math.floor(random() * 40);
    const phase = random() * 6;
    const period = 200 + random() * 500;
    return Array.from({ length: corners }, (_unused, i) => {
      const y = (i * 3000) / (corners - 1);
      return metres(30 * Math.sin(phase + y / period) + 10 * (random() - 0.5), y);
    });
  };
  const six = (outline: LatLon[]): LatLon[] =>
    outline.map(({ lat, lon }) => p(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6));
  return [
    region('west', six(ring(metres(-2000, 0), ...line(), metres(-2000, 3000)))),
    region('east', six(ring(metres(2000, 0), metres(2000, 3000), ...line().reverse()))),
  ];
}

/**
 * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b` 20 m wide: `a`
 * runs round its outside and over the top of its right arm, `c` closes its left arm with a cut.
 * `bend`: the cut bends down to this corner on its way.
 */
function uShaped(bend: LatLon[] = []): Outlined[] {
  return [
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
        ...bend,
        metres(85, 700),
        metres(85, 1500),
        metres(-500, 1500),
      ),
    ),
  ];
}

/** The U whose cut bends down into the left arm: the midline cuts across the bend. */
const bentU = (): Outlined[] => uShaped([metres(20, 800)]);
