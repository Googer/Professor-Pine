import { storedTextLength, type Gym } from '../db/repositories/gym-repository.js';
import type {
  StoredImport,
  StoredReview,
  WayfarerStorage,
} from '../db/repositories/wayfarer-repository.js';
import type { WayspotStorage } from '../db/repositories/wayspot-repository.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  boxOf,
  containment,
  grownBox,
  inBox,
  metresFromRing,
  nearRing,
} from '@pine/wayspot-core/region-membership';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import { wayfarerGeodata } from '../domain/geo/wayfarer-address.js';
import type { ExportedWayspot, WayspotExport } from '@pine/wayspot-core/export-file';
import { coveredCells, isWayfarerId } from '@pine/wayspot-core/export-file';
import {
  compareOutlines,
  gymsBeyond,
  scanFinished,
  type BeyondGym,
  type OutlineComparison,
} from '../domain/wayspots/scanned-area.js';
import {
  CANDIDATE_METRES,
  isOtherWayspot,
  matchChange,
  matchGyms,
  newGymName,
  pictureOf,
  withAnswers,
  type ImportGym,
  type ImportPlan,
  type MatchChange,
  type NearOutline,
} from '../domain/wayspots/match.js';
import {
  NO_WAYSPOT_CHANGES,
  planKept,
  scanStartOf,
  scanTimeOf,
  wasStop,
  type WayspotCounts,
} from '../domain/wayspots/keep.js';
import type { GoneWayspot, Wayspot } from '../domain/wayspots/kept.js';
import type { PineStop } from '../domain/stops/pine-stop.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { PINE_STOP_NEAR_METRES, type PineStopService } from './pine-stops.js';
import type { ReviewItem } from '../domain/wayspots/review.js';
import type { Logger } from '../log.js';
import type { Member } from './attendance-service.js';
import type {
  BatchPatch,
  BlockGym,
  BlockOutcome,
  GymAdminService,
  GymBatch,
  StaffPlace,
} from './gym-admin-service.js';
import type { GymDirectory } from './gym-directory.js';
import type { RegionProvider } from './region-directory.js';
import type { WayspotDirectory } from './wayspot-directory.js';

/**
 * A matched gym moved further than this has its address and the places around it fetched
 * again (`GymUpkeep.placed`); a smaller correction changes neither, and every question to
 * Google costs money (an import corrects thousands of gyms).
 */
export const REFETCH_METRES = 25;

/**
 * How many new gyms an import adds in one transaction (plan 8W-6, `GymBatch.addBlock`): a
 * city's first import (thousands of gyms) holds the gym admin lock for seconds, and a block is
 * small enough that adding a failed one gym by gym takes no longer than before.
 */
export const IMPORT_BLOCK = 250;

/**
 * What an import does, counted. `matched`: gyms that are a Wayfarer gym of the file, of which
 * `unchanged` had nothing to write but when they were seen, `renamed` take the Wayspot's title
 * as their name, `moved` its place, `pictures` its picture address, and `unmarked` lose the mark
 * "not in Wayfarer". A name that only changes in spaces or capitals is written but is no
 * rename: `tidied` counts those (`MatchChange.tidyOnly`).
 * `added`: Wayfarer gyms that become gyms; `untitled`: Wayfarer gyms with no
 * title to name a gym by, which are not added. `review*`: items of the review queue by kind.
 * `notInWayfarer`: gyms marked so that matched nothing; `notCovered`: gyms the export says
 * nothing about; `answered`: gyms whose question staff answered with "Keep" or "None of these"
 * and that is still the question (not asked again). `ignored`: Wayspots of the file outside every
 * region of the server and far from every gym it considers. `outside`: Wayfarer gyms of the file
 * outside every region of the server, within the file's margin of an outline, that no gym took
 * or may be (`ImportPlan.outsideGyms`; never added: the outlines may leave them out). `held`:
 * Wayfarer gyms of the regions not added because a gym nearby may be them (`ImportPlan.held`:
 * every gym of the import that may be it has its five offered, or a gym outside the import may
 * be it); applied, also those another gym within ten metres kept out (`GymBatch.add`).
 */
export type WayfarerCounts = {
  matched: number;
  unchanged: number;
  renamed: number;
  tidied: number;
  moved: number;
  pictures: number;
  unmarked: number;
  added: number;
  untitled: number;
  reviewMatch: number;
  reviewMissing: number;
  reviewUnknown: number;
  notInWayfarer: number;
  notCovered: number;
  answered: number;
  ignored: number;
  outside: number;
  held: number;
};

/**
 * What an import did. Beside `WayfarerCounts` (each the gyms whose writes succeeded; `held`
 * logged): `failed`, gyms and Wayfarer gyms whose write failed (logged; nothing else stopped for
 * them). It is also what the import's row records.
 */
export type AppliedCounts = WayfarerCounts & { failed: number };

