import { describe, expect, it } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { zonedAt } from '../../../test/support/time.js';
import { loadSettings } from '../../config/settings.js';
import { UserError } from '../../discord/errors.js';
import { parseClockInput } from '../../domain/time/clock-input.js';
import { typedTimedTime, type TimedTimes } from './timed.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const ctx = { config: { settings } } as Parameters<typeof typedTimedTime>[0];
const MINUTE = 60_000;

/** What a refusal of `text` says to type instead, or undefined when it says nothing so. */
function hintFor(text: string, party: TimedTimes, now: number): string | undefined {
  try {
    typedTimedTime(ctx, party, 'meet', text, now);
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    return /give the date first, month-day: `([^`]+)`/.exec(err.message)?.[1];
  }
  throw new Error(`"${text}" was not refused`);
}

describe('typedTimedTime: the refusal of a time without a date (review of 2026-11-07)', () => {
  it('suggests a date and the time as typed, in a form that is read back as that date', () => {
    // Made 93 days ago to the minute: every start but this very minute lies past the lead-up
    // limit, so each time without a date is refused with the day it was read on.
    const now = zonedAt('2027-01-14T14:59', settings.timezone);
    const party: TimedTimes = {
      type: 'meetup',
      createdAt: now - settings.maxMeetupLeadupDuration * MINUTE,
      endTime: null,
      timed: { startTime: null },
    };
    const typed = ['3pm', '6:15', '10.17', '7', 'at 6pm', 'noon', 'midnight'];
    for (const text of typed) {
      const hint = hintFor(text, party, now);
      expect(hint, text).toBeDefined();
      const read = parseClockInput(hint ?? '');
      expect(read, `${text}: ${String(hint)}`).toBeDefined();
      expect(read?.month, text).toBeDefined();
    }
  });
});
