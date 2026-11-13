import type { MaxEvent } from './max-events.js';
import type { RaidEvent } from './raid-events.js';
import { addDays, zoned } from './zoned.js';

/**
 * An event window (Matt, 2026-11-09): the days around a big event (Wild Area, GO Tour, GO Fest:
 * its lead-up, such as "Into the Wild 2026", and the event itself), when the game runs what
 * amounts to an all-day Raid Hour (no eggs, every raid 25 minutes) and Power Spots everywhere
 * whose battles rotate every 30 minutes, as on a Max Battle Day, while neither ScrapedDuck's feed
 * nor Leek Duck's page says so. Staff set it (`/operator event-window`); one at a time per
 * installation. Times are epoch milliseconds.
 *
 * Plan 19A-2: a time staff typed is local time in every server's zone, as the game's events are
 * (`FeedTimed`): `startLocal` and `endLocal` are the truth, `start` and `end` their moments in the
 * instance's default zone (what 2.0 reads), and `timedIn(window, zone)` the window in a server's
 * zone. A time that is a moment (a start of now, an end of now: `/operator event-window end`) has
 * no `…Local`, the same moment everywhere; a window kept before 2.1 has none either.
 */
export interface EventWindow {
  start: number;
  /** The first moment after it. */
  end: number;
  /** The start as wall-clock time, where it was typed. */
  startLocal?: string;
  /** The end as wall-clock time, where it was typed. */
  endLocal?: string;
  /** The snowflake of the staff member who set it. */
  setBy: string;
  /** When it was set. */
  setAt: number;
}

/** The longest window staff may set: a lead-up and its big event run about a week. */
export const EVENT_WINDOW_MAX_DAYS = 14;

/** The name the window carries as a raid or max event; never shown to members. */
export const EVENT_WINDOW_NAME = 'Event window';

/** Why a window cannot be set. */
export type EventWindowProblem = 'end-not-after-start' | 'end-past' | 'too-long';

/**
 * What is wrong with a window from `start` to `end` set at `now`: an end not after the start, an
 * end in the past (or now), an end after `eventWindowLatestEnd`; undefined when nothing is.
 */
export function eventWindowProblem(
  start: number,
  end: number,
  now: number,
  zone: string,
): EventWindowProblem | undefined {
  if (end <= start) return 'end-not-after-start';
  if (end <= now) return 'end-past';
  if (end > eventWindowLatestEnd(start, now, zone)) return 'too-long';
  return undefined;
}

/**
 * The latest end of a window from `start` set at `now`: `EVENT_WINDOW_MAX_DAYS` calendar days in
 * `zone` (a change of the clocks inside does not shorten it) after its start, or after now for a
 * window that began before (`set` keeps the start of one that is on: review LW-1).
 */
export function eventWindowLatestEnd(start: number, now: number, zone: string): number {
  return addDays(zoned(Math.max(start, now), zone), EVENT_WINDOW_MAX_DAYS).epochMilliseconds;
}

/**
 * The window as a raid event: a Raid Hour from its start to its end, so that a standard raid that
 * hatches in it lasts `hatchedDuration['raid-hour']` (`raidDurationsAt`). Marked `eventWindow`: the
 * week's rule for the weekly Raid Hour (`weeklyRaidHourOn`) does not count it as one of the feed.
 */
export function eventWindowRaidEvent(window: EventWindow): RaidEvent {
  return {
    kind: 'raid-hour',
    name: EVENT_WINDOW_NAME,
    start: window.start,
    end: window.end,
    eventWindow: true,
  };
}

/**
 * The window as a max event of the kind a Max Battle Day is, `short` (battles rotate every half
 * hour, `maxRotation`) over all its days, featuring nothing, without a feed id; marked
 * `eventWindow`, so that it wins over every max event on at the same time (`maxEventAt`), whose
 * featured bosses stay featured. Never kept in `MaxEvent`.
 */
export function eventWindowMaxEvent(window: EventWindow): MaxEvent {
  return {
    kind: 'max-battle',
    name: EVENT_WINDOW_NAME,
    start: window.start,
    end: window.end,
    short: true,
    hoursAssumed: false,
    featured: undefined,
    id: undefined,
    eventWindow: true,
  };
}

/** Events in order of their start, then their name. */
function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

/**
 * The raid events with the window's (`eventWindowRaidEvent`), in order: the one path of every reader
 * of the raid events (`RaidEventService.events()`). `events` itself without a window.
 */
export function withEventWindowRaid(
  events: readonly RaidEvent[],
  window: EventWindow | undefined,
): readonly RaidEvent[] {
  return window === undefined ? events : inOrder([...events, eventWindowRaidEvent(window)]);
}

/**
 * The max events with the window's (`eventWindowMaxEvent`), in order: the one path of every reader of
 * the max events (`RaidEventService.maxEvents()`). `events` itself without a window.
 */
export function withEventWindowMax(
  events: readonly MaxEvent[],
  window: EventWindow | undefined,
): readonly MaxEvent[] {
  return window === undefined ? events : inOrder([...events, eventWindowMaxEvent(window)]);
}