/** What an import of a file would do, written nowhere (`WayfarerImportService.preview`). */
export interface WayfarerPreview {
  plan: ImportPlan;
  /** The gyms the import considers, by id: the names of the report (`importReportCsv`). */
  gyms: ReadonlyMap<number, Gym>;
  /**
   * The gyms outside the import that hold a Wayfarer gym back (`plan.held`) and that this server
   * may name (`mayTouch`), by id: the report names them beside the held Wayspot.
   */
  holders: ReadonlyMap<number, Gym>;
  counts: WayfarerCounts;
  /**
   * The counts by region of this server: a gym (or an added Wayspot) in two regions counts in
   * both; `channelId` null for the gyms in none of this server's regions. In the order of the
   * regions, that one last; regions where nothing happens are left out.
   */
  byRegion: { channelId: string | null; counts: WayfarerCounts }[];
  /** How many regions of this server have an outline: with none, the import considers nothing. */
  regions: number;
  /** The server's newest import. */
  lastImport: StoredImport | undefined;
  /**
   * How many of the plan's review items are in the queue already, open with the same question:
   * the same kind about the same set of Wayspots (an import leaves them as they are).
   */
  queuedAlready: number;
  /** How the file's outlines differ from this server's regions as they are now. */
  outlines: OutlineComparison;
  /**
   * The gyms of this server that lie in none of its regions and outside the area the
   * file scanned (its outlines grown by its margin), nearest first: what the deletion after an
   * import offers (`outsideArea`), by id with how far beyond the nearest outline.
   */
  beyond: BeyondGym[];
  /** Those gyms by id, for the report's names. */
  beyondGyms: ReadonlyMap<number, Gym>;
  /**
   * Whether the gyms beyond may be deleted after this import (`mayDeleteOutside`): the scan was
   * finished (every cell of its area received) and went a margin beyond its areas.
   */
  deletable: boolean;
  /**
   * What the import would do to the kept Wayspots (plan 8W-2): every Wayspot of the file is kept
   * but those Pine gyms are or would be (`planKept`). Undefined when the kept Wayspots could
   * not be read (logged): the preview says nothing of them.
   */
  wayspots: WayspotCounts | undefined;
  /**
   * The stops of Pine's own of this server within `PINE_STOP_NEAR_METRES` of a PokéStop of the
   * file (plan 8R-1; design 9.10): Wayfarer may list them now, and staff may remove them.
   */
  pineStopsNear: PineStop[];
}

/** The area an export scanned: what the deletion of the gyms beyond it keeps of the file. */
export type ScannedArea = Pick<WayspotExport, 'outlines' | 'margin'>;

/**
 * What came of deleting the gyms beyond a scanned area (`deleteOutside`): how many were
 * deleted, the gyms skipped because an active raid is there (named in the answer), how many of
 * those the question named no longer lie beyond (kept), how many had gone meanwhile, how
 * many could not be deleted (logged), and how many regions of the server were not as the scan
 * found them at the press (then nothing at all is deleted).
 */
export interface OutsideDeletion {
  deleted: number;
  raidThere: Gym[];
  notBeyond: number;
  gone: number;
  failed: number;
  regionsNotScanned: number;
}

/**
 * Whether the gyms beyond an export's area may be deleted (Matt, 2026-10-15): only after a
 * finished scan (no cell of its area left), and never one without a margin, which shows nothing
 * of what lies just outside an outline.
 */
export function mayDeleteOutside(file: WayspotExport): boolean {
  return file.margin > 0 && scanFinished(file.outlines, coveredCells(file), file.margin);
}

/** Bookkeeping of an import that could not be written (logged): the gyms' changes stand. */
export type Unrecorded = 'import' | 'reviews' | 'seen' | 'marks' | 'wayspots';

/** What an import did (`WayfarerImportService.apply`). */
export interface WayfarerOutcome {
  counts: AppliedCounts;
  /** The import's row; null when it could not be recorded or the server has no row. */
  importId: number | null;
  unrecorded: Unrecorded[];
  /** What it did to the kept Wayspots; nothing when they could not be written (`unrecorded`). */
  wayspots: WayspotCounts;
}

/**
 * What came of making one gym one Wayspot (`applyMatch`, a review's "Same as"): `gone`, there
 * is no such gym this server may touch; `withdrawn`, what the caller asked inside the lock no
 * longer holds (nothing was written); `taken`, another gym already is that Wayspot (`gym`
 * undefined when it is another server's, which is not named); `failed`, a write failed
 * (logged; what was written before it stands); `matched`, with what changed.
 */
export type MatchOutcome =
  | { kind: 'gone' | 'withdrawn' }
  | { kind: 'taken'; gym: Gym | undefined }
  | { kind: 'failed' }
  | { kind: 'matched'; change: MatchChange; gym: Gym };

export interface WayfarerImportOptions {
  storage: WayfarerStorage;
  /** The kept Wayspots: every Wayspot of an import but those Pine gyms are. */
  wayspots: WayspotStorage;
  /** The kept Wayspots in memory: read again after an import, a matched one forgotten. */
  kept: Pick<WayspotDirectory, 'load' | 'forget'>;
  admin: Pick<GymAdminService, 'batch' | 'mayTouch' | 'inRegionOf'>;
  /**
   * The gyms in memory (`GymDirectory`): the server's view (`of`), whose gyms its import reads
   * and changes (plan 19B-2), and every server's (`all`) only for the Wayfarer ids that live in
   * `Gym` rather than among the kept Wayspots.
   */
  directory: Pick<GymDirectory, 'of' | 'all'>;
  regions: Pick<RegionProvider, 'all'>;
  /**
   * The stops of Pine's own (plan 8R-1): the preview names those of the server that lie near a
   * PokéStop of the file, for staff to remove.
   */
  pineStops: Pick<PineStopService, 'ofGuildRow'>;
  log: Logger;
  /** The length of a name as the database stores it; default `storedTextLength`. */
  storedLength?: (text: string) => number;
  /** Default `Date.now`. */
  now?: () => number;
}

