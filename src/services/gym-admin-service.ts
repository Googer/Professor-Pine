import { gymStop, hasStop } from '../domain/party/stops.js';
import type { Settings } from '../config/settings.js';
import type { GymTargetUpkeep } from '../db/repositories/gym-notification-repository.js';
import type { GymRemoval } from '../db/repositories/gym-removal-repository.js';
import type { Gym, GymPatch, GymStorage, NewGym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { SavedRouteUpkeep } from '../db/repositories/saved-route-repository.js';
import {
  looksLikeRefusedFile,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import { metresBetween, placesWithin } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { readLocation } from '../domain/geo/location-input.js';
import { ringContains } from '@pine/wayspot-core/region-membership';
import { withinReach } from '../domain/gyms/gym-server.js';
import { nearestBlockChanges } from '../domain/gyms/nearest.js';
import type { GymTexts } from '../domain/gyms/gym-text.js';
import { isRaid, isTrain, type RaidParty, type TrainParty } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import { tidiesName } from '../domain/wayspots/match.js';
import { addWayspotChanges, type WayspotChanges } from '../domain/wayspots/keep.js';
import {
  addChanges,
  anyChanges,
  gymListSummary,
  NO_CHANGES,
  type GymChangeSource,
  type GymListChanges,
} from '../render/gym-summary.js';
import { gymAnnouncement, gymLabel, gymRemovedLine } from '../render/gym-view.js';
import { mapPicture } from '../render/v2.js';
import { mapOrNothing, type MapProvider } from './static-maps.js';
import type { Member } from './attendance-service.js';
import type { GeoGateway } from './geo-gateway.js';
import type { GoogleLineSnapshot, GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
import { AdminLock } from './admin-lock.js';
import type { PartyStore } from './party-store.js';
import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
import type { TrainService } from './train-service.js';

/** Another gym this near to a place is asked about before a gym is put there. */
/** Another gym this near a place is named before one is added or moved there. */
export const DUPLICATE_METRES = 10;
/** A move of a gym further than this is asked about first: a gym is corrected by metres. */
export const FAR_MOVE_METRES = 500;
/**
 * How long the changes made by answers of the review queue are gathered before their summary is
 * posted: the summary goes this long after the last of them (staff answer item after item).
 */
export const REVIEW_SUMMARY_MS = 10 * 60_000;

/**
 * Who a staff member is and where, for what is said and noted about a change beyond the answer
 * to them: their snowflake (the log says who changed what), the row id of their server
 * (`Guild.id`; undefined when the server has no row yet), whose regions an answer names, and
 * channels of that server (the one the command was used in first), by which its channel for
 * bot updates is found.
 */
export interface StaffPlace {
  staffId: string;
  guildId: number | undefined;
  channelIds: readonly string[];
}

/**
 * What a text says about where a gym is. `approximate`: read from where a map was centred, not
 * from a pin. `link-nowhere`: a short link that was followed and names no coordinates;
 * `link-failed`: one that could not be followed at all.
 */
export type LocationOutcome =
  | { kind: 'point'; point: LatLon; approximate: boolean }
  | { kind: 'unreadable' | 'out-of-range' | 'link-failed' | 'link-nowhere' };

/** A gym near a place, with how far from it. */
export interface NearbyGym {
  gym: Gym;
  metres: number;
}

/**
 * What came of adding a gym. `near`: other gyms lie within `DUPLICATE_METRES` of the place
 * (all of them, nearest first) and at least one is not among those the staff member was asked
 * about; nothing was stored. `foreign`: the place lies only in regions of other servers
 * (`mayPlace`); nothing was stored.
 */
export type AddOutcome =
  { kind: 'added'; gym: Gym } | { kind: 'near'; near: NearbyGym[] } | { kind: 'foreign' };

/** What whoever moves a gym knew: where the gym was, and the gyms near the new place they were told of. */
export interface MoveAsked {
  from: LatLon;
  nearIds: readonly number[];
}

/**
 * What came of moving a gym: the gym as it is now, where it was and how far it went
 * (`moved`); or nothing was moved, because another gym lies within `DUPLICATE_METRES` of the new
 * place that was not named (`near`: all of them, nearest first), because the gym is no longer
 * where it was said to be (`elsewhere`: somebody else moved it; the gym as it is), or because
 * the new place lies only in regions of other servers (`foreign`; `mayPlace`).
 */
export type MoveOutcome =
  | { kind: 'moved'; gym: Gym; from: LatLon; metres: number }
  | { kind: 'near'; near: NearbyGym[] }
  | { kind: 'elsewhere'; gym: Gym }
  | { kind: 'foreign' };

/** What a batch writes of a gym beside its place (`GymBatch.update`): what a Wayfarer import changes. */
export type BatchPatch = Pick<GymPatch, 'name' | 'pogoId' | 'imageUrl' | 'geodata'>;

/** What came of a move in a batch: as `move`, without the questions a batch does not ask. */
export type BatchMoveOutcome = Extract<MoveOutcome, { kind: 'moved' | 'foreign' }>;

/** A gym of a block (`GymBatch.addBlock`): the gym, the gyms near it it may stand beside. */
export interface BlockGym {
  gym: NewGym;
  knownNearIds?: readonly number[];
  /** It was a PokéStop, which the summary counts. */
  promoted?: boolean;
}

/** What came of a gym of a block: as `add`, or `failed` when it could not be written. */
export type BlockOutcome = AddOutcome | { kind: 'failed' };

/**
 * Gym administration inside `GymAdminService.batch`, under the lock the batch holds: what a
 * Wayfarer import (and a decision of its review queue) does to many gyms at once. Each method
 * is what its namesake of the service does, for the staff member's server (`mayTouch`,
 * `mayPlace`), with the same upkeep and the same log lines, but without taking the lock and
 * without an announcement of its own. A write that fails rejects, and nothing of that gym has
 * changed; what fails after the write is logged, and the change stands.
 */
export interface GymBatch {
  /**
   * Adds a gym, unless another gym lies within ten metres that is not among `knownNearIds`
   * (`near`) or the place lies only in regions of other servers (`foreign`). What the batch
   * changed is announced as one summary, at its end (`gymListSummary`); `promoted`: the gym was a
   * PokéStop, which the summary counts.
   */
  add(
    gym: NewGym,
    knownNearIds?: readonly number[],
    options?: { promoted?: boolean },
  ): Promise<AddOutcome>;
  /**
   * Adds gyms as one block (plan 8W-6: a Wayfarer import's new gyms, in blocks of
   * `IMPORT_BLOCK`): each is decided first as `add` decides (`foreign`, `near` a gym not among
   * its `knownNearIds`; the other gyms of the block count as known to each other, as the gyms an
   * import added one by one were), then those accepted are written in one transaction with the
   * nearest gyms worked out once for the block (`nearestBlockChanges`), and the directory and
   * the line follow once for the block. When the block's transaction fails, nothing of it was
   * written and its gyms are added one by one, so that a gym that cannot be written fails alone
   * (`failed`, logged). One outcome per gym, in order.
   */
  addBlock(gyms: readonly BlockGym[]): Promise<BlockOutcome[]>;
  /**
   * Moves a gym, wherever other gyms are (the batch knows where it puts gyms); `places` says
   * whether its address and the places around it are fetched again (`GymUpkeep.placed`, in its
   * slow line, as for every gym a batch adds: an import moves and adds thousands), `address:
   * false` its places only (it took the Wayspot's address): the nearest gyms and the posts follow
   * either way. `patch`: fields written with the place, in the same row write, so that a move
   * refused (`foreign`) writes none of them and a rename is counted only with the move.
   * Undefined when there is no such gym, or none the server may touch.
   */
  move(
    id: number,
    point: LatLon,
    options: { places: boolean; address?: boolean; patch?: BatchPatch },
  ): Promise<BatchMoveOutcome | undefined>;
  /** Writes these fields of a gym. Undefined when there is no such gym, or none the server may touch. */
  update(id: number, patch: BatchPatch): Promise<Gym | undefined>;
  /**
   * Deletes a gym as `delete` does, refused while an active raid is there (`raid-there`); the
   * deletion is counted in the batch's summary, not announced by itself.
   */
  remove(id: number, by: Member): Promise<DeleteOutcome>;
  /**
   * Counts what the work changed of the kept PokéStops and power spots (an import's, written
   * by the work itself), for the summary at the batch's end.
   */
  countWayspots(changes: WayspotChanges): void;
}

/** What a gym has that goes with it when it is deleted. */
interface GymReferences {
  /** The active raids at the gym: while there is one, the gym cannot be deleted. */
  raids: RaidParty[];
  /** How many active trains have it as a stop. */
  trains: number;
  /** How many saved routes have it as a stop. */
  routes: number;
  /** How many members have it as a gym target. */
  targets: number;
}

export type DeleteOutcome =
  /** There is no such gym (any more). */
  | { kind: 'gone' }
  /** What the caller asked inside the lock (`onlyIf`) no longer holds: nothing was done. */
  | { kind: 'withdrawn' }
  /** An active raid is at the gym. */
  | { kind: 'raid-there'; raid: RaidParty }
  /** The gym and what refers to it could not be removed: nothing has changed. */
  | { kind: 'failed' }
  /**
   * The gym as it was, and what went with it: the trains it was taken off, the saved routes
   * that had it, the members who had it as a gym target. `unmended` are the active trains that
   * still have it on their route because that could not be changed.
   */
  | {
      kind: 'deleted';
      gym: Gym;
      trains: number;
      routes: number;
      targets: number;
      unmended: TrainParty[];
    };

export interface GymAdminOptions {
  gyms: GymStorage;
  /** The gym's row with the saved routes and gym targets that name it, removed as one. */
  removal: GymRemoval;
  directory: GymsInMemory & { regionsOf(gymId: number): string[]; forget(id: number): boolean };
  regions: Pick<RegionProvider, 'byChannel' | 'all'>;
  store: Pick<PartyStore, 'active' | 'withGymLock'>;
  trains: Pick<TrainService, 'gymRemoved'>;
  routes: Pick<SavedRouteUpkeep, 'countWithGym'>;
  targets: Pick<GymTargetUpkeep, 'membersTargeting'>;
  upkeep: Pick<
    GymUpkeep,
    'gymChanged' | 'placed' | 'placedBlock' | 'removed' | 'refresh' | 'fetches' | 'snapshot'
  >;
  geo: Pick<GeoGateway, 'followShortLink'>;
  /** To announce a new gym and a deletion in the server's channel for bot updates. */
  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage'>;
  /** The map of a new gym for its announcement; without it the announcement has none. */
  maps?: Pick<MapProvider, 'gym'>;
  /** How long the review's changes are gathered (`REVIEW_SUMMARY_MS`). */
  reviewSummaryMs?: number;
  settings: Settings;
  log: Logger;
  /**
   * The lock that adding, moving and deleting run under. The bot gives the one it also gives
   * region administration, so that the two exclude each other; without it, one of its own.
   */
  lock?: AdminLock;
}

/**
 * Gym administration (`/gym`): adding a gym, changing its texts, its place and whether it is an
 * elite raid gym, and deleting it with what refers to it. Every change is written first; then
 * the directory reads the gym again and the posts that show it are rendered anew
 * (`GymUpkeep.gymChanged`), so what an answer shows is what members find. Every change is noted
 * in the log with who made it: the staff member, the gym, and what (the fields of an edit by
 * name, never their texts; the old and the new place of a move).
 *
 * No server's staff administer the gyms of another (Matt, 2026-10-13; the rule is
 * `withinReach`): a gym that lies only in regions of other servers is, for them, a gym that
 * does not exist (`mayTouch`), and a place there is none to put a gym (`mayPlace`). The `gym`
 * option of the commands asks `mayTouch` for whatever is typed or offered; `add`, `move` and
 * `delete` decide again themselves, under the lock, since a question may be minutes old and
 * gyms and regions change meanwhile.
 *
 * Adding, moving and deleting run one at a time (one lock): the question "is another gym
 * within ten metres" and the bookkeeping of nearest gyms assume that nothing else changes where
 * gyms are meanwhile. Changing texts or the elite flag needs no lock. The lock is the one
 * region administration changes regions under (`AdminLock`): what a server's staff may touch
 * is decided by the regions' rows, which therefore do not change while it is held.
 *
 * A deletion and a raid at the gym exclude each other: the deletion holds the lock a report of
 * that gym takes (`PartyStore.withGymLock`) from its check for a raid until the directory no
 * longer has the gym, and whoever stores a raid at a gym asks under that lock whether the gym
 * still exists.
 */
export class GymAdminService {
  private readonly lock: AdminLock;
  private readonly announcing = new Set<Promise<unknown>>();
  /** The changes of the review queue that wait for their summary, by server. */
  private readonly gathered = new Map<
    string,
    { place: StaffPlace; changes: GymListChanges; cancel: () => void }
  >();

  constructor(private readonly options: GymAdminOptions) {
    this.lock = options.lock ?? new AdminLock();
  }

  /** Whether address and nearby places are fetched at all (a Google API key is configured). */
  get fetches(): boolean {
    return this.options.upkeep.fetches;
  }

  /**
   * Reads where a gym is from what a staff member typed (`readLocation`); a short link of the
   * Maps app is followed to the address it leads to, which is then read the same way.
   */
  async readLocation(text: string): Promise<LocationOutcome> {
    const reading = readLocation(text);
    if (reading.kind === 'point') {
      return { kind: 'point', point: reading.point, approximate: reading.approximate === true };
    }
    if (reading.kind !== 'short-link') return reading;
    // The first address on the link's way that names the place itself. One that only has
    // where a map was centred is kept for when nothing better follows, and the link is
    // followed on: a later address may carry the pin. Without either, whether the link led
    // anywhere at all says which sentence to answer.
    let led = false;
    let nearby: LatLon | undefined;
    const address = await this.options.geo.followShortLink(reading.url, (candidate) => {
      led = true;
      const read = readLocation(candidate);
      if (read.kind !== 'point') return false;
      if (read.approximate !== true) return true;
      nearby ??= read.point;
      return false;
    });
    const followed = address === undefined ? undefined : readLocation(address);
    if (followed?.kind === 'point') {
      return { kind: 'point', point: followed.point, approximate: followed.approximate === true };
    }
    if (nearby) return { kind: 'point', point: nearby, approximate: true };
    return { kind: led ? 'link-nowhere' : 'link-failed' };
  }

  /**
   * The gyms within `DUPLICATE_METRES` of a point, nearest first: any gym, wherever it lies.
   * `exceptId` leaves out the gym that is being moved.
   */
  near(point: LatLon, exceptId?: number): NearbyGym[] {
    return placesWithin(point, this.options.directory.all(), DUPLICATE_METRES, exceptId).map(
      ({ place, metres }) => ({ gym: place, metres }),
    );
  }

  /** The regions of a server (by its row id) a gym lies in. */
  regionsOf(gymId: number, guildId: number | undefined): Region[] {
    const { directory, regions } = this.options;
    return guildId === undefined ? [] : gymRegionsInGuild(directory, regions, gymId, guildId);
  }

  /** The regions of a server (by its row id) a point lies in: where a gym there would be. */
  regionsAt(point: LatLon, guildId: number | undefined): Region[] {
    if (guildId === undefined) return [];
    return this.options.regions
      .all()
      .filter(
        (region) =>
          region.guildId === guildId &&
          region.bounds !== null &&
          ringContains(region.bounds, point),
      );
  }

  /**
   * Whether the staff of a server (by its row id; undefined when it has none) may touch a gym:
   * it lies in a region of their server, or in no region of any server (`withinReach`). Whose
   * a region is its own row says, never the channel cache.
   */
  mayTouch(gymId: number, guildId: number | undefined): boolean {
    const { directory, regions } = this.options;
    const servers = directory
      .regionsOf(gymId)
      .map((channelId) => regions.byChannel(channelId)?.guildId ?? null);
    return withinReach(servers, guildId);
  }

  /** Whether the staff of a server may put a gym at a place: the rule of `mayTouch`, for a point. */
  mayPlace(point: LatLon, guildId: number | undefined): boolean {
    const servers = this.options.regions
      .all()
      .filter((region) => region.bounds !== null && ringContains(region.bounds, point))
      .map((region) => region.guildId);
    return withinReach(servers, guildId);
  }

  /** Whether a gym lies in a region of any server: only there a raid can be reported at it. */
  inAnyRegion(gymId: number): boolean {
    const { directory, regions } = this.options;
    return directory
      .regionsOf(gymId)
      .some((channelId) => (regions.byChannel(channelId)?.guildId ?? null) !== null);
  }

  /** The active parties that show a gym: the raids at it, and the trains with it on their route. */
  shownBy(gymId: number): { raids: RaidParty[]; trains: TrainParty[] } {
    const active = this.options.store.active();
    return {
      raids: active.filter(isRaid).filter((party) => party.gymId === gymId),
      trains: active.filter(isTrain).filter((party) => hasStop(party.train.route, gymStop(gymId))),
    };
  }

  /**
   * Adds a gym, unless another gym lies within `DUPLICATE_METRES` of its place that is not among
   * `knownNearIds` (the gyms the staff member was asked about and answered "Add anyway" to):
   * then nothing is stored and the gyms there are answered (`near`). That look happens here,
   * under the lock, so of two adds at one place in one moment the second finds the first.
   * A place that lies only in regions of other servers is refused (`foreign`), here as well as
   * by the command: the regions may have changed since the question.
   *
   * It answers once the row is stored, the gym can be found and the nearest gyms
   * are settled; its address and the places around it are fetched on the side
   * (`GymUpkeep.placed`). Where `settings.postNewGyms` is on, the server's channel for bot
   * updates is told. Once the row exists the gym is added, whatever fails after it: that is
   * logged, and the gym is answered as it was stored.
   */
  add(gym: NewGym, place: StaffPlace, knownNearIds: readonly number[] = []): Promise<AddOutcome> {
    return this.lock.run(async () => {
      const outcome = await this.addLocked(gym, place, new Set(knownNearIds));
      if (outcome.kind === 'added') {
        const added = outcome.gym;
        this.announce(place, async () => {
          const map = this.options.maps
            ? await mapOrNothing(this.options.maps.gym(added), this.options.log, 'a gym', {
                gym: added.id,
              })
            : undefined;
          // As the gym is once its map is there: a gym deleted meanwhile is not announced.
          const gym = this.options.directory.get(added.id);
          if (!gym) return [];
          const regions = this.regionsOf(gym.id, place.guildId);
          const plain = gymAnnouncement(gym, regions);
          // Discord refuses a message with a file where the bot may not attach files (or the
          // file is gone): the announcement then goes without its map.
          return map === undefined
            ? [plain]
            : [gymAnnouncement(gym, regions, mapPicture(map, 'Map of the gym')), plain];
        });
      }
      return outcome;
    });
  }

  /**
   * `add` without the lock and the announcement: the caller holds the lock. `places: 'later'`
   * (a batch) puts the new gym's lookups in the slow line of `GymUpkeep`.
   */
  private async addLocked(
    gym: NewGym,
    place: StaffPlace,
    known: ReadonlySet<number>,
    places: true | 'later' = true,
  ): Promise<AddOutcome> {
    const { gyms, upkeep, directory, log } = this.options;
    if (!this.mayPlace(gym, place.guildId)) return { kind: 'foreign' };
    const near = this.near(gym);
    if (near.some((found) => !known.has(found.gym.id))) return { kind: 'near', near };
    const created = await gyms.create(gym);
    log.info(
      { staff: place.staffId, gym: created.id, lat: created.lat, lon: created.lon },
      'a gym was added',
    );
    try {
      await upkeep.gymChanged(created.id);
      // A gym that came with its address waits for its places only.
      await upkeep.placed(created.id, { places, address: created.geodata === null });
    } catch (err) {
      log.error({ err, gym: created.id }, 'a gym was added, but not everything after it worked');
    }
    return { kind: 'added', gym: directory.get(created.id) ?? created };
  }

  /** `GymBatch.addBlock` (the caller holds the lock). */
  private async addBlockLocked(
    block: readonly BlockGym[],
    place: StaffPlace,
  ): Promise<BlockOutcome[]> {
    const { gyms, upkeep, directory, log } = this.options;
    // Decided first, against the gyms as they are: each as `add` decides, the block's gyms
    // known to each other.
    const all = directory.all();
    // The gyms of a block share one list of the gyms they may stand beside: one set of it.
    const knownSets = new Map<readonly number[], ReadonlySet<number>>();
    const knownOf = (ids: readonly number[] = []): ReadonlySet<number> => {
      let known = knownSets.get(ids);
      if (!known) knownSets.set(ids, (known = new Set(ids)));
      return known;
    };
    const decided = block.map((item): AddOutcome | 'accepted' => {
      if (!this.mayPlace(item.gym, place.guildId)) return { kind: 'foreign' };
      const near = placesWithin(item.gym, all, DUPLICATE_METRES).map(({ place: gym, metres }) => ({
        gym,
        metres,
      }));
      const known = knownOf(item.knownNearIds);
      return near.some((found) => !known.has(found.gym.id)) ? { kind: 'near', near } : 'accepted';
    });
    const accepted = block.filter((_, index) => decided[index] === 'accepted');
    let created: Gym[];
    /** The gyms of before whose nearest gym the block's transaction wrote. */
    let changed: number[] = [];
    try {
      created =
        accepted.length === 0
          ? []
          : await gyms.createBlock(
              accepted.map((item) => item.gym),
              (made) => {
                const added = new Set(made.map((gym) => gym.id));
                const writes = nearestBlockChanges([...all, ...made], added);
                changed = writes.map((write) => write.id).filter((id) => !added.has(id));
                return writes;
              },
            );
    } catch (err) {
      // Nothing of the block was written: one by one, so that a bad gym fails alone.
      log.warn({ err, gyms: accepted.length }, 'a block of gyms failed: adding them one by one');
      return this.addOneByOne(block, decided, place);
    }
    const ids = created.map((gym) => gym.id);
    for (const gym of created) {
      log.info(
        { staff: place.staffId, gym: gym.id, lat: gym.lat, lon: gym.lon },
        'a gym was added',
      );
    }
    try {
      // Once for the block: the directory, then the line.
      await directory.refreshGyms([...ids, ...changed]);
      await upkeep.placedBlock(ids, changed);
    } catch (err) {
      log.error(
        { err, gyms: ids.length },
        'a block of gyms was added, but not everything after it worked',
      );
    }
    let next = 0;
    return decided.map((outcome): BlockOutcome => {
      if (outcome !== 'accepted') return outcome;
      const gym = created[next++];
      return gym ? { kind: 'added', gym: directory.get(gym.id) ?? gym } : { kind: 'failed' };
    });
  }

  /** The gyms of a block whose transaction failed, added one by one (the lock is held). */
  private async addOneByOne(
    block: readonly BlockGym[],
    decided: readonly (AddOutcome | 'accepted')[],
    place: StaffPlace,
  ): Promise<BlockOutcome[]> {
    const outcomes: BlockOutcome[] = [];
    const mates: number[] = [];
    // One set per list of known gyms the block shares, with the gyms added before.
    const knownSets = new Map<readonly number[], Set<number>>();
    for (const [index, item] of block.entries()) {
      const outcome = decided[index];
      if (outcome !== 'accepted' && outcome !== undefined) {
        outcomes.push(outcome);
        continue;
      }
      const ids = item.knownNearIds ?? [];
      let known = knownSets.get(ids);
      if (!known) knownSets.set(ids, (known = new Set([...ids, ...mates])));
      try {
        const added = await this.addLocked(item.gym, place, known, 'later');
        if (added.kind === 'added') {
          mates.push(added.gym.id);
          for (const set of knownSets.values()) set.add(added.gym.id);
        }
        outcomes.push(added);
      } catch (err) {
        this.options.log.error({ err }, 'could not add a gym of a block');
        outcomes.push({ kind: 'failed' });
      }
    }
    return outcomes;
  }

  /**
   * Runs `work` under the lock with the operations of a batch (`GymBatch`): adds, moves and
   * writes of many gyms that nothing else interleaves with, as a Wayfarer import needs (it plans
   * against the gyms as they are and writes that plan). What it changed (gyms added, renamed, but
   * for a name only tidied, and moved) is announced as one summary once `work` has finished,
   * also when it failed: what was written stands (`summarize`; `source` decides when it is
   * posted: gathered for the review, at once otherwise; the summary names no source). Work that
   * asks for the lock again from inside (`add`, `move`, `delete`, another batch) never finishes.
   */
  batch<T>(
    place: StaffPlace,
    source: GymChangeSource,
    work: (ops: GymBatch) => Promise<T>,
  ): Promise<T> {
    return this.lock.run(async () => {
      const changes: GymListChanges = { ...NO_CHANGES };
      /** Counts a name written over `before` as a rename, unless it only tidies it. */
      const renamed = (before: string | undefined, name: string | undefined): void => {
        if (name !== undefined && before !== undefined && name !== before) {
          if (!tidiesName(before, name)) changes.renamed++;
        }
      };
      const ops: GymBatch = {
        add: async (gym, knownNearIds = [], options = {}) => {
          const outcome = await this.addLocked(gym, place, new Set(knownNearIds), 'later');
          if (outcome.kind === 'added') {
            changes.added++;
            if (options.promoted === true) changes.promoted++;
          }
          return outcome;
        },
        addBlock: async (block) => {
          const outcomes = await this.addBlockLocked(block, place);
          outcomes.forEach((outcome, index) => {
            if (outcome.kind !== 'added') return;
            changes.added++;
            if (block[index]?.promoted === true) changes.promoted++;
          });
          return outcomes;
        },
        move: async (id, point, { places, address = true, patch = {} }) => {
          const before = this.options.directory.get(id)?.name;
          const outcome = await this.moveLocked(id, point, place, places, address, patch);
          if (outcome?.kind === 'moved') {
            changes.moved++;
            renamed(before, patch.name);
          }
          return outcome;
        },
        remove: async (id, by) => {
          const outcome = await this.deleteLocked(id, by, place);
          if (outcome.kind === 'deleted') changes.deleted++;
          return outcome;
        },
        countWayspots: (counted) => {
          changes.wayspots = addWayspotChanges(changes.wayspots, counted);
        },
        update: async (id, patch) => {
          const before = this.options.directory.get(id)?.name;
          const gym = await this.updateLocked(id, patch, place);
          if (gym) renamed(before, patch.name);
          return gym;
        },
      };
      try {
        return await work(ops);
      } finally {
        this.summarize(place, source, changes);
      }
    });
  }

  /**
   * Announces what changed the gym list in bulk (`gymListSummary`): an import's and the
   * deletion of the gyms outside its area at once, the review queue's gathered per server and
   * posted `REVIEW_SUMMARY_MS` after its last change (`flush`, which shutdown runs, posts what
   * waits; a crash loses the review's counts of those minutes, the changes themselves stand).
   */
  private summarize(place: StaffPlace, source: GymChangeSource, changes: GymListChanges): void {
    if (!anyChanges(changes)) return;
    if (source !== 'review') {
      this.announce(place, () => [gymListSummary(changes)].filter((m) => m !== undefined));
      return;
    }
    const key = String(place.guildId);
    const before = this.gathered.get(key);
    before?.cancel();
    const timer = setTimeout(
      () => this.postGathered(key),
      this.options.reviewSummaryMs ?? REVIEW_SUMMARY_MS,
    );
    timer.unref?.();
    this.gathered.set(key, {
      place,
      changes: addChanges(before?.changes ?? NO_CHANGES, changes),
      cancel: () => clearTimeout(timer),
    });
  }

  /** Posts the review's gathered changes of a server. */
  private postGathered(key: string): void {
    const waiting = this.gathered.get(key);
    if (!waiting) return;
    this.gathered.delete(key);
    waiting.cancel();
    this.announce(waiting.place, () =>
      [gymListSummary(waiting.changes)].filter((m) => m !== undefined),
    );
  }

  /**
   * A batch's move: what `move` does once its questions are answered, with the fields of
   * `patch` in the same row write.
   */
  private async moveLocked(
    id: number,
    point: LatLon,
    place: StaffPlace,
    places: boolean,
    address: boolean,
    patch: BatchPatch,
  ): Promise<BatchMoveOutcome | undefined> {
    const { gyms, directory, log } = this.options;
    const before = directory.get(id);
    if (!before || !this.mayTouch(id, place.guildId)) return undefined;
    if (!this.mayPlace(point, place.guildId)) return { kind: 'foreign' };
    const from = { lat: before.lat, lon: before.lon };
    const fields = (Object.keys(patch) as (keyof BatchPatch)[]).filter(
      (field) => patch[field] !== undefined,
    );
    const written = await gyms.update(id, { ...patch, lat: point.lat, lon: point.lon });
    if (!written) return undefined;
    log.info(
      { staff: place.staffId, gym: id, from, to: point, ...(fields.length > 0 ? { fields } : {}) },
      'a gym was moved',
    );
    const gym = await this.afterMove(id, written, places && 'later', address);
    return gym && { kind: 'moved', gym, from, metres: metresBetween(from, point) };
  }

  /**
   * After the row of a moved gym was written: the directory, the posts, the nearest gyms, and
   * (with `places`) its address and places on the side. Gives the gym as the directory has it;
   * undefined when it was deleted meanwhile. What fails is logged, and the gym is answered as
   * it was written.
   */
  private async afterMove(
    id: number,
    written: Gym,
    places: boolean | 'later',
    address = true,
  ): Promise<Gym | undefined> {
    const { upkeep, directory, log } = this.options;
    try {
      const moved = await upkeep.gymChanged(id);
      if (!moved) return undefined;
      await upkeep.placed(id, { places, address });
      return directory.get(id) ?? moved;
    } catch (err) {
      log.error({ err, gym: id }, 'a gym was changed, but not everything after it worked');
      return written;
    }
  }

  /** A batch's write of a gym's fields: the fields given, logged by name. */
  private async updateLocked(
    id: number,
    patch: BatchPatch,
    place: StaffPlace,
  ): Promise<Gym | undefined> {
    const { gyms, directory, log } = this.options;
    if (!directory.get(id) || !this.mayTouch(id, place.guildId)) return undefined;
    const fields = (Object.keys(patch) as (keyof BatchPatch)[]).filter(
      (field) => patch[field] !== undefined,
    );
    if (fields.length === 0) return directory.get(id);
    const written = await gyms.update(id, patch);
    if (!written) return undefined;
    log.info({ staff: place.staffId, gym: id, fields }, 'a gym was changed');
    return this.readAgain(id, written);
  }

  /**
   * Writes the texts of a gym that are given (the fields a staff member changed, already
   * checked). Undefined when there is no such gym: nothing was written, or the gym was deleted
   * in the same moment.
   */
  async edit(id: number, texts: Partial<GymTexts>, staffId: string): Promise<Gym | undefined> {
    const { gyms, upkeep, directory, log } = this.options;
    const fields = Object.keys(texts);
    if (fields.length === 0) {
      await upkeep.gymChanged(id);
      return directory.get(id);
    }
    const written = await gyms.update(id, texts);
    if (!written) return undefined;
    log.info({ staff: staffId, gym: id, fields }, 'the texts of a gym were changed');
    return this.readAgain(id, written);
  }

  /**
   * After the row of a gym was written without the lock (its texts, its flags): the directory
   * reads it again and the posts that show it are rendered anew. Gives the gym as the directory
   * has it then: undefined when it was deleted meanwhile (a deletion makes the directory forget
   * the gym, whatever a read that was on its way answers). When the directory cannot read, the
   * change stands all the same: that is logged, and the gym is answered as it was written.
   */
  private async readAgain(id: number, written: Gym): Promise<Gym | undefined> {
    const { upkeep, directory, log } = this.options;
    try {
      await upkeep.gymChanged(id);
    } catch (err) {
      log.error({ err, gym: id }, 'a gym was changed, but not everything after it worked');
      return written;
    }
    return directory.get(id);
  }

  /**
   * Whether a gym is an elite raid gym (`isEliteGym`). Yes sets the tag (`taggedEx`) and
   * leaves what the gym is said to have hosted; no clears both flags, since either makes it
   * one. Undefined when there is no such gym (as for `edit`).
   */
  async setElite(id: number, eligible: boolean, staffId: string): Promise<Gym | undefined> {
    const { gyms, log } = this.options;
    const patch = eligible ? { taggedEx: true } : { taggedEx: false, confirmedEx: false };
    const written = await gyms.update(id, patch);
    if (!written) return undefined;
    log.info({ staff: staffId, gym: id, elite: eligible }, 'the elite flag of a gym was set');
    return this.readAgain(id, written);
  }

  /**
   * Moves a gym to another place: the row, the directory and the posts, the nearest gyms; its
   * address and places are fetched again on the side. The picture of the old place is simply
   * no longer named (`ImageCache` names a file by what it shows). A move is never refused for
   * what is at the gym (Matt, 2026-10-13): it is a correction, and a raid there or a train
   * through it stays what it is. Gives the gym as it is now and where it was; undefined when
   * there is no such gym. Once the row is written the gym is moved, whatever fails after it:
   * that is logged, and the gym is answered as it was written.
   *
   * What the staff member knew is checked here, under the lock (`asked`): a gym that is no
   * longer where they were told it was is not moved (`elsewhere`), nor one whose new place has
   * another gym within `DUPLICATE_METRES` that they were not told of (`near`). So of two moves
   * to one place in one moment the second finds the first.
   *
   * Decided here as well, for the server of the staff member: a gym they may not touch
   * (`mayTouch`) is no gym (undefined), and a new place that lies only in regions of other
   * servers is refused (`foreign`). Out of every region a gym may go.
   */
  move(
    id: number,
    point: LatLon,
    staff: Pick<StaffPlace, 'staffId' | 'guildId'>,
    asked: MoveAsked,
  ): Promise<MoveOutcome | undefined> {
    const { gyms, directory, log } = this.options;
    const { staffId } = staff;
    return this.lock.run(async () => {
      const before = directory.get(id);
      if (!before || !this.mayTouch(id, staff.guildId)) return undefined;
      if (!this.mayPlace(point, staff.guildId)) return { kind: 'foreign' };
      const from = { lat: before.lat, lon: before.lon };
      if (from.lat !== asked.from.lat || from.lon !== asked.from.lon) {
        return { kind: 'elsewhere', gym: before };
      }
      const near = this.near(point, id);
      if (near.some((found) => !asked.nearIds.includes(found.gym.id)))
        return { kind: 'near', near };
      const written = await gyms.update(id, { lat: point.lat, lon: point.lon });
      if (!written) return undefined;
      log.info({ staff: staffId, gym: id, from, to: point }, 'a gym was moved');
      const gym = await this.afterMove(id, written, true);
      return gym && { kind: 'moved', gym, from, metres: metresBetween(from, point) };
    });
  }

  /** Asks Google about a gym again, now (`GymUpkeep.refresh`). */
  refresh(id: number): Promise<GymRefresh | undefined> {
    return this.options.upkeep.refresh(id);
  }

  /** The line that waits for Google as it is (`GymUpkeep.snapshot`, `/gym google`). */
  googleLine(): Promise<GoogleLineSnapshot> {
    return this.options.upkeep.snapshot();
  }

  /** How many members have a gym as a gym target, over all servers. */
  targetCount(id: number): Promise<number> {
    return this.options.targets.membersTargeting(id);
  }

  /** What refers to a gym now: what the question before a deletion lists. */
  async references(id: number): Promise<GymReferences> {
    const { routes, targets } = this.options;
    const shown = this.shownBy(id);
    const [saved, targeting] = await Promise.all([
      routes.countWithGym(id),
      targets.membersTargeting(id),
    ]);
    return { raids: shown.raids, trains: shown.trains.length, routes: saved, targets: targeting };
  }

  /**
   * Deletes a gym, as the act of the staff member `by`. Everything is decided now, whatever a
   * question said minutes ago. In this order, so that nothing anybody sees happens before the
   * gym is really gone:
   *
   * 0. under the lock, `onlyIf` (a review item still asks this, `/gym review`) is asked;
   * 1. under the lock of the gym: a gym the staff member's server may not touch (`mayTouch`)
   *    is no gym (`gone`), and it is refused while an active raid is there;
   * 2. the gym's row, the saved routes that have it and the gym targets of it go in one
   *    transaction (`GymRemoval`). When that fails nothing has changed (`failed`);
   * 3. the directory forgets the gym, at once and without asking the database: from here a
   *    report, a `/location`, a new stop and a loaded route refuse it;
   * 4. the gym is taken off the route of every active train (`TrainService.gymRemoved`), whose
   *    post says why. A train that could not be changed is logged and answered (`unmended`);
   *    the hourly upkeep takes the stop off later (`TrainService.removeUnknownStops`);
   * 5. the gyms that had it as their nearest get another, and the server's channel for bot
   *    updates is told: in its own post, or with `source` counted in that summary
   *    (`summarize`; an answer of the review queue).
   */
  delete(
    id: number,
    by: Member,
    place: StaffPlace,
    onlyIf?: () => Promise<boolean>,
    source?: GymChangeSource,
  ): Promise<DeleteOutcome> {
    return this.lock.run(async () => {
      if (onlyIf && !(await onlyIf())) return { kind: 'withdrawn' };
      const outcome = await this.deleteLocked(id, by, place);
      if (outcome.kind !== 'deleted') return outcome;
      const { gym } = outcome;
      if (source) this.summarize(place, source, { ...NO_CHANGES, deleted: 1 });
      else this.announce(place, () => [{ content: gymRemovedLine(gym) }]);
      return outcome;
    });
  }

  /** `delete` without the lock and the announcement: the caller holds the lock. */
  private async deleteLocked(id: number, by: Member, place: StaffPlace): Promise<DeleteOutcome> {
    const { directory, removal, store, upkeep, log } = this.options;
    const removed = await store.withGymLock(id, async () => {
      const gym = directory.get(id);
      if (!gym || !this.mayTouch(id, place.guildId)) return { kind: 'gone' as const };
      const [raid] = this.shownBy(id).raids;
      if (raid) return { kind: 'raid-there' as const, raid };
      let counts: { routes: number; targets: number };
      try {
        counts = await removal.remove(id);
      } catch (err) {
        log.error({ err, gym: id }, 'could not delete a gym');
        return { kind: 'failed' as const };
      }
      // Inside the lock, and without a read that could fail: a report that waits for the
      // lock must find the gym gone, or it would store a raid the database refuses.
      directory.forget(id);
      return { kind: 'removed' as const, gym, ...counts };
    });
    if (removed.kind !== 'removed') return removed;
    const { gym, routes, targets } = removed;
    log.info({ staff: place.staffId, gym: id, routes, targets }, 'a gym was deleted');
    // One look: every active train is asked in its own turn (`gymRemoved`), so a stop
    // that was being written while the gym went is seen too.
    let mended = 0;
    try {
      mended = (await this.options.trains.gymRemoved(id, by, gymLabel(gym))).changed.length;
    } catch (err) {
      log.warn({ err, gym: id }, 'could not take a deleted gym off the routes of trains');
    }
    const unmended = this.shownBy(id).trains;
    for (const train of unmended) {
      log.warn({ gym: id, party: train.id }, 'a train keeps a deleted gym on its route');
    }
    try {
      await upkeep.gymChanged(id);
    } catch (err) {
      log.warn({ err, gym: id }, 'could not bring the directory up to date after a deletion');
    }
    await upkeep.removed(id);
    return { kind: 'deleted', gym, trains: mended, routes, targets, unmended };
  }

  /**
   * Tells the server's channel for bot updates, where the setting asks for it and the server
   * has such a channel in which the bot may post. `messages` are what to send, the first that
   * Discord takes (a new gym with its map, then without); none says nothing. Nobody waits for
   * it, and a failure is only logged.
   */
  private announce(
    place: StaffPlace,
    messages: () => readonly OutgoingMessage[] | Promise<readonly OutgoingMessage[]>,
  ): void {
    const { gateway, settings, log } = this.options;
    if (!settings.postNewGyms) return;
    const sending: Promise<unknown> = (async () => {
      const name = settings.channels['bot-updates'];
      for (const near of place.channelIds) {
        const channelId = gateway.findChannel(near, name);
        if (channelId === undefined) continue;
        // A map is fetched only once there is a channel to show it in.
        const tried = await messages();
        for (const [index, shown] of tried.entries()) {
          try {
            await gateway.sendMessage(channelId, shown);
            return;
          } catch (err) {
            if (index === tried.length - 1 || !looksLikeRefusedFile(err)) throw err;
            log.warn({ err }, 'an announcement of the gym list was refused; sending it plainer');
          }
        }
        return;
      }
    })()
      .catch((err: unknown) => {
        log.warn({ err }, 'could not announce a change of the gym list');
      })
      .finally(() => this.announcing.delete(sending));
    this.announcing.add(sending);
  }

  /**
   * Posts the review's gathered changes now and waits for the announcements that are on their
   * way. For tests and shutdown.
   */
  async flush(): Promise<void> {
    for (const key of [...this.gathered.keys()]) this.postGathered(key);
    while (this.announcing.size > 0) await Promise.allSettled([...this.announcing]);
  }
}
