import {
  ServerDeletionStopped,
  type DeletedServerData,
  type ServerDataStorage,
} from '../db/repositories/server-data-repository.js';
import type { StoredServerRecord } from '../db/repositories/server-record-repository.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import {
  deletedServersDm,
  failingDeletionsDm,
  type DeletedServer,
  type DeletionStep,
  type FailingDeletion,
} from '../render/shared-change-dm.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import type { ServerStandings } from './server-standings.js';

const DAY_MS = 24 * 3_600_000;

/**
 * How long Pine keeps the data of a server it left (spec "Leaving"; plan 19C-3): 30 days, so
 * that a server that adds it back within them picks up where it was. A constant, no setting.
 */
export const SERVER_KEPT_MS = 30 * DAY_MS;

/** How often the sweep runs at most (the scheduler's upkeep asks hourly, the first at start). */
export const DELETION_SWEEP_MS = DAY_MS;

/** How long the owner's DM about a sweep is worth sending: a week. */
const DELETED_DM_MS = 7 * DAY_MS;

/** After how many sweeps running that fail a server's deletion the owner is told. */
export const DELETION_FAILS_TOLD = 3;

export interface ServerDeletionOptions {
  standings: Pick<
    ServerStandings,
    | 'due'
    | 'deleteIfDue'
    | 'settled'
    | 'mayHave'
    | 'finishDeletionsWith'
    | 'retryDeletions'
    | 'filesLeft'
    | 'filesRemoved'
    | 'all'
  >;
  /** What the database holds of a server (`ServerDataRepository`). */
  data: ServerDataStorage;
  /**
   * The kept screenshots (`ScreenshotStore.forgetServer`): a server's, read up to `upTo` (the end
   * of its deletion's database part).
   */
  screenshots: {
    forgetServer(serverId: string, upTo: number): Promise<{ removed: number; failed: number }>;
  };
  /**
   * What the bot keeps in memory of a server whose data went (`forgetServerMemory`,
   * `src/app-wiring.ts`); never rejects.
   */
  forget: (serverId: string, deleted: DeletedServerData) => Promise<void>;
  /**
   * Whether Pine is in a server now (fix round 1, 2): by its shards' view
   * (`ShardReadiness.isPresent`: each shard's servers at its last ready, those Discord said
   * unavailable included, followed by the joins and removals), never the cache; `undefined` while
   * there is no client yet. Asked in the server's turn before its deletion begins: a present
   * server is not deleted.
   */
  present: (serverId: string) => boolean | undefined;
  /**
   * Whether the old bot's member index (`LEGACY_INDEX_DIR`, plan 8H-10) holds a folder of the
   * server (`hasServerIndex`, a leftover `.<server>.old` included); none where the instance has
   * no index. Members' old-bot history, which Pine only reads (mounted read-only), so the owner's
   * DM names the deleted servers' folders there, and only those, as theirs to remove (fix round
   * 1, 7; fix round 2, R1-3).
   */
  legacyIndex?: (serverId: string) => boolean;
  dms: Pick<DmSender, 'send'>;
  /** The bot's owner (`OWNER_ID`), told once per sweep that deleted something. */
  ownerId: string;
  log: Logger;
  now?: () => number;
}

