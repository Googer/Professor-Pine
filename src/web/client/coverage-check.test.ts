import { describe, expect, it } from 'vitest';
import { findStretches } from '../../domain/regions/fix.js';
import type { Point } from '../../domain/web/editor-data.js';
import { CoverageChecker, type CoverageAnswer, type CoverageRegion } from './coverage-check.js';

function square(south: number, west: number, north: number, east: number): Point[] {
  return [
    [south, west],
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ];
}

const region = (key: string, outline: Point[], version = 'v1'): CoverageRegion => ({
  key,
  version,
  outline,
});

/** The answer of a kind, or a failure. */
function ofKind<K extends CoverageAnswer['kind']>(
  answer: CoverageAnswer | undefined,
  kind: K,
): Extract<CoverageAnswer, { kind: K }> {
  if (answer?.kind !== kind) throw new Error(`expected a ${kind} answer`);
  return answer as Extract<CoverageAnswer, { kind: K }>;
}

describe('the overlaps and gaps the editor shades', () => {
  const checker = (): CoverageChecker => {
    const made = new CoverageChecker();
    made.handle({
      kind: 'loaded',
      regions: [
        region('r1', square(40, -80.1, 40.1, -79.99)),
        region('r2', square(40, -80, 40.1, -79.9)),
      ],
      places: [
        ['gym', 40.05, -79.995],
        ['stop', 40.06, -79.995],
        ['stop', 40.07, -79.995],
        ['powerspot', 40.05, -80.05],
        ['wayfarerGym', 40.05, -79.985],
      ],
    });
    return made;
  };

  it('lists those of the regions as loaded, none of them new, with what lies in them', () => {
    const answer = ofKind(
      checker().handle({
        kind: 'check',
        seq: 1,
        regions: [
          region('r1', square(40, -80.1, 40.1, -79.99)),
          region('r2', square(40, -80, 40.1, -79.9)),
        ],
      }),
      'check',
    );
    expect(answer).toMatchObject({ seq: 1, failed: false });
    expect(answer.pieces).toHaveLength(1);
    expect(answer.pieces[0]).toMatchObject({
      kind: 'overlap',
      between: ['r1', 'r2'],
      fresh: false,
      counts: { gym: 1, stop: 2, powerspot: 0, wayfarerGym: 0 },
    });
    expect(answer.pieces[0]?.rings[0]?.[0]).toEqual([40, -80]);
  });

  it('marks what the staged edits make as new', () => {
    const answer = ofKind(
      checker().handle({
        kind: 'check',
        seq: 2,
        regions: [
          region('r1', square(40, -80.1, 40.1, -79.98), 'v2'),
          region('r2', square(40, -80, 40.1, -79.9)),
        ],
      }),
      'check',
    );
    expect(
      answer.pieces.map((piece) => [piece.kind, piece.fresh, piece.counts.wayfarerGym]),
    ).toEqual([['overlap', true, 1]]);
  });

  it('answers nothing before it knows the regions as loaded', () => {
    expect(new CoverageChecker().handle({ kind: 'check', seq: 3, regions: [] })).toBeUndefined();
  });
});

/**
 * Two pairs of neighbours, each reaching 85 m into the other (at 40° north a thousandth of a
 * degree of longitude is about 85 m): a gym and a stop in the northern strip, nothing in the
 * southern one.
 */
function twoStrips(made = new CoverageChecker()): CoverageChecker {
  const regions = [
    region('nw', square(40, -80.1, 40.1, -79.999)),
    region('ne', square(40, -80, 40.1, -79.9)),
    region('sw', square(39.8, -80.1, 39.9, -79.999)),
    region('se', square(39.8, -80, 39.9, -79.9)),
  ];
  made.handle({
    kind: 'loaded',
    regions,
    places: [
      ['powerspot', 40.05, -80.05],
      ['gym', 40.05, -79.9993],
      ['stop', 40.06, -79.9997],
    ],
  });
  made.handle({ kind: 'check', seq: 1, regions });
  return made;
}