/** What `plan` found: the plan and what it was made of. */
interface Planned {
  plan: ImportPlan;
  gyms: Map<number, Gym>;
  /** The channels of this server's regions with an outline, each with its test of a point. */
  regions: { channelId: string; contains: (point: LatLon) => boolean }[];
  /** The server's open items. */
  open: StoredReview[];
}

/** What came of writing one match. */
type Written = 'written' | 'gone' | 'failed';

/**
 * The Wayfarer import of `/gym import` (spec "The import"): what a file of the export tool says
 * about this server's gyms, previewed and then written. Only the Wayspots that lie in a region
 * of the server are considered, and only the server's gyms (`mayTouch`, plan 19B-2), wherever
 * they lie.
 *
 * The preview plans without the lock and writes nothing. The import plans again inside
 * `GymAdminService.batch`, against the gyms as they are then (minutes may have passed), and
 * writes that plan: each match (Wayfarer id, name, picture, place; a move over
 * `REFETCH_METRES` has its places fetched again, and takes the Wayspot's address, as does a gym
 * that has none), the new gyms (with the Wayspot's address; announced in one summary), when
 * each matched gym was seen, the review queue (items saved or refreshed, items of matched gyms
 * closed), and the import's row with its counts. A gym whose write fails is counted and
 * logged, and the import goes on.
 *
 * A gym marked "not in Wayfarer" that the file matches loses the mark: Wayfarer has it after
 * all, and should it ever go missing again it is to be asked about.
 */
export class WayfarerImportService {
  private readonly storedLength: (text: string) => number;
  private readonly now: () => number;

  constructor(private readonly options: WayfarerImportOptions) {
    this.storedLength = options.storedLength ?? storedTextLength;
    this.now = options.now ?? Date.now;
  }

  /** What an import of the file would do now. Writes nothing. */
  async preview(staff: StaffPlace, file: WayspotExport): Promise<WayfarerPreview> {
    const planned = await this.plan(staff.guildId, file);
    const { storage } = this.options;
    const { guildId } = staff;
    const lastImport = guildId === undefined ? undefined : await storage.lastImport(guildId);
    const asked = new Map(planned.open.map((item) => [item.gymId, item]));
    const holders = new Map(
      planned.plan.held.flatMap(({ gymId }): [number, Gym][] => {
        const gym = this.options.directory.of(guildId).get(gymId);
        return gym && !planned.gyms.has(gymId) && this.options.admin.mayTouch(gymId, guildId)
          ? [[gymId, gym]]
          : [];
      }),
    );
    const beyond = this.outsideArea(guildId, file);
    // The Wayfarer ids Pine's gyms would have: theirs now, those matched and those added.
    const gymIds = new Set([
      ...this.gymWayfarerIds(),
      ...planned.plan.matched.map((match) => match.wayspot.id),
      ...planned.plan.added.map((wayspot) => wayspot.id),
    ]);
    return {
      wayspots: await this.keptCounts(file, gymIds),
      plan: planned.plan,
      gyms: planned.gyms,
      holders,
      counts: this.tally(planned.plan),
      byRegion: this.byRegion(planned, guildId),
      regions: planned.regions.length,
      lastImport,
      queuedAlready: planned.plan.reviews.filter((item) =>
        sameQuestion(asked.get(item.gymId), item),
      ).length,
      outlines: this.compareWith(guildId, file),
      beyond,
      beyondGyms: new Map(
        beyond.flatMap(({ gymId }): [number, Gym][] => {
          const gym = this.options.directory.of(guildId).get(gymId);
          return gym ? [[gymId, gym]] : [];
        }),
      ),
      deletable: mayDeleteOutside(file),
      pineStopsNear: this.pineStopsNear(guildId, file),
    };
  }

  /** The server's stops of Pine's own near a PokéStop of the file (`pineStopsNear`). */
  private pineStopsNear(guildId: number | undefined, file: WayspotExport): PineStop[] {
    const own = this.options.pineStops.ofGuildRow(guildId);
    if (own.length === 0) return [];
    const stops = file.wayspots.filter((wayspot) => wayspot.kind === 'stop');
    return own.filter((stop) =>
      stops.some((wayspot) => metresBetween(stop, wayspot) <= PINE_STOP_NEAR_METRES),
    );
  }

  /**
   * The gyms of this server beyond the area a file scanned: its gyms that lie in none of its
   * regions (plan 19B-2: a server's gyms are its own wherever they lie, and another server's are
   * never its to delete), outside the file's outlines grown by its margin, nearest first. A
   * server without an outlined region has none, and neither has one with a region the file did
   * not scan as it is now (`compareOutlines`: added or changed since, or never scanned; the gyms
   * around it were never looked at). Worked out from the gyms and regions as they are now, at
   * the preview and again when the deletion is pressed.
   */
  outsideArea(guildId: number | undefined, file: ScannedArea): BeyondGym[] {
    const { admin, directory, regions } = this.options;
    if (guildId === undefined) return [];
    if (this.compareWith(guildId, file).regionsNotScanned.length > 0) return [];
    const outlined = regions
      .all()
      .some((region) => region.guildId === guildId && region.bounds !== null);
    if (!outlined) return [];
    const candidates = directory
      .of(guildId)
      .all()
      .filter((gym) => !admin.inRegionOf(gym.id, guildId));
    return gymsBeyond(candidates, file.outlines, file.margin);
  }

