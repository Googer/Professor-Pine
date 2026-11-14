import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ServerRecordStorage,
  StoredServerRecord,
} from '../../src/db/repositories/server-record-repository.js';

/** A server Pine had a `Guild` row of (it was in it). */
export const STANDING_SERVER = '412345678901234567';
/** Another server Pine was in. */
export const OTHER_STANDING_SERVER = '412345678901234568';
/** A server Pine was never in: it has no `Guild` row. */
export const NEVER_THERE = '412345678901234569';
export const STANDING_OPERATOR = '323456789012345678';
export const STANDING_NOW = Date.parse('2026-11-13T15:00:00Z');
const DAY = 24 * 3_600_000;

/** A row that says nothing yet but its server. */
export function serverRecordRow(overrides: Partial<StoredServerRecord> = {}): StoredServerRecord {
  return {
    serverId: STANDING_SERVER,
    recordedAt: null,
    allowedAt: null,
    allowedBy: null,
    blockedAt: null,
    blockedBy: null,
    leftAt: null,
    deletingAt: null,
    deletedAt: null,
    filesLeftAt: null,
    ...overrides,
  };
}

/**
 * What every `ServerRecordStorage` does (`ServerRecordRepository`,
 * `MemoryServerRecords`): `fresh` gives one that keeps the rows given, where the servers of
 * `guilds` have a `Guild` row.
 */
