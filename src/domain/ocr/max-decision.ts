import type { RaidBossRef } from '../party/party.js';
import type { MaxTier } from '../pogo/max-tier.js';
import type { MaxDoubt, MaxScreenshotReport } from './max-report.js';
import type { SpotTitle } from './power-spot-match.js';
import { decidedLate } from './screenshot-decision.js';

/**
 * What Pine does with a max battle's screenshot (design `2026-10-22-max-battle-screenshots-design.md`,
 * sections 3 to 6; beside the raid's `decide`). Refused: a screen that is no max battle's
 * (`not-a-max-screen`), one taken at or after the day's last battle, or whose end capped at it has
 * passed by the upload (`over-for-today`: `/max`'s words; Matt's M2), a countdown that is over
 * (`battle-over`), one that ends at or before the first battle (`before-first`: yesterday's
 * battle seen in the small hours), a Power Spot Pine does not know (`no-spot`, with the name and whether it
 * was read surely, for the moderators' note), a boss it cannot tell (`no-boss`) and a screen
 * without a countdown decided long after its upload (`untimed-old`, plan 7M). Asked: which
 * Power Spot, when several may be it; the tier, when only the tier is missing (as `/max` asks).
 * Otherwise reported. No ending-soon question for a screenshot (design 5).
 */
export type MaxDecision =
  | {
      kind: 'refuse';
      /**
       * `untimed-old`: no countdown read (nor an end typed), decided more than
       * `UNTIMED_SCREENSHOT_MAX_AGE_MS` after its upload (plan 7M, review F4).
       */
      reason:
        | 'not-a-max-screen'
        | 'over-for-today'
        | 'battle-over'
        | 'before-first'
        | 'no-boss'
        | 'untimed-old';
    }
  | { kind: 'refuse'; reason: 'no-spot'; read: string | null; readSurely: boolean }
  | { kind: 'ask'; about: 'spot'; spots: SpotTitle[]; doubts: MaxDoubt[] }
  | { kind: 'ask'; about: 'tier'; doubts: MaxDoubt[] }
  | { kind: 'report'; battle: ScreenshotMax; doubts: MaxDoubt[] };

/** The max battle a screenshot is reported as. */
export interface ScreenshotMax {
  /** The Power Spot's Wayfarer id. */
  spotId: string;
  boss: RaidBossRef;
  tier: MaxTier;
  end: number;
  /** When the screenshot was taken (`MaxScreenshotReport.takenAt`). */
  takenAt: number;
  /** The moment is known: a file's name or a clock read surely (`MaxScreenshotReport.sureMoment`). */
  sureMoment: boolean;
  /** The countdown ends at a rotation, not the all-day kind (`MaxScreenshotReport.rotationEnd`). */
  rotationEnd: boolean;
  /**
   * The end is the last battle time of the day (the countdown capped at it, or `/max`'s default
   * end): once it has passed, max battles are over for today (Matt's M2), which the check just
   * before reporting says (review R11, `reportMaxShotAs`).
   */
  capped: boolean;
  /**
   * The moment is no sure one (`!sureMoment`: guessed, or its sources disagree): said in the post
   * until `/end`. A dated file name or a clock read surely is exact however old (review A5). An
   * end typed beside the screenshot (`withMaxTyped`) is never uncertain (review F-5).
   */
  timeUncertain: boolean;
}

export interface MaxDecideContext {
  /**
   * When the screenshot was posted, or when it is read where that is later (plan 7M): what is
   * over by then is over.
   */
  now: number;
  /**
   * When the screenshot reached Discord: every caller but "Read screenshot" (plan 7M) decides
   * at it. A screen without a countdown is refused when `now` is more than
   * `UNTIMED_SCREENSHOT_MAX_AGE_MS` after it (`/max`'s default end would be counted from now).
   */
  uploadedAt: number;
}

export function decideMax(report: MaxScreenshotReport, context: MaxDecideContext): MaxDecision {
  const { now } = context;
  const { doubts } = report;
  if (report.form === null) return { kind: 'refuse', reason: 'not-a-max-screen' };
  if (report.takenAt >= report.lastBattle || report.end === null) {
    return { kind: 'refuse', reason: 'over-for-today' };
  }
  if (report.countdownEnd !== null) {
    if (report.countdownEnd <= now) return { kind: 'refuse', reason: 'battle-over' };
    // Its countdown runs on, but the day's battles ended at the cap before it was posted (M2).
    if (report.end <= now) return { kind: 'refuse', reason: 'over-for-today' };
    // A battle that ends at the first battle time ended with yesterday's (review A6).
    if (report.countdownEnd <= report.firstBattle)
      return { kind: 'refuse', reason: 'before-first' };
  } else if (report.end <= now) {
    return {
      kind: 'refuse',
      reason: report.end === report.lastBattle ? 'over-for-today' : 'battle-over',
    };
  } else if (report.endFrom !== 'typed' && decidedLate(context)) {
    // No countdown, read long after its upload (review F4): the default end says nothing of it.
    return { kind: 'refuse', reason: 'untimed-old' };
  }
  const { match } = report.spot;
  if (match.kind === 'unknown') {
    return {
      kind: 'refuse',
      reason: 'no-spot',
      read: report.spot.read,
      readSurely: report.spot.readSurely,
    };
  }
  if (report.boss === null) return { kind: 'refuse', reason: 'no-boss' };
  if (match.kind === 'candidates')
    return { kind: 'ask', about: 'spot', spots: match.spots, doubts };
  if (report.tier === null) return { kind: 'ask', about: 'tier', doubts };
  return {
    kind: 'report',
    battle: {
      spotId: match.spot.id,
      boss: report.boss.ref,
      tier: report.tier,
      end: report.end,
      takenAt: report.takenAt,
      sureMoment: report.sureMoment,
      rotationEnd: report.rotationEnd,
      capped: report.end === report.lastBattle,
      // An end the member typed is their own word, no guess (review F-5).
      timeUncertain: !report.sureMoment && report.endFrom !== 'typed',
    },
    doubts,
  };
}