describe('the fixes the editor offers', () => {
  it('says of every piece whether and how it can be fixed', () => {
    const made = new CoverageChecker();
    const regions = [
      region('nw', square(40, -80.1, 40.1, -79.999)),
      region('ne', square(40, -80, 40.1, -79.9)),
      // South-west reaches into south-east at both ends of their border, and south-east's
      // border bows 255 m away from it in the middle.
      region('sw', square(39.5, -80.1, 39.6, -79.999)),
      region('se', [
        [39.45, -80],
        [39.52, -80],
        [39.55, -79.996],
        [39.58, -80],
        [39.65, -80],
        [39.65, -79.9],
        [39.45, -79.9],
        [39.45, -80],
      ]),
    ];
    made.handle({ kind: 'loaded', regions, places: [] });
    const { pieces } = ofKind(made.handle({ kind: 'check', seq: 1, regions }), 'check');
    expect(pieces.map((piece) => [piece.kind, piece.fix])).toEqual([
      ['overlap', { stretch: 'nw/ne#0' }],
      ['overlap', { stretch: 'sw/se#1' }],
      ['overlap', { stretch: 'sw/se#2' }],
      ['gap', { cannot: 'too-wide' }],
    ]);
  });

  it('works out each choice of a stretch, with where each place in it ends up', () => {
    const answer = ofKind(
      twoStrips().handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#0' }),
      'fix-options',
    );
    expect(answer.stretch).toMatchObject({
      id: 'nw/ne#0',
      sides: [['nw'], ['ne']],
      places: [1, 2],
      corner: null,
    });
    expect(answer.options.map((option) => [option.choice, option.ok, option.landings])).toEqual([
      [
        0,
        true,
        [
          { place: 1, key: 'nw' },
          { place: 2, key: 'nw' },
        ],
      ],
      [
        1,
        true,
        [
          { place: 1, key: 'ne' },
          { place: 2, key: 'ne' },
        ],
      ],
      [
        'midline',
        true,
        [
          { place: 1, key: 'ne' },
          { place: 2, key: 'nw' },
        ],
      ],
    ]);
    // North-west's border kept: north-east's outline is rebuilt along it.
    expect(answer.options[0]?.outlines.map((one) => one.key)).toEqual(['ne']);
  });

  it('says a stretch it no longer knows is gone', () => {
    expect(twoStrips().handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#9' })).toEqual({
      kind: 'fix-options',
      seq: 1,
      stretch: null,
      options: [],
      failed: false,
    });
  });

  it('names each place a choice moves into another region, also beyond the slivers', () => {
    const made = new CoverageChecker();
    const regions = bentU();
    made.handle({
      kind: 'loaded',
      regions,
      // A gym in c by the bend of its border, a stop far off in a.
      places: [
        ['gym', ...metres(10, 940)],
        ['stop', ...metres(300, 300)],
      ],
    });
    const [piece] = ofKind(made.handle({ kind: 'check', seq: 1, regions }), 'check').pieces;
    const stretch = piece && 'stretch' in piece.fix ? piece.fix.stretch : '';
    const answer = ofKind(made.handle({ kind: 'fix-options', seq: 1, stretch }), 'fix-options');
    expect(answer.stretch?.places).toEqual([0]);
    // The corner where the three meet is proposed (across the bend, outside the gap) and taken.
    expect(answer.stretch?.corner).not.toBeNull();
    expect(answer.options.find((option) => option.choice === 'midline')).toMatchObject({
      ok: true,
      landings: [{ place: 0, key: 'a' }],
    });
  });

  it('fixes the empty stretches at once, asks about the others, and gives what changed', () => {
    const made = twoStrips();
    const first = ofKind(made.handle({ kind: 'fix-all', seq: 1, ask: 1 }), 'fix-all');
    expect(first).toMatchObject({ ask: 1, fixed: 1, skipped: 0, refused: 0, outlines: [] });
    expect(first.question).toMatchObject({ number: 1 });
    expect(first.question?.stretch).toMatchObject({ sides: [['nw'], ['ne']], places: [1, 2] });
    const done = ofKind(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 0 }),
      'fix-all',
    );
    expect(done).toMatchObject({ ask: 2, fixed: 2, undone: 0, question: null, failed: false });
    expect(done.outlines.map((one) => one.key)).toEqual(['ne', 'sw', 'se']);
  });

  it('counts at its end the stretches refused after the last question', () => {
    // The last stretches waiting could not be fixed: refused on the way to no question.
    const made = twoStrips(
      new CoverageChecker({
        nextQuestion: (state) => ({ state: { ...state, refused: 2 }, question: undefined }),
      }),
    );
    expect(made.handle({ kind: 'fix-all', seq: 1, ask: 1 })).toMatchObject({
      kind: 'fix-all',
      fixed: 1,
      refused: 2,
      question: null,
    });
  });

  it('stops when asked, with what was fixed so far', () => {
    const made = twoStrips();
    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
    const done = ofKind(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 'stop' }),
      'fix-all',
    );
    expect(done).toMatchObject({ fixed: 1, question: null });
    expect(done.outlines.map((one) => one.key)).toEqual(['sw', 'se']);
  });

  it('ignores an answer to a question it is not asking', () => {
    const made = twoStrips();
    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
    // A second click on an answer already sent, or one of a Fix all before.
    expect(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 7, choice: 0 }),
    ).toBeUndefined();
    const done = ofKind(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 3, question: 1, choice: 'skip' }),
      'fix-all',
    );
    expect(done).toMatchObject({ ask: 3, fixed: 1, skipped: 1, question: null });
    expect(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 4, question: 1, choice: 0 }),
    ).toBeUndefined();
  });
});

