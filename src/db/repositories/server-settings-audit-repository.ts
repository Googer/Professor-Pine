import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/** The staff member who changed a server's settings, by id and by their name in it then. */
export interface SettingsActor {
  id: string;
  name?: string;
}

/**
 * An entry of the staff's log of a server's settings as it is written (`ServerSettingsAudit`,
 * migration 053): one setting a change changed (`SettingChange`), when and by whom.
 */
export interface SettingsAuditRow {
  serverId: string;
  at: number;
  actor: SettingsActor;
  /** The setting: `channels.moderation`, `features.roles`, `flaggedWords`. */
  key: string;
  /** Its values as stored (ids, not names); null for unset. */
  before: unknown;
  after: unknown;
}

/** An entry as it is read back. */
export interface SettingsAuditRecord extends SettingsAuditRow {
  id: string;
}

/** What the panel's Recent changes and `/audit member:` read of the log. */
export interface ServerSettingsAuditReader {
  /** A server's newest `limit` entries, oldest first. */
  ofServer(serverId: string, limit: number): Promise<SettingsAuditRecord[]>;
  /** A member's newest `limit` entries in a server, oldest first. */
  ofMember(serverId: string, memberId: string, limit: number): Promise<SettingsAuditRecord[]>;
}

/**
 * The staff's log of a server's settings (plan 19A-1): written by `ServerSettingsRepository.write`
 * in the transaction of the change, read by `/admin settings` and `/audit`, swept after 30 days
 * (`ServerSettings.sweepLog`). Twin `MemoryServerSettingsAudit`
 * (`test/support/server-settings-audit.ts`); both run `serverSettingsAuditCases`.
 */
export interface ServerSettingsAuditStore extends ServerSettingsAuditReader {
  insert(rows: readonly SettingsAuditRow[]): Promise<void>;
  /** Deletes the entries written before `at`; gives how many. */
  deleteBefore(at: number): Promise<number>;
}

/** The longest name of an actor the log keeps (`ServerSettingsAudit.actorName`). */
const MAX_ACTOR_NAME = 100;

type Row = {
  id: string;
  serverId: string;
  at: string;
  actorId: string;
  actorName: string | null;
  key: string;
  before: unknown;
  after: unknown;
};

/**
 * An entry as read. The driver gives a JSON column parsed (a value that is a text, an id, comes
 * as that text: parsing it again would make a snowflake a number).
 */
const record = (row: Row): SettingsAuditRecord => ({
  id: String(row.id),
  serverId: row.serverId,
  at: Number(row.at),
  actor: row.actorName === null ? { id: row.actorId } : { id: row.actorId, name: row.actorName },
  key: row.key,
  before: row.before,
  after: row.after,
});

/** The `ServerSettingsAudit` table. */
export class ServerSettingsAuditRepository implements ServerSettingsAuditStore {
  constructor(private readonly db: Kysely<DB>) {}

  async insert(rows: readonly SettingsAuditRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insertInto('ServerSettingsAudit')
      .values(
        rows.map((row) => ({
          serverId: row.serverId,
          at: String(row.at),
          actorId: row.actor.id,
          actorName: row.actor.name?.slice(0, MAX_ACTOR_NAME) ?? null,
          key: row.key,
          before: row.before === null ? null : JSON.stringify(row.before),
          after: row.after === null ? null : JSON.stringify(row.after),
        })),
      )
      .execute();
  }

  async ofServer(serverId: string, limit: number): Promise<SettingsAuditRecord[]> {
    const rows = await this.db
      .selectFrom('ServerSettingsAudit')
      .selectAll()
      .where('serverId', '=', serverId)
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
    return rows.map(record).reverse();
  }

  async ofMember(
    serverId: string,
    memberId: string,
    limit: number,
  ): Promise<SettingsAuditRecord[]> {
    const rows = await this.db
      .selectFrom('ServerSettingsAudit')
      .selectAll()
      .where('serverId', '=', serverId)
      .where('actorId', '=', memberId)
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
    return rows.map(record).reverse();
  }

  async deleteBefore(at: number): Promise<number> {
    const result = await this.db
      .deleteFrom('ServerSettingsAudit')
      .where('at', '<', String(at))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
