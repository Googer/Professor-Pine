import type { Region } from '../db/repositories/region-repository.js';
import type { WayspotStorage } from '../db/repositories/wayspot-repository.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { containment } from '@pine/wayspot-core/region-membership';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import {
  wayspotAddress,
  type AddressedWayspot,
  type LookedUpAddress,
} from '../domain/geo/spot-address.js';
import type { PineStop } from '../domain/stops/pine-stop.js';
import { pineStopKey } from '../domain/stops/report.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { Logger } from '../log.js';

/** A kept Wayspot near a point, with how far from it. */
export interface NearWayspot {
  wayspot: Wayspot;
  metres: number;
}

/**
 * What handlers need of the kept Wayspots (plan 8W-2): the stops, power spots and Wayfarer gyms
 * Pine did not take, from memory. A Wayspot's regions are the regions whose outline holds it, by
 * their channel (as `GymDirectory.regionsOf`).
 */
export interface WayspotProvider {
  /**
   * A number that changes with every load, forget and change of the regions' outlines: what is
   * built from the Wayspots (the region editor's layers, 8M-2; the search indexes) is built anew
   * when it differs.
   */
  readonly generation: number;
  /**
   * A number that changes with every load: what is built of the Wayspots themselves, not of
   * where they lie (the search indexes), is built anew when it differs. A change of the regions
   * and a forget leave it: what is built of them passes over a forgotten Wayspot through where
   * they lie (`inRegion`, `byId`), which a forget changes at once.
   */
  readonly contentGeneration: number;
  /**
   * How many Wayspots are kept now (0 before the first load); the stops of Pine's own (plan 8R-1)
   * are not counted, so that a sweep waiting for kept Wayspots (`TrainService`) waits for them.
   */
  readonly size: number;
  /** Calls `listener` after every change of `contentGeneration` (it should not throw). */
  whenChanged(listener: () => void): void;
  byId(id: string): Wayspot | undefined;
  /**
   * A Wayspot's address as one line for every reader (`wayspotAddress`): Wayfarer's where it
   * gives one, else a Power Spot's looked-up address while it is where it was asked. Empty for none.
   */
  addressOf(wayspot: AddressedWayspot & { id: string }): string;
  /** Every kept Wayspot, in no particular order (a new list). */
  all(): Wayspot[];
  /** The Wayspots in the region of this channel (a new list). */
  inRegion(channelId: string): Wayspot[];
  /** The channels of the regions a Wayspot lies in; empty for one in none or unknown. */
  regionsOf(id: string): string[];
  /** The Wayspots within `metres` of a point, nearest first; only of `kinds` when given. */
  near(point: LatLon, metres: number, kinds?: readonly WayspotKind[]): NearWayspot[];
}

export interface WayspotDirectoryOptions {
  wayspots: Pick<WayspotStorage, 'all'>;
  /**
   * The regions: their outlines say where each Wayspot lies, worked out again when their
   * `generation` changes (without one, at each load of the Wayspots).
   */
  regions: { all(): readonly Region[]; readonly generation?: number };
  log: Logger;
  /**
   * The addresses Google gave for Power Spots the map asked about (`WayspotAddresses`), by
   * Wayfarer id; without it a Wayspot has Wayfarer's address alone.
   */
  addresses?: { lookedUp(id: string): LookedUpAddress | undefined };
}

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/**
 * A stop of Pine's own (`/pokestop`, plan 8R-1) as the directory takes it: the stop, and the row
 * of its server in `Guild` (undefined when the server has none), whose regions alone it lies in.
 */
export interface PlacedPineStop {
  stop: PineStop;
  guildRow: number | undefined;
}

/** A stop of Pine's own as a Wayspot: a PokéStop by the key `pine-<id>`, without a picture. */
export function pineStopWayspot(stop: PineStop): Wayspot {
  return {
    id: pineStopKey(stop.id),
    kind: 'stop',
    formerKind: null,
    lat: stop.lat,
    lon: stop.lon,
    title: stop.name,
    address: stop.address,
    image: null,
    firstSeen: stop.createdAt,
    lastSeen: stop.updatedAt,
    pineServer: stop.serverId,
  };
}

/** Where the Wayspots lie, worked out for one state of the regions. */
interface Placement {
  regions: number | undefined;
  byRegion: Map<string, Set<string>>;
  ofWayspot: Map<string, string[]>;
}

/**
 * Every kept Wayspot in memory, read from the database (`load`: at start, and after an import was
 * applied). Reads never wait: they use the last complete state, empty until the first load.
 * A Wayspot that became a gym is `forget`-ed at once (the import's write deleted its row), and
 * stays forgotten when a load that read the rows before it was deleted finishes after.
 */
export class WayspotDirectory implements WayspotProvider {
  private rows = new Map<string, Wayspot>();
  /** The stops of Pine's own (plan 8R-1), by their keys, with the row of their server. */
  private pine = new Map<string, { wayspot: Wayspot; guildRow: number | undefined }>();
  private placement: Placement | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private changes = 0;
  private contents = 0;
  private readonly listeners: (() => void)[] = [];
  /** The ids forgotten while the load under way reads, if one does. */
  private forgottenMeanwhile: Set<string> | undefined;

  constructor(private readonly options: WayspotDirectoryOptions) {}

  get generation(): number {
    this.placed();
    return this.changes;
  }

  get contentGeneration(): number {
    return this.contents;
  }

