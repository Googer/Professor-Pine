import type { TrainAtEnd } from '../../src/domain/party/party.js';
import { gymStop, hasStop, type StopRef } from '../../src/domain/party/stops.js';
import {
  MAX_SAVED_ROUTES,
  type SavedRoute,
  type SavedRouteStorage,
  type SavedRouteUpkeep,
  type SaveRouteOutcome,
} from '../../src/db/repositories/saved-route-repository.js';

interface Row extends SavedRoute {
  memberId: string;
  regionId: number;
}

function route({ id, name, stops, atEnd }: Row): SavedRoute {
  return { id, name, stops: [...stops], atEnd };
}

/**
 * The saved routes kept in memory as `SavedRouteRepository` keeps them, whose behaviour
 * saved-route-repository.db.test.ts pins down: a route belongs to a member and a region, a
 * namesake (whatever its case) is replaced, and a member has at most `MAX_SAVED_ROUTES` per
 * region; `countWithGym` and `removeGym` are for the deletion of a gym. Set `failing` to make
 * every call reject.
 */
export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
  failing: Error | undefined;
  readonly rows: Row[] = [];
  private nextId = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(memberId: string, regionId: number): Row[] {
    return this.rows.filter((row) => row.memberId === memberId && row.regionId === regionId);
  }

  /**
   * A row as the legacy bot may have left it, for a test: any name, any stops (a number is a gym
   * by its id).
   */
  add(
    memberId: string,
    regionId: number,
    name: string,
    stops: readonly (number | StopRef)[],
    atEnd: TrainAtEnd = 'finish',
  ): SavedRoute {
    const row = {
      id: this.nextId++,
      memberId,
      regionId,
      name,
      stops: stops.map((stop) => (typeof stop === 'number' ? gymStop(stop) : stop)),
      atEnd,
    };
    this.rows.push(row);
    return route(row);
  }

  list(memberId: string, regionId: number): Promise<SavedRoute[]> {
    return this.attempt(() =>
      this.of(memberId, regionId)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id - b.id)
        .map(route),
    );
  }

  get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return this.attempt(() => {
      const row = this.of(memberId, regionId).find((found) => found.id === id);
      return row && route(row);
    });
  }

  save(
    memberId: string,
    regionId: number,
    name: string,
    stops: readonly StopRef[],
    atEnd: TrainAtEnd = 'finish',
  ): Promise<SaveRouteOutcome> {
    return this.attempt((): SaveRouteOutcome => {
      const mine = this.of(memberId, regionId);
      const same = mine.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (same) {
        same.name = name;
        same.stops = [...stops];
        same.atEnd = atEnd;
        return { kind: 'replaced', route: route(same) };
      }
      if (mine.length >= MAX_SAVED_ROUTES) return { kind: 'full' };
      return { kind: 'saved', route: this.add(memberId, regionId, name, [...stops], atEnd) };
    });
  }

  remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return this.attempt(() => {
      const row = this.of(memberId, regionId).find((found) => found.id === id);
      if (!row) return undefined;
      this.rows.splice(this.rows.indexOf(row), 1);
      return route(row);
    });
  }

  /** The rows of these regions, or every row. */
  private inRegions(regionIds: readonly number[] | 'every'): Row[] {
    return regionIds === 'every'
      ? this.rows
      : this.rows.filter((row) => regionIds.includes(row.regionId));
  }

  countWithGym(gymId: number, regionIds: readonly number[] | 'every'): Promise<number> {
    return this.attempt(
      () => this.inRegions(regionIds).filter((row) => hasStop(row.stops, gymStop(gymId))).length,
    );
  }

  countInRegion(regionId: number): Promise<number> {
    return this.attempt(() => this.rows.filter((row) => row.regionId === regionId).length);
  }

  /**
   * What the table's foreign key does when a region's row is deleted: its routes go. At once,
   * as part of that deletion; gives how many went.
   */
  dropRegion(regionId: number): number {
    const mine = this.rows.filter((row) => row.regionId === regionId);
    for (const row of mine) this.rows.splice(this.rows.indexOf(row), 1);
    return mine.length;
  }

  removeGym(
    gymId: number,
    regionIds: readonly number[] | 'every',
  ): Promise<{ changed: number; removed: number }> {
    return this.attempt(() => {
      let changed = 0;
      let removed = 0;
      for (const row of [...this.inRegions(regionIds)]) {
        if (!hasStop(row.stops, gymStop(gymId))) continue;
        // Its power spots stay, as `SavedRouteRepository.removeGym` keeps them.
        row.stops = row.stops.filter((stop) => stop.kind !== 'gym' || stop.id !== gymId);
        if (row.stops.length > 0) changed += 1;
        else {
          this.rows.splice(this.rows.indexOf(row), 1);
          removed += 1;
        }
      }
      return { changed, removed };
    });
  }
}
