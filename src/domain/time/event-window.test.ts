import { describe, expect, it } from 'vitest';
import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
import { defaultMaxEnd, maxRotation } from './max-end.js';
import { featuredAt, maxEventAt, type MaxEvent } from './max-events.js';
import {
  EVENT_WINDOW_MAX_DAYS,
  eventWindowMaxEvent,
  eventWindowProblem,
  eventWindowRaidEvent,
  withEventWindowMax,
  withEventWindowRaid,
  type EventWindow,
} from './event-window.js';
import { raidDurationRules, raidDurationsAt } from './raid-durations.js';
import type { RaidEvent } from './raid-events.js';

const MINUTE = 60_000;
const settings = {
  standardRaidIncubateDuration: 60,
  standardRaidHatchedDuration: 45,
  eliteRaidIncubateDuration: 1440,
  eliteRaidHatchedDuration: 30,
  timezone: MAX_ZONE,
  raidEvents: {
    // Wednesdays at 18:00 for an hour.
    weeklyRaidHour: { weekday: 3, hour: 18, minutes: 60 },
    hatchedDuration: { 'raid-hour': 25, 'raid-day': 30 },
  },
};
const hours = { firstBattle: '06:00', lastBattle: '21:00' };

/** "Into the Wild 2026": Monday 2026-11-09 10:00 to Friday 2026-11-13 20:00. */
const wild: EventWindow = {
  start: at('2026-11-09T10:00'),
  end: at('2026-11-13T20:00'),
  setBy: '200000000000000001',
  setAt: at('2026-11-09T09:00'),
};

/** Minutes a standard raid that hatches at a local time lasts, with these raid events. */
function hatchedAt(local: string, events: readonly RaidEvent[]): number {
  return raidDurationsAt('standard', at(local), raidDurationRules(settings, events)).hatched;
}

