import { nameKey } from '../gyms/shared-names.js';
import type {
  FeedbackElement,
  FeedbackRecord,
  MaxFeedbackElement,
  StoredDecision,
  StoredMaxReport,
  StoredMaxTyped,
  StoredReport,
  StoredTyped,
} from './screenshot-record.js';

/**
 * The triage of a review folder (`npm run ocr:review`): what members said was wrong, per element
 * and by the stage where it went wrong, told apart by what was read and what Pine made of it.
 * Pure: the script reads the records and prints this.
 */

/** What the triage needs of a kept record (`ScreenshotRecord`). */
export interface ReviewRecord {
  id: string;
  use: string;
  decision: StoredDecision;
  /** What the reader made of it by itself. */
  report: StoredReport;
  /** What the member typed beside it: those elements are not the reader's to answer for. */
  typed?: StoredTyped | null;
  /** What the reader made of a max battle's screen (plan 8X-S): such a record is counted apart. */
  max?: StoredMaxReport;
  /** What the member typed beside `/max screenshot:`: not the reader's to answer for (F-4). */
  maxTyped?: StoredMaxTyped;
  feedback: readonly FeedbackRecord[];
}

/** Where an element went wrong, as far as the record tells. */
export type WrongAt = string;

/** The max battles' screenshots of a review folder, counted apart (plan 8X-S, review R5). */
export interface MaxReviewSummary {
  records: number;
  byUse: Record<string, number>;
  /** By the decision kept, made with what was typed (as a raid's, review F-4). */
  byDecision: Record<string, number>;
  right: number;
  wrong: number;
  /**
   * Per element of a max battle's screen: how often it was said wrong, by where; an element the
   * member typed beside `/max screenshot:` is left out (review F-4).
   */
  elements: Record<MaxFeedbackElement, Record<WrongAt, number>>;
  /** How often each doubt of the max report was raised. */
  doubts: Record<string, number>;
}

export interface ReviewSummary {
  /** The raids' screenshots (and pictures that are no screen); the max battles' are in `max`. */
  records: number;
  byUse: Record<string, number>;
  byDecision: Record<string, number>;
  /** Records with "All right" and none with "Something is wrong". */
  right: number;
  /** Records somebody said were wrong. */
  wrong: number;
  /** Per element: how often it was said wrong, by where it went wrong. */
  elements: Record<FeedbackElement, Record<WrongAt, number>>;
  /** How often each doubt was raised, over all records. */
  doubts: Record<string, number>;
  /**
   * Gym texts read that members corrected the same way at least twice: suggested nicknames.
   * `correction` is the member's text: shown only when asked for.
   */
  nicknames: { read: string; correction: string; times: number }[];
  /** Every correction with who wrote it, of either kind of screen: shown only when asked for. */
  corrections: { id: string; memberId: string; elements: FeedbackElement[]; correction: string }[];
  max: MaxReviewSummary;
}

/** The elements a member typed, which the reader does not answer for. */
function typedElements(typed: StoredTyped | null | undefined): Set<FeedbackElement> {
  const elements = new Set<FeedbackElement>();
  if (typed?.gymId !== undefined) elements.add('gym');
  if (typed?.boss) {
    elements.add('stage');
    elements.add('tier');
    elements.add('boss');
  }
  if (typed?.time) elements.add('time');
  return elements;
}

/**
 * The elements of a max battle's screen a member typed beside `/max screenshot:` (review F-4): a
 * typed boss brings its tier, a typed end stands for the time.
 */
function maxTypedElements(typed: StoredMaxTyped | undefined): Set<FeedbackElement> {
  const elements = new Set<FeedbackElement>();
  if (typed?.spot) elements.add('spot');
  if (typed?.boss) {
    elements.add('boss');
    elements.add('tier');
  }
  if (typed?.tier !== undefined) elements.add('tier');
  if (typed?.end !== undefined) elements.add('time');
  return elements;
}

