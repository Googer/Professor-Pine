import {
  AUDIT_POST_READ_LIMIT,
  type AuditRecord,
  type AuditRow,
  type PartyAuditStore,
} from '../../src/db/repositories/party-audit-repository.js';

/**
 * The staff audit log in memory: the twin of `PartyAuditRepository`, both running
 * `partyAuditCases`. `rows` holds what was written; `failing` makes the named method reject.
 */
export class MemoryPartyAudit implements PartyAuditStore {
  readonly rows: AuditRecord[] = [];
  readonly failing = new Map<keyof PartyAuditStore, Error>();
  private nextId = 1;

  private fail(method: keyof PartyAuditStore): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  async insert(rows: readonly AuditRow[]): Promise<void> {
    this.fail('insert');
    for (const row of rows) this.rows.push({ ...row, id: String(this.nextId++) });
    return Promise.resolve();
  }

  async attachPost(partyId: string, postId: string): Promise<void> {
    this.fail('attachPost');
    for (const [n, row] of this.rows.entries()) {
      if (row.partyId === partyId && row.postId === null) this.rows[n] = { ...row, postId };
    }
    return Promise.resolve();
  }

  async ofPost(serverId: string, postId: string): Promise<AuditRecord[]> {
    this.fail('ofPost');
    const ofServer = this.rows.filter((row) => row.serverId === serverId);
    const parties = new Set(ofServer.filter((row) => row.postId === postId).map((r) => r.partyId));
    for (let grown = true; grown;) {
      grown = false;
      for (const row of ofServer) {
        const { entry } = row;
        if (parties.has(row.partyId) && entry.action === 'moved' && !parties.has(entry.fromParty)) {
          parties.add(entry.fromParty);
          grown = true;
        }
      }
    }
    return Promise.resolve(
      newest(ofServer.filter((row) => parties.has(row.partyId))).slice(-AUDIT_POST_READ_LIMIT),
    );
  }

  async ofMember(serverId: string, memberId: string, limit: number): Promise<AuditRecord[]> {
    this.fail('ofMember');
    const rows = this.rows.filter((row) => row.serverId === serverId && row.actor?.id === memberId);
    return Promise.resolve(newest(rows).slice(-limit));
  }

  async deleteBefore(at: number): Promise<number> {
    this.fail('deleteBefore');
    const kept = this.rows.filter((row) => row.at >= at);
    const gone = this.rows.length - kept.length;
    this.rows.splice(0, this.rows.length, ...kept);
    return Promise.resolve(gone);
  }
}

/** Oldest first, by time and then by the order written. */
function newest(rows: readonly AuditRecord[]): AuditRecord[] {
  return [...rows].sort((a, b) => a.at - b.at || Number(a.id) - Number(b.id));
}
