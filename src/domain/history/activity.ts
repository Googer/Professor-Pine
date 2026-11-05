import { isMoment, startOfHour, startOfMonth, zoned } from '../time/zoned.js';

/*
 * The activity heatmap (plan 8H-4; design `2026-11-04-history-on-show-design.md`, Part B): what
 * of the party history counts as activity, which bucket of the summary a record adds to, and the
 * weights a mode gives each place. One domain path: the hourly adding, the rebuild and the web
 * map's route all go through here, and the region board and big days (Parts C and G) will take
 * `countsAsActivity` as it is.
 */

/** What a record of the party history says that the heatmap reads (`PartyHistory`'s columns). */
export interface ActivityRecord {
  kind: string;
  ending: string;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms; null for a party without a hatch (a max battle, an egg nobody timed). */
  hatchTime: number | null;
  regionId: number | null;
  gymId: number | null;
  /** A max battle's Power Spot (its Wayfarer id); null at a pin and for every other party. */
  wayspotId: string | null;
  hereHeads: number;
  doneHeads: number;
}

/**
 * Whether a record of the party history counts toward the heatmap (review H17): a raid or a max
 * battle, however it ended but `cancelled` (somebody closed it; `failed` is never recorded). A
 * legacy raid nobody marked complete is `unknown` and counts, or the legacy years would be empty;
 * `cutover` counts too.
 */
export function countsAsActivity(record: { kind: string; ending: string }): boolean {
  return (record.kind === 'raid' || record.kind === 'max') && record.ending !== 'cancelled';
}

/** Where a bucket's parties were: a gym, a Power Spot, or no place the map can draw. */
export type ActivityPlaceKind = 'gym' | 'spot' | 'none';

/** The place of `none` (`ActivityBucket.placeId`). */
export const NO_PLACE_ID = '0';

/** A local month (`yyyy-mm`), ISO weekday (1 Monday … 7 Sunday) and hour (0–23). */
export interface ActivityWhen {
  month: string;
  weekday: number;
  hour: number;
}

/** A bucket of the summary (`ActivityBucket`): its key and its counts. */
export interface ActivityBucket extends ActivityWhen {
  /** The record's region (`Region.id`), 0 for none. */
  regionId: number;
  placeKind: ActivityPlaceKind;
  /** The gym's id in decimal, the Power Spot's Wayfarer id, `0` for no place. */
  placeId: string;
  raids: number;
  maxes: number;
  /** Of those, the parties that took place (`ending` `completed`). */
  completed: number;
  /** Those who came: here and done, with their +1s. */
  heads: number;
}

/** A month as the buckets hold it, `yyyy-mm`. */
const MONTH_TEXT = /^\d{4}-\d{2}$/u;

/**
 * The month of a record whose time no `yyyy-mm` holds (`bucketOf`): before every month, so that
 * no window and no first month of the slider reads it (`ActivityReader.months` leaves it out).
 */
export const UNKNOWN_MONTH = '0000-00';

/** The local month, weekday and hour of a moment in `zone`. */
export function activityWhen(ms: number, zone: string): ActivityWhen {
  const time = zoned(ms, zone);
  return {
    month: `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}`,
    weekday: time.dayOfWeek,
    hour: time.hour,
  };
}

/**
 * The bucket one record adds to, with its counts (one party), or none where it does not count.
 * When: its hatch, else when it was made (`coalesce(hatchTime, createdAt)`, as the tested query
 * `raids-by-hour` of `history.md` counts); where: a raid's gym, a max battle's Power Spot, else
 * no place. Whether that gym or Power Spot is still kept is asked when the map reads the buckets
 * (`activityWeights`' `kept`), so that a gym added back is drawn again without a rebuild.
 */
export function bucketOf(record: ActivityRecord, zone: string): ActivityBucket | undefined {
  if (!countsAsActivity(record)) return undefined;
  const raid = record.kind === 'raid';
  const ms = record.hatchTime ?? record.createdAt;
  const when = isMoment(ms) ? activityWhen(ms, zone) : undefined;
  // A time no `yyyy-mm` holds (beyond year 9999, before year 0, no moment at all) would be
  // refused by the table and stall the server's adding for good: it is kept at no place and no
  // time, which no window reads (weekday 0), so it is neither drawn nor counted as left out.
  const known = when !== undefined && MONTH_TEXT.test(when.month);
  const place: Pick<ActivityBucket, 'placeKind' | 'placeId'> =
    known && raid && record.gymId !== null
      ? { placeKind: 'gym', placeId: String(record.gymId) }
      : known && !raid && record.wayspotId !== null
        ? { placeKind: 'spot', placeId: record.wayspotId }
        : { placeKind: 'none', placeId: NO_PLACE_ID };
  return {
    regionId: record.regionId ?? 0,
    ...place,
    ...(known ? when : { month: UNKNOWN_MONTH, weekday: 0, hour: 0 }),
    raids: raid ? 1 : 0,
    maxes: raid ? 0 : 1,
    completed: record.ending === 'completed' ? 1 : 0,
    heads: record.hereHeads + record.doneHeads,
  };
}

