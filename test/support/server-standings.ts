import type { Settings } from '../../src/config/settings.js';
import type {
  ServerRecordStorage,
  StoredServerRecord,
} from '../../src/db/repositories/server-record-repository.js';
import type { Logger } from '../../src/log.js';
import { ServerStandings } from '../../src/services/server-standings.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { OTHER_GUILD_ID } from './gyms.js';
import type { HeldCall } from './held-call.js';
import { createTestLogger } from './test-logger.js';

const blank = (serverId: string): StoredServerRecord => ({
  serverId,
  recordedAt: null,
  allowedAt: null,
  allowedBy: null,
  blockedAt: null,
  blockedBy: null,
  leftAt: null,
});

/**
 * The twin of `ServerRecordRepository` (plan 19C-1), running `serverRecordCases`: `rows` by
 * server, `guilds` the servers that have a `Guild` row (those Pine was in: `markLeft` marks only
 * them), `failing` per method, `markLeftHeld` a write of `markLeft` held on its way (`heldCall`).
 */
export class MemoryServerRecords implements ServerRecordStorage {
  readonly rows = new Map<string, StoredServerRecord>();
  readonly guilds: Set<string>;
  readonly failing = new Map<keyof ServerRecordStorage, Error>();
  /** Where set, `markLeft` arrives at it and writes only once the test releases it. */
  markLeftHeld: HeldCall | undefined;

  constructor(rows: readonly StoredServerRecord[] = [], guilds: readonly string[] = []) {
    for (const row of rows) this.rows.set(row.serverId, { ...row });
    this.guilds = new Set(guilds);
  }

  private fails(method: keyof ServerRecordStorage): Promise<never> | undefined {
    const err = this.failing.get(method);
    return err ? Promise.reject(err) : undefined;
  }

  private sorted(rows: Iterable<StoredServerRecord>): StoredServerRecord[] {
    return [...rows]
      .sort((a, b) => a.serverId.localeCompare(b.serverId))
      .map((row) => ({ ...row }));
  }

  all(): Promise<StoredServerRecord[]> {
    return this.fails('all') ?? Promise.resolve(this.sorted(this.rows.values()));
  }

  async markLeft(serverIds: readonly string[], at: number): Promise<StoredServerRecord[]> {
    if (this.markLeftHeld) {
      this.markLeftHeld.arrive();
      await this.markLeftHeld.released;
    }
    const failed = this.fails('markLeft');
    if (failed) return failed;
    const marked = new Map<string, StoredServerRecord>();
    for (const serverId of serverIds) {
      if (!this.guilds.has(serverId)) continue;
      const row = this.rows.get(serverId) ?? blank(serverId);
      row.leftAt ??= at;
      this.rows.set(serverId, row);
      marked.set(serverId, row);
    }
    return this.sorted(marked.values());
  }

  cameBack(serverIds: readonly string[]): Promise<void> {
    const failed = this.fails('cameBack');
    if (failed) return failed;
    for (const serverId of serverIds) {
      const row = this.rows.get(serverId);
      if (row) row.leftAt = null;
    }
    return Promise.resolve();
  }

  record(serverIds: readonly string[], at: number): Promise<void> {
    const failed = this.fails('record');
    if (failed) return failed;
    for (const serverId of serverIds) {
      const row = this.rows.get(serverId) ?? blank(serverId);
      row.recordedAt ??= at;
      this.rows.set(serverId, row);
    }
    return Promise.resolve();
  }

  allow(serverId: string, at: number, by: string): Promise<void> {
    const failed = this.fails('allow');
    if (failed) return failed;
    this.rows.set(serverId, {
      ...(this.rows.get(serverId) ?? blank(serverId)),
      allowedAt: at,
      allowedBy: by,
    });
    return Promise.resolve();
  }

  block(serverId: string, at: number, by: string): Promise<void> {
    const failed = this.fails('block');
    if (failed) return failed;
    this.rows.set(serverId, {
      ...(this.rows.get(serverId) ?? blank(serverId)),
      blockedAt: at,
      blockedBy: by,
    });
    return Promise.resolve();
  }

  unblock(serverId: string): Promise<void> {
    const failed = this.fails('unblock');
    if (failed) return failed;
    const row = this.rows.get(serverId);
    if (row) {
      row.blockedAt = null;
      row.blockedBy = null;
    }
    return Promise.resolve();
  }
}

/** When the test servers were recorded at the upgrade (plan 19C-1). */
export const RECORDED_AT = Date.parse('2026-11-12T12:00:00Z');

/**
 * The standings of a test (plan 19C-1): a real `ServerStandings` over `MemoryServerRecords`
 * (`store`), the servers of `recorded` recorded at the upgrade and had a `Guild` row (by default
 * the test server and the second one, `FAKE_GUILD_ID` and `OTHER_GUILD_ID`, as on an instance
 * that was upgraded with both: every test before plan 19C-1 reads them so), `rows` more, the
 * file's `servers` as given (unset by default).
 */
export function standingsWith(
  options: {
    recorded?: readonly string[];
    rows?: readonly StoredServerRecord[];
    servers?: Settings['servers'];
    log?: Logger;
    now?: () => number;
  } = {},
): { standings: ServerStandings; store: MemoryServerRecords } {
  const recorded = options.recorded ?? [FAKE_GUILD_ID, OTHER_GUILD_ID];
  const rows = [
    ...recorded.map((serverId) => ({ ...blank(serverId), recordedAt: RECORDED_AT })),
    ...(options.rows ?? []),
  ];
  const store = new MemoryServerRecords(rows, recorded);
  const standings = new ServerStandings({
    store,
    settings: { servers: options.servers },
    log: options.log ?? createTestLogger().log,
    rows,
    ...(options.now ? { now: options.now } : {}),
  });
  return { standings, store };
}
