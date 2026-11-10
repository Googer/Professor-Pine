import type { RaidBoss } from '../pogo/raid-bosses.js';
import { eggNeedsHatchTime, type RaidTier } from '../pogo/raid-tier.js';
import type { ReportBoss, ReportDoubt, ScreenshotReport } from './screenshot-report.js';

/**
 * What Pine does with a screenshot it read (the rule of doubts, Matt 2026-10-14: the legacy bot
 * made a raid even when nothing about the egg or boss could be told, and the reader is good at
 * the rest). It refuses only a screen that is no raid's or a gym it does not know; it asks only
 * which gym, when the gym read is not clear (a wrong gym is the one mistake members cannot
 * easily mend); otherwise it reports the raid unasked with what is known, and the doubts that
 * remain are what the "Screenshot feedback" button shows.
 */
export type ScreenshotDecision =
  /**
   * `raid-over`: by its countdown the raid has already ended. `elite-egg-time`: an Elite egg
   * whose hatch time is not known (plan 8F-1, 8E-1): it would stand its whole incubation and
   * block every other report at its gym, so it is reported only with `/raid` and its time.
   */
  | { kind: 'refuse'; reason: 'not-a-raid-screen' | 'no-gym' | 'raid-over' | 'elite-egg-time' }
  /** The gym is not clear (or the tier, which a raid screen always has): the member chooses. */
  | { kind: 'ask'; doubts: ReportDoubt[] }
  | { kind: 'report'; raid: ScreenshotRaid; doubts: ReportDoubt[] };

/** The raid a screenshot is reported as. */
export interface ScreenshotRaid {
  gymId: number;
  tier: RaidTier;
  /**
   * Null for an egg, and for a hatched raid whose boss was not decided; a Pokémon the list does
   * not have is reported as `/raid` reports it with its tier typed.
   */
  boss: ReportBoss | null;
  /** Seen hatched: with a boss, or without one when it was not decided. */
  hatched: boolean;
  /**
   * When the egg hatches or the raid ends; undefined when the stage could not be told (reported
   * as an egg without a time), or the time cannot be (already past, longer than a raid lasts).
   */
  time: { hatch: number } | { end: number } | undefined;
  /**
   * The time was guessed from the upload, the screenshot is older than it should be, or its
   * file's name and its clock disagree.
   */
  timeUncertain: boolean;
}

/** What deciding needs besides the report. */
export interface DecideContext {
  /**
   * When the screenshot was posted, or when it is read where that is later (plan 7M): what is
   * over by then is over.
   */
  now: number;
  /**
   * Minutes a raid of this tier lasts once hatched at this time (`raidDurationsAt` with the
   * settings and the raid events: an elite raid, a Raid Hour).
   */
  hatchedMinutes: (tier: RaidTier, hatchTime: number) => number;
  /** What an egg of a tier hatches as, when that is certain (`ctx.raidBosses.autoset`). */
  autoset: (tier: RaidTier) => RaidBoss | undefined;
}

/** What a member typed beside a screenshot (`/raid`): it stands in the place of what was read. */
export interface TypedValues {
  gymId?: number;
  /** A boss or an egg of a tier: `hatched` for a boss. */
  boss?: { tier: RaidTier; boss: RaidBoss | null; hatched: boolean };
  time?: { hatch: number } | { end: number };
}

const GYM_DOUBTS: readonly ReportDoubt[] = ['no-gym', 'gym-unclear'];
const BOSS_DOUBTS: readonly ReportDoubt[] = [
  'stage-unknown',
  'tier-unknown',
  'tier-from-name',
  'heads-unverified',
  'heads-only',
  'heads-uncertain',
  'heads-boss-conflict',
  'boss-unknown',
  'boss-from-name',
  'boss-unlisted',
  'boss-name-differs',
  'elite',
  'shadow-unlisted',
  'shadow-differs',
];
const TIME_DOUBTS: readonly ReportDoubt[] = [
  'no-time',
  'time-guessed',
  'time-stale',
  'time-sources-differ',
  'time-past',
  'countdown-long',
];

