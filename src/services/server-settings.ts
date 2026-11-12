import { z } from 'zod';
import {
  fileDefaults,
  fileUnmatched,
  parseServerValues,
  serverValuesSchema,
  settingChanges,
  type ServerValues,
} from '../config/server-settings.js';
import type { Settings } from '../config/settings.js';
import type {
  ServerSettingsAuditStore,
  SettingsActor,
} from '../db/repositories/server-settings-audit-repository.js';
import type { ServerSettingsStorage } from '../db/repositories/server-settings-repository.js';
import { UserError } from '../discord/errors.js';
import type { Logger } from '../log.js';
import { AUDIT_KEEP_MS } from './party-audit.js';

/**
 * What a change of a server's values is refused with while the server has no row (review F5):
 * its fill comes first, and a change written before it would lose the names the fill finds.
 */
export const SETTINGS_LOADING = 'This server’s settings are still loading. Try again in a minute.';

/** What every reader of a server's values needs (`ServerSettings`; a fixed one in tests). */
export interface ServerSettingsLookup {
  /**
   * The server's values, from memory: its row's, or the file's defaults (no channel, category
   * or role: those are ids) while it has none, keeping closed what the file names (fix round 4,
   * I1: the moderators' channel and the map's member role in `unmatched`).
   */
  of(serverId: string): ServerValues;
}

/** What `/admin settings` and the fill need of the servers' settings (`ServerSettings`; `TestServers` in tests). */
export interface ServerSettingsService extends ServerSettingsLookup {
  /**
   * The file's defaults: what a server without a row has, and what is said where there is no
   * server (a DM).
   */
  defaults(): ServerValues;
  /** Whether the server has its row. */
  has(serverId: string): boolean;
  /** When the server finished its setup; null when not (yet), or without a row. */
  setUpAt(serverId: string): number | null;
  /**
   * Changes a server's values: `change` gets them as they are (after every change asked before
   * it) and gives them changed. Checked (`ServerValuesError` for a value that is not valid,
   * nothing written), written with `by` and the time, each setting it changed into the staff's
   * log in the same step, then kept. A change that changes nothing writes nothing. The values as
   * kept. Refused (`SETTINGS_LOADING`) while the server has no row.
   */
  set(
    serverId: string,
    change: (values: ServerValues) => ServerValues,
    by: SettingsActor,
  ): Promise<ServerValues>;
}

/**
 * One setting a change of a server's values refused: its key, the checker's message (for the
 * log), and for a channel that would be the same as another the other's key (`same`,
 * `channels.bot-lab`; fix round 3, H2), so that the panel names it.
 */
export interface ValuesProblem {
  key: string;
  message: string;
  same?: string;
}

/**
 * A change of a server's values that is not a valid value: nothing was written. `problems`: each
 * setting refused (its key, `channels.moderation`) and why, which `/admin settings` words.
 */
export class ServerValuesError extends Error {
  constructor(
    message: string,
    readonly problems: readonly ValuesProblem[] = [],
  ) {
    super(message);
    this.name = 'ServerValuesError';
  }
}

interface Kept {
  values: ServerValues;
  setUpAt: number | null;
}

/**
 * A server's settings (plan 19A-1; `docs/architecture/servers.md`): every server's row read at
 * start (`load`), each server's values from memory (`of`, synchronous), changed by its staff in
 * `/admin settings` (`set`: written first, then kept). A server without a row has the file's
 * defaults until the fill gives it one (`create`). The servers are those Discord has the bot in,
 * so the memory is a plain map.
 */
export class ServerSettings implements ServerSettingsService {
  private readonly kept = new Map<string, Kept>();
  private readonly defaults_: ServerValues;
  /**
   * What a server without a readable row has: the defaults, keeping closed what the file names
   * (`fileUnmatched`; fix round 4, I1).
   */
  private readonly withoutRow: ServerValues;
  private emptyAtLoad = false;
  /**
   * Per server, the last change or fill asked for: the next one of that server starts after it,
   * whether it failed or not; another server's never waits for it (fix round 4, I3). Dropped
   * once its last link settles.
   */
  private readonly turns = new Map<string, Promise<unknown>>();
  /** The fills under way (`ServerFill`, `filling`): a change asked meanwhile waits for its server's. */
  private readonly fills = new Map<string, Promise<void>>();

  constructor(
    private readonly options: {
      store: ServerSettingsStorage;
      /** The staff's log of settings, which `store.write` writes and `sweepLog` sweeps. */
      audit?: Pick<ServerSettingsAuditStore, 'deleteBefore'>;
      /** The file's settings: their server keys are the defaults of a server without a row. */
      settings: Settings;
      log: Logger;
      now?: () => number;
    },
  ) {
    this.defaults_ = fileDefaults(options.settings);
    const unmatched = fileUnmatched(options.settings);
    this.withoutRow = unmatched.length === 0 ? this.defaults_ : { ...this.defaults_, unmatched };
  }

  /**
   * Reads every server's row. A row whose values cannot be read is logged, and its server has
   * the file's defaults until its staff set them. A failed read is thrown: the bot does not start
   * without its servers' settings.
   */
  async load(): Promise<void> {
    const rows = await this.options.store.all();
    this.emptyAtLoad = rows.length === 0;
    for (const row of rows) {
      const values = this.read(row.serverId, row.settings);
      this.kept.set(row.serverId, { values, setUpAt: row.setUpAt });
    }
    this.options.log.info({ servers: rows.length }, 'server settings loaded');
  }

