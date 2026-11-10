import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import { GYM_TEXT_LIMITS, tidyLine } from '../gyms/gym-text.js';
import { nameKey } from '../gyms/shared-names.js';
import { foldText } from '../search/text.js';
import { isWayfarerId, type ExportedWayspot } from '@pine/wayspot-core/export-file';
import {
  stillAnswered,
  type ReviewCandidate,
  type ReviewDecision,
  type ReviewItem,
  type ReviewKind,
} from './review.js';

/**
 * Which gym of Pine is which Wayspot of an export (spec "Matching gyms"): what an import
 * writes, adds, puts in the review queue and leaves alone. Pure: the import service plans with
 * it for the preview and again, under the admin lock, when staff press Import.
 */

/** A Wayspot whose title is the gym's name, letters and digits compared, within this: certain. */
export const CERTAIN_NAME_METRES = 20;
/** A Wayspot whose title is the gym's name but for "the", "a", "an" and punctuation: certain. */
export const CERTAIN_LOOSE_METRES = 50;
/** A Wayspot this close, whatever its title: certain (the gym was renamed). */
export const CERTAIN_PLACE_METRES = 5;
/** How far from a gym the Wayspots offered in the review queue lie at most. */
export const CANDIDATE_METRES = 100;
/** How many Wayspots an item of the queue offers at most. */
export const MAX_CANDIDATES = 5;
/** A matched Wayspot farther than this from its gym moves the gym. */
export const MOVE_METRES = 3;
/**
 * A gym is asked about as `missing` or `unknown` only when every cell within this of it was
 * covered: its Wayspot may lie unseen across the edge of its own cell.
 */
export const COVERED_AROUND_METRES = 50;
/** The width of `GymMeta.imageUrl`: a longer picture address is not stored. */
export const MAX_PICTURE_ADDRESS = 255;

/** What the matching needs of a gym of Pine. */
export interface ImportGym {
  id: number;
  /** `Gym.pogoId`: a Wayfarer id once the gym was matched (`isWayfarerId`), or anything else. */
  pogoId: string | null;
  /** The gym's name, decoded (not the nickname). */
  name: string;
  lat: number;
  lon: number;
  /** Staff said the gym is not in Wayfarer (a sponsored gym): it is never queued. */
  notInWayfarer: boolean;
  /** `GymMeta.imageUrl`: the address of the gym's picture, as the last import wrote it. */
  imageUrl: string | null;
}

export interface MatchInput {
  /** The gyms the import considers. */
  gyms: readonly ImportGym[];
  /**
   * The Wayspots of the file. Those outside the server's regions (`inRegion`) are considered only
   * within `CANDIDATE_METRES` of a gym (or when a gym's Wayfarer id names them), so that a gym
   * just inside the edge finds its Wayspot just outside; they are never added.
   */
  wayspots: readonly ExportedWayspot[];
  /** Whether a point lies in a region of the server. Default: everywhere. */
  inRegion?: (point: LatLon) => boolean;
  /**
   * Whether the server may put a gym at a point (`GymAdminService.mayPlace`): a match that would
   * move a gym where it may not is asked about instead. Default: everywhere.
   */
  mayPlace?: (point: LatLon) => boolean;
  /**
   * The Wayfarer ids that gyms outside `gyms` hold (another server's): such a Wayspot is taken,
   * so that one Wayspot never ends up on two gyms. Default: none.
   */
  takenElsewhere?: ReadonlySet<string>;
  /**
   * Gyms outside `gyms` (another server's, or ones the import does not consider): a Wayfarer gym
   * nobody took that one of them may be (`isOtherWayspot`, not refused) within
   * `CANDIDATE_METRES` is not added but held (`ImportPlan.held`), nor listed as outside.
   * Default: none.
   */
  others?: readonly ImportGym[];
  /**
   * The Wayspots staff said a gym is not ("None of these", the last answer about it), by gym:
   * such a gym is never offered those, and a gym of `others` (whose answer may be any server's)
   * holds none of them back. Default: none.
   */
  refused?: ReadonlyMap<number, ReadonlySet<string>>;
  /** The file's covered cells (`coveredCells`): only there is a Wayspot's absence a fact. */
  covered: ReadonlySet<string>;
  /**
   * How far a point outside the server's regions lies from the nearest of their outlines, and
   * which region's that is; undefined beyond the file's margin. A Wayfarer gym there that no gym
   * took or may be is listed (`ImportPlan.outsideGyms`). Default: nowhere (none listed).
   */
  nearOutline?: (point: LatLon) => NearOutline | undefined;
  /**
   * The length of a name as the database stores it (`storedTextLength`, entity-encoded): the
   * domain does not know the encoding.
   */
  storedLength: (text: string) => number;
}

