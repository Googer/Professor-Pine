import { sql, type Kysely } from 'kysely';
import { isTrainAtEnd, type TrainAtEnd } from '../../domain/party/party.js';
import { gymStop, hasStop, readStopKey, stopKey, type StopRef } from '../../domain/party/stops.js';
import { inTransaction, retryOnDeadlock } from '../transaction.js';
import type { DB } from '../types.js';

/** A member may keep this many routes per region: what one list of choices holds. */
export const MAX_SAVED_ROUTES = 25;

/** A route a member saved for a region, to load into a train later. */
export interface SavedRoute {
  /** The row id: what a choice of the list carries. */
  id: number;
  /** As the member named it; empty for a row of the legacy bot that has no name. */
  name: string;
  /**
   * The stops of the route in order, gyms and power spots (plan 8X-4; design 6.2). Some may no
   * longer exist.
   */
  stops: StopRef[];
  /** What a train does at the end of it (`SavedRoutes.atEnd`; a value this code does not know reads as `finish`). */
  atEnd: TrainAtEnd;
}

/** What came of saving a route: a new one, one that took the place of its namesake, or none. */
export type SaveRouteOutcome =
  | { kind: 'saved' | 'replaced'; route: SavedRoute }
  /** The member has `MAX_SAVED_ROUTES` routes in this region already. */
  | { kind: 'full' };

/** What the train service needs of the table; lets tests keep the routes in memory. */
export interface SavedRouteStorage {
  /** The member's routes of a region, by name. */
  list(memberId: string, regionId: number): Promise<SavedRoute[]>;
  /** One of the member's routes of a region; undefined for any other row. */
  get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
  /**
   * Saves a route under a name, with what a train does at its end (left out: it finishes). A
   * route of the same member and region with that name is replaced, mode and all; a new one is
   * refused (`full`) when the member has the most they may have.
   */
  save(
    memberId: string,
    regionId: number,
    name: string,
    stops: readonly StopRef[],
    atEnd?: TrainAtEnd,
  ): Promise<SaveRouteOutcome>;
  /** Deletes one of the member's routes of a region and gives it; undefined for any other row. */
  remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
}

/**
 * What deleting a gym needs of the table (`GymAdminService`): the routes of all members and
 * regions that have the gym as a stop.
 */
export interface SavedRouteUpkeep {
  /**
   * How many saved routes have this gym as a stop: of these regions (a server's, plan 19B-2;
   * none of an empty list), or of every region (`'every'`). Always named, never every region by
   * default.
   */
  countWithGym(gymId: number, regionIds: readonly number[] | 'every'): Promise<number>;
  /**
   * Takes a gym off every saved route of these regions (of every region with `'every'`: only the
   * deletion of a gym's row asks so), its power spots kept. A route that is left without a stop
   * is removed. `changed` counts the routes that lost the stop and remain, `removed` those that
   * went.
   */
  removeGym(
    gymId: number,
    regionIds: readonly number[] | 'every',
  ): Promise<{ changed: number; removed: number }>;
  /**
   * How many saved routes, of all members, belong to this region: they go with the region when
   * it is removed (the table's foreign key deletes them).
   */
  countInRegion(regionId: number): Promise<number>;
}

/**
 * The stops of a stored route, separated by commas: a gym by its id, a power spot by its key
 * (`w<Wayfarer id>`, `stopKey`; plan 8X-4, no migration: the column is text, and the legacy bot
 * never reads a route the new bot saved). The legacy bot wrote gyms as it had them, so the text
 * may be empty, hold a stop twice or hold what is none: what is none is left out, and a stop
 * counts once.
 */
export function routeStops(text: string | null): StopRef[] {
  const found: StopRef[] = [];
  for (const part of (text ?? '').split(',')) {
    const trimmed = part.trim();
    const stop = /^\d{1,10}$/u.test(trimmed)
      ? Number(trimmed) > 0
        ? gymStop(Number(trimmed))
        : undefined
      : readStopKey(trimmed);
    if (stop && !found.some((kept) => stopKey(kept) === stopKey(stop))) found.push(stop);
  }
  return found;
}

/** The text the column keeps of a route's stops (`routeStops` reads it back). */
export function routeText(stops: readonly StopRef[]): string {
  return stops.map(stopKey).join(',');
}

/** The largest id a gym's row can have (`Gym.id` is `int unsigned`). */
const MAX_GYM_ID = 4_294_967_295;

/**
 * The gyms among a route's stops, each once: what `SavedRouteGym` holds of the route (migration
 * 056; its Power Spots are not there). An id that no gym's row can have (the legacy bot's text
 * may hold any digits) names no gym, and is left out.
 */
export function routeGymIds(stops: readonly StopRef[]): number[] {
  const ids = stops.flatMap((stop) =>
    stop.kind === 'gym' && stop.id <= MAX_GYM_ID ? [stop.id] : [],
  );
  return [...new Set(ids)];
}

