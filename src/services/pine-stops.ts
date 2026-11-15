import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { PineStopStorage } from '../db/repositories/pine-stop-repository.js';
import type { NewPineStop, PineStop, PineStopChange } from '../domain/stops/pine-stop.js';
import { pineStopIdOf } from '../domain/stops/report.js';
import type { Logger } from '../log.js';
import type { NearWayspot, PlacedPineStop, WayspotProvider } from './wayspot-directory.js';

/**
 * Within this many metres of a PokéStop, `/pokestop add` asks "Add anyway?" (design 3: as
 * `/gym add` asks near a gym), and the Wayfarer import's preview names a stop of Pine's own
 * near an imported one.
 */
export const PINE_STOP_NEAR_METRES = 30;

export interface PineStopServiceOptions {
  storage: PineStopStorage;
  /** The directory that holds them beside the kept Wayspots (`setPineStops`) and finds stops near. */
  wayspots: Pick<WayspotProvider, 'of'> & {
    setPineStops(stops: readonly PlacedPineStop[]): void;
  };
  /** The row of a server in `Guild`, by its snowflake (`GuildRepository.idFor`). */
  guilds: { idFor(serverId: string): Promise<number | undefined> };
  log: Logger;
}

/**
 * The stops of Pine's own (plan 8R-1; design 3, `/pokestop`): sponsored stops staff add by hand,
 * per server, kept in `PineStop` and held in memory; after every change (and at start) they are
 * given to `WayspotDirectory`, so that every stop search finds them (`PlaceFinder`), `/wild
 * near:`, `/meetup` and the pins name them, and the region editor and the map build anew.
 * Changes run one at a time.
 */
export class PineStopService {
  private stops = new Map<number, PlacedPineStop>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: PineStopServiceOptions) {}

  /** Reads every stop of Pine's own and gives them to the directory. */
  load(): Promise<void> {
    return this.oneAtATime(async () => {
      const read = await this.options.storage.all();
      const placed: PlacedPineStop[] = [];
      for (const stop of read) placed.push(await this.placed(stop));
      this.stops = new Map(placed.map((one) => [one.stop.id, one]));
      this.publish();
      this.options.log.info({ stops: placed.length }, 'stops of Pine’s own loaded');
    });
  }

  /** The stops of a server, by name. */
  ofServer(serverId: string): PineStop[] {
    return [...this.stops.values()]
      .filter(({ stop }) => stop.serverId === serverId)
      .map(({ stop }) => stop)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  }

  /** The stops of a server by its row in `Guild` (the Wayfarer import knows the row). */
  ofGuildRow(guildRow: number | undefined): PineStop[] {
    if (guildRow === undefined) return [];
    return [...this.stops.values()]
      .filter((one) => one.guildRow === guildRow)
      .map(({ stop }) => stop);
  }

  /** A stop of a server by its key (`pine-<id>`) or id; undefined for another server's. */
  get(serverId: string, keyOrId: string | number): PineStop | undefined {
    const id = typeof keyOrId === 'number' ? keyOrId : pineStopIdOf(keyOrId);
    const found = id === undefined ? undefined : this.stops.get(id)?.stop;
    return found?.serverId === serverId ? found : undefined;
  }

  /**
   * The PokéStops within `PINE_STOP_NEAR_METRES` of a point that a new stop of this server would
   * stand beside: the server's own (plan 19B-3), those its imports kept and its stops of Pine's
   * own; nearest first. Another server's are none of its business.
   */
  async nearStops(point: LatLon, serverId: string): Promise<NearWayspot[]> {
    const guildRow = await this.options.guilds.idFor(serverId);
    return this.options.wayspots.of(guildRow).near(point, PINE_STOP_NEAR_METRES, ['stop']);
  }

  add(stop: NewPineStop): Promise<PineStop> {
    return this.oneAtATime(async () => {
      const made = await this.options.storage.add(stop);
      this.stops.set(made.id, await this.placed(made));
      this.publish();
      this.options.log.info(
        { stop: made.id, guild: made.serverId, by: made.createdBy },
        'a stop of Pine’s own was added',
      );
      return made;
    });
  }

  edit(
    id: number,
    serverId: string,
    change: PineStopChange,
    by: string,
    at: number,
  ): Promise<PineStop | undefined> {
    return this.oneAtATime(async () => {
      const changed = await this.options.storage.update(id, serverId, change, by, at);
      if (!changed) return undefined;
      this.stops.set(changed.id, await this.placed(changed));
      this.publish();
      this.options.log.info(
        { stop: id, guild: serverId, by, fields: Object.keys(change) },
        'a stop of Pine’s own was changed',
      );
      return changed;
    });
  }

  remove(id: number, serverId: string, by: string): Promise<PineStop | undefined> {
    return this.oneAtATime(async () => {
      const removed = await this.options.storage.remove(id, serverId);
      if (!removed) return undefined;
      this.stops.delete(id);
      this.publish();
      this.options.log.info({ stop: id, guild: serverId, by }, 'a stop of Pine’s own was removed');
      return removed;
    });
  }

  private async placed(stop: PineStop): Promise<PlacedPineStop> {
    return { stop, guildRow: await this.options.guilds.idFor(stop.serverId) };
  }

  private publish(): void {
    this.options.wayspots.setPineStops([...this.stops.values()]);
  }

  private oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
