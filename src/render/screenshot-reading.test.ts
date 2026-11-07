import { describe, expect, it } from 'vitest';
import type { StoredReport } from '../domain/ocr/screenshot-record.js';
import { accentOf, textDisplays, thumbnailOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import {
  doubtWords,
  maxRefusalWords,
  readingLines,
  refusalWords,
  screenshotMessage,
  shortReading,
  SHOT_COLOUR,
  TWO_SCREENS,
} from './screenshot-reading.js';

const NAMES: Record<number, string> = { 7: 'Heinz *Plant*' };
const gymName = (id: number) => NAMES[id];

function report(overrides: Partial<StoredReport> = {}): StoredReport {
  return {
    gym: { read: 'Heinz Plant`x', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
    stage: 'hatched',
    heads: 5,
    tier: { level: 'T5', shadow: true },
    tierFrom: 'boss',
    cp: 47444,
    bossName: 'Landorus',
    boss: { key: 'landorus_incarnate', name: 'Landorus', tier: { level: 'T5', shadow: true } },
    bossFrom: 'cp',
    eliteBadge: false,
    purple: 0.0832,
    clock: { hour: 1, minute: 38 },
    countdown: 31 * 60 + 2,
    takenAt: 0,
    timeFrom: 'clock',
    time: { end: 1_800_000_000_000 },
    doubts: [],
    ...overrides,
  };
}

describe('readingLines', () => {
  it('shows each element as read and as understood, text read as code', () => {
    expect(readingLines(report(), gymName)).toEqual([
      "**Gym:** read `Heinz Plant'x` → **Heinz \\*Plant\\***",
      '**Time:** clock `1:38`, countdown `0:31:02` → ends at <t:1800000000:t>',
      '**Egg or hatched:** hatched',
      '**Tier:** 5 heads → **Shadow T5**',
      '**Boss:** CP `47444`, name read `Landorus` → **Landorus**',
      '**Shadow purple:** 8.3% of the screen',
    ]);
  });

  it('says what was not read, and the doubts in words', () => {
    const lines = readingLines(
      report({
        gym: { read: null, searched: null, gymId: null, place: null, clear: false },
        stage: 'egg',
        heads: null,
        tier: null,
        clock: null,
        countdown: null,
        time: null,
        doubts: ['no-gym', 'time-guessed'],
      }),
      gymName,
    );
    expect(lines.slice(0, 4)).toEqual([
      '**Gym:** read nothing → no gym',
      '**Time:** clock not read, countdown not read → no time (guessed from the upload)',
      '**Egg or hatched:** an egg',
      '**Tier:** no heads → no tier',
    ]);
    expect(lines.slice(-3)).toEqual([
      'Not sure:',
      `- ${doubtWords('no-gym')}`,
      `- ${doubtWords('time-guessed')}`,
    ]);
  });

  it('says that a clock was read but did not fit, rather than that none was found', () => {
    const lines = readingLines(report({ timeFrom: 'upload', doubts: ['time-guessed'] }), gymName);
    expect(lines.at(-1)).toBe(
      '- The time is a guess from when the screenshot was posted: the phone’s clock (1:38) does not fit that time.',
    );
    expect(doubtWords('time-guessed')).toBe(
      'The time is a guess from when the screenshot was posted: I found no clock.',
    );
  });

  it('says a shadow that does not fit the screen in American spelling', () => {
    expect(doubtWords('shadow-differs')).toBe(
      'Whether the boss is a shadow does not match the color of the screen.',
    );
    expect(doubtWords('shadow-unlisted')).toBe(
      'No current boss of that tier matches the color of the screen (shadow or not).',
    );
  });
});

describe('refusalWords of two screens of one kind (plan 7P)', () => {
  it('points to the mention, or to posting it as it is where screenshots are read passively', () => {
    expect(refusalWords('several')).toBe(
      'This screenshot shows two screens of one kind: post it in the channel with a mention of me to report both.',
    );
    expect(refusalWords('several', true)).toBe(
      'This screenshot shows two screens of one kind: post it in the channel to report both.',
    );
  });
});

describe('maxRefusalWords of split screenshots (plan 7P)', () => {
  const times = { firstBattle: '6:00', lastBattle: '21:00' };
  it('says two screens it could not tell apart, and points to reporting two max battles', () => {
    expect(maxRefusalWords('two-screens', times)).toBe(TWO_SCREENS);
    expect(maxRefusalWords('several', times)).toBe(
      'This screenshot shows two max battles: post it in the channel with a mention of me to report both.',
    );
    expect(maxRefusalWords('several', times, null, true)).toBe(
      'This screenshot shows two max battles: post it in the channel to report both.',
    );
  });
});

describe('shortReading', () => {
  it('names the raid, the gym and the time in one line', () => {
    expect(shortReading(report(), gymName)).toBe(
      'Landorus (Shadow T5) at Heinz \\*Plant\\*, ending at <t:1800000000:t>',
    );
    expect(
      shortReading(
        report({ stage: 'egg', boss: null, time: { hatch: 1_800_000_000_000 } }),
        gymName,
      ),
    ).toBe('Shadow T5 egg at Heinz \\*Plant\\*, hatching at <t:1800000000:t>');
  });

  it('leaves the gym out when it is asked about, and calls a raid of no stage a raid', () => {
    expect(shortReading(report(), gymName, { gym: false })).toBe(
      'Landorus (Shadow T5), ending at <t:1800000000:t>',
    );
    expect(shortReading(report({ stage: null, boss: null, time: null }), gymName)).toBe(
      'Shadow T5 raid at Heinz \\*Plant\\*',
    );
  });

  it('words a refusal', () => {
    expect(refusalWords('no-gym')).toMatch(/gym/);
    expect(refusalWords('raid-over')).toBe('By its countdown this raid has already ended.');
    expect(refusalWords('elite-egg-time')).toBe(
      'I could not read when this Elite egg hatches: report it with `/raid` and its hatch time.',
    );
  });
});

describe('screenshotMessage', () => {
  it('shows what was read beside the screenshot, the doubts in small print, then the question', () => {
    const message = screenshotMessage({
      report: report({ doubts: ['time-guessed', 'heads-only'] }),
      gymName,
      decision: 'With a screenshot like this, I report the raid as above.',
      question: 'Did I read it right?',
      picture: 'attachment://abc.png',
    });
    expect(accentOf(message)).toBe(SHOT_COLOUR);
    expect(thumbnailOf(message)).toBe('attachment://abc.png');
    const [read = '', doubts, last] = textDisplays(message);
    expect(read.split('\n')[0]).toBe("**Gym:** read `Heinz Plant'x` → **Heinz \\*Plant\\***");
    expect(read).not.toContain('Not sure');
    expect(doubts).toMatch(/^-# Not sure: The time is a guess .* The tier comes from the heads/u);
    expect(last).toBe(
      'With a screenshot like this, I report the raid as above.\nDid I read it right?',
    );
    expectV2Sendable({ ...message, files: ['held/abc.png'] });
  });

  it('cuts what was read so that no bold or code is left open', () => {
    const message = screenshotMessage({
      report: report(),
      gymName: () => `Heinz ${'z'.repeat(2_000)}`,
      decision: 'With a screenshot like this, I report the raid as above.',
    });
    const [read = ''] = textDisplays(message);
    expect(read.endsWith('…')).toBe(true);
    const markers = read.replace(/\\./gu, '').match(/\*\*/gu) ?? [];
    expect(markers.length % 2).toBe(0);
    expect((read.match(/`/gu) ?? []).length % 2).toBe(0);
  });

  it('stays within a message with every doubt and long texts, and without a picture', () => {
    const message = screenshotMessage({
      report: report({
        gym: { read: 'x'.repeat(500), searched: 'x', gymId: 7, place: 'local', clear: false },
        bossName: 'y'.repeat(500),
        doubts: [
          'not-a-raid-screen',
          'no-gym',
          'gym-unclear',
          'no-time',
          'time-guessed',
          'time-stale',
          'time-sources-differ',
          'time-past',
          'countdown-long',
          'stage-unknown',
          'tier-unknown',
          'heads-unverified',
          'heads-only',
          'heads-uncertain',
          'heads-boss-conflict',
          'boss-unknown',
          'boss-from-name',
          'boss-name-differs',
          'elite',
          'shadow-unlisted',
          'shadow-differs',
        ],
      }),
      gymName: () => 'z'.repeat(300),
      decision: 'This does not look like the screen of a raid, so I made nothing of it.',
    });
    expect(thumbnailOf(message)).toBeUndefined();
    expectV2Sendable(message);
  });
});
