import { describe, expect, it } from 'vitest';
import { loadSettings } from '../config/settings.js';
import {
  ServerDeletionStopped,
  type DeletedServerData,
  type DeletionOptions,
  type ServerDataStorage,
} from '../db/repositories/server-data-repository.js';
import type { StoredServerRecord } from '../db/repositories/server-record-repository.js';
import { RecordingDms } from '../../test/support/dms.js';
import { textOf } from '../../test/support/messages.js';
import { serverRecordRow } from '../../test/support/server-record-cases.js';
import { MemoryServerRecords } from '../../test/support/server-standings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { SERVER_KEPT_MS, ServerDeletion } from './server-deletion.js';
import { ServerStandings } from './server-standings.js';

const DAY = 24 * 3_600_000;
const NOW = Date.parse('2026-12-20T15:00:00Z');
const OWNER = '200000000000000001';
/** Left 40 days ago: deleted first. */
const FIRST = '412345678901234567';
/** Left 31 days ago. */
const SECOND = '412345678901234568';
/** Left 10 days ago: kept. */
const RECENT = '412345678901234569';
/** Present: kept. */
const PRESENT = '412345678901234570';

/** The database's part, in memory: what it was asked, what it deletes, where it fails. */
class FakeServerData implements ServerDataStorage {
  readonly asked: string[] = [];
  readonly failing = new Map<string, Error>();
  constructor(private readonly order: string[] = []) {}
  delete(serverId: string, options: DeletionOptions = {}): Promise<DeletedServerData> {
    this.asked.push(serverId);
    this.order.push(`database ${serverId}`);
    if (options.isStopped?.() === true) return Promise.reject(new ServerDeletionStopped(serverId));
    const failure = this.failing.get(serverId);
    if (failure) return Promise.reject(failure);
    return Promise.resolve({
      counts: { PartyHistory: 1200, Guild: 1 },
      guildRow: Number(serverId.slice(-2)),
      gyms: { unlinked: [7], deleted: [8, 9] },
    });
  }
}

function deletionWith(
  rows: StoredServerRecord[] = [
    serverRecordRow({ serverId: FIRST, recordedAt: 1, leftAt: NOW - 40 * DAY }),
    serverRecordRow({ serverId: SECOND, leftAt: NOW - 31 * DAY }),
    serverRecordRow({ serverId: RECENT, leftAt: NOW - 10 * DAY }),
    serverRecordRow({ serverId: PRESENT, recordedAt: 1 }),
  ],
  /** The servers whose folder the old bot's member index holds; none without an index. */
  legacyIndex?: (serverId: string) => boolean,
) {
  const clock = { now: NOW };
  const store = new MemoryServerRecords(
    rows,
    rows.map((row) => row.serverId),
  );
  const { log, entries } = createTestLogger();
  const settings = { ...loadSettings(TEST_SETTINGS_PATH), servers: undefined };
  const standings = new ServerStandings({
    store,
    settings,
    log,
    rows,
    now: () => clock.now,
  });
  /** What was done, in order: the database's part, the memory, the kept screenshots. */
  const order: string[] = [];
  const data = new FakeServerData(order);
  /** `failed` of every server's, `failingFor` the servers whose files fail by themselves. */
  const shots = {
    failed: 0,
    failingFor: new Set<string>(),
    asked: [] as string[],
    upTo: [] as number[],
  };
  const forgotten: { serverId: string; deleted: DeletedServerData }[] = [];
  const dms = new RecordingDms();
  /** The servers Pine is in now (its shards' view): unavailable ones included. */
  const present = new Set<string>([PRESENT]);
  const deletion = new ServerDeletion({
    standings,
    data,
    screenshots: {
      forgetServer: (serverId, upTo) => {
        shots.asked.push(serverId);
        shots.upTo.push(upTo);
        // The record is written before the files: they never hold it.
        const row = store.rows.get(serverId);
        order.push(
          `screenshots ${serverId} ${row?.deletedAt === null ? 'unrecorded' : 'recorded'}`,
        );
        const failed = shots.failed + (shots.failingFor.has(serverId) ? 1 : 0);
        return Promise.resolve({ removed: 3, failed });
      },
    },
    forget: (serverId, deleted) => {
      forgotten.push({ serverId, deleted });
      order.push(`memory ${serverId}`);
      return Promise.resolve();
    },
    present: (serverId) => present.has(serverId),
    ...(legacyIndex ? { legacyIndex } : {}),
    dms,
    ownerId: OWNER,
    log,
    now: () => clock.now,
  });
  return {
    deletion,
    standings,
    store,
    data,
    shots,
    forgotten,
    dms,
    entries,
    clock,
    order,
    present,
  };
}

