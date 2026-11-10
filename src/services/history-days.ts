import { BoundedMap } from '../bounded-map.js';
import type { ActivityDayReader, DayTotal } from '../db/repositories/activity-repository.js';
import {
  bigDays,
  PAGE_TOP_DAYS,
  seriesYears,
  topBigDays,
  yearBigDays,
  type BigDay,
} from '../domain/history/big-days.js';
import { nextMonth } from '../domain/history/activity.js';
import { onThisDayDays } from '../domain/history/on-this-day.js';
import { localDay } from '../domain/time/local-day.js';

/** How long a server's days and big days are kept once read (G3: never read per member's view). */
export const DAYS_FRESH_MS = 5 * 60_000;
/**
 * How long a series is kept while the days are still being filled (A1: after migration 042 or a
 * rebuild, `ActivityDayReader.daysComplete`): a moment, so that the page shows the days as they
 * come in without asking the database at every view.
 */
export const DAYS_UNCOUNTED_MS = 30_000;
/** How many (server, regions left out) series are kept at once. */
const SERIES_KEPT = 64;

export interface HistoryDaysOptions {
  /** The raids per day (`ActivityRepository`). */
  reader: ActivityDayReader;
  /** `settings.timezone`: which local day is today, never judged. */
  zone: string;
  /** The catalogue's name of a boss by its key; undefined for one it no longer knows. */
  bossName: (bossKey: string) => string | undefined;
}

/** A big day with the boss that names it, if any (`BigDay.label`, named by the catalogue). */
export interface NamedBigDay extends BigDay {
  boss: { key: string; name: string; raids: number } | undefined;
}

/** A server's days, read once and judged once (`bigDays`), with its big days named. */
interface Series {
  totals: DayTotal[];
  big: NamedBigDay[];
  /** Every known boss's raids over the whole history (never `NO_BOSS`; none without raids). */
  bossTotals: Map<string, number>;
  /** Every known boss's raids per local month (`yyyy-mm`), the months with any, in their order. */
  bossMonths: Map<string, Array<{ month: string; raids: number }>>;
  /** Whether the days held the server's whole history when read (A1). */
  complete: boolean;
}

/**
 * Raids per day, big days and a boss's trend (plan 8H-8, design Part G), for the history page and
 * the events forum's "On this day" alike: a server's days (`ActivityDayReader.dayTotals`, summed
 * over the regions not left out) and every day's bosses (`dayBosses`, the boss rule's, round 1),
 * judged by the domain's one rule (`bigDays`), the big days named by the catalogue, and from
 * those bosses the list of bosses and each boss's months (review W3: no read of their own). Each
 * server's series is kept `DAYS_FRESH_MS` per set of regions left out (the page's members barred nowhere
 * share one), only `DAYS_UNCOUNTED_MS` while the days are still being filled, a read on its way
 * shared, a failed one not kept.
 */
export class HistoryDays {
  private readonly kept = new BoundedMap<string, { until: number; read: Promise<Series> }>(
    SERIES_KEPT,
  );

  constructor(private readonly options: HistoryDaysOptions) {}

  /**
   * A calendar year of a server (`year`; without one the newest the server has, else this local
   * year, A6): its days with raids or max battles, its big days ranked (both of two in a row),
   * its top three (`topBigDays`, as "Big days of every year" has them), and every year the
   * server has, newest first.
   */
  async year(
    serverId: string,
    leftOut: ReadonlySet<number>,
    year: number | undefined,
    now: number,
  ): Promise<{
    year: number;
    years: number[];
    days: DayTotal[];
    big: NamedBigDay[];
    top: NamedBigDay[];
  }> {
    const series = await this.series(serverId, leftOut, now);
    const years = seriesYears(series.totals);
    const shown = year ?? years[0] ?? Number(localDay(now, this.options.zone).slice(0, 4));
    const prefix = `${String(shown).padStart(4, '0')}-`;
    return {
      year: shown,
      years,
      days: series.totals.filter((one) => one.day.startsWith(prefix)),
      big: yearBigDays(series.big, shown),
      top: topBigDays(series.big, shown, PAGE_TOP_DAYS),
    };
  }

  /**
   * The top `count` big days of every year (`topBigDays`: one of a run of days in a row, ranked
   * whole across a year's end), newest year first, the years without one left out: the page's
   * "Big days of every year" (G10, three).
   */
  async everyYear(
    serverId: string,
    leftOut: ReadonlySet<number>,
    now: number,
    count = PAGE_TOP_DAYS,
  ): Promise<Array<{ year: number; days: NamedBigDay[] }>> {
    const series = await this.series(serverId, leftOut, now);
    return seriesYears(series.totals).flatMap((year) => {
      const days = topBigDays(series.big, year, count);
      return days.length === 0 ? [] : [{ year, days }];
    });
  }

