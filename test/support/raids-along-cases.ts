import { expect, it } from 'vitest';
import {
  RAIDS_ALONG_REACH_MS,
  type RaidsAlongReader,
} from '../../src/db/repositories/history-repository.js';
import type { HistoryRecord } from '../../src/domain/history/party-history.js';
import { boardRecord } from './board-cases.js';

/** The server of the tests of the raids along a train's way, and another one. */
export const ALONG_SERVER = '412345678901234567';
const OTHER_SERVER = '412345678901234568';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** When the train of these cases ran: from `ALONG_FROM` for two hours. */
export const ALONG_FROM = Date.UTC(2026, 10, 7, 23);
const ALONG_TO = ALONG_FROM + 2 * HOUR;
const SPOT = 'c0ffee00c0ffee00c0ffee00c0ffee00.16';

/** A raid recorded live in the server of these cases, at gym 1, reported as the train started. */
export function alongRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return boardRecord({
    serverId: ALONG_SERVER,
    gymId: 1,
    createdAt: ALONG_FROM,
    hatchTime: ALONG_FROM + 30 * MINUTE,
    endTime: ALONG_FROM + 75 * MINUTE,
    endedAt: ALONG_FROM + 80 * MINUTE,
    ...overrides,
  });
}

/**
 * What reading the raids along a train's way does (`RaidsAlongReader.raidsAlong`), run against
 * the repository and its twin alike. `made` gives a fresh reader and a way to put records in
 * place. The read narrows by server, kind, place and when the raid was reported; whether a raid
 * was at a stop while the train was there is the domain's (`raidsAlong`).
 */
export function raidsAlongCases(
  made: () => Promise<{
    reader: RaidsAlongReader;
    add: (records: readonly HistoryRecord[]) => Promise<void>;
  }>,
): void {
  it('reads the raids and max battles of the server at the stops, reported within reach', async () => {
    const { reader, add } = await made();
    await add([
      alongRecord({ tier: 'Mega', shadow: false }),
      // A max battle at the Power Spot, an elite raid reported the evening before.
      alongRecord({ kind: 'max', gymId: null, wayspotId: SPOT, tier: 'D5' }),
      alongRecord({ tier: 'Elite', createdAt: ALONG_FROM - 20 * HOUR }),
      // Elsewhere, of another server, a train, reported after the train or days before it.
      alongRecord({ gymId: 2 }),
      alongRecord({ serverId: OTHER_SERVER }),
      alongRecord({ kind: 'train', tier: null }),
      alongRecord({
        createdAt: ALONG_TO - MINUTE,
        hatchTime: ALONG_TO + MINUTE,
        endTime: ALONG_TO + 46 * MINUTE,
      }),
      alongRecord({ createdAt: ALONG_FROM - 3 * 24 * HOUR }),
      // Over before the train's first stop.
      alongRecord({
        createdAt: ALONG_FROM - 2 * HOUR,
        hatchTime: ALONG_FROM - 90 * MINUTE,
        endTime: ALONG_FROM - MINUTE,
        endedAt: ALONG_FROM - MINUTE,
      }),
      // A legacy raid there: the card counts live records only.
      alongRecord({ source: 'legacy', partyId: null, legacyKey: 'west:1' }),
      // A cancelled one is read: what counts is the domain's (`countsAsActivity`).
      alongRecord({ ending: 'cancelled', shadow: true, tier: 'T3' }),
    ]);
    const rows = await reader.raidsAlong(ALONG_SERVER, {
      gymIds: [1, 3],
      wayspotIds: [SPOT],
      from: ALONG_FROM,
      to: ALONG_TO,
    });
    expect(rows.map((row) => [row.kind, row.tier, row.ending, row.shadow])).toEqual([
      ['raid', 'Mega', 'completed', false],
      ['max', 'D5', 'completed', false],
      ['raid', 'Elite', 'completed', false],
      ['raid', 'T3', 'cancelled', true],
    ]);
    expect(rows[0]).toEqual({
      id: expect.any(Number) as number,
      source: 'live',
      kind: 'raid',
      ending: 'completed',
      tier: 'Mega',
      shadow: false,
      gymId: 1,
      wayspotId: null,
      createdAt: ALONG_FROM,
      hatchTime: ALONG_FROM + 30 * MINUTE,
      endTime: ALONG_FROM + 75 * MINUTE,
      endedAt: ALONG_FROM + 80 * MINUTE,
    });
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
  });

  it('bounds the read by the raid’s own time, as the card does: hatch (or report) to end', async () => {
    const { reader, add } = await made();
    await add([
      // Reported after the train's last stop, hatched while it was there.
      alongRecord({
        tier: 'T1',
        createdAt: ALONG_TO + 5 * MINUTE,
        hatchTime: ALONG_TO - 10 * MINUTE,
        endTime: ALONG_TO + 35 * MINUTE,
      }),
      // Hatched just as the train left its last stop.
      alongRecord({ tier: 'T2', createdAt: ALONG_TO - HOUR, hatchTime: ALONG_TO }),
      // Over just as the train reached its first stop, reported the furthest back it reads.
      alongRecord({
        tier: 'T3',
        createdAt: ALONG_FROM - RAIDS_ALONG_REACH_MS,
        hatchTime: null,
        endTime: ALONG_FROM,
        endedAt: ALONG_FROM,
      }),
      // Reported a moment before that: not read.
      alongRecord({
        tier: 'T4',
        createdAt: ALONG_FROM - RAIDS_ALONG_REACH_MS - 1,
        hatchTime: null,
        endTime: ALONG_FROM,
        endedAt: ALONG_FROM,
      }),
      // No end time, ended before the train came: read, whenever it ended, since how long it
      // stood is the domain's (`raidTime`, W5: an egg reported an hour before stands 105 minutes).
      alongRecord({
        tier: 'T5',
        createdAt: ALONG_FROM - HOUR,
        hatchTime: null,
        endTime: null,
        endedAt: ALONG_FROM - 1,
      }),
      // No end time, hatched after the train's last stop: not read.
      alongRecord({
        tier: 'Mega',
        createdAt: ALONG_TO - HOUR,
        hatchTime: ALONG_TO + 1,
        endTime: null,
        endedAt: ALONG_TO + HOUR,
      }),
    ]);
    const rows = await reader.raidsAlong(ALONG_SERVER, {
      gymIds: [1],
      wayspotIds: [],
      from: ALONG_FROM,
      to: ALONG_TO,
    });
    expect(rows.map((row) => row.tier).sort()).toEqual(['T1', 'T2', 'T3', 'T5']);
  });

  it('reads nothing for a train at no gym and no Power Spot', async () => {
    const { reader, add } = await made();
    await add([alongRecord()]);
    expect(
      await reader.raidsAlong(ALONG_SERVER, {
        gymIds: [],
        wayspotIds: [],
        from: ALONG_FROM,
        to: ALONG_TO,
      }),
    ).toEqual([]);
  });
}
