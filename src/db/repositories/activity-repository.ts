import { sql, type Kysely } from 'kysely';
import {
  bucketOf,
  dayOf,
  NO_BOSS,
  sumBuckets,
  sumDays,
  UNKNOWN_MONTH,
  type ActivityBucket,
  type ActivityPlaceKind,
  type ActivityWindow,
} from '../../domain/history/activity.js';
import type { DayBoss } from '../../domain/history/big-days.js';
import type { MonthRange, RegionCount } from '../../domain/history/region-tally.js';
import type { Logger } from '../../log.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/** What the web map's heatmap reads of the buckets (`/api/activity`). */
export interface ActivityReader {
  /** A server's buckets in a mode's window (`activityWindow`): its hours, or its months. */
  buckets(serverId: string, window: ActivityWindow): Promise<ActivityBucket[]>;
  /** The first and the last month a server has buckets of, for History's slider; null for none. */
  months(serverId: string): Promise<{ first: string; last: string } | null>;
  /**
   * A server's raids and max battles per region over a span of local months (the region tally,
   * plan 8H-5), along the `(serverId, month)` index; a region without any has no entry.
   */
  regionSums(serverId: string, months: MonthRange): Promise<RegionCount[]>;
}

/** A server's raids and max battles of one local day, over the regions read. */
export interface DayTotal {
  day: string;
  raids: number;
  maxes: number;
}

/** A server's days as one snapshot has them (`ActivityDayReader.daySeries`). */
export interface DaySeries {
  complete: boolean;
  totals: DayTotal[];
  bosses: DayBoss[];
}

/** A boss's raids over a server's whole history. */
export interface BossTotal {
  boss: string;
  raids: number;
}

/** A boss's raids of one local month (`yyyy-mm`). */
export interface MonthRaids {
  month: string;
  raids: number;
}

/**
 * What the big days and the history page read of the raids per day (plan 8H-8, `ActivityDay`):
 * always without the regions `leftOut` names (the member's barred ones, G4); region 0 and a region
 * gone are read like any other.
 */
export interface ActivityDayReader {
  /** A server's days with raids or max battles, summed over the regions, in the days' order. */
  dayTotals(serverId: string, leftOut: readonly number[]): Promise<DayTotal[]>;
  /**
   * The raids of each known boss (never `NO_BOSS`) on every day of a server (round 1: the boss
   * rule judges each day against the boss's weeks around it), read once per series kept (G3).
   */
  dayBosses(serverId: string, leftOut: readonly number[]): Promise<DayBoss[]>;
  /**
   * Whether the days hold the server's whole history (A1): their mark has reached the buckets',
   * and every record above it ended less than `DAYS_BEHIND_MS` ago (what the next hourly upkeep
   * adds; a record with no end, or one that ended before, means the days are still being filled,
   * as after migration 042 or a rebuild).
   */
  daysComplete(serverId: string): Promise<boolean>;
  /**
   * `daysComplete`, `dayTotals` and `dayBosses` of one consistent snapshot (R3): what the big days
   * are judged on, never a batch in one read and not in another.
   */
  daySeries(serverId: string, leftOut: readonly number[]): Promise<DaySeries>;
  /** Every known boss of a server's raids, with its raids (a max battle's boss alone is none). */
  bossTotals(serverId: string, leftOut: readonly number[]): Promise<BossTotal[]>;
  /** A boss's raids per local month, the months with any, in their order. */
  bossMonths(serverId: string, boss: string, leftOut: readonly number[]): Promise<MonthRaids[]>;
}

/**
 * How long after its end a record may wait for the hourly upkeep to add it to the days before
 * they count as behind (`daysComplete`): an hour between upkeeps, and one for the upkeep's run.
 */
export const DAYS_BEHIND_MS = 2 * 3_600_000;

/** As many records of the history as one transaction of the adding reads (and buckets it writes). */
export const ACTIVITY_BATCH = 2_000;

const PLACE_KINDS: readonly string[] = ['gym', 'spot', 'none'] satisfies ActivityPlaceKind[];
const isPlaceKind = (kind: string): kind is ActivityPlaceKind => PLACE_KINDS.includes(kind);

/** The records of the history the adding took into each table: above each one's mark (A5). */
export interface AddedRecords {
  /** Into the heatmap's buckets. */
  buckets: number;
  /** Into the raids per day. */
  days: number;
}

/** What a rebuild says of a server: where its marks ended, and its records up to there. */
export interface RebuiltServer {
  serverId: string;
  /** The buckets' mark once its rebuild ended (`ActivityProgress.lastHistoryId`). */
  lastHistoryId: number;
  /** The days' mark once its rebuild ended (`ActivityProgress.lastDayHistoryId`, plan 8H-8). */
  lastDayHistoryId: number;
  /** The server's records of the party history up to the lower mark, counted or not. */
  records: number;
}