/**
 * The deletion of the servers Pine left more than `SERVER_KEPT_MS` ago (plan 19C-3; spec
 * "Leaving"). `sweep` runs with the scheduler's upkeep, at most once a day (`DELETION_SWEEP_MS`;
 * the first at the start's upkeep): each server due (`ServerStandings.due`: left that long ago and
 * not deleted, or whose deletion began and did not end), one at a time, those Pine left first
 * first, in the server's turn (`deleteIfDue`, which reads its record again there and begins none
 * that came back, nor one Pine is in: `present`). A server's work: the database
 * (`ServerDataRepository`, table by table), then what the bot keeps of it in memory, then its end
 * recorded (`deletedAt`); logged with the server's id and the counts per table. Then, apart, the
 * kept screenshots of every server whose deletion left them (`ServerStandings.filesLeft`: each
 * deletion's, those of this sweep included), read up to that deletion's end: removed, the record
 * says so; where some cannot be, they stay noted and the next sweep tries again. Files never hold
 * the record, nor a server added back. A failure stops that server's deletion (logged; its record
 * keeps `deletingAt`) and the sweep goes on with the next: the next sweep, or the server's return,
 * finishes it (`finishDeletionsWith`, the same work; its kept screenshots at the next sweep). The
 * owner is told once per sweep that deleted something, by DM (the instance's, `serverId: null`),
 * by the servers' ids and their count, those whose deletion a return finished since the last
 * sweep included (fix round 2, R1-2); nothing is said to the server, which Pine is no longer in.
 *
 * Each sweep that runs lets a server added back whose unfinished deletion failed be tried again at
 * its next return (`ServerStandings.retryDeletions`), as a ready does. A server due whose deletion
 * is unfinished and that Pine is in again is taken back by `deleteIfDue`, its deletion finished
 * first by its return: the sweep waits for that (`settled`), and its failure is the sweep's, by
 * the step the return's work reached (fix round 2, R1-1).
 *
 * A deletion that keeps failing reaches the owner: after `DELETION_FAILS_TOLD` (3) sweeps running
 * that fail a server's deletion, its database part or its kept screenshots, once by DM (the
 * instance's), by its id and the step that failed (`DeletionStep`: the database, the kept
 * screenshots, the record); again only after it succeeded (by a sweep or the server's return) and
 * failed anew that many times. Counted in memory: a restart starts every count again.
 */
export class ServerDeletion {
  private sweptAt: number | undefined;
  /**
   * The servers whose deletion failed at the sweeps running up to now: how many, and whether the
   * owner was told. Of the servers due or with files left alone (dropped once one is neither),
   * bounded small by nature.
   */
  private readonly failing = new Map<string, { sweeps: number; told: boolean }>();
  /**
   * The servers whose deletion a return finished since the last sweep, with since when Pine had
   * left them: told by the next sweep's DM (R1-2). Of the servers pending alone, bounded small by
   * nature; emptied by every sweep that runs.
   */
  private readonly finishedByReturn = new Map<string, number | null>();
  /**
   * The step at which a return's finish of a server's deletion failed last (R1-1): what the sweep
   * that waited for it counts. Of the servers due alone, bounded small by nature.
   */
  private readonly returnFailedAt = new Map<string, DeletionStep>();

  constructor(private readonly options: ServerDeletionOptions) {
    // Finished by the server's return: a success, which starts its count of failures again, and
    // is told at the next sweep (R1-2). Called in the server's turn, before it is taken back.
    options.standings.finishDeletionsWith(async (serverId) => {
      const leftAt = this.rowOf(serverId)?.leftAt ?? null;
      let step: DeletionStep = 'record';
      try {
        await this.work(serverId, {}, (reached) => {
          step = reached;
        });
      } catch (err) {
        this.returnFailedAt.set(serverId, step);
        throw err;
      }
      this.returnFailedAt.delete(serverId);
      this.failing.delete(serverId);
      this.finishedByReturn.set(serverId, leftAt);
    });
  }

