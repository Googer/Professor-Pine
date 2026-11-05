import { activityWhen } from './activity.js';
import {
  reportsThatCount,
  rideRoot,
  rides,
  yearRange,
  type BoardCredit,
  type ReportCredit,
  type ReportScore,
  type RideCredit,
  type SplitLink,
} from './boards.js';
import type { HistoryKind, HistoryStatus } from './party-history.js';

/*
 * A member's own stats (plan 8H-6, design Part E): their numbers of the four boards (anonymous
 * records included, and said), what they completed and came to, their busiest region, the
 * bosses they did most and what their news was sent to, all time or for a calendar year. One
 * path for `/stats me`, its Share and the web's "Your Pine".
 */

/**
 * A record of the history the member is in, as maker or attendee: what it was, when it was made,
 * its region, its catalogue boss, whether it was anonymous, whether they made it, how far they
 * got (null: they made it and never signed up) and what its news was sent to.
 */
export interface MemberParty {
  /** Its party (or, for a legacy record, its legacy key), so that a split ride counts once. */
  partyId: string;
  /** The train it was split off from (`PartyHistory.splitFromId`); null for none. */
  splitFromId: string | null;
  kind: HistoryKind;
  at: number;
  regionId: number | null;
  bossKey: string | null;
  anonymous: boolean;
  made: boolean;
  furthest: HistoryStatus | null;
  reached: number;
}

/** A record of a report at a stop of the member's: when it ended, what its news was sent to. */
export interface MemberReport {
  at: number;
  reach: number;
}

/** What `memberStats` counts from: the member's rows and their credits of the boards. */
export interface MemberStatsInput {
  parties: readonly MemberParty[];
  reports: readonly MemberReport[];
  raids: readonly BoardCredit[];
  trains: readonly RideCredit[];
  splits: readonly SplitLink[];
  meetups: readonly BoardCredit[];
  reportCredits: readonly ReportCredit[];
  scores: readonly ReportScore[];
}

/** A count of a board, and how many of it are of anonymous records (in no board). */
export interface Counted {
  count: number;
  anonymous: number;
}

export interface MemberStats {
  /** The calendar year counted, or null for all time. */
  year: number | null;
  raids: Counted;
  trains: Counted;
  meetups: Counted;
  reports: { count: number; confirmations: number };
  /** Raids and max battles they completed. */
  completed: number;
  /** Trains and meetups they came to (here or done). */
  trainsCame: number;
  meetupsCame: number;
  /** The region of most records they came to (by its id, rule 2: a region, never a place). */
  busiestRegion: { regionId: number; parties: number } | null;
  /** The three catalogue bosses of most raids and max battles they completed. */
  bosses: { bossKey: string; count: number }[];
  /** What the news of the raids, max battles and trains they made and their reports was sent to. */
  sent: number;
  /** By local month, oldest first: what they came to and their reports that counted. */
  months: { month: string; came: number; reports: number }[];
}

export interface MemberStatsOptions {
  /** `settings.timezone`: a year and a month are local. */
  zone: string;
  /** A calendar year; all time without. */
  year?: number;
  /** For a shared card: anonymous records are left out, counts and reach alike (B2, B3). */
  shared?: boolean;
}

const came = (furthest: HistoryStatus | null): boolean =>
  furthest === 'here' || furthest === 'done';
const isBattle = (kind: HistoryKind): boolean => kind === 'raid' || kind === 'max';

/** Rides of these credits, and how many of them have only anonymous records. */
function rideCount(credits: readonly RideCredit[], splits: readonly SplitLink[]): Counted {
  const count = rides(credits, splits).length;
  const named = rides(
    credits.filter((credit) => !credit.anonymous),
    splits,
  ).length;
  return { count, anonymous: count - named };
}

const counted = (credits: readonly BoardCredit[]): Counted => ({
  count: credits.length,
  anonymous: credits.filter((credit) => credit.anonymous).length,
});

/** Whether a card has nothing to say: every number of it 0. */
function emptyCard(stats: MemberStats): boolean {
  return (
    stats.raids.count + stats.trains.count + stats.meetups.count + stats.reports.count === 0 &&
    stats.completed + stats.trainsCame + stats.meetupsCame + stats.sent === 0
  );
}

