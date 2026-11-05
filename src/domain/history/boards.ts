import { researchSubjectOf } from '../research/reports.js';
import { monthStart, zoned } from '../time/zoned.js';
import { BOARD_SIZE } from './board-words.js';
import type { PartyEnding } from './party-history.js';
import type { TallyPeriod } from './tally-periods.js';

/*
 * The boards (plan 8H-6, design Part D): members ranked by what others confirmed they did, and
 * things ranked by counts, over the rows the history's reader gives (`BoardReader`). One path
 * for `/stats boards`, `/stats me` and the web's history page.
 */

/**
 * A record that credits a member on a board of people: a raid or max battle they reported that
 * another member completed, a train they conducted or a meetup they hosted that another came to
 * (the reader's tested SQL decides which records). `at`: when it was made. `anonymous`: the
 * party did not name its maker, so it counts toward no board, only in the member's own numbers.
 */
export interface BoardCredit {
  memberId: string;
  at: number;
  anonymous: boolean;
}

/** A train a member conducted, by its party, so that the trains of one ride count once. */
export interface RideCredit extends BoardCredit {
  partyId: string;
}

/** A train split off another (`PartyHistory.splitFromId`): the two are one ride. */
export interface SplitLink {
  partyId: string;
  splitFromId: string;
}

/**
 * A report at a stop of a member's that counted (`COUNTING_ENDINGS`), when it ended, with how
 * many others met it with a report of their own.
 */
export interface ReportCredit {
  memberId: string;
  at: number;
  confirmations: number;
}

/**
 * What a member's reports at stops of a server earned, all time (Matt, 2026-11-05): the
 * confirmations every report of theirs received but those staff took back, how many of theirs
 * another member contradicted, and how many counted (`COUNTING_ENDINGS`).
 */
export interface ReportScore {
  memberId: string;
  confirmations: number;
  contradicted: number;
  counted: number;
}

/**
 * How a report at a stop ended for it to count on the boards (B6; `history.md`'s endings):
 * stood, narrowed by a reward, refined in place, or Rocket's turnover. `contradicted` and `staff`
 * count against nobody's count; the rest are neutral or nothing.
 */
export const COUNTING_ENDINGS = ['stood', 'narrowed', 'refined', 'churned'] as const;

/** How a raid or max battle ended for it to credit nobody: somebody closed it. */
export const CLOSED_ENDING: PartyEnding = 'cancelled';

/** A member's place on a board, before names. */
export interface Standing {
  memberId: string;
  count: number;
  /** When the record that made the count was: the earlier of two equal counts ranks first. */
  reachedAt: number;
  /** The confirmations of the counted reports (the board of reports); 0 elsewhere. */
  confirmations: number;
}

/**
 * The standings of a board from its credits, every member who has one: by the count, then by
 * who reached it first (the latest of their credited records, the one that made the count),
 * then by member id.
 */
