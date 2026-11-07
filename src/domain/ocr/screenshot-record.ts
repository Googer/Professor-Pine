import type { RaidBossRef } from '../party/party.js';
import type { MaxTier } from '../pogo/max-tier.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import type { MaxTyped } from './max-decision.js';
import type { MaxScreenshotReport } from './max-report.js';
import type { ScreenshotReport } from './screenshot-report.js';

/**
 * What is kept of a screenshot beside its file (`ScreenshotStore`): what was read, what Pine
 * made of it, what it decided and what members said of it. Plain data, written as JSON and read
 * back after a restart, by the feedback button and by `npm run ocr:review` and `ocr:check`.
 * Records are for staff and development only (Matt, 2026-10-14): they hold the snowflakes of
 * the member who sent the screenshot and of those who said something, which never go into a
 * commit or a printout (`ocr:review` shows them only with `--show-text`).
 */

/** The report as it is kept: the boss by its name and tier, not the catalogue entry. */
export type StoredReport = Omit<ScreenshotReport, 'boss'> & {
  boss: { key: string; name: string; tier: RaidTier } | null;
};

export function storedReport(report: ScreenshotReport): StoredReport {
  const { boss } = report;
  return {
    ...report,
    boss: boss ? { key: boss.key, name: boss.name, tier: boss.tier } : null,
  };
}

/**
 * The max report as it is kept (plan 8X-S, review R5): plain data already (the boss by its
 * reference and name, the spot by its Wayfarer id and title), kept as it is.
 */
export type StoredMaxReport = MaxScreenshotReport;

/** A max boss of the list as a record keeps it (`ScreenshotRecord.maxBosses`). */
export interface StoredMaxBoss {
  key: string;
  name: string;
  tier: MaxTier;
}

/** How a screenshot came to be read. */
export const SCREENSHOT_USES = ['read-screenshot', 'raid', 'max', 'mention', 'passive'] as const;
export type ScreenshotUse = (typeof SCREENSHOT_USES)[number];

/** What was decided (`decide`): the kinds of `ScreenshotDecision`, with the doubts or reason. */
export type StoredDecision =
  { kind: 'report' } | { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string };

/** The elements a member may say were wrong (`spot`: a max battle's Power Spot, plan 8X-S). */
export const FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss', 'spot'] as const;
export type FeedbackElement = (typeof FEEDBACK_ELEMENTS)[number];

/** Those of a raid's screen. */
export const RAID_FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss'] as const;

/** Those of a max battle's screen (plan 8X-S): no gym, no egg. */
export const MAX_FEEDBACK_ELEMENTS = ['spot', 'time', 'tier', 'boss'] as const;
export type MaxFeedbackElement = (typeof MAX_FEEDBACK_ELEMENTS)[number];

/** A member's correction is at most this long. */
export const MAX_CORRECTION = 500;

export type Feedback =
  { verdict: 'right' } | { verdict: 'wrong'; elements: FeedbackElement[]; correction: string };

/** One member's feedback on a screenshot: the newest replaces their earlier one. */
export type FeedbackRecord = Feedback & {
  /** The member's snowflake. */
  memberId: string;
  /** The member who sent the screenshot, or somebody else who saw it. */
  by: 'reporter' | 'other';
  at: number;
};

/**
 * The answer key of a sample in the shape `npm run ocr:check` scores (the research's
 * `labels.json`): the clock `h:mm`, the countdown `h:mm:ss`, the gym's name as shown, egg or
 * not, the tier as the number of heads (4 or `mega` for a mega), shadow, the boss's name, the CP.
 */
export interface SampleLabel {
  clock: string | null;
  countdown: string | null;
  gym: string | null;
  egg: boolean;
  tier: number | 'mega';
  shadow: boolean;
  boss: string | null;
  cp: number | null;
}

/**
 * What the member typed beside the screenshot (`/raid`), kept apart from what the reader made of
 * it: the reader is judged by its own report, never by what a member typed.
 */