  /**
   * What an import of the file would do to the kept Wayspots; undefined when they cannot be read
   * (logged: the preview goes without them).
   */
  private async keptCounts(
    file: WayspotExport,
    gymIds: ReadonlySet<string>,
  ): Promise<WayspotCounts | undefined> {
    let kept: Wayspot[];
    let gone: Map<string, GoneWayspot>;
    try {
      [kept, gone] = await Promise.all([this.options.wayspots.all(), this.options.wayspots.gone()]);
    } catch (err) {
      this.options.log.error({ err }, 'could not read the kept Wayspots');
      return undefined;
    }
    const now = this.now();
    return planKept({
      wayspots: file.wayspots,
      covered: coveredCells(file),
      kept,
      gone,
      gymIds,
      scannedAt: scanTimeOf(file, now),
      startedAt: scanStartOf(file, now),
    }).counts;
  }

  /** The Wayfarer ids of every gym, of any server: those Wayspots live in `Gym`. */
  private gymWayfarerIds(): string[] {
    return this.options.directory
      .all()
      .flatMap((gym) => (gym.pogoId !== null && isWayfarerId(gym.pogoId) ? [gym.pogoId] : []));
  }

  /** How a file's outlines differ from this server's regions with an outline as they are now. */
  compareWith(guildId: number | undefined, file: ScannedArea): OutlineComparison {
    return compareOutlines(
      file.outlines,
      this.options.regions
        .all()
        .flatMap((region) =>
          guildId !== undefined && region.guildId === guildId && region.bounds !== null
            ? [{ channelId: region.channelId, bounds: region.bounds }]
            : [],
        ),
    );
  }

  /**
   * Deletes the gyms of this server beyond a scanned area (Matt, 2026-10-15: production's gyms
   * came from a box well past the regions), as the staff member `by`: those of `named` (the
   * gyms the question named) that still lie beyond, worked out again under the lock
   * (`outsideArea`; the list can only shrink), each through gym administration's deletion
   * (what goes with it goes too; one with an active raid is skipped), one summary in the channel
   * for bot updates at the end. Only for an area `mayDeleteOutside` allowed: the caller's to ask.
   */
  deleteOutside(
    staff: StaffPlace,
    area: ScannedArea,
    named: readonly number[],
    by: Member,
  ): Promise<OutsideDeletion> {
    const { admin, log } = this.options;
    return admin.batch(staff, 'outside', async (ops) => {
      const outcome: OutsideDeletion = {
        deleted: 0,
        raidThere: [],
        notBeyond: 0,
        gone: 0,
        failed: 0,
        regionsNotScanned: 0,
      };
      // A region added or grown since the question: the area no longer covers the server's
      // regions, and nothing is deleted.
      outcome.regionsNotScanned = this.compareWith(staff.guildId, area).regionsNotScanned.length;
      if (outcome.regionsNotScanned > 0) {
        log.info(
          { staff: staff.staffId, guild: staff.guildId, regions: outcome.regionsNotScanned },
          'the gyms beyond a scanned area were kept: a region is not as the scan found it',
        );
        return outcome;
      }
      const still = new Set(this.outsideArea(staff.guildId, area).map((gym) => gym.gymId));
      for (const gymId of named) {
        if (!still.has(gymId)) {
          if (this.options.directory.of(staff.guildId).get(gymId)) outcome.notBeyond++;
          else outcome.gone++;
          continue;
        }
        const deleted = await ops.remove(gymId, by);
        if (deleted.kind === 'deleted') outcome.deleted++;
        else if (deleted.kind === 'raid-there') {
          const gym = this.options.directory.of(staff.guildId).get(gymId);
          if (gym) outcome.raidThere.push(gym);
        } else if (deleted.kind === 'failed') outcome.failed++;
        else outcome.gone++;
      }
      log.info(
        {
          staff: staff.staffId,
          guild: staff.guildId,
          deleted: outcome.deleted,
          raidThere: outcome.raidThere.length,
          notBeyond: outcome.notBeyond,
          gone: outcome.gone,
          failed: outcome.failed,
        },
        'the gyms beyond the area of a Wayfarer import were deleted',
      );
      return outcome;
    });
  }

  /** Imports the file: plans again under the lock and writes what the plan says. */
  async apply(staff: StaffPlace, file: WayspotExport): Promise<WayfarerOutcome> {
    const { admin, log } = this.options;
    const outcome = await admin.batch(staff, 'import', (ops) => this.applyLocked(ops, staff, file));
    // The kept Wayspots as the import left them (an import of a city: about a second).
    try {
      await this.options.kept.load();
    } catch (err) {
      log.error({ err }, 'could not read the Wayspots again after a Wayfarer import');
    }
    log.info(
      { staff: staff.staffId, guild: staff.guildId, import: outcome.importId, ...outcome.counts },
      'a Wayfarer export was imported',
    );
    return outcome;
  }

