import { describe, expect, it } from 'vitest';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { decide as decideWith, withTyped, type DecideContext } from './screenshot-decision.js';
import type { ReportDoubt, ScreenshotReport } from './screenshot-report.js';

const YVELTAL = raidBossesFixture()
  .bosses()
  .find((boss) => boss.key === 'yveltal');

function report(overrides: Partial<ScreenshotReport> = {}): ScreenshotReport {
  return {
    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
    stage: 'egg',
    heads: 5,
    tier: { level: 'T5', shadow: false },
    tierFrom: 'heads',
    cp: null,
    bossName: null,
    boss: null,
    bossFrom: null,
    eliteBadge: false,
    purple: 0,
    clock: { hour: 13, minute: 39 },
    countdown: 600,
    takenAt: 1_000,
    timeFrom: 'clock',
    time: { hatch: 601_000 },
    doubts: [],
    ...overrides,
  };
}

const doubting = (...doubts: ReportDoubt[]) => report({ doubts });

/** Uploaded at 2,000; T5 eggs hatch as Yveltal. */
const CONTEXT: DecideContext = {
  now: 2_000,
  uploadedAt: 2_000,
  // A T5 raid lasts 45 minutes, an elite raid an hour.
  hatchedMinutes: (tier) => (tier.level === 'Elite' ? 60 : 45),
  autoset: (tier) => (tier.level === 'T5' ? YVELTAL : undefined),
};
/** Decided at its upload, unless a test says when it was uploaded. */
const decide = (r: ScreenshotReport, context: Partial<DecideContext> = {}) =>
  decideWith(r, { ...CONTEXT, uploadedAt: context.now ?? CONTEXT.now, ...context });

