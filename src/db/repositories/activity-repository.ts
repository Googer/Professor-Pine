import { sql, type Kysely } from 'kysely';
import {
  bucketOf,
  sumBuckets,
  UNKNOWN_MONTH,
  type ActivityBucket,
  type ActivityPlaceKind,
  type ActivityWindow,
} from '../../domain/history/activity.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/** What the web map's heatmap reads of the buckets (`/api/activity`). */
export interface ActivityReader {
  /** A server's buckets in a mode's window (`activityWindow`): its hours, or its months. */
  buckets(serverId: string, window: ActivityWindow): Promise<ActivityBucket[]>;
  /** The first and the last month a server has buckets of, for History's slider; null for none. */
  months(serverId: string): Promise<{ first: string; last: string } | null>;
}

/** As many records of the history as one transaction of the adding reads (and buckets it writes). */
export const ACTIVITY_BATCH = 2_000;

const PLACE_KINDS: readonly string[] = ['gym', 'spot', 'none'] satisfies ActivityPlaceKind[];
const isPlaceKind = (kind: string): kind is ActivityPlaceKind => PLACE_KINDS.includes(kind);

export interface ActivityRepositoryOptions {
  /** `settings.timezone`: the local month, weekday and hour of a bucket. */
  zone: string;
  /** Records read per transaction; `ACTIVITY_BATCH` by default. */
  batch?: number;
  /** The clock (`Date.now` by default): a record after this month is bucketed at no time. */
  now?: () => number;
}

/**
 * The activity heatmap's summary (plan 8H-4, `ActivityBucket` and `ActivityProgress`, migration
 * 038): derived from the party history and rebuildable, never written in a record's transaction
 * (review H20). The hourly upkeep adds the records above each server's mark (`addNew`); the
 * rebuild (`npm run activity:rebuild`) starts a server from nothing and adds its whole history
 * the same way. A record is never changed once written (an opt-out only takes member ids out,
 * which the buckets do not hold), so adding is enough.
 */
