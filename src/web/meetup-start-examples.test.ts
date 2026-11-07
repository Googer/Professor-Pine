import { describe, expect, it } from 'vitest';
import { parseClockInput, parseRelativeMinutes } from '../domain/time/clock-input.js';
import {
  MEETUP_START_EXAMPLES,
  NEW_MEETUP_START_EXAMPLES,
} from './client/meetup-start-examples.js';

/**
 * The examples the map's meetup forms show for a start (review of 2026-11-07): here, outside
 * `src/web/client/`, since the time module is beyond the client's type check (no Temporal).
 */
describe('the examples of a meetup’s start on the map', () => {
  /** Each example of a placeholder on its own. */
  const examples = (placeholder: string): string[] =>
    placeholder
      .replace(/\(month-day\)/, '')
      .split(/,\s*|\s+or\s+/)
      .map((one) => one.trim())
      .filter((one) => one !== '');

  it('show noon and tomorrow among them, each a form the bot reads', () => {
    for (const placeholder of [NEW_MEETUP_START_EXAMPLES, MEETUP_START_EXAMPLES]) {
      const shown = examples(placeholder);
      expect(shown.length, placeholder).toBeGreaterThan(2);
      expect(
        shown.some((one) => one.startsWith('tomorrow')),
        placeholder,
      ).toBe(true);
      expect(
        shown.some((one) => one.includes('noon')),
        placeholder,
      ).toBe(true);
      for (const one of shown) {
        const read = parseClockInput(one) ?? parseRelativeMinutes(one.replace(/^in /, ''));
        expect(read, one).toBeDefined();
      }
    }
  });
});