export interface ActivityRepositoryOptions {
  /** `settings.timezone`: the local month, weekday and hour of a bucket. */
  zone: string;
  /** Records read per transaction; `ACTIVITY_BATCH` by default. */
  batch?: number;
  /** The clock (`Date.now` by default): a record after this month is bucketed at no time. */
  now?: () => number;
  /** Where the hourly adding says a server it could not add (R5); unsaid without. */
  log?: Logger;
}

/**
 * The activity heatmap's summary (plan 8H-4, `ActivityBucket` and `ActivityProgress`, migration
 * 038) and the raids per day (plan 8H-8, `ActivityDay`, migration 042): derived from the party
 * history and rebuildable, never written in a record's transaction (review H20). The hourly
 * upkeep adds the records above each server's marks (`addNew`), the buckets' and the days' apart
 * (G8: the days of a history the buckets counted before 042 are added from 0 without touching
 * the buckets); the rebuild (`npm run activity:rebuild`) starts a server's buckets and days from
 * nothing and adds its whole history the same way. A record is never changed once written (an
 * opt-out only takes member ids out, which neither holds), so adding is enough.
 */
export class ActivityRepository implements ActivityReader, ActivityDayReader {
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
   * Adds the records of every server above its marks, batch by batch; asks `isStopped` before
   * each batch and ends there (the next upkeep goes on). Says how many records each table took
   * (A5): those above the buckets' mark and those above the days' (they differ only while the
   * days catch up, G8), counted or not.
   */
  async addNew(options: { isStopped?: () => boolean } = {}): Promise<AddedRecords> {
    const servers = await this.db
      .selectFrom('PartyHistory')
      .select('serverId')
      .distinct()
      .orderBy('serverId')
      .execute();
    const added: AddedRecords = { buckets: 0, days: 0 };
    for (const { serverId } of servers) {
      try {
        if (await this.addServer(serverId, options.isStopped, added)) break;
      } catch (err) {
        // One server's failure (its batch undone with its marks) keeps no other from its records
        // (R5); the next upkeep tries it again.
        this.options.log?.error(
          { err, guild: serverId },
          'could not add a server’s records to the activity',
        );
      }
    }
    return added;
  }

  /**
   * Starts one server (or every server that has a history or buckets) from nothing and adds its
   * whole history again: its buckets and days deleted and both marks set to 0 in one transaction,
   * then the adding of `addNew` from there. Safe to run again, and beside the bot's hourly adding: both take
   * the mark's row first, so a batch is never counted twice. Says each server's final mark and
   * the records of its history up to it (8H4-7): beside the hourly adding, some of the batches
   * are the adding's to read, so what this run read alone says little.
   */
  async rebuild(serverId?: string): Promise<RebuiltServer[]> {
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
    const rebuilt: RebuiltServer[] = [];
    for (const server of servers) {
      // A deadlock with an adding under way (both reach the buckets) runs the reset again.
      await retryOnDeadlock(this.db, () =>
        inTransaction(this.db, async (trx) => {
          await this.markOf(trx, server);
          await trx.deleteFrom('ActivityBucket').where('serverId', '=', server).execute();
          await trx.deleteFrom('ActivityDay').where('serverId', '=', server).execute();
          await trx
            .updateTable('ActivityProgress')
            .set({ lastHistoryId: 0, lastDayHistoryId: 0 })
            .where('serverId', '=', server)
            .execute();
        }),
      );
      await this.addServer(server);
      rebuilt.push(await this.reached(server));
    }
    return rebuilt;
  }

  /**
   * A server's marks and the records of its history up to the lower: one count along
   * `(serverId, id)`.
   */
  private async reached(serverId: string): Promise<RebuiltServer> {
    const row = await sql<{
      mark: number | string;
      dayMark: number | string;
      records: number | string;
    }>`
      select p.lastHistoryId as mark, p.lastDayHistoryId as dayMark,
             (select count(*) from PartyHistory h
              where h.serverId = p.serverId
                and h.id <= least(p.lastHistoryId, p.lastDayHistoryId)) as records
      from ActivityProgress p
      where p.serverId = ${serverId}`.execute(this.db);
    const found = row.rows[0];
    return {
      serverId,
      lastHistoryId: Number(found?.mark ?? 0),
      lastDayHistoryId: Number(found?.dayMark ?? 0),
      records: Number(found?.records ?? 0),
    };
  }

  /**
   * Adds a server's records batch by batch, counting into `added` what each committed batch took;
   * says whether it stopped at `isStopped`. A batch that fails rejects, the ones before it kept.
   */
  private async addServer(
    serverId: string,
    isStopped: () => boolean = () => false,
    added: AddedRecords = { buckets: 0, days: 0 },
  ): Promise<boolean> {
    for (;;) {
      if (isStopped()) return true;
      const batch = await retryOnDeadlock(this.db, () => this.addBatch(serverId));
      added.buckets += batch.buckets;
      added.days += batch.days;
      if (batch.read < this.batch) return false;
    }
  }

