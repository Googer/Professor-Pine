import { describe, expect, it } from 'vitest';
import {
  addDays,
  clockWords,
  dayWords,
  feedTime,
  isMoment,
  isoDate,
  localTime,
  minuteStamp,
  monthStart,
  sameDay,
  shortDateWords,
  shortDayWords,
  shortHourWords,
  sameWeek,
  startOfHour,
  startOfMonth,
  zoned,
} from './zoned.js';

const ZONE = 'America/New_York';

describe('zoned', () => {
  it('sees a moment in the zone, and gives the same moment back', () => {
    const moment = Date.UTC(2026, 9, 28, 19, 5, 7, 250);
    const time = zoned(moment, ZONE);
    expect([time.year, time.month, time.day, time.hour, time.minute, time.second]).toEqual([
      2026, 10, 28, 15, 5, 7,
    ]);
    expect(time.millisecond).toBe(250);
    expect(time.epochMilliseconds).toBe(moment);
    expect(zoned(moment, 'UTC').hour).toBe(19);
  });
});

describe('zoned and isMoment: what is no whole millisecond', () => {
  it('floors a fraction of a millisecond, as a time stored before plan 8Y may hold one', () => {
    expect(zoned(1793217582000.5, ZONE).epochMilliseconds).toBe(1793217582000);
    expect(zoned(-1.5, 'UTC').epochMilliseconds).toBe(-2);
    expect(isMoment(1793217582000.5)).toBe(true);
  });

  it('throws for what is not finite or beyond the range, and isMoment says no', () => {
    for (const ms of [Number.NaN, Infinity, 8.64e15 + 1, -1e17]) {
      expect(() => zoned(ms, ZONE), String(ms)).toThrow(RangeError);
      expect(isMoment(ms)).toBe(false);
    }
    expect(isMoment(8.64e15)).toBe(true);
  });
});

describe('starts', () => {
  it('starts an hour and a month at their wall-clock start', () => {
    const time = zoned(Date.UTC(2026, 9, 28, 19, 5, 7, 250), ZONE);
    expect(startOfHour(time).epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 19));
    expect(startOfMonth(time).epochMilliseconds).toBe(Date.UTC(2026, 9, 1, 4));
  });

  it('starts a month given by its year and number, in the zone', () => {
    expect(monthStart(2026, 10, ZONE).epochMilliseconds).toBe(Date.UTC(2026, 9, 1, 4));
    // December's start is in standard time, five hours behind.
    expect(monthStart(2019, 12, ZONE).epochMilliseconds).toBe(Date.UTC(2019, 11, 1, 5));
    expect(monthStart(2019, 12, ZONE).add({ months: 1 }).epochMilliseconds).toBe(
      Date.UTC(2020, 0, 1, 5),
    );
  });

  it('keeps the hour of a time in the repeated hour of the fall', () => {
    // 2026-11-01 01:30 EST, the second 01:30: its hour began at 06:00 UTC, not 05:00.
    const second = zoned(Date.UTC(2026, 10, 1, 6, 30), ZONE);
    expect(second.hour).toBe(1);
    expect(startOfHour(second).epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 6));
    const first = zoned(Date.UTC(2026, 10, 1, 5, 30), ZONE);
    expect(startOfHour(first).epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 5));
  });
});

describe('sameDay and sameWeek', () => {
  it('compares the local dates, not 24 hours', () => {
    const late = zoned(Date.UTC(2026, 9, 29, 3, 30), ZONE); // 23:30 on the 28th
    const early = zoned(Date.UTC(2026, 9, 28, 4, 30), ZONE); // 00:30 on the 28th
    expect(sameDay(late, early)).toBe(true);
    expect(sameDay(late, zoned(Date.UTC(2026, 9, 29, 4, 0), ZONE))).toBe(false);
  });

  it('starts a week on Monday', () => {
    const monday = zoned(Date.UTC(2026, 9, 26, 4, 0), ZONE); // Monday 00:00
    const sunday = zoned(Date.UTC(2026, 10, 2, 4, 59), ZONE); // Sunday 23:59
    const sundayBefore = zoned(Date.UTC(2026, 9, 26, 3, 59), ZONE); // Sunday 23:59
    expect(sameWeek(monday, sunday)).toBe(true);
    expect(sameWeek(sunday, monday)).toBe(true);
    expect(sameWeek(monday, sundayBefore)).toBe(false);
  });
});