function toRoute(row: {
  id: number;
  name: string | null;
  gyms: string | null;
  atEnd: string;
}): SavedRoute {
  return {
    id: row.id,
    name: row.name ?? '',
    stops: routeStops(row.gyms),
    atEnd: isTrainAtEnd(row.atEnd) ? row.atEnd : 'finish',
  };
}

/**
 * The legacy table `SavedRoutes`: `userId` is the row id of the member in `User`, `region` the
 * row id of the region, `gyms` the stops as text (`routeText`: gym ids, and since plan 8X-4
 * power spots as `w<Wayfarer id>`), `atEnd` (migration 013) what a train does at
 * the end of the route. Members are named by their snowflake here;
 * a member without a `User` row has no routes, and gets the row when they save their first.
 *
 * Beside it `SavedRouteGym` (migration 056): one row per route and gym among its stops
 * (`routeGymIds`), written in the same transaction as every write of a route's text, while the
 * route's row is locked (so that the rows of a route are always what its text says); a route's
 * rows go with it by their foreign key. A deletion of a gym finds its routes through them.
 */
export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Makes the route's rows of `SavedRouteGym` say `stops`, where they said `was`: the gyms it
   * lost and gained alone, each by its key (no range of the table is locked).
   */
  private async indexGyms(
    trx: Kysely<DB>,
    routeId: number,
    was: readonly StopRef[],
    stops: readonly StopRef[],
  ): Promise<void> {
    const before = routeGymIds(was);
    const after = routeGymIds(stops);
    const lost = before.filter((gymId) => !after.includes(gymId));
    const gained = after.filter((gymId) => !before.includes(gymId));
    if (lost.length > 0) {
      await trx
        .deleteFrom('SavedRouteGym')
        .where('routeId', '=', routeId)
        .where('gymId', 'in', lost)
        .execute();
    }
    if (gained.length > 0) {
      await trx
        .insertInto('SavedRouteGym')
        .values(gained.map((gymId) => ({ routeId, gymId })))
        .execute();
    }
  }

  private rows(db: Kysely<DB>, memberId: string, regionId: number) {
    return db
      .selectFrom('SavedRoutes')
      .innerJoin('User', 'User.id', 'SavedRoutes.userId')
      .where('User.userSnowflake', '=', memberId)
      .where('SavedRoutes.region', '=', regionId)
      .select(['SavedRoutes.id', 'SavedRoutes.name', 'SavedRoutes.gyms', 'SavedRoutes.atEnd']);
  }

  /** The member's row of `User`, locked until the transaction ends; undefined when they have none. */
  private lockMember(trx: Kysely<DB>, memberId: string): Promise<{ id: number } | undefined> {
    return trx
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
  }

  async list(memberId: string, regionId: number): Promise<SavedRoute[]> {
    const rows = await this.rows(this.db, memberId, regionId)
      .orderBy('SavedRoutes.name')
      .orderBy('SavedRoutes.id')
      .execute();
    return rows.map(toRoute);
  }

  async get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    const row = await this.rows(this.db, memberId, regionId)
      .where('SavedRoutes.id', '=', id)
      .executeTakeFirst();
    return row && toRoute(row);
  }

  async save(
    memberId: string,
    regionId: number,
    name: string,
    stops: readonly StopRef[],
    atEnd: TrainAtEnd = 'finish',
  ): Promise<SaveRouteOutcome> {
    // A deadlock (with another first save of the member, or with a gym's removal over the routes
    // and their gyms) runs all of it again, the look for the member's row too: the rollback took
    // whatever the first try made (`retryOnDeadlock`).
    return retryOnDeadlock(this.db, () => this.saveOnce(memberId, regionId, name, stops, atEnd));
  }

  private async saveOnce(
    memberId: string,
    regionId: number,
    name: string,
    stops: readonly StopRef[],
    atEnd: TrainAtEnd,
  ): Promise<SaveRouteOutcome> {
    const text = routeText(stops);
    // A row for the member is made only when they have none (as `UserRepository.ensure` does):
    // an insert that finds one uses up an id all the same. Looked for before the transaction,
    // and without a lock: inside it, a plain read would fix what the transaction sees before it
    // has the member's lock (it would then miss a route that a save just before it made), and a
    // locking read of a row that is not there makes two first saves wait for each other.
    const known = await this.db
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .executeTakeFirst();
    return inTransaction(this.db, async (trx) => {
      if (!known) {
        await trx
          .insertInto('User')
          .values({ userSnowflake: memberId })
          .onDuplicateKeyUpdate({ userSnowflake: memberId })
          .execute();
      }
      // The member's row is locked: two saves of one member run one after the other, so that
      // neither the limit nor "one route per name" can be passed by both.
      const user = await this.lockMember(trx, memberId);
      if (!user) {
        throw new Error(
          known
            ? `User row for ${memberId} was deleted while their route was being saved`
            : `User row for ${memberId} vanished after insert`,
        );
      }
      const existing = await this.rows(trx, memberId, regionId).orderBy('SavedRoutes.id').execute();
      // The column compares names without regard to case, and so does this.
      const same = existing.find((row) => (row.name ?? '').toLowerCase() === name.toLowerCase());
      // The rows were read without a lock on them (only the member's row is locked): the
      // namesake may have gone since, when the gym that was its only stop was deleted
      // (`removeGym`), or lost a stop. It is read again by its key with a lock: gone, nothing
      // is replaced, and the route is saved as a new one; there, its stops as they are now
      // are what its gyms beside it say.
      const current =
        same === undefined
          ? undefined
          : await trx
              .selectFrom('SavedRoutes')
              .select(['id', 'gyms'])
              .where('id', '=', same.id)
              .forUpdate()
              .executeTakeFirst();
      if (current) {
        await trx
          .updateTable('SavedRoutes')
          .set({ name, gyms: text, atEnd })
          .where('id', '=', current.id)
          .execute();
        await this.indexGyms(trx, current.id, routeStops(current.gyms), stops);
        return { kind: 'replaced', route: { id: current.id, name, stops: [...stops], atEnd } };
      }
      const others = same ? existing.length - 1 : existing.length;
      if (others >= MAX_SAVED_ROUTES) return { kind: 'full' };
      const inserted = await trx
        .insertInto('SavedRoutes')
        .values({ userId: user.id, region: regionId, name, gyms: text, atEnd })
        .executeTakeFirstOrThrow();
      const id = Number(inserted.insertId);
      await this.indexGyms(trx, id, [], stops);
      return { kind: 'saved', route: { id, name, stops: [...stops], atEnd } };
    });
  }

  async remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return inTransaction(this.db, async (trx) => {
      // The member's row first, as `save` takes it: both then wait for each other in one order.
      if (!(await this.lockMember(trx, memberId))) return undefined;
      const row = await this.rows(trx, memberId, regionId)
        .where('SavedRoutes.id', '=', id)
        .executeTakeFirst();
      if (!row) return undefined;
      await trx.deleteFrom('SavedRoutes').where('id', '=', row.id).execute();
      return toRoute(row);
    });
  }

  /**
   * The routes with the gym as a stop: its rows of `SavedRouteGym` by the index `(gymId,
   * routeId)`, each route by its key (`savedroutegym_gymid_routeid_index`, then `SavedRoutes`'
   * `PRIMARY`; never a search of the routes' text). Of these regions only (a server's, plan
   * 19B-2: none of an empty list), or of every region (`'every'`). In the order of their ids.
   */
  private withGym(db: Kysely<DB>, gymId: number, regionIds: readonly number[] | 'every') {
    let query = db
      .selectFrom('SavedRouteGym')
      .innerJoin('SavedRoutes', 'SavedRoutes.id', 'SavedRouteGym.routeId')
      .where('SavedRouteGym.gymId', '=', gymId);
    if (regionIds !== 'every') {
      query =
        regionIds.length === 0
          ? query.where(sql<boolean>`false`)
          : query.where('SavedRoutes.region', 'in', [...regionIds]);
    }
    return query;
  }

  async countWithGym(gymId: number, regionIds: readonly number[] | 'every'): Promise<number> {
    const counted = await this.withGym(this.db, gymId, regionIds)
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirstOrThrow();
    return Number(counted.n);
  }

  async countInRegion(regionId: number): Promise<number> {
    const counted = await this.db
      .selectFrom('SavedRoutes')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('region', '=', regionId)
      .executeTakeFirstOrThrow();
    return Number(counted.n);
  }

  /**
   * The routes with the gym are listed without a lock (`withGym`); each of them is then read
   * again by its key with a lock, and decided by what it holds at that moment: a route that a
   * member saved anew since the listing is taken as it is now, and a save of that row meanwhile
   * waits for this (as this waits for it). A row is locked only while it is decided, never the
   * table. A route that stays loses its row of the gym in `SavedRouteGym`; one that goes takes
   * its rows with it (their foreign key). It runs in a transaction of its own or inside the
   * caller's (`GymRemovalRepository`), which then keeps the locks until it ends.
   */
  async removeGym(
    gymId: number,
    regionIds: readonly number[] | 'every',
  ): Promise<{ changed: number; removed: number }> {
    const listed = await this.withGym(this.db, gymId, regionIds)
      .select('SavedRoutes.id')
      .orderBy('SavedRouteGym.routeId')
      .execute();
    return inTransaction(this.db, async (trx) => {
      let changed = 0;
      let removed = 0;
      for (const { id } of listed) {
        const row = await trx
          .selectFrom('SavedRoutes')
          .select(['id', 'gyms'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        const stops = routeStops(row?.gyms ?? null);
        if (!row || !hasStop(stops, gymStop(gymId))) continue;
        // Its power spots stay: a route left with one is a route still.
        const kept = stops.filter((stop) => stop.kind !== 'gym' || stop.id !== gymId);
        if (kept.length === 0) {
          await trx.deleteFrom('SavedRoutes').where('id', '=', id).execute();
          removed += 1;
        } else {
          await trx
            .updateTable('SavedRoutes')
            .set({ gyms: routeText(kept) })
            .where('id', '=', id)
            .execute();
          await this.indexGyms(trx, id, stops, kept);
          changed += 1;
        }
      }
      return { changed, removed };
    });
  }
}
