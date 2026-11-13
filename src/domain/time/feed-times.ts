import { momentIn, zoned, type FeedTime } from './zoned.js';

/*
 * The times of a feed's event in each server's zone (plan 19A-2). A feed gives most times as
 * wall-clock time (Raid Hour at 18:00 local, a research day from 00:00): that is the truth, and
 * becomes a moment only in a zone. An event keeps its moments (`start`, `end`) in the zone its
 * list was read in (the instance's default), as every reader before 19A-2 had them, and beside
 * each the wall-clock time the feed gave (`startLocal`, `endLocal`), stored so in the database as
 * well; `timedIn` gives it in another zone. A time the feed gave as a moment has no `…Local`: it is
 * the same in every zone. Pure.
 */

/** What a feed's event carries of its times. */
export interface FeedTimed {
  /** Epoch ms: its start in the zone its list was read in, or the moment the feed gave. */
  readonly start: number;
  /** The first moment after it, as `start`. */
  readonly end: number;
  /** Its start as wall-clock time (`FeedTime`'s `local`) where the feed gave it so. */
  readonly startLocal?: string;
  /** Its end as wall-clock time where the feed gave it so. */
  readonly endLocal?: string;
}

/** An event's start as the feed gave it. */
export function feedStart(event: FeedTimed): FeedTime {
  return event.startLocal === undefined ? { at: event.start } : { local: event.startLocal };
}

/** An event's end as the feed gave it. */
export function feedEnd(event: FeedTimed): FeedTime {
  return event.endLocal === undefined ? { at: event.end } : { local: event.endLocal };
}

/** The wall-clock fields an event keeps of its two feed times: none for a moment. */
export function localsOf(
  start: FeedTime,
  end: FeedTime,
): { startLocal?: string; endLocal?: string } {
  return {
    ...('local' in start ? { startLocal: start.local } : {}),
    ...('local' in end ? { endLocal: end.local } : {}),
  };
}

/**
 * The wall-clock time of a moment on `zone`'s clock (`FeedTime`'s `local`), so that a time typed
 * in one server's zone is kept as local time in every server's (the event window, plan 19A-2).
 */
export function wallClockAt(at: number, zone: string): string {
  return zoned(at, zone).toPlainDateTime().toString();
}

/** The wall-clock fields of times computed on `zone`'s clock (a page's Raid Hour on its day). */
export function wallClockOf(
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): { startLocal: string; endLocal: string } {
  return {
    startLocal: start.toPlainDateTime().toString(),
    endLocal: end.toPlainDateTime().toString(),
  };
}

/**
 * The event with its times in `zone` (`momentIn`: a wall-clock time on `zone`'s clock, a moment
 * as it is); the very same object where neither moves.
 */
export function timedIn<T extends FeedTimed>(event: T, zone: string): T {
  if (event.startLocal === undefined && event.endLocal === undefined) return event;
  const start = momentIn(feedStart(event), zone).epochMilliseconds;
  const end = momentIn(feedEnd(event), zone).epochMilliseconds;
  return start === event.start && end === event.end ? event : { ...event, start, end };
}

/**
 * The events with their times in `zone` (`timedIn`), in order of their new starts (a stable sort:
 * events that start together keep their order); the very same list where none moves.
 */
export function allIn<T extends FeedTimed>(events: readonly T[], zone: string): readonly T[] {
  let moved = false;
  const placed = events.map((event) => {
    const one = timedIn(event, zone);
    if (one !== event) moved = true;
    return one;
  });
  return moved ? placed.sort((a, b) => a.start - b.start) : events;
}

/**
 * Whether a wall-clock time kept beside a moment still is that moment's in `zone` (the instance's
 * default, in which the moment was written). One that is not was left behind by a write that knew
 * nothing of it (2.0, going back, rewrote the moment: fix round 1, L8, M6): the moment is the
 * truth then.
 */
export function localAgrees(local: string, moment: number, zone: string): boolean {
  try {
    return momentIn({ local }, zone).epochMilliseconds === moment;
  } catch (error) {
    // A text that is no wall-clock time (`Temporal` refuses it) agrees with nothing.
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/**
 * The item as read from the database (fix round 1, L8, M6): each wall-clock time kept only where
 * it agrees with its moment in `zone` (`localAgrees`); the very same item where both do.
 */
export function trustedLocals<T extends FeedTimed>(item: T, zone: string): T {
  const start = item.startLocal === undefined || localAgrees(item.startLocal, item.start, zone);
  const end = item.endLocal === undefined || localAgrees(item.endLocal, item.end, zone);
  if (start && end) return item;
  const { startLocal, endLocal, ...rest } = item;
  return {
    ...rest,
    ...(start && startLocal !== undefined ? { startLocal } : {}),
    ...(end && endLocal !== undefined ? { endLocal } : {}),
  } as T;
}
