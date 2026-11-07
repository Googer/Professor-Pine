import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseClockInput, parseRelativeMinutes } from './clock-input.js';

interface LegacyClockCase {
  input: string;
  valid: boolean;
  hour?: number;
  minute?: number;
  hasMeridiem?: boolean;
  month?: number;
  day?: number;
}
interface LegacyDurationCase {
  input: string;
  valid: boolean;
  minutes?: number;
}

const legacy = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../test/fixtures/legacy-time-cases.json'),
    'utf8',
  ),
) as { clock: LegacyClockCase[]; duration: LegacyDurationCase[] };

/**
 * Inputs where the new parser is deliberately different from the legacy library, with the
 * reason. Keep this list short: add an entry only when the legacy result is nonsense.
 */
const KNOWN_CLOCK_DIFFERENCES: Record<string, string> = {
  '6 30': 'a space between hour and minute is not supported (legacy read 6:30)',
  '3 30 pm': 'a space between hour and minute is not supported (legacy read 3:30 pm)',
  '10/14/2026 6pm': 'a year in the date is not supported (legacy read 14 October 18:00)',
  '6:00pm!': 'trailing punctuation is not supported (legacy read 18:00)',
  '3:30pm please': 'trailing words are not supported (legacy read 15:30)',
  '6:30ish': 'trailing words are not supported (legacy read 6:30)',
  '3:30:00 pm': 'seconds are not supported (legacy read 15:30)',
  '6 a m': 'a spaced-out meridiem is not supported (legacy read 6 am)',
  'tomorrow 6pm': 'a leading word is not supported (legacy read 18:00 today)',
  '6pm 10-14':
    'the date must come before the time; legacy read this as nonsense (06:10, no meridiem, no date)',
  '10-14 6pm EST':
    'trailing words are not supported; legacy read this as nonsense (22:14, no date)',
  '5m': 'a bare "m" is not a meridiem (legacy read 5 with no am/pm)',
};
const KNOWN_DURATION_DIFFERENCES: Record<string, string> = {
  '2 hours': 'hours are read as hours (legacy read the leading digits as 2 minutes)',
  '1.5 hours': 'hours are read as hours (legacy read the leading digits as 1 minute)',
  '2h': 'hours are read as hours (legacy read the leading digits as 2 minutes)',
  '1e3': 'exponent notation is not a duration (legacy read the leading digit as 1 minute)',
  '10-20 6': 'a date is not a duration (legacy read the leading digits as 10 minutes)',
  '5 raids': 'trailing words are not supported (legacy read the leading digits as 5 minutes)',
};

