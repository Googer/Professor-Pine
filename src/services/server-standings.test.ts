import { describe, expect, it } from 'vitest';
import { loadSettings, type Settings } from '../config/settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { serverRecordRow, STANDING_NOW } from '../../test/support/server-record-cases.js';
import { heldCall } from '../../test/support/held-call.js';
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

describe('ServerStandings: a server’s deletion (plan 19C-3)', () => {
  const DAY = 24 * 3_600_000;
  const KEPT = 30 * DAY;
  const GONE = '412345678901234569';

  /** RECORDED present; NEWCOMER left 40 days ago; GONE left 31 days ago; a third 10 days ago. */
  function deleting(
    rows = [
      recordedRow(),
      serverRecordRow({ serverId: NEWCOMER, leftAt: STANDING_NOW - 40 * DAY }),
      serverRecordRow({
        serverId: GONE,
        recordedAt: STANDING_NOW,
        leftAt: STANDING_NOW - 31 * DAY,
      }),
      serverRecordRow({ serverId: '412345678901234570', leftAt: STANDING_NOW - 10 * DAY }),
    ],
  ) {
    const settings = { ...loadSettings(TEST_SETTINGS_PATH), servers: undefined };
    const store = new MemoryServerRecords(
      rows,
      rows.map((row) => row.serverId),
    );
    const { log, entries } = createTestLogger();
    const standings = new ServerStandings({ store, settings, log, now: () => STANDING_NOW });
    return { standings, store, entries };
  }

  it('names the servers due, left more than the time kept ago, those Pine left first first', async () => {
    const { standings } = deleting();
    await standings.load();
    expect(standings.due(KEPT)).toEqual([NEWCOMER, GONE]);
  });

  it('records the deletion begun before the work, and ended after it; then it is due no more', async () => {
    const { standings, store } = deleting();
    await standings.load();
    const seen: (number | null | undefined)[] = [];
    expect(
      await standings.deleteIfDue(GONE, KEPT, () => {
        seen.push(store.rows.get(GONE)?.deletingAt);
        return Promise.resolve();
      }),
    ).toBe(true);
    expect(seen).toEqual([STANDING_NOW]);
    expect(store.rows.get(GONE)).toMatchObject({
      deletingAt: null,
      deletedAt: STANDING_NOW,
      // Its kept screenshots are the sweep's to remove, up to the end.
      filesLeftAt: STANDING_NOW,
      leftAt: STANDING_NOW - 31 * DAY,
      recordedAt: STANDING_NOW,
    });
    // Still left (nothing acts on it), and done.
    expect(standings.isLeft(GONE)).toBe(true);
    expect(standings.due(KEPT)).toEqual([NEWCOMER]);
    expect(await standings.deleteIfDue(GONE, KEPT, () => Promise.reject(new Error('again')))).toBe(
      false,
    );
  });

  it('never begins a server that came back, nor one not due', async () => {
    const { standings, store } = deleting();
    await standings.load();
    let worked = 0;
    const work = () => {
      worked += 1;
      return Promise.resolve();
    };
    // Its return is in its turn before the deletion's: the deletion reads it back.
    const back = standings.cameBack([GONE]);
    expect(await standings.deleteIfDue(GONE, KEPT, work)).toBe(false);
    await back;
    expect(await standings.deleteIfDue('412345678901234570', KEPT, work)).toBe(false);
    expect(await standings.deleteIfDue(RECORDED, KEPT, work)).toBe(false);
    expect(worked).toBe(0);
    expect(store.rows.get(GONE)?.deletingAt).toBeNull();
  });

  it('has a return asked while the deletion runs wait for its end, then starts the server anew', async () => {
    const { standings, store } = deleting();
    await standings.load();
    const held = heldCall('the deletion');
    const deletion = standings.deleteIfDue(GONE, KEPT, async () => {
      held.arrive();
      await held.released;
    });
    await held.reached;
    expect(standings.pending(GONE)).toBe(true);
    // Asked, the return does not wait: the server is taken back in its own turn, after the end.
    await standings.cameBack([GONE]);
    // What waits for the end runs in the server's turn: after the return asked before it.
    const after: boolean[] = [];
    const settled = standings.settled(GONE, () => {
      after.push(standings.isLeft(GONE));
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(standings.isLeft(GONE)).toBe(true);
    held.release();
    expect(await deletion).toBe(true);
    expect(await settled).toBe(true);
    expect(after).toEqual([false]);
    expect(standings.isLeft(GONE)).toBe(false);
    expect(standings.pending(GONE)).toBe(false);
    expect(store.rows.get(GONE)).toMatchObject({
      leftAt: null,
      deletedAt: STANDING_NOW,
      deletingAt: null,
    });
  });

  it('keeps a deletion that failed begun, and finishes it before the server is taken back', async () => {
    const { standings, store } = deleting();
    await standings.load();
    await expect(
      standings.deleteIfDue(GONE, KEPT, () => Promise.reject(new Error('the database went away'))),
    ).rejects.toThrow('the database went away');
    expect(store.rows.get(GONE)).toMatchObject({ deletingAt: STANDING_NOW, deletedAt: null });
    expect(standings.pending(GONE)).toBe(true);
    // Due again at the next sweep, whatever the time.
    expect(standings.due(KEPT)).toContain(GONE);
    const finished: string[] = [];
    standings.finishDeletionsWith((serverId) => {
      finished.push(serverId);
      return Promise.resolve();
    });
    // Added back before the next sweep: its deletion is finished then and there, in its turn.
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE)).toBe(true);
    expect(finished).toEqual([GONE]);
    expect(store.rows.get(GONE)).toMatchObject({
      leftAt: null,
      deletingAt: null,
      deletedAt: STANDING_NOW,
      filesLeftAt: STANDING_NOW,
    });
    expect(standings.pending(GONE)).toBe(false);
  });

  it('keeps a server left whose unfinished deletion fails again when it is added back', async () => {
    const { standings, store, entries } = deleting([
      serverRecordRow({
        serverId: GONE,
        leftAt: STANDING_NOW - 31 * DAY,
        deletingAt: STANDING_NOW,
      }),
    ]);
    await standings.load();
    standings.finishDeletionsWith(() => Promise.reject(new Error('the database went away')));
    // The return itself does not fail: the server's failure is its own, logged.
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE)).toBe(false);
    expect(standings.isLeft(GONE)).toBe(true);
    expect(
      entries.filter(
        (entry) => entry.msg === 'could not finish the deletion of a server added back',
      ),
    ).toMatchObject([{ server: GONE }]);
    let after = false;

    expect(
      await standings.settled(GONE, () => {
        after = true;
        return Promise.resolve();
      }),
    ).toBe(false);
    expect(after).toBe(false);
    expect(store.rows.get(GONE)?.deletingAt).toBe(STANDING_NOW);
  });

  it('never deletes a server present whose deletion an older version left begun', async () => {
    // Taken back while an older version ran, which knew nothing of `deletingAt`.
    const { standings, store } = deleting([
      serverRecordRow({ serverId: GONE, recordedAt: STANDING_NOW, deletingAt: STANDING_NOW }),
    ]);
    await standings.load();
    const finished: string[] = [];
    standings.finishDeletionsWith((serverId) => {
      finished.push(serverId);
      return Promise.resolve();
    });
    expect(standings.due(KEPT)).toEqual([]);
    expect(standings.pending(GONE)).toBe(false);
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE)).toBe(true);
    expect(await standings.deleteIfDue(GONE, KEPT, () => Promise.resolve())).toBe(false);
    expect(finished).toEqual([]);
    expect(store.rows.get(GONE)?.deletedAt).toBeNull();
  });

  it('has a server whose data was deleted new to the settings, whatever its record, and still allowed', async () => {
    const { standings, store } = deleting();
    await standings.load();
    expect(standings.setUpOnRecord(GONE)).toBe(true);
    expect(await standings.deleteIfDue(GONE, KEPT, () => Promise.resolve())).toBe(true);
    expect(standings.setUpOnRecord(GONE)).toBe(false);
    expect(standings.mayHave(GONE)).toBe(true);
    // Added back: no longer left, its deletion kept on record.
    await standings.cameBack([GONE]);
    expect(standings.isLeft(GONE)).toBe(false);
    expect(standings.setUpOnRecord(GONE)).toBe(false);
    expect(standings.mayHave(GONE)).toBe(true);
    expect(store.rows.get(GONE)).toMatchObject({ leftAt: null, deletedAt: STANDING_NOW });
    // As the next start reads it.
    const next = new ServerStandings({
      store,
      settings: { servers: undefined },
      log: createTestLogger().log,
      now: () => STANDING_NOW,
    });
    await next.load();
    expect(next.setUpOnRecord(GONE)).toBe(false);
    expect(next.mayHave(GONE)).toBe(true);
  });

  it('has a server left and back within the time kept set up by its record', async () => {
    const { standings } = deleting([
      serverRecordRow({ serverId: GONE, recordedAt: STANDING_NOW, leftAt: STANDING_NOW - DAY }),
    ]);
    await standings.load();
    await standings.cameBack([GONE]);
    expect(standings.setUpOnRecord(GONE)).toBe(true);
  });

  it('deletes again a server deleted, added back and left again, once it has been left the time kept', async () => {
    let now = STANDING_NOW;
    const store = new MemoryServerRecords(
      [serverRecordRow({ serverId: GONE, recordedAt: now, leftAt: now - 31 * DAY })],
      [GONE],
    );
    const standings = new ServerStandings({
      store,
      settings: { servers: undefined },
      log: createTestLogger().log,
      now: () => now,
    });
    await standings.load();
    expect(await standings.deleteIfDue(GONE, KEPT, () => Promise.resolve())).toBe(true);
    await standings.cameBack([GONE]);
    now += 5 * DAY;
    await standings.markLeft([GONE]);
    now += 29 * DAY;
    expect(standings.due(KEPT)).toEqual([]);
    now += 2 * DAY;
    expect(standings.due(KEPT)).toEqual([GONE]);
    expect(await standings.deleteIfDue(GONE, KEPT, () => Promise.resolve())).toBe(true);
    expect(store.rows.get(GONE)?.deletedAt).toBe(now);
    expect(standings.due(KEPT)).toEqual([]);
  });

  it('takes back the returning servers whose deletion is not pending in one turn, each pending one in its own', async () => {
    const BACK = '412345678901234570';
    const { standings, store, entries } = deleting([
      serverRecordRow({
        serverId: GONE,
        leftAt: STANDING_NOW - 31 * DAY,
        deletingAt: STANDING_NOW,
      }),
      serverRecordRow({ serverId: BACK, leftAt: STANDING_NOW - DAY }),
    ]);
    await standings.load();
    const held = heldCall('the finish');
    standings.finishDeletionsWith(async () => {
      held.arrive();
      await held.released;
      throw new Error('the database went away');
    });
    // The other is back at once, not held behind the deletion.
    await standings.cameBack([GONE, BACK]);
    expect(standings.isLeft(BACK)).toBe(false);
    expect(store.rows.get(BACK)?.leftAt).toBeNull();
    await held.reached;
    expect(standings.isLeft(GONE)).toBe(true);
    held.release();
    expect(await standings.settled(GONE)).toBe(false);
    expect(standings.isLeft(GONE)).toBe(true);
    expect(standings.pending(GONE)).toBe(true);
    expect(
      entries.filter(
        (entry) => entry.msg === 'could not finish the deletion of a server added back',
      ),
    ).toHaveLength(1);
  });

  it('logs a return whose write failed after its deletion was finished as such, not as a failed deletion', async () => {
    const { standings, store, entries } = deleting([
      serverRecordRow({
        serverId: GONE,
        recordedAt: STANDING_NOW,
        leftAt: STANDING_NOW - 31 * DAY,
        deletingAt: STANDING_NOW,
      }),
    ]);
    await standings.load();
    standings.finishDeletionsWith(() => Promise.resolve());
    store.failing.set('cameBack', new Error('the database went away'));
    await standings.cameBack([GONE]);
    // The deletion is over; the server stays left until a later return is written.
    expect(await standings.settled(GONE)).toBe(true);
    expect(store.rows.get(GONE)).toMatchObject({ deletingAt: null, deletedAt: STANDING_NOW });
    expect(standings.isLeft(GONE)).toBe(true);
    const messages = entries.map((entry) => entry.msg);
    expect(messages).toContain('could not take back a server added back after its deletion');
    expect(messages).not.toContain('could not finish the deletion of a server added back');
    expect(
      entries.find(
        (entry) => entry.msg === 'could not take back a server added back after its deletion',
      ),
    ).toMatchObject({ server: GONE, level: 50 });
  });

  it('tries a failing finish once until the next sweep or ready, quietly meanwhile', async () => {
    const { standings, entries } = deleting([
      serverRecordRow({
        serverId: GONE,
        leftAt: STANDING_NOW - 31 * DAY,
        deletingAt: STANDING_NOW,
      }),
    ]);
    await standings.load();
    let tries = 0;
    standings.finishDeletionsWith(() => {
      tries += 1;
      return Promise.reject(new Error('the database went away'));
    });
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE)).toBe(false);
    // Its fill, its Guild row, its joining again: none tries it again.
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE, () => Promise.resolve())).toBe(false);
    expect(await standings.settled(GONE)).toBe(false);
    expect(tries).toBe(1);
    const logged = () =>
      entries.filter(
        (entry) => entry.msg === 'could not finish the deletion of a server added back',
      ).length;
    expect(logged()).toBe(1);
    // A sweep or a ready tries again.
    standings.retryDeletions();
    await standings.cameBack([GONE]);
    expect(await standings.settled(GONE)).toBe(false);
    expect(tries).toBe(2);
    expect(logged()).toBe(2);
  });

  it('tells who follows a server taken back once its deletion is over, once, and not of one taken back as before', async () => {
    const BACK = '412345678901234570';
    const { standings } = deleting([
      serverRecordRow({
        serverId: GONE,
        leftAt: STANDING_NOW - 31 * DAY,
        deletingAt: STANDING_NOW,
      }),
      serverRecordRow({ serverId: BACK, leftAt: STANDING_NOW - DAY }),
    ]);
    await standings.load();
    standings.finishDeletionsWith(() => Promise.resolve());
    const told: { serverId: string; pending: boolean; left: boolean }[] = [];
    standings.whenBackAfterDeletion((serverId) => {
      told.push({
        serverId,
        pending: standings.pending(serverId),
        left: standings.isLeft(serverId),
      });
      return Promise.resolve();
    });
    // Pending until it is taken back: what joins it is answered as while it is deleted.
    const back = standings.cameBack([GONE, BACK]);
    expect(standings.pending(GONE)).toBe(true);
    await back;
    await standings.settled(GONE);
    // Asked again (the client's ready after the ready): nothing more to tell.
    await standings.cameBack([GONE]);
    await standings.settled(GONE);
    expect(told).toEqual([{ serverId: GONE, pending: false, left: false }]);
  });

  it('takes back, not deletes, a server due that is present, and begins none whose presence is not known', async () => {
    const { standings, store } = deleting();
    await standings.load();
    standings.finishDeletionsWith(() => Promise.resolve());
    let worked = 0;
    const work = () => {
      worked += 1;
      return Promise.resolve();
    };
    expect(await standings.deleteIfDue(GONE, KEPT, work, () => true)).toBe(false);
    await standings.settled(GONE);
    expect(standings.isLeft(GONE)).toBe(false);
    expect(store.rows.get(GONE)).toMatchObject({
      leftAt: null,
      deletingAt: null,
      deletedAt: null,
    });
    expect(await standings.deleteIfDue(NEWCOMER, KEPT, work, () => undefined)).toBe(false);
    expect(standings.isLeft(NEWCOMER)).toBe(true);
    expect(worked).toBe(0);
  });

  it('names the servers whose kept screenshots are left, and forgets them once removed', async () => {
    const { standings, store } = deleting([
      serverRecordRow({
        serverId: GONE,
        leftAt: STANDING_NOW - 40 * DAY,
        deletedAt: STANDING_NOW - DAY,
        filesLeftAt: STANDING_NOW - DAY,
      }),
      serverRecordRow({ serverId: NEWCOMER, leftAt: STANDING_NOW - 31 * DAY }),
    ]);
    await standings.load();
    expect(standings.filesLeft()).toEqual([{ serverId: GONE, at: STANDING_NOW - DAY }]);
    expect(await standings.deleteIfDue(NEWCOMER, KEPT, () => Promise.resolve())).toBe(true);
    expect(standings.filesLeft()).toEqual([
      { serverId: GONE, at: STANDING_NOW - DAY },
      { serverId: NEWCOMER, at: STANDING_NOW },
    ]);
    await standings.filesRemoved(GONE, STANDING_NOW - DAY);
    expect(standings.filesLeft()).toEqual([{ serverId: NEWCOMER, at: STANDING_NOW }]);
    expect(store.rows.get(GONE)?.filesLeftAt).toBeNull();
  });

  it('settles at once a server whose data is not being deleted', async () => {
    const { standings } = deleting();
    await standings.load();
    expect(standings.pending(RECORDED)).toBe(false);
    expect(await standings.settled(RECORDED)).toBe(true);
  });
});