describe('isoDate', () => {
  it('is the local date, yyyy-mm-dd', () => {
    expect(isoDate(Date.UTC(2026, 10, 22, 3, 30), ZONE)).toBe('2026-11-21');
    expect(isoDate(Date.UTC(2026, 10, 22, 3, 30), 'UTC')).toBe('2026-11-22');
    expect(isoDate(Date.UTC(2026, 0, 5, 12), ZONE)).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  it('keeps the offset of the time it starts from where that offset is valid', () => {
    // 2026-11-02 01:30 EST, a day back: the second 01:30 of the 1st (EST), not the first (EDT).
    const from = zoned(Date.UTC(2026, 10, 2, 6, 30), ZONE);
    const back = addDays(from, -1);
    expect(back.offset).toBe('-05:00');
    expect(back.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 6, 30));
    // From the first 01:30 (EDT) a day on, the day after has only EST: the offset changes.
    expect(addDays(zoned(Date.UTC(2026, 10, 1, 5, 30), ZONE), 1).epochMilliseconds).toBe(
      Date.UTC(2026, 10, 2, 6, 30),
    );
  });

  it('counts calendar days across a change of the clocks, and weeks as seven', () => {
    const from = zoned(Date.UTC(2026, 9, 31, 14), ZONE); // Saturday 10:00 EDT
    expect(addDays(from, 1).epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 15)); // 10:00 EST
    expect(addDays(from, 7).hour).toBe(10);
    // In the spring gap, forward by the gap.
    const before = zoned(Date.UTC(2026, 2, 7, 7, 30), ZONE); // 2026-03-07 02:30 EST
    expect(addDays(before, 1).hour).toBe(3);
  });
});

describe('localTime', () => {
  it('prefers the offset given, where it is valid, in the fall overlap', () => {
    const fields = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
    expect(localTime(fields, ZONE, '-05:00')?.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 6, 30));
    expect(localTime(fields, ZONE, '-04:00')?.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 5, 30));
    // An offset the time cannot have is no preference.
    const noon = { year: 2026, month: 11, day: 1, hour: 12 };
    expect(localTime(noon, ZONE, '-04:00')?.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 17));
    expect(
      localTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, ZONE, '-05:00')
        ?.epochMilliseconds,
    ).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });

  it('is a wall-clock time in the zone', () => {
    const time = localTime({ year: 2026, month: 10, day: 28, hour: 15, minute: 5 }, ZONE);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 19, 5));
    expect(localTime({ year: 2026, month: 10, day: 28 }, ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2026, 9, 28, 4),
    );
  });

  it('moves a time in the spring gap forward an hour', () => {
    // 2026-03-08: the clocks go from 02:00 EST to 03:00 EDT; 02:30 does not exist.
    const time = localTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, ZONE);
    expect(time?.hour).toBe(3);
    expect(time?.minute).toBe(30);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 2, 8, 7, 30));
  });

  it('takes the earlier of the two times in the fall overlap', () => {
    // 2026-11-01: 01:30 comes twice, first EDT (05:30 UTC), then EST (06:30 UTC).
    const time = localTime({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, ZONE);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expect(time?.add({ hours: 1 }).hour).toBe(1);
  });

  it('is nothing for a date or time that does not exist', () => {
    expect(localTime({ year: 2026, month: 2, day: 30, hour: 10 }, ZONE)).toBeUndefined();
    expect(localTime({ year: 2026, month: 13, day: 1 }, ZONE)).toBeUndefined();
    expect(localTime({ year: 2026, month: 10, day: 28, hour: 24 }, ZONE)).toBeUndefined();
    expect(localTime({ year: 2026, month: 10, day: 28, minute: 60 }, ZONE)).toBeUndefined();
  });
});

