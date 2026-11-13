import { localDay, nextLocalMidnight } from './local-day.js';
import { BIG_EVENT_TYPES } from './max-events.js';
import type { ResearchEvent } from './research-events.js';
import { addDays, sameDay, zoned } from './zoned.js';

/*
 * Field research periods (plan 8R-1; design 4.2, 9.2, Matt's answer 6). A PokéStop's task holds
 * for a period: the day (to local midnight); a multi-day event with research of its own, whose
 * start and end are rotations (what was reported before is gone for good) and inside which the
 * tasks roll over at each local midnight, as on any day (Matt, 2026-10-22); an intra-day event's
 * window, during which the day's reports wait and after which they come back unchanged. Pure:
 * the events are the stored ones placed in the server's zone (`researchEvents(zone)`), and the
 * zone is the server's.
 */

/**
 * How an event's research works: `window`, an intra-day event (it starts and ends on one local
 * day: its tasks for its hours, the period below it before and after); `daily`, a big event
 * (`BIG_EVENT_TYPES`) over several days whose hours end before midnight, each day of it a window
 * of those hours (GO Fest Global: 10:00 to 18:00 on two days, Matt's recollection of the game);
 * `rotation`, any other (a multi-day event, one crossing midnight): its start and end rotate the
 * tasks, and so does each local midnight inside it (a period per day of it).
 */
export type EventShape = 'window' | 'daily' | 'rotation';

/** A period: its key (what a report keeps), what it is, and when it starts and ends. */
export interface ResearchPeriod {
  /**
   * `day:<yyyy-mm-dd>`; `event:<eventID>` for an intra-day event's window;
   * `event:<eventID>:<yyyy-mm-dd>` for a day of a rotation or of a big event's hours.
   */
  key: string;
  /** `day`, `event` (a day of a rotation), or `window` (an intra-day event's, a big event's day). */
  kind: 'day' | 'event' | 'window';
  start: number;
  /** The first moment after it: when its reports end. */
  end: number;
  /** The event of an `event` or `window` period. */
  event?: { id: string; name: string };
  /**
   * Of a window: the period whose reports wait under it, and when they come back (the window's
   * end); undefined when that period ends with the window, or before.
   */
  waiting?: { key: string; at: number; from: number } | undefined;
}

/** What a report keeps of its period: the key, and when it was made. */
interface PeriodMark {
  periodKey: string;
  madeAt: number;
}

/**
 * Whether a report counts for `period` (fix round 1, N4): of its key, and made since it began. A
 * key is a local date: after a change of the server's zone, a report of that date on the old
 * clock, made before the period began on the new one, is no report of it.
 */
export function inPeriod(
  report: PeriodMark,
  period: Pick<ResearchPeriod, 'key' | 'start'>,
): boolean {
  return report.periodKey === period.key && report.madeAt >= period.start;
}

/** Whether a report waits under `period`'s window (`waiting`), by the same rule as `inPeriod`. */
export function waitsIn(report: PeriodMark, period: Pick<ResearchPeriod, 'waiting'>): boolean {
  const { waiting } = period;
  return waiting !== undefined && report.periodKey === waiting.key && report.madeAt >= waiting.from;
}

/** A window of hours an event's research holds, as a period. */
interface Window {
  key: string;
  start: number;
  end: number;
  event: ResearchEvent;
}

const BIG: ReadonlySet<string> = new Set(BIG_EVENT_TYPES);

/** Minutes since local midnight. */
function minuteOfDay(time: Temporal.ZonedDateTime): number {
  return time.hour * 60 + time.minute;
}

export function eventShape(event: ResearchEvent, zone: string): EventShape {
  const start = zoned(event.start, zone);
  if (sameDay(start, zoned(event.end - 1, zone))) return 'window';
  const end = zoned(event.end, zone);
  // Hours that end before midnight: the end's time of day comes after the start's.
  if (BIG.has(event.eventType) && minuteOfDay(end) > minuteOfDay(start)) return 'daily';
  return 'rotation';
}