/**
 * The name of a Power Spot Pine does not know that is worth the moderators' note
 * (`ModerationReports.missingSpot`): read surely, on a screen with a countdown, as a battle's
 * screen has one and an event's picture of a boss has not (review S-1, Matt 2026-10-23); null
 * otherwise.
 */
export function missingSpotName(
  decision: Extract<MaxDecision, { reason: 'no-spot' }>,
  report: Pick<MaxScreenshotReport, 'countdown'>,
): string | null {
  return decision.read !== null && decision.readSurely && report.countdown !== null
    ? decision.read
    : null;
}

/**
 * The report with the Power Spot a member chose (the menu of `ask` `spot`, or `/max spot:`): the
 * spot is clear, and the doubts about it go; decide again with `decideMax`.
 */
export function withSpot(report: MaxScreenshotReport, spot: SpotTitle): MaxScreenshotReport {
  return {
    ...report,
    spot: { ...report.spot, match: { kind: 'clear', spot } },
    doubts: report.doubts.filter((doubt) => doubt !== 'no-spot' && doubt !== 'spot-unclear'),
  };
}

/**
 * The refusal kept in the record of a `/max screenshot:` whose typed boss cannot battle as the
 * screen shows (a Pokémon that cannot Gigantamax beside a Gigantamax screen; review F-3).
 */
export const TYPED_BOSS_REFUSED = 'typed-boss';

/**
 * What a member typed beside a max battle's screenshot (`/max screenshot:`, plan 8X-S), which
 * stands in the place of what was read, as a raid's `withTyped`: the Power Spot (`spot`; a pin
 * typed stands as a title of its own), the boss with its tier (`name` as the member's answer
 * shows it), the tier alone for a boss read that is on no list, the end.
 */
export interface MaxTyped {
  spot?: SpotTitle;
  boss?: { ref: RaidBossRef; name: string; tier: MaxTier };
  /**
   * `tier:` typed without a boss (review r4 B1): the tier of the boss read when that is on no
   * list and the tier is of the screen's kind; a listed boss keeps the list's, as `/max` does.
   */
  tier?: MaxTier;
  end?: number;
}

/** The doubts a typed boss settles. */
const BOSS_DOUBTS: readonly MaxDoubt[] = [
  'no-boss',
  'boss-unlisted',
  'tier-unknown',
  'heads-boss-conflict',
  'heads-form-conflict',
];

/** The doubts a typed end settles: no countdown, and every doubt of the screenshot's moment. */
const TIME_DOUBTS: readonly MaxDoubt[] = [
  'no-time',
  'time-guessed',
  'time-stale',
  'time-sources-differ',
];

/**
 * The report with what the member typed in the place of what was read (decide again with
 * `decideMax`): the spot as `withSpot` puts it in; the boss and its tier as a listed boss's; a
 * tier alone as the tier of an unlisted boss read (`tier-unknown` settled); an
 * end typed instead of the countdown, which is then no clean read of a rotation's end
 * (`rotationEnd` false: a battle there keeps its end).
 */
export function withMaxTyped(report: MaxScreenshotReport, typed: MaxTyped): MaxScreenshotReport {
  let out = typed.spot ? withSpot(report, typed.spot) : report;
  const { tier } = typed;
  if (
    !typed.boss &&
    tier !== undefined &&
    out.boss !== null &&
    !out.boss.listed &&
    (tier === 'G') === (out.form === 'gigantamax' || out.form === 'eternamax')
  ) {
    out = {
      ...out,
      tier,
      // What the member typed counts as the list does for a typed boss.
      tierFrom: 'list',
      doubts: out.doubts.filter((doubt) => doubt !== 'tier-unknown'),
    };
  }
  if (typed.boss) {
    out = {
      ...out,
      boss: { ref: typed.boss.ref, name: typed.boss.name, listed: true },
      tier: typed.boss.tier,
      tierFrom: 'list',
      doubts: out.doubts.filter((doubt) => !BOSS_DOUBTS.includes(doubt)),
    };
  }
  if (typed.end !== undefined) {
    out = {
      ...out,
      end: typed.end,
      endFrom: 'typed',
      countdownEnd: null,
      rotationEnd: false,
      // The end is the member's: neither the countdown nor the screenshot's moment is doubted.
      doubts: out.doubts.filter((doubt) => !TIME_DOUBTS.includes(doubt)),
    };
  }
  return out;
}