  /**
   * Makes a gym this Wayspot, as an import does (a review's "Same as"): its Wayfarer id, name,
   * picture and place, when it was seen, and its mark "not in Wayfarer" taken off. Refused
   * (`taken`) while another gym is that Wayspot. The review item is the caller's.
   */
  applyMatch(
    staff: StaffPlace,
    gymId: number,
    wayspot: ExportedWayspot,
    onlyIf?: () => Promise<boolean>,
  ): Promise<MatchOutcome> {
    const { admin, directory, storage } = this.options;
    return admin.batch(staff, 'review', async (ops): Promise<MatchOutcome> => {
      const gym = directory.of(staff.guildId).get(gymId);
      if (!gym || !admin.mayTouch(gymId, staff.guildId)) return { kind: 'gone' };
      if (onlyIf && !(await onlyIf())) return { kind: 'withdrawn' };
      // Another gym of the server only (plan 19B-2): another server's gym of this Wayspot is its
      // own, and holds nothing here.
      const holder = directory
        .of(staff.guildId)
        .all()
        .find((other) => other.id !== gymId && other.pogoId === wayspot.id);
      if (holder) return { kind: 'taken', gym: holder };
      const record = (await storage.records([gymId])).get(gymId);
      const change = matchChange(
        importGym(gym, record?.notInWayfarer ?? false),
        wayspot,
        this.storedLength,
      );
      const written = await this.writeMatch(ops, staff, gym, change);
      if (written === 'gone') return { kind: 'gone' };
      if (written === 'failed') return { kind: 'failed' };
      await this.record('seen', () => storage.seen([gymId], this.now()));
      // The Wayspot lives in `Gym` now.
      await this.record('wayspots', () => this.options.wayspots.remove([wayspot.id]));
      this.options.kept.forget([wayspot.id]);
      if (change.unmark) await this.record('marks', () => storage.clearNotInWayfarer([gymId]));
      return { kind: 'matched', change, gym: directory.of(staff.guildId).get(gymId) ?? gym };
    });
  }

  private async applyLocked(
    ops: GymBatch,
    staff: StaffPlace,
    file: WayspotExport,
  ): Promise<WayfarerOutcome> {
    const { storage, log } = this.options;
    const { guildId } = staff;
    const planned = await this.plan(guildId, file);
    const { plan, gyms } = planned;
    const unrecorded: Unrecorded[] = [];
    // The kept Wayspots as they are before the import: whether a Wayfarer gym it adds was a
    // PokéStop, and what it changes of them. Without them the gyms are written all the same.
    const read = await this.record(
      'wayspots',
      () => Promise.all([this.options.wayspots.all(), this.options.wayspots.gone()]),
      unrecorded,
    );
    const [kept, gone] = read ?? [undefined, undefined];
    const before = new Map((kept ?? []).map((row): [string, Wayspot] => [row.id, row]));
    const counts: AppliedCounts = {
      ...emptyCounts(),
      failed: 0,
      notInWayfarer: plan.notInWayfarer.length,
      notCovered: plan.notCovered.length,
      answered: plan.answered.length,
      ignored: plan.outside,
      outside: plan.outsideGyms.length,
    };

    const seen: number[] = [];
    const unmark: number[] = [];
    const unchanged = new Set(plan.unchangedSeen);
    for (const match of plan.matched) {
      const gym = gyms.get(match.gymId);
      const written = gym ? await this.writeMatch(ops, staff, gym, match) : 'gone';
      if (written !== 'written') {
        counts.failed++;
        continue;
      }
      seen.push(match.gymId);
      if (match.unmark) unmark.push(match.gymId);
      countMatch(counts, match, unchanged.has(match.gymId));
    }

    // Two Wayfarer gyms within ten metres of each other exist: whatever the plan matched or
    // left marked, and whatever this import adds, is no reason to keep a Wayfarer gym out. What
    // is still in the way is a gym that is no Wayspot the plan could give it (one whose
    // Wayspot this file did not see, one staff said is none of these) or one this server may
    // not touch. Such a Wayspot is held, and logged, as are those the plan holds (`plan.held`:
    // every gym that may be it has its five offered, or a gym outside the import may be it).
    const known = new Set([...plan.matched.map((match) => match.gymId), ...plan.notInWayfarer]);
    for (const { wayspot, gymId } of plan.held) {
      counts.held++;
      log.warn(
        { wayspot: wayspot.id, near: [gymId] },
        'a Wayfarer gym was not added: a gym nearby may be it',
      );
    }
    // The new gyms in blocks (plan 8W-6): each block one transaction with its nearest gyms, the
    // directory and the line once per block, so that a city's first import holds the lock for
    // seconds, not minutes. A gym the block refuses (near a gym, a region of another server) is
    // reported as before; a block that fails is added gym by gym.
    const titled: { wayspot: ExportedWayspot; gym: BlockGym }[] = [];
    for (const wayspot of plan.added) {
      const name = newGymName(wayspot.title, this.storedLength);
      if (name === null) {
        counts.untitled++;
        log.info({ wayspot: wayspot.id }, 'a Wayfarer gym without a title was not added');
        continue;
      }
      titled.push({
        wayspot,
        gym: {
          gym: {
            name,
            lat: wayspot.lat,
            lon: wayspot.lon,
            pogoId: wayspot.id,
            imageUrl: pictureOf(wayspot.image),
            // Wayfarer's address, not Google's (Matt, 2026-10-16): Google is asked for the
            // places around it only, and for the address of a Wayspot without a street.
            geodata: wayfarerGeodata(wayspot.address),
          },
          // A stop found gone by an earlier import was a stop all the same.
          promoted: wasStop(before.get(wayspot.id) ?? wentAs(gone?.get(wayspot.id))),
        },
      });
    }
    const blocks = Math.ceil(titled.length / IMPORT_BLOCK);
    for (let start = 0; start < titled.length; start += IMPORT_BLOCK) {
      const block = titled.slice(start, start + IMPORT_BLOCK);
      // The gyms the block's gyms may stand beside: one list for the whole block.
      const knownNearIds = [...known];
      let outcomes: BlockOutcome[];
      try {
        outcomes = await ops.addBlock(block.map(({ gym }) => ({ ...gym, knownNearIds })));
      } catch (err) {
        counts.failed += block.length;
        log.error({ err, gyms: block.length }, 'could not add a block of Wayfarer gyms');
        continue;
      }
      const done = { added: 0, held: 0, failed: 0 };
      for (const [index, outcome] of outcomes.entries()) {
        const wayspot = block[index]?.wayspot;
        if (!wayspot) continue;
        if (outcome.kind === 'added') {
          known.add(outcome.gym.id);
          seen.push(outcome.gym.id);
          counts.added++;
          done.added++;
        } else if (outcome.kind === 'failed') {
          counts.failed++;
          done.failed++;
          log.error({ wayspot: wayspot.id }, 'could not add a Wayfarer gym');
        } else {
          counts.held++;
          done.held++;
          log.warn(
            {
              wayspot: wayspot.id,
              outcome: outcome.kind,
              ...(outcome.kind === 'near' ? { near: outcome.near.map(({ gym }) => gym.id) } : {}),
            },
            'a Wayfarer gym was not added: a gym or a region of another server is there',
          );
        }
      }
      // How far a city's first import has come (thousands of gyms take minutes).
      log.info(
        { block: start / IMPORT_BLOCK + 1, blocks, ...done },
        'a block of Wayfarer gyms was added',
      );
    }

    const items = plan.reviews.map((item) => ({
      ...item,
      gymPogoId: gyms.get(item.gymId)?.pogoId ?? null,
    }));
    for (const item of items) counts[reviewKey(item.kind)]++;
    const now = this.now();

    // Every Wayspot of the file is kept but those the gyms are now (of any server), in one
    // transaction of chunks; seen when the file's scan was made, and what a newer scan wrote is
    // left alone.
    let wayspots: WayspotCounts = { ...NO_WAYSPOT_CHANGES };
    if (kept !== undefined) {
      const scannedAt = scanTimeOf(file, now);
      const startedAt = scanStartOf(file, now);
      const keep = planKept({
        wayspots: file.wayspots,
        covered: coveredCells(file),
        kept,
        ...(gone === undefined ? {} : { gone }),
        gymIds: new Set(this.gymWayfarerIds()),
        scannedAt,
        startedAt,
      });
      const saved = await this.record(
        'wayspots',
        async () => {
          await this.options.wayspots.saveFromImport(keep.writes, now, scannedAt, startedAt);
          return true;
        },
        unrecorded,
      );
      if (saved) {
        wayspots = keep.counts;
        ops.countWayspots(keep.byKind);
      }
    }

    let importId: number | null = null;
    if (guildId !== undefined) {
      const row = {
        guildId,
        staffId: staff.staffId,
        importedAt: now,
        startedAt: epochOf(file.startedAt),
        finishedAt: epochOf(file.finishedAt),
        counts: {
          ...counts,
          wayspotsAdded: wayspots.added,
          wayspotsChanged: wayspots.changed,
          wayspotsGone: wayspots.gone,
          wayspotsGyms: wayspots.gyms,
        },
      };
      importId = (await this.record('import', () => storage.addImport(row), unrecorded)) ?? null;
      // Settled: the gyms matched (and written), and those marked "not in Wayfarer".
      const settled = [...seen, ...plan.notInWayfarer];
      await this.record(
        'reviews',
        async () => {
          await storage.saveReviews(guildId, importId, items, now);
          await storage.closeReviews(guildId, settled, 'resolved', null, now);
        },
        unrecorded,
      );
    }
    await this.record('seen', () => storage.seen(seen, now), unrecorded);
    await this.record('marks', () => storage.clearNotInWayfarer(unmark), unrecorded);
    return { counts, importId, unrecorded, wayspots };
  }

