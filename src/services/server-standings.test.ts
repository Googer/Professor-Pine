import { describe, expect, it } from 'vitest';
import { loadSettings, type Settings } from '../config/settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { serverRecordRow, STANDING_NOW } from '../../test/support/server-record-cases.js';
import { MemoryServerRecords } from '../../test/support/server-standings.js';
import { ServerStandings } from './server-standings.js';

const RECORDED = '412345678901234567';
const NEWCOMER = '412345678901234568';

function standingsWith(servers: Settings['servers'], rows = [recordedRow()]) {
  const settings = { ...loadSettings(TEST_SETTINGS_PATH), servers };
  const store = new MemoryServerRecords(rows, [RECORDED]);
  const { log, entries } = createTestLogger();
  return { standings: new ServerStandings({ store, settings, log }), store, entries };
}

function recordedRow() {
  return serverRecordRow({ serverId: RECORDED, recordedAt: STANDING_NOW });
}

describe('ServerStandings', () => {
  it('knows nothing of a server until it is loaded', async () => {
    const { standings } = standingsWith(undefined);
    expect(standings.mayHave(RECORDED)).toBe(false);
    await standings.load();
    expect(standings.standingOf(RECORDED)).toEqual({
      recorded: true,
      allowed: false,
      blocked: false,
    });
    expect(standings.mayHave(RECORDED)).toBe(true);
    expect(standings.mayHave(NEWCOMER)).toBe(false);
  });

  it('reads who may have this Pine by the file’s servers as well', async () => {
    const listing = standingsWith([NEWCOMER]).standings;
    await listing.load();
    expect(listing.mayHave(NEWCOMER)).toBe(true);
    expect(listing.mayHave(RECORDED)).toBe(true);
    const open = standingsWith('open', [
      serverRecordRow({ serverId: RECORDED, recordedAt: STANDING_NOW, blockedAt: STANDING_NOW }),
    ]).standings;
    await open.load();
    expect(open.mayHave(NEWCOMER)).toBe(true);
    expect(open.mayHave(RECORDED)).toBe(false);
  });

  it('knows which servers Pine left', async () => {
    const { standings } = standingsWith(undefined, [
      recordedRow(),
      serverRecordRow({ serverId: NEWCOMER, leftAt: STANDING_NOW }),
    ]);
    await standings.load();
    expect(standings.isLeft(NEWCOMER)).toBe(true);
    expect(standings.isLeft(RECORDED)).toBe(false);
  });

  it('may start from rows read already, where nothing is awaited', () => {
    const settings = { ...loadSettings(TEST_SETTINGS_PATH), servers: undefined };
    const standings = new ServerStandings({
      store: new MemoryServerRecords(),
      settings,
      log: createTestLogger().log,
      rows: [recordedRow()],
    });
    expect(standings.mayHave(RECORDED)).toBe(true);
    expect(standings.mayHave(NEWCOMER)).toBe(false);
  });
});
