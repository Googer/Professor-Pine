import type { Region } from '../db/repositories/region-repository.js';
import type { WayspotStorage } from '../db/repositories/wayspot-repository.js';
import { BoundedMap } from '../bounded-map.js';
import { answerCell } from '../domain/geo/answer-point.js';
import { placingRegions } from '../domain/gyms/gym-server.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { containment } from '@pine/wayspot-core/region-membership';
import type { WayspotKind } from '@pine/wayspot-core/export-file';
import {
  WAYSPOT_MOVED_METRES,
  wayspotAddress,
  type AddressedWayspot,
  type LookedUpAddress,
} from '../domain/geo/spot-address.js';
import type { GoogleAnswers, KeptPlaces, PlaceKeeper } from './google-answers.js';
import type { PineStop } from '../domain/stops/pine-stop.js';
import { pineStopKey } from '../domain/stops/report.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { Logger } from '../log.js';
import { MAX_SERVER_VIEWS } from './server-gyms.js';

/** A kept Wayspot near a point, with how far from it. */
export interface NearWayspot {
  wayspot: Wayspot;
  metres: number;
}

/**
 * A server's Wayspots (plan 19B-3): the PokéStops, Power Spots and Wayfarer gyms its imports kept
 * (`ServerWayspot`, its own rows) and its stops of Pine's own, placed in the server's regions
 * only. Another server's Wayspot is not there, whatever its Wayfarer id and wherever it lies.
 * Every Wayspot id a member gives (an option, a custom id's argument, a web route) is read through
 * the view of the server it came from. A view is what the server's Wayspots are when it is read:
 * ask for it again (`of`) after an await, never keep one.
 */
export interface WayspotView {
  /** The server's Wayspot with this id; undefined for none, and for another server's. */
  byId(id: string): Wayspot | undefined;
  /**
   * A Wayspot's address as one line for every reader (`wayspotAddress`): Wayfarer's where it
   * gives one, else a Power Spot's looked-up address while it is where it was asked. Empty for none.
   */
  addressOf(wayspot: AddressedWayspot & { id: string }): string;
  /** The server's Wayspots, in no particular order (a new list). */
  all(): Wayspot[];
  /** The server's Wayspots in its region of this channel (a new list). */
  inRegion(channelId: string): Wayspot[];
  /** The channels of the server's regions one of its Wayspots lies in; empty for none. */
  regionsOf(id: string): string[];
  /** The server's Wayspots within `metres` of a point, nearest first; only of `kinds` when given. */
  near(point: LatLon, metres: number, kinds?: readonly WayspotKind[]): NearWayspot[];
}

/**
 * What handlers need of the kept Wayspots (plan 8W-2, per server since plan 19B-3): a server's
 * view (`of`), a stored reference (`stored`), and for the instance's upkeep the servers that have
 * Wayspots and where one lies (`regionsIn`).
 */
export interface WayspotProvider {
  /**
   * A number that changes with every load, forget and change of the regions' outlines: what is
   * built from the Wayspots (the region editor's layers, 8M-2; the search indexes) is built anew
   * when it differs.
   */
  readonly generation: number;
  /**
   * A number that changes with every load and every change of the stops of Pine's own, whichever
   * server's: what is built of every server's Wayspots is built anew when it differs. A change of
   * the regions and a forget leave it: what is built of them passes over a forgotten Wayspot
   * through where they lie (`inRegion`, `byId`), which a forget changes at once.
   */
  readonly contentGeneration: number;
  /**
   * As `contentGeneration`, for one server: it changes only with a load of that server's rows (or
   * of every server's, at start) and a change of its stops of Pine's own, so that what is built
   * of one server's Wayspots (its search index) is built anew only when that server's changed.
   */
  contentGenerationOf(guildId: number): number;
  /**
   * How many Wayspots every server keeps now (0 before the first load); the stops of Pine's own
   * (plan 8R-1) are not counted, so that a sweep waiting for kept Wayspots (`TrainService`)
   * waits for them.
   */
  readonly size: number;
  /**
   * Calls `listener` with each server (its `Guild` row) whose Wayspots changed, after every change
   * of its `contentGenerationOf` (it should not throw): a listener acts on that server alone.
   */
  whenChanged(listener: (guildId: number) => void): void;
  /** The Wayspots of a server, by its `Guild` row (undefined: a server without one, none). */
  of(guildId: number | undefined): WayspotView;
  /**
   * A Wayspot a server stored a reference to (a stop report's stop, a party's spot or stop, a
   * history row, a ruling): the server's own row, as its view gives it, read without a view.
   * Never for an id a member gives.
   */
  stored(guildId: number | undefined, id: string): Wayspot | undefined;
  /** As `WayspotView.addressOf`: the address is the place's, not a server's. */
  addressOf(wayspot: AddressedWayspot & { id: string }): string;
  /** The servers (`Guild` rows) that keep a Wayspot or a stop of Pine's own, in order. */
  servers(): number[];
  /**
   * A server's Wayspots as held, never copied (its view's `all` makes a list): for the instance's
   * work over every server's (a picture's address looked up). Read at once, never kept.
   */
  eachOf(guildId: number): Iterable<Wayspot>;
  /**
   * The channels of a server's regions one of its Wayspots lies in, as its view's `regionsOf`
   * gives them, without working out where the server's other Wayspots lie: for the instance's
   * upkeep, which asks it of every Wayspot of every server (the Google line's ranks).
   */
  regionsIn(guildId: number, id: string): string[];
}