  /**
   * What the events forum's "On this day" recalls at `now` (plan 8H-8): of each earlier year, its
   * top `count` big days that fall on today's local date (`onThisDayDays`), newest first, with how
   * many years ago; and whether the days held the whole history (A1: the post waits while not).
   */
  async onThisDay(
    serverId: string,
    leftOut: ReadonlySet<number>,
    now: number,
    count: number,
  ): Promise<{
    today: string;
    complete: boolean;
    years: Array<{ years: number; day: NamedBigDay }>;
  }> {
    const today = localDay(now, this.options.zone);
    if (count <= 0) return { today, complete: true, years: [] };
    const series = await this.series(serverId, leftOut, now);
    const year = Number(today.slice(0, 4));
    return {
      today,
      complete: series.complete,
      years: onThisDayDays(series.big, today, count).map((day) => ({
        years: year - Number(day.day.slice(0, 4)),
        day,
      })),
    };
  }

  /** The bosses of a server's raids, by the catalogue's names (one it no longer knows left out). */
  async bosses(
    serverId: string,
    leftOut: ReadonlySet<number>,
    now: number,
  ): Promise<Array<{ key: string; name: string; raids: number }>> {
    const series = await this.series(serverId, leftOut, now);
    return [...series.bossTotals]
      .flatMap(([key, raids]) => {
        const name = this.options.bossName(key);
        return name === undefined ? [] : [{ key, name, raids }];
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.key < b.key ? -1 : 1));
  }

  /**
   * A boss's raids per local month, from the month of its first raid to that of its last, the
   * months between without any as 0 (G12: raids only); undefined for a key the catalogue does not
   * know.
   */
  async boss(
    serverId: string,
    key: string,
    leftOut: ReadonlySet<number>,
    now: number,
  ): Promise<
    { key: string; name: string; months: Array<{ month: string; raids: number }> } | undefined
  > {
    const name = this.options.bossName(key);
    if (name === undefined) return undefined;
    const read = (await this.series(serverId, leftOut, now)).bossMonths.get(key) ?? [];
    const first = read[0];
    const last = read.at(-1);
    if (first === undefined || last === undefined) return { key, name, months: [] };
    const raids = new Map(read.map((one) => [one.month, one.raids]));
    const months: Array<{ month: string; raids: number }> = [];
    for (let month = first.month; month <= last.month; month = nextMonth(month)) {
      months.push({ month, raids: raids.get(month) ?? 0 });
    }
    return { key, name, months };
  }

  /**
   * A server's series without the regions `leftOut` names, kept `DAYS_FRESH_MS` from `now`
   * (`DAYS_UNCOUNTED_MS` while the days are being filled), its big days judged as of the local
   * day of `now` (a new day is a new key).
   */
  private series(serverId: string, leftOut: ReadonlySet<number>, now: number): Promise<Series> {
    const today = localDay(now, this.options.zone);
    const regions = [...leftOut].sort((a, b) => a - b);
    const key = `${serverId}|${today}|${regions.join(',')}`;
    const kept = this.kept.get(key);
    if (kept !== undefined && kept.until > now) return kept.read;
    const read = this.read(serverId, regions, today);
    const entry = { until: now + DAYS_FRESH_MS, read };
    this.kept.set(key, entry);
    read.then(
      (series) => {
        if (!series.complete) entry.until = now + DAYS_UNCOUNTED_MS;
      },
      () => {
        if (this.kept.get(key)?.read === read) this.kept.delete(key);
      },
    );
    return read;
  }

  private async read(serverId: string, leftOut: number[], today: string): Promise<Series> {
    const { reader, bossName } = this.options;
    // Whether complete, the days and every day's bosses (the boss rule judges each day), of one
    // snapshot (R3).
    const { complete, totals, bosses } = await reader.daySeries(serverId, leftOut);
    const bossTotals = new Map<string, number>();
    const months = new Map<string, Map<string, number>>();
    for (const one of bosses) {
      bossTotals.set(one.boss, (bossTotals.get(one.boss) ?? 0) + one.raids);
      const own = months.get(one.boss) ?? new Map<string, number>();
      months.set(one.boss, own);
      const month = one.day.slice(0, 7);
      own.set(month, (own.get(month) ?? 0) + one.raids);
    }
    return {
      totals,
      complete,
      bossTotals,
      bossMonths: new Map(
        [...months].map(([boss, own]) => [
          boss,
          [...own]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([month, raids]) => ({ month, raids })),
        ]),
      ),
      big: bigDays(totals, bosses, today).map((one) => {
        const name = one.label === undefined ? undefined : bossName(one.label.boss);
        return {
          ...one,
          boss:
            one.label === undefined || name === undefined
              ? undefined
              : { key: one.label.boss, name, raids: one.label.raids },
        };
      }),
    };
  }
}
