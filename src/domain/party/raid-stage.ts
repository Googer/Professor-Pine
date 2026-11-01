/**
 * Egg, hatched or ended, by the clock (no import: the map's page takes it too, plan 8M-7, to keep
 * a raid's marker current between two lists). `raidStage` of `raid.ts` reads a raid through it.
 */

/** A raid's stage, as `RaidStage` of `party.ts` spells it. */
export type RaidStageAt = 'egg' | 'hatched' | 'ended';

/** The times a raid's stage is read from. */
export interface StageTimes {
  hatchTime: number | null;
  endTime: number | null;
  /** The last moment a raid without an end could still be going on. */
  lastPossibleTime?: number | null;
  /** Reported hatched (a boss named), for a raid without a hatch time. */
  reportedHatched: boolean;
}

/**
 * A raid without times is what it was reported as (an egg, or hatched when the report named a
 * boss) until the last moment it could be going on has passed.
 */
export function stageAt(times: StageTimes, now: number): RaidStageAt {
  const { hatchTime, endTime, lastPossibleTime } = times;
  if (now >= (endTime ?? lastPossibleTime ?? Infinity)) return 'ended';
  if (hatchTime === null) return times.reportedHatched ? 'hatched' : 'egg';
  return now < hatchTime ? 'egg' : 'hatched';
}