export interface StoredTyped {
  gymId?: number;
  /** A boss by its key (null for an egg, or a hatched raid whose boss was not given). */
  boss?: { tier: RaidTier; key: string | null; hatched: boolean };
  time?: { hatch: number } | { end: number };
}

/**
 * What the member typed beside a max battle's screenshot (`/max screenshot:`, review S-5), kept
 * apart from the max report as `StoredTyped` is from the raid's: the Power Spot by its Wayfarer
 * id and title (a pin as the id `pin`), the boss with its tier, a tier alone, the end.
 */
export interface StoredMaxTyped {
  spot?: { id: string; title: string };
  boss?: { ref: RaidBossRef; name: string; tier: MaxTier };
  tier?: MaxTier;
  end?: number;
}

export function storedMaxTyped(typed: MaxTyped): StoredMaxTyped {
  return {
    ...(typed.spot ? { spot: { id: typed.spot.id, title: typed.spot.title } } : {}),
    ...(typed.boss
      ? { boss: { ref: typed.boss.ref, name: typed.boss.name, tier: typed.boss.tier } }
      : {}),
    ...(typed.tier === undefined ? {} : { tier: typed.tier }),
    ...(typed.end === undefined ? {} : { end: typed.end }),
  };
}

/**
 * The answer key of a sample members said was read right, for `ocr:check`: what the reader made
 * of it is the answer, for the elements it read itself (an element the member typed is left
 * out). Only these are scored: the gym by the decided gym's name, egg or hatched, the heads,
 * shadow, the boss.
 */
export interface MemberLabel {
  source: 'member';
  /** The gym's own name (what the game shows). */
  gym?: string;
  egg?: boolean;
  tier?: number | 'mega';
  shadow?: boolean;
  boss?: string | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function clockText(clock: { hour: number; minute: number } | null): string | null {
  return clock ? `${clock.hour}:${pad(clock.minute)}` : null;
}

export function countdownText(seconds: number | null): string | null {
  if (seconds === null) return null;
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/**
 * The answer key of a reading a member said was right: what the reader made of it, without what
 * the member typed (`typed`). The gym is the one the member picked when asked, or else the gym
 * read when it was clear; none otherwise. `gymName` gives a gym's own name, as the game shows it
 * (never a nickname). Undefined when nothing is left.
 */
export function memberLabel(
  report: StoredReport,
  typed: StoredTyped | null,
  gymName: (gymId: number) => string | undefined,
  pickedGymId: number | null = null,
): MemberLabel | undefined {
  const label: MemberLabel = { source: 'member' };
  const gymId = pickedGymId ?? (report.gym.clear ? report.gym.gymId : null);
  const gym = gymId === null ? undefined : gymName(gymId);
  if (typed?.gymId === undefined && gym !== undefined) label.gym = gym;
  if (!typed?.boss && report.stage !== null) {
    label.egg = report.stage === 'egg';
    if (report.heads !== null) label.tier = report.heads;
    if (report.tier) label.shadow = report.tier.shadow;
    if (report.stage === 'hatched') label.boss = report.boss?.name ?? null;
  }
  return Object.keys(label).length > 1 ? label : undefined;
}

/**
 * The member's answer key of a record (`label`) that `ocr:check` scores against one unit of a
 * picture (`pane`: the index of the pane read, null for the whole reading). A record of a pane
 * (plan 7P) is the answer of that pane only, and of nothing when the picture was not cut into it
 * (review S2); any other record's is the whole picture's: of the whole reading, or, when the
 * picture is cut now (a record kept before 7P, or one read late), of its first pane that shows a
 * screen (`firstScreen`; review F1), as a `labels.json` label without `#n`.
 */
export function memberLabelOfUnit(
  record: { label?: MemberLabel; pane?: { index: number } } | undefined,
  unit: { pane: number | null; firstScreen?: boolean },
): MemberLabel | undefined {
  if (!record?.label) return undefined;
  if (record.pane) return unit.pane === record.pane.index ? record.label : undefined;
  return unit.pane === null || unit.firstScreen === true ? record.label : undefined;
}
