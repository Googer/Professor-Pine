import { addDays, zoned } from '../time/zoned.js';
import { topBigDays, type BigDay } from './big-days.js';

/*
 * "On this day" in the events forum (plan 8H-8, design Part G): which earlier big days today's
 * date recalls, and when the day's post is due. The big days are `big-days.ts`'s, so that the
 * post and the history page agree.
 */

/** The local hour from which a day's post is due (10:00 in `settings.timezone`). */
export const ON_THIS_DAY_HOUR = 10;

/**
 * The big days that today's month and day recall: of each earlier year, those among its top
 * `count` (`topBigDays`: one day of a run of big days in a row, the higher ranked, G21) on this
 * date, newest year first. February 29th falls only in a leap year, and is recalled only on one.
 */
export function onThisDayDays<T extends BigDay>(
  days: readonly T[],
  today: string,
  count: number,
): T[] {
  if (count <= 0) return [];
  const year = Number(today.slice(0, 4));
  const date = today.slice(4);
  const years = [...new Set(days.map((one) => Number(one.day.slice(0, 4))))]
    .filter((one) => one < year)
    .sort((a, b) => b - a);
  return years.flatMap((one) =>
    topBigDays(days, one, count).filter((day) => day.day.slice(4) === date),
  );
}

/** Whether the day's post is due: from 10:00 local time to the day's end. */
export function onThisDayDue(now: number, zone: string): boolean {
  return zoned(now, zone).hour >= ON_THIS_DAY_HOUR;
}

/** The next 10:00 local time after `now`: today's before it, else tomorrow's. */
export function nextOnThisDayAt(now: number, zone: string): number {
  const today = zoned(now, zone).startOfDay();
  const at = (day: Temporal.ZonedDateTime): number =>
    day.with({ hour: ON_THIS_DAY_HOUR }).epochMilliseconds;
  const todays = at(today);
  return todays > now ? todays : at(addDays(today, 1).startOfDay());
}