/** How far a point lies outside the regions, from the outline of which region (`channelId`). */
export interface NearOutline {
  metres: number;
  channelId: string;
}

/**
 * A Wayfarer gym outside every region of the server, within the margin the file's run scanned
 * beyond them, that no gym took or may be: never added, listed so that staff see where an
 * outline should grow (Matt, 2026-10-15).
 */
export interface OutsideGym extends NearOutline {
  wayspot: ExportedWayspot;
}

/** How a gym was found: by its stored id, certainly by its name, or certainly by its place alone. */
export type MatchedBy = 'id' | 'name' | 'place';

/** Why a Wayspot's title cannot be the gym's name: nothing once tidied, or too long for the column. */
export type TitleProblem = 'blank' | 'too-long';

/**
 * What making a gym a Wayspot changes (`matchChange`): what an import writes for a match, and
 * what a review's "Same as" writes.
 */
export interface MatchChange {
  gymId: number;
  wayspot: ExportedWayspot;
  /** From the gym to the Wayspot. */
  metres: number;
  /** The Wayspot's title, tidied, when it differs from the gym's name and can be stored. */
  rename: string | null;
  /**
   * The rename only tidies the name: it differs in spaces or capitals alone (`tidiesName`).
   * Written all the same, but no change (Matt, 2026-10-16): not counted or announced as a
   * rename, and no reason by itself to call a gym changed.
   */
  tidyOnly: boolean;
  /** Why the title is not used (the name stays, the match stands). */
  titleProblem: TitleProblem | null;
  /** More than `MOVE_METRES` apart: the gym moves to the Wayspot. */
  move: boolean;
  /** The Wayspot's picture address (`pictureOf`) when it differs from the gym's; else null. */
  picture: string | null;
  /**
   * The gym is marked "not in Wayfarer", and Wayfarer has it after all: the mark is cleared
   * (the gym is then asked about again like any other, should it go missing).
   */
  unmark: boolean;
}

/** A gym that is a Wayfarer gym of the file, and how it was found. */
export interface Matched extends MatchChange {
  by: MatchedBy;
}

/** A gym left alone because the export did not cover its cell. */
export interface NotCovered {
  gymId: number;
  /** The token of its level-14 cell. */
  cell: string;
}

/**
 * What an import of a file does. Every gym of the input is in exactly one of `matched`,
 * `reviews`, `notInWayfarer`, `notCovered` and `answered`; each list is ordered by gym id (`added` by
 * Wayspot id).
 */
export interface ImportPlan {
  /** Gyms that are a Wayfarer gym: by id, or certainly by name or place. */
  matched: Matched[];
  /**
   * Wayfarer gyms of the server's regions that no gym of Pine is or may be: no gym that may be
   * it lies within `CANDIDATE_METRES`.
   */
  added: ExportedWayspot[];
  /** What needs a person: one item per gym. */
  reviews: ReviewItem[];
  /** Gyms marked "not in Wayfarer" that matched nothing: left alone, counted. */
  notInWayfarer: number[];
  /**
   * Wayfarer gyms of the regions that a gym may be, but that are neither offered nor added: every
   * gym of the input that may be it has `MAX_CANDIDATES` Wayspots offered already (the first of
   * them named), or else a gym outside the input that may be it lies within `CANDIDATE_METRES`
   * (`MatchInput.others`; the nearest named). A later import offers or adds it. By Wayspot id.
   */
  held: { wayspot: ExportedWayspot; gymId: number }[];
  /** Gyms the export cannot say anything about. */
  notCovered: NotCovered[];
  /**
   * The gyms of `matched` with nothing to write but when they were seen: by id, same name, same
   * place, same picture, not marked.
   */
  unchangedSeen: number[];
  /** How many Wayspots of the input were not considered: outside the regions, far from every gym. */
  outside: number;
  /**
   * Wayfarer gyms outside the regions, within the file's margin (`MatchInput.nearOutline`), that
   * no gym took (here or elsewhere), none is offered and none may be (here or elsewhere), and
   * that lie in no region of another server (`mayPlace`): never added. By Wayspot id.
   */
  outsideGyms: OutsideGym[];
  /**
   * Gyms whose question staff answered already, with "Keep" or "None of these", and that is
   * still the question (`withAnswers`): not asked again. Empty from `matchGyms`.
   */
  answered: number[];
}

/**
 * The plan without the questions staff answered already (`stillAnswered`): those gyms are in
 * `answered` instead. `last` is the newest decided item of each gym that has no open one;
 * `covered` the covered cells of the file planned from.
 */