export function boardStandings(
  credits: readonly { memberId: string; at: number; confirmations?: number }[],
): Standing[] {
  const byMember = new Map<string, Standing>();
  for (const credit of credits) {
    const was = byMember.get(credit.memberId);
    byMember.set(credit.memberId, {
      memberId: credit.memberId,
      count: (was?.count ?? 0) + 1,
      reachedAt: Math.max(was?.reachedAt ?? Number.NEGATIVE_INFINITY, credit.at),
      confirmations: (was?.confirmations ?? 0) + (credit.confirmations ?? 0),
    });
  }
  return [...byMember.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.reachedAt - b.reachedAt ||
      (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
  );
}

/**
 * A board of people from its credits (review A6): `standings`, every member credited but by an
 * anonymous record (which counts for no board, rule 4), where a viewer is placed; `ranked`, of
 * them the members on the boards (`onBoards`: both switches on when the board is read).
 */
export function peopleStandings(
  credits: readonly { memberId: string; at: number; anonymous?: boolean; confirmations?: number }[],
  onBoards: ReadonlySet<string>,
): { standings: Standing[]; ranked: Standing[] } {
  const standings = boardStandings(credits.filter((credit) => credit.anonymous !== true));
  return { standings, ranked: standings.filter((one) => onBoards.has(one.memberId)) };
}

/**
 * The trains of a member as rides (B9): trains linked by `splitFromId`, and their own splits,
 * are one ride, which credits each member once, at its earliest record they conducted.
 */
export function rides(credits: readonly RideCredit[], links: readonly SplitLink[]): BoardCredit[] {
  const parent = new Map(links.map((link) => [link.partyId, link.splitFromId]));
  const rootOf = (partyId: string): string => {
    let root = partyId;
    const seen = new Set<string>();
    for (let up = parent.get(root); up !== undefined && !seen.has(up); up = parent.get(root)) {
      seen.add(root);
      root = up;
    }
    return root;
  };
  const kept = new Map<string, BoardCredit>();
  for (const credit of [...credits].sort((a, b) => a.at - b.at)) {
    const key = `${credit.memberId}:${rootOf(credit.partyId)}`;
    if (!kept.has(key)) {
      kept.set(key, { memberId: credit.memberId, at: credit.at, anonymous: credit.anonymous });
    }
  }
  return [...kept.values()];
}

/**
 * How many counting reports nobody contradicted add a point to a member's reputation, as a
 * confirmation would (Matt, 2026-11-05: a passive positive). A counting report is one nobody
 * contradicted: `contradicted` is an ending of its own.
 */
export const UNCONTESTED_PER_POINT = 20;

/**
 * A member's reputation (Matt, 2026-11-05): the confirmations every report of theirs received
 * but those staff took back, less how many of theirs another member contradicted, plus a point
 * for every `UNCONTESTED_PER_POINT` of their counting reports; all time, from 0. Shown to nobody:
 * only its effect (`reportsThatCount`).
 */
export function reputationOf(score: ReportScore): number {
  return (
    score.confirmations - score.contradicted + Math.floor(score.counted / UNCONTESTED_PER_POINT)
  );
}

/**
 * The reports that count on the board of reports and in a member's own count: every one of a
 * member whose reputation is 0 or above (a member without a score stands at 0), only those
 * confirmed at least once of a member below 0.
 */
export function reportsThatCount(
  credits: readonly ReportCredit[],
  scores: readonly ReportScore[],
): ReportCredit[] {
  const reputation = new Map(scores.map((score) => [score.memberId, reputationOf(score)]));
  return credits.filter(
    (credit) => (reputation.get(credit.memberId) ?? 0) >= 0 || credit.confirmations >= 1,
  );
}

/**
 * When a period of the boards begins at `now` (epoch ms): this month's or this year's first
 * local midnight in `zone`, as the region tally's periods go by local months; null for all time.
 */
export function periodStart(period: TallyPeriod, now: number, zone: string): number | null {
  const today = zoned(now, zone);
  switch (period) {
    case 'month':
      return monthStart(today.year, today.month, zone).epochMilliseconds;
    case 'year':
      return monthStart(today.year, 1, zone).epochMilliseconds;
    case 'all':
      return null;
  }
}

/** When a local calendar year begins and the next one does, epoch ms in `zone`. */
export function yearRange(year: number, zone: string): { since: number; until: number } {
  return {
    since: monthStart(year, 1, zone).epochMilliseconds,
    until: monthStart(year + 1, 1, zone).epochMilliseconds,
  };
}

/** A line of a board of things: what it is, its name as the catalogue has it, and its count. */
export interface ThingRow {
  key: string;
  name: string;
  count: number;
}

/** The top of a board of things: the highest count first, then by name, then by key. */
function topThings(rows: readonly ThingRow[]): ThingRow[] {
  return [...rows]
    .filter((row) => row.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, 'en') ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .slice(0, BOARD_SIZE);
}

/**
 * The most wanted (Matt, Q3): the `species:<dex>` counts of a day (`WantCountDay`), each named
 * by the catalogue's species (`nameOf`); one it does not know, and every other key, is left out.
 */
export function mostWanted(
  counts: readonly { target: string; count: number }[],
  nameOf: (dex: number) => string | undefined,
): ThingRow[] {
  return topThings(
    counts.flatMap((row) => {
      const dex = /^species:(\d+)$/u.exec(row.target)?.[1];
      const name = dex === undefined ? undefined : nameOf(Number(dex));
      return name === undefined ? [] : [{ key: row.target, name, count: row.count }];
    }),
  );
}

/**
 * The bosses whose raids and max battles were sent to the most members (B12): by the sums of
 * their records' `reached`, catalogue bosses only (`nameOf` of the boss's key; never a name a
 * member typed).
 */
export function mostSent(
  sums: readonly { bossKey: string; sent: number }[],
  nameOf: (bossKey: string) => string | undefined,
): ThingRow[] {
  return topThings(
    sums.flatMap((row) => {
      const name = nameOf(row.bossKey);
      return name === undefined ? [] : [{ key: row.bossKey, name, count: row.sent }];
    }),
  );
}

/**
 * The field research tasks reported most (B7): the counted reports of each subject summed by
 * its task (`researchSubjectOf`, never the raw key), the tasks of the list only (a typed task, or
 * a subject that reads as none, is left out), worded as the list words the task now (`nameOf`)
 * or, where it no longer has it, as the report kept its words.
 */
export function mostReportedTasks(
  counts: readonly { subjectKey: string; text: string | null; reports: number }[],
  nameOf: (taskKey: string) => string | undefined,
): ThingRow[] {
  const tasks = new Map<string, ThingRow>();
  for (const row of counts) {
    const task = researchSubjectOf(row.subjectKey)?.task;
    if (task === undefined || task.startsWith('typed:')) continue;
    const was = tasks.get(task);
    const name = was?.name ?? nameOf(task) ?? row.text ?? undefined;
    if (name === undefined) continue;
    tasks.set(task, { key: task, name, count: (was?.count ?? 0) + row.reports });
  }
  return topThings([...tasks.values()]);
}
