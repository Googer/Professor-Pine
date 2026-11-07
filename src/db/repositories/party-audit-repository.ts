import type { Kysely } from 'kysely';
import {
  auditDetail,
  auditEntryOf,
  type AuditEntry,
  type LoggedMember,
} from '../../domain/party/audit.js';
import type { Logger } from '../../log.js';
import type { DB } from '../types.js';

/** An entry of the staff audit log as it is written (`PartyAudit`, migration 045). */
export interface AuditRow {
  /** The server's snowflake. */
  serverId: string;
  partyId: string;
  /** The post the party had then; null before it had one (`attachPost` gives it later). */
  postId: string | null;
  at: number;
  /** Who made the change; null for Pine itself (the clock, a feed). */
  actor: LoggedMember | null;
  entry: AuditEntry;
}

/** An entry as it is read back. */
export interface AuditRecord extends AuditRow {
  id: string;
}

/** At most this many entries of a post are read (the newest): 30 days of one post are far fewer. */
export const AUDIT_POST_READ_LIMIT = 1_000;

/** How many parties back a post's log follows moves from other regions. */
const MOVES_FOLLOWED = 10;

/** What `/audit` reads of the log. */
export interface PartyAuditReader {
  /**
   * The entries of a post, oldest first: of every party that had it (an ended one too), and of
   * the parties a raid there moved from (`moved`'s `fromParty`, followed back); at most
   * `AUDIT_POST_READ_LIMIT`, the newest.
   */
  ofPost(serverId: string, postId: string): Promise<AuditRecord[]>;
  /** A member's newest `limit` entries in a server, oldest first. */
  ofMember(serverId: string, memberId: string, limit: number): Promise<AuditRecord[]>;
}

/**
 * The staff audit log (`PartyAudit`): written by `PartyAudit` (`src/services/party-audit.ts`),
 * read by `/audit`. Twin `MemoryPartyAudit` (`test/support/party-audit.ts`); both run
 * `partyAuditCases` (`test/support/party-audit-cases.ts`).
 */
export interface PartyAuditStore extends PartyAuditReader {
  insert(rows: readonly AuditRow[]): Promise<void>;
  /** Gives a party's entries written before it had a post (`postId` null) this post. */
  attachPost(partyId: string, postId: string): Promise<void>;
  /** Deletes the entries written before `at`; gives how many. */
  deleteBefore(at: number): Promise<number>;
}

type Row = {
  id: string;
  serverId: string;
  partyId: string;
  postId: string | null;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  detail: unknown;
};

/** The `PartyAudit` table. */
export class PartyAuditRepository implements PartyAuditStore {
  /** `log` hears of a row that cannot be read (left out). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly log?: Logger,
  ) {}

  async insert(rows: readonly AuditRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insertInto('PartyAudit')
      .values(
        rows.map((row) => {
          const detail = auditDetail(row.entry);
          return {
            serverId: row.serverId,
            partyId: row.partyId,
            postId: row.postId,
            at: String(row.at),
            actorId: row.actor?.id ?? null,
            actorName: row.actor?.name ?? null,
            action: row.entry.action,
            detail: detail === null ? null : JSON.stringify(detail),
          };
        }),
      )
      .execute();
  }

  async attachPost(partyId: string, postId: string): Promise<void> {
    await this.db
      .updateTable('PartyAudit')
      .set({ postId })
      .where('partyId', '=', partyId)
      .where('postId', 'is', null)
      .execute();
  }

  async ofPost(serverId: string, postId: string): Promise<AuditRecord[]> {
    const found = await this.db
      .selectFrom('PartyAudit')
      .select('partyId')
      .distinct()
      .where('serverId', '=', serverId)
      .where('postId', '=', postId)
      .execute();
    const parties = new Set(found.map((row) => row.partyId));
    let asked = [...parties];
    for (let step = 0; step < MOVES_FOLLOWED && asked.length > 0; step++) {
      const moves = await this.db
        .selectFrom('PartyAudit')
        .select(['action', 'detail'])
        .where('serverId', '=', serverId)
        .where('partyId', 'in', asked)
        .where('action', '=', 'moved')
        .execute();
      asked = [];
      for (const move of moves) {
        const entry = auditEntryOf(move.action, parsed(move.detail));
        if (entry?.action === 'moved' && !parties.has(entry.fromParty)) {
          parties.add(entry.fromParty);
          asked.push(entry.fromParty);
        }
      }
    }
    if (parties.size === 0) return [];
    const rows = await this.db
      .selectFrom('PartyAudit')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('partyId', 'in', [...parties])
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .limit(AUDIT_POST_READ_LIMIT)
      .execute();
    return this.records(rows).reverse();
  }

  async ofMember(serverId: string, memberId: string, limit: number): Promise<AuditRecord[]> {
    const rows = await this.db
      .selectFrom('PartyAudit')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('actorId', '=', memberId)
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
    return this.records(rows).reverse();
  }

  async deleteBefore(at: number): Promise<number> {
    const result = await this.db
      .deleteFrom('PartyAudit')
      .where('at', '<', String(at))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  private records(rows: readonly Row[]): AuditRecord[] {
    const records: AuditRecord[] = [];
    for (const row of rows) {
      const entry = auditEntryOf(row.action, parsed(row.detail));
      if (entry === undefined) {
        this.log?.warn({ entry: row.id, action: row.action }, 'an audit entry cannot be read');
        continue;
      }
      const actor: LoggedMember | null =
        row.actorId === null
          ? null
          : row.actorName === null
            ? { id: row.actorId }
            : { id: row.actorId, name: row.actorName };
      records.push({
        id: row.id,
        serverId: row.serverId,
        partyId: row.partyId,
        postId: row.postId,
        at: Number(row.at),
        actor,
        entry,
      });
    }
    return records;
  }
}

/** A `detail` as the driver gives it: parsed JSON, or its text. */
function parsed(detail: unknown): unknown {
  if (typeof detail !== 'string') return detail;
  try {
    return JSON.parse(detail) as unknown;
  } catch {
    return undefined;
  }
}