export function withAnswers(
  plan: ImportPlan,
  last: ReadonlyMap<number, ReviewItem & { decision: ReviewDecision | null }>,
  covered: ReadonlySet<string>,
): ImportPlan {
  const answered = plan.reviews.filter((item) =>
    stillAnswered(item, last.get(item.gymId), covered),
  );
  if (answered.length === 0) return plan;
  const ids = new Set(answered.map((item) => item.gymId));
  return {
    ...plan,
    reviews: plan.reviews.filter((item) => !ids.has(item.gymId)),
    answered: [...plan.answered, ...ids].sort((a, b) => a - b),
  };
}

const LOOSE_WORDS: ReadonlySet<string> = new Set(['the', 'a', 'an']);

/**
 * A name by its letters and digits without the words "the", "a" and "an": `The Old Mill` and
 * `Old Mill!` are one. Empty for a name of nothing else, which matches nothing.
 */
export function looseNameKey(text: string): string {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !LOOSE_WORDS.has(word))
    .join('');
}

const RADIANS = Math.PI / 180;
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;
/** The side of a square of the grid, in degrees (about 111 m of latitude). */
const GRID_DEGREES = 0.001;

/**
 * Places in squares of `GRID_DEGREES`, so that the places near a point are found without
 * measuring them all (Pittsburgh: thousands of gyms against tens of thousands of Wayspots).
 * Rows that cross the antimeridian are not joined: no region of a server lies there.
 */
class PlaceGrid<P extends LatLon> {
  private readonly rows = new Map<number, Map<number, P[]>>();

  constructor(places: Iterable<P>) {
    for (const place of places) {
      const row = this.rows.get(square(place.lat)) ?? new Map<number, P[]>();
      this.rows.set(square(place.lat), row);
      const column = square(place.lon);
      const places = row.get(column);
      if (places) places.push(place);
      else row.set(column, [place]);
    }
  }

  /** The places within `metres` of a point, each with its distance, in no order. */
  within(point: LatLon, metres: number): { place: P; metres: number }[] {
    const latDegrees = metres / METRES_PER_DEGREE;
    const rowSpan = Math.ceil(latDegrees / GRID_DEGREES) + 1;
    const cos = Math.cos(Math.min(90, Math.abs(point.lat) + latDegrees) * RADIANS);
    const columnSpan = cos < 1e-6 ? Infinity : Math.ceil(latDegrees / cos / GRID_DEGREES) + 1;
    const row0 = square(point.lat);
    const column0 = square(point.lon);
    const found: { place: P; metres: number }[] = [];
    const look = (places: readonly P[]): void => {
      for (const place of places) {
        const distance = metresBetween(point, place);
        if (distance <= metres) found.push({ place, metres: distance });
      }
    };
    for (let r = row0 - rowSpan; r <= row0 + rowSpan; r++) {
      const row = this.rows.get(r);
      if (!row) continue;
      if (2 * columnSpan + 1 >= row.size) {
        for (const places of row.values()) look(places);
      } else {
        for (let c = column0 - columnSpan; c <= column0 + columnSpan; c++) look(row.get(c) ?? []);
      }
    }
    return found;
  }
}

function square(degrees: number): number {
  return Math.floor(degrees / GRID_DEGREES);
}

/** A Wayspot near a gym, and how near. */
interface Near {
  wayspot: ExportedWayspot;
  metres: number;
}

const byNearness = (a: Near, b: Near): number =>
  a.metres - b.metres || (a.wayspot.id < b.wayspot.id ? -1 : a.wayspot.id > b.wayspot.id ? 1 : 0);

/** A certain candidate of a gym: a Wayspot one of the three rules allows. */
interface Certain extends Near {
  by: 'name' | 'place';
}

/**
 * How a Wayspot may certainly be a gym, by the three rules; undefined when by none. A Wayspot of
 * any kind by its name (a gym that became a stop is found so), but only a Wayfarer gym by its
 * place alone (a stop beside a gym is no rename of it), and never for a gym marked "not in
 * Wayfarer" (a sponsored gym that stands beside a Wayspot is not that Wayspot).
 */
function certainBy(gym: ImportGym, near: Near): 'name' | 'place' | undefined {
  const { title } = near.wayspot;
  if (near.metres <= CERTAIN_NAME_METRES) {
    const key = nameKey(gym.name);
    if (key !== '' && nameKey(title) === key) return 'name';
  }
  if (near.metres <= CERTAIN_LOOSE_METRES) {
    const key = looseNameKey(gym.name);
    if (key !== '' && looseNameKey(title) === key) return 'name';
  }
  const placeOnly = near.wayspot.kind === 'gym' && !gym.notInWayfarer;
  return placeOnly && near.metres <= CERTAIN_PLACE_METRES ? 'place' : undefined;
}

/** Whether a Wayspot's title is a gym's name: by letters and digits, or but for "the" and the like. */
function sameName(gym: ImportGym, wayspot: ExportedWayspot): boolean {
  const key = nameKey(gym.name);
  const loose = looseNameKey(gym.name);
  return (
    (key !== '' && nameKey(wayspot.title) === key) ||
    (loose !== '' && looseNameKey(wayspot.title) === loose)
  );
}