  get size(): number {
    return this.rows.size;
  }

  whenChanged(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** Reads every kept Wayspot. Loads asked for at the same time run one after the other. */
  load(): Promise<void> {
    const result = this.queue.then(async () => {
      const forgotten = new Set<string>();
      this.forgottenMeanwhile = forgotten;
      let read: Wayspot[];
      try {
        read = await this.options.wayspots.all();
      } finally {
        this.forgottenMeanwhile = undefined;
      }
      const rows = read.filter((row) => !forgotten.has(row.id));
      const started = performance.now();
      this.rows = new Map(rows.map((row) => [row.id, row]));
      this.placement = undefined;
      this.changes += 1;
      this.contentChanged();
      const placed = this.placed();
      this.options.log.info(
        {
          wayspots: rows.length,
          inRegions: placed.ofWayspot.size,
          ms: Math.round(performance.now() - started),
        },
        'Wayspots loaded',
      );
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Takes these Wayspots out of memory at once (they became gyms; their rows are deleted). */
  forget(ids: readonly string[]): void {
    let forgot = false;
    for (const id of ids) {
      this.forgottenMeanwhile?.add(id);
      if (!this.rows.delete(id)) continue;
      forgot = true;
      const placement = this.placement;
      for (const channelId of placement?.ofWayspot.get(id) ?? []) {
        placement?.byRegion.get(channelId)?.delete(id);
      }
      placement?.ofWayspot.delete(id);
    }
    if (forgot) this.changes += 1;
  }

  /**
   * Takes these as the stops of Pine's own (plan 8R-1: `PineStopService`, at start and after
   * every change), in the place of those it held: they are found as PokéStops beside the kept
   * Wayspots, each in the regions of its own server only, and a change of them is a change of
   * what the Wayspots are (the search indexes, the region editor and the map build anew). A load
   * of the kept Wayspots leaves them as they are.
   */
  setPineStops(stops: readonly PlacedPineStop[]): void {
    this.pine = new Map(
      stops.map(({ stop, guildRow }) => {
        const wayspot = pineStopWayspot(stop);
        return [wayspot.id, { wayspot, guildRow }];
      }),
    );
    this.placement = undefined;
    this.changes += 1;
    this.contentChanged();
  }

  private contentChanged(): void {
    this.contents += 1;
    for (const listener of this.listeners) listener();
  }

  byId(id: string): Wayspot | undefined {
    return this.rows.get(id) ?? this.pine.get(id)?.wayspot;
  }

  addressOf(wayspot: AddressedWayspot & { id: string }): string {
    return wayspotAddress(wayspot, this.options.addresses?.lookedUp(wayspot.id));
  }

  /** Every kept Wayspot and stop of Pine's own. */
  private *every(): Iterable<Wayspot> {
    yield* this.rows.values();
    for (const { wayspot } of this.pine.values()) yield wayspot;
  }

  all(): Wayspot[] {
    return [...this.every()];
  }

  inRegion(channelId: string): Wayspot[] {
    const ids = this.placed().byRegion.get(channelId);
    return ids === undefined ? [] : [...ids].flatMap((id) => this.byId(id) ?? []);
  }

  regionsOf(id: string): string[] {
    return [...(this.placed().ofWayspot.get(id) ?? [])];
  }

  near(point: LatLon, metres: number, kinds?: readonly WayspotKind[]): NearWayspot[] {
    const latReach = (metres / METRES_PER_DEGREE) * 1.01;
    const found: NearWayspot[] = [];
    for (const wayspot of this.every()) {
      if (Math.abs(wayspot.lat - point.lat) > latReach) continue;
      if (kinds !== undefined && !kinds.includes(wayspot.kind)) continue;
      const distance = metresBetween(point, wayspot);
      if (distance <= metres) found.push({ wayspot, metres: distance });
    }
    return found.sort((a, b) => a.metres - b.metres);
  }

  /** Where the Wayspots lie, for the regions as they are now. */
  private placed(): Placement {
    const { regions } = this.options;
    const generation = regions.generation;
    const kept = this.placement;
    if (kept !== undefined && (generation === undefined || kept.regions === generation)) {
      return kept;
    }
    const outlined = regions.all().flatMap((region) =>
      region.bounds === null
        ? []
        : [
            {
              channelId: region.channelId,
              guildRow: region.guildId,
              contains: containment(region.bounds),
            },
          ],
    );
    const byRegion = new Map<string, Set<string>>();
    const ofWayspot = new Map<string, string[]>();
    for (const wayspot of this.every()) {
      // A stop of Pine's own lies in the regions of its own server only.
      const pine = this.pine.get(wayspot.id);
      const channels = outlined.filter(
        (region) =>
          (pine === undefined ||
            (pine.guildRow !== undefined && region.guildRow === pine.guildRow)) &&
          region.contains(wayspot),
      );
      if (channels.length === 0) continue;
      ofWayspot.set(
        wayspot.id,
        channels.map((region) => region.channelId),
      );
      for (const { channelId } of channels) {
        let ids = byRegion.get(channelId);
        if (!ids) byRegion.set(channelId, (ids = new Set()));
        ids.add(wayspot.id);
      }
    }
    // A change of the regions is a change of what the Wayspots are (a load counted itself).
    if (kept !== undefined) this.changes += 1;
    this.placement = { regions: generation, byRegion, ofWayspot };
    return this.placement;
  }
}
