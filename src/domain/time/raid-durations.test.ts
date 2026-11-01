import { describe, expect, it } from 'vitest';
import { raidEventsFixture } from '../../../test/support/raid-events.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { resolvePartyTime } from './party-time.js';
import {
  hatchTimeForEnd,
  longestRaidDurations,
  raidDurationsAt,
  raidEventAt,
  type RaidDurationRules,
} from './raid-durations.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const MINUTE = 60_000;
const settings = loadSettings(TEST_SETTINGS_PATH);
const at = (iso: string): number => zonedAt(iso, ZONE);

/** The fixture's events: Raid Hours on 14, 21 and 28 October, Raid Days on 31 October and 28 November. */
const rules: RaidDurationRules = { settings, zone: ZONE, events: raidEventsFixture().events() };
const withoutFeed: RaidDurationRules = { ...rules, events: [] };
const withoutWeekly: RaidDurationRules = {
  ...rules,
  settings: { ...settings, raidEvents: { ...settings.raidEvents, weeklyRaidHour: null } },
};
/** The fixture's rules, but a boss of a Raid Day stays this long (it stays 30 in the settings). */
const withRaidDay = (minutes: number): RaidDurationRules => ({
  ...rules,
  settings: {
    ...settings,
    raidEvents: {
      ...settings.raidEvents,
      hatchedDuration: { ...settings.raidEvents.hatchedDuration, 'raid-day': minutes },
    },
  },
});