export interface WayspotDirectoryOptions {
  /** `everyServer` at start; `all(guildId)` for a load of one server (after its import). */
  wayspots: Pick<WayspotStorage, 'everyServer' | 'all'>;
  /**
   * The regions: their outlines say where each Wayspot lies, worked out again when their
   * `generation` changes (without one, at each load of the Wayspots).
   */
  regions: { all(): readonly Region[]; readonly generation?: number };
  log: Logger;
  /**
   * The addresses Google gave for Power Spots the map asked about (`WayspotAddresses`), by the
   * place (plan 19B-3: the point's answer, every server's copy alike); without it a Wayspot has
   * Wayfarer's address alone.
   */
  addresses?: { lookedUp(point: LatLon): LookedUpAddress | undefined };
  /** How many servers' placements are kept worked out (`MAX_SERVER_VIEWS`). */
  maxPlacements?: number;
  /**
   * Google's answers by the point (plan 19B-3): a load of a server that finds one of its Wayspots
   * moved no farther than `WAYSPOT_MOVED_METRES` (an import's correction) keeps what was answered
   * about its old place at its new one (`GoogleAnswers.carry`) before anyone is told, so that it is
   * not asked about again. Without it (tests), nothing is carried.
   */
  answers?: Pick<GoogleAnswers, 'carry'>;
}

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/**
 * A stop of Pine's own (`/pokestop`, plan 8R-1) as the directory takes it: the stop, and the row
 * of its server in `Guild` (undefined when the server has none: then it is nobody's).
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

/** Where a server's Wayspots lie in its regions, worked out for one state of the regions. */
interface Placement {
  byRegion: Map<string, Set<string>>;
  ofWayspot: Map<string, string[]>;
}

/** A region's outline as a test of points, with its channel. */
interface Outline {
  channelId: string;
  contains: (point: LatLon) => boolean;
}

/** The view of a server without a row: nothing. */
const NONE: WayspotView = {
  byId: () => undefined,
  addressOf: (wayspot) => wayspotAddress(wayspot, undefined),
  all: () => [],
  inRegion: () => [],
  regionsOf: () => [],
  near: () => [],
};

/**
 * Every server's kept Wayspots in memory, read from the database (`load()`: every server's, at
 * start only; `load(guildId)`: one server's, after its import was applied), with the stops of
 * Pine's own. Reads never wait: they use the last complete state, empty until the first load. A
 * Wayspot of a server that became the server's gym is `forget`-ed at once (the import's write
 * deleted the server's row), and stays forgotten when a load that read the rows before it was
 * deleted finishes after. Where each server's Wayspots lie is worked out when the server first
 * asks after a change of the regions or of its own Wayspots, and kept for at most `maxPlacements`
 * servers, the one asked for longest ago going first. One server's change touches no other
 * server's placement, generation or listeners.
 */
export class WayspotDirectory implements WayspotProvider, PlaceKeeper {
  /** The kept Wayspots of each server, by server and id. */
  private rows = new Map<number, Map<string, Wayspot>>();
  /** The stops of Pine's own (plan 8R-1), by server and key. */
  private pine = new Map<number, Map<string, Wayspot>>();
  private placements: BoundedMap<number, Placement>;
  /** The outlines of each server's regions, for the regions' generation `regionsAt`. */
  private outlines: Map<number, Outline[]> | undefined;
  private regionsAt: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private changes = 0;
  private contents = 0;
  /** Each server's `contentGenerationOf`. */
  private readonly contentsOf = new Map<number, number>();
  private kept = 0;
  private readonly listeners: ((guildId: number) => void)[] = [];
  /**
   * The ids forgotten, by server, while the load under way reads and keeps the answers of the
   * moved (until its swap), if one does.
   */
  private forgottenMeanwhile: Map<number, Set<string>> | undefined;
  /** How many placements were worked out: for tests. */
  placementsBuilt = 0;

