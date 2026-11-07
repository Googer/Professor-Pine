import type {
  FillInJob,
  LegacyFillInStorage,
} from '../db/repositories/legacy-fill-in-repository.js';
import { constants } from 'node:fs';
import { access as fsAccess, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isSnowflake } from '../db/snowflake.js';
import type { LegacyIndexEntry } from '../domain/history/legacy-index.js';
import type { Logger } from '../log.js';
import { readMemberIndex, type MemberIndexRead } from '../ops/legacy-index.js';

/** As many index entries as one transaction fills in. */
const BATCH = 500;
/**
 * How long a worker's claim of a request holds (renewed with each batch): one a stop or a crash
 * cut short is taken up again after it, by this bot's next run or another's.
 */
export const FILL_IN_LEASE_MS = 10 * 60_000;

export interface LegacyFillInServiceOptions {
  storage: LegacyFillInStorage;
  /** The member index's folder (`LEGACY_INDEX_DIR`, mounted read-only). */
  indexDir: string;
  log: Logger;
  now?: () => number;
  batchSize?: number;
  /** Reads a member's index file (`readMemberIndex`); tests give one that fails. */
  readIndex?: (root: string, serverId: string, memberId: string) => Promise<MemberIndexRead>;
  /** Whether the bot may read and search a folder (`fs.access`); tests give one that refuses. */
  access?: (target: string, mode: number) => Promise<void>;
}

/** Why a fill-in could not be done, in words for staff (no ids: the column and the panel show it). */
const FAILURES = {
  none: 'The member index has no file of theirs (it was rebuilt without them).',
  unreadable: 'The bot may not read their file in the member index: ask whoever runs the bot.',
  damaged: 'Their file in the member index is damaged: run the history import again.',
  noServer: 'The member index has no folder of this server.',
} as const;

/** How long a server without an index folder is waited for before its fill-ins fail (B5). */
export const NO_SERVER_MS = 24 * 60 * 60_000;

/**
 * Fills in members' legacy history (plan 8H-10; design Part H): the requests of `/settings`
 * (`LegacyFillIn`), one at a time per installation, the oldest first. A run reads the member's
 * index file of the server and writes their id by key into the server's legacy records, a batch
 * per transaction (`fillBatch`), checking the history opt-in in each: an opt-out under way stops
 * it with nothing left behind. `kick` starts a run where none is under way (after a press, and
 * from the clock's upkeep, at start and hourly, for what is left); `stop` ends a run between two
 * batches and gives its claim back (B9), and the next start goes on where it stopped.
 *
 * A server without an index (none, or the import swapping a new one in) is tried again once the
 * claim lapses, warned each time, and failed after `NO_SERVER_MS` (B5); a member file missing in
 * the server's index, or one that cannot be read, fails the request, with why for staff
 * (`/admin member-settings`), logged at warn.
 */
export class LegacyFillInService {
  private readonly now: () => number;
  private running: Promise<void> | undefined;
  private wanted = false;
  private stopped = false;

  constructor(private readonly options: LegacyFillInServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Whether the bot's user may read the index (B2): its root and each server's folder. Warns once
   * where it may not: `hasFile` then finds no file, so nobody is offered the fill-in. At start.
   */
  async checkReadable(): Promise<void> {
    const { indexDir, log } = this.options;
    const access = this.options.access ?? ((target, mode) => fsAccess(target, mode));
    const mode = constants.R_OK | constants.X_OK;
    try {
      await access(indexDir, mode);
      const servers = (await readdir(indexDir)).filter(isSnowflake);
      for (const server of servers) await access(path.join(indexDir, server), mode);
    } catch (err) {
      log.warn(
        { err },
        'the member index cannot be read by the bot’s user; members are offered no old-bot history',
      );
    }
  }

  /** Runs the waiting requests, where no run is under way (one under way looks again after). */
  kick(): void {
    if (this.stopped) return;
    this.wanted = true;
    this.running ??= this.drain().finally(() => {
      this.running = undefined;
    });
  }

  /** No batch starts from now on; the one under way ends. */
  stop(): void {
    this.stopped = true;
  }

  /** Waits for the run under way. For tests and shutdown. */
  async idle(): Promise<void> {
    await this.running;
  }

  private async drain(): Promise<void> {
    const { storage, log } = this.options;
    while (this.wanted && !this.stopped) {
      this.wanted = false;
      try {
        for (;;) {
          if (this.stopped) return;
          const job = await storage.nextWaiting(this.now(), FILL_IN_LEASE_MS);
          if (job === undefined) break;
          // Another bot on the same database may have taken it meanwhile.
          if (!(await storage.claim(job, this.now(), FILL_IN_LEASE_MS))) continue;
          await this.fill(job);
        }
      } catch (err) {
        log.error({ err }, 'the legacy fill-ins failed; what is left is taken up within the hour');
        return;
      }
    }
  }

  private async fill(job: FillInJob): Promise<void> {
    const { storage, log, indexDir } = this.options;
    const read = await (this.options.readIndex ?? readMemberIndex)(
      indexDir,
      job.serverId,
      job.memberId,
    );
    if (read.kind === 'no-server' && this.now() - job.requestedAt < NO_SERVER_MS) {
      // The import swapping the server's index in, or none made: the claim lapses, and the next
      // run after it asks again, for a day (B5).
      log.warn({ server: job.serverId }, 'no member index of the server; a fill-in waits');
      return;
    }
    if (read.kind !== 'entries') {
      const failure =
        read.kind === 'no-server'
          ? FAILURES.noServer
          : read.kind === 'none'
            ? FAILURES.none
            : read.reason.startsWith('cannot be read')
              ? FAILURES.unreadable
              : FAILURES.damaged;
      log.warn(
        {
          err: new Error(read.kind === 'unreadable' ? `${failure} (${read.reason})` : failure),
          server: job.serverId,
        },
        'could not fill in a member’s legacy history',
      );
      await storage.fail(job, this.now(), failure);
      return;
    }
    const entries = [...read.entries].sort(byKey);
    const size = this.options.batchSize ?? BATCH;
    let skipped = 0;
    for (let start = 0; start < entries.length; start += size) {
      if (this.stopped) {
        // Given back: the next start takes it up at once rather than after the claim lapses.
        await storage.release(job);
        return;
      }
      const done = await storage.fillBatch(job, entries.slice(start, start + size), this.now());
      if (done.gone) return;
      skipped += done.skipped;
    }
    if (skipped > 0) {
      log.warn(
        { server: job.serverId, skipped },
        'a legacy fill-in left out places the history holds otherwise',
      );
    }
    await storage.finish(job, this.now());
  }
}

/** The entries in the order of their records' keys: a record's entries in one batch, mostly. */
function byKey(a: LegacyIndexEntry, b: LegacyIndexEntry): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