describe('feedTime', () => {
  it('reads a time with an offset as that moment, seen in the zone', () => {
    const time = feedTime('2026-10-28T10:00:00.000+09:00', ZONE);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 1));
    expect(time?.day).toBe(27);
    expect(time?.hour).toBe(21);
    expect(feedTime('2026-10-28T10:00-04:00', ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2026, 9, 28, 14),
    );
  });

  it('reads a time with Z as that moment in UTC', () => {
    const time = feedTime('2026-10-28T18:00:00.000Z', ZONE);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 18));
    expect(time?.hour).toBe(14);
    expect(feedTime('2026-10-28T18:00:00Z', 'Asia/Tokyo')?.hour).toBe(3);
  });

  it('reads a time without an offset as a wall-clock time in the zone', () => {
    expect(feedTime('2026-10-28T10:00:00.000', ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2026, 9, 28, 14),
    );
    expect(feedTime('2026-10-28T10:00', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 14));
    expect(feedTime('2026-10-28T10:00', 'Asia/Tokyo')?.epochMilliseconds).toBe(
      Date.UTC(2026, 9, 28, 1),
    );
    // In the gap and the overlap as localTime.
    expect(feedTime('2026-03-08T02:30', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 2, 8, 7, 30));
    expect(feedTime('2026-11-01T01:30', ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2026, 10, 1, 5, 30),
    );
  });

  it('reads a date alone as its midnight in the zone', () => {
    const time = feedTime('2026-10-28', ZONE);
    expect(time?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 4));
    expect(time?.hour).toBe(0);
  });

  it('reads the other extended shapes Luxon read: lower case, an hour alone, 24:00', () => {
    expect(feedTime('2026-10-28t10:00', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 14));
    expect(feedTime('2026-10-28T18:00z', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 18));
    expect(feedTime('2026-10-28T10', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 14));
    expect(feedTime('2026-10-28T10:00:00-0400', ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2026, 9, 28, 14),
    );
    expect(feedTime('2026-10-28T10+05', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 9, 28, 5));
    expect(feedTime('2026-10-31T24:00', ZONE)?.epochMilliseconds).toBe(Date.UTC(2026, 10, 1, 4));
    expect(feedTime('2026-12-31T24:00:00.000Z', ZONE)?.epochMilliseconds).toBe(
      Date.UTC(2027, 0, 1),
    );
  });

  it('is nothing for garbage, never a throw', () => {
    for (const text of [
      '',
      ' ',
      'soon',
      'TBA',
      '2026-13-01',
      '2026-02-30T10:00',
      '2026-10-28T25:00',
      '2026-10-28T24:30',
      '2026-10-28T23:59:60',
      '20261028T100000',
      '2026-W44-3',
      '2026-10',
      '2026-10-28T10:00:00.000+25:00',
      '2026-10-28 10:00',
      '28/10/2026',
      '2026-10-28T10:00[America/New_York]',
      ' 2026-10-28',
    ]) {
      expect(feedTime(text, ZONE), text).toBeUndefined();
    }
  });
});

describe('words', () => {
  it('says a clock time as h:mm with a plain space before AM or PM', () => {
    expect(clockWords(zoned(Date.UTC(2026, 9, 28, 19, 5), ZONE))).toBe('3:05 PM');
    expect(clockWords(zoned(Date.UTC(2026, 9, 28, 4, 7), ZONE))).toBe('12:07 AM');
    expect(clockWords(zoned(Date.UTC(2026, 9, 28, 16, 0), ZONE))).toBe('12:00 PM');
    expect(clockWords(zoned(Date.UTC(2026, 9, 28, 14, 59), ZONE))).toBe('10:59 AM');
    expect(clockWords(zoned(Date.UTC(2026, 9, 29, 3, 30), ZONE))).toBe('11:30 PM');
  });

  it('says a day as weekday, month and day', () => {
    expect(dayWords(zoned(Date.UTC(2026, 9, 28, 19), ZONE))).toBe('Wednesday, October 28');
    expect(dayWords(zoned(Date.UTC(2026, 10, 2, 3), ZONE))).toBe('Sunday, November 1');
    expect(dayWords(zoned(Date.UTC(2027, 0, 4, 12), ZONE))).toBe('Monday, January 4');
  });

  // Plan 8V-1 (review V8): the events forum's short words, made here as every other word of time.
  it('says a short weekday, a short date, and an hour without :00, with its half of the day', () => {
    const saturday = zoned(Date.UTC(2026, 10, 21, 19), ZONE);
    expect(shortDayWords(saturday)).toBe('Sat');
    expect(shortDateWords(saturday)).toBe('Nov 21');
    expect(shortDateWords(zoned(Date.UTC(2026, 8, 1, 16), ZONE))).toBe('Sep 1');
    expect(shortHourWords(saturday)).toEqual({ hour: '2', half: 'PM' });
    expect(shortHourWords(zoned(Date.UTC(2026, 10, 21, 22, 30), ZONE))).toEqual({
      hour: '5:30',
      half: 'PM',
    });
    expect(shortHourWords(zoned(Date.UTC(2026, 10, 21, 5), ZONE))).toEqual({
      hour: '12',
      half: 'AM',
    });
  });

  it('stamps a minute as yyyy-MM-dd HH:mm', () => {
    expect(minuteStamp(zoned(Date.UTC(2026, 0, 5, 14, 7, 59), ZONE))).toBe('2026-01-05 09:07');
    expect(minuteStamp(zoned(Date.UTC(2026, 9, 29, 3, 30), ZONE))).toBe('2026-10-28 23:30');
  });
});