  /**
   * Writes one match in one row write: the Wayfarer id (when it differs), the name, the picture
   * and, with a move, the place (`GymBatch.move` with its `patch`). `gone`: the gym went
   * meanwhile; `failed`: the write failed (logged; nothing was written).
   */
  private async writeMatch(
    ops: GymBatch,
    staff: StaffPlace,
    gym: Gym,
    match: MatchChange,
  ): Promise<Written> {
    const { log } = this.options;
    const { gymId, wayspot } = match;
    // Wayfarer's address for a gym that has none, or that moves far enough to be looked up
    // again: Google is then asked for its places only.
    const refetch = match.metres > REFETCH_METRES;
    const geodata = wayfarerGeodata(wayspot.address);
    const address = geodata !== null && (gym.geodata === null || (match.move && refetch));
    const patch: BatchPatch = {
      ...(gym.pogoId === wayspot.id ? {} : { pogoId: wayspot.id }),
      ...(match.rename === null ? {} : { name: match.rename }),
      ...(match.picture === null ? {} : { imageUrl: match.picture }),
      ...(address ? { geodata } : {}),
    };
    try {
      if (match.move) {
        // The fields go with the place, in one write: the batch's summary counts a rename only
        // with its move.
        const moved = await ops.move(gymId, wayspot, {
          places: refetch,
          address: !address,
          patch,
        });
        if (!moved) return 'gone';
      } else if (Object.keys(patch).length > 0 && !(await ops.update(gymId, patch))) {
        return 'gone';
      }
    } catch (err) {
      log.error({ err, gym: gymId, wayspot: wayspot.id }, 'could not write a Wayfarer match');
      return 'failed';
    }
    if (match.titleProblem !== null) {
      // The texts are never logged: which gym, which Wayspot and why is enough to look.
      log.info(
        { gym: gymId, wayspot: wayspot.id, problem: match.titleProblem },
        'a Wayfarer title was not taken as the name of a gym',
      );
    }
    return 'written';
  }

