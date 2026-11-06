import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import { bucketOf, dayOf, NO_BOSS } from './activity.js';
import {
  countedParties,
  pairedTrain,
  trainsAroundQuery,
  type CountedRecord,
  type CountedRows,
} from './counted-parties.js';
import type { HistoryStop } from './party-history.js';
import type { RaidAlongRow } from './train-card.js';

const MINUTE = 60_000;
const ZONE = 'America/New_York';
/** The train's start: 18:00 on a Saturday. */
const T = zonedAt('2026-11-07T18:00', ZONE);
/** When the records are counted. */
const NOW = zonedAt('2026-11-10T12:00', ZONE);

/** A raid train of region 2 after Mewtwo, made at 17:00, ended by the clock at 21:00. */
const train = (overrides: Partial<CountedRecord> = {}): CountedRecord => ({
  id: 100,
  source: 'live',
  kind: 'train',
  ending: 'completed',
  createdAt: T - 60 * MINUTE,
  hatchTime: null,
  startTime: T,
  endTime: T + 120 * MINUTE,
  endedAt: T + 180 * MINUTE,
  regionId: 2,
  gymId: null,
  wayspotId: null,
  hereHeads: 4,
  doneHeads: 2,
  bossKey: 'MEWTWO',
  trainKind: 'raid',
  ...overrides,
});

/** A gym stop reached `from` minutes after the start and left `to` after (null: no time). */
const gym = (
  gymId: number | null,
  from: number | null,
  to: number | null,
  regionIds?: readonly number[] | null,
): HistoryStop => ({
  gymId,
  legacyGymId: gymId === null ? 99 : null,
  wayspotId: null,
  arrivedAt: from === null ? null : T + from * MINUTE,
  leftAt: to === null ? null : T + to * MINUTE,
  ...(regionIds === undefined ? {} : { regionIds }),
});

const spot = (id: string, from: number, to: number): HistoryStop => ({
  gymId: null,
  legacyGymId: null,
  wayspotId: id,
  arrivedAt: T + from * MINUTE,
  leftAt: T + to * MINUTE,
});

/** A raid recorded live at a gym, hatched `from` minutes after the start, ended `to` after. */
const raid = (
  id: number,
  gymId: number,
  from: number,
  to: number,
  overrides: Partial<RaidAlongRow> = {},
): RaidAlongRow => ({
  id,
  source: 'live',
  kind: 'raid',
  ending: 'completed',
  tier: 'T5',
  shadow: false,
  gymId,
  wayspotId: null,
  createdAt: T + (from - 60) * MINUTE,
  hatchTime: T + from * MINUTE,
  endTime: T + to * MINUTE,
  endedAt: T + to * MINUTE,
  ...overrides,
});

const rows = (stops: readonly HistoryStop[], raids: readonly RaidAlongRow[] = []): CountedRows => ({
  train: { stops, attendees: [], raids },
});

/** A raid's own record of the history, as the adding reads it. */
const raidRecord = (row: RaidAlongRow): CountedRecord =>
  train({
    id: row.id,
    kind: row.kind,
    ending: row.ending,
    gymId: row.gymId,
    wayspotId: row.wayspotId,
    createdAt: row.createdAt,
    hatchTime: row.hatchTime,
    startTime: null,
    endTime: row.endTime,
    endedAt: row.endedAt,
    bossKey: 'GIRATINA',
    trainKind: null,
  });

/** A stop counted as a raid (or max battle) of the train's. */
const party = (overrides: Partial<ReturnType<typeof countedParties>[number]>) => ({
  kind: 'raid',
  ending: 'completed',
  regionId: 2,
  gymId: null,
  wayspotId: null,
  hereHeads: 0,
  doneHeads: 0,
  bossKey: 'MEWTWO',
  ...overrides,
});