  /** Whether the table was empty when it was loaded: the first start of 2.1 (the upgrade). */
  get upgrading(): boolean {
    return this.emptyAtLoad;
  }

  of(serverId: string): ServerValues {
    return this.kept.get(serverId)?.values ?? this.fileDefaultsOf(serverId);
  }

  defaults(): ServerValues {
    return this.defaults_;
  }

  /** Whether the server has its row. */
  has(serverId: string): boolean {
    return this.kept.has(serverId);
  }

  /** When the server finished its setup; null when not (yet), or without a row. */
  setUpAt(serverId: string): number | null {
    return this.kept.get(serverId)?.setUpAt ?? null;
  }

  /**
   * Changes a server's values: `change` gets them as they are (after every change asked before
   * it) and gives them changed. Checked (`ServerValuesError` for a value that is not valid,
   * nothing written), written with `by` and the time, then kept. The values as kept. After the
   * server's fill under way, if one is (`filling`); refused (`SETTINGS_LOADING`, a `UserError`)
   * while the server has no row, so that a change never writes the defaults without the names
   * the fill would find (review F5).
   */
  async set(
    serverId: string,
    change: (values: ServerValues) => ServerValues,
    by: SettingsActor,
  ): Promise<ServerValues> {
    await this.fills.get(serverId);
    return this.inTurn(serverId, async () => {
      const kept = this.kept.get(serverId);
      if (kept === undefined) throw new UserError(SETTINGS_LOADING, { givesBack: true });
      const before = kept.values;
      const values = checkServerValues(change(before));
      // Each setting it changed goes into the staff's log with the values; nothing changed,
      // nothing is written.
      const changes = settingChanges(before, values);
      if (changes.length === 0) return before;
      await this.options.store.write(serverId, values, this.now(), by, changes);
      this.kept.set(serverId, { values, setUpAt: kept.setUpAt });
      return values;
    });
  }

  /**
   * A server's fill is under way (`ServerFill`; `done` never rejects): a change of its values
   * asked meanwhile waits for it, and so changes the filled values.
   */
  filling(serverId: string, done: Promise<void>): void {
    this.fills.set(serverId, done);
    void done.finally(() => {
      if (this.fills.get(serverId) === done) this.fills.delete(serverId);
    });
  }

  /**
   * Deletes the entries of the staff's log of settings older than `AUDIT_KEEP_MS` (30 days, as
   * `PartyAudit`'s), with the scheduler's hourly upkeep; gives how many.
   */
  async sweepLog(): Promise<number> {
    const { audit } = this.options;
    return audit === undefined ? 0 : audit.deleteBefore(this.now() - AUDIT_KEEP_MS);
  }

  /**
   * Gives a server without a row its first one (the fill, `fillServers`): `values`, set up now
   * or not. A row written meanwhile (a change of its staff first, or another process) is read
   * and kept instead. Whether it wrote.
   */
  create(serverId: string, values: ServerValues, setUp: boolean): Promise<boolean> {
    return this.inTurn(serverId, async () => {
      if (this.kept.has(serverId)) return false;
      const at = this.now();
      const made = await this.options.store.create({
        serverId,
        settings: checkServerValues(values),
        setUpAt: setUp ? at : null,
        updatedAt: at,
        updatedBy: null,
      });
      if (made) {
        this.kept.set(serverId, { values, setUpAt: setUp ? at : null });
        return true;
      }
      const row = await this.options.store.one(serverId);
      if (row) {
        this.kept.set(serverId, {
          values: this.read(serverId, row.settings),
          setUpAt: row.setUpAt,
        });
      }
      return false;
    });
  }

  /**
   * What a server without a readable row has (no row yet, or one that cannot be read): the file's
   * defaults with its invite, keeping closed what the file names (fix round 4, I1).
   */
  private fileDefaultsOf(serverId: string): ServerValues {
    const invite = this.options.settings.web?.invites?.[serverId];
    return invite === undefined ? this.withoutRow : { ...this.withoutRow, invite };
  }

  private read(serverId: string, stored: unknown): ServerValues {
    const result = serverValuesSchema.safeParse(stored);
    if (result.success) return result.data;
    this.options.log.error(
      { server: serverId, problems: z.prettifyError(result.error) },
      "could not read a server's settings: it has the file's defaults until they are set",
    );
    return this.fileDefaultsOf(serverId);
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** Runs `work` after the server's change or fill before it (`turns`), never another server's. */
  private inTurn<T>(serverId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.turns.get(serverId) ?? Promise.resolve()).then(work, work);
    const link = next.catch(() => undefined);
    this.turns.set(serverId, link);
    void link.then(() => {
      if (this.turns.get(serverId) === link) this.turns.delete(serverId);
    });
    return next;
  }
}

/** The values checked as they would be read; `ServerValuesError` saying what is wrong. */
export function checkServerValues(values: ServerValues): ServerValues {
  try {
    return parseServerValues(values);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ServerValuesError(
        z.prettifyError(err),
        err.issues.map((issue) => {
          const same: unknown = issue.code === 'custom' ? issue.params?.same : undefined;
          return {
            key: issue.path.join('.'),
            message: issue.message,
            ...(typeof same === 'string' ? { same } : {}),
          };
        }),
      );
    }
    throw err;
  }
}
