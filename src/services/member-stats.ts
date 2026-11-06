import { BoundedMap } from '../bounded-map.js';
import type { BoardReader } from '../db/repositories/board-repository.js';
import type { HistoryOptIns } from '../db/repositories/history-repository.js';
import {
  memberStats,
  memberYears,
  type MemberStats,
  type MemberStatsInput,
} from '../domain/history/member-stats.js';

export interface MemberStatsOptions {
  reader: BoardReader;
  /** Whether the member opted in to the server's history (in `/settings`). */
  optIns: Pick<HistoryOptIns, 'isOptedIn'>;
  /** `settings.timezone`: a year is local. */
  zone: string;
  now?: () => number;
}

/**
 * How long a member's years are used for the keystrokes of `/stats me`'s year (B10): each would
 * otherwise read all of the member's records again.
 */
export const YEARS_FRESH_MS = 30_000;
/** As many members' years as are kept at once; the oldest goes first. */
const YEARS_KEPT = 1_000;

/** A member's own stats as asked: none without the opt-in, else their numbers and years. */
export type ShownStats =
  { optedIn: false } | { optedIn: true; stats: MemberStats; years: number[] };

/**
 * A member's own stats (plan 8H-6, design Part E), for `/stats me`, its Share and the web's
 * "Your history" alike: the member's rows read (`BoardReader`'s member reads, all time) and counted
 * by the domain (`memberStats`), for a calendar year where asked. Nothing is read for a member
 * without the history opt-in, whose records keep no id to count.
 */
export class MemberStatsService {
  private readonly keptYears = new BoundedMap<string, { years: number[]; until: number }>(
    YEARS_KEPT,
  );
  private readonly now: () => number;

  constructor(private readonly options: MemberStatsOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** A member's stats of a server, for `year` or all time; `shared` leaves anonymous ones out. */
  async stats(
    serverId: string,
    memberId: string,
    asked: { year?: number; shared?: boolean } = {},
  ): Promise<ShownStats> {
    if (!(await this.options.optIns.isOptedIn(memberId, serverId))) return { optedIn: false };
    const input = await this.input(serverId, memberId);
    const { zone } = this.options;
    return {
      optedIn: true,
      stats: memberStats(input, {
        zone,
        ...(asked.year === undefined ? {} : { year: asked.year }),
        ...(asked.shared === true ? { shared: true } : {}),
      }),
      years: memberYears(input, zone),
    };
  }

  /**
   * The calendar years a member has anything in, latest first; none without the opt-in. Kept
   * `YEARS_FRESH_MS` for the keystrokes that follow (B10).
   */
  async years(serverId: string, memberId: string): Promise<number[]> {
    const key = `${serverId}:${memberId}`;
    const kept = this.keptYears.get(key);
    const now = this.now();
    if (kept !== undefined && kept.until > now) return kept.years;
    const years = (await this.options.optIns.isOptedIn(memberId, serverId))
      ? memberYears(await this.input(serverId, memberId), this.options.zone)
      : [];
    this.keptYears.set(key, { years, until: now + YEARS_FRESH_MS });
    return years;
  }

  private async input(serverId: string, memberId: string): Promise<MemberStatsInput> {
    const { reader } = this.options;
    const range = { since: null, memberId };
    const [parties, reports, raids, trains, splits, meetups, reportCredits, scores] =
      await Promise.all([
        reader.memberParties(serverId, memberId),
        reader.memberReports(serverId, memberId),
        reader.raidCredits(serverId, range),
        reader.trainCredits(serverId, range),
        reader.splitLinks(serverId),
        reader.meetupCredits(serverId, range),
        reader.reportCredits(serverId, range),
        reader.reportScores(serverId, [memberId]),
      ]);
    return { parties, reports, raids, trains, splits, meetups, reportCredits, scores };
  }
}
