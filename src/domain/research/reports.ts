/*
 * Research reports at a stop (plan 8R-5; design `2026-10-23-research-rewards-apart-design.md`,
 * point 4 and R7–R15): one per stop and period, of one version of a task (`versions.ts`). Which
 * stands is decided by the storage with the stop's row locked (`saveUnless`), as Rocket's
 * `decideRocket` is. Pure.
 */

/** A research report's subject read: its task (a key, or `typed:<text key>`) and reward hash. */
export interface ResearchSubjectKey {
  /** The task: a listed task's key, or a typed task's `typed:<key of its text>`. */
  task: string;
  /** The reward's hash (`rewardHash`) of a version of one reward; undefined for the task alone. */
  hash: string | undefined;
}

/**
 * A research report's `subjectKey` read (R9, R11): `<task>`, `<task>:<hash>`,
 * `typed:<text key>` or `typed:<text key>:<hash>`; undefined for anything else. Never read a
 * subject by splitting it on `:`.
 */
export function researchSubjectOf(subjectKey: string): ResearchSubjectKey | undefined {
  const match = /^((?:typed:)?[0-9a-f]{16})(?::([0-9a-f]{8}))?$/.exec(subjectKey);
  if (!match?.[1]) return undefined;
  return { task: match[1], hash: match[2] };
}

/** The task a subject is of (`researchSubjectOf`), the subject itself where it reads as none. */
export function taskOfSubject(subjectKey: string): string {
  return researchSubjectOf(subjectKey)?.task ?? subjectKey;
}

/**
 * Whether a stop whose standing research report is of `standing` (its `subjectKey`, in the period)
 * holds the subject a report is of already (plan 8R-5, R8; plan 8M-11A, S18): the same version;
 * for a "one of", any version of its task. "Same task at more stops…" on Discord and on the map,
 * and the map's "Add stops…", leave such stops out: one rule.
 */
export function holdsSubject(
  standing: string,
  subject: { subjectKey: string; oneOf: boolean },
): boolean {
  return (
    standing === subject.subjectKey ||
    (subject.oneOf && taskOfSubject(standing) === taskOfSubject(subject.subjectKey))
  );
}

/**
 * Whether a report is "one of" (R10), in words, narrowing and confirmations: its task's key
 * alone, with two or more rewards in its detail (a report of before plan 8R-5 has every reward of
 * its task there, items too).
 */
export function isOneOf(report: {
  subjectKey: string;
  research: { rewards: readonly unknown[] };
}): boolean {
  const subject = researchSubjectOf(report.subjectKey);
  return subject !== undefined && subject.hash === undefined && report.research.rewards.length >= 2;
}

/**
 * What the decision reads of a research report: its subject and the hashes of the rewards its
 * detail stands for (`rewardHash` of each: the one reward, the encounters of "one of", every
 * reward of a report made before plan 8R-5).
 */
export interface ResearchAt {
  subjectKey: string;
  hashes: readonly string[];
}

/** What the decision reads of the report standing at the stop in the period. */
export interface StandingResearch extends ResearchAt {
  id: number;
  endsAt: number;
  reporterId: string;
}

/**
 * What becomes of a research report at a stop (point 4): `new` (nothing stands, or it ended:
 * R8); `narrow` (a reward over the "one of" of its task that holds it: replaced without asking);
 * `less` ("one of" over one of its rewards: already reported, the reward says more); `again`
 * (the same version: already reported); `asks` (a contradiction: anything else, asked first, R7);
 * `correct` (a contradiction replaced: of the reporter's own report, or one the member ticked).
 */
export type ResearchDecision = 'new' | 'narrow' | 'less' | 'again' | 'asks' | 'correct';

/**
 * A report's version as the decision sees it: its task, its reward's hash, or none where it
 * stands for its task's rewards together. A task's key alone with one reward in its detail is
 * that reward's version (R10: a report of before, of a task of one reward); with none or two
 * or more it is open ("one of", a typed task without its reward). The post of the stops groups by it
 * too (review R2).
 */
export function versionOf(report: ResearchAt): ResearchSubjectKey | undefined {
  const subject = researchSubjectOf(report.subjectKey);
  if (!subject) return undefined;
  if (subject.hash !== undefined) return subject;
  const [only, ...more] = report.hashes;
  return { task: subject.task, hash: only !== undefined && more.length === 0 ? only : undefined };
}

/**
 * The decision on a research `report` at a stop where `standing` is the stop's report of the
 * report's own period (R15: no other period's), made by `by` at `now`; `replacing` the ids of
 * the reports the member said to replace (R7: the stops they ticked).
 */
export function decideResearch(
  standing: StandingResearch | undefined,
  report: ResearchAt,
  now: number,
  by: string,
  replacing: readonly number[] = [],
): ResearchDecision {
  if (!standing || standing.endsAt <= now) return 'new';
  if (standing.subjectKey === report.subjectKey) return 'again';
  const there = versionOf(standing);
  const here = versionOf(report);
  if (there && here && there.task === here.task) {
    if (there.hash === undefined && here.hash !== undefined) {
      if (standing.hashes.length === 0 || standing.hashes.includes(here.hash)) return 'narrow';
    } else if (there.hash !== undefined && here.hash === undefined) {
      if (report.hashes.length === 0 || report.hashes.includes(there.hash)) return 'less';
    } else if (there.hash === here.hash) {
      return 'again';
    }
  }
  return standing.reporterId === by || replacing.includes(standing.id) ? 'correct' : 'asks';
}
