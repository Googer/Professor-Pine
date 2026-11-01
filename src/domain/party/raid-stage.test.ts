import { describe, expect, it } from 'vitest';
import { testRaid } from '../../../test/support/parties.js';
import { raidStage } from './raid.js';
import { stageAt } from './raid-stage.js';

const MINUTE = 60_000;

describe('stageAt (plan 8M-7)', () => {
  it('is egg, hatched or ended by the clock, and raidStage is it', () => {
    const times = { hatchTime: 100 * MINUTE, endTime: 145 * MINUTE, reportedHatched: false };
    expect(stageAt(times, 99 * MINUTE)).toBe('egg');
    expect(stageAt(times, 100 * MINUTE)).toBe('hatched');
    expect(stageAt(times, 145 * MINUTE)).toBe('ended');
    // Without times: as it was reported, until the last moment it could be on.
    const untimed = { hatchTime: null, endTime: null, lastPossibleTime: 50, reportedHatched: true };
    expect(stageAt(untimed, 49)).toBe('hatched');
    expect(stageAt({ ...untimed, reportedHatched: false }, 49)).toBe('egg');
    expect(stageAt(untimed, 50)).toBe('ended');
    // The Discord side's own reading of a raid goes through it.
    const raid = testRaid();
    for (const now of [raid.createdAt, raid.hatchTime ?? 0, (raid.endTime ?? 0) + 1]) {
      expect(raidStage(raid, now)).toBe(
        stageAt(
          {
            hatchTime: raid.hatchTime,
            endTime: raid.endTime,
            lastPossibleTime: raid.lastPossibleTime,
            reportedHatched: raid.raid.reportedHatched,
          },
          now,
        ),
      );
    }
  });
});
