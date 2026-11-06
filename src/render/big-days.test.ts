import { describe, expect, it } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import {
  bigDayLabel,
  dayDateWords,
  dayShortWords,
  onThisDayLine,
  onThisDayMessage,
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

  it('says a line of “On this day” as the page labels the day (B8)', () => {
    expect(onThisDayLine(6, { name: 'Mewtwo', raids: 180 }, 412)).toBe(
      'Six years ago today: Mewtwo day, 180 of 412 raids.',
    );
    expect(onThisDayLine(1, undefined, 95)).toBe('One year ago today: 95 raids.');
    expect(onThisDayTitle('2026-10-08')).toBe('On this day, October 8, 2026');
  });

  it('makes the post one container: the title, a line a year newest first, the history page', () => {
    const message = onThisDayMessage(
      '2026-10-08',
      [
        { years: 6, boss: { name: 'Mewtwo', raids: 180 }, raids: 412 },
        { years: 7, boss: undefined, raids: 95 },
      ],
      'https://pine.example/s/412345678901234567/history',
    );
    expect(message.v2).toBe(true);
    expect(message.components).toHaveLength(1);
    expect(textOf(message)).toBe(
      [
        '## On this day, October 8, 2026',
        'Six years ago today: Mewtwo day, 180 of 412 raids.',
        'Seven years ago today: 95 raids.',
        '-# [This server’s history](<https://pine.example/s/412345678901234567/history>)',
      ].join('\n'),
    );
    // Without a web address, no link.
    expect(textOf(onThisDayMessage('2026-10-08', [{ years: 1, boss: undefined, raids: 30 }]))).toBe(
      ['## On this day, October 8, 2026', 'One year ago today: 30 raids.'].join('\n'),
    );
  });
});
