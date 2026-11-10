import { expect, it } from 'vitest';
import type { TrainHistoryReader } from '../../src/db/repositories/history-repository.js';
import type { HistoryRecord } from '../../src/domain/history/party-history.js';
import { trainMonthRange } from '../../src/domain/history/trains-on-web.js';
import { boardAttendee, boardRecord } from './board-cases.js';
import { zonedAt } from './time.js';

/** The server of the tests of the trains on the web, and another one. */
export const TRAINS_SERVER = '412345678901234567';
const OTHER_SERVER = '412345678901234568';
/** The posts' zone of these cases. */
export const TRAINS_ZONE = 'America/New_York';

const MINUTE = 60_000;

/** A live train of the server of these cases, made at `createdAt`, three members came to it. */
export function trainRecord(
  createdAt: number,
  overrides: Partial<HistoryRecord> = {},
): HistoryRecord {
  return boardRecord({
    kind: 'train',
    serverId: TRAINS_SERVER,
    gymId: null,
    tier: null,
    boss: null,
    name: 'Oakland loop',
    createdAt,
    startTime: createdAt,
    endTime: createdAt + 120 * MINUTE,
    endedAt: createdAt + 150 * MINUTE,
    trainKind: 'raid',
    routeStops: 2,
    attendees: [
      boardAttendee(null, 'here'),
      boardAttendee(null, 'done'),
      boardAttendee(null, 'done'),
      boardAttendee(null, 'joined'),
    ],
    stops: [
      {
        gymId: 1,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: createdAt,
        leftAt: createdAt + 20 * MINUTE,
        regionIds: [1],
      },
      {
        gymId: 7,
        legacyGymId: null,
        wayspotId: null,
        arrivedAt: createdAt + 20 * MINUTE,
        leftAt: null,
        regionIds: [2],
      },
    ],
    ...overrides,
  });
}

/**
 * What reading a server's ended trains for the web does (`TrainHistoryReader`, plan 8H-7B), run
 * against the repository and its twin alike. `made` gives a fresh reader, a way to put records in
 * place, and a record's id by its party. The month's read is by server, kind and when the train
 * was made (`createdAt` from `from` to before `to`), newest first; which of them the web shows is
 * the domain's (`trainShownOnWeb`) and the route's (barred regions).
 */
export function trainHistoryCases(
  made: () => Promise<{
    reader: TrainHistoryReader;
    add: (records: readonly HistoryRecord[]) => Promise<void>;
    idOf: (record: HistoryRecord) => Promise<number>;
  }>,
): void {
  const june = trainMonthRange('2026-06', TRAINS_ZONE);

  it('reads the trains a server made in a month of its zone, newest first', async () => {
    const { reader, add, idOf } = await made();
    const first = trainRecord(june.from);
    const later = trainRecord(zonedAt('2026-06-14T18:00', TRAINS_ZONE));
    const last = trainRecord(june.to - 1);
    // The moment before the month and its end belong to May and July; a raid, another server.
    const may = trainRecord(june.from - 1);
    const july = trainRecord(june.to);
    const raid = boardRecord({ serverId: TRAINS_SERVER, createdAt: june.from + MINUTE });
    const away = trainRecord(june.from + MINUTE, { serverId: OTHER_SERVER });
    // A train of the old bot and one nobody came to are read: what the web shows is not the read's.
    const legacy = trainRecord(june.from + 2 * MINUTE, {
      source: 'legacy',
      partyId: null,
      legacyKey: 'oakland:1',
      endedAt: null,
    });
    const empty = trainRecord(june.from + 3 * MINUTE, { attendees: [] });
    await add([first, later, last, may, july, raid, away, legacy, empty]);
    expect(await reader.trainsMade(TRAINS_SERVER, june)).toEqual([
      await idOf(last),
      await idOf(later),
      await idOf(empty),
      await idOf(legacy),
      await idOf(first),
    ]);
    expect(await reader.trainsMade(OTHER_SERVER, june)).toEqual([await idOf(away)]);
    expect(await reader.trainsMade(TRAINS_SERVER, trainMonthRange('2026-08', TRAINS_ZONE))).toEqual(
      [],
    );
  });

  it('reads a train back with what the web lists of it: source, name, when, region, who came', async () => {
    const { reader, add, idOf } = await made();
    const live = trainRecord(june.from, { regionId: 2 });
    const legacy = trainRecord(june.from + MINUTE, {
      source: 'legacy',
      partyId: null,
      legacyKey: 'oakland:2',
      name: null,
      regionId: null,
      endedAt: null,
      attendees: [boardAttendee(null, 'done'), boardAttendee(null, 'interested')],
      stops: [
        { gymId: 7, legacyGymId: 7, wayspotId: null, arrivedAt: null, leftAt: null },
        { gymId: null, legacyGymId: 99, wayspotId: null, arrivedAt: null, leftAt: null },
      ],
    });
    await add([live, legacy]);
    const read = await reader.trainCardRows(TRAINS_SERVER, [await idOf(live), await idOf(legacy)]);
    expect(read.get(await idOf(live))?.listing).toEqual({
      source: 'live',
      name: 'Oakland loop',
      createdAt: june.from,
      regionId: 2,
      here: 1,
      done: 2,
    });
    const old = read.get(await idOf(legacy));
    expect(old?.listing).toEqual({
      source: 'legacy',
      name: null,
      createdAt: june.from + MINUTE,
      regionId: null,
      here: 0,
      done: 1,
    });
    expect(old?.serverId).toBe(TRAINS_SERVER);
    // Its stops in order, without times or regions; one whose gym is gone has no gym.
    expect(old?.stops.map((stop) => [stop.gymId, stop.arrivedAt, stop.regionIds])).toEqual([
      [7, null, null],
      [null, null, null],
    ]);
    expect(old?.record.endedAt).toBeNull();
  });

  it('reads no record that is no train, nor one that is not there', async () => {
    const { reader, add, idOf } = await made();
    const raid = boardRecord({ serverId: TRAINS_SERVER });
    await add([raid]);
    const read = await reader.trainCardRows(TRAINS_SERVER, [await idOf(raid), 999_999]);
    expect(read.size).toBe(0);
    expect((await reader.trainCardRows(TRAINS_SERVER, [])).size).toBe(0);
  });

  it('reads no train of another server, as one that is not there (W4)', async () => {
    const { reader, add, idOf } = await made();
    const home = trainRecord(june.from);
    const away = trainRecord(june.from + MINUTE, { serverId: OTHER_SERVER });
    await add([home, away]);
    const read = await reader.trainCardRows(TRAINS_SERVER, [await idOf(home), await idOf(away)]);
    expect([...read.keys()]).toEqual([await idOf(home)]);
    expect(read.get(await idOf(home))?.serverId).toBe(TRAINS_SERVER);
    expect((await reader.trainCardRows(OTHER_SERVER, [await idOf(away)])).size).toBe(1);
  });
}