/** A bucket's key, as one string. */
export function bucketKey(bucket: ActivityBucket): string {
  return [
    bucket.regionId,
    bucket.placeKind,
    bucket.placeId,
    bucket.month,
    bucket.weekday,
    bucket.hour,
  ].join('|');
}

/** Buckets of the same key summed into one, each key once, in the order they first came. */
export function sumBuckets(buckets: readonly ActivityBucket[]): ActivityBucket[] {
  const summed = new Map<string, ActivityBucket>();
  for (const bucket of buckets) {
    const key = bucketKey(bucket);
    const had = summed.get(key);
    summed.set(
      key,
      had === undefined
        ? { ...bucket }
        : {
            ...had,
            raids: had.raids + bucket.raids,
            maxes: had.maxes + bucket.maxes,
            completed: had.completed + bucket.completed,
            heads: had.heads + bucket.heads,
          },
    );
  }
  return [...summed.values()];
}

/**
 * A mode of the heatmap: Expected now (the default: today's weekday and the hours round now,
 * every year), the presets Weekday evenings and Weekend afternoons, and History (a year or a
 * month, every weekday and hour).
 */
export type ActivityMode =
  | { kind: 'now' }
  | { kind: 'evenings' }
  | { kind: 'weekend' }
  | { kind: 'history'; year: number; month?: never }
  | { kind: 'history'; month: string; year?: never };

/** A weekday and hour of a mode's window. */
export interface ActivityHour {
  weekday: number;
  hour: number;
}

/** What a mode reads: some weekdays' hours of every month, or every hour of some months. */
export type ActivityWindow =
  { hours: ActivityHour[] } | { months: { first: string; last: string } };

/** The fewest parties a place is drawn with in a mode's window (review H19). */
export const ACTIVITY_MINIMUM = 3;

/** Older years count less: a party a year old counts half (the design's one-year half-life). */
const HALF_LIFE_MS = 365.2425 * 24 * 3_600_000;

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, n) => from + n);

/** The weekday before and after, from Monday (1) to Sunday (7). */
const dayBefore = (weekday: number): number => (weekday === 1 ? 7 : weekday - 1);
const dayAfter = (weekday: number): number => (weekday === 7 ? 1 : weekday + 1);

/**
 * The weekdays and hours a mode reads. Expected now: today's weekday in `zone`, from the hour
 * before now to the hour after on the wall clock (the hour before midnight is the weekday
 * before's, the one after the weekday after's), so that the day the clocks change keeps three
 * hours, as other years' buckets hold them. The presets: Monday to Friday 17:00–21:59, Saturday
 * and Sunday 12:00–16:59. History reads months instead (`activityWindow`); here, none.
 */
export function activityHours(mode: ActivityMode, now: number, zone: string): ActivityHour[] {
  switch (mode.kind) {
    case 'now': {
      const { weekday, hour } = activityWhen(now, zone);
      return [-1, 0, 1].map((offset) => {
        const shifted = hour + offset;
        if (shifted < 0) return { weekday: dayBefore(weekday), hour: 23 };
        if (shifted > 23) return { weekday: dayAfter(weekday), hour: 0 };
        return { weekday, hour: shifted };
      });
    }
    case 'evenings':
      return range(1, 5).flatMap((weekday) => range(17, 21).map((hour) => ({ weekday, hour })));
    case 'weekend':
      return [6, 7].flatMap((weekday) => range(12, 16).map((hour) => ({ weekday, hour })));
    case 'history':
      return [];
  }
}

/** What a mode reads of the buckets (`ActivityReader` filters by it). */
export function activityWindow(mode: ActivityMode, now: number, zone: string): ActivityWindow {
  if (mode.kind !== 'history') return { hours: activityHours(mode, now, zone) };
  if (mode.month !== undefined) return { months: { first: mode.month, last: mode.month } };
  const year = String(mode.year).padStart(4, '0');
  return { months: { first: `${year}-01`, last: `${year}-12` } };
}