describe('decide', () => {
  it('reports an egg with its time unasked', () => {
    expect(decide(report())).toEqual({
      kind: 'report',
      raid: {
        gymId: 7,
        tier: { level: 'T5', shadow: false },
        boss: null,
        hatched: false,
        time: { hatch: 601_000 },
        timeUncertain: false,
      },
      doubts: [],
    });
  });

  it('refuses only a screen that is no raid’s, or one whose gym it does not know', () => {
    expect(decide(doubting('not-a-raid-screen', 'no-gym'))).toEqual({
      kind: 'refuse',
      reason: 'not-a-raid-screen',
    });
    const noGym = report({
      gym: { read: 'X', searched: null, gymId: null, place: null, clear: false },
      doubts: ['no-gym'],
    });
    expect(decide(noGym)).toEqual({ kind: 'refuse', reason: 'no-gym' });
  });

  it('asks only which gym, when the gym is not clear', () => {
    const unclear = report({
      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
      doubts: ['gym-unclear', 'time-guessed'],
    });
    expect(decide(unclear)).toEqual({ kind: 'ask', doubts: ['gym-unclear', 'time-guessed'] });
  });

  it('reports with what is known: a hatched raid without its boss, an unknown stage as an egg without a time', () => {
    const noBoss = decide(
      report({ stage: 'hatched', time: { end: 5 }, doubts: ['boss-unknown', 'heads-only'] }),
    );
    expect(noBoss).toMatchObject({
      kind: 'report',
      raid: { boss: null, hatched: true, time: { end: 5 } },
      doubts: ['boss-unknown', 'heads-only'],
    });
    const noStage = decide(report({ stage: null, time: null, doubts: ['stage-unknown'] }));
    expect(noStage).toMatchObject({ kind: 'report', raid: { hatched: false, time: undefined } });
  });

  it('leaves out a countdown too long, and says a guessed, stale or contested time is uncertain', () => {
    expect(decide(doubting('countdown-long'))).toMatchObject({ raid: { time: undefined } });
    for (const doubt of ['time-guessed', 'time-stale', 'time-sources-differ'] as const) {
      expect(decide(doubting(doubt))).toMatchObject({
        raid: { time: { hatch: 601_000 }, timeUncertain: true },
      });
    }
  });

  it('refuses a hatched raid that is over by its countdown', () => {
    const over = report({ stage: 'hatched', time: { end: 1_500 }, doubts: ['time-past'] });
    expect(decide(over)).toEqual({ kind: 'refuse', reason: 'raid-over' });
  });

  it('reports an egg past its hatch as hatched, its end certain, its boss as a hatch sets it', () => {
    const hatched = report({ time: { hatch: 1_000 }, doubts: ['time-past'] });
    expect(decide(hatched)).toMatchObject({
      kind: 'report',
      raid: {
        hatched: true,
        boss: { key: 'yveltal' },
        time: { end: 1_000 + 45 * 60_000 },
        timeUncertain: false,
      },
    });
    // No boss certain for the tier: hatched without one.
    expect(decide(hatched, { autoset: () => undefined })).toMatchObject({
      raid: { hatched: true, boss: null },
    });
    // Its end has passed too: over.
    expect(decide(hatched, { now: 1_000 + 46 * 60_000 })).toEqual({
      kind: 'refuse',
      reason: 'raid-over',
    });
  });

  it('ends an egg past its hatch by its own tier, keeps a boss already named, and doubts a time it guessed', () => {
    const elite = report({
      tier: { level: 'Elite', shadow: false },
      time: { hatch: 1_000 },
      doubts: ['time-past'],
    });
    expect(decide(elite)).toMatchObject({ raid: { time: { end: 1_000 + 60 * 60_000 } } });
    const named = report({
      boss: YVELTAL ?? null,
      time: { hatch: 1_000 },
      doubts: ['time-past'],
    });
    expect(decide(named, { autoset: () => undefined })).toMatchObject({
      raid: { boss: { key: 'yveltal' } },
    });
    for (const doubt of ['time-guessed', 'time-sources-differ'] as const) {
      const guessed = report({ time: { hatch: 1_000 }, doubts: ['time-past', doubt] });
      expect(decide(guessed)).toMatchObject({ raid: { hatched: true, timeUncertain: true } });
    }
  });

  it('refuses an Elite egg whose hatch time it could not read, before asking which gym', () => {
    const elite = { level: 'Elite', shadow: false } as const;
    const noStage = report({ tier: elite, stage: null, time: null, doubts: ['stage-unknown'] });
    expect(decide(noStage)).toEqual({ kind: 'refuse', reason: 'elite-egg-time' });
    const unclear = report({
      tier: elite,
      stage: null,
      time: null,
      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
      doubts: ['gym-unclear', 'stage-unknown'],
    });
    expect(decide(unclear)).toEqual({ kind: 'refuse', reason: 'elite-egg-time' });
    // With its countdown, hatched, or past its hatch, it is reported as before.
    expect(decide(report({ tier: elite }))).toMatchObject({
      kind: 'report',
      raid: { hatched: false, time: { hatch: 601_000 } },
    });
    expect(
      decide(report({ tier: elite, stage: 'hatched', time: null, doubts: ['no-time'] })),
    ).toMatchObject({ kind: 'report', raid: { hatched: true, time: undefined } });
    expect(
      decide(report({ tier: elite, time: { hatch: 1_000 }, doubts: ['time-past'] })),
    ).toMatchObject({ kind: 'report', raid: { hatched: true } });
  });

  it('refuses an Elite egg typed over a read without a stage, unless a time is typed too', () => {
    const unknown = report({ stage: null, time: null, doubts: ['stage-unknown', 'no-time'] });
    const eliteEgg = {
      tier: { level: 'Elite', shadow: false },
      boss: null,
      hatched: false,
    } as const;
    expect(decide(withTyped(unknown, { boss: eliteEgg }))).toEqual({
      kind: 'refuse',
      reason: 'elite-egg-time',
    });
    expect(
      decide(withTyped(unknown, { boss: eliteEgg, time: { hatch: 5_000_000 } })),
    ).toMatchObject({ kind: 'report', raid: { hatched: false, time: { hatch: 5_000_000 } } });
  });

  it('asks rather than report a raid without a tier', () => {
    expect(decide(report({ tier: null, doubts: ['tier-unknown'] }))).toEqual({
      kind: 'ask',
      doubts: ['tier-unknown'],
    });
  });

  it('asks rather than refuse an egg past its hatch whose tier was not read', () => {
    const untiered = report({
      tier: null,
      time: { hatch: 1_000 },
      doubts: ['tier-unknown', 'time-past'],
    });
    expect(decide(untiered)).toEqual({ kind: 'ask', doubts: ['tier-unknown', 'time-past'] });
  });
});

