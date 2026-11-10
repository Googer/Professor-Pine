import type { Settings } from '../../config/settings.js';
import type { RaidKind } from './party-time.js';
import type { RaidEvent } from './raid-events.js';
import { addDays, sameWeek, zoned } from './zoned.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type RaidDurationSettings = Pick<
  Settings,
  | 'standardRaidIncubateDuration'
  | 'standardRaidHatchedDuration'
  | 'eliteRaidIncubateDuration'
  | 'eliteRaidHatchedDuration'
> & { raidEvents: Pick<Settings['raidEvents'], 'weeklyRaidHour' | 'hatchedDuration'> };

/** Everything that decides how long a raid lasts at a given moment. */
export interface RaidDurationRules {
  settings: RaidDurationSettings;
  /** IANA zone of the weekly Raid Hour (settings.timezone). */
  zone: string;
  /** Raid Hours and Raid Days from the events feed; empty when the feed could not be read. */
  events: readonly RaidEvent[];
}

/** The rules in effect: the settings with the events known at this moment. */
export function raidDurationRules(
  settings: RaidDurationSettings & Pick<Settings, 'timezone'>,
  events: readonly RaidEvent[],
): RaidDurationRules {
  return { settings, zone: settings.timezone, events };
}

/** Minutes an egg takes to hatch and minutes the boss then stays. */
export interface RaidDurations {
  incubation: number;
  hatched: number;
  /** The event that changed the hatched duration, if one did. */
  event?: RaidEvent;
}

/** What `longestRaidStand` reads of the settings: the durations and the events' hatched times. */
export type RaidStandSettings = Pick<
  Settings,
  | 'standardRaidIncubateDuration'
  | 'standardRaidHatchedDuration'
  | 'eliteRaidIncubateDuration'
  | 'eliteRaidHatchedDuration'
> & { raidEvents: Pick<Settings['raidEvents'], 'hatchedDuration'> };

function configured(kind: RaidKind, settings: RaidStandSettings): RaidDurations {
  switch (kind) {
    case 'standard':
      return {
        incubation: settings.standardRaidIncubateDuration,
        hatched: settings.standardRaidHatchedDuration,
      };
    case 'elite':
      return {
        incubation: settings.eliteRaidIncubateDuration,
        hatched: settings.eliteRaidHatchedDuration,
      };
  }
}

/**
 * The weekly Raid Hour of the day `time` falls on, when that day has one. It is a fallback: it
 * applies only to a week (Monday to Sunday in `rules.zone`) in which the feed lists no Raid Hour,
 * so that a Raid Hour the game moved or cancelled is not counted twice. Raid Days do not matter.
 */
function weeklyRaidHourOn(time: number, rules: RaidDurationRules): RaidEvent | undefined {
  const weekly = rules.settings.raidEvents.weeklyRaidHour;
  if (!weekly) return undefined;
  const day = zoned(time, rules.zone);
  // ISO weekdays, as the setting's: 1 is Monday, 7 Sunday.
  if (day.dayOfWeek !== weekly.weekday) return undefined;
  // An event window (`eventWindow`) is no Raid Hour of the feed: the week's own still applies.
  const feedHasOne = rules.events.some(
    (event) =>
      event.kind === 'raid-hour' &&
      event.eventWindow !== true &&
      sameWeek(zoned(event.start, rules.zone), day),
  );
  if (feedHasOne) return undefined;
  const start = day.with({ hour: weekly.hour, minute: 0, second: 0, millisecond: 0 });
  return {
    kind: 'raid-hour',
    name: 'Raid Hour',
    start: start.epochMilliseconds,
    end: start.add({ minutes: weekly.minutes }).epochMilliseconds,
  };
}

const contains = (event: RaidEvent, time: number): boolean =>
  time >= event.start && time < event.end;

/**
 * The Raid Hour or Raid Day going on at `time`: an event of the feed, or else the weekly Raid
 * Hour (used for a week in which the feed lists no Raid Hour). A Raid Day wins over a Raid Hour
 * at the same moment.
 */
export function raidEventAt(time: number, rules: RaidDurationRules): RaidEvent | undefined {
  const current = rules.events.filter((event) => contains(event, time));
  const weekly = weeklyRaidHourOn(time, rules);
  if (weekly && contains(weekly, time)) current.push(weekly);
  return current.find((event) => event.kind === 'raid-day') ?? current[0];
}

/**
 * How long a raid lasts whose egg hatches at `hatchTime`. Only standard raids follow events: a
 * boss that hatches during a Raid Hour or a Raid Day stays for the time configured for that kind
 * of event. Elite raids keep their own durations.
 */
