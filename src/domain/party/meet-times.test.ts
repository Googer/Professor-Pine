import { describe, expect, it } from 'vitest';
import { at, PARTY_ZONE } from '../../../test/support/parties.js';
import { MAX_MEET_TIMES, meetTimes, rsvpTimes } from './meet-times.js';

const MINUTE = 60_000;
const HATCH = at('2026-10-13T19:22');
const END = HATCH + 45 * MINUTE;
const raid = { hatchTime: HATCH, endTime: END };
/** The clock times of these choices, `19:22`, in the test zone. */
const clocks = (times: readonly { at: number }[]) =>
  times.map(({ at: time }) =>
    new Date(time).toLocaleTimeString('en-GB', {
      timeZone: PARTY_ZONE,
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

describe('rsvpTimes: the times the game offers to RSVP for a raid', () => {
  it('are the hatch and every 15 minutes after it while the raid lasts', () => {
    expect(clocks(rsvpTimes(raid).map((time) => ({ at: time })))).toEqual([
      '19:22',
      '19:37',
      '19:52',
    ]);
    // A raid of 90 minutes: the same steps (assumed for every tier; Matt checks).
    const long = { hatchTime: HATCH, endTime: HATCH + 90 * MINUTE };
    expect(rsvpTimes(long)).toHaveLength(6);
  });

  it('are none for a raid without times', () => {
    expect(rsvpTimes({ hatchTime: null, endTime: null })).toEqual([]);
  });
});

describe('meetTimes: the choices of Meet…', () => {
  it('merges the RSVP times and the 5-minute times of the next hour, in time order, from now', () => {
    const now = at('2026-10-13T19:28');
    const times = meetTimes(raid, now);
    expect(clocks(times)).toEqual([
      '19:30',
      '19:35',
      '19:37',
      '19:40',
      '19:45',
      '19:50',
      '19:52',
      '19:55',
      '20:00',
      '20:05',
    ]);
    expect(times.filter((time) => time.rsvp).map((time) => time.at)).toEqual([
      HATCH + 15 * MINUTE,
      HATCH + 30 * MINUTE,
    ]);
    // Nothing past, nothing at or after the end.
    expect(times.every((time) => time.at > now && time.at < END)).toBe(true);
  });

  it('starts on an egg at its hatch, and has no time before it', () => {
    const now = at('2026-10-13T18:56');
    const times = meetTimes(raid, now);
    expect(times[0]).toEqual({ at: HATCH, rsvp: true, hatch: true });
    expect(times.every((time) => time.at >= HATCH)).toBe(true);
    // The next hour only: up to 19:55.
    expect(clocks(times).at(-1)).toBe('19:55');
  });

  it('keeps a meeting time set off the grid among them', () => {
    const now = at('2026-10-13T19:28');
    const set = at('2026-10-13T19:41');
    expect(meetTimes(raid, now, set).find((time) => time.at === set)).toEqual({
      at: set,
      rsvp: false,
    });
    // Not one that has passed.
    expect(meetTimes(raid, now, at('2026-10-13T19:25')).map((time) => time.at)).not.toContain(
      at('2026-10-13T19:25'),
    );
  });

  it('holds at most 24, dropping the furthest 5-minute times first, never an RSVP time', () => {
    // A raid of four hours, a minute after its hatch: 15 RSVP times to come, 12 of the grid
    // within the hour, and a time set off the grid: four too many.
    const long = { hatchTime: HATCH, endTime: HATCH + 240 * MINUTE };
    const set = at('2026-10-13T19:43');
    const times = meetTimes(long, HATCH + MINUTE, set);
    expect(times).toHaveLength(MAX_MEET_TIMES);
    expect(MAX_MEET_TIMES).toBe(24);
    expect(times.filter((time) => time.rsvp)).toHaveLength(15);
    expect(times.map((time) => time.at)).toContain(set);
    // The grid's latest given up: 20:05 to 20:20.
    const grid = clocks(times.filter((time) => !time.rsvp && time.at !== set));
    expect(grid).toEqual(['19:25', '19:30', '19:35', '19:40', '19:45', '19:50', '19:55', '20:00']);
    expect(times.map((time) => time.at)).toEqual(
      [...times.map((time) => time.at)].sort((a, b) => a - b),
    );
  });

  it('keeps the earliest RSVP times when even they are too many, and the time set', () => {
    // A raid of eight hours: 31 RSVP times to come.
    const long = { hatchTime: HATCH, endTime: HATCH + 8 * 60 * MINUTE };
    const set = at('2026-10-13T19:43');
    const times = meetTimes(long, HATCH + MINUTE, set);
    expect(times).toHaveLength(MAX_MEET_TIMES);
    expect(times.map((time) => time.at)).toContain(set);
    const rsvp = times.filter((time) => time.rsvp).map((time) => time.at);
    expect(rsvp).toEqual(
      Array.from({ length: MAX_MEET_TIMES - 1 }, (_, n) => HATCH + (n + 1) * 15 * MINUTE),
    );
    expect(meetTimes(long, HATCH + MINUTE)).toHaveLength(MAX_MEET_TIMES);
  });

  it('is empty once no time is left before the end', () => {
    expect(meetTimes(raid, END - MINUTE)).toEqual([]);
    expect(meetTimes({ hatchTime: null, endTime: null }, HATCH)).toEqual([]);
  });
});