export class ActivityRepository implements ActivityReader {
  private readonly batch: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly options: ActivityRepositoryOptions,
  ) {
    this.batch = options.batch ?? ACTIVITY_BATCH;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Adds the records of every server above its mark, batch by batch; asks `isStopped` before each
   * batch and ends there (the next upkeep goes on). Says how many records it read.
   */
  async addNew(options: { isStopped?: () => boolean } = {}): Promise<number> {
    const servers = await this.db
      .selectFrom('PartyHistory')
      .select('serverId')
      .distinct()
      .orderBy('serverId')
      .execute();
    let read = 0;
    for (const { serverId } of servers) {
      const added = await this.addServer(serverId, options.isStopped);
      read += added.read;
      if (added.stopped) break;
    }
    return read;
  }

  /**
   * Starts one server (or every server that has a history or buckets) from nothing and adds its
   * whole history again: its buckets deleted and its mark set to 0 in one transaction, then the
   * adding of `addNew` from there. Safe to run again, and beside the bot's hourly adding: both take
   * the mark's row first, so a batch is never counted twice.
   */
  async rebuild(serverId?: string): Promise<{ servers: number; records: number }> {
    const servers =
      serverId === undefined
        ? [
            ...new Set(
              [
                ...(await this.db
                  .selectFrom('PartyHistory')
                  .select('serverId')
                  .distinct()
                  .execute()),
                ...(await this.db.selectFrom('ActivityProgress').select('serverId').execute()),
              ].map((row) => row.serverId),
            ),
          ].sort()
        : [serverId];
    let records = 0;
    for (const server of servers) {
      // A deadlock with an adding under way (both reach the buckets) runs the reset again.
      await retryOnDeadlock(this.db, () =>
        inTransaction(this.db, async (trx) => {
          await this.markOf(trx, server);
          await trx.deleteFrom('ActivityBucket').where('serverId', '=', server).execute();
          await trx
            .updateTable('ActivityProgress')
            .set({ lastHistoryId: 0 })
            .where('serverId', '=', server)
            .execute();
        }),
      );
      records += (await this.addServer(server)).read;
    }
    return { servers: servers.length, records };
  }

  private async addServer(
    serverId: string,
    isStopped: () => boolean = () => false,
  ): Promise<{ read: number; stopped: boolean }> {
    let read = 0;
    for (;;) {
      if (isStopped()) return { read, stopped: true };
      const batch = await retryOnDeadlock(this.db, () => this.addBatch(serverId));
      read += batch;
      if (batch < this.batch) return { read, stopped: false };
    }
  }

  /**
   * The server's mark, its row made where missing and locked: one adding at a time per server.
   * The row is taken exclusively from the first statement (an upsert that changes nothing where
   * it is there): `insert ignore` takes a shared lock on a row that is there, and two adders that
   * both hold one deadlock as each asks for the exclusive one.
   */
  private async markOf(trx: Kysely<DB>, serverId: string): Promise<number> {
    await sql`insert into ActivityProgress (serverId, lastHistoryId)
      values (${serverId}, 0) as new
      on duplicate key update lastHistoryId = ActivityProgress.lastHistoryId`.execute(trx);
    const row = await sql<{ mark: number }>`
      select lastHistoryId as mark from ActivityProgress
      where serverId = ${serverId} for update`.execute(trx);
    return Number(row.rows[0]?.mark ?? 0);
  }

  /**
   * One batch in one transaction (read committed: no gap is locked, so the parties ending
   * meanwhile write their records unhindered): the mark's row locked, the next records above it
   * read with a shared lock, their buckets summed into the table, the mark moved to the last.
   * The locking read waits for a record whose transaction has not committed yet (a party's end
   * writing it, a retry of one that failed): its id may be below one committed already, and a
   * plain read would move the mark past it for good.
   */
  private addBatch(serverId: string): Promise<number> {
    return inTransaction(
      this.db,
      async (trx) => {
        const mark = await this.markOf(trx, serverId);
        const rows = await sql<{
          id: number;
          kind: string;
          ending: string;
          createdAt: string;
          hatchTime: string | null;
          regionId: number | null;
          gymId: number | null;
          wayspotId: string | null;
          hereHeads: number;
          doneHeads: number;
        }>`
          select id, kind, ending, createdAt, hatchTime, regionId, gymId, wayspotId, hereHeads,
                 doneHeads
          from PartyHistory force index (partyhistory_serverid_id_index)
          where serverId = ${serverId} and id > ${mark}
          order by id
          limit ${this.batch}
          for share`.execute(trx);
        const last = rows.rows.at(-1);
        if (last === undefined) return 0;
        const now = this.now();
        const buckets = sumBuckets(
          rows.rows.flatMap((row) => {
            const bucket = bucketOf(
              {
                kind: row.kind,
                ending: row.ending,
                createdAt: Number(row.createdAt),
                hatchTime: row.hatchTime === null ? null : Number(row.hatchTime),
                regionId: row.regionId,
                gymId: row.gymId,
                wayspotId: row.wayspotId,
                hereHeads: Number(row.hereHeads),
                doneHeads: Number(row.doneHeads),
              },
              this.options.zone,
              now,
            );
            return bucket === undefined ? [] : [bucket];
          }),
        );
        if (buckets.length > 0) {
          await trx
            .insertInto('ActivityBucket')
            .values(buckets.map((bucket) => ({ serverId, ...bucket })))
            // The row alias (MySQL 8.0.19 on), not `VALUES()`, which 8.0.20 deprecates.
            .modifyEnd(
              sql`as new on duplicate key update raids = ActivityBucket.raids + new.raids,
                maxes = ActivityBucket.maxes + new.maxes,
                completed = ActivityBucket.completed + new.completed,
                heads = ActivityBucket.heads + new.heads`,
            )
            .execute();
        }
        await trx
          .updateTable('ActivityProgress')
          .set({ lastHistoryId: Number(last.id) })
          .where('serverId', '=', serverId)
          .execute();
        return rows.rows.length;
      },
      { isolation: 'read committed' },
    );
  }

  async buckets(serverId: string, window: ActivityWindow): Promise<ActivityBucket[]> {
    let query = this.db
      .selectFrom('ActivityBucket')
      .select([
        'regionId',
        'placeKind',
        'placeId',
        'month',
        'weekday',
        'hour',
        'raids',
        'maxes',
        'completed',
        'heads',
      ])
      .where('serverId', '=', serverId);
    if ('months' in window) {
      query = query
        .where('month', '>=', window.months.first)
        .where('month', '<=', window.months.last);
    } else {
      if (window.hours.length === 0) return [];
      const byDay = new Map<number, number[]>();
      for (const { weekday, hour } of window.hours) {
        byDay.set(weekday, [...(byDay.get(weekday) ?? []), hour]);
      }
      query = query.where((eb) =>
        eb.or(
          [...byDay].map(([weekday, hours]) =>
            eb.and([eb('weekday', '=', weekday), eb('hour', 'in', hours)]),
          ),
        ),
      );
    }
    const rows = await query.execute();
    return rows.flatMap((row) =>
      isPlaceKind(row.placeKind) ? [{ ...row, placeKind: row.placeKind }] : [],
    );
  }

  async months(serverId: string): Promise<{ first: string; last: string } | null> {
    const row = await this.db
      .selectFrom('ActivityBucket')
      .select((eb) => [eb.fn.min('month').as('first'), eb.fn.max('month').as('last')])
      .where('serverId', '=', serverId)
      // A record of a time no month holds is in no month of the slider.
      .where('month', '>', UNKNOWN_MONTH)
      .executeTakeFirst();
    return row?.first == null || row.last == null ? null : { first: row.first, last: row.last };
  }
}