function add(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/** Where an element said to be wrong went wrong, by what the record shows. */
export function wrongAt(element: FeedbackElement, report: StoredReport): WrongAt {
  switch (element) {
    case 'gym':
      if (report.gym.read === null) return 'no text read';
      if (report.gym.gymId === null) return 'text read, no gym found';
      return report.gym.clear
        ? 'text read, the search chose another gym (a nickname may fix it)'
        : 'text read, the gym was not clear';
    case 'time':
      if (report.countdown === null) return 'no countdown';
      if (report.clock === null) return 'no clock (guessed from the upload)';
      // A clock that did not fit the upload (a screenshot taken long before) is guessed too.
      if (report.doubts.includes('time-guessed'))
        return 'clock read but did not fit the upload (guessed from the upload)';
      return 'clock and countdown read';
    case 'stage':
      return report.stage === null ? 'not told' : `read as ${report.stage}`;
    case 'tier':
      return report.heads === null ? 'no heads' : `${report.heads} heads`;
    case 'boss':
      if (report.cp === null) return 'no CP';
      return report.boss === null ? 'CP read, no boss decided' : 'CP read, a boss decided';
    case 'spot':
      return 'not on a raid’s screen';
  }
}

const FORMS = { dynamax: 'Dynamax', gigantamax: 'Gigantamax', eternamax: 'Eternamax' };

/** Where an element of a max battle's screen said to be wrong went wrong (plan 8X-S). */
export function maxWrongAt(element: FeedbackElement, report: StoredMaxReport): WrongAt {
  switch (element) {
    case 'spot': {
      if (report.spot.read === null) return 'no text read';
      const { match } = report.spot;
      if (match.kind === 'unknown') return 'text read, no Power Spot found';
      return match.kind === 'candidates'
        ? 'text read, the Power Spot was not clear'
        : 'text read, the match chose another Power Spot';
    }
    case 'time':
      if (report.countdown === null) return 'no countdown (the end /max gives)';
      if (report.clock === null) return 'no clock (guessed from the upload)';
      if (report.doubts.includes('time-guessed'))
        return 'clock read but did not fit the upload (guessed from the upload)';
      return 'clock and countdown read';
    case 'tier': {
      const form = report.form === null ? 'no form' : FORMS[report.form];
      return `${report.heads === null ? 'no heads' : `${report.heads} heads`}, ${form}`;
    }
    case 'boss':
      if (report.speciesRead === null) return 'no name read';
      if (report.boss === null) return 'name read, no boss found';
      return report.boss.listed ? 'name read, a listed boss' : 'name read, a boss on no list';
    case 'gym':
    case 'stage':
      return 'not on a max battle’s screen';
  }
}

/** Corrections members wrote on these records, with who wrote them. */
function correctionsOf(record: ReviewRecord): ReviewSummary['corrections'] {
  return record.feedback.flatMap((f) =>
    f.verdict === 'wrong' && f.correction.trim() !== ''
      ? [
          {
            id: record.id,
            memberId: f.memberId,
            elements: f.elements,
            correction: f.correction.trim(),
          },
        ]
      : [],
  );
}

/** The count of the max battles' screenshots of a review folder (`reviewSummary`'s `max`). */
function maxSummary(records: readonly ReviewRecord[]): MaxReviewSummary {
  const summary: MaxReviewSummary = {
    records: 0,
    byUse: {},
    byDecision: {},
    right: 0,
    wrong: 0,
    elements: { spot: {}, time: {}, tier: {}, boss: {} },
    doubts: {},
  };
  for (const record of records) {
    const { max } = record;
    if (!max) continue;
    summary.records++;
    add(summary.byUse, record.use);
    add(summary.byDecision, record.decision.kind);
    for (const doubt of max.doubts) add(summary.doubts, doubt);
    const wrongs = record.feedback.filter((f) => f.verdict === 'wrong');
    if (wrongs.length === 0) {
      if (record.feedback.length > 0) summary.right++;
      continue;
    }
    summary.wrong++;
    const typed = maxTypedElements(record.maxTyped);
    const elements = new Set(
      wrongs
        .flatMap((f) => (f.verdict === 'wrong' ? f.elements : []))
        .filter((element) => !typed.has(element)),
    );
    for (const element of elements) {
      if (element in summary.elements) {
        add(summary.elements[element as MaxFeedbackElement], maxWrongAt(element, max));
      }
    }
  }
  return summary;
}

export function reviewSummary(all: readonly ReviewRecord[]): ReviewSummary {
  // A max battle's screenshot is counted apart, by its own report (plan 8X-S).
  const records = all.filter((record) => !record.max);
  const summary: ReviewSummary = {
    records: records.length,
    byUse: {},
    byDecision: {},
    right: 0,
    wrong: 0,
    elements: { gym: {}, time: {}, stage: {}, tier: {}, boss: {}, spot: {} },
    doubts: {},
    nicknames: [],
    corrections: [],
    max: maxSummary(all),
  };
  const corrected = new Map<string, { read: string; correction: string; times: number }>();
  for (const record of records) {
    add(summary.byUse, record.use);
    add(summary.byDecision, record.decision.kind);
    for (const doubt of record.report.doubts) add(summary.doubts, doubt);
    const wrongs = record.feedback.filter((f) => f.verdict === 'wrong');
    if (wrongs.length === 0) {
      if (record.feedback.length > 0) summary.right++;
      continue;
    }
    summary.wrong++;
    const typed = typedElements(record.typed);
    const elements = new Set(
      wrongs
        .flatMap((f) => (f.verdict === 'wrong' ? f.elements : []))
        .filter((element) => !typed.has(element)),
    );
    for (const element of elements) add(summary.elements[element], wrongAt(element, record.report));
    for (const f of wrongs) {
      if (f.verdict === 'wrong' && f.correction.trim() !== '') {
        summary.corrections.push({
          id: record.id,
          memberId: f.memberId,
          elements: f.elements,
          correction: f.correction.trim(),
        });
      }
    }
    const read = record.report.gym.read;
    if (read === null || !elements.has('gym')) continue;
    for (const f of wrongs) {
      if (f.verdict !== 'wrong' || f.correction.trim() === '') continue;
      const key = `${nameKey(read)}\n${nameKey(f.correction)}`;
      const seen = corrected.get(key) ?? { read, correction: f.correction.trim(), times: 0 };
      seen.times++;
      corrected.set(key, seen);
    }
  }
  for (const record of all) if (record.max) summary.corrections.push(...correctionsOf(record));
  summary.nicknames = [...corrected.values()]
    .filter((pair) => pair.times >= 2)
    .sort((a, b) => b.times - a.times);
  return summary;
}
