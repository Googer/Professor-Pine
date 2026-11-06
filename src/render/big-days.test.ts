import { describe, expect, it } from 'vitest';
import {
  bigDayLabel,
  dayDateWords,
  dayShortWords,
  onThisDayLine,
  onThisDayTitle,
  yearsAgoWords,
} from './big-days.js';
import { numberWord } from './number-words.js';

describe('the words of big days', () => {
  it('names a day by its boss and its share of the day’s raids, without an article (G11, B8)', () => {
    expect(bigDayLabel({ name: 'Mewtwo', raids: 180 }, 412)).toBe('Mewtwo day, 180 of 412 raids');
    expect(bigDayLabel(undefined, 412)).toBe('412 raids');
    expect(bigDayLabel(undefined, 1_412)).toBe('1,412 raids');
  });

  it('writes a day’s date in full and short, as the calendar day it is', () => {
    expect(dayDateWords('2019-10-08')).toBe('Tuesday, October 8, 2019');
    expect(dayShortWords('2019-10-08')).toBe('Oct 8');
    // The day of a change of the clocks is the calendar day, whatever the zone.
    expect(dayDateWords('2019-11-03')).toBe('Sunday, November 3, 2019');
  });

  it('counts the years ago in words up to ten, then in digits (G13)', () => {
    expect(yearsAgoWords(1)).toBe('One year ago today');
    expect(yearsAgoWords(6)).toBe('Six years ago today');
    expect(yearsAgoWords(10)).toBe('Ten years ago today');
    expect(yearsAgoWords(12)).toBe('12 years ago today');
    expect(numberWord(9)).toBe('nine');
    expect(numberWord(11)).toBe('11');
  });

  it('says a line of “On this day” with the boss’s raids and the day’s', () => {
    expect(onThisDayLine(6, { name: 'Mewtwo', raids: 180 }, 412)).toBe(
      'Six years ago today: 180 Mewtwo raids, 412 raids in all.',
    );
    expect(onThisDayLine(1, undefined, 95)).toBe('One year ago today: 95 raids.');
    expect(onThisDayTitle('2026-10-08')).toBe('On this day, October 8');
  });
});
