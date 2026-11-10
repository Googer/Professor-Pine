import type { TaskReward } from '../research/task.js';
import type { RocketCatch } from '../rocket/lineups.js';

/*
 * Reports at stops (plan 8R-1; design `2026-10-21-stop-reports-design.md`, decision 1): a stop,
 * what is there and until when. Field research is the kind of plan 8R-1; Team GO Rocket (plan
 * 8R-2) adds a kind with a detail of its own.
 */

/** The kinds of report at a stop: field research, and Team GO Rocket (plan 8R-2). */
export type StopReportKind = StopReport['kind'];

/**
 * A stop as a report keeps it (design 3: a snapshot, as a spawn report keeps its place): its key
 * (a kept Wayspot's Wayfarer id, a stop of Pine's own as `pine-<id>`), name, address line (null
 * for none), picture (null for none) and point. A report still shows a stop renamed or removed
 * later the same day.
 */
export interface ReportedStop {
  key: string;
  name: string;
  address: string | null;
  image: string | null;
  lat: number;
  lon: number;
}

/**
 * What a research report says: the task's text, its category (null for a typed one), its
 * rewards as the list had them when it was reported (one typed reward, or none, for a task
 * typed in full), and whether it was typed (`typed`: no task of the list).
 */
export interface ResearchDetail {
  text: string;
  category: string | null;
  rewards: TaskReward[];
  typed: boolean;
}

/** A member who reported, by id and by name as shown then. */
export interface Reporter {
  id: string;
  name: string;
}

/**
 * What a Rocket report says (plan 8R-2): who it is of by name (`Water-type grunt`, `Arlo`), and
 * the Pokémon that can be caught, as the lineups had them when it was reported. Who it is of is
 * its `subjectKey` (`rocketKey`). A lineup of a grunt type (plan 8R-4L) keeps its first slot in
 * short (`lineup`: `Magikarp, Feebas`), which names it beside the type's name where a grunt is
 * named apart from its catches; the name stays the type's.
 */
export interface RocketDetail {
  name: string;
  catches: RocketCatch[];
  lineup?: string;
}

/** What every report has, whatever its kind. */
interface StopReportBase {
  id: number;
  /** Snowflake of the server: a report belongs to one (design 9.3). */
  serverId: string;
  stop: ReportedStop;
  /**
   * The period it was made in: of research, the research period
   * (`src/domain/time/research-periods.ts`); of Rocket, the local day (`rocketDay`).
   */
  periodKey: string;
  /**
   * When it ends, epoch milliseconds: research and hideouts with their period; a grunt
   * `settings.rocket.gruntMinutes` after it was made.
   */
  endsAt: number;
  /**
   * What it is of, for telling two reports of one thing apart: a task's key, a typed task's
   * `typed:<key of its text>`; a Rocket report's `rocketKey` (`grunt:water`, `leader:arlo`).
   */
  subjectKey: string;
  reporter: Reporter;
  madeAt: number;
}

/** Field research reported at a stop (plan 8R-1). */
export interface ResearchReport extends StopReportBase {
  kind: 'research';
  research: ResearchDetail;
}

/**
 * Team GO Rocket reported at a stop (plan 8R-2): a grunt for half an hour, or a hideout (a
 * leader, Giovanni, the decoy) for the day. One per server, stop and day (design 5.2).
 */
export interface RocketReport extends StopReportBase {
  kind: 'rocket';
  rocket: RocketDetail;
}

/** A report as it is kept. */
export type StopReport = ResearchReport | RocketReport;

/** A report as it is made: the storage gives its id. */
export type NewStopReport = Omit<ResearchReport, 'id'> | Omit<RocketReport, 'id'>;

/** Whether a report is of field research. */
export function isResearchReport(report: StopReport): report is ResearchReport {
  return report.kind === 'research';
}

/** Whether a report is of Team GO Rocket. */
export function isRocketReport(report: StopReport): report is RocketReport {
  return report.kind === 'rocket';
}

/** The key of a stop of Pine's own (`/pokestop`). */
export function pineStopKey(id: number): string {
  return `pine-${String(id)}`;
}

/** The row id of a stop of Pine's own a key names; undefined for any other key. */
export function pineStopIdOf(key: string): number | undefined {
  const match = /^pine-([1-9]\d{0,9})$/.exec(key);
  return match ? Number(match[1]) : undefined;
}

/** The subject of a typed task: `typed:` and the key of its text. */
export function typedSubject(textKey: string): string {
  return `typed:${textKey}`;
}
