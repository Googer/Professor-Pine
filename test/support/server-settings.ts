import type {
  ServerSettingsStorage,
  StoredServer,
} from '../../src/db/repositories/server-settings-repository.js';

/**
 * The servers' settings in memory (`ServerSettingsStorage`), the twin of
 * `ServerSettingsRepository`: `rows` by server, `failing` per method.
 */
export class MemoryServerSettings implements ServerSettingsStorage {
  readonly rows = new Map<string, StoredServer>();
  readonly failing = new Map<keyof ServerSettingsStorage, Error>();

  constructor(rows: readonly StoredServer[] = []) {
    for (const row of rows) this.rows.set(row.serverId, structuredClone(row));
  }

  all(): Promise<StoredServer[]> {
    const err = this.failing.get('all');
    if (err) return Promise.reject(err);
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.serverId.localeCompare(b.serverId))
        .map((row) => structuredClone(row)),
    );
  }

  one(serverId: string): Promise<StoredServer | undefined> {
    const err = this.failing.get('one');
    if (err) return Promise.reject(err);
    const row = this.rows.get(serverId);
    return Promise.resolve(row === undefined ? undefined : structuredClone(row));
  }

  create(row: StoredServer): Promise<boolean> {
    const err = this.failing.get('create');
    if (err) return Promise.reject(err);
    if (this.rows.has(row.serverId)) return Promise.resolve(false);
    this.rows.set(row.serverId, structuredClone(row));
    return Promise.resolve(true);
  }

  write(serverId: string, settings: unknown, at: number, by: string): Promise<void> {
    const err = this.failing.get('write');
    if (err) return Promise.reject(err);
    const kept = this.rows.get(serverId);
    this.rows.set(serverId, {
      serverId,
      settings: structuredClone(settings),
      setUpAt: kept?.setUpAt ?? null,
      updatedAt: at,
      updatedBy: by,
    });
    return Promise.resolve();
  }
}
