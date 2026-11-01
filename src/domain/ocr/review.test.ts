import { describe, expect, it } from 'vitest';
import { maxWrongAt, reviewSummary, wrongAt, type ReviewRecord } from './review.js';
import type {
  FeedbackElement,
  FeedbackRecord,
  StoredMaxReport,
  StoredReport,
} from './screenshot-record.js';

const REPORT: StoredReport = {
  gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
  stage: 'hatched',
  heads: 5,
  tier: { level: 'T5', shadow: false },
  tierFrom: 'boss',
  cp: 45000,
  bossName: 'Yveltai',
  boss: null,
  bossFrom: null,
  eliteBadge: false,
  purple: 0,
  clock: null,
  countdown: 1800,
  takenAt: 0,
  timeFrom: 'upload',
  time: { end: 1 },
  doubts: ['time-guessed', 'boss-unknown'],
};

const wrong = (elements: FeedbackElement[], correction: string): FeedbackRecord => ({
  verdict: 'wrong',
  elements,
  correction,
  memberId: '700000000000000003',
  by: 'other',
  at: 0,
});

function record(
  id: string,
  feedback: FeedbackRecord[],
  report: Partial<StoredReport> = {},
): ReviewRecord {
  return {
    id,
    use: 'raid',
    decision: { kind: 'report' },
    report: { ...REPORT, ...report },
    feedback,
  };
}

describe('wrongAt', () => {
  it('tells a clock that did not fit the upload from no clock at all', () => {
    const base = record('a', []).report;
    expect(wrongAt('time', { ...base, clock: null, doubts: ['time-guessed'] })).toBe(
      'no clock (guessed from the upload)',
    );
    expect(
      wrongAt('time', { ...base, clock: { hour: 9, minute: 5 }, doubts: ['time-guessed'] }),
    ).toBe('clock read but did not fit the upload (guessed from the upload)');
    expect(wrongAt('time', { ...base, clock: { hour: 9, minute: 5 }, doubts: [] })).toBe(
      'clock and countdown read',
    );
  });
});

describe('reviewSummary', () => {
  it('counts what was said wrong by where it went wrong, and the doubts', () => {
    const summary = reviewSummary([
      record('a', [wrong(['gym', 'boss'], 'Heinz Field')]),
      record('b', [wrong(['gym', 'time'], 'heinz field!')]),
      record('c', [{ verdict: 'right', memberId: '700000000000000004', by: 'reporter', at: 0 }]),
      record('d', [], {
        gym: { read: null, searched: null, gymId: null, place: null, clear: false },
      }),
    ]);
    expect(summary).toMatchObject({ records: 4, right: 1, wrong: 2, byUse: { raid: 4 } });
    expect(summary.elements.gym).toEqual({
      'text read, the search chose another gym (a nickname may fix it)': 2,
    });
    expect(summary.elements.boss).toEqual({ 'CP read, no boss decided': 1 });
    expect(summary.elements.time).toEqual({ 'no clock (guessed from the upload)': 1 });
    expect(summary.doubts).toEqual({ 'time-guessed': 4, 'boss-unknown': 4 });
    // The same text corrected the same way twice: a nickname to suggest.
    expect(summary.corrections.map((c) => c.correction)).toEqual(['Heinz Field', 'heinz field!']);
    expect(summary.nicknames).toEqual([
      { read: 'Heinz Plant', correction: 'Heinz Field', times: 2 },
    ]);
  });

  it('leaves out what the member typed: the reader does not answer for it', () => {
    const summary = reviewSummary([
      {
        ...record('a', [wrong(['gym', 'boss'], '')]),
        typed: { gymId: 7 },
      },
    ]);
    expect(summary.elements.gym).toEqual({});
    expect(summary.elements.boss).toEqual({ 'CP read, no boss decided': 1 });
  });
});

