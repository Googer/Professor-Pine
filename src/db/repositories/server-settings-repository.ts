import type { Kysely } from 'kysely';
import type { SettingChange } from '../../config/server-settings.js';
import { isDuplicateEntry } from '../errors.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import {
  ServerSettingsAuditRepository,
  type SettingsActor,
} from './server-settings-audit-repository.js';

/**
 * A server's row as kept (table `ServerSettings` of migration 052): its values as the document
 * was written (`settings`, checked by `serverValuesSchema` when `ServerSettings` reads it), when
 * it was set up (null: not yet), and its last change.
 */
export interface StoredServer {
  serverId: string;
  settings: unknown;
  setUpAt: number | null;
  updatedAt: number;
  updatedBy: string | null;
}

/**
 * The servers' settings (plan 19A-1): `ServerSettingsRepository` and its twin
 * `MemoryServerSettings` (`test/support/server-settings.ts`), both running `serverSettingsCases`.
 */
export interface ServerSettingsStorage {
  /** Every server's row. */
  all(): Promise<StoredServer[]>;
  /** One server's row; undefined when it has none. */
  one(serverId: string): Promise<StoredServer | undefined>;
  /**
   * Writes a server's first row, unless it has one by now (a change of its staff came first):
   * whether it wrote.
   */
  create(row: StoredServer): Promise<boolean>;
  /**
   * Writes a server's values in the place of those kept, with when and by whom, and the settings
   * it changed into the staff's log (`ServerSettingsAudit`), all or nothing; a server without a
   * row gets one, not set up. When it was set up is kept.
   */
  write(
    serverId: string,
    settings: unknown,
    at: number,
    by: SettingsActor,
    changes: readonly SettingChange[],
  ): Promise<void>;
}

type Row = {
  serverId: string;
  settings: unknown;
  setUpAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

const stored = (row: Row): StoredServer => ({
  serverId: row.serverId,
  settings: row.settings,
  setUpAt: row.setUpAt === null ? null : Number(row.setUpAt),
  updatedAt: Number(row.updatedAt),
  updatedBy: row.updatedBy,
});

/** The `ServerSettings` table. */
export class ServerSettingsRepository implements ServerSettingsStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async all(): Promise<StoredServer[]> {
    const rows = await this.db
      .selectFrom('ServerSettings')
      .selectAll()
      .orderBy('serverId')
      .execute();
    return rows.map(stored);
  }

  async one(serverId: string): Promise<StoredServer | undefined> {
    const row = await this.db
      .selectFrom('ServerSettings')
      .selectAll()
      .where('serverId', '=', serverId)
      .executeTakeFirst();
    return row === undefined ? undefined : stored(row);
  }

  async create(row: StoredServer): Promise<boolean> {
    try {
      await this.db
        .insertInto('ServerSettings')
        .values({
          serverId: row.serverId,
          settings: JSON.stringify(row.settings),
          setUpAt: row.setUpAt === null ? null : String(row.setUpAt),
          updatedAt: String(row.updatedAt),
          updatedBy: row.updatedBy,
        })
        .execute();
      return true;
    } catch (err) {
      if (isDuplicateEntry(err)) return false;
      throw err;
    }
  }

  async write(
    serverId: string,
    settings: unknown,
    at: number,
    by: SettingsActor,
    changes: readonly SettingChange[],
  ): Promise<void> {
    const values = { settings: JSON.stringify(settings), updatedAt: String(at), updatedBy: by.id };
    await inTransaction(this.db, async (trx) => {
      await trx
        .insertInto('ServerSettings')
        .values({ serverId, setUpAt: null, ...values })
        .onDuplicateKeyUpdate(values)
        .execute();
      await new ServerSettingsAuditRepository(trx).insert(
        changes.map((change) => ({ serverId, at, actor: by, ...change })),
      );
    });
  }
}