/** Whether a bucket lies in a window. */
export function inWindow(window: ActivityWindow, bucket: ActivityWhen): boolean {
  if ('months' in window) {
    return bucket.month >= window.months.first && bucket.month <= window.months.last;
  }
  return window.hours.some((one) => one.weekday === bucket.weekday && one.hour === bucket.hour);
}

/** The middle of a local month (`yyyy-mm`) in `zone`, epoch ms: where its age is counted from. */
function middleOfMonth(month: string, zone: string): number {
  const [year, number] = month.split('-').map(Number);
  const start = startOfMonth(
    Temporal.PlainDate.from({ year: year ?? 1970, month: number ?? 1, day: 1 }).toZonedDateTime(
      zone,
    ),
  );
  const next = start.add({ months: 1 });
  return (start.epochMilliseconds + next.epochMilliseconds) / 2;
}

/** A place drawn on the heatmap: its weight 0–1 in the mode, and its parties in the window. */
export interface ActivityPlace {
  kind: 'gym' | 'spot';
  id: string;
  /** Normalized: the busiest place drawn is 1. */
  weight: number;
  /** Raids and max battles in the mode's window, unweighted. */
  parties: number;
}

export interface ActivityWeights {
  places: ActivityPlace[];
  /**
   * Parties in the window the map cannot draw: at no place (a raid without a gym, a max battle at
   * a pin) or at a place no longer kept (`kept`).
   */
  leftOut: number;
}

/**
 * The weights of a mode: per place, its parties in the window (`activityWindow`), each bucket
 * weighted by `0.5 ^ age`, age in years from the middle of its month to `now` (none for a month
 * not yet half over; History unweighted), summed over the place's regions, then normalized so
 * that the busiest place is 1. A place with fewer than `ACTIVITY_MINIMUM` parties in the window
 * is not drawn and not left out either: it is quiet (review H19). `kept` says whether the map
 * still has a gym or Power Spot; the parties of one it has not are left out, with those at no
 * place, however many. The buckets of regions the member may not see are the caller's to drop.
 * Places in the order gyms, then Power Spots, each by id.
 */
export function activityWeights(
  buckets: readonly ActivityBucket[],
  mode: ActivityMode,
  now: number,
  zone: string,
  kept: (kind: 'gym' | 'spot', id: string) => boolean,
): ActivityWeights {
  const window = activityWindow(mode, now, zone);
  const middles = new Map<string, number>();
  const factor = (month: string): number => {
    if (mode.kind === 'history') return 1;
    let middle = middles.get(month);
    if (middle === undefined) {
      middle = middleOfMonth(month, zone);
      middles.set(month, middle);
    }
    return 0.5 ** (Math.max(0, now - middle) / HALF_LIFE_MS);
  };
  const sums = new Map<
    string,
    { kind: 'gym' | 'spot'; id: string; sum: number; parties: number }
  >();
  let leftOut = 0;
  for (const bucket of buckets) {
    if (!inWindow(window, bucket)) continue;
    const parties = bucket.raids + bucket.maxes;
    if (parties === 0) continue;
    const { placeKind: kind, placeId: id } = bucket;
    if (kind === 'none') {
      leftOut += parties;
      continue;
    }
    const key = `${kind}:${id}`;
    const had = sums.get(key) ?? { kind, id, sum: 0, parties: 0 };
    sums.set(key, {
      ...had,
      sum: had.sum + parties * factor(bucket.month),
      parties: had.parties + parties,
    });
  }
  const drawn: Array<{ kind: 'gym' | 'spot'; id: string; sum: number; parties: number }> = [];
  for (const place of sums.values()) {
    if (!kept(place.kind, place.id)) leftOut += place.parties;
    else if (place.parties >= ACTIVITY_MINIMUM) drawn.push(place);
  }
  const top = Math.max(0, ...drawn.map((place) => place.sum));
  const places = drawn
    .sort((a, b) =>
      a.kind !== b.kind ? (a.kind === 'gym' ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .map((place) => ({
      kind: place.kind,
      id: place.id,
      weight: top === 0 ? 0 : Math.round((place.sum / top) * 1000) / 1000,
      parties: place.parties,
    }));
  return { places, leftOut };
}

/** When Expected now's window moves on: the start of the next hour on the wall clock. */
export function nextActivityHour(now: number, zone: string): number {
  return startOfHour(zoned(now, zone)).add({ hours: 1 }).epochMilliseconds;
}
