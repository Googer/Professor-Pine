import type { MaxText, ScreenText } from '../../src/domain/ocr/raid-screen.js';
import type { HeadCount } from '../../src/domain/ocr/tier-heads.js';
import type { ScreenReading } from '../../src/ocr/screen-reader.js';
import type { OcrOutcome, ReadOptions, ScreenshotReader } from '../../src/services/ocr-service.js';
import { Tally } from './tally.js';

/** A reader that cannot run: every screenshot is answered `unavailable` (the test context's). */
export const unavailableReader: ScreenshotReader = {
  read: () => Promise.resolve({ kind: 'unavailable' }),
  full: () => false,
  close: () => Promise.resolve(),
};

/** A reading with nothing on it: no clock, no countdown, no gym, no heads, no purple. */
export function emptyText(): ScreenText {
  return {
    clock: null,
    countdown: null,
    gym: null,
    eliteBadge: false,
    cp: null,
    bossName: null,
    countdownBox: null,
    countdownPlace: null,
    cpBox: null,
  };
}

/**
 * A reading of a raid screen with this text, these heads (a count) and this share of purple: what
 * the reading process would answer, without models. The lines are made up from the text, with
 * boxes, so that what keeps a reading has something to keep.
 */
export function readingOf(
  text: Partial<ScreenText>,
  options: { heads?: number; purple?: number; outside?: number } = {},
): ScreenReading {
  const full = { ...emptyText(), ...text };
  const heads: HeadCount | null =
    options.heads === undefined
      ? null
      : { count: options.heads, score: 0.8, scale: 1, outside: options.outside ?? 0.1 };
  return {
    width: 1080,
    height: 2400,
    text: full,
    band: heads ? { top: 1000, bottom: 1100, unit: 60 } : null,
    heads,
    purple: options.purple ?? 0,
    lines: full.gym
      ? [{ text: full.gym, confidence: 0.95, box: { x0: 100, y0: 150, x1: 900, y1: 220 } }]
      : [],
    status: [],
    ms: 5,
    peakMb: 100,
  };
}

/**
 * An egg of `heads` heads at `gym`, the phone's clock at `clock` and `countdown` seconds to go:
 * the usual screenshot of a test.
 */
export function eggReading(
  gym: string,
  heads: number,
  clock: { hour: number; minute: number } | null,
  countdown = 30 * 60,
): ScreenReading {
  return readingOf({ gym, clock, countdown, countdownPlace: 'centre' }, { heads });
}

/**
 * A max battle's screen (plan 8X-S): Dynamax Machop with two heads at `spot` (the test spot's
 * name by default, read surely), the clock read surely at 13:58 (`MAX_THURSDAY` is 14:00) and
 * `countdown` seconds to go (30 minutes); `max` and `text` change any of it.
 */
export function maxReading(
  spot = 'GAZEBO OF THE PARK',
  max: Partial<MaxText> = {},
  text: Partial<ScreenText> = {},
  heads = 2,
): ScreenReading {
  return readingOf(
    {
      clock: { hour: 13, minute: 58, confidence: 0.97 },
      countdown: 30 * 60,
      countdownPlace: 'centre',
      max: {
        form: 'dynamax',
        species: 'MACHOP',
        powerSpot: spot,
        spotConfidence: 0.95,
        box: { x0: 100, y0: 1200, x1: 900, y1: 1260 },
        ...max,
      },
      ...text,
    },
    { heads },
  );
}

/**
 * What the reading process answers for a split screenshot (plan 7P): the whole picture read as
 * `whole` (a mix of both, or nothing), and its panes, top first, each read as a screenshot of
 * its own; a pane given as `'none'` shows no screen (a map).
 */
export function splitOutcome(
  panes: readonly (ScreenReading | 'none')[],
  whole: ScreenReading = readingOf({}),
): OcrOutcome {
  return {
    kind: 'read',
    reading: whole,
    twoScreens: true,
    cut: 'divider',
    panes: panes.map((pane, i) => ({
      index: i + 1,
      of: panes.length,
      box: { x0: 0, y0: i * 1224, x1: 1080, y1: (i + 1) * 1224 },
      shows: pane === 'none' ? 'none' : pane.text.max ? 'max' : 'raid',
      reading: pane === 'none' ? readingOf({}) : pane,
    })),
  };
}

/** The first bytes of a PNG file: what a fake screenshot starts with, so that it is kept. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The bytes of a fake screenshot named `key`: a PNG's signature, then the key. */
export function screenshotBytes(key: string): Uint8Array {
  return Uint8Array.from([...PNG_SIGNATURE, ...new TextEncoder().encode(key)]);
}

/**
 * The reader of a test: a screenshot's bytes (`screenshotBytes(key)`) name what it answers
 * (`answers`, a reading or another outcome); anything else is `not-an-image`. `reads` counts
 * what was read; with `ahead` set, every screenshot is told it waits behind that many; with
 * `lateAfter`, a screenshot whose `startBy` is earlier is answered `busy`, as `OcrService` does;
 * with `isFull`, `full()` says the queue is full (and `read` answers `busy`), with `fullServers` for
 * those servers alone; `servers` holds the server of every read.
 */
export class FakeScreenshotReader implements ScreenshotReader {
  readonly answers = new Map<string, ScreenReading | OcrOutcome>();
  reads = 0;
  /** The reads begun, as a count a test can wait for (`readsBegun.reached(n)`). */
  readonly readsBegun = new Tally('the reads begun');
  ahead: number | undefined;
  /** When set, the time every screenshot's turn comes: one with an earlier `startBy` is busy. */
  lateAfter: number | undefined;
  /** The queue is full: `full()` says so, and a screenshot is answered `busy`. */
  isFull = false;
  /** Servers whose share of the queue is full (plan 19B-5): as `isFull`, for them alone. */
  readonly fullServers = new Set<string>();
  /** The server of every screenshot read, in order. */
  readonly servers: (string | undefined)[] = [];

  full(server?: string): boolean {
    return this.isFull || (server !== undefined && this.fullServers.has(server));
  }

  /** What reading the screenshot named `key` answers; gives its bytes. */
  add(key: string, answer: ScreenReading | OcrOutcome): Uint8Array {
    this.answers.set(key, answer);
    return screenshotBytes(key);
  }

  read(bytes: Uint8Array, options: ReadOptions = {}): Promise<OcrOutcome> {
    if (this.full(options.server)) return Promise.resolve({ kind: 'busy' });
    if (options.startBy !== undefined && this.lateAfter !== undefined) {
      if (this.lateAfter > options.startBy) return Promise.resolve({ kind: 'busy' });
    }
    this.reads++;
    this.servers.push(options.server);
    this.readsBegun.add();
    if (this.ahead !== undefined) options.onQueued?.(this.ahead);
    const answer = this.answers.get(new TextDecoder().decode(bytes.subarray(PNG_SIGNATURE.length)));
    return new Promise((resolve) => {
      setImmediate(() => {
        if (answer === undefined) resolve({ kind: 'not-an-image' });
        else if ('kind' in answer) resolve(answer);
        else resolve({ kind: 'read', reading: answer });
      });
    });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
