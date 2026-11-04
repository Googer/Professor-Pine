import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { cellIdAt, cellToken } from '@pine/wayspot-core/s2';
import { withoutMembers } from '../history/party-history.js';
import type { ResearchDecision } from '../research/reports.js';
import type { RocketDecision } from '../rocket/reports.js';

/*
 * The history of reports at stops (plan 8H-2; design `2026-11-04-history-on-show-design.md`,
 * Part A): how a version of a report ends, decided here, never by the repository (review H1),
 * and who confirmed it. Pure: the storage asks it inside the transaction that holds the rows.
 */

/**
 * How a version of a report at a stop ended (Part A's table):
 *
 * - `stood`: it lasted to its end (the sweep), or had ended when another report took its row
 *   (review H3; ended at its `endsAt`);
 * - `narrowed`: a reward replaced its "one of";
 * - `refined`: a grunt refined in place, the version as it was before the refine (review H15);
 * - `corrected`: its reporter replaced it with another report (review H2);
 * - `contradicted`: another member ticked it in "Replace field research?" (review H2);
 * - `churned`: Rocket's turnover, grunt over grunt, hideout over anything, and a report of
 *   another day that still stood when today's took it (review H5);
 * - `withdrawn`: its reporter took it back (review H8);
 * - `staff`: staff took back somebody else's;
 * - `unposted`: Pine took back a grunt posted nowhere, or one overtaken (review H4).
 */
export type ReportEnding =
  | 'stood'
  | 'narrowed'
  | 'refined'
  | 'corrected'
  | 'contradicted'
  | 'churned'
  | 'withdrawn'
  | 'staff'
  | 'unposted';

/**
 * The level of the S2 cell a report's place is kept as (Q1): about 600 m across, fine enough for
 * a map of where reports come from, coarse enough not to be a doorstep (level 15, a block or two,
 * was turned down).
 */
export const REPORT_CELL_LEVEL = 14;

/** The S2 cell a report at a stop is kept to have been in (`REPORT_CELL_LEVEL`), as a token. */
export function reportCell(point: LatLon): string {
  return cellToken(cellIdAt(point, REPORT_CELL_LEVEL));
}

/**
 * Who takes a report back (`StopReportService.takeBack`, review H8): a member (their own), staff
 * (anyone's), or Pine itself undoing a grunt that shows nowhere (`unposted`).
 */
export type TakeBackBy = 'member' | 'staff' | 'unposted';

/**
 * What a decision means for the report standing at the stop: how it ends where the save takes
 * its row (none where the decision keeps it, or where it had ended: `endingOfRow` says `stood`),
 * and whether the new report's member confirms it (another member meeting this very version with
 * a report of their own: review H6, Q4).
 */
export interface StandingFate {
  ending: ReportEnding | undefined;
  confirms: boolean;
}

/**
 * What `decideResearch`'s decision means for the standing report, reported by `standingBy`, when
 * `by` reports: a reward over its "one of" narrows it (and confirms it, by another member); the
 * same version or one that says less confirms it (by another); a contradiction replaced is
 * `corrected` where it was the member's own and `contradicted` where they ticked another's.
 */
export function researchFate(
  decision: ResearchDecision,
  standingBy: string,
  by: string,
): StandingFate {
  const another = standingBy !== by;
  switch (decision) {
    case 'narrow':
      return { ending: 'narrowed', confirms: another };
    case 'again':
    case 'less':
      return { ending: undefined, confirms: another };
    case 'correct':
      return { ending: another ? 'contradicted' : 'corrected', confirms: false };
    case 'new':
    case 'asks':
      return { ending: undefined, confirms: false };
  }
}

/**
 * What `decideRocket`'s decision means for the standing report: a report in its place churns it,
 * a refine ends the version before it (`refined`); the same grunt again, or "not sure which" where
 * its lineup stands, confirms it by another member.
 */
export function rocketFate(decision: RocketDecision, standingBy: string, by: string): StandingFate {
  switch (decision) {
    case 'report':
      return { ending: 'churned', confirms: false };
    case 'refine':
      return { ending: 'refined', confirms: false };
    case 'already':
      return { ending: undefined, confirms: standingBy !== by };
    case 'asks':
      return { ending: undefined, confirms: false };
  }
}

/**
 * How a row that a save takes away at `at` ends: one whose end had passed stood, ended at its own
 * end (review H3); the row decided about as its fate says (`decided`); any other that still stood
 * (a grunt of yesterday past midnight, fix A2) churned. Ended at `at` but where it stood.
 */
export function endingOfRow(
  row: { endsAt: number },
  at: number,
  decided: ReportEnding | undefined,
): { ending: ReportEnding; endedAt: number } {
  if (row.endsAt <= at) return { ending: 'stood', endedAt: row.endsAt };
  return { ending: decided ?? 'churned', endedAt: at };
}

/**
 * How a report taken back ends (review H8): Pine's own undo `unposted`; by its reporter
 * `withdrawn`; else by staff (`staff`), whatever flag the caller had.
 */
export function takeBackEnding(reporterId: string, by: string, as: TakeBackBy): ReportEnding {
  if (as === 'unposted') return 'unposted';
  return reporterId === by ? 'withdrawn' : 'staff';
}

/**
 * The members who confirmed a version, with `member` (review H6): each once, never its reporter;
 * the very same list where nothing changed. One friend pressing "Already reported" ten times
 * confirms once.
 */
export function confirmedWith(
  confirmedBy: readonly string[],
  member: string,
  reporterId: string,
): readonly string[] {
  if (member === reporterId || confirmedBy.includes(member)) return confirmedBy;
  return [...confirmedBy, member];
}

/**
 * A report's detail as the history keeps it: every text in it with each member it names written
 * `@member` (`withoutMembers`, as the party history keeps member text; review H12). It walks any
 * JSON, so a detail this version cannot read is kept as well, and stays JSON.
 */
export function detailWithoutMembers(detail: unknown): unknown {
  if (typeof detail === 'string') return withoutMembers(detail);
  if (Array.isArray(detail)) return detail.map(detailWithoutMembers);
  if (detail !== null && typeof detail === 'object') {
    return Object.fromEntries(
      Object.entries(detail).map(([key, value]) => [key, detailWithoutMembers(value)]),
    );
  }
  return detail;
}