// Plan 7M, review F4: "Read screenshot" may read a message posted a while ago. Without a time
// read, the report's default time would be counted from the read, whatever the message's age.
describe('decide: a screenshot without a time read, decided a while after its upload', () => {
  const MINUTE = 60_000;
  const UPLOADED = 2_000;
  const untimed: [string, ScreenshotReport][] = [
    ['an egg without a countdown', report({ countdown: null, time: null, doubts: ['no-time'] })],
    [
      'a hatched raid without a countdown',
      report({ stage: 'hatched', countdown: null, time: null, doubts: ['no-time'] }),
    ],
    [
      'a countdown longer than a raid lasts',
      report({ countdown: 9 * 3600, time: { hatch: 9 * 3600_000 }, doubts: ['countdown-long'] }),
    ],
    [
      'a stage it could not tell',
      report({ stage: null, countdown: null, time: null, doubts: ['stage-unknown', 'no-time'] }),
    ],
  ];

  it.each(untimed)('refuses %s eleven minutes after its upload', (_, untimedReport) => {
    expect(decide(untimedReport, { now: UPLOADED + 11 * MINUTE, uploadedAt: UPLOADED })).toEqual({
      kind: 'refuse',
      reason: 'untimed-old',
    });
  });

  it.each(untimed)(
    'reports %s as before at its upload and nine minutes after',
    (_, untimedReport) => {
      const atUpload = decide(untimedReport, { now: UPLOADED, uploadedAt: UPLOADED });
      expect(atUpload).toMatchObject({ kind: 'report', raid: { time: undefined } });
      expect(decide(untimedReport, { now: UPLOADED + 9 * MINUTE, uploadedAt: UPLOADED })).toEqual(
        atUpload,
      );
    },
  );

  it('keys on the age of the upload, not on when the screenshot was taken', () => {
    // Taken an hour before its upload, by its file: decided at once, as before.
    const takenEarlier = report({
      countdown: null,
      time: null,
      takenAt: UPLOADED - 60 * MINUTE,
      timeFrom: 'file',
      doubts: ['no-time'],
    });
    expect(decide(takenEarlier, { now: UPLOADED, uploadedAt: UPLOADED })).toMatchObject({
      kind: 'report',
    });
  });

  it('reports a screenshot with a time read however late it is decided', () => {
    const timed = report({ time: { hatch: UPLOADED + 60 * MINUTE } });
    expect(decide(timed, { now: UPLOADED + 30 * MINUTE, uploadedAt: UPLOADED })).toMatchObject({
      kind: 'report',
      raid: { time: { hatch: UPLOADED + 60 * MINUTE } },
    });
  });
});

describe('withTyped', () => {
  it('takes the stage from a typed time when the screenshot did not tell it', () => {
    const unknown = report({ stage: null, time: null, doubts: ['stage-unknown', 'no-time'] });
    const egg = withTyped(unknown, { time: { hatch: 5_000 } });
    expect(egg).toMatchObject({ stage: 'egg', doubts: [] });
    expect(withTyped(unknown, { time: { end: 5_000 } }).stage).toBe('hatched');
  });

  it('takes what the member typed in the place of what was read, with its doubts', () => {
    const read = report({
      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
      stage: 'hatched',
      time: { end: 5 },
      doubts: ['gym-unclear', 'boss-unknown', 'heads-only', 'time-guessed'],
    });
    const typed = withTyped(read, {
      gymId: 7,
      boss: { tier: { level: 'T5', shadow: false }, boss: YVELTAL ?? null, hatched: true },
    });
    expect(typed.doubts).toEqual(['time-guessed']);
    expect(decide(typed)).toMatchObject({
      kind: 'report',
      raid: { gymId: 7, boss: { key: 'yveltal' }, hatched: true, timeUncertain: true },
    });
    const timed = withTyped(read, { gymId: 7, time: { end: 99 } });
    expect(timed.doubts).toEqual(['boss-unknown', 'heads-only']);
    expect(decide(timed)).toMatchObject({ raid: { time: { end: 99 }, timeUncertain: false } });
  });
});
