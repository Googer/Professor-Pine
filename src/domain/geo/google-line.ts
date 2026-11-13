import { addDays, startOfMonth, zoned } from '../time/zoned.js';

/**
 * The arithmetic of the line that waits for Google (plan 8W-6; design
 * `2026-10-20-google-line-priority-design.md`): the month Google's free amounts are counted in,
 * what the line may ask now under a monthly budget, the rank of a place by its regions' raids,
 * the order of the line, and when a server's part of it will be done. Pure.
 */

/** Google's free amounts reset on the 1st at midnight in California, whatever the bot's zone. */
export const GOOGLE_ZONE = 'America/Los_Angeles';

/** What waits in the line: a gym, a PokéStop or a Power Spot. */
export type LineKind = 'gym' | 'stop' | 'powerspot';

/** Kind first (Matt, 2026-10-20): gyms are caught up within weeks, then stops, then Power Spots. */
const KIND_ORDER: Readonly<Record<LineKind, number>> = { gym: 0, stop: 1, powerspot: 2 };

/**
 * The rank of a server's row of a gym in none of that server's regions (`GoogleRanks.ofGym`,
 * plans 19B-2 and 19B-3), and of a place given no region: after every gym that is in one.
 */
export const NO_REGION_RANK = -1;

/** How far back the raids of a region count for its rank. */
export const RANK_DAYS = 90;

/** The month a moment is in, as Google counts it. */
export interface GoogleMonth {
  /** Every day of the month (`YYYY-MM-DD`, Pacific), the 1st first. */
  days: string[];
  /** The day of the moment. */
  today: string;
  /** The days left in the month, today included. */
  daysLeft: number;
  /** When the next day begins (epoch ms). */
  tomorrow: number;
  /** When the next month begins: the free amounts reset (epoch ms). */
  nextReset: number;
}

export function googleMonth(now: number): GoogleMonth {
  const moment = zoned(now, GOOGLE_ZONE);
  const first = startOfMonth(moment);
  const days: string[] = [];
  for (let day = first; day.month === first.month; day = addDays(day, 1)) {
    days.push(day.toPlainDate().toString());
  }
  return {
    days,
    today: moment.toPlainDate().toString(),
    daysLeft: days.length - moment.day + 1,
    tomorrow: addDays(moment.startOfDay(), 1).epochMilliseconds,
    nextReset: first.add({ months: 1 }).epochMilliseconds,
  };
}

/**
 * The monthly budget (`settings.googleLookupsPerMonth`, `googleLookupsReserve`,
 * `googleGeocodesPerMonth`, `googleGeocodesReserve`): places questions a month, of which the line
 * leaves `reserve` for the questions outside it, and geocodes a month, of which a Power Spot's
 * address the map asks for leaves `geocodesReserve` for gyms.
 */
export interface GoogleBudget {
  places: number;
  reserve: number;
  geocodes: number;
  geocodesReserve: number;
}

/**
 * What was asked of Google this month: places questions (and of them today), geocodes; and
 * lookups by hand (plan 8Z), whose questions are among those, for their cap alone.
 */
export interface GoogleUsed {
  monthPlaces: number;
  todayPlaces: number;
  monthGeocodes: number;
  monthByHand: number;
}

/** What the line may ask now. */
export interface LineAllowance {
  /** Gyms may be asked: something is left above the reserve. */
  gyms: boolean;
  /** PokéStops and Power Spots may be asked: as gyms, and today's share is not used yet. */
  wayspots: boolean;
  /** An address may be asked (the month's geocodes are not used). */
  geocode: boolean;
  /**
   * A Power Spot's address may be asked for the map (design `2026-11-04-power-spot-address`):
   * the month's geocodes are below the budget less the reserve kept for gyms.
   */
  spotAddress: boolean;
  /** Today's share of places questions, while stops and Power Spots are asked. */
  share: number;
  /**
   * How long until the line may ask again what it may not ask now: until tomorrow while only the
   * day's share is used, until the month resets while only the reserve is left.
   */
  waitMs: number;
}

/**
 * What the line may ask at a moment. Gyms may use everything that is left above the reserve at
 * once; stops and Power Spots are paced evenly: on a day at most what was left above the
 * reserve when the day began, divided by the days left in the month with that day. Every places
 * question of the day counts against that share (gyms and questions outside the line too).
 */
export function lineAllowance(now: number, used: GoogleUsed, budget: GoogleBudget): LineAllowance {
  const month = googleMonth(now);
  const above = budget.places - budget.reserve - used.monthPlaces;
  const atDayStart = budget.places - budget.reserve - (used.monthPlaces - used.todayPlaces);
  const share = Math.floor(Math.max(0, atDayStart) / month.daysLeft);
  const gyms = above > 0;
  return {
    gyms,
    wayspots: gyms && used.todayPlaces < share,
    geocode: used.monthGeocodes < budget.geocodes,
    spotAddress: used.monthGeocodes < budget.geocodes - budget.geocodesReserve,
    share,
    waitMs: (gyms ? month.tomorrow : month.nextReset) - now,
  };
}

/** What the rank needs of a region: its row and its server's (null: the region of no server). */
export interface RankedRegion {
  id: number;
  guildId: number | null;
}

/**
 * The rank of each region of a server (Matt, 2026-10-20): its raids (max battles count as raids
 * here) over the last `RANK_DAYS` days, as a part of the raids of the busiest region of its own
 * server, so that each server's busiest region stands level with every other server's busiest
 * and a quiet server is not starved. A server without raids has every region at 1, level with
 * every busiest region: with no history at all, every region ranks the same. A region of no
 * server has no rank.
 */