  /**
   * The server's marks (the buckets' and the days'), its row made where missing and locked: one
   * adding at a time per server. The row is taken exclusively from the first statement (an
   * upsert that changes nothing where it is there): `insert ignore` takes a shared lock on a row
   * that is there, and two adders that both hold one deadlock as each asks for the exclusive one.
   */
  private async markOf(
    trx: Kysely<DB>,
    serverId: string,
  ): Promise<{ buckets: number; days: number }> {
    await sql`insert into ActivityProgress (serverId, lastHistoryId, lastDayHistoryId)
      values (${serverId}, 0, 0) as new
      on duplicate key update lastHistoryId = ActivityProgress.lastHistoryId`.execute(trx);
    const row = await sql<{ mark: number; dayMark: number }>`
      select lastHistoryId as mark, lastDayHistoryId as dayMark from ActivityProgress
      where serverId = ${serverId} for update`.execute(trx);
    return {
      buckets: Number(row.rows[0]?.mark ?? 0),
      days: Number(row.rows[0]?.dayMark ?? 0),
    };
  }

  /**
   * One batch in one transaction (read committed: no gap is locked, so the parties ending
   * meanwhile write their records unhindered): the marks' row locked once, the next records above
   * the lower mark read with a shared lock, those above the buckets' mark summed into the buckets
   * and those above the days' mark into the days, both marks moved to the batch's last record in
   * the same transaction (a mark ahead of the batch stays where it is: the two differ only until
   * the days catch up, plan 8H-8, G8). The locking read waits for a record whose transaction has
   * not committed yet (a party's end writing it, a retry of one that failed): its id may be below
   * one committed already, and a plain read would move a mark past it for good.
   */
  private addBatch(serverId: string): Promise<AddedRecords & { read: number }> {
    return inTransaction(
      this.db,
      async (trx) => {
        const marks = await this.markOf(trx, serverId);
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
          bossKey: string | null;
        }>`
          select id, kind, ending, createdAt, hatchTime, regionId, gymId, wayspotId, hereHeads,
                 doneHeads, bossKey
          from PartyHistory force index (partyhistory_serverid_id_index)
          where serverId = ${serverId} and id > ${Math.min(marks.buckets, marks.days)}
          order by id
          limit ${this.batch}
          for share`.execute(trx);
        const last = rows.rows.at(-1);
        if (last === undefined) return { read: 0, buckets: 0, days: 0 };
        const now = this.now();
        const { zone } = this.options;
        const buckets = sumBuckets(
          rows.rows.flatMap((row) => {
            if (Number(row.id) <= marks.buckets) return [];
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
              zone,
              now,
            );
            return bucket === undefined ? [] : [bucket];
          }),
        );
        const days = sumDays(
          rows.rows.flatMap((row) => {
            if (Number(row.id) <= marks.days) return [];
            const day = dayOf(
              {
                kind: row.kind,
                ending: row.ending,
                createdAt: Number(row.createdAt),
                hatchTime: row.hatchTime === null ? null : Number(row.hatchTime),
                regionId: row.regionId,
                bossKey: row.bossKey,
              },
              zone,
              now,
            );
            return day === undefined ? [] : [day];
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
        if (days.length > 0) {
          await trx
            .insertInto('ActivityDay')
            .values(days.map((day) => ({ serverId, ...day })))
            .modifyEnd(
              sql`as new on duplicate key update raids = ActivityDay.raids + new.raids,
                maxes = ActivityDay.maxes + new.maxes`,
            )
            .execute();
        }
        const lastId = Number(last.id);
        await trx
          .updateTable('ActivityProgress')
          .set({
            lastHistoryId: Math.max(marks.buckets, lastId),
            lastDayHistoryId: Math.max(marks.days, lastId),
          })
          .where('serverId', '=', serverId)
          .execute();
        return {
          read: rows.rows.length,
          buckets: rows.rows.filter((row) => Number(row.id) > marks.buckets).length,
          days: rows.rows.filter((row) => Number(row.id) > marks.days).length,
        };
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

  async regionSums(serverId: string, months: MonthRange): Promise<RegionCount[]> {
    const rows = await this.db
      .selectFrom('ActivityBucket')
      .select((eb) => [
        'regionId',
        eb.fn.sum<number | string>('raids').as('raids'),
        eb.fn.sum<number | string>('maxes').as('maxes'),
      ])
      .where('serverId', '=', serverId)
      .where('month', '>=', months.first)
      .where('month', '<=', months.last)
      .groupBy('regionId')
      .execute();
    // MySQL sums integers as decimals, which the driver gives as text.
    return rows.map((row) => ({
      regionId: row.regionId,
      raids: Number(row.raids),
      maxes: Number(row.maxes),
    }));
  }

  async dayTotals(
    serverId: string,
    leftOut: readonly number[],
    db: Kysely<DB> = this.db,
  ): Promise<DayTotal[]> {
    // From the day index alone, in its order (A7): MySQL 8.4 took the boss index for this and
    // read every row (measured, round 1: 48,000 rows, 128 against 20 ms), so it is named.
    const rows = await sql<{ day: string; raids: number | string; maxes: number | string }>`
      select day, sum(raids) as raids, sum(maxes) as maxes
      from ActivityDay force index (activityday_server_day_index)
      where serverId = ${serverId}
        ${leftOut.length > 0 ? sql`and regionId not in (${sql.join([...leftOut])})` : sql``}
      group by day
      order by day`.execute(db);
    // MySQL sums integers as decimals, which the driver gives as text.
    return rows.rows.map((row) => ({
      day: row.day,
      raids: Number(row.raids),
      maxes: Number(row.maxes),
    }));
  }

  async daySeries(serverId: string, leftOut: readonly number[]): Promise<DaySeries> {
    // One read-only transaction at repeatable read: the three reads see one snapshot, so a batch
    // the adding commits meanwhile is in all or none of them (R3).
    return inTransaction(
      this.db,
      async (trx) => ({
        complete: await this.daysComplete(serverId, trx),
        totals: await this.dayTotals(serverId, leftOut, trx),
        bosses: await this.dayBosses(serverId, leftOut, trx),
      }),
      { isolation: 'repeatable read', readOnly: true },
    );
  }

  async daysComplete(serverId: string, db: Kysely<DB> = this.db): Promise<boolean> {
    const marks = await db
      .selectFrom('ActivityProgress')
      .select(['lastHistoryId', 'lastDayHistoryId'])
      .where('serverId', '=', serverId)
      .executeTakeFirst();
    const dayMark = marks?.lastDayHistoryId ?? 0;
    if (marks !== undefined && dayMark < marks.lastHistoryId) return false;
    // Along `(serverId, id)`: the records above the mark, a handful once the days are caught up.
    const behind = await db
      .selectFrom('PartyHistory')
      .select('id')
      .where('serverId', '=', serverId)
      .where('id', '>', dayMark)
      .where((eb) =>
        eb.or([
          eb('endedAt', 'is', null),
          eb('endedAt', '<=', String(this.now() - DAYS_BEHIND_MS)),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return behind === undefined;
  }

  async dayBosses(
    serverId: string,
    leftOut: readonly number[],
    db: Kysely<DB> = this.db,
  ): Promise<DayBoss[]> {
    // Along the primary key's server: every row of the server's days is read once per series.
    const rows = await db
      .selectFrom('ActivityDay')
      .select((eb) => ['day', 'boss', eb.fn.sum<number | string>('raids').as('raids')])
      .where('serverId', '=', serverId)
      .where('boss', '<>', NO_BOSS)
      .$if(leftOut.length > 0, (query) => query.where('regionId', 'not in', [...leftOut]))
      .groupBy(['day', 'boss'])
      .having((eb) => eb.fn.sum('raids'), '>', 0)
      .execute();
    return rows.map((row) => ({ day: row.day, boss: row.boss, raids: Number(row.raids) }));
  }

  async bossTotals(serverId: string, leftOut: readonly number[]): Promise<BossTotal[]> {
    const rows = await this.db
      .selectFrom('ActivityDay')
      .select((eb) => ['boss', eb.fn.sum<number | string>('raids').as('raids')])
      .where('serverId', '=', serverId)
      .where('boss', '<>', NO_BOSS)
      .$if(leftOut.length > 0, (query) => query.where('regionId', 'not in', [...leftOut]))
      .groupBy('boss')
      .having((eb) => eb.fn.sum('raids'), '>', 0)
      .execute();
    return rows.map((row) => ({ boss: row.boss, raids: Number(row.raids) }));
  }

  async bossMonths(
    serverId: string,
    boss: string,
    leftOut: readonly number[],
  ): Promise<MonthRaids[]> {
    const month = sql<string>`left(day, 7)`;
    const rows = await this.db
      .selectFrom('ActivityDay')
      .select((eb) => [month.as('month'), eb.fn.sum<number | string>('raids').as('raids')])
      .where('serverId', '=', serverId)
      .where('boss', '=', boss)
      .$if(leftOut.length > 0, (query) => query.where('regionId', 'not in', [...leftOut]))
      .groupBy(month)
      .having((eb) => eb.fn.sum('raids'), '>', 0)
      .orderBy(month)
      .execute();
    return rows.map((row) => ({ month: row.month, raids: Number(row.raids) }));
  }
}