  /**
   * Deletes the servers due, then removes the kept screenshots left; the servers whose data it
   * deleted. Never rejects. Told of the shutdown (`isStopped`), it stops between two statements,
   * and the next start goes on.
   */
  async sweep(options: { isStopped?: () => boolean } = {}): Promise<string[]> {
    const { standings, log } = this.options;
    const now = this.now();
    if (this.sweptAt !== undefined && now - this.sweptAt < DELETION_SWEEP_MS) return [];
    this.sweptAt = now;
    // A return whose deletion failed is tried again at its next one (fix round 1, 3a).
    standings.retryDeletions();
    const rows = new Map(standings.all().map((row) => [row.serverId, row]));
    const deleted: string[] = [];
    /** What failed of each server this sweep, the last step that did. */
    const failed = new Map<string, DeletionStep>();
    /** The servers this sweep worked on and none of whose steps failed. */
    const done = new Set<string>();
    /** The servers whose kept screenshots this sweep removed. */
    const filesGone = new Set<string>();
    const due = standings.due(SERVER_KEPT_MS);
    // A server neither due nor with files left (deleted by its return, or back) starts its count
    // again.
    const owing = new Set([...due, ...standings.filesLeft().map((left) => left.serverId)]);
    for (const serverId of [...this.failing.keys()]) {
      if (!owing.has(serverId)) this.failing.delete(serverId);
    }
    for (const serverId of [...this.returnFailedAt.keys()]) {
      if (!owing.has(serverId)) this.returnFailedAt.delete(serverId);
    }
    let stopped = false;
    for (const serverId of due) {
      if (options.isStopped?.() === true) {
        stopped = true;
        break;
      }
      // The record's writes (`deletingAt`, `deletedAt`) around the work's steps.
      let step: DeletionStep = 'record';
      try {
        const work = () =>
          this.work(serverId, options, (reached) => {
            step = reached;
          });
        const present = (id: string) => this.options.present(id);
        if (await standings.deleteIfDue(serverId, SERVER_KEPT_MS, work, present)) {
          deleted.push(serverId);
        } else if (!(await this.finishedOnReturn(serverId, rows.get(serverId)))) {
          // Its return could not finish its deletion (R1-1): the sweep's failure, never done.
          const at = this.returnFailedAt.get(serverId) ?? 'record';
          log.error(
            { server: serverId, step: at },
            'could not delete the data of a server Pine left: the next sweep goes on',
          );
          failed.set(serverId, at);
          continue;
        }
        done.add(serverId);
      } catch (err) {
        if (err instanceof ServerDeletionStopped) {
          log.info(
            { server: serverId },
            'stopped deleting a server’s data: the next start goes on',
          );
          stopped = true;
          break;
        }
        log.error(
          { err, server: serverId, step },
          'could not delete the data of a server Pine left: the next sweep goes on',
        );
        failed.set(serverId, step);
      }
    }
    if (!stopped) await this.removeFiles(options, failed, done, filesGone);
    for (const serverId of done) if (!failed.has(serverId)) this.failing.delete(serverId);
    const failedNow: FailingDeletion[] = [];
    for (const [serverId, step] of failed) {
      if (this.failedAgain(serverId)) failedNow.push({ id: serverId, step });
    }
    const told = this.deletedToTell(deleted, rows, filesGone);
    if (told.length > 0) this.tellOwner(deletedServersDm(told));
    if (failedNow.length > 0) {
      this.tellOwner(failingDeletionsDm(failedNow, DELETION_FAILS_TOLD));
    }
    return deleted;
  }

  /**
   * After `deleteIfDue` deleted nothing of a server due (R1-1): where its deletion was unfinished
   * and Pine is in it again, so that `deleteIfDue` took it back (present, and it may have this
   * Pine: its very test), its return finishes the deletion in the background; the sweep waits for
   * that (`settled`, which tries it itself where the return has not yet). Whether the deletion is
   * over; true where there was none to finish.
   */
  private async finishedOnReturn(
    serverId: string,
    row: StoredServerRecord | undefined,
  ): Promise<boolean> {
    const { standings, present } = this.options;
    const unfinished = row !== undefined && row.deletingAt !== null;
    if (!unfinished || present(serverId) !== true || !standings.mayHave(serverId)) return true;
    return standings.settled(serverId);
  }