  constructor(private readonly options: WayspotDirectoryOptions) {
    this.placements = new BoundedMap(options.maxPlacements ?? MAX_SERVER_VIEWS);
  }

  get generation(): number {
    this.regionsNow();
    return this.changes;
  }

  get contentGeneration(): number {
    return this.contents;
  }

  contentGenerationOf(guildId: number): number {
    return this.contentsOf.get(guildId) ?? 0;
  }

  get size(): number {
    return this.kept;
  }

  whenChanged(listener: (guildId: number) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Reads the kept Wayspots: without a server, every server's (at start only: an instance's
   * thousands of Wayspots, read once); with one, that server's rows alone (after its import), the
   * others left as they are. Loads asked for at the same time run one after the other.
   */
  load(guildId?: number): Promise<void> {
    const result = this.queue.then(async () => {
      // What is forgotten from the read until the swap (the read and the answers of the moved
      // ones are written meanwhile) is left out of what is swapped in.
      const forgotten = new Map<number, Set<string>>();
      this.forgottenMeanwhile = forgotten;
      let read: { guildId: number; wayspot: Wayspot }[];
      const rows = new Map<number, Map<string, Wayspot>>();
      try {
        read =
          guildId === undefined
            ? await this.options.wayspots.everyServer()
            : (await this.options.wayspots.all(guildId)).map((wayspot) => ({ guildId, wayspot }));
        // A server's load: that server has its rows read, none when it has none left.
        if (guildId !== undefined) rows.set(guildId, new Map());
        for (const row of read) {
          let ofServer = rows.get(row.guildId);
          if (!ofServer) rows.set(row.guildId, (ofServer = new Map<string, Wayspot>()));
          ofServer.set(row.wayspot.id, row.wayspot);
        }
        await this.carryMoved(rows);
      } finally {
        this.forgottenMeanwhile = undefined;
      }
      const started = performance.now();
      for (const [server, ids] of forgotten) {
        for (const id of ids) rows.get(server)?.delete(id);
      }
      // Every server's: the servers that had rows and have none now are changed too.
      const changed = new Set(guildId === undefined ? this.rows.keys() : []);
      if (guildId === undefined) this.rows = new Map();
      for (const [server, ofServer] of rows) {
        changed.add(server);
        if (ofServer.size === 0) this.rows.delete(server);
        else this.rows.set(server, ofServer);
      }
      this.kept = [...this.rows.values()].reduce((sum, ofServer) => sum + ofServer.size, 0);
      this.contentChanged([...changed].sort((a, b) => a - b));
      this.options.log.info(
        {
          wayspots: [...rows.values()].reduce((sum, ofServer) => sum + ofServer.size, 0),
          servers: rows.size,
          ...(guildId === undefined ? {} : { guild: guildId }),
          ms: Math.round(performance.now() - started),
        },
        'Wayspots loaded',
      );
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Keeps what was answered about the old place of each Wayspot a load found moved a few meters
   * at its new one (`answers`). Never rejects: what cannot be written is logged, and the Wayspot
   * is asked about as one never asked.
   */
  private async carryMoved(read: ReadonlyMap<number, ReadonlyMap<string, Wayspot>>): Promise<void> {
    const { answers, log } = this.options;
    if (!answers) return;
    const moves: { from: LatLon; to: LatLon }[] = [];
    for (const [guildId, ofServer] of read) {
      const before = this.rows.get(guildId);
      if (!before) continue;
      for (const [id, now] of ofServer) {
        const was = before.get(id);
        if (!was || (was.lat === now.lat && was.lon === now.lon)) continue;
        if (metresBetween(was, now) <= WAYSPOT_MOVED_METRES) moves.push({ from: was, to: now });
      }
    }
    if (moves.length === 0) return;
    try {
      await answers.carry(moves);
    } catch (err) {
      log.warn(
        { err, wayspots: moves.length },
        'could not keep the answers of Wayspots that moved',
      );
    }
  }

  /** Takes these Wayspots of a server out of memory at once (they became its gyms; its rows are deleted). */
  forget(guildId: number, ids: readonly string[]): void {
    const ofServer = this.rows.get(guildId);
    const placement = this.placements.get(guildId);
    let forgot = false;
    const meanwhile = this.forgottenMeanwhile;
    if (meanwhile && !meanwhile.has(guildId)) meanwhile.set(guildId, new Set());
    for (const id of ids) {
      meanwhile?.get(guildId)?.add(id);
      if (!ofServer?.delete(id)) continue;
      forgot = true;
      this.kept -= 1;
      for (const channelId of placement?.ofWayspot.get(id) ?? []) {
        placement?.byRegion.get(channelId)?.delete(id);
      }
      placement?.ofWayspot.delete(id);
    }
    if (forgot) this.changes += 1;
  }

  /**
   * Every server's Wayspots and stops of Pine's own as the daily sweep of Google's answers looks
   * them up (`GoogleAnswers.sweep`): whether one lies within `WAYSPOT_MOVED_METRES` of a point,
   * wherever it lies, from the cells around it (`answerCell`). The index is built for the caller
   * alone, as the Wayspots are now, and never kept here: the sweep lets it go when it ends, so
   * that no copy of an instance's Wayspots by cell stays in memory between sweeps.
   */
  keptPlaces(): KeptPlaces {
    const cells = new Map<string, Wayspot[]>();
    for (const held of [this.rows, this.pine]) {
      for (const ofServer of held.values()) {
        for (const wayspot of ofServer.values()) {
          const cell = answerCell(wayspot);
          const key = `${String(cell.lat)}:${String(cell.lon)}`;
          const inCell = cells.get(key);
          if (inCell) inCell.push(wayspot);
          else cells.set(key, [wayspot]);
        }
      }
    }
    return {
      anyNear: (point) => {
        const cell = answerCell(point);
        for (let lat = cell.lat - 1; lat <= cell.lat + 1; lat++) {
          for (let lon = cell.lon - 1; lon <= cell.lon + 1; lon++) {
            for (const wayspot of cells.get(`${String(lat)}:${String(lon)}`) ?? []) {
              if (metresBetween(point, wayspot) <= WAYSPOT_MOVED_METRES) return true;
            }
          }
        }
        return false;
      },
    };
  }

  /**
   * Takes these as the stops of Pine's own (plan 8R-1: `PineStopService`, at start and after
   * every change), in the place of those it held: each is found as a PokéStop of its own server
   * beside its kept Wayspots, in that server's regions only, and a change of them is a change of
   * what the Wayspots of its server are (that server's search index, the region editor and the
   * map build anew); a server whose stops are as they were is not changed. A stop whose server
   * has no row is nobody's. A load of the kept Wayspots leaves them as they are.
   */
  setPineStops(stops: readonly PlacedPineStop[]): void {
    const pine = new Map<number, Map<string, Wayspot>>();
    for (const { stop, guildRow } of stops) {
      if (guildRow === undefined) continue;
      const wayspot = pineStopWayspot(stop);
      let ofServer = pine.get(guildRow);
      if (!ofServer) pine.set(guildRow, (ofServer = new Map<string, Wayspot>()));
      ofServer.set(wayspot.id, wayspot);
    }
    const changed = [...new Set([...this.pine.keys(), ...pine.keys()])]
      .filter((guildId) => !sameStops(this.pine.get(guildId), pine.get(guildId)))
      .sort((a, b) => a - b);
    this.pine = pine;
    this.contentChanged(changed);
  }

  /**
   * What these servers' Wayspots are changed: their placements are worked out again when asked
   * for, their generations go up, and each is told; no other server is touched.
   */
  private contentChanged(servers: readonly number[]): void {
    if (servers.length === 0) return;
    for (const guildId of servers) {
      this.placements.delete(guildId);
      this.contentsOf.set(guildId, this.contentGenerationOf(guildId) + 1);
    }
    if (this.options.regions.generation === undefined) this.outlines = undefined;
    this.changes += 1;
    this.contents += 1;
    for (const guildId of servers) {
      for (const listener of this.listeners) listener(guildId);
    }
  }

  of(guildId: number | undefined): WayspotView {
    if (guildId === undefined) return NONE;
    return {
      byId: (id) => this.stored(guildId, id),
      addressOf: (wayspot) => this.addressOf(wayspot),
      all: () => [...this.every(guildId)],
      inRegion: (channelId) => {
        const ids = this.placement(guildId).byRegion.get(channelId);
        return ids === undefined ? [] : [...ids].flatMap((id) => this.stored(guildId, id) ?? []);
      },
      regionsOf: (id) => [...(this.placement(guildId).ofWayspot.get(id) ?? [])],
      near: (point, metres, kinds) => this.nearIn(guildId, point, metres, kinds),
    };
  }

  stored(guildId: number | undefined, id: string): Wayspot | undefined {
    if (guildId === undefined) return undefined;
    return this.rows.get(guildId)?.get(id) ?? this.pine.get(guildId)?.get(id);
  }

  addressOf(wayspot: AddressedWayspot & { id: string }): string {
    return wayspotAddress(wayspot, this.options.addresses?.lookedUp(wayspot));
  }

  servers(): number[] {
    return [...new Set([...this.rows.keys(), ...this.pine.keys()])].sort((a, b) => a - b);
  }

  regionsIn(guildId: number, id: string): string[] {
    const wayspot = this.stored(guildId, id);
    if (!wayspot) return [];
    this.regionsNow();
    const kept = this.placements.get(guildId);
    if (kept) return [...(kept.ofWayspot.get(id) ?? [])];
    return (this.outlinesOf(guildId) ?? [])
      .filter((region) => region.contains(wayspot))
      .map((region) => region.channelId);
  }

  eachOf(guildId: number): Iterable<Wayspot> {
    return this.every(guildId);
  }

  /** A server's kept Wayspots and stops of Pine's own. */
  private *every(guildId: number): Iterable<Wayspot> {
    yield* this.rows.get(guildId)?.values() ?? [];
    yield* this.pine.get(guildId)?.values() ?? [];
  }

  private nearIn(
    guildId: number,
    point: LatLon,
    metres: number,
    kinds?: readonly WayspotKind[],
  ): NearWayspot[] {
    const latReach = (metres / METRES_PER_DEGREE) * 1.01;
    const found: NearWayspot[] = [];
    for (const wayspot of this.every(guildId)) {
      if (Math.abs(wayspot.lat - point.lat) > latReach) continue;
      if (kinds !== undefined && !kinds.includes(wayspot.kind)) continue;
      const distance = metresBetween(point, wayspot);
      if (distance <= metres) found.push({ wayspot, metres: distance });
    }
    return found.sort((a, b) => a.metres - b.metres);
  }

  /**
   * Follows a change of the regions (their `generation`): every placement is worked out again,
   * and the change counts.
   */
  private regionsNow(): void {
    const generation = this.options.regions.generation;
    if (generation !== undefined && generation !== this.regionsAt) {
      const first = this.regionsAt === undefined;
      this.regionsAt = generation;
      this.outlines = undefined;
      this.placements.dropWhile(() => true);
      // A change of the regions is a change of where the Wayspots lie (the first look is none).
      if (!first) this.changes += 1;
    }
  }

  /** The outlines of a server's regions as they are now. */
  private outlinesOf(guildId: number): Outline[] | undefined {
    this.regionsNow();
    if (!this.outlines) {
      const outlines = new Map<number, Outline[]>();
      // The one rule of where a Wayspot lies, the upgrade's too (`placingRegions`, plan 19B-3):
      // a channel's first row, of a server.
      for (const region of placingRegions(this.options.regions.all())) {
        if (region.bounds === null) continue;
        let ofServer = outlines.get(region.guildId);
        if (!ofServer) outlines.set(region.guildId, (ofServer = []));
        ofServer.push({ channelId: region.channelId, contains: containment(region.bounds) });
      }
      this.outlines = outlines;
    }
    return this.outlines.get(guildId);
  }

  /** Where a server's Wayspots lie in its regions, for the regions as they are now. */
  private placement(guildId: number): Placement {
    const outlines = this.outlinesOf(guildId) ?? [];
    const kept = this.placements.get(guildId);
    if (kept) {
      // Asked for again: the newest, so that the placements of servers that ask go last.
      this.placements.set(guildId, kept);
      return kept;
    }
    const byRegion = new Map<string, Set<string>>();
    const ofWayspot = new Map<string, string[]>();
    for (const wayspot of this.every(guildId)) {
      const channels = outlines.filter((region) => region.contains(wayspot));
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
    const placement = { byRegion, ofWayspot };
    this.placementsBuilt += 1;
    this.placements.set(guildId, placement);
    return placement;
  }
}

/** Whether a server's stops of Pine's own are the same, in everything a reader shows of them. */
function sameStops(
  a: ReadonlyMap<string, Wayspot> | undefined,
  b: ReadonlyMap<string, Wayspot> | undefined,
): boolean {
  if ((a?.size ?? 0) !== (b?.size ?? 0)) return false;
  for (const [key, one] of a ?? []) {
    const other = b?.get(key);
    if (
      other?.lat !== one.lat ||
      other.lon !== one.lon ||
      other.title !== one.title ||
      other.address !== one.address ||
      other.firstSeen !== one.firstSeen ||
      other.lastSeen !== one.lastSeen ||
      other.pineServer !== one.pineServer
    ) {
      return false;
    }
  }
  return true;
}
