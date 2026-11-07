import type { HistoryOptIns } from '../../src/db/repositories/history-repository.js';
import type {
  FillInAsked,
  FillInState,
  LegacyFillIns,
} from '../../src/db/repositories/legacy-fill-in-repository.js';
import type { LegacyIndex } from '../../src/services/legacy-fill-in.js';

/** Like a real query, the answer never comes in the same turn of the event loop. */
function later<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve(work());
    });
  });
}

/**
 * The requests of legacy fill-ins in memory, as `LegacyFillInRepository` keeps them
 * (`legacy-fill-in-repository.db.test.ts` pins that down): one per member and server, made only
 * where `optIns` says the member's history is on there (everyone without it); a failed one is
 * asked again (A1); an opt-out of `optIns` deletes the member's request of that server, as the
 * repository's does (where `optIns` is a `MemoryHistoryOptIns`). `ended` sets how a request
 * ended, as the worker would.
 */
export class MemoryLegacyFillIns implements LegacyFillIns {
  readonly rows = new Map<string, FillInState>();

  constructor(
    private readonly optIns?: Pick<HistoryOptIns, 'isOptedIn'> & {
      alsoForget?: ((memberId: string, guildId: string) => void)[];
    },
  ) {
    optIns?.alsoForget?.push((memberId, guildId) => {
      this.rows.delete(`${guildId}:${memberId}`);
    });
  }

  async request(memberId: string, serverId: string, _now: number): Promise<FillInAsked> {
    const on = this.optIns === undefined || (await this.optIns.isOptedIn(memberId, serverId));
    return later(() => {
      const key = `${serverId}:${memberId}`;
      if (!on) return 'off';
      const was = this.rows.get(key);
      if (was !== undefined && was.state !== 'failed') return 'asked';
      this.rows.set(key, { state: 'queued' });
      return 'queued';
    });
  }

  stateOf(memberId: string, serverId: string): Promise<FillInState | undefined> {
    return later(() => this.rows.get(`${serverId}:${memberId}`));
  }

  /** The member's request of the server ended so (or stands queued). */
  ended(memberId: string, serverId: string, state: FillInState): void {
    this.rows.set(`${serverId}:${memberId}`, state);
  }
}

/**
 * The member index and its worker as `/settings` sees them (`LegacyFillInService`): who has a
 * file of which server (`add`), which servers have an index (those of a file, and `addServer`),
 * and how often a run was started (`kicks`).
 */
export class MemoryLegacyIndex implements LegacyIndex {
  readonly files = new Set<string>();
  readonly servers = new Set<string>();
  kicks = 0;

  add(memberId: string, serverId: string): void {
    this.files.add(`${serverId}:${memberId}`);
    this.servers.add(serverId);
  }

  addServer(serverId: string): void {
    this.servers.add(serverId);
  }

  hasFile(memberId: string, serverId: string): Promise<boolean> {
    return later(() => this.files.has(`${serverId}:${memberId}`));
  }

  hasServer(serverId: string): Promise<boolean> {
    return later(() => this.servers.has(serverId));
  }

  kick(): void {
    this.kicks += 1;
  }
}