/**
 * The report with what the member typed in the place of what was read: each typed element is
 * taken as it is, and the doubts about it go. A screen that is no raid's stays one.
 */
export function withTyped(report: ScreenshotReport, typed: TypedValues): ScreenshotReport {
  let changed = report;
  const without = (doubts: readonly ReportDoubt[]) =>
    changed.doubts.filter((doubt) => !doubts.includes(doubt));
  if (typed.gymId !== undefined) {
    changed = {
      ...changed,
      gym: { ...changed.gym, gymId: typed.gymId, place: 'local', clear: true },
      doubts: without(GYM_DOUBTS),
    };
  }
  if (typed.boss) {
    changed = {
      ...changed,
      stage: typed.boss.hatched ? 'hatched' : 'egg',
      tier: typed.boss.tier,
      boss: typed.boss.boss,
      doubts: without(BOSS_DOUBTS),
    };
  }
  if (typed.time) {
    // A typed time says the stage the screenshot did not: a hatch is an egg's, an end a raid's.
    const stage = changed.stage ?? ('hatch' in typed.time ? 'egg' : 'hatched');
    changed = {
      ...changed,
      stage,
      time: typed.time,
      doubts: without([...TIME_DOUBTS, 'stage-unknown']),
    };
  }
  return changed;
}

const UNCERTAIN: readonly ReportDoubt[] = ['time-guessed', 'time-stale', 'time-sources-differ'];

/**
 * What to do with a report (see `ScreenshotDecision`). A time that has passed (Matt,
 * 2026-10-14): a hatched raid's end means the raid is over (refused); an egg whose hatch has
 * passed is reported hatched, ending its tier's length after its hatch (certain when the moment
 * of the screenshot was known: then the countdown gave the hatch exactly), with the boss it was
 * read with or the one a hatch would give it, and refused when that end has passed too (one
 * whose tier was not read is asked about like any raid without a tier). A countdown longer
 * than a raid lasts is left out. An Elite egg without its hatch time is refused (8E-1).
 */
export function decide(report: ScreenshotReport, context: DecideContext): ScreenshotDecision {
  const { doubts } = report;
  if (doubts.includes('not-a-raid-screen')) return { kind: 'refuse', reason: 'not-a-raid-screen' };
  if (report.gym.gymId === null) return { kind: 'refuse', reason: 'no-gym' };
  const past = doubts.includes('time-past') && report.time !== null;
  if (past && report.time && 'end' in report.time) return { kind: 'refuse', reason: 'raid-over' };
  let hatched = report.stage === 'hatched';
  let boss = hatched ? report.boss : null;
  let time = report.stage === null ? undefined : (report.time ?? undefined);
  if (doubts.includes('countdown-long')) time = undefined;
  // Without a tier its length is unknown, so whether it is over too: asked below.
  if (past && report.tier && report.time && 'hatch' in report.time) {
    const { hatch } = report.time;
    const end = hatch + context.hatchedMinutes(report.tier, hatch) * 60_000;
    if (end <= context.now) return { kind: 'refuse', reason: 'raid-over' };
    hatched = true;
    boss = report.boss ?? context.autoset(report.tier) ?? null;
    time = { end };
  }
  // Refused before the gym is asked: no gym picked could make it a raid.
  if (report.tier && eggNeedsHatchTime(report.tier) && !hatched && time === undefined) {
    return { kind: 'refuse', reason: 'elite-egg-time' };
  }
  if (!report.gym.clear || report.tier === null) return { kind: 'ask', doubts };
  // The countdown of an egg past its hatch gives the hatch exactly only when the moment of the
  // screenshot is known (by its file or its clock), however long ago that was.
  const unknownMoment = doubts.includes('time-guessed') || doubts.includes('time-sources-differ');
  const uncertain =
    time !== undefined &&
    (past ? unknownMoment : doubts.some((doubt) => UNCERTAIN.includes(doubt)));
  return {
    kind: 'report',
    raid: {
      gymId: report.gym.gymId,
      tier: report.tier,
      boss,
      hatched,
      time,
      timeUncertain: uncertain,
    },
    doubts,
  };
}