describe('an event window (Matt, 2026-11-09: all-day Raid Hour raids, half-hour max rotations)', () => {
  it('has raids that hatch in it last as in a Raid Hour, and those outside as usual', () => {
    const events = withEventWindowRaid([], wild);
    expect(hatchedAt('2026-11-09T10:00', events)).toBe(25);
    expect(hatchedAt('2026-11-11T07:30', events)).toBe(25);
    expect(hatchedAt('2026-11-13T19:59', events)).toBe(25);
    expect(hatchedAt('2026-11-09T09:59', events)).toBe(45);
    expect(hatchedAt('2026-11-13T20:00', events)).toBe(45);
    // Elite raids keep their own.
    const rules = raidDurationRules(settings, events);
    expect(raidDurationsAt('elite', at('2026-11-10T12:00'), rules).hatched).toBe(30);
  });

  it('leaves the week’s own Raid Hour as it was: the window is no Raid Hour of the feed', () => {
    // Monday and Tuesday only: Wednesday's weekly Raid Hour still applies, the window being no
    // Raid Hour that the week's rule counts as the feed's.
    const short = { ...wild, end: at('2026-11-11T00:00') };
    const events = withEventWindowRaid([], short);
    expect(hatchedAt('2026-11-11T18:10', events)).toBe(25);
    expect(hatchedAt('2026-11-11T19:10', events)).toBe(45);
  });

  it('adds nothing where there is no window, and keeps the feed’s Raid Day winning', () => {
    const day: RaidEvent = {
      kind: 'raid-day',
      name: 'Zacian Raid Day',
      start: at('2026-11-10T14:00'),
      end: at('2026-11-10T17:00'),
    };
    expect(withEventWindowRaid([day], undefined)).toEqual([day]);
    const events = withEventWindowRaid([day], wild);
    expect(events.map((event) => event.name)).toEqual(['Event window', 'Zacian Raid Day']);
    expect(hatchedAt('2026-11-10T15:00', events)).toBe(30);
    expect(eventWindowRaidEvent(wild)).toMatchObject({ kind: 'raid-hour', start: wild.start });
  });

  it('rotates Dynamax and Gigantamax battles every half hour on every day of it', () => {
    const events = withEventWindowMax([], wild);
    for (const tier of ['D1', 'D5', 'G'] as const) {
      expect(maxRotation({ tier, at: at('2026-11-12T14:10'), events, big: [] })).toBe('half-hour');
    }
    const end = (local: string) =>
      defaultMaxEnd({ tier: 'D3', at: at(local), events, big: [], hours, zone: MAX_ZONE });
    // Over several days: each day's battles still stop at the last battle time.
    expect(end('2026-11-09T10:05')).toEqual({ kind: 'end', end: at('2026-11-09T10:30') });
    expect(end('2026-11-11T20:40')).toEqual({ kind: 'end', end: at('2026-11-11T21:00') });
    expect(end('2026-11-12T05:30')).toEqual({ kind: 'end', end: at('2026-11-12T06:30') });
    expect(end('2026-11-12T21:10')).toMatchObject({ kind: 'over' });
    // Before it, a Dynamax battle of the day ends where the window begins.
    expect(end('2026-11-09T07:00')).toEqual({ kind: 'end', end: at('2026-11-09T10:00') });
  });

  it('features nothing, and sets the rotation over every max event on at the same time', () => {
    const monday: MaxEvent = {
      kind: 'max-monday',
      name: 'Dynamax Sableye during Max Monday',
      start: at('2026-11-09T06:00'),
      end: at('2026-11-09T21:00'),
      short: false,
      hoursAssumed: false,
      featured: { gigantamax: false, names: ['Sableye'] },
      id: 'max-mondays-2026-11-09',
    };
    const weekend: MaxEvent = {
      kind: 'max-battle',
      name: 'Dynamax Lugia Max Battle Weekend',
      start: at('2026-11-12T06:00'),
      end: at('2026-11-13T21:00'),
      short: false,
      hoursAssumed: false,
      featured: { gigantamax: false, names: ['Lugia'] },
      id: 'max-battles-2026-11-12',
    };
    const events = withEventWindowMax([monday, weekend], wild);
    expect(featuredAt(events, at('2026-11-09T12:00'), MAX_ZONE).map(({ event }) => event)).toEqual([
      monday,
    ]);
    expect(featuredAt(withEventWindowMax([], wild), at('2026-11-10T12:00'), MAX_ZONE)).toEqual([]);
    expect(eventWindowMaxEvent(wild)).toMatchObject({
      kind: 'max-battle',
      short: true,
      featured: undefined,
      id: undefined,
    });
    // A Max Monday inside the window rotates as the window does: as on a Max Battle Day.
    expect(maxEventAt(events, at('2026-11-09T12:00'))?.eventWindow).toBe(true);
    // So does a Max Battle event of the feed (controller's ruling, 2026-11-09: staff set the
    // window for what they see), whose boss stays featured.
    expect(maxEventAt(events, at('2026-11-12T12:00'))?.eventWindow).toBe(true);
    expect(maxRotation({ tier: 'D5', at: at('2026-11-12T12:00'), events, big: [] })).toBe(
      'half-hour',
    );
    // The weekend's boss first, then the week's Max Monday's, as without a window.
    expect(featuredAt(events, at('2026-11-12T12:00'), MAX_ZONE).map(({ event }) => event)).toEqual([
      weekend,
      monday,
    ]);
  });

  it('refuses an end not after the start, an end in the past, and more than 14 days', () => {
    const now = at('2026-11-09T09:00');
    expect(eventWindowProblem(wild.start, wild.end, now)).toBeUndefined();
    expect(eventWindowProblem(wild.start, wild.start, now)).toBe('end-not-after-start');
    expect(eventWindowProblem(wild.end, wild.start, now)).toBe('end-not-after-start');
    expect(eventWindowProblem(now - 60 * MINUTE, now - MINUTE, now)).toBe('end-past');
    const days = EVENT_WINDOW_MAX_DAYS * 24 * 60 * MINUTE;
    expect(eventWindowProblem(now, now + days, now)).toBeUndefined();
    expect(eventWindowProblem(now, now + days + MINUTE, now)).toBe('too-long');
  });
});