  /**
   * Runs one write of the bookkeeping: a failure is logged and noted in `unrecorded`, and
   * nothing else stops for it.
   */
  private async record<T>(
    what: Unrecorded,
    write: () => Promise<T>,
    unrecorded: Unrecorded[] = [],
  ): Promise<T | undefined> {
    try {
      return await write();
    } catch (err) {
      this.options.log.error({ err, what }, 'could not record a part of a Wayfarer import');
      unrecorded.push(what);
      return undefined;
    }
  }

  /**
   * The plan of an import of the file for a server, against the server's gyms as they are now
   * (plan 19B-2: another server's gyms are none of its import, wherever they lie, and hold no
   * Wayspot from it). The gyms it considers are those of the server that lie in one of its
   * regions, and those in none of them that lie within `CANDIDATE_METRES` of one of its outlines
   * or in a cell the file covers (only the former are ever listed as not covered). Wayspots
   * outside the regions count only near those gyms (`matchGyms`), the Wayfarer ids of the
   * server's other gyms are taken, and a question staff answered already is left out
   * (`withAnswers`).
   */
  private async plan(guildId: number | undefined, file: WayspotExport): Promise<Planned> {
    const { admin, directory, regions, storage } = this.options;
    const own = regions
      .all()
      .filter((region) => guildId !== undefined && region.guildId === guildId)
      .flatMap((region) => {
        const { bounds } = region;
        if (bounds === null) return [];
        const grown = grownBox(boxOf(bounds), file.margin);
        return [
          {
            channelId: region.channelId,
            contains: containment(bounds),
            near: (point: LatLon) => nearRing(bounds, point, CANDIDATE_METRES),
            // How far a point lies from the outline, when within the file's margin of it.
            beyond: (point: LatLon): number | undefined => {
              if (!inBox(grown, point)) return undefined;
              const metres = metresFromRing(bounds, point);
              return metres <= file.margin ? metres : undefined;
            },
          },
        ];
      });
    const ownChannels = new Set(own.map((region) => region.channelId));
    const covered = coveredCells(file);
    // The server's gyms (plan 19B-2): another server's are none of its import, wherever they lie.
    const view = directory.of(guildId);
    const inOwn = (gym: Gym): boolean =>
      view.regionsOf(gym.id).some((channelId) => ownChannels.has(channelId));
    const considers = (gym: Gym): boolean =>
      guildId !== undefined &&
      admin.mayTouch(gym.id, guildId) &&
      (inOwn(gym) || covered.has(wayfarerCellAt(gym)) || own.some((region) => region.near(gym)));
    const all = view.all();
    const gyms = new Map(
      all
        .filter(considers)
        .sort((a, b) => a.id - b.id)
        .map((gym) => [gym.id, gym]),
    );
    const takenElsewhere = new Set(
      all.flatMap((gym) =>
        !gyms.has(gym.id) && gym.pogoId !== null && isWayfarerId(gym.pogoId) ? [gym.pogoId] : [],
      ),
    );
    // The server's gyms outside the import that may be a Wayfarer gym nobody holds: one of them near keeps
    // such a Wayspot from being added (`MatchInput.others`).
    const kinds = new Map(file.wayspots.map((wayspot) => [wayspot.id, wayspot.kind]));
    const others = all.filter(
      (gym) => !gyms.has(gym.id) && !isOtherWayspot(gym, (id) => kinds.get(id), covered),
    );
    const records = await storage.records([...gyms.keys(), ...others.map((gym) => gym.id)]);
    // What staff of this server answered last about each of its gyms, in the import or outside
    // it: "None of these" keeps those Wayspots from it.
    const decided =
      guildId === undefined
        ? new Map<number, StoredReview>()
        : await storage.latestDecided(guildId, [...gyms.keys(), ...others.map((gym) => gym.id)]);
    const last = new Map([...decided].filter(([gymId]) => gyms.has(gymId)));
    const lastOfOthers = new Map([...decided].filter(([gymId]) => !gyms.has(gymId)));
    const refused = new Map(
      [...last.values(), ...lastOfOthers.values()]
        .filter((item) => item.decision === 'none-of-these')
        .map((item) => [item.gymId, new Set(item.candidates.map((one) => one.id))]),
    );
    const matched = matchGyms({
      gyms: [...gyms.values()].map((gym) =>
        importGym(gym, records.get(gym.id)?.notInWayfarer ?? false),
      ),
      wayspots: guildId === undefined ? [] : file.wayspots,
      covered,
      storedLength: this.storedLength,
      inRegion: (point) => own.some((region) => region.contains(point)),
      takenElsewhere,
      others: others.map((gym) => importGym(gym, records.get(gym.id)?.notInWayfarer ?? false)),
      refused,
      nearOutline: (point) => nearestOutline(own, point, file.margin),
    });
    const listed: ImportPlan = {
      ...matched,
      outside: guildId === undefined ? file.wayspots.length : matched.outside,
      notCovered: matched.notCovered.filter((gap) => {
        const gym = gyms.get(gap.gymId);
        return gym !== undefined && inOwn(gym);
      }),
    };
    if (guildId === undefined) return { plan: listed, gyms, regions: own, open: [] };
    const open = await storage.openReviews(guildId);
    const openGyms = new Set(open.map((item) => item.gymId));
    const answeredLast = new Map([...last].filter(([gymId]) => !openGyms.has(gymId)));
    return { plan: withAnswers(listed, answeredLast, covered), gyms, regions: own, open };
  }