export function raidDurationsAt(
  kind: RaidKind,
  hatchTime: number,
  rules: RaidDurationRules,
): RaidDurations {
  const usual = configured(kind, rules.settings);
  if (kind !== 'standard') return usual;
  const event = raidEventAt(hatchTime, rules);
  if (!event) return usual;
  return { ...usual, hatched: rules.settings.raidEvents.hatchedDuration[event.kind], event };
}

/**
 * When a raid hatched (or will hatch) that ends at `endTime`. The duration depends on the hatch
 * time, so each event duration is tried and the first one that agrees with itself wins; when none
 * does, the usual duration is used.
 */
export function hatchTimeForEnd(kind: RaidKind, endTime: number, rules: RaidDurationRules): number {
  const usual = configured(kind, rules.settings).hatched;
  if (kind === 'standard') {
    const { hatchedDuration } = rules.settings.raidEvents;
    for (const minutes of [hatchedDuration['raid-day'], hatchedDuration['raid-hour']]) {
      const hatch = endTime - minutes * MINUTE;
      if (raidDurationsAt(kind, hatch, rules).hatched === minutes) return hatch;
    }
  }
  return endTime - usual * MINUTE;
}

/**
 * Whether an egg of this kind is made only with its hatch time (review 8E-1 of plan 8E, plan
 * 8F-1): an Elite egg, which without it would stand its whole incubation, about a day, and keep
 * every other report off its gym. `eggNeedsHatchTime` asks it of a tier.
 */
export function eggOfKindNeedsHatchTime(kind: RaidKind): boolean {
  return kind === 'elite';
}

/**
 * How many minutes after its report a raid without an end time can still stand (plan 8H-9, V1:
 * the one rule of the post's last possible time, `latestWithoutTimes`, and the history's
 * `raidTime`), with the `durations` the caller allows for: an egg its incubation and its hatched
 * time, a boss reported hatched its hatched time. `reportedHatched` undefined (a record of the
 * history, which does not keep it): a boss where its kind's eggs need a hatch time
 * (`eggOfKindNeedsHatchTime`: a timeless Elite raid is one since plan 8E), else an egg, the
 * longer of the two. The post knows it, and keeps the day of an Elite egg made before plan 8E.
 */
export function standsWithoutTimes(
  kind: RaidKind,
  reportedHatched: boolean | undefined,
  durations: { incubation: number; hatched: number },
): number {
  const hatched = reportedHatched ?? eggOfKindNeedsHatchTime(kind);
  return (hatched ? 0 : durations.incubation) + durations.hatched;
}

/**
 * The longest a raid of a kind can stand, in minutes, whatever events were on (plan 8H-9, W5: a
 * record of the party history without an end time keeps no event): its incubation, and its
 * hatched time, a standard raid's the longest of its own and a Raid Hour's or a Raid Day's (an
 * elite raid keeps its own, as `raidDurationsAt` gives it). A duration set by hand for one raid
 * (up to `maxRaidHatchedDuration`) is not kept in its record, and not counted.
 */
export function longestRaidStand(
  kind: RaidKind,
  settings: RaidStandSettings,
): { incubation: number; hatched: number } {
  const usual = configured(kind, settings);
  if (kind !== 'standard') return usual;
  const { hatchedDuration } = settings.raidEvents;
  return {
    incubation: usual.incubation,
    hatched: Math.max(usual.hatched, hatchedDuration['raid-hour'], hatchedDuration['raid-day']),
  };
}

/**
 * The longest durations any raid hatching between `from` and `to` can have. Typed times are
 * checked against these, so that a time which is right during an event is never refused.
 */
export function longestRaidDurations(
  kind: RaidKind,
  from: number,
  to: number,
  rules: RaidDurationRules,
): { incubation: number; hatched: number } {
  const usual = configured(kind, rules.settings);
  if (kind !== 'standard') return usual;
  const overlapping = rules.events.filter((event) => event.start <= to && event.end > from);
  // The weekly Raid Hour of every day the span touches; a span of weeks has one in any case.
  // Calendar days in the zone: a 23-hour day must not be skipped.
  const first = zoned(from, rules.zone).startOfDay();
  const lastMillis = Math.min(to, from + 7 * DAY);
  for (let n = 0; n <= 8; n++) {
    const day = addDays(first, n).epochMilliseconds;
    if (day > lastMillis) break;
    const weekly = weeklyRaidHourOn(day, rules);
    if (weekly && weekly.start <= to && weekly.end > from) overlapping.push(weekly);
  }
  const { hatchedDuration } = rules.settings.raidEvents;
  const hatched = Math.max(
    usual.hatched,
    ...overlapping.map((event) => hatchedDuration[event.kind]),
  );
  return { incubation: usual.incubation, hatched };
}