/** The windows of the events: an intra-day event's hours, each day of a big event's hours. */
function windowsOf(events: readonly ResearchEvent[], zone: string): Window[] {
  const windows: Window[] = [];
  for (const event of events) {
    const shape = eventShape(event, zone);
    if (shape === 'window') {
      windows.push({ key: `event:${event.id}`, start: event.start, end: event.end, event });
    } else if (shape === 'daily') {
      const first = zoned(event.start, zone);
      const last = zoned(event.end, zone);
      const lastDay = last.startOfDay().epochMilliseconds;
      for (let day = first.startOfDay(); day.epochMilliseconds <= lastDay; day = addDays(day, 1)) {
        // To the millisecond (review A6: a Tour's 00:00:00 to 23:59:59).
        const start = day.with({
          hour: first.hour,
          minute: first.minute,
          second: first.second,
          millisecond: first.millisecond,
        }).epochMilliseconds;
        const end = day.with({
          hour: last.hour,
          minute: last.minute,
          second: last.second,
          millisecond: last.millisecond,
        }).epochMilliseconds;
        const from = Math.max(start, event.start);
        const to = Math.min(end, event.end);
        if (from < to) {
          windows.push({
            key: `event:${event.id}:${day.toPlainDate().toString()}`,
            start: from,
            end: to,
            event,
          });
        }
      }
    }
  }
  return windows;
}

/** Of what holds `time`, the one that began last (ties by key). */
function latest<T extends { start: number; end: number; key: string }>(
  found: readonly T[],
  time: number,
): T | undefined {
  return found
    .filter((one) => one.start <= time && time < one.end)
    .sort((a, b) => b.start - a.start || a.key.localeCompare(b.key))[0];
}

/** The period at `time` without the windows: the day, or a rotation's. */
function basePeriod(events: readonly ResearchEvent[], time: number, zone: string): ResearchPeriod {
  const rotations = events
    .filter((event) => eventShape(event, zone) === 'rotation')
    .map((event) => ({ key: `event:${event.id}`, start: event.start, end: event.end, event }));
  const rotation = latest(rotations, time);
  const midnight = zoned(time, zone).startOfDay().epochMilliseconds;
  const nextMidnight = nextLocalMidnight(time, zone);
  const today = localDay(time, zone);
  if (rotation) {
    // Inside the event the tasks roll over at each local midnight, as on any day (Matt,
    // 2026-10-22): a period per day of it, from its start or midnight to midnight or its end.
    // Another rotation that starts meanwhile rotates the tasks again.
    const next = rotations
      .filter((other) => other !== rotation && other.start > time && other.start < rotation.end)
      .reduce((soonest, other) => Math.min(soonest, other.start), rotation.end);
    return {
      key: `${rotation.key}:${today}`,
      kind: 'event',
      start: Math.max(rotation.start, midnight),
      end: Math.min(next, nextMidnight),
      event: { id: rotation.event.id, name: rotation.event.name },
    };
  }
  // The day begins at midnight, or where a rotation that ended today left off; it ends at the
  // next midnight, or where a rotation begins before it.
  const start = rotations
    .filter((one) => one.end > midnight && one.end <= time)
    .reduce((last, one) => Math.max(last, one.end), midnight);
  const end = rotations
    .filter((one) => one.start > time && one.start < nextMidnight)
    .reduce((soonest, one) => Math.min(soonest, one.start), nextMidnight);
  return { key: `day:${today}`, kind: 'day', start, end };
}

/**
 * The research period on at `time` (design 4.2): a window of an intra-day event (or of a big
 * event's day) when one holds it, with the period below waiting; else a multi-day event's
 * rotation; else the day. An intra-day event inside a multi-day one leaves the multi-day
 * period's reports waiting.
 */
export function periodAt(
  events: readonly ResearchEvent[],
  time: number,
  zone: string,
): ResearchPeriod {
  const base = basePeriod(events, time, zone);
  const window = latest(windowsOf(events, zone), time);
  if (!window) return base;
  return {
    key: window.key,
    kind: 'window',
    start: window.start,
    end: window.end,
    event: { id: window.event.id, name: window.event.name },
    waiting:
      base.end > window.end ? { key: base.key, at: window.end, from: base.start } : undefined,
  };
}

/**
 * When the period may next change after `time`: the next local midnight, or the start or end of
 * an event's window or rotation before it. The post of the stops is drawn anew then.
 */
export function nextPeriodChange(
  events: readonly ResearchEvent[],
  time: number,
  zone: string,
): number {
  const nextMidnight = nextLocalMidnight(time, zone);
  const boundaries = [
    ...windowsOf(events, zone).flatMap((window) => [window.start, window.end]),
    ...events
      .filter((event) => eventShape(event, zone) === 'rotation')
      .flatMap((event) => [event.start, event.end]),
  ];
  return boundaries
    .filter((boundary) => boundary > time)
    .reduce((soonest, boundary) => Math.min(soonest, boundary), nextMidnight);
}
