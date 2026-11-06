import { describe, expect, it } from 'vitest';
import { zonedAt } from '../../../test/support/time.js';
import type { HistoryAttendee, HistoryStop } from './party-history.js';
import {
  raidsAlong,
  raidsAlongQuery,
  stopWindows,
  trainCard,
  TRAIN_STOP_MAX_DWELL_MS,
  type CardRecord,
  type RaidAlongRow,
} from './train-card.js';

const MINUTE = 60_000;
const ZONE = 'America/New_York';
/** The train's start: 18:00 on a Saturday. */
const T = zonedAt('2026-11-07T18:00', ZONE);

/** A train that ended by the clock at 21:00, its end time 20:00. */
const record = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  endedAt: T + 180 * MINUTE,
  endTime: T + 120 * MINUTE,
  peakRiders: 3,
  ...overrides,
});

/** A gym stop the train reached `from` minutes after the start and left `to` after (null: open). */
const stop = (
  gymId: number,
  from: number | null,
  to: number | null,
  regionIds?: readonly number[] | null,
): HistoryStop => ({
  gymId,
  legacyGymId: null,
  wayspotId: null,
  arrivedAt: from === null ? null : T + from * MINUTE,
  leftAt: to === null ? null : T + to * MINUTE,
  ...(regionIds === undefined ? {} : { regionIds }),
});

const spot = (id: string, from: number, to: number | null): HistoryStop => ({
  gymId: null,
  legacyGymId: null,
  wayspotId: id,
  arrivedAt: T + from * MINUTE,
  leftAt: to === null ? null : T + to * MINUTE,
});

/** A rider, Here or Done at the end, or gone (`status` null) `left` minutes after the start. */
const rider = (
  furthest: HistoryAttendee['furthest'],
  overrides: Partial<HistoryAttendee> = {},
): HistoryAttendee => ({
  memberId: null,
  status: furthest,
  furthest,
  groupId: 'A',
  extras: 0,
  remote: false,
  team: null,
  signedUpAt: T,
  joinedAt: T,
  hereAt: furthest === 'here' || furthest === 'done' ? T : null,
  doneAt: furthest === 'done' ? T + 60 * MINUTE : null,
  leftAt: null,
  ...overrides,
});

/** A raid recorded live at a gym, hatched `from` minutes after the start, ended `to` after. */
const raid = (
  id: number,
  gymId: number | null,
  from: number,
  to: number | null,
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
  endTime: to === null ? null : T + to * MINUTE,
  endedAt: T + (to ?? from + 45) * MINUTE + 5 * MINUTE,
  ...overrides,
});