/**
 * What a gym was found to be: `gym`, a Wayfarer gym; `turned`, its own Wayspot (the one its
 * Wayfarer id names, or its namesake) is a stop or a power spot now.
 */
type Found = { kind: 'gym' | 'turned'; wayspot: ExportedWayspot; by: MatchedBy; metres: number };

const byId = (a: ExportedWayspot, b: ExportedWayspot): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Who holds a Wayspot that a gym outside the input holds (`takenElsewhere`). */
const ELSEWHERE = -1;

/**
 * The plan of an import. In order:
 *
 * 1. By id: a gym whose `pogoId` is a Wayfarer gym of the file is that Wayspot, however far.
 *    Where two gyms hold one id, the nearer to it is it (ties: the lower gym id); the other
 *    shares it: it goes on to step 2 like a gym never matched, and if nothing takes it there it
 *    is asked about with that Wayspot as its own candidate, marked `heldBy` the nearer gym (a
 *    `missing` item unless a Wayfarer gym near makes it a `match`). A gym whose `pogoId` is a
 *    stop or a power spot now keeps it as its own and goes on to step 2, where only Wayfarer
 *    gyms can be it (its Wayspot may have become a gym under a new id).
 * 2. Certainly: of the Wayspots not yet taken, exactly one may be the gym by the three rules
 *    (`certainBy`), or exactly one by its name beside others by their place alone. Every pick
 *    by name is taken before any by place alone (a pass takes picks by place only when it has
 *    none by name); within each, gyms go in order of the distance to the Wayspot each would
 *    take (`certainPick`), and again while a pass takes anything, so that a Wayspot taken by a
 *    gym nearer to it no longer makes another gym's choice uncertain. A Wayspot is taken by at
 *    most one gym. A gym whose Wayspot
 *    the file lacks is tried here too (its Wayspot may have a new id), unless its cell was not
 *    covered (its Wayspot is there, unseen).
 * 3. A Wayfarer gym a gym found that cannot be written as it stands is asked about instead: one
 *    by id more than `CANDIDATE_METRES` away (a Wayspot does not move that far: the id is
 *    stale or wrong), and one that would move the gym where the server may not put it
 *    (`mayPlace`). Such a gym is asked about: it keeps the Wayspot from everybody else.
 * 4. A Wayfarer gym nobody took is offered for a gym that may be it within `CANDIDATE_METRES`
 *    (one neither matched nor marked "not in Wayfarer": never matched, turned, its id gone from a
 *    covered cell, asked about; not one whose id the file lacks where it did not cover every cell
 *    within `COVERED_AROUND_METRES` of the gym, which is a Wayspot this file did not see; not one staff answered "None of these" about it,
 *    `refused`), the one of its name first, else the nearest, and a gym is offered at most
 *    `MAX_CANDIDATES` such Wayspots, its own counted first (the nearest Wayspots are offered
 *    first; the rest go to the next gym that may be them). Adding it would make a second gym of
 *    the one that gym may be. When every such gym has its five, it is `held` (offered by a
 *    later import). With no such gym it is added, where it lies in the server's regions, unless
 *    a gym outside the input that may be it (`others`, not refused) lies within
 *    `CANDIDATE_METRES`: then it is `held`. A gym matched or marked nearby does not keep it out:
 *    two gyms that close exist in Wayfarer, which is the truth.
 * 5. What is left is queued with its candidates: the Wayspots within `CANDIDATE_METRES` that
 *    nobody else took and that are not added, nearest first, at most `MAX_CANDIDATES`, but its
 *    own Wayspot and the Wayfarer gyms offered for it always. A gym whose id the file lacks
 *    where a cell within `COVERED_AROUND_METRES` was not covered is not covered (with the first
 *    such cell). With a Wayfarer gym among the candidates (not one a nearer gym holds) it is a
 *    `match`. Else a gym whose own Wayspot is a stop or a power spot, or is held by a nearer gym,
 *    is `missing` (whatever the coverage: its Wayspot was seen), and, where every cell within
 *    `COVERED_AROUND_METRES` of the gym is covered (`cellsAround`), so is one whose Wayfarer id
 *    the file lacks; a gym never matched is `unknown` (the stops near it listed); anything else
 *    is not covered (with the first cell near it that was not).
 * 6. A Wayfarer gym outside the regions that no gym took, is offered or may be (of `others`
 *    too), within the file's margin of an outline (`nearOutline`) and in no region of another
 *    server (`mayPlace`), is listed (`outsideGyms`): never added.
 *
 * Gyms marked "not in Wayfarer" are matched by id or name like any other, and never queued.
 */