describe('a fix the worker cannot work out', () => {
  const broken = (): never => {
    throw new Error('the arithmetic gave up');
  };

  it('shows the pieces as not fixable when their stretches cannot be found, and forgets the last', () => {
    let breaks = false;
    const made = twoStrips(
      new CoverageChecker({
        findStretches: (regions, found) => (breaks ? broken() : findStretches(regions, found)),
      }),
    );
    breaks = true;
    const answer = ofKind(
      made.handle({
        kind: 'check',
        seq: 2,
        regions: [
          region('nw', square(40, -80.1, 40.1, -79.999)),
          region('ne', square(40, -80, 40.1, -79.9)),
        ],
      }),
      'check',
    );
    expect(answer).toMatchObject({ seq: 2, failed: false });
    expect(answer.pieces.map((piece) => piece.fix)).toEqual([{ cannot: 'tangled' }]);
    // The stretches of the check before are not offered on the regions of this one.
    expect(made.handle({ kind: 'fix-options', seq: 2, stretch: 'nw/ne#0' })).toMatchObject({
      stretch: null,
      failed: false,
    });
  });

  it('answers the choices of a stretch with a failure', () => {
    const made = twoStrips(new CoverageChecker({ fixOptions: broken }));
    expect(made.handle({ kind: 'fix-options', seq: 1, stretch: 'nw/ne#0' })).toEqual({
      kind: 'fix-options',
      seq: 1,
      stretch: null,
      options: [],
      failed: true,
    });
  });

  it('answers Fix all with a failure, also before anything was checked', () => {
    const made = twoStrips(new CoverageChecker({ fixAllStart: broken }));
    expect(made.handle({ kind: 'fix-all', seq: 1, ask: 1 })).toMatchObject({
      kind: 'fix-all',
      ask: 1,
      failed: true,
      question: null,
      outlines: [],
    });
    expect(new CoverageChecker().handle({ kind: 'fix-all', seq: 1, ask: 2 })).toMatchObject({
      kind: 'fix-all',
      ask: 2,
      failed: true,
    });
  });

  it('answers an answer to Fix all with a failure, and stops Fix all', () => {
    const made = twoStrips(new CoverageChecker({ answer: broken }));
    made.handle({ kind: 'fix-all', seq: 1, ask: 1 });
    expect(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 2, question: 1, choice: 0 }),
    ).toMatchObject({ kind: 'fix-all', ask: 2, failed: true, question: null, outlines: [] });
    expect(
      made.handle({ kind: 'fix-all-answer', seq: 1, ask: 3, question: 1, choice: 0 }),
    ).toBeUndefined();
  });
});

/** A place `x` metres east and `y` metres north of 40° north, 80° west. */
const metres = (x: number, y: number): Point => [40 + y / 111_195, -80 + x / 85_180];

const ring = (...corners: Point[]): Point[] => [...corners, corners[0]!];

/**
 * A gap shaped like a U, 85 m wide and a kilometre deep, round a tongue of `b`: `a` runs round
 * its outside and over its right arm, `c` closes its left arm with a cut that bends down into
 * the arm. The midline of the gap cuts across the bend: land of c goes to a.
 */
const bentU = (): CoverageRegion[] => [
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
      metres(20, 800),
      metres(85, 700),
      metres(85, 1500),
      metres(-500, 1500),
    ),
  ),
];