/**
 * The calendar years the member has anything in, latest first: those whose card would say
 * something (review A9: a year of a raid they were only interested in has none).
 */
export function memberYears(input: MemberStatsInput, zone: string): number[] {
  const times = [
    ...input.parties.map((one) => one.at),
    ...input.reports.map((one) => one.at),
    ...input.raids.map((one) => one.at),
    ...input.trains.map((one) => one.at),
    ...input.meetups.map((one) => one.at),
    ...input.reportCredits.map((one) => one.at),
  ];
  const years = new Set(times.map((ms) => Number(activityWhen(ms, zone).month.slice(0, 4))));
  return [...years]
    .filter((year) => !emptyCard(memberStats(input, { zone, year })))
    .sort((a, b) => b - a);
}

/**
 * A member's own stats from their rows, all time or for a calendar year in the zone; for a shared
 * card without anything anonymous. The reports that count follow the boards' rule
 * (`reportsThatCount`); a split train counts once (`rides`).
 */
export function memberStats(input: MemberStatsInput, options: MemberStatsOptions): MemberStats {
  const range = options.year === undefined ? undefined : yearRange(options.year, options.zone);
  const within = (ms: number): boolean =>
    range === undefined || (ms >= range.since && ms < range.until);
  const shown = (one: { at: number; anonymous?: boolean }): boolean =>
    within(one.at) && !(options.shared === true && one.anonymous === true);
  const parties = input.parties.filter(shown);
  const reports = input.reports.filter(shown);
  const counting = reportsThatCount(input.reportCredits, input.scores).filter(shown);

  const regions = new Map<number, number>();
  const bosses = new Map<string, number>();
  const months = new Map<string, { came: number; reports: number }>();
  const month = (ms: number) => {
    const key = activityWhen(ms, options.zone).month;
    const was = months.get(key) ?? { came: 0, reports: 0 };
    months.set(key, was);
    return was;
  };
  // A split train is one ride with the train it was split off (A5, R-A3): counted once, in the
  // month and region of its first record they came to.
  const rootOf = rideRoot([
    ...input.splits,
    ...parties.flatMap((one) =>
      one.splitFromId === null ? [] : [{ partyId: one.partyId, splitFromId: one.splitFromId }],
    ),
  ]);
  const ridden = new Set<string>();
  let trainsCame = 0;
  for (const one of [...parties].sort((a, b) => a.at - b.at)) {
    if (!came(one.furthest)) continue;
    if (one.kind === 'train') {
      const ride = rootOf(one.partyId);
      if (ridden.has(ride)) continue;
      ridden.add(ride);
      trainsCame += 1;
    }
    month(one.at).came += 1;
    if (one.regionId !== null) regions.set(one.regionId, (regions.get(one.regionId) ?? 0) + 1);
    if (isBattle(one.kind) && one.furthest === 'done' && one.bossKey !== null) {
      bosses.set(one.bossKey, (bosses.get(one.bossKey) ?? 0) + 1);
    }
  }
  for (const one of counting) month(one.at).reports += 1;
  const [busiest] = [...regions].sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  return {
    year: options.year ?? null,
    raids: counted(input.raids.filter(shown)),
    trains: rideCount(input.trains.filter(shown), input.splits),
    meetups: counted(input.meetups.filter(shown)),
    reports: {
      count: counting.length,
      confirmations: counting.reduce((sum, one) => sum + one.confirmations, 0),
    },
    completed: parties.filter((one) => isBattle(one.kind) && one.furthest === 'done').length,
    trainsCame,
    meetupsCame: parties.filter((one) => one.kind === 'meetup' && came(one.furthest)).length,
    busiestRegion: busiest === undefined ? null : { regionId: busiest[0], parties: busiest[1] },
    bosses: [...bosses]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 3)
      .map(([bossKey, count]) => ({ bossKey, count })),
    sent:
      parties
        .filter((one) => one.made && one.kind !== 'meetup')
        .reduce((sum, one) => sum + one.reached, 0) +
      reports.reduce((sum, one) => sum + one.reach, 0),
    months: [...months]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, counts]) => ({ month: key, ...counts })),
  };
}