describe('parseClockInput', () => {
  it('reads common ways of writing a time', () => {
    expect(parseClockInput('3:30pm')).toEqual({ hour: 15, minute: 30, hasMeridiem: true });
    expect(parseClockInput('330 PM')).toEqual({ hour: 15, minute: 30, hasMeridiem: true });
    expect(parseClockInput('3:30')).toEqual({ hour: 3, minute: 30, hasMeridiem: false });
    expect(parseClockInput('1530')).toEqual({ hour: 15, minute: 30, hasMeridiem: false });
    expect(parseClockInput('3pm')).toEqual({ hour: 15, minute: 0, hasMeridiem: true });
    expect(parseClockInput('12am')).toEqual({ hour: 0, minute: 0, hasMeridiem: true });
    expect(parseClockInput('12pm')).toEqual({ hour: 12, minute: 0, hasMeridiem: true });
  });

  it('reads a month and day in front of the time', () => {
    expect(parseClockInput('10-14 6pm')).toEqual({
      hour: 18,
      minute: 0,
      hasMeridiem: true,
      month: 10,
      day: 14,
    });
    expect(parseClockInput('12/25 15:30')).toEqual({
      hour: 15,
      minute: 30,
      hasMeridiem: false,
      month: 12,
      day: 25,
    });
  });

  it('reads a dot between hour and minute, and a dot between month and day', () => {
    expect(parseClockInput('3.30pm')).toEqual({ hour: 15, minute: 30, hasMeridiem: true });
    expect(parseClockInput('6.30 pm')).toEqual({ hour: 18, minute: 30, hasMeridiem: true });
    expect(parseClockInput('10.14 6pm')).toEqual({
      hour: 18,
      minute: 0,
      hasMeridiem: true,
      month: 10,
      day: 14,
    });
    expect(parseClockInput('10-14 3.30pm')).toEqual({
      hour: 15,
      minute: 30,
      hasMeridiem: true,
      month: 10,
      day: 14,
    });
  });

  it('allows a comma and the word "at" between the date and the time', () => {
    const expected = { hour: 18, minute: 0, hasMeridiem: true, month: 10, day: 14 };
    expect(parseClockInput('10-14 at 6pm')).toEqual(expected);
    expect(parseClockInput('10-14, 6pm')).toEqual(expected);
    expect(parseClockInput('10-14, at 6pm')).toEqual(expected);
  });

  it('requires the a or p in front of an m', () => {
    expect(parseClockInput('5m')).toBeUndefined();
    expect(parseClockInput('5pm')).toEqual({ hour: 17, minute: 0, hasMeridiem: true });
    expect(parseClockInput('5 a.m.')).toEqual({ hour: 5, minute: 0, hasMeridiem: true });
  });

  it('reads noon, midnight and tomorrow before a time (the audit of 2026-11-07)', () => {
    expect(parseClockInput('noon')).toEqual({ hour: 12, minute: 0, hasMeridiem: true });
    expect(parseClockInput(' Midnight ')).toEqual({
      hour: 0,
      minute: 0,
      hasMeridiem: true,
      endOfDay: true,
    });
    expect(parseClockInput('tomorrow 6pm')).toEqual({
      hour: 18,
      minute: 0,
      hasMeridiem: true,
      tomorrow: true,
    });
    expect(parseClockInput('tomorrow at 10.17')).toEqual({
      hour: 10,
      minute: 17,
      hasMeridiem: false,
      tomorrow: true,
    });
    // With a date in front, as a clock time has it (review of 2026-11-07).
    expect(parseClockInput('11-9 noon')).toEqual({
      hour: 12,
      minute: 0,
      hasMeridiem: true,
      month: 11,
      day: 9,
    });
    expect(parseClockInput('11-9, at midnight')).toMatchObject({ hour: 0, month: 11, day: 9 });
    expect(parseClockInput('13-9 noon')).toBeUndefined();
    expect(parseClockInput('tomorrow')).toBeUndefined();
    expect(parseClockInput('tomorrow 10-14 6pm')).toBeUndefined();
    expect(parseClockInput('noonish')).toBeUndefined();
    expect(parseClockInput('constructor')).toBeUndefined();
  });

  it('rejects text that is not a time', () => {
    expect(parseClockInput('abc')).toBeUndefined();
    expect(parseClockInput('')).toBeUndefined();
    expect(parseClockInput('3:75')).toBeUndefined();
    expect(parseClockInput('soon')).toBeUndefined();
  });

  it.each(legacy.clock.filter((c) => !(c.input in KNOWN_CLOCK_DIFFERENCES)))(
    'reads "$input" as the legacy bot did',
    ({ input, valid, ...expected }) => {
      const parsed = parseClockInput(input);
      if (!valid) {
        expect(parsed).toBeUndefined();
      } else {
        expect(parsed).toEqual(expected);
      }
    },
  );
});

describe('parseRelativeMinutes', () => {
  it('reads minutes and h:mm', () => {
    expect(parseRelativeMinutes('45')).toBe(45);
    expect(parseRelativeMinutes('1:30')).toBe(90);
    expect(parseRelativeMinutes('0:00')).toBe(0);
    expect(parseRelativeMinutes('abc')).toBeUndefined();
  });

  it('reads minutes with an optional sign and unit', () => {
    for (const [text, minutes] of [
      ['-5', -5],
      ['+5', 5],
      ['30 minutes', 30],
      ['20m', 20],
      ['20 MIN', 20],
      ['1 mins', 1],
      ['1 minute', 1],
      ['  45  ', 45],
    ] as const) {
      expect(parseRelativeMinutes(text)).toBe(minutes);
    }
  });

  it('reads hours, with an optional decimal part, as hours', () => {
    for (const [text, minutes] of [
      ['2 hours', 120],
      ['1.5 hours', 90],
      ['2h', 120],
      ['2 hr', 120],
      ['2 hrs', 120],
      ['1 Hour', 60],
      ['-1h', -60],
    ] as const) {
      expect(parseRelativeMinutes(text)).toBe(minutes);
    }
  });

  it('rejects text that only starts with digits', () => {
    for (const text of [
      '1e3',
      '10-20 6',
      '5 raids',
      '1.5',
      '2 hours ago',
      '2x',
      '1.5.5h',
      'h',
      '',
    ]) {
      expect(parseRelativeMinutes(text)).toBeUndefined();
    }
  });

  it.each(legacy.duration.filter((c) => !(c.input in KNOWN_DURATION_DIFFERENCES)))(
    'reads "$input" as the legacy bot did',
    ({ input, valid, minutes }) => {
      expect(parseRelativeMinutes(input)).toBe(valid ? minutes : undefined);
    },
  );
});