/** A max battle's report as a record keeps it: Machop (2★) at an invented Power Spot. */
const MAX: StoredMaxReport = {
  form: 'dynamax',
  speciesRead: 'MACHOP',
  boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
  heads: 2,
  tier: 'D2',
  tierFrom: 'list',
  spot: {
    read: 'MAPLE BENCH',
    readSurely: true,
    match: { kind: 'clear', spot: { id: 'w2', title: 'Maple Bench', local: true } },
  },
  clock: { hour: 13, minute: 58 },
  countdown: 1800,
  takenAt: 0,
  timeFrom: 'clock',
  sureMoment: true,
  countdownEnd: 1_800_000,
  end: 1_800_000,
  endFrom: 'countdown',
  rotationEnd: true,
  firstBattle: 0,
  lastBattle: 2_000_000,
  doubts: ['spot-read-poorly'],
};

describe('reviewSummary of max battles’ screenshots (plan 8X-S)', () => {
  const maxRecord = (
    id: string,
    feedback: FeedbackRecord[],
    max: Partial<StoredMaxReport> = {},
  ) => ({
    ...record(id, feedback, { doubts: ['not-a-raid-screen'] }),
    use: 'max',
    max: { ...MAX, ...max },
  });

  it('counts them apart, by their own doubts and elements', () => {
    const summary = reviewSummary([
      record('a', [wrong(['gym'], '')]),
      maxRecord('m1', [wrong(['spot', 'boss'], 'Maple Bench East')]),
      maxRecord('m2', [wrong(['spot'], '')], {
        spot: { read: 'NOWHERE', readSurely: true, match: { kind: 'unknown' } },
        doubts: ['no-spot'],
      }),
    ]);
    expect(summary).toMatchObject({ records: 1, wrong: 1, byUse: { raid: 1 } });
    expect(summary.doubts).toEqual({ 'time-guessed': 1, 'boss-unknown': 1 });
    expect(summary.max).toMatchObject({ records: 2, wrong: 2, byUse: { max: 2 } });
    expect(summary.max.doubts).toEqual({ 'spot-read-poorly': 1, 'no-spot': 1 });
    expect(summary.max.elements.spot).toEqual({
      'text read, the match chose another Power Spot': 1,
      'text read, no Power Spot found': 1,
    });
    expect(summary.max.elements.boss).toEqual({ 'name read, a listed boss': 1 });
    // Every member's correction is listed, of either kind.
    expect(summary.corrections.map((c) => c.id)).toEqual(['m1']);
  });

  // Review F-4: as a raid's typed elements, `/max screenshot:`'s are not the reader's.
  it('leaves out what the member typed beside a max screenshot', () => {
    const all = ['spot', 'time', 'tier', 'boss'] as FeedbackElement[];
    const summary = reviewSummary([
      {
        ...maxRecord('s', [wrong(all, '')]),
        maxTyped: { spot: { id: 'w2', title: 'Maple Bench' } },
      },
      {
        ...maxRecord('b', [wrong(all, '')]),
        maxTyped: { boss: { ref: { key: 'machamp' }, name: 'Machamp', tier: 'D3' } },
      },
      { ...maxRecord('t', [wrong(all, '')]), maxTyped: { tier: 'D3' } },
      { ...maxRecord('e', [wrong(all, '')]), maxTyped: { end: 1_000_000 } },
    ]);
    const counted = (element: 'spot' | 'time' | 'tier' | 'boss') =>
      Object.values(summary.max.elements[element]).reduce((sum, n) => sum + n, 0);
    // Said wrong on all four records; each typed element is left out where it was typed.
    expect(counted('spot')).toBe(3);
    expect(counted('boss')).toBe(3);
    expect(counted('tier')).toBe(2);
    expect(counted('time')).toBe(3);
    // Each is still a record said to be wrong, counted by what was decided with what was typed.
    expect(summary.max).toMatchObject({ records: 4, wrong: 4, byDecision: { report: 4 } });
  });

  it('tells where a max element went wrong', () => {
    expect(
      maxWrongAt('spot', {
        ...MAX,
        spot: { read: null, readSurely: false, match: { kind: 'unknown' } },
      }),
    ).toBe('no text read');
    expect(maxWrongAt('time', { ...MAX, countdown: null })).toBe(
      'no countdown (the end /max gives)',
    );
    expect(maxWrongAt('tier', { ...MAX, heads: null })).toBe('no heads, Dynamax');
    expect(maxWrongAt('boss', { ...MAX, boss: null })).toBe('name read, no boss found');
  });
});