  /** The counts of a plan: what an import would do. */
  private tally(plan: ImportPlan): WayfarerCounts {
    const counts: WayfarerCounts = {
      ...emptyCounts(),
      notInWayfarer: plan.notInWayfarer.length,
      notCovered: plan.notCovered.length,
      answered: plan.answered.length,
      ignored: plan.outside,
      outside: plan.outsideGyms.length,
      held: plan.held.length,
    };
    const unchanged = new Set(plan.unchangedSeen);
    for (const match of plan.matched) countMatch(counts, match, unchanged.has(match.gymId));
    for (const wayspot of plan.added) {
      if (newGymName(wayspot.title, this.storedLength) === null) counts.untitled++;
      else counts.added++;
    }
    for (const item of plan.reviews) counts[reviewKey(item.kind)]++;
    return counts;
  }

  /** The counts of a plan by region of the server (`WayfarerPreview.byRegion`). */
  private byRegion(planned: Planned, guildId: number | undefined): WayfarerPreview['byRegion'] {
    const { plan, regions } = planned;
    const own = new Set(regions.map((region) => region.channelId));
    const regionsOfGym = (gymId: number): (string | null)[] => {
      const found = this.options.directory
        .of(guildId)
        .regionsOf(gymId)
        .filter((id) => own.has(id));
      return found.length === 0 ? [null] : found;
    };
    const part = (keep: (channels: readonly (string | null)[]) => boolean): ImportPlan => ({
      matched: plan.matched.filter((match) => keep(regionsOfGym(match.gymId))),
      added: plan.added.filter((wayspot) =>
        keep(regions.filter((region) => region.contains(wayspot)).map((r) => r.channelId)),
      ),
      held: plan.held.filter(({ wayspot }) =>
        keep(regions.filter((region) => region.contains(wayspot)).map((r) => r.channelId)),
      ),
      reviews: plan.reviews.filter((item) => keep(regionsOfGym(item.gymId))),
      notInWayfarer: plan.notInWayfarer.filter((id) => keep(regionsOfGym(id))),
      notCovered: plan.notCovered.filter((gap) => keep(regionsOfGym(gap.gymId))),
      unchangedSeen: plan.unchangedSeen.filter((id) => keep(regionsOfGym(id))),
      outside: 0,
      outsideGyms: [],
      answered: plan.answered.filter((id) => keep(regionsOfGym(id))),
    });
    return [...regions.map((region) => region.channelId), null].flatMap((channelId) => {
      const counts = this.tally(part((channels) => channels.includes(channelId)));
      return Object.values(counts).some((n) => n > 0) ? [{ channelId, counts }] : [];
    });
  }
}

/**
 * The outline of the server's regions nearest to a point outside them, within `margin` metres
 * (a file made without a margin has none: nothing is near).
 */
function nearestOutline(
  regions: readonly { channelId: string; beyond: (point: LatLon) => number | undefined }[],
  point: LatLon,
  margin: number,
): NearOutline | undefined {
  if (margin <= 0) return undefined;
  let nearest: NearOutline | undefined;
  for (const region of regions) {
    const metres = region.beyond(point);
    if (metres !== undefined && (!nearest || metres < nearest.metres)) {
      nearest = { metres, channelId: region.channelId };
    }
  }
  return nearest;
}

/** A Wayspot found gone as `wasStop` reads a kept row: by the kind it had when it went. */
function wentAs(gone: GoneWayspot | undefined): Pick<Wayspot, 'kind' | 'formerKind'> | undefined {
  return gone && { kind: gone.kind, formerKind: null };
}

/** A gym as the matching needs it. */
function importGym(gym: Gym, notInWayfarer: boolean): ImportGym {
  return {
    id: gym.id,
    pogoId: gym.pogoId,
    name: gym.name,
    lat: gym.lat,
    lon: gym.lon,
    notInWayfarer,
    imageUrl: gym.imageUrl,
  };
}

function emptyCounts(): WayfarerCounts {
  return {
    matched: 0,
    unchanged: 0,
    renamed: 0,
    tidied: 0,
    moved: 0,
    pictures: 0,
    unmarked: 0,
    added: 0,
    untitled: 0,
    reviewMatch: 0,
    reviewMissing: 0,
    reviewUnknown: 0,
    notInWayfarer: 0,
    notCovered: 0,
    answered: 0,
    ignored: 0,
    outside: 0,
    held: 0,
  };
}

function countMatch(counts: WayfarerCounts, match: MatchChange, unchanged: boolean): void {
  counts.matched++;
  if (unchanged) counts.unchanged++;
  if (match.rename !== null && match.tidyOnly) counts.tidied++;
  else if (match.rename !== null) counts.renamed++;
  if (match.move) counts.moved++;
  if (match.picture !== null) counts.pictures++;
  if (match.unmark) counts.unmarked++;
}

function reviewKey(kind: ReviewItem['kind']): 'reviewMatch' | 'reviewMissing' | 'reviewUnknown' {
  return kind === 'match' ? 'reviewMatch' : kind === 'missing' ? 'reviewMissing' : 'reviewUnknown';
}

/** A time of the file (ISO 8601, not checked by the reader) as epoch milliseconds, or null. */
function epochOf(text: string): number | null {
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/** Whether an open item asks what a planned one asks: the same kind about the same Wayspots. */
function sameQuestion(open: StoredReview | undefined, planned: ReviewItem): boolean {
  if (open?.kind !== planned.kind || open.candidates.length !== planned.candidates.length) {
    return false;
  }
  const ids = new Set(open.candidates.map((one) => one.id));
  return planned.candidates.every((one) => ids.has(one.id));
}