export function matchGyms(input: MatchInput): ImportPlan {
  const inRegion = input.inRegion ?? (() => true);
  const mayPlace = input.mayPlace ?? (() => true);
  const gyms = [...input.gyms].sort((a, b) => a.id - b.id);
  const everyGym = new PlaceGrid(gyms);
  const named = new Set(gyms.flatMap((gym) => (gym.pogoId === null ? [] : [gym.pogoId])));
  const considered = input.wayspots.filter(
    (wayspot) =>
      inRegion(wayspot) ||
      named.has(wayspot.id) ||
      everyGym.within(wayspot, CANDIDATE_METRES).length > 0,
  );
  const wayspots = new Map(considered.map((wayspot) => [wayspot.id, wayspot]));
  const grid = new PlaceGrid([...wayspots.values()]);
  const takenBy = new Map<string, number>();
  for (const id of input.takenElsewhere ?? []) takenBy.set(id, ELSEWHERE);
  const found = new Map<number, Found>();

  const take = (gym: ImportGym, wayspot: ExportedWayspot, by: MatchedBy, metres: number): void => {
    takenBy.set(wayspot.id, gym.id);
    found.set(gym.id, { kind: wayspot.kind === 'gym' ? 'gym' : 'turned', wayspot, by, metres });
  };

  const turnedById = new Map<number, Near>();
  // Two gyms that hold one Wayfarer id: the nearer is that Wayspot (ties: the lower id), and the
  // other shares it (`shared`, with the gym that holds it).
  const shared = new Map<number, Near & { holder: number }>();
  const holdings = gyms
    .flatMap((gym) => {
      const wayspot = gym.pogoId === null ? undefined : wayspots.get(gym.pogoId);
      return wayspot ? [{ gym, wayspot, metres: metresBetween(gym, wayspot) }] : [];
    })
    .sort((a, b) => a.metres - b.metres || a.gym.id - b.gym.id);
  for (const { gym, wayspot, metres } of holdings) {
    const holder = takenBy.get(wayspot.id);
    if (holder !== undefined) {
      if (holder !== ELSEWHERE) shared.set(gym.id, { wayspot, metres, holder });
      continue;
    }
    if (wayspot.kind === 'gym') {
      take(gym, wayspot, 'id', metres);
    } else {
      takenBy.set(wayspot.id, gym.id);
      turnedById.set(gym.id, { wayspot, metres });
    }
  }

  // A gym whose Wayfarer id the file lacks where it did not cover every cell within
  // `COVERED_AROUND_METRES` of the gym is that Wayspot, unseen (it may lie across the edge of
  // the gym's cell): it says nothing about the gym, and the gym may be no other Wayspot.
  const uncoveredNear = new Map<number, string | undefined>();
  const firstUncovered = (gym: ImportGym): string | undefined => {
    if (!uncoveredNear.has(gym.id)) {
      uncoveredNear.set(
        gym.id,
        cellsAround(gym).find((token) => !input.covered.has(token)),
      );
    }
    return uncoveredNear.get(gym.id);
  };
  const unseen = (gym: ImportGym): boolean =>
    gym.pogoId !== null &&
    isWayfarerId(gym.pogoId) &&
    !wayspots.has(gym.pogoId) &&
    firstUncovered(gym) !== undefined;

  const live = (certain: readonly Certain[]): Certain[] =>
    certain.filter((near) => !takenBy.has(near.wayspot.id));
  let pending = gyms
    .filter((gym) => !found.has(gym.id) && !unseen(gym))
    .map((gym) => ({
      gym,
      certain: grid
        .within(gym, CERTAIN_LOOSE_METRES)
        .flatMap(({ place, metres }): Certain[] => {
          if (turnedById.has(gym.id) && place.kind !== 'gym') return [];
          const by = certainBy(gym, { wayspot: place, metres });
          return by ? [{ wayspot: place, metres, by }] : [];
        })
        .sort(byNearness),
    }));
  for (let taking = true; taking;) {
    taking = false;
    // By the Wayspot each gym would take: the nearest such pairs first; undecided gyms last.
    const picked = pending
      .map((entry) => ({ ...entry, certain: live(entry.certain) }))
      .filter((entry) => entry.certain.length > 0)
      .map((entry) => ({ ...entry, pick: certainPick(entry.certain) }))
      .sort(
        (a, b) =>
          (a.pick?.metres ?? Infinity) - (b.pick?.metres ?? Infinity) || a.gym.id - b.gym.id,
      );
    pending = picked;
    // Picks by name first: a pass takes picks by place alone only when it has none by name, so
    // that a gym's namesake is never taken by another gym that stands near it.
    const by = picked.some((entry) => entry.pick?.by === 'name') ? 'name' : 'place';
    for (const { gym, certain } of picked) {
      const pick = certainPick(live(certain));
      if (pick?.by !== by) continue;
      take(gym, pick.wayspot, pick.by, pick.metres);
      taking = true;
    }
    pending = pending.filter((entry) => !found.has(entry.gym.id));
  }
  for (const [gymId, { wayspot, metres }] of turnedById) {
    if (!found.has(gymId)) found.set(gymId, { kind: 'turned', wayspot, by: 'id', metres });
  }

  const asked = new Set<number>();
  for (const [gymId, match] of found) {
    if (match.kind !== 'gym') continue;
    const far = match.metres > CANDIDATE_METRES;
    if (far || (match.metres > MOVE_METRES && !mayPlace(match.wayspot))) asked.add(gymId);
  }

  const mayOwn = (gym: ImportGym): boolean =>
    !gym.notInWayfarer && !unseen(gym) && (found.get(gym.id)?.kind !== 'gym' || asked.has(gym.id));
  const placed = new Map<number, Set<string>>();
  const place = (gymId: number, wayspotId: string): void => {
    placed.set(gymId, (placed.get(gymId) ?? new Set()).add(wayspotId));
  };
  const ownersList = gyms.filter(mayOwn);
  // Its own Wayspot first: it is always offered, and counts against `MAX_CANDIDATES`.
  for (const gym of ownersList) {
    const own = found.get(gym.id) ?? shared.get(gym.id);
    if (own) place(gym.id, own.wayspot.id);
  }
  const owners = new PlaceGrid(ownersList);
  const kinds = new Map(input.wayspots.map((wayspot) => [wayspot.id, wayspot.kind]));
  const others = new PlaceGrid(
    (input.others ?? []).filter(
      (gym) => !gym.notInWayfarer && !isOtherWayspot(gym, (id) => kinds.get(id), input.covered),
    ),
  );
  const refused = input.refused ?? new Map<number, ReadonlySet<string>>();
  // The nearest gym outside the input that may be a Wayspot (not one that refused it).
  const otherFor = (wayspot: ExportedWayspot): ImportGym | undefined =>
    others
      .within(wayspot, CANDIDATE_METRES)
      .filter(({ place: gym }) => !refused.get(gym.id)?.has(wayspot.id))
      .sort((a, b) => a.metres - b.metres || a.place.id - b.place.id)[0]?.place;
  // Wayspots outside the regions that a gym of the input may be: never listed as outside.
  const claimed = new Set<string>();
  const added: ExportedWayspot[] = [];
  const held: ImportPlan['held'] = [];
  const unclaimed = [...wayspots.values()]
    .filter((wayspot) => wayspot.kind === 'gym' && !takenBy.has(wayspot.id))
    .map((wayspot) => ({
      wayspot,
      choices: owners
        .within(wayspot, CANDIDATE_METRES)
        .filter(({ place: gym }) => !refused.get(gym.id)?.has(wayspot.id))
        .sort(
          (a, b) =>
            Number(sameName(b.place, wayspot)) - Number(sameName(a.place, wayspot)) ||
            a.metres - b.metres ||
            a.place.id - b.place.id,
        ),
    }))
    // The Wayspots nearest a gym are offered first, so a gym offered too many has the nearest.
    .sort(
      (a, b) =>
        (a.choices[0]?.metres ?? Number.MAX_VALUE) - (b.choices[0]?.metres ?? Number.MAX_VALUE) ||
        byId(a.wayspot, b.wayspot),
    );
  for (const { wayspot, choices } of unclaimed) {
    const owner = choices.find(
      ({ place: gym }) => (placed.get(gym.id)?.size ?? 0) < MAX_CANDIDATES,
    );
    if (owner) {
      place(owner.place.id, wayspot.id);
      continue;
    }
    // Every gym of the input that may be it has `MAX_CANDIDATES` placed already: it waits for
    // a later import, as one that a gym outside the input may be does.
    const holder = choices[0]?.place ?? otherFor(wayspot);
    if (!inRegion(wayspot)) {
      if (choices.length > 0) claimed.add(wayspot.id);
    } else if (holder) {
      held.push({ wayspot, gymId: holder.id });
    } else {
      added.push(wayspot);
    }
  }
  added.sort(byId);
  held.sort((a, b) => byId(a.wayspot, b.wayspot));
  const offered = new Set([...placed.values()].flatMap((ids) => [...ids]));
  const nearOutline = input.nearOutline ?? (() => undefined);
  const outsideGyms = input.wayspots
    .filter(
      (wayspot) =>
        wayspot.kind === 'gym' &&
        !takenBy.has(wayspot.id) &&
        !offered.has(wayspot.id) &&
        !claimed.has(wayspot.id) &&
        !inRegion(wayspot) &&
        otherFor(wayspot) === undefined &&
        // In a region of another server: theirs to list.
        mayPlace(wayspot),
    )
    .flatMap((wayspot): OutsideGym[] => {
      const near = nearOutline(wayspot);
      return near ? [{ wayspot, metres: near.metres, channelId: near.channelId }] : [];
    })
    .sort((a, b) => byId(a.wayspot, b.wayspot));

  // A Wayspot that is added becomes a gym of its own: no candidate of another.
  const addedIds = new Set(added.map((wayspot) => wayspot.id));
  const nearby = (gym: ImportGym): Near[] =>
    grid
      .within(gym, CANDIDATE_METRES)
      .filter(
        ({ place }) => (takenBy.get(place.id) ?? gym.id) === gym.id && !addedIds.has(place.id),
      )
      .map(({ place, metres }) => ({ wayspot: place, metres }));

  const plan: ImportPlan = {
    matched: [],
    added,
    held,
    reviews: [],
    notInWayfarer: [],
    notCovered: [],
    unchangedSeen: [],
    outside: input.wayspots.length - considered.length,
    outsideGyms,
    answered: [],
  };
  for (const gym of gyms) {
    const match = found.get(gym.id);
    if (match?.kind === 'gym' && !asked.has(gym.id)) {
      const done: Matched = {
        ...matchChange(gym, match.wayspot, input.storedLength, match.metres),
        by: match.by,
      };
      plan.matched.push(done);
      // A name only tidied is written: the gym is not unchanged.
      if (done.by === 'id' && !changesGym(done) && done.rename === null && !done.unmark) {
        plan.unchangedSeen.push(gym.id);
      }
      continue;
    }
    if (gym.notInWayfarer) {
      plan.notInWayfarer.push(gym.id);
      continue;
    }
    const cell = wayfarerCellAt(gym);
    const uncovered = firstUncovered(gym);
    if (unseen(gym)) {
      plan.notCovered.push({ gymId: gym.id, cell: uncovered ?? cell });
      continue;
    }
    const near = nearby(gym);
    // Its own Wayspot: the one it matched or turned into, or the one a nearer gym holds.
    const own = match ?? shared.get(gym.id);
    if (own) {
      place(gym.id, own.wayspot.id);
      if (!near.some((one) => one.wayspot.id === own.wayspot.id)) {
        near.push({ wayspot: own.wayspot, metres: own.metres });
      }
    }
    const holder = match ? undefined : shared.get(gym.id)?.holder;
    const candidates = chosen(near.sort(byNearness), placed.get(gym.id)).map((one) =>
      candidate(one, own?.wayspot.id, holder),
    );
    const covered = uncovered === undefined;
    const idGone = gym.pogoId !== null && isWayfarerId(gym.pogoId) && !wayspots.has(gym.pogoId);
    let kind: ReviewKind | undefined;
    if (candidates.some((one) => one.kind === 'gym' && one.heldBy === undefined)) kind = 'match';
    else if (own || (idGone && covered)) kind = 'missing';
    else if (!idGone && covered) kind = 'unknown';
    if (kind) plan.reviews.push({ gymId: gym.id, kind, candidates });
    else plan.notCovered.push({ gymId: gym.id, cell: uncovered ?? cell });
  }
  return plan;
}

