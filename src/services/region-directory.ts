import type { Region } from '../db/repositories/region-repository.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { containment, ringContains } from '@pine/wayspot-core/region-membership';
import type { Logger } from '../log.js';
import type { StopRef } from '../domain/party/stops.js';

/** The part of `RegionRepository` the directory reads. */
export interface RegionListing {
  listAll(): Promise<Region[]>;
}

/** The gyms per server, as far as where a gym lies is concerned (`GymDirectory.of`). */
export interface ServerGymRegions {
  of(guildId: number | undefined): { regionsOf(gymId: number): string[] };
}

/**
 * The regions of a server that a gym of that server lies in, in the order `regionsOf` gives
 * their channels: the one rule for "a gym of this server here" and for "where in this server".
 * The server is named by its row (`Guild.id`); a gym is the server's by its link (plan 19B-2,
 * the server's view of the gyms: another server's gym lies in none of its regions, whatever
 * region holds it), and a region belongs to the server its own row says (`Region.guildId`),
 * whether or not its text channel still exists or is in any cache; a region without a
 * `guildId` belongs to no server.
 */
export function gymRegionsInGuild<R extends { guildId: number | null }>(
  gyms: ServerGymRegions,
  regions: { byChannel(channelId: string): R | undefined },
  gymId: number,
  guildId: number,
): R[] {
  return gyms
    .of(guildId)
    .regionsOf(gymId)
    .flatMap((channelId) => {
      const region = regions.byChannel(channelId);
      return region?.guildId === guildId ? [region] : [];
    });
}

/**
 * The regions of a server a stop of a route lies in (plan 8X-4; design 6.2): a gym's
 * (`gymRegionsInGuild`), a power spot's while it is kept as one (`WayspotProvider.regionsOf`);
 * none for a power spot without Wayspots, or one gone or of another kind now.
 */
export function stopRegionsInGuild<R extends { guildId: number | null }>(
  places: {
    gyms: ServerGymRegions;
    wayspots?: {
      byId(id: string): { kind: string } | undefined;
      regionsOf(id: string): string[];
    };
  },
  regions: { byChannel(channelId: string): R | undefined },
  ref: StopRef,
  guildId: number,
): R[] {
  if (ref.kind === 'gym') return gymRegionsInGuild(places.gyms, regions, ref.id, guildId);
  const { wayspots } = places;
  if (wayspots?.byId(ref.id)?.kind !== 'powerspot') return [];
  return wayspots.regionsOf(ref.id).flatMap((channelId) => {
    const region = regions.byChannel(channelId);
    return region?.guildId === guildId ? [region] : [];
  });
}

/**
 * The channels of the regions a gym lies in, in each server it belongs to (plan 19B-2: each
 * server's view, never another server's region that happens to hold it), each once, in the order
 * of its servers: what the instance's own upkeep goes by (the line that waits for Google ranks a
 * gym by its best region, `GoogleRanks`). None for a gym of no server or in none of their regions.
 * Asked of every gym, it builds no server's view (`regionsIn`: the one rule for this gym alone).
 */
export function gymRegionsOfItsServers(
  gyms: {
    serversOf(gymId: number): readonly number[];
    regionsIn(guildId: number, gymId: number): readonly string[];
  },
  gymId: number,
): string[] {
  return [...new Set(gyms.serversOf(gymId).flatMap((guildId) => gyms.regionsIn(guildId, gymId)))];
}

/** Whether a gym lies in a region of a server (`gymRegionsInGuild`). */
export function gymInGuild(
  gyms: ServerGymRegions,
  regions: { byChannel(channelId: string): { guildId: number | null } | undefined },
  gymId: number,
  guildId: number,
): boolean {
  return gymRegionsInGuild(gyms, regions, gymId, guildId).length > 0;
}

/**
 * The regions of a server whose outlines hold a point (a point of the live map, plan 8M-4S), in
 * the order the regions are given (oldest first), one per channel (of several rows of one
 * channel the first, as `gymsByRegion` counts them). A region without an outline holds nothing.
 */
export function regionsAtPoint<
  R extends { guildId: number | null; channelId: string; bounds: readonly LatLon[] | null },