export function regionRanks(
  regions: readonly RankedRegion[],
  raids: ReadonlyMap<number, number>,
): Map<number, number> {
  const busiest = new Map<number, number>();
  for (const region of regions) {
    if (region.guildId === null) continue;
    const count = raids.get(region.id) ?? 0;
    busiest.set(region.guildId, Math.max(busiest.get(region.guildId) ?? 0, count));
  }
  const ranks = new Map<number, number>();
  for (const region of regions) {
    if (region.guildId === null) continue;
    const top = busiest.get(region.guildId) ?? 0;
    ranks.set(region.id, top === 0 ? 1 : (raids.get(region.id) ?? 0) / top);
  }
  return ranks;
}

/**
 * The rank of a place in these regions: its best region's; `NO_REGION_RANK` for a place in none
 * (a gym in none of its own servers' regions, a Wayspot in no region of any server).
 */
export function bestRank(regionIds: Iterable<number>, ranks: ReadonlyMap<number, number>): number {
  let best = NO_REGION_RANK;
  for (const id of regionIds) {
    const rank = ranks.get(id);
    if (rank !== undefined && rank > best) best = rank;
  }
  return best;
}

/** A place in the line, as its order needs it. */
export interface LinePlace {
  kind: LineKind;
  rank: number;
  queuedAt: number;
  /** The gym's number or the Wayspot's id, as text: the last tie-break. */
  key: string;
}

/** The order of the line: kind, then rank (higher first), then the time queued, then the key. */
export function lineOrder(a: LinePlace, b: LinePlace): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    b.rank - a.rank ||
    a.queuedAt - b.queuedAt ||
    compareKeys(a.key, b.key)
  );
}

/** Gyms' numbers by number, other keys as text. */
function compareKeys(a: string, b: string): number {
  const numbers = /^\d+$/.test(a) && /^\d+$/.test(b);
  return numbers ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;
}

/** How far ahead `estimateLine` looks before it says "beyond". */
const ESTIMATE_DAYS = 3 * 366;

/** What `estimateLine` works from. */
export interface LineEstimateInput {
  now: number;
  used: GoogleUsed;
  budget: GoogleBudget;
  /** The pace of the line: one question every so often. */
  everyMs: number;
  /** The gyms of the line up to and with this server's last, in the line's order (0: none of it). */
  gyms: number;
  /** Every gym of the line. */
  allGyms: number;
  /** The stops and Power Spots up to and with this server's last, in the line's order (0: none). */
  wayspots: number;
}

/**
 * When something will be done: the moment (now for today, else the start of that Pacific day),
 * or `beyond` when not within three years at this budget.
 */
export type EstimatedDay = number | 'beyond';

/**
 * When a server's last gym of the line (`gyms`) and its last item of any kind (`all`) will be
 * asked about, at the current pace: the line simulated day by day in its order against what is
 * left of this month above the reserve and the next months' budgets, gyms at the line's pace,
 * stops and Power Spots at the day's share (`lineAllowance`). Each item is one places question;
 * what is added later is not foreseen. A part with nothing waiting is left out.
 */
export function estimateLine(input: LineEstimateInput): {
  gyms?: EstimatedDay;
  all?: EstimatedDay;
} {
  const { now, budget, everyMs } = input;
  const result: { gyms?: EstimatedDay; all?: EstimatedDay } = {};
  if (input.gyms === 0 && input.wayspots === 0) return result;
  const wantAll = input.wayspots > 0 ? input.allGyms + input.wayspots : input.gyms;
  let monthUsed = input.used.monthPlaces;
  let todayUsed = input.used.todayPlaces;
  let done = 0;
  let day = zoned(now, GOOGLE_ZONE);
  let monthOf = day.month;
  for (let index = 0; index < ESTIMATE_DAYS; index++) {
    if (index > 0) {
      day = addDays(day.startOfDay(), 1);
      todayUsed = 0;
      if (day.month !== monthOf) {
        monthOf = day.month;
        monthUsed = 0;
      }
    }
    const at = index === 0 ? now : day.epochMilliseconds;
    const end = addDays(day.startOfDay(), 1).epochMilliseconds;
    let room = Math.floor((end - at) / Math.max(1, everyMs));
    let monthLeft = Math.max(0, budget.places - budget.reserve - monthUsed);
    const daysLeft = day.daysInMonth - day.day + 1;
    const share = Math.floor(
      Math.max(0, budget.places - budget.reserve - (monthUsed - todayUsed)) / daysLeft,
    );
    // Gyms first, as fast as the line goes and the month allows.
    const gyms = Math.max(0, Math.min(input.allGyms - done, monthLeft, room));
    done += gyms;
    room -= gyms;
    monthLeft -= gyms;
    monthUsed += gyms;
    todayUsed += gyms;
    // Then stops and Power Spots, within the day's share.
    if (done >= input.allGyms) {
      const spots = Math.max(0, Math.min(wantAll - done, share - todayUsed, monthLeft, room));
      done += spots;
      monthUsed += spots;
      todayUsed += spots;
    }
    if (input.gyms > 0 && result.gyms === undefined && done >= input.gyms) result.gyms = at;
    if (done >= wantAll) {
      result.all = at;
      return result;
    }
  }
  if (input.gyms > 0 && result.gyms === undefined) result.gyms = 'beyond';
  result.all = 'beyond';
  return result;
}