describe('ServerDeletion (plan 19C-3)', () => {
  it('keeps a server 30 days after Pine left it', () => {
    expect(SERVER_KEPT_MS).toBe(30 * DAY);
  });

  it('deletes the servers Pine left more than 30 days ago, the first left first, and keeps the rest', async () => {
    const { deletion, store, data, shots, forgotten, entries } = deletionWith();
    expect(await deletion.sweep()).toEqual([FIRST, SECOND]);
    expect(data.asked).toEqual([FIRST, SECOND]);
    expect(shots.asked).toEqual([FIRST, SECOND]);
    expect(forgotten.map((one) => one.serverId)).toEqual([FIRST, SECOND]);
    expect(store.rows.get(FIRST)).toMatchObject({ deletedAt: NOW, deletingAt: null });
    expect(store.rows.get(RECENT)).toMatchObject({ deletedAt: null, deletingAt: null });
    expect(store.rows.get(PRESENT)).toMatchObject({ deletedAt: null, leftAt: null });
    // The log names the server and counts per table, the screenshots and gyms among them.
    const logged = entries.filter(
      (entry) => entry.msg === 'deleted the data of a server Pine left more than 30 days ago',
    );
    expect(logged.map((entry) => entry.server)).toEqual([FIRST, SECOND]);
    expect(logged[0]).toMatchObject({
      counts: { PartyHistory: 1200, Guild: 1 },
      gyms: { unlinked: 1, deleted: 2 },
    });
    // Its kept screenshots, up to the end of the database's part, logged by themselves.
    expect(shots.upTo).toEqual([NOW, NOW]);
    expect(
      entries.filter((entry) => entry.msg === 'removed the kept screenshots of a deleted server'),
    ).toMatchObject([
      { server: FIRST, screenshots: 3 },
      { server: SECOND, screenshots: 3 },
    ]);
    expect(store.rows.get(FIRST)?.filesLeftAt).toBeNull();
  });

  it('forgets what it keeps in memory once the database’s part is done, then writes the end, then the files', async () => {
    const { deletion, order } = deletionWith();
    await deletion.sweep();
    expect(order).toEqual([
      `database ${FIRST}`,
      `memory ${FIRST}`,
      `database ${SECOND}`,
      `memory ${SECOND}`,
      `screenshots ${FIRST} recorded`,
      `screenshots ${SECOND} recorded`,
    ]);
  });

  it('deletes no server Pine is in, unavailable as it may be: it is taken back', async () => {
    const { deletion, standings, store, data, present } = deletionWith();
    // Discord says it is unavailable: Pine is in it all the same.
    present.add(FIRST);
    expect(await deletion.sweep()).toEqual([SECOND]);
    await standings.settled(FIRST);
    expect(data.asked).toEqual([SECOND]);
    expect(standings.isLeft(FIRST)).toBe(false);
    expect(store.rows.get(FIRST)).toMatchObject({
      leftAt: null,
      deletingAt: null,
      deletedAt: null,
    });
  });

  it('finishes in its own path the unfinished deletion of a server Pine is in again, and tells of it', async () => {
    const made = deletionWith([
      serverRecordRow({
        serverId: FIRST,
        recordedAt: 1,
        leftAt: NOW - 40 * DAY,
        deletingAt: NOW - DAY,
      }),
    ]);
    made.present.add(FIRST);
    expect(await made.deletion.sweep()).toEqual([]);
    // Over by the time the sweep ends: back, deleted, its kept screenshots removed in this sweep.
    expect(made.standings.isLeft(FIRST)).toBe(false);
    expect(made.store.rows.get(FIRST)).toMatchObject({
      leftAt: null,
      deletingAt: null,
      deletedAt: NOW,
      filesLeftAt: null,
    });
    const text = textOf(made.dms.to(OWNER)[0]);
    expect(text).toContain(`${FIRST} · left`);
    expect(text).not.toContain('still being removed');
  });

  it('names the old-bot member index folders as the operator’s to remove, only of the servers that have one', async () => {
    const without = deletionWith();
    await without.deletion.sweep();
    expect(textOf(without.dms.to(OWNER)[0])).not.toContain('LEGACY_INDEX_DIR');
    // An index, with no folder of these servers: nothing to remove.
    const none = deletionWith(undefined, () => false);
    await none.deletion.sweep();
    expect(textOf(none.dms.to(OWNER)[0])).not.toContain('LEGACY_INDEX_DIR');
    const made = deletionWith(undefined, (serverId) => serverId === FIRST);
    await made.deletion.sweep();
    const text = textOf(made.dms.to(OWNER)[0]);
    expect(text).toContain('`LEGACY_INDEX_DIR`');
    expect(text).toContain(`the folder \`${FIRST}/\``);
    expect(text).not.toContain(`\`${SECOND}/\``);
  });

  it('says the kept screenshots are deleted only of the servers whose files went in that sweep', async () => {
    const made = deletionWith();
    made.shots.failingFor.add(SECOND);
    await made.deletion.sweep();
    const lines = textOf(made.dms.to(OWNER)[0]).split('\n');
    const lineOf = (serverId: string) => lines.find((line) => line.startsWith(serverId)) ?? '';
    expect(lineOf(FIRST)).not.toContain('still being removed');
    expect(lineOf(SECOND)).toContain('(some kept screenshots are still being removed)');
    // All of them gone: nothing said of any.
    const all = deletionWith();
    await all.deletion.sweep();
    expect(textOf(all.dms.to(OWNER)[0])).not.toContain('still being removed');
  });

  it('names a deletion its return finished in the next sweep’s DM, with its index folder', async () => {
    const made = deletionWith(undefined, (serverId) => serverId === FIRST);
    made.data.failing.set(FIRST, new Error('the database went away'));
    await made.deletion.sweep();
    expect(textOf(made.dms.to(OWNER)[0])).not.toContain(FIRST);
    // Added back before the next sweep: its return finishes the deletion.
    made.data.failing.clear();
    await made.standings.cameBack([FIRST]);
    expect(await made.standings.settled(FIRST)).toBe(true);
    made.clock.now += DAY;
    await made.deletion.sweep();
    const told = made.dms.to(OWNER);
    expect(told).toHaveLength(2);
    const text = textOf(told[1]);
    expect(text).toContain('A server’s data deleted');
    expect(text).toContain(FIRST);
    expect(text).toContain(`the folder \`${FIRST}/\``);
    // Its kept screenshots went at this sweep.
    expect(text).not.toContain('still being removed');
    // Told once.
    made.clock.now += DAY;
    await made.deletion.sweep();
    expect(made.dms.to(OWNER)).toHaveLength(2);
  });

  it('tells the owner once a sweep that deleted something, by the servers’ ids and their count', async () => {
    const { deletion, dms, clock } = deletionWith();
    await deletion.sweep();
    expect(dms.recipients).toEqual([OWNER]);
    expect(dms.serversOf(OWNER)).toEqual([null]);
    const text = textOf(dms.to(OWNER)[0]);
    expect(text).toContain('2 servers');
    expect(text).toContain(FIRST);
    expect(text).toContain(SECOND);
    expect(text).not.toContain(RECENT);
    // The next day nothing is due: nobody is told.
    clock.now += DAY;
    expect(await deletion.sweep()).toEqual([]);
    expect(dms.jobs).toHaveLength(1);
  });

  it('sweeps at most once a day, the first time when asked first', async () => {
    const { deletion, data, clock } = deletionWith();
    await deletion.sweep();
    // RECENT is due now, but the day is not over.
    clock.now = NOW + DAY - 1;
    expect(await deletion.sweep()).toEqual([]);
    clock.now = NOW + 21 * DAY;
    expect(await deletion.sweep()).toEqual([RECENT]);
    expect(data.asked).toEqual([FIRST, SECOND, RECENT]);
  });

  it('stops a server’s deletion at a failure and goes on with it at the next sweep', async () => {
    const { deletion, store, data, dms, entries, clock } = deletionWith();
    data.failing.set(FIRST, new Error('the database went away'));
    expect(await deletion.sweep()).toEqual([SECOND]);
    expect(store.rows.get(FIRST)).toMatchObject({ deletingAt: NOW, deletedAt: null });
    expect(
      entries.some(
        (entry) =>
          entry.msg === 'could not delete the data of a server Pine left: the next sweep goes on' &&
          entry.server === FIRST,
      ),
    ).toBe(true);
    expect(textOf(dms.to(OWNER)[0])).not.toContain(FIRST);
    data.failing.clear();
    clock.now += DAY;
    expect(await deletion.sweep()).toEqual([FIRST]);
    expect(store.rows.get(FIRST)).toMatchObject({ deletingAt: null, deletedAt: NOW + DAY });
  });

  it('notes kept screenshots it could not remove without holding the record, and tries them at each sweep until removed', async () => {
    const { deletion, standings, store, shots, forgotten, entries, clock } = deletionWith();
    shots.failed = 1;
    expect(await deletion.sweep()).toEqual([FIRST, SECOND]);
    // Deleted, and forgotten: only the files are left, noted in the record.
    expect(store.rows.get(FIRST)).toMatchObject({
      deletingAt: null,
      deletedAt: NOW,
      filesLeftAt: NOW,
    });
    expect(forgotten.map((one) => one.serverId)).toEqual([FIRST, SECOND]);
    expect(standings.pending(FIRST)).toBe(false);
    expect(
      entries.filter(
        (entry) =>
          entry.msg ===
          'could not remove the kept screenshots of a deleted server: the next sweep tries again',
      ),
    ).toMatchObject([{ server: FIRST }, { server: SECOND }]);
    clock.now += DAY;
    await deletion.sweep();
    expect(shots.asked).toEqual([FIRST, SECOND, FIRST, SECOND]);
    expect(store.rows.get(FIRST)?.filesLeftAt).toBe(NOW);
    shots.failed = 0;
    clock.now += DAY;
    expect(await deletion.sweep()).toEqual([]);
    // Up to the end of that deletion, each time.
    expect(shots.upTo).toEqual([NOW, NOW, NOW, NOW, NOW, NOW]);
    expect(store.rows.get(FIRST)?.filesLeftAt).toBeNull();
    expect(store.rows.get(SECOND)?.filesLeftAt).toBeNull();
    clock.now += DAY;
    await deletion.sweep();
    expect(shots.asked).toHaveLength(6);
  });

  describe('a deletion that keeps failing', () => {
    const failing = () =>
      deletionWith([serverRecordRow({ serverId: FIRST, leftAt: NOW - 40 * DAY })]);
    /** The owner's DMs that a deletion keeps failing. */
    const failingTold = (dms: RecordingDms) =>
      dms
        .to(OWNER)
        .map(textOf)
        .filter((text) => text.includes('could not be deleted'));
    const sweepOn = async (made: ReturnType<typeof failing>, day: number) => {
      made.clock.now = NOW + day * DAY;
      await made.deletion.sweep();
    };

    it('tells the owner once, after the third sweep running, by the server’s id and what failed', async () => {
      const made = failing();
      made.data.failing.set(FIRST, new Error('the database went away'));
      await sweepOn(made, 0);
      await sweepOn(made, 1);
      expect(made.dms.jobs).toEqual([]);
      await sweepOn(made, 2);
      expect(made.dms.recipients).toEqual([OWNER]);
      expect(made.dms.serversOf(OWNER)).toEqual([null]);
      const told = failingTold(made.dms);
      expect(told).toHaveLength(1);
      expect(told[0]).toContain(`${FIRST} · database`);
      // A fourth and a fifth: told once.
      await sweepOn(made, 3);
      await sweepOn(made, 4);
      expect(failingTold(made.dms)).toHaveLength(1);
    });

    it('counts a present server whose unfinished deletion fails at each sweep, and tells the owner after the third', async () => {
      const made = deletionWith([
        serverRecordRow({
          serverId: FIRST,
          recordedAt: 1,
          leftAt: NOW - 40 * DAY,
          deletingAt: NOW - DAY,
        }),
      ]);
      // Pine is in it again: each sweep takes it back, and its finish fails.
      made.present.add(FIRST);
      made.data.failing.set(FIRST, new Error('the database went away'));
      await sweepOn(made, 0);
      await sweepOn(made, 1);
      expect(failingTold(made.dms)).toEqual([]);
      await sweepOn(made, 2);
      const told = failingTold(made.dms);
      expect(told).toHaveLength(1);
      expect(told[0]).toContain(`${FIRST} · database`);
      // Tried once per sweep, in the sweep's own path; still left, its deletion begun.
      expect(made.data.asked).toEqual([FIRST, FIRST, FIRST]);
      expect(made.standings.isLeft(FIRST)).toBe(true);
      expect(made.store.rows.get(FIRST)).toMatchObject({ deletingAt: NOW - DAY, deletedAt: null });
      expect(
        made.entries.filter(
          (entry) =>
            entry.msg === 'could not delete the data of a server Pine left: the next sweep goes on',
        ),
      ).toHaveLength(3);
    });

    it('tells the owner again only after the deletion succeeded and failed anew', async () => {
      const made = failing();
      made.data.failing.set(FIRST, new Error('the database went away'));
      for (const day of [0, 1, 2]) await sweepOn(made, day);
      made.data.failing.clear();
      await sweepOn(made, 3);
      expect(made.store.rows.get(FIRST)?.deletedAt).toBe(NOW + 3 * DAY);
      // Added back, left again, and 30 days later its deletion fails anew: at the kept screenshots.
      await made.standings.cameBack([FIRST]);
      made.clock.now = NOW + 4 * DAY;
      await made.standings.markLeft([FIRST]);
      made.shots.failed = 1;
      for (const day of [35, 36]) await sweepOn(made, day);
      expect(failingTold(made.dms)).toHaveLength(1);
      await sweepOn(made, 37);
      const told = failingTold(made.dms);
      expect(told).toHaveLength(2);
      expect(told[1]).toContain(`${FIRST} · screenshots`);
    });

    it('counts sweeps in a row: a deletion its return finished, or a restart, starts the count again', async () => {
      const made = failing();
      made.data.failing.set(FIRST, new Error('the database went away'));
      await sweepOn(made, 0);
      await sweepOn(made, 1);
      // Added back before the third sweep: its return finishes the deletion.
      made.data.failing.clear();
      await made.standings.cameBack([FIRST]);
      expect(await made.standings.settled(FIRST)).toBe(true);
      made.clock.now = NOW + 2 * DAY;
      await made.standings.markLeft([FIRST]);
      made.data.failing.set(FIRST, new Error('the database went away'));
      await sweepOn(made, 33);
      await sweepOn(made, 34);
      expect(failingTold(made.dms)).toEqual([]);
      // A restart: counted in memory, the count starts again.
      const again = new ServerDeletion({
        standings: made.standings,
        data: made.data,
        screenshots: { forgetServer: () => Promise.resolve({ removed: 0, failed: 0 }) },
        forget: () => Promise.resolve(),
        present: () => false,
        dms: made.dms,
        ownerId: OWNER,
        log: createTestLogger().log,
        now: () => made.clock.now,
      });
      for (const day of [35, 36]) {
        made.clock.now = NOW + day * DAY;
        await again.sweep();
      }
      expect(failingTold(made.dms)).toEqual([]);
      made.clock.now = NOW + 37 * DAY;
      await again.sweep();
      expect(failingTold(made.dms)).toHaveLength(1);
    });
  });

  it('stops at the shutdown, and the next start goes on', async () => {
    const { deletion, store, entries } = deletionWith();
    expect(await deletion.sweep({ isStopped: () => true })).toEqual([]);
    expect(store.rows.get(FIRST)?.deletedAt).toBeNull();
    expect(entries.some((entry) => Number(entry.level) >= 50)).toBe(false);
  });

  it('finishes a deletion cut short for a server added back, with the same work', async () => {
    const { deletion, standings, store, data, forgotten } = deletionWith();
    data.failing.set(FIRST, new Error('the database went away'));
    await deletion.sweep();
    data.failing.clear();
    await standings.cameBack([FIRST]);
    expect(await standings.settled(FIRST)).toBe(true);
    expect(data.asked).toEqual([FIRST, SECOND, FIRST]);
    expect(forgotten.map((one) => one.serverId)).toEqual([SECOND, FIRST]);
    // Back, its deletion on record: it starts in setup (`setUpOnRecord`).
    expect(store.rows.get(FIRST)).toMatchObject({
      leftAt: null,
      deletingAt: null,
      deletedAt: NOW,
    });
  });
});