/**
 * The level-14 cells within `COVERED_AROUND_METRES` of a point, as far as the point itself and
 * the points that far from it in the eight compass directions find them (a cell is about 600
 * metres across): its own cell first.
 */
export function cellsAround(point: LatLon): string[] {
  const perLat = COVERED_AROUND_METRES / METRES_PER_DEGREE;
  const perLon = perLat / Math.cos(point.lat * RADIANS);
  const cells = new Set([wayfarerCellAt(point)]);
  for (let step = 0; step < 8; step++) {
    const angle = (step * Math.PI) / 4;
    cells.add(
      wayfarerCellAt({
        lat: point.lat + perLat * Math.cos(angle),
        lon: point.lon + perLon * Math.sin(angle),
      }),
    );
  }
  return [...cells];
}

/**
 * Of a gym's certain candidates that nobody took, the one it is: the only one, or the only one
 * by name beside others by their place alone (a Wayspot of its name 15 metres off is the gym
 * rather than a statue 3 metres off). Undefined while it cannot be told.
 */
function certainPick(certain: readonly Certain[]): Certain | undefined {
  const byName = certain.filter((near) => near.by === 'name');
  if (byName.length === 1) return byName[0];
  return byName.length === 0 && certain.length === 1 ? certain[0] : undefined;
}