>(regions: readonly R[], guildId: number, point: LatLon): R[] {
  const channels = new Set<string>();
  return regions.filter((region) => {
    if (region.guildId !== guildId || channels.has(region.channelId)) return false;
    channels.add(region.channelId);
    return region.bounds !== null && ringContains(region.bounds, point);
  });
}

/**
 * `regionsAtPoint` for many points of one server (plan 8R-3: the reports a map polls): the
 * server's regions taken once, as `regionsAtPoint` takes them, each outline's box made once
 * (`containment`), so that a point outside a region's box costs four comparisons.
 */
export function regionsAtPoints<
  R extends { guildId: number | null; channelId: string; bounds: readonly LatLon[] | null },
>(regions: readonly R[], guildId: number): (point: LatLon) => R[] {
  const channels = new Set<string>();
  const outlined = regions.flatMap((region) => {
    if (region.guildId !== guildId || channels.has(region.channelId)) return [];
    channels.add(region.channelId);
    return region.bounds === null ? [] : [{ region, holds: containment(region.bounds) }];
  });
  return (point) => outlined.filter(({ holds }) => holds(point)).map(({ region }) => region);
}

/**
 * Where the regions are, as one text: each region's id, server, channel and outline, by id.
 * Two loads with the same text put every place in the same regions.
 */
export function outlineSignature(regions: readonly Region[]): string {
  return JSON.stringify(
    [...regions]
      .sort((a, b) => a.id - b.id)
      .map((region) => [region.id, region.guildId, region.channelId, region.bounds]),
  );
}

/** What handlers need: the regions, from memory. */
export interface RegionProvider {
  /** By row id. */
  byId(id: number): Region | undefined;
  /** By the region's text channel. */
  byChannel(channelId: string): Region | undefined;
  /** By the forum that holds the region's party posts. */
  byForum(forumChannelId: string): Region | undefined;
  /** Every region, oldest first. */
  all(): readonly Region[];
}

/**
 * All regions in memory, read from the database. Call `load` again after a region was added or
 * removed or got its forum (`/admin setup-forums`); reads use the last complete state.
 *
 * `GymDirectory` holds its own copy of the regions (for the gyms' places), so both must be
 * loaded again after a region changes.
 */
export class RegionDirectory implements RegionProvider {
  private regions: readonly Region[] | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private loads = 0;
  private readonly listeners: (() => void)[] = [];
  /** The outlines of the last load (`outlineSignature`); undefined before the first. */
  private outlines: string | undefined;

  constructor(private readonly options: { regions: RegionListing; log: Logger }) {}

  /**
   * Calls `listener` after a load that changed where the regions are (a region added or removed,
   * an outline saved, a region of another server or channel; the first load too), not after one
   * that changed only a forum, a board or a description (`/admin setup-forums` loads many
   * times): what follows the regions' outlines without asking (the line for Google's PokéStops
   * and Power Spots, plan 8W-6). A listener that throws is logged; the others are still called.
   */
  whenOutlinesChanged(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * A number that changes with every load: what is built from the regions (the web map's view)
   * is built anew when it differs from the one it was built at.
   */
  get generation(): number {
    return this.loads;
  }

  private get current(): readonly Region[] {
    if (!this.regions) throw new Error('Regions have not been loaded yet');
    return this.regions;
  }

  /** Reads every region. Loads asked for at the same time run one after the other. */
  load(): Promise<void> {
    const result = this.queue.then(async () => {
      this.regions = await this.options.regions.listAll();
      this.loads += 1;
      const forums = this.regions.filter((region) => region.forumChannelId !== null).length;
      this.options.log.info({ regions: this.regions.length, forums }, 'regions loaded');
      const outlines = outlineSignature(this.regions);
      if (outlines === this.outlines) return;
      this.outlines = outlines;
      for (const listener of this.listeners) {
        try {
          listener();
        } catch (err) {
          this.options.log.warn({ err }, 'could not follow a change of the regions');
        }
      }
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  byId(id: number): Region | undefined {
    return this.current.find((region) => region.id === id);
  }

  byChannel(channelId: string): Region | undefined {
    return this.current.find((region) => region.channelId === channelId);
  }

  byForum(forumChannelId: string): Region | undefined {
    return this.current.find((region) => region.forumChannelId === forumChannelId);
  }

  all(): readonly Region[] {
    return this.current;
  }
}