  /**
   * The servers the sweep's DM names (R1-2, R1-3): those it deleted, and those whose deletion a
   * return finished since the last sweep (and whose record says it ended: one whose end could not
   * be written is due, and told once a sweep ends it); each with whether the old bot's member
   * index holds a folder of it and whether its kept screenshots are left (not removed this sweep).
   * Empties the returns' list.
   */
  private deletedToTell(
    deleted: readonly string[],
    rows: ReadonlyMap<string, StoredServerRecord>,
    filesGone: ReadonlySet<string>,
  ): DeletedServer[] {
    const leftAt = new Map(deleted.map((id) => [id, rows.get(id)?.leftAt ?? null]));
    for (const [serverId, left] of this.finishedByReturn) {
      const row = this.rowOf(serverId);
      if (row && row.deletedAt !== null && row.deletingAt === null && !leftAt.has(serverId)) {
        leftAt.set(serverId, left);
      }
    }
    this.finishedByReturn.clear();
    return [...leftAt].map(([id, left]) => ({
      id,
      leftAt: left,
      indexFolder: this.options.legacyIndex?.(id) ?? false,
      screenshotsLeft: !filesGone.has(id),
    }));
  }

  /** The server's record as kept now. */
  private rowOf(serverId: string): StoredServerRecord | undefined {
    return this.options.standings.all().find((row) => row.serverId === serverId);
  }

  /**
   * The kept screenshots of each server whose deletion left them (fix round 1, 3d), read up to
   * that deletion's end: removed, then the record says so; where some cannot be, they stay noted
   * (logged, counted a failure at step `screenshots`) and the next sweep tries again.
   */
  private async removeFiles(
    options: { isStopped?: () => boolean },
    failed: Map<string, DeletionStep>,
    done: Set<string>,
    filesGone: Set<string>,
  ): Promise<void> {
    const { standings, screenshots, log } = this.options;
    for (const { serverId, at } of standings.filesLeft()) {
      if (options.isStopped?.() === true) return;
      done.add(serverId);
      const shots = await screenshots.forgetServer(serverId, at);
      if (shots.failed > 0) {
        log.error(
          { server: serverId, screenshots: shots.removed, failed: shots.failed },
          'could not remove the kept screenshots of a deleted server: the next sweep tries again',
        );
        failed.set(serverId, 'screenshots');
        continue;
      }
      try {
        await standings.filesRemoved(serverId, at);
      } catch (err) {
        log.error(
          { err, server: serverId },
          'could not record that the kept screenshots of a deleted server are removed',
        );
        failed.set(serverId, 'record');
        continue;
      }
      filesGone.add(serverId);
      log.info(
        { server: serverId, screenshots: shots.removed },
        'removed the kept screenshots of a deleted server',
      );
    }
  }

  /**
   * Counts a sweep that failed the server's deletion; whether the owner is to be told of it now
   * (the `DELETION_FAILS_TOLD`th running, not told yet).
   */
  private failedAgain(serverId: string): boolean {
    const count = this.failing.get(serverId) ?? { sweeps: 0, told: false };
    count.sweeps += 1;
    this.failing.set(serverId, count);
    if (count.told || count.sweeps < DELETION_FAILS_TOLD) return false;
    count.told = true;
    return true;
  }

  /**
   * One server's deletion: the database, then the bot's memory of it, as soon as the database's
   * part is done (fix round 1, 3c); `at` is told each step as it begins (what failed, for the
   * owner), and `record` once the work is done (the end written next). Its kept screenshots are
   * the sweep's (`removeFiles`).
   */
  private async work(
    serverId: string,
    options: { isStopped?: () => boolean },
    at: (step: DeletionStep) => void = () => undefined,
  ): Promise<void> {
    at('database');
    const deleted = await this.options.data.delete(serverId, options);
    at('record');
    await this.options.forget(serverId, deleted);
    this.options.log.info(
      {
        server: serverId,
        counts: deleted.counts,
        gyms: { unlinked: deleted.gyms.unlinked.length, deleted: deleted.gyms.deleted.length },
      },
      'deleted the data of a server Pine left more than 30 days ago',
    );
  }

  private tellOwner(message: V2Message): void {
    const owner = this.options.ownerId.trim();
    if (owner === '') return;
    const now = this.now();
    this.options.dms.send({
      userId: owner,
      // The instance's, not a server's: no server's turn or first-contact cap.
      serverId: null,
      message,
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + DELETED_DM_MS,
    });
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