describe('stopWindows: when a train was at each stop it counts', () => {
  it('ends a stop at its leaving, or at the next arrival', () => {
    expect(
      stopWindows(record(), [stop(1, 0, 10), stop(2, 10, null), stop(3, 25, 40)], []),
    ).toMatchObject([
      { gymId: 1, from: T, to: T + 10 * MINUTE },
      { gymId: 2, from: T + 10 * MINUTE, to: T + 25 * MINUTE },
      { gymId: 3, from: T + 25 * MINUTE, to: T + 40 * MINUTE },
    ]);
  });

  it('ends an open last stop at the first of the end time, the last rider gone and the end', () => {
    // Still somebody on it at the end: its end time.
    expect(stopWindows(record(), [stop(1, 100, null)], [rider('here')])).toMatchObject([
      { from: T + 100 * MINUTE, to: T + 120 * MINUTE },
    ]);
    // Everybody gone by then: the last of them to go.
    const gone = [
      rider('done', { status: 'done', doneAt: T + 105 * MINUTE }),
      rider('here', { status: null, leftAt: T + 110 * MINUTE }),
    ];
    expect(stopWindows(record(), [stop(1, 100, null)], gone)).toMatchObject([
      { to: T + 110 * MINUTE },
    ]);
    // No end time, nobody gone: the end, but never more than half an hour.
    expect(
      stopWindows(record({ endTime: null, endedAt: T + 115 * MINUTE }), [stop(1, 100, null)], []),
    ).toMatchObject([{ to: T + 115 * MINUTE }]);
  });

  it('ends an open last stop reached after the end time or the last rider gone at the end', () => {
    // Past its end time, somebody still on it: the end, capped at half an hour.
    expect(stopWindows(record(), [stop(1, 130, null)], [rider('here')])).toMatchObject([
      { from: T + 130 * MINUTE, to: T + 160 * MINUTE },
    ]);
    // Everybody gone before the last move: the end as well.
    const gone = [rider('here', { status: null, leftAt: T + 105 * MINUTE })];
    expect(
      stopWindows(record({ endTime: null, endedAt: T + 125 * MINUTE }), [stop(1, 110, null)], gone),
    ).toMatchObject([{ from: T + 110 * MINUTE, to: T + 125 * MINUTE }]);
  });

  it('caps any one stop at half an hour', () => {
    expect(stopWindows(record(), [stop(1, 0, 50), stop(2, 50, 60)], [])).toMatchObject([
      { gymId: 1, from: T, to: T + TRAIN_STOP_MAX_DWELL_MS },
      { gymId: 2, from: T + 50 * MINUTE, to: T + 60 * MINUTE },
    ]);
  });

  it('leaves out a stop of under a minute, and counts a loop’s second lap', () => {
    const windows = stopWindows(
      record(),
      [stop(1, 0, 10), stop(2, 10, 10.5), stop(3, 10.5, 20), stop(1, 20, 30)],
      [],
    );
    expect(windows.map((window) => window.gymId)).toEqual([1, 3, 1]);
  });

  it('drops what came after the end, and stops at the end what it cuts', () => {
    // A route laid early for a start after a `/delete`: its first arrival is the start.
    expect(stopWindows(record({ endedAt: T - MINUTE }), [stop(1, 0, null)], [])).toEqual([]);
    expect(
      stopWindows(record({ endedAt: T + 20 * MINUTE }), [stop(1, 0, 10), stop(2, 15, 30)], []),
    ).toMatchObject([{ to: T + 10 * MINUTE }, { from: T + 15 * MINUTE, to: T + 20 * MINUTE }]);
  });

  it('counts no stop without a time (a train seen only by its route, a legacy train)', () => {
    expect(stopWindows(record(), [stop(1, null, null), stop(2, null, null)], [])).toEqual([]);
  });
});

describe('raidsAlong: the raids recorded at the stops while the train was there', () => {
  const END = record().endedAt;
  const windows = stopWindows(
    record(),
    [stop(1, 0, 20), stop(2, 20, 40), spot('w1.16', 40, 60), stop(1, 60, 80)],
    [],
  );

  it('counts each raid at a stop whose time overlaps it, once, by tier', () => {
    const tally = raidsAlong(windows, END, [
      raid(1, 1, 10, 55),
      // At gym 1 again on the second lap: still one raid.
      raid(2, 1, 50, 95),
      raid(3, 2, -30, 15),
      raid(4, 2, 30, 75, { tier: 'Mega' }),
      raid(5, 2, 45, 90),
      // A max battle at the Power Spot; another at a spot the train never reached.
      raid(6, null, 40, 70, { kind: 'max', tier: 'D5', wayspotId: 'w1.16' }),
      raid(7, null, 40, 70, { kind: 'max', tier: 'D5', wayspotId: 'w2.16' }),
    ]);
    // The most first; of as many, raids before max battles, the higher tier first.
    expect(tally).toEqual([
      { tier: 'T5', shadow: false, count: 2 },
      { tier: 'Mega', shadow: false, count: 1 },
      { tier: 'D5', shadow: false, count: 1 },
    ]);
  });

  it('counts only what the heatmap counts, live: no cancelled raid, no legacy one, no train', () => {
    expect(
      raidsAlong(windows, END, [
        raid(1, 1, 10, 55, { ending: 'cancelled' }),
        raid(2, 1, 10, 55, { source: 'legacy' }),
        raid(3, 1, 10, 55, { kind: 'train' }),
        raid(4, 1, 10, 55, { ending: 'expired', shadow: true }),
      ]),
    ).toEqual([{ tier: 'T5', shadow: true, count: 1 }]);
  });

  it('takes a raid without a hatch from its report and one without an end time to its end', () => {
    const tally = raidsAlong(windows, END, [
      raid(1, 1, 30, null, {
        hatchTime: null,
        createdAt: T + 15 * MINUTE,
        endedAt: T + 25 * MINUTE,
      }),
      raid(2, 2, 0, null, { endedAt: T + 10 * MINUTE }),
    ]);
    expect(tally).toEqual([{ tier: 'T5', shadow: false, count: 1 }]);
  });

  it('counts only the raids recorded by the train’s end, as its post saw them (G6)', () => {
    const end = record().endedAt;
    const raids = [
      raid(1, 1, 10, 55),
      // Recorded the moment the train ended, and a minute after: the post never saw the second.
      raid(2, 2, 25, 35, { tier: 'Mega', endedAt: T + 180 * MINUTE }),
      raid(3, 2, 30, 40, { tier: 'T3', endedAt: T + 181 * MINUTE }),
    ];
    expect(raidsAlong(windows, end, raids)).toEqual([
      { tier: 'T5', shadow: false, count: 1 },
      { tier: 'Mega', shadow: false, count: 1 },
    ]);
    // Read back later for the web, the card is the post's.
    const card = trainCard(
      record(),
      [stop(1, 0, 20), stop(2, 20, 40), spot('w1.16', 40, 60), stop(1, 60, 80)],
      [],
      raids,
    );
    expect(card.raids).toEqual(raidsAlong(windows, end, raids));
  });

  it('names what to read: the gyms and Power Spots of the stops it counts, and when', () => {
    expect(raidsAlongQuery(windows)).toEqual({
      gymIds: [1, 2],
      wayspotIds: ['w1.16'],
      from: T,
      to: T + 80 * MINUTE,
    });
    expect(raidsAlongQuery([])).toBeUndefined();
  });
});

