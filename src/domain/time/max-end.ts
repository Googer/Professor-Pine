import type { MaxTier } from '../pogo/max-tier.js';
import { bigEventAt, maxEventAt, type BigEvent, type MaxEvent } from './max-events.js';
import { startOfHour, zoned } from './zoned.js';

/*
 * How long a max battle lasts at a spot (design Q9, settled by Matt on 2026-10-20 and 2026-10-21):
 * battles rotate on the hour and the half hour, and a battle reported is already on (there is no
 * egg), so its default end is the boundary of the rotation it is in, never a span from the report.
 */

/**
 * A max battle whose end is less than `ENDING_SOON_MINUTES` away is asked about before `/max`
 * makes it (Matt, 2026-10-21: the ending-soon dialog); joining one at the spot asks nothing. The
 * rule is `ending-soon.ts`', shared with the map's raids in their last minutes (plan 8M-7).
 */
export { ENDING_SOON_MINUTES, endsSoon } from './ending-soon.js';

/** The hours of the day max battles can be fought (`settings.maxBattles`), `HH:MM` in the zone. */
export interface BattleHours {
  firstBattle: string;
  lastBattle: string;
}

export interface MaxEndInput {
  tier: MaxTier;
  /** When the battle was reported (or is being changed). */
  at: number;
  /** The max events known (`MaxEventProvider.maxEvents`). */
  events: readonly MaxEvent[];
  /** The big events known (`MaxEventProvider.bigEvents`). */
  big: readonly BigEvent[];
  hours: BattleHours;
  /** `settings.timezone`. */
  zone: string;
}

/**
 * How battles rotate at a spot at that moment: every half hour in a short event (a Max Battle Day
 * of a few hours, `MaxEvent.short`), every hour in an all-day one (a Max Monday, a Max Battle
 * Weekend) and, for a Gigantamax battle, in a big event (Wild Area, GO Tour, GO Fest: Matt,
 * 2026-10-21) or outside any event; otherwise (a Dynamax battle on an ordinary day) not at all:
 * it lasts the day (`day`). An event that is on wins over a big event (a Max Battle Day inside a
 * Wild Area keeps its half hours).
 */
export type MaxRotation = 'half-hour' | 'hour' | 'day';

/** The rotation of an all-day event: every hour. */
const ALL_DAY: MaxRotation = 'hour';

/**
 * The rotation of a Gigantamax battle outside any event's hours: every hour until Matt has seen
 * one on a Gigantamax day (design Q9: 30 or 60 minutes, not known). The one place to change it.
 */
export const GIGANTAMAX_OUTSIDE_EVENTS: MaxRotation = 'hour';

/**
 * The rotation of a battle (`MaxRotation`); `outside` is the rule of a Gigantamax battle outside
 * any event's hours, `GIGANTAMAX_OUTSIDE_EVENTS` unless a test gives another (so that a big event
 * is told from outside while both rotate every hour).
 */
export function maxRotation(
  input: Pick<MaxEndInput, 'tier' | 'at' | 'events' | 'big'>,
  outside: MaxRotation = GIGANTAMAX_OUTSIDE_EVENTS,
): MaxRotation {
  const event = maxEventAt(input.events, input.at);
  if (event) return event.short ? 'half-hour' : ALL_DAY;
  if (input.tier !== 'G') return 'day';
  return bigEventAt(input.big, input.at) ? ALL_DAY : outside;
}

/** A clock time of the settings on the day of `time`, in the zone. */
function clockOn(time: number, clock: string, zone: string): number {
  const [hour, minute] = clock.split(':').map(Number);
  return zoned(time, zone).with({ hour: hour ?? 0, minute: minute ?? 0, second: 0, millisecond: 0 })
    .epochMilliseconds;
}

/** The first battle time of the day of `time` (`settings.maxBattles.firstBattle`). */
export function firstBattleOn(time: number, hours: BattleHours, zone: string): number {
  return clockOn(time, hours.firstBattle, zone);
}

/** The last battle time of the day of `time` (`settings.maxBattles.lastBattle`). */
export function lastBattleOn(time: number, hours: BattleHours, zone: string): number {
  return clockOn(time, hours.lastBattle, zone);
}

/** The first boundary of the rotation strictly after `time`, in the zone's clock. */
function boundaryAfter(time: number, rotation: 'half-hour' | 'hour', zone: string): number {
  const hour = startOfHour(zoned(time, zone));
  if (rotation === 'hour') return hour.add({ hours: 1 }).epochMilliseconds;
  const half = hour.add({ minutes: 30 }).epochMilliseconds;
  return half > time ? half : hour.add({ hours: 1 }).epochMilliseconds;
}

/**
 * The end of a Dynamax battle of an ordinary day (rotation `day`): the day's last battle time,
 * or the start of the next max event later that day, whichever comes first (Matt, 2026-10-21,
 * Q-B: a Max Battle Day's bosses replace the day's at its start; the member can move the end
 * with `/end`, or give another with `end:`). One rule, in one place: Matt checks on the lake trio
 * day of 2026-10-24 whether Dynamax battles were up before 14:00, and it may be revisited (they
 * were, their countdowns running to about 05:00: Matt, 2026-10-24). Also the cut of such a
 * battle's screenshot countdown (`maxScreenshotReport`).
 */
export function dayBattleEnd(events: readonly MaxEvent[], from: number, last: number): number {
  const starts = events.map((event) => event.start).filter((start) => start > from && start < last);
  return Math.min(last, ...starts);
}

/**
 * The default end of a max battle reported at `input.at` (design 3.1, Q9): the next boundary of
 * its rotation after the report (`maxRotation`: the next :00 or :30 in a short event, the next
 * full hour all day and for a Gigantamax battle), else the day's last battle time or the start of
 * a max event later that day (`dayBattleEnd`, Q-B); never past the last battle time. A report before the first battle time is taken (a battle seen at 05:30 is
 * there at 06:00), its rotation counted from the first battle; one at or after the last battle
 * time is `over`, with the hours to say.
 */
export function defaultMaxEnd(
  input: MaxEndInput,
): { kind: 'end'; end: number } | { kind: 'over'; first: string; last: string } {
  const { at, hours, zone } = input;
  const last = lastBattleOn(at, hours, zone);
  if (at >= last) return { kind: 'over', first: hours.firstBattle, last: hours.lastBattle };
  const from = Math.max(at, clockOn(at, hours.firstBattle, zone));
  const rotation = maxRotation({ ...input, at: from });
  if (rotation === 'day') return { kind: 'end', end: dayBattleEnd(input.events, from, last) };
  // Counted from the first battle, a report before it is in the rotation that begins then.
  const end = from > at ? boundaryAfter(from, rotation, zone) : boundaryAfter(at, rotation, zone);
  return { kind: 'end', end: Math.min(end, last) };
}

/**
 * The end one rotation after `end` (the ending-soon dialog of `/max`: "Until the next rotation"):
 * the next boundary after `end` by the rule as things are at `end` (`maxRotation`; review B, B12:
 * a Dynamax battle at the last boundary of its event has none after it, a Gigantamax one then
 * rotates as outside events), capped at the last battle time; undefined where there is none later
 * (the cap, or a battle that would then last the day).
 */
export function nextRotationEnd(end: number, input: MaxEndInput): number | undefined {
  const rotation = maxRotation({ ...input, at: end });
  if (rotation === 'day') return undefined;
  const next = Math.min(
    boundaryAfter(end, rotation, input.zone),
    lastBattleOn(end, input.hours, input.zone),
  );
  return next > end ? next : undefined;
}
