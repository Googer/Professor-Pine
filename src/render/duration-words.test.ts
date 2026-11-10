import { describe, expect, it } from 'vitest';
import { durationWords, relativeStamp } from './duration-words.js';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 28, 18);

describe("a stamp of Discord's as its client words it (plan 8M-11A, S6)", () => {
  const at = (ms: number) => relativeStamp(NOW + ms, NOW, 'en-US');

  it('says a day from 22 hours, not "in 24 hours"', () => {
    expect(at(DAY)).toBe('in a day');
    expect(at(22 * HOUR)).toBe('in a day');
    expect(at(21 * HOUR)).toBe('in 21 hours');
    expect(at(-36 * HOUR)).toBe('2 days ago');
  });

  // Matt, 2026-10-31: Discord's client says "in an hour" from 45 minutes; the map says what is true.
  it('says minutes up to 90 of them, a minute from 45 seconds', () => {
    expect(at(45 * MINUTE)).toBe('in 45 minutes');
    expect(at(-60 * MINUTE)).toBe('60 minutes ago');
    expect(at(89 * MINUTE)).toBe('in 89 minutes');
    expect(at(44 * MINUTE)).toBe('in 44 minutes');
    expect(at(90 * MINUTE)).toBe('in 2 hours');
    expect(at(-45 * SECOND)).toBe('a minute ago');
    expect(at(44 * SECOND)).toBe('in a few seconds');
    expect(at(-10 * SECOND)).toBe('a few seconds ago');
  });

  // Review fix F3: the unit chosen by the rounded values, as moment.js (Discord's) chooses it.
  it('chooses the unit by the rounded count, at the edges as Discord does', () => {
    expect(at(44.6 * SECOND)).toBe('in a minute');
    expect(at(44 * MINUTE + 40 * SECOND)).toBe('in 45 minutes');
    expect(at(21 * HOUR + 40 * MINUTE)).toBe('in a day');
  });

  it('rounds minutes to the nearest, as Discord does: 29 minutes where Discord says so', () => {
    expect(at(29 * MINUTE + 20 * SECOND)).toBe('in 29 minutes');
    expect(at(29 * MINUTE + 40 * SECOND)).toBe('in 30 minutes');
  });

  it("words it in the reader's language", () => {
    expect(relativeStamp(NOW + 3 * HOUR, NOW, 'de-DE')).toBe('in 3 Stunden');
  });
});

describe('a duration Pine composes (plan 8M-11A, S19, S28)', () => {
  it('says exact hours and minutes, minutes as "min", never "m"', () => {
    expect(durationWords(17 * MINUTE)).toBe('17 min');
    expect(durationWords(65 * MINUTE)).toBe('1 h 05 min');
    expect(durationWords(2 * HOUR)).toBe('2 h');
  });

  it('rounds to the nearest minute, as the post says it, and never to nothing', () => {
    // The list's "29 min left" beside the post's "in 29 minutes".
    expect(durationWords(29 * MINUTE + 20 * SECOND)).toBe('29 min');
    expect(durationWords(29 * MINUTE + 40 * SECOND)).toBe('30 min');
    expect(durationWords(20 * SECOND)).toBe('1 min');
  });

  it('has a compact form for a badge', () => {
    expect(durationWords(65 * MINUTE, { compact: true })).toBe('1 h 05');
    expect(durationWords(17 * MINUTE, { compact: true })).toBe('17 min');
    expect(durationWords(2 * HOUR, { compact: true })).toBe('2 h');
  });
});