/**
 * Whether a gym is known to be a Wayspot other than any the file has nobody for: its Wayfarer id
 * names a Wayfarer gym of the file, or the file lacks that id where it did not cover every cell
 * within `COVERED_AROUND_METRES` of the gym (a Wayspot this file did not see). Such a gym may not
 * be a Wayfarer gym nobody took. `kindOf` is the kind of a Wayspot of the file by its id.
 */
export function isOtherWayspot(
  gym: Pick<ImportGym, 'pogoId' | 'lat' | 'lon'>,
  kindOf: (id: string) => ExportedWayspot['kind'] | undefined,
  covered: ReadonlySet<string>,
): boolean {
  if (gym.pogoId === null || !isWayfarerId(gym.pogoId)) return false;
  const kind = kindOf(gym.pogoId);
  return (
    kind === 'gym' || (kind === undefined && cellsAround(gym).some((token) => !covered.has(token)))
  );
}

/**
 * What making a gym this Wayspot changes: its name to the Wayspot's title, tidied (unless that
 * is blank or too long for the column: the name stays, `titleProblem` says why), its place
 * when more than `MOVE_METRES` apart, its picture, and its mark "not in Wayfarer". `metres` is
 * measured when not given. The `pogoId` is the caller's: it is written whenever it differs.
 */
