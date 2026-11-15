import type {
  ServerSettingsAuditStore,
  SettingsAuditRecord,
  SettingsAuditRow,
} from '../../src/db/repositories/server-settings-audit-repository.js';

/**
 * The staff's log of a server's settings in memory: the twin of `ServerSettingsAuditRepository`,
 * both running `serverSettingsAuditCases`. `rows` holds what was written; `failing` makes the
 * named method reject.
 */
export class MemoryServerSettingsAudit implements ServerSettingsAuditStore {
  readonly rows: SettingsAuditRecord[] = [];
  readonly failing = new Map<keyof ServerSettingsAuditStore, Error>();
  private nextId = 1;

  private fail(method: keyof ServerSettingsAuditStore): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  async insert(rows: readonly SettingsAuditRow[]): Promise<void> {
    this.fail('insert');
    for (const row of rows) {
      this.rows.push({ ...structuredClone(row), id: String(this.nextId++) });
    }
    return Promise.resolve();
  }

  async ofServer(serverId: string, limit: number): Promise<SettingsAuditRecord[]> {
    this.fail('ofServer');
    return Promise.resolve(
      newest(
        this.rows.filter((row) => row.serverId === serverId),
        limit,
      ),
    );
  }

  async ofMember(
    serverId: string,
    memberId: string,
    limit: number,
  ): Promise<SettingsAuditRecord[]> {
    this.fail('ofMember');
    const rows = this.rows.filter((row) => row.serverId === serverId && row.actor.id === memberId);
    return Promise.resolve(newest(rows, limit));
  }

  async deleteBefore(at: number): Promise<number> {
    this.fail('deleteBefore');
    const kept = this.rows.filter((row) => row.at >= at);
    const gone = this.rows.length - kept.length;
    this.rows.splice(0, this.rows.length, ...kept);
    return Promise.resolve(gone);
  }
}

/** The newest `limit`, oldest first: by time, then by the order written. */
function newest(rows: readonly SettingsAuditRecord[], limit: number): SettingsAuditRecord[] {
  return [...rows]
    .sort((a, b) => a.at - b.at || Number(a.id) - Number(b.id))
    .slice(-limit)
    .map((row) => structuredClone(row));
}
