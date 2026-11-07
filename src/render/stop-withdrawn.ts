import { rewardLine } from '../domain/research/task.js';
import { isLeaderOrGiovanni } from '../domain/rocket/lineups.js';
import {
  isResearchReport,
  type ResearchReport,
  type RocketReport,
  type StopReport,
} from '../domain/stops/report.js';
import { stopMapLink } from './research.js';
import { withArticle } from './rocket.js';
import { count, fitMessages, plainNoLinks, truncate } from './text.js';

/*
 * The second DM about a report at a stop (Matt, 2026-11-07): who was told of a field research or
 * Team GO Rocket report hears that it was taken back, or replaced, before its time. The DMs sent
 * are never edited. Plain text, no buttons.
 */

/** How a report a member was told of ended early. */
export type WithdrawnHow =
  /** Taken back by the member who reported it. */
  | { kind: 'reporter' }
  /** Taken back by staff. */
  | { kind: 'staff' }
  /** Replaced by another member's (or its reporter's) report that contradicts it. */
  | { kind: 'replaced'; by: StopReport };

/** A report a member was told of, and how it ended early. */
export interface WithdrawnReport {
  report: StopReport;
  how: WithdrawnHow;
}

/** How many stops one sentence names; the rest are counted. */
const STOPS_NAMED = 5;

/**
 * What a report is of, as the second DM names it: `the field research **Catch …** · Gible`, `the
 * report of a **Water-type grunt**`, `the report of **Arlo**`. Everything through
 * `plainNoLinks` (it reaches other members' DMs).
 */
function subjectOf(report: StopReport): string {
  if (isResearchReport(report)) return `the field research ${researchWhat(report)}`;
  return `the report of ${rocketWhat(report)}`;
}

/** A research report's task and rewards: `**Catch …** · Gible`, `**Catch …** · one of …`. */
function researchWhat(report: ResearchReport): string {
  const rewards = rewardLine(report.research.rewards);
  const text = `**${plainNoLinks(truncate(report.research.text, 120))}**`;
  return rewards === '' ? text : `${text} · ${plainNoLinks(rewards)}`;
}

/** Who of Team GO Rocket: a grunt or the decoy with its article, a leader or Giovanni by name. */
function rocketWhat(report: RocketReport): string {
  const shown = `**${plainNoLinks(report.rocket.name)}**`;
  return isLeaderOrGiovanni(report.subjectKey) ? shown : withArticle(report.rocket.name, shown);
}

/** What stands at the stop now, after a colon: `a **Fire-type grunt**`, `**Catch …** · Gible`. */
function nowWhat(report: StopReport): string {
  return isResearchReport(report) ? researchWhat(report) : rocketWhat(report);
}

/** The stops, each its name as the link to its place: `A`, `A and B`, `A, B and 3 more stops`. */
function stopsWords(reports: readonly StopReport[]): string {
  const names = reports.slice(0, STOPS_NAMED).map((report) => stopMapLink(report.stop));
  const more = reports.length - names.length;
  if (more > 0) names.push(count(more, 'more stop'));
  const last = names.pop() ?? '';
  return names.length === 0 ? last : `${names.join(', ')} and ${last}`;
}

/** How it ended, as the sentence ends. */
function endWords(how: WithdrawnHow): string {
  switch (how.kind) {
    case 'reporter':
      return 'was taken back by its reporter.';
    case 'staff':
      return 'was taken back by staff.';
    case 'replaced':
      return `was replaced: ${nowWhat(how.by)} is reported there now.`;
  }
}

/** What tells the reports of one sentence apart: one subject, ended in one way, alike. */
function sentenceKey({ report, how }: WithdrawnReport): string {
  const replacement = how.kind === 'replaced' ? ` ${how.by.subjectKey}` : '';
  return `${report.kind} ${report.subjectKey} ${how.kind}${replacement}`;
}

/**
 * The second DM to a member (Matt, 2026-11-07), one sentence per subject and way it ended, its
 * stops named together: `The report of a **Water-type grunt** at **[Yellow Mural](<…>)** was
 * taken back by its reporter.`, `The field research **Catch …** · Gible at … was replaced:
 * **Catch …** · Beldum is reported there now.` The stops as the first DM named them (their names
 * the links to their places, `stopMapLink`).
 */
export function withdrawnDm(reports: readonly WithdrawnReport[]): string {
  const sentences = new Map<string, WithdrawnReport[]>();
  for (const one of reports) {
    const key = sentenceKey(one);
    sentences.set(key, [...(sentences.get(key) ?? []), one]);
  }
  const lines = [...sentences.values()].map((alike) => {
    const [first] = alike;
    if (!first) return '';
    const subject = subjectOf(first.report);
    return (
      `${subject.charAt(0).toUpperCase()}${subject.slice(1)} at ` +
      `${stopsWords(alike.map(({ report }) => report))} ${endWords(first.how)}`
    );
  });
  // Within Discord's 2,000 characters (review F2): the sentences that do not fit are left out,
  // whole, at the end.
  return fitMessages(lines)[0] ?? '';
}