export function matchChange(
  gym: ImportGym,
  wayspot: ExportedWayspot,
  storedLength: (text: string) => number,
  metres = metresBetween(gym, wayspot),
): MatchChange {
  const title = tidyLine(wayspot.title);
  const titleProblem: TitleProblem | null =
    title === '' ? 'blank' : storedLength(title) > GYM_TEXT_LIMITS.stored ? 'too-long' : null;
  const picture = pictureOf(wayspot.image);
  const rename = titleProblem === null && title !== gym.name ? title : null;
  return {
    gymId: gym.id,
    wayspot,
    metres,
    rename,
    tidyOnly: rename !== null && tidiesName(gym.name, rename),
    titleProblem,
    move: metres > MOVE_METRES,
    picture: picture !== null && picture !== gym.imageUrl ? picture : null,
    unmark: gym.notInWayfarer,
  };
}

/**
 * Whether a match changes the gym: a new name (not one that only tidies it), a new place or a
 * new picture. What only tidies the name is written, but is no change.
 */
export function changesGym(change: MatchChange): boolean {
  return (change.rename !== null && !change.tidyOnly) || change.move || change.picture !== null;
}

/**
 * Whether a new name only tidies an old one (Matt, 2026-10-16): the same but for spaces (at
 * either end, or more than one between words) and capitals. Pine's stored names carry spaces
 * at their ends from the old gym data ("Monastery fountains " → "Monastery Fountains").
 */
export function tidiesName(before: string, after: string): boolean {
  const plain = (name: string): string =>
    name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
  return before !== after && plain(before) === plain(after);
}

/** The address of a Wayspot's picture as a gym keeps it: null when it has none or it is too long. */
export function pictureOf(image: string): string | null {
  return image === '' || image.length > MAX_PICTURE_ADDRESS ? null : image;
}

/**
 * The name of a gym made of a Wayspot: its title tidied, cut by characters until it fits the
 * column; null when nothing is left of it (such a Wayspot is not added: a gym needs a name).
 */
export function newGymName(title: string, storedLength: (text: string) => number): string | null {
  const characters = [...tidyLine(title)];
  while (characters.length > 0 && storedLength(characters.join('')) > GYM_TEXT_LIMITS.stored) {
    characters.pop();
  }
  const name = characters.join('').trim();
  return name === '' ? null : name;
}

/**
 * The Wayspots an item offers: those placed with this gym (its own Wayspot, the Wayfarer gyms
 * offered for it; never more than `MAX_CANDIDATES`), then the nearest others up to
 * `MAX_CANDIDATES`, nearest first.
 */
function chosen(nearby: readonly Near[], offered: ReadonlySet<string> | undefined): Near[] {
  const kept = nearby.filter((near) => offered?.has(near.wayspot.id));
  for (const near of nearby) {
    if (kept.length >= MAX_CANDIDATES) break;
    if (!offered?.has(near.wayspot.id)) kept.push(near);
  }
  return kept.sort(byNearness).slice(0, MAX_CANDIDATES);
}

/**
 * A Wayspot near a gym as an item offers it; `own` is the id of the gym's own Wayspot, `heldBy`
 * the gym that holds it when a nearer gym of the same Wayfarer id is it.
 */
function candidate(
  { wayspot, metres }: Near,
  own: string | undefined,
  heldBy: number | undefined,
): ReviewCandidate {
  const isOwn = wayspot.id === own;
  return {
    id: wayspot.id,
    kind: wayspot.kind,
    title: wayspot.title,
    lat: wayspot.lat,
    lon: wayspot.lon,
    metres,
    ...(wayspot.address === '' ? {} : { address: wayspot.address }),
    ...(isOwn ? { own: true as const } : {}),
    ...(isOwn && heldBy !== undefined ? { heldBy } : {}),
  };
}
