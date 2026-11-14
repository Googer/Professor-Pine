import { isOpenInstance, listedServers, type Settings } from '../config/settings.js';
import type {
  ServerRecordStorage,
  StoredServerRecord,
} from '../db/repositories/server-record-repository.js';
import { mayHave, NO_STANDING, type Standing } from '../domain/operators/admission.js';
import type { Logger } from '../log.js';

export interface ServerStandingsOptions {
  store: ServerRecordStorage;
  /** The file's `servers` (`isOpenInstance`, `listedServers`). */
  settings: Pick<Settings, 'servers'>;
  log: Logger;
  now?: () => number;
  /**
   * The rows as read already, for a lookup made where nothing is awaited (the tests' context);
   * `load` reads them anew.
   */
  rows?: readonly StoredServerRecord[];
}

/**
 * Each server's standing with the instance (plan 19C-1; table `ServerRecord`, migration 061), kept in
 * memory: read whole at the start (`load`, before the login), changed here by whoever changes the
 * table, so that every question is synchronous: who may have this Pine (`mayHave`, the rule of
 * `src/domain/operators/admission.ts` with the file's `servers`), what an operator's tier reads
 * of a server (`standingOf`), and whether Pine left it (`isLeft`).
 */
export class ServerStandings {
  private readonly rows = new Map<string, StoredServerRecord>();

  constructor(private readonly options: ServerStandingsOptions) {
    for (const row of options.rows ?? []) this.rows.set(row.serverId, { ...row });
  }

  /** Reads every server's row. A failed read is thrown: the bot does not start without them. */
  async load(): Promise<void> {
    const rows = await this.options.store.all();
    this.rows.clear();
    for (const row of rows) this.rows.set(row.serverId, row);
    this.options.log.info({ servers: rows.length }, 'server standings loaded');
  }

  /** What the database says of a server: recorded at the upgrade, allowed, blocked. */
  standingOf(serverId: string): Standing {
    const row = this.rows.get(serverId);
    if (row === undefined) return NO_STANDING;
    return {
      recorded: row.recordedAt !== null,
      allowed: row.allowedAt !== null,
      blocked: row.blockedAt !== null,
    };
  }

  /** Whether a server may have this Pine (`mayHave`), by its standing and the file's `servers`. */
  mayHave(serverId: string): boolean {
    const { settings } = this.options;
    const instance = { open: isOpenInstance(settings), listed: listedServers(settings) };
    return mayHave(serverId, instance, this.standingOf(serverId));
  }

  /** Whether Pine left the server (and is not back): nothing is posted or sent for it. */
  isLeft(serverId: string): boolean {
    return (this.rows.get(serverId)?.leftAt ?? null) !== null;
  }
}
