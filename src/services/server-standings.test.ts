import { describe, expect, it } from 'vitest';
import { loadSettings, type Settings } from '../config/settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { serverRecordRow, STANDING_NOW } from '../../test/support/server-record-cases.js';
import { MemoryServerRecords } from '../../test/support/server-standings.js';
import { ServerStandings } from './server-standings.js';

const RECORDED = '412345678901234567';
const NEWCOMER = '412345678901234568';
const STAFF = '323456789012345678';

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

  it('marks left the servers Pine was in, and takes it back when they are present again', async () => {
    const { standings, store } = standingsWith(undefined);
    await standings.load();
    await standings.markLeft([RECORDED, NEWCOMER]);
    // NEWCOMER has no Guild row: Pine was never in it.
    expect(standings.isLeft(RECORDED)).toBe(true);
    expect(standings.isLeft(NEWCOMER)).toBe(false);
    expect(store.rows.get(RECORDED)?.leftAt).not.toBeNull();
    // Still allowed by its record: it may come back.
    expect(standings.mayHave(RECORDED)).toBe(true);
    await standings.cameBack([RECORDED, NEWCOMER]);
    expect(standings.isLeft(RECORDED)).toBe(false);
    expect(store.rows.get(RECORDED)?.leftAt).toBeNull();
  });

  it('records an operator’s allowance, block and unblock, and keeps them in memory', async () => {
    const { standings, store } = standingsWith(undefined);
    await standings.load();
    await standings.allow(NEWCOMER, STAFF);
    expect(standings.mayHave(NEWCOMER)).toBe(true);
    await standings.block(RECORDED, STAFF);
    expect(standings.mayHave(RECORDED)).toBe(false);
    expect(store.rows.get(RECORDED)).toMatchObject({ blockedBy: STAFF });
    expect(standings.all().map((row) => row.serverId)).toEqual([RECORDED, NEWCOMER]);
    await standings.unblock(RECORDED);
    expect(standings.mayHave(RECORDED)).toBe(true);
    expect(store.rows.get(RECORDED)).toMatchObject({ blockedAt: null, blockedBy: null });
  });

  it('is open to adopting servers only while no server was ever recorded, on an instance without a list', async () => {
    // A new install: nothing recorded, `servers` unset.
    const fresh = standingsWith(undefined, []);
    await fresh.standings.load();
    expect(fresh.standings.adopting).toBe(true);
    // An instance upgraded with a server, or one whose file lists servers or is open: never.
    const upgraded = standingsWith(undefined);
    await upgraded.standings.load();
    expect(upgraded.standings.adopting).toBe(false);
    for (const servers of [[NEWCOMER], 'open' as const]) {
      const listing = standingsWith(servers, []);
      await listing.standings.load();
      expect(listing.standings.adopting).toBe(false);
    }
    // Rows of servers Pine left or an operator blocked hold no record: still open.
    const blocked = standingsWith(undefined, [
      serverRecordRow({ serverId: NEWCOMER, blockedAt: STANDING_NOW }),
    ]);
    await blocked.standings.load();
    expect(blocked.standings.adopting).toBe(true);
  });

  it('adopts servers in memory at once, writes them once, and closes the window for good', async () => {
    const { standings, store } = standingsWith(undefined, []);
    await standings.load();
    standings.adopt([NEWCOMER]);
    // Admitted at once, before anything is written.
    expect(standings.mayHave(NEWCOMER)).toBe(true);
    expect(store.rows.has(NEWCOMER)).toBe(false);
    expect(await standings.writeAdopted()).toEqual([NEWCOMER]);
    expect(store.rows.get(NEWCOMER)?.recordedAt).not.toBeNull();
    expect(standings.adopting).toBe(false);
    // Nothing more to write.
    expect(await standings.writeAdopted()).toEqual([]);
  });

  it('keeps an adoption not yet written when a server is marked left meanwhile', async () => {
    const { standings, store } = standingsWith(undefined, []);
    await standings.load();
    standings.adopt([NEWCOMER]);
    // Its Guild row was written at the start, its adoption not yet: it removes Pine.
    store.guilds.add(NEWCOMER);
    await standings.markLeft([NEWCOMER]);
    expect(standings.isLeft(NEWCOMER)).toBe(true);
    expect(standings.standingOf(NEWCOMER).recorded).toBe(true);
    expect(standings.mayHave(NEWCOMER)).toBe(true);
    expect(await standings.writeAdopted()).toEqual([NEWCOMER]);
    expect(store.rows.get(NEWCOMER)).toMatchObject({ leftAt: expect.any(Number) as number });
    expect(store.rows.get(NEWCOMER)?.recordedAt).not.toBeNull();
  });

  it('keeps the adopted in memory when their write fails, and the window open', async () => {
    const { standings, store } = standingsWith(undefined, []);
    await standings.load();
    standings.adopt([NEWCOMER]);
    store.failing.set('record', new Error('the database is away'));
    await expect(standings.writeAdopted()).rejects.toThrow('the database is away');
    expect(standings.mayHave(NEWCOMER)).toBe(true);
    expect(standings.adopting).toBe(true);
    store.failing.delete('record');
    expect(await standings.writeAdopted()).toEqual([NEWCOMER]);
    expect(standings.adopting).toBe(false);
  });

  it('writes a server’s changes one after another: a return asked while it is marked left is not lost', async () => {
    const { standings, store } = standingsWith(undefined);
    await standings.load();
    const left = standings.markLeft([RECORDED]);
    // Asked before the mark is written: it comes after it.
    const back = standings.cameBack([RECORDED]);
    await Promise.all([left, back]);
    expect(standings.isLeft(RECORDED)).toBe(false);
    expect(store.rows.get(RECORDED)?.leftAt).toBeNull();
  });

  it('tells its listeners which servers it marked left and which came back, once written', async () => {
    const { standings, entries } = standingsWith(undefined);
    await standings.load();
    const heard: { left: readonly string[]; back: readonly string[] }[] = [];
    standings.whenLeftChanged((change) => heard.push(change));
    standings.whenLeftChanged(() => {
      throw new Error('a listener that fails');
    });
    // NEWCOMER has no Guild row: never marked, never told.
    await standings.markLeft([RECORDED, NEWCOMER]);
    // Left already: nothing changes, nobody is told.
    await standings.markLeft([RECORDED]);
    await standings.cameBack([RECORDED, NEWCOMER]);
    await standings.cameBack([RECORDED]);
    expect(heard).toEqual([
      { left: [RECORDED], back: [] },
      { left: [], back: [RECORDED] },
    ]);
    // The listener that fails is logged; the others are told all the same.
    expect(
      entries.filter((entry) => entry.msg === 'a listener of servers left failed'),
    ).toHaveLength(2);
  });

  it('tells its listeners of each server an operator allowed, blocked or unblocked, once written and kept', async () => {
    const { standings, store, entries } = standingsWith(undefined);
    await standings.load();
    const heard: { serverId: string; mayHave: boolean }[] = [];
    standings.whenStandingChanged((serverId) =>
      heard.push({ serverId, mayHave: standings.mayHave(serverId) }),
    );
    standings.whenStandingChanged(() => {
      throw new Error('a listener that fails');
    });
    await standings.allow(NEWCOMER, STAFF);
    await standings.block(RECORDED, STAFF);
    await standings.unblock(RECORDED);
    // A write that fails changes nothing, and nobody is told.
    store.failing.set('block', new Error('the database is away'));
    await expect(standings.block(NEWCOMER, STAFF)).rejects.toThrow('the database is away');
    expect(heard).toEqual([
      { serverId: NEWCOMER, mayHave: true },
      { serverId: RECORDED, mayHave: false },
      { serverId: RECORDED, mayHave: true },
    ]);
    // The listener that fails is logged; the others are told all the same.
    expect(
      entries.filter((entry) => entry.msg === 'a listener of servers’ standings failed'),
    ).toHaveLength(3);
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