export function serverRecordCases(
  fresh: (options: {
    rows?: readonly StoredServerRecord[];
    guilds?: readonly string[];
  }) => Promise<ServerRecordStorage>,
): void {
  describe('ServerRecordStorage', () => {
    let store: ServerRecordStorage;
    beforeEach(async () => {
      store = await fresh({});
    });

    it('keeps no server until one is written', async () => {
      expect(await store.all()).toEqual([]);
    });

    it('marks left only a server Pine was in, keeping when it first left', async () => {
      store = await fresh({
        rows: [serverRecordRow({ recordedAt: STANDING_NOW - 60_000 })],
        guilds: [STANDING_SERVER, OTHER_STANDING_SERVER],
      });
      const marked = await store.markLeft(
        [STANDING_SERVER, OTHER_STANDING_SERVER, NEVER_THERE],
        STANDING_NOW,
      );
      const recorded = serverRecordRow({ recordedAt: STANDING_NOW - 60_000, leftAt: STANDING_NOW });
      const other = serverRecordRow({ serverId: OTHER_STANDING_SERVER, leftAt: STANDING_NOW });
      expect(marked).toEqual([recorded, other]);
      // Marked again later (a ready after its removal): still left since the first time.
      expect(await store.markLeft([STANDING_SERVER], STANDING_NOW + 60_000)).toEqual([recorded]);
      expect(await store.all()).toEqual([recorded, other]);
      expect(await store.markLeft([], STANDING_NOW)).toEqual([]);
    });

    it('takes back that a server left when it is present again, and nothing else', async () => {
      store = await fresh({
        rows: [
          serverRecordRow({ recordedAt: STANDING_NOW, leftAt: STANDING_NOW }),
          serverRecordRow({ serverId: OTHER_STANDING_SERVER, leftAt: STANDING_NOW }),
        ],
      });
      await store.cameBack([STANDING_SERVER, NEVER_THERE]);
      await store.cameBack([]);
      expect(await store.all()).toEqual([
        serverRecordRow({ recordedAt: STANDING_NOW }),
        serverRecordRow({ serverId: OTHER_STANDING_SERVER, leftAt: STANDING_NOW }),
      ]);
    });

    it('takes a server whose data was deleted back, keeping when it was deleted (plan 19C-3)', async () => {
      store = await fresh({
        rows: [
          serverRecordRow({
            recordedAt: STANDING_NOW,
            leftAt: STANDING_NOW - 40 * DAY,
            deletedAt: STANDING_NOW,
          }),
        ],
      });
      await store.cameBack([STANDING_SERVER]);
      expect(await store.all()).toEqual([
        serverRecordRow({ recordedAt: STANDING_NOW, deletedAt: STANDING_NOW }),
      ]);
    });

    it('records when a deletion began, keeping the first time, and when it ended (plan 19C-3)', async () => {
      const left = STANDING_NOW - 40 * DAY;
      store = await fresh({ rows: [serverRecordRow({ recordedAt: left, leftAt: left })] });
      await store.markDeleting(STANDING_SERVER, STANDING_NOW);
      // Begun again after a failure: it began the first time.
      await store.markDeleting(STANDING_SERVER, STANDING_NOW + 1);
      await store.markDeleting(NEVER_THERE, STANDING_NOW);
      expect(await store.all()).toEqual([
        serverRecordRow({ recordedAt: left, leftAt: left, deletingAt: STANDING_NOW }),
      ]);
      await store.markDeleted(STANDING_SERVER, STANDING_NOW + 2);
      await store.markDeleted(NEVER_THERE, STANDING_NOW + 2);
      // Its record stays, left, with what an operator said of it; its kept screenshots up to the
      // end are left to remove.
      const deleted = serverRecordRow({
        recordedAt: left,
        leftAt: left,
        deletedAt: STANDING_NOW + 2,
        filesLeftAt: STANDING_NOW + 2,
      });
      expect(await store.all()).toEqual([deleted]);
      // Removed: only the files of that deletion are forgotten.
      await store.filesRemoved(STANDING_SERVER, STANDING_NOW + 1);
      expect(await store.all()).toEqual([deleted]);
      await store.filesRemoved(STANDING_SERVER, STANDING_NOW + 2);
      await store.filesRemoved(NEVER_THERE, STANDING_NOW + 2);
      expect(await store.all()).toEqual([{ ...deleted, filesLeftAt: null }]);
    });

    it('marks a deleted server left anew though its return was never written (plan 19C-3)', async () => {
      const left = STANDING_NOW - 40 * DAY;
      store = await fresh({
        rows: [
          // Deleted, then added back, its return's write failed: still left since before.
          serverRecordRow({ recordedAt: left, leftAt: left, deletedAt: left + 31 * DAY }),
          // Deleted, back, and left again since: left since then.
          serverRecordRow({
            serverId: OTHER_STANDING_SERVER,
            leftAt: STANDING_NOW - DAY,
            deletedAt: left + 31 * DAY,
          }),
        ],
        guilds: [STANDING_SERVER, OTHER_STANDING_SERVER],
      });
      expect(await store.markLeft([STANDING_SERVER, OTHER_STANDING_SERVER], STANDING_NOW)).toEqual([
        serverRecordRow({ recordedAt: left, leftAt: STANDING_NOW, deletedAt: left + 31 * DAY }),
        serverRecordRow({
          serverId: OTHER_STANDING_SERVER,
          leftAt: STANDING_NOW - DAY,
          deletedAt: left + 31 * DAY,
        }),
      ]);
    });

    it('records the servers a new install adopts, keeping a time recorded already', async () => {
      store = await fresh({
        rows: [
          serverRecordRow({ recordedAt: STANDING_NOW - 60_000 }),
          serverRecordRow({ serverId: OTHER_STANDING_SERVER, blockedAt: STANDING_NOW }),
        ],
      });
      await store.record([STANDING_SERVER, OTHER_STANDING_SERVER, NEVER_THERE], STANDING_NOW);
      await store.record([], STANDING_NOW);
      expect(await store.all()).toEqual([
        serverRecordRow({ recordedAt: STANDING_NOW - 60_000 }),
        serverRecordRow({
          serverId: OTHER_STANDING_SERVER,
          recordedAt: STANDING_NOW,
          blockedAt: STANDING_NOW,
        }),
        serverRecordRow({ serverId: NEVER_THERE, recordedAt: STANDING_NOW }),
      ]);
    });

    it('records an operator’s allowance and block, and a block taken back', async () => {
      store = await fresh({ rows: [serverRecordRow({ recordedAt: STANDING_NOW })] });
      await store.allow(NEVER_THERE, STANDING_NOW, STANDING_OPERATOR);
      await store.block(STANDING_SERVER, STANDING_NOW + 1, STANDING_OPERATOR);
      expect(await store.all()).toEqual([
        serverRecordRow({
          recordedAt: STANDING_NOW,
          blockedAt: STANDING_NOW + 1,
          blockedBy: STANDING_OPERATOR,
        }),
        serverRecordRow({
          serverId: NEVER_THERE,
          allowedAt: STANDING_NOW,
          allowedBy: STANDING_OPERATOR,
        }),
      ]);
      // Allowed again: the latest allowance is kept.
      await store.allow(NEVER_THERE, STANDING_NOW + 2, STANDING_OPERATOR);
      await store.unblock(STANDING_SERVER);
      await store.unblock(OTHER_STANDING_SERVER);
      expect(await store.all()).toEqual([
        serverRecordRow({ recordedAt: STANDING_NOW }),
        serverRecordRow({
          serverId: NEVER_THERE,
          allowedAt: STANDING_NOW + 2,
          allowedBy: STANDING_OPERATOR,
        }),
      ]);
    });
  });
}