describe('raidEventAt', () => {
  it('finds an event of the feed from its first minute to just before its end', () => {
    expect(raidEventAt(at('2026-10-14T18:00'), rules)?.name).toBe('Dialga Raid Hour');
    expect(raidEventAt(at('2026-10-14T18:59'), rules)?.name).toBe('Dialga Raid Hour');
    expect(raidEventAt(at('2026-10-14T19:00'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-10-14T17:59'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-10-31T15:30'), rules)?.kind).toBe('raid-day');
  });

  it('knows the weekly Raid Hour without the feed', () => {
    // 2026-11-04 is a Wednesday the fixture does not list.
    expect(raidEventAt(at('2026-11-04T18:30'), rules)).toEqual({
      kind: 'raid-hour',
      name: 'Raid Hour',
      start: at('2026-11-04T18:00'),
      end: at('2026-11-04T19:00'),
    });
    expect(raidEventAt(at('2026-10-14T18:30'), withoutFeed)?.name).toBe('Raid Hour');
    expect(raidEventAt(at('2026-11-05T18:30'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-11-04T18:30'), withoutWeekly)).toBeUndefined();
  });

  it('uses the weekly Raid Hour only for a week in which the feed lists no Raid Hour', () => {
    const moved = {
      kind: 'raid-hour' as const,
      name: 'Moved',
      start: at('2026-11-03T18:00'),
      end: at('2026-11-03T19:00'),
    };
    const feed: RaidDurationRules = { ...rules, events: [moved] };
    expect(raidEventAt(at('2026-11-03T18:30'), feed)?.name).toBe('Moved');
    expect(raidEventAt(at('2026-11-04T18:30'), feed)).toBeUndefined();
    // The next week lists none, so the weekly Raid Hour is back.
    expect(raidEventAt(at('2026-11-11T18:30'), feed)?.name).toBe('Raid Hour');
  });

  it('keeps the weekly Raid Hour in a week in which the feed lists only a Raid Day', () => {
    const day = {
      kind: 'raid-day' as const,
      name: 'Day',
      start: at('2026-11-07T14:00'),
      end: at('2026-11-07T20:00'),
    };
    const feed: RaidDurationRules = { ...rules, events: [day] };
    expect(raidEventAt(at('2026-11-04T18:30'), feed)?.name).toBe('Raid Hour');
  });

  it('knows the weekly Raid Hour on the first Wednesday after the clocks went back', () => {
    expect(raidEventAt(at('2026-11-04T18:30'), withoutFeed)?.name).toBe('Raid Hour');
    expect(raidEventAt(at('2026-11-04T17:30'), withoutFeed)).toBeUndefined();
  });

  it('prefers a Raid Day to a Raid Hour at the same moment', () => {
    const day = {
      kind: 'raid-day' as const,
      name: 'Day',
      start: at('2026-10-14T14:00'),
      end: at('2026-10-14T20:00'),
    };
    expect(
      raidEventAt(at('2026-10-14T18:30'), { ...rules, events: [...rules.events, day] })?.name,
    ).toBe('Day');
  });
});

describe('raidDurationsAt', () => {
  it('gives the configured durations outside events', () => {
    expect(raidDurationsAt('standard', at('2026-10-13T18:30'), rules)).toEqual({
      incubation: 60,
      hatched: 45,
    });
  });

  it('shortens a boss that hatches during a Raid Hour (25 minutes) or a Raid Day (30)', () => {
    expect(raidDurationsAt('standard', at('2026-10-14T18:30'), rules)).toMatchObject({
      incubation: 60,
      hatched: 25,
    });
    expect(raidDurationsAt('standard', at('2026-10-31T14:00'), rules)).toMatchObject({
      incubation: 60,
      hatched: 30,
    });
    expect(raidDurationsAt('standard', at('2026-10-31T14:30'), rules).event?.kind).toBe('raid-day');
    // The last round of the six, 16:30, still counts; at 17:00 the event is over.
    expect(raidDurationsAt('standard', at('2026-10-31T16:30'), rules).hatched).toBe(30);
    expect(raidDurationsAt('standard', at('2026-10-31T17:00'), rules).hatched).toBe(45);
    expect(raidDurationsAt('standard', at('2026-10-14T18:30'), rules).event?.name).toBe(
      'Dialga Raid Hour',
    );
  });

  it('leaves elite raids alone', () => {
    expect(raidDurationsAt('elite', at('2026-10-14T18:30'), rules)).toEqual({
      incubation: 1440,
      hatched: 30,
    });
    expect(raidDurationsAt('elite', at('2026-10-31T15:00'), rules)).toEqual({
      incubation: 1440,
      hatched: 30,
    });
  });
});

describe('hatchTimeForEnd', () => {
  it('goes back by the usual duration outside events', () => {
    expect(hatchTimeForEnd('standard', at('2026-10-13T18:45'), rules)).toBe(at('2026-10-13T18:00'));
    expect(hatchTimeForEnd('elite', at('2026-10-14T18:45'), rules)).toBe(at('2026-10-14T18:15'));
  });

  it('goes back by the duration of the event the raid hatched in', () => {
    // Ends 18:55 on a Raid Hour Wednesday: hatched 18:30, not 18:10.
    expect(hatchTimeForEnd('standard', at('2026-10-14T18:55'), rules)).toBe(at('2026-10-14T18:30'));
    // Ends 16:00 on the Raid Day: hatched 15:30.
    expect(hatchTimeForEnd('standard', at('2026-10-31T16:00'), rules)).toBe(at('2026-10-31T15:30'));
  });

  it('keeps the usual duration for a raid that hatched before the event began', () => {
    // Ends 18:20; 25 minutes earlier is 17:55, before the Raid Hour, so it was an ordinary raid.
    expect(hatchTimeForEnd('standard', at('2026-10-14T18:20'), rules)).toBe(at('2026-10-14T17:35'));
  });
});

describe('hatchTimeForEnd with more than one reading', () => {
  it('lets the event win when two readings fit', () => {
    expect(hatchTimeForEnd('standard', at('2026-10-14T18:35'), rules)).toBe(at('2026-10-14T18:10'));
  });

  it('uses the usual duration when no reading fits', () => {
    expect(hatchTimeForEnd('standard', at('2026-10-14T19:30'), rules)).toBe(at('2026-10-14T18:45'));
  });
});

describe('longestRaidDurations', () => {
  it('does not skip the day the clocks go forward', () => {
    const sunday: RaidDurationRules = {
      ...withoutFeed,
      settings: {
        ...settings,
        raidEvents: {
          ...settings.raidEvents,
          weeklyRaidHour: { weekday: 7, hour: 18, minutes: 60 },
          hatchedDuration: { 'raid-hour': 50, 'raid-day': 60 },
        },
      },
    };
    expect(
      longestRaidDurations('standard', at('2027-03-13T23:30'), at('2027-03-14T18:10'), sunday)
        .hatched,
    ).toBe(50);
  });

  it('is the usual duration when no longer one can apply', () => {
    expect(
      longestRaidDurations('standard', at('2026-10-13T12:00'), at('2026-10-13T14:00'), rules),
    ).toEqual({
      incubation: 60,
      hatched: 45,
    });
    expect(
      longestRaidDurations('standard', at('2026-10-14T17:00'), at('2026-10-14T19:00'), rules)
        .hatched,
    ).toBe(45);
  });

  it('is the usual duration on a Raid Day, whose bosses stay a shorter 30 minutes', () => {
    expect(
      longestRaidDurations('standard', at('2026-10-31T14:15'), at('2026-10-31T15:00'), rules)
        .hatched,
    ).toBe(45);
  });

  it('is the Raid Day duration when the span touches a Raid Day that lasts longer than usual', () => {
    const longDay = withRaidDay(60);
    expect(
      longestRaidDurations('standard', at('2026-10-31T13:15'), at('2026-10-31T15:00'), longDay)
        .hatched,
    ).toBe(60);
    expect(
      longestRaidDurations('standard', at('2026-10-31T17:00'), at('2026-10-31T18:00'), longDay)
        .hatched,
    ).toBe(45);
  });

  it('covers a weekly Raid Hour that lasts longer than usual', () => {
    const long: RaidDurationRules = {
      ...withoutFeed,
      settings: {
        ...settings,
        raidEvents: {
          ...settings.raidEvents,
          hatchedDuration: { 'raid-hour': 50, 'raid-day': 60 },
        },
      },
    };
    expect(
      longestRaidDurations('standard', at('2026-11-03T23:00'), at('2026-11-04T18:10'), long)
        .hatched,
    ).toBe(50);
    expect(
      longestRaidDurations('standard', at('2026-11-05T00:00'), at('2026-11-05T23:00'), long)
        .hatched,
    ).toBe(45);
  });

  it('never changes elite raids', () => {
    expect(
      longestRaidDurations('elite', at('2026-10-31T13:00'), at('2026-10-31T15:00'), rules),
    ).toEqual({
      incubation: 1440,
      hatched: 30,
    });
  });
});

describe('resolvePartyTime with the durations of an event', () => {
  it('accepts a hatch time an hour ago on a long Raid Day and refuses it on another day', () => {
    const longDay = withRaidDay(60);
    const ask = (now: number) => {
      const durations = longestRaidDurations(
        'standard',
        now - 60 * MINUTE,
        now + 60 * MINUTE,
        longDay,
      );
      return resolvePartyTime({
        text: 'at 2:05pm',
        now,
        zone: ZONE,
        parameter: 'hatch',
        partyType: 'raid',
        raidKind: 'standard',
        settings,
        durations,
      });
    };
    expect(ask(at('2026-10-31T15:00'))).toEqual({ kind: 'time', at: at('2026-10-31T14:05') });
    expect(ask(at('2026-10-30T15:00')).kind).toBe('out-of-range');
  });

  it('lets a duration set by hand for the raid win', () => {
    const now = at('2026-10-31T15:00');
    const result = resolvePartyTime({
      text: 'in 80',
      now,
      zone: ZONE,
      parameter: 'end',
      partyType: 'raid',
      raidKind: 'standard',
      settings,
      durations: { incubation: 60, hatched: 60 },
      party: { creationTime: now, hatchTime: now, hatchedDuration: 90 },
    });
    expect(result).toEqual({ kind: 'time', at: now + 80 * MINUTE });
  });
});