describe('the parties a record counts as', () => {
  it('counts a raid or a max battle as itself, and a canceled one or a meetup as nothing', () => {
    const raidRecord = train({ kind: 'raid', gymId: 7, hatchTime: T, startTime: null });
    expect(countedParties(raidRecord)).toEqual([raidRecord]);
    const max = train({ kind: 'max', wayspotId: 'abc.16', startTime: null });
    expect(countedParties(max)).toEqual([max]);
    expect(countedParties({ ...raidRecord, ending: 'cancelled' })).toEqual([]);
    expect(countedParties(train({ kind: 'meetup' }))).toEqual([]);
  });

  it('counts each stop a raid train made as a raid at its gym, at its arrival, of its boss', () => {
    const counted = countedParties(train(), rows([gym(1, 0, 20), gym(2, 20, 50)]));
    expect(counted).toEqual([
      party({ gymId: 1, createdAt: T, hatchTime: T }),
      party({ gymId: 2, createdAt: T + 20 * MINUTE, hatchTime: T + 20 * MINUTE }),
    ]);
  });

  it('counts a loop’s stop at a gym each time, and no stop the card does not count', () => {
    const counted = countedParties(
      train(),
      // Under a minute at gym 2 (a move by mistake), and gym 3 reached after the end.
      rows([gym(1, 0, 20), gym(2, 20, 20.5), gym(4, 20.5, 40), gym(1, 40, 60), gym(3, 200, null)]),
    );
    expect(counted.map((one) => one.gymId)).toEqual([1, 4, 1]);
  });

  it('gives a Dynamax train’s boss to its Power Spot stops only', () => {
    const counted = countedParties(
      train({ trainKind: 'dynamax', bossKey: 'AZELF' }),
      rows([gym(1, 0, 20), spot('abc.16', 20, 40)]),
    );
    expect(counted).toEqual([
      party({ gymId: 1, createdAt: T, hatchTime: T, bossKey: null }),
      party({
        kind: 'max',
        wayspotId: 'abc.16',
        createdAt: T + 20 * MINUTE,
        hatchTime: T + 20 * MINUTE,
        bossKey: 'AZELF',
      }),
    ]);
    // A raid train's Power Spot stop is a max battle without a boss.
    expect(countedParties(train(), rows([spot('abc.16', 0, 20)]))).toMatchObject([
      { kind: 'max', bossKey: null },
    ]);
  });

  it('counts the stops of a train only where it took place, or where nobody could say', () => {
    for (const ending of ['completed', 'unknown', 'cutover']) {
      expect(countedParties(train({ ending }), rows([gym(1, 0, 20)])), ending).toMatchObject([
        { ending },
      ]);
    }
    // Canceled, or nobody came (the controller's ruling of round 1): nothing.
    for (const ending of ['cancelled', 'expired']) {
      expect(countedParties(train({ ending }), rows([gym(1, 0, 20)])), ending).toEqual([]);
    }
    // Its rows not read: nothing either.
    expect(countedParties(train())).toEqual([]);
  });

  it('counts every stop of a train without times (legacy) at its start, else when it was made', () => {
    const legacy = train({ source: 'legacy', endedAt: null, endTime: null });
    // A gym the list no longer has is a raid at no place.
    expect(countedParties(legacy, rows([gym(1, null, null), gym(null, null, null)]))).toEqual([
      party({ gymId: 1, createdAt: T, hatchTime: T }),
      party({ createdAt: T, hatchTime: T }),
    ]);
    expect(
      countedParties({ ...legacy, startTime: null }, rows([gym(1, null, null)])),
    ).toMatchObject([{ createdAt: T - 60 * MINUTE }]);
    // A live train whose stops have no times (it ended before its steps were kept) made none the
    // card counts: nothing (review T4).
    expect(countedParties(train(), rows([gym(1, null, null)]))).toEqual([]);
  });

  it('counts nothing for a stop where the train joined a raid recorded before it', () => {
    const counted = countedParties(
      train(),
      rows(
        [gym(1, 0, 20), gym(2, 20, 50), gym(3, 50, 70)],
        [
          raid(10, 1, -10, 35),
          // Ending after the train's end, but its record came first (closed early): not on the
          // card, and the stop is that raid all the same.
          raid(11, 3, 60, 200, { endedAt: T + 100 * MINUTE }),
          // At gym 2, but over before the train came.
          raid(12, 2, -60, 10),
        ],
      ),
    );
    expect(counted.map((one) => one.gymId)).toEqual([2]);
  });

  it('counts a joined raid once, as whichever of its two records came first (W1)', () => {
    // The train (record 100) at gym 1 from 18:00 to 18:20, the raid there from 17:50 to 18:35.
    const stops = [gym(1, 0, 20), gym(2, 20, 50)];
    const before = raid(10, 1, -10, 35);
    const after = raid(200, 1, -10, 35);
    const trains = [pairedTrain(train(), stops, [])];
    // The raid's record first: the raid counts, the stop nothing.
    expect(countedParties(raidRecord(before), { trains })).toEqual([raidRecord(before)]);
    expect(countedParties(train(), rows(stops, [before])).map((one) => one.gymId)).toEqual([2]);
    // The train's first (a raid at its last stop that ran on, a max battle until 21:00): the
    // stop counts, the raid nothing.
    expect(countedParties(train(), rows(stops, [after])).map((one) => one.gymId)).toEqual([1, 2]);
    expect(countedParties(raidRecord(after), { trains })).toEqual([]);
  });

  it('pairs a raid only with a train whose stops count, that was there while it stood', () => {
    const later = raid(200, 1, -10, 35);
    const stops = [gym(1, 0, 20)];
    for (const trains of [
      // Canceled, or nobody came: its stops count nothing, so the raid counts.
      [pairedTrain(train({ ending: 'cancelled' }), stops, [])],
      [pairedTrain(train({ ending: 'expired' }), stops, [])],
      // A legacy train's stops have no times: they pair with nothing.
      [pairedTrain(train({ source: 'legacy' }), [gym(1, null, null)], [])],
      // Elsewhere, or there after the raid was over.
      [pairedTrain(train(), [gym(2, 0, 20)], [])],
      [pairedTrain(train(), [gym(3, 0, 20), gym(1, 40, 60)], [])],
    ]) {
      expect(countedParties(raidRecord(later), { trains })).toEqual([raidRecord(later)]);
    }
    // A max battle at the Power Spot the train stopped at, recorded after it: the stop is it.
    const max = raid(201, 1, -10, 180, { kind: 'max', gymId: null, wayspotId: 'abc.16' });
    expect(
      countedParties(raidRecord(max), {
        trains: [pairedTrain(train(), [spot('abc.16', 0, 20)], [])],
      }),
    ).toEqual([]);
  });

  it('reads the trains around a batch’s raids: made within a train’s reach before, ended after', () => {
    const settings = { maximumMeetupLeadtime: 2, maxMeetupLeadupDuration: 60 };
    const raids = [raid(200, 1, 0, 45), raid(150, 2, -60, -15), raidRecord(raid(300, 3, 0, 45))];
    // A train is made at most the lead time and a day ahead of its end, which a day without
    // times may pass (`OPEN_PARTY_HOURS`).
    expect(trainsAroundQuery(raids, settings)).toEqual({
      from: T - 60 * MINUTE - (3 * 24 + 24) * 60 * MINUTE,
      to: T + 45 * MINUTE,
      endedFrom: T - 60 * MINUTE,
      below: 300,
    });
    // Only the raids that count, live: none, nothing to read.
    expect(
      trainsAroundQuery([raid(200, 1, 0, 45, { ending: 'cancelled' })], settings),
    ).toBeUndefined();
    expect(trainsAroundQuery([raid(200, 1, 0, 45, { source: 'legacy' })], settings)).toBe(
      undefined,
    );
  });

  it('counts a stop once, in the train’s region where it lies in several', () => {
    const counted = countedParties(
      train(),
      rows([
        gym(1, 0, 10, [1, 2]),
        gym(2, 10, 20, [3, 4]),
        gym(3, 20, 30, []),
        gym(4, 30, 40, null),
      ]),
    );
    expect(counted.map((one) => one.regionId)).toEqual([2, 3, 2, 2]);
  });

  it('gives each stop its own bucket and day, as a raid of the train’s boss', () => {
    const [first] = countedParties(train(), rows([gym(1, 0, 20)]));
    if (first === undefined) throw new Error('no stop counted');
    expect(bucketOf(first, ZONE, NOW)).toEqual({
      regionId: 2,
      placeKind: 'gym',
      placeId: '1',
      month: '2026-11',
      weekday: 6,
      hour: 18,
      raids: 1,
      maxes: 0,
      completed: 1,
      heads: 0,
    });
    expect(dayOf(first, ZONE, NOW)).toEqual({
      regionId: 2,
      day: '2026-11-07',
      boss: 'MEWTWO',
      raids: 1,
      maxes: 0,
    });
    const [gymStop] = countedParties(train({ trainKind: 'gigantamax' }), rows([gym(1, 0, 20)]));
    expect(gymStop === undefined ? undefined : dayOf(gymStop, ZONE, NOW)).toMatchObject({
      boss: NO_BOSS,
    });
  });
});