describe('trainCard: what the card of an ended train says', () => {
  const route = [
    stop(1, 0, 20, [1]),
    stop(2, 20, 40, [2, 1]),
    stop(3, 40, 40.5, [3]),
    stop(4, 40.5, 70, [1]),
  ];

  it('says how many stops in how long, the regions in order, the riders and the raids', () => {
    const card = trainCard(
      record(),
      route,
      [rider('here', { extras: 2 }), rider('done'), rider('joined'), rider('interested')],
      [raid(1, 2, 25, 70)],
    );
    expect(card).toEqual({
      // The time of the stops it counts: 20 + 20 + 29.5 minutes.
      stops: { count: 3, durationMs: 69.5 * MINUTE },
      // A stop of under a minute is not counted, nor are its regions.
      regionIds: [1, 2],
      riders: { members: 2, heads: 4 },
      peakRiders: 3,
      raids: [{ tier: 'T5', shadow: false, count: 1 }],
    });
  });

  it('sums the stops’ times, each at most half an hour, not the span from first to last', () => {
    const card = trainCard(record(), [stop(1, 0, 10), stop(2, 10, 100), stop(3, 100, 110)], [], []);
    expect(card.stops).toEqual({ count: 3, durationMs: 50 * MINUTE });
  });

  it('names no region where every stop it counts lay in none', () => {
    const card = trainCard(record(), [stop(1, 0, 10, []), stop(2, 10, 20, [])], [], []);
    expect(card.regionIds).toBeNull();
  });

  it('says only the riders of a train that never started', () => {
    expect(
      trainCard(record({ endedAt: T - MINUTE }), [stop(1, 0, null, [1])], [rider('joined')], []),
    ).toEqual({
      stops: null,
      regionIds: null,
      riders: { members: 0, heads: 0 },
      peakRiders: 3,
      raids: null,
    });
  });

  it('leaves out what is not known: the regions of a record of before, raids not read', () => {
    const card = trainCard(
      record({ peakRiders: null }),
      [stop(1, 0, 20), stop(2, 20, 40)],
      [],
      undefined,
    );
    expect(card).toMatchObject({ regionIds: null, peakRiders: null, raids: null });
    expect(trainCard(record({ peakRiders: undefined }), route, [], []).peakRiders).toBeNull();
  });
});
