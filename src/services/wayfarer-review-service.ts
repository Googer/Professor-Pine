import { storedTextLength, type Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type {
  ReviewCounts,
  StoredReview,
  WayfarerStorage,
} from '../db/repositories/wayfarer-repository.js';
import type { RaidParty } from '../domain/party/party.js';
import { wayfarerGeodata } from '../domain/geo/wayfarer-address.js';
import type { ExportedWayspot } from '@pine/wayspot-core/export-file';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { WayspotStorage } from '../db/repositories/wayspot-repository.js';
import { wasStop } from '../domain/wayspots/keep.js';
import { newGymName, type MatchChange } from '../domain/wayspots/match.js';
import type { ReviewCandidate, ReviewDecision, ReviewKind } from '../domain/wayspots/review.js';
import type { Logger } from '../log.js';
import type { Member } from './attendance-service.js';
import type { DeleteOutcome, GymAdminService, NearbyGym, StaffPlace } from './gym-admin-service.js';
import type { GymView } from './gym-directory.js';
import { KeyedLock } from './keyed-lock.js';
import type { WayfarerImportService } from './wayfarer-import-service.js';
import type { WayspotDirectory } from './wayspot-directory.js';

/**
 * What staff can answer to an item of the review queue (spec "The review queue"), as the
 * buttons of `/gym review` name it: `same` (a candidate is the gym; with the candidate's id),
 * `new` (a candidate is another gym, added; with its id), `none` (none of these), `keep` (a
 * missing gym stays), `unlisted` (not in Wayfarer), `delete` (asks first, with what goes with
 * the gym), `confirm` (the deletion, once asked), `back` (from that question to the item), and
 * `skip` (for now).
 */
export type ReviewAction =
  'same' | 'new' | 'none' | 'keep' | 'unlisted' | 'delete' | 'confirm' | 'back' | 'skip';

export const REVIEW_ACTIONS: readonly ReviewAction[] = [
  'same',
  'new',
  'none',
  'keep',
  'unlisted',
  'delete',
  'confirm',
  'back',
  'skip',
];

export function isReviewAction(value: string): value is ReviewAction {
  return (REVIEW_ACTIONS as readonly string[]).includes(value);
}

/**
 * What each kind of question can be answered with; `skip` and `back` always, Delete everywhere
 * (Matt, 2026-10-15: a gym that became a stop has only stops near it, and must be removable from
 * the queue), "Same as" wherever a Wayfarer gym is a candidate (a missing gym's Wayspot may be
 * one under a new id).
 */
const ANSWERS: Readonly<Record<ReviewKind, readonly ReviewAction[]>> = {
  match: ['same', 'new', 'none', 'delete', 'confirm', 'skip', 'back'],
  missing: ['same', 'delete', 'confirm', 'keep', 'skip', 'back'],
  unknown: ['unlisted', 'delete', 'confirm', 'skip', 'back'],
};

/** Whether an item asks something this action answers. */
export function answers(kind: ReviewKind, action: ReviewAction): boolean {
  return ANSWERS[kind].includes(action);
}

/**
 * The candidates of an item that may be named by "Same as" (and, for a match, "New gym", but for
 * the gym's own Wayspot): the Wayfarer gyms, but one a nearer gym holds (`heldBy`: that gym is
 * it). A PokéStop or a power spot is no gym, so it can neither be this one nor become another; it
 * is shown for what is there. An unknown gym has none.
 */
export function gymCandidates(item: Pick<StoredReview, 'kind' | 'candidates'>): ReviewCandidate[] {
  return item.kind === 'unknown'
    ? []
    : item.candidates.filter((one) => one.kind === 'gym' && one.heldBy === undefined);
}

/** What goes with a gym that is deleted (`GymAdminService.references`). */
export type GymReferences = Awaited<ReturnType<GymAdminService['references']>>;

/** The item at the head of a server's queue, with what its question shows. */
export interface ReviewShown {
  item: StoredReview;
  /** The gym as the directory has it now. */
  gym: Gym;
  /** The regions of the server the gym lies in. */
  regions: Region[];
  /** The open items of the server by kind, this one included. */
  left: ReviewCounts;
  /** How many of them wait for the next import of the server (`waits`): none is this one. */
  waiting: number;
  /**
   * The gym that holds the gym's own Wayspot (`ReviewCandidate.heldBy`) when this server may
   * name it; undefined otherwise.
   */
  holder?: Gym;
}

/**
 * No item to show: how many open items wait for the next import of the server (their gyms
 * became other Wayspots since they were queued); 0 when nothing is left at all.
 */
export interface ReviewNone {
  item?: undefined;
  waiting: number;
}

/**
 * What came of an answer to an item. Every kind but `stale`, `changed` and `gone` names the
 * gym as it was when the answer was given.
 *
 * - `stale`: the item is no open item of this server (somebody answered it, or an import
 *   closed it); nothing was done.
 * - `changed`: the item no longer asks this (an import changed its question or candidates since
 *   it was shown, also while the answer waited for an import to finish); nothing was done.
 *   With `waits`, the gym became another Wayspot since the item was queued (`waits`): the item
 *   waits for the next import of this server, and the queue passes over it till then.
 * - `back`: show the item again (from the question before a deletion); nothing was done. With
 *   `waits`, the item cannot be shown: its gym became another Wayspot since it was queued.
 * - `asking`: Delete was pressed: the question before the deletion, with what goes with the gym.
 * - `gone`: the gym no longer exists for this server; its item was closed.
 * - `skipped`: the item went to the end of the queue.
 * - `decided`: closed with "None of these", "Keep" or "Not in Wayfarer".
 * - `matched`: the gym is the candidate now (`change` says what was written); closed.
 * - `taken`: another gym already is that Wayspot; nothing was done, the item stays open.
 * - `added`: the candidate was added as a gym (`added`); closed.
 * - `not-added`: it was not, because another gym of the server lies within ten metres (`near`,
 *   the gym of the item left out) or the Wayspot has no title to name a gym by (`untitled`);
 *   the item stays open.
 * - `failed`: a write failed (logged); what was written before it stands, the item stays open.
 * - `raid-there`: the gym was not deleted while a raid is there; the item stays open.
 * - `deleted`: the gym was deleted, and its item went with it.
 */
export type ReviewOutcome =
  | { kind: 'stale' | 'gone' }
  | { kind: 'back'; waits?: true }
  | { kind: 'changed'; waits?: true }
  | { kind: 'asking'; gym: Gym; references: GymReferences }
  | { kind: 'skipped'; gym: Gym }
  | { kind: 'decided'; gym: Gym; decision: 'none-of-these' | 'keep' | 'not-in-wayfarer' }
  | { kind: 'matched'; gym: Gym; change: MatchChange; now: Gym }
  | { kind: 'taken'; gym: Gym; other: Gym | undefined }
  | { kind: 'added'; gym: Gym; added: Gym }
  | { kind: 'not-added'; gym: Gym; why: 'untitled' }
  | { kind: 'not-added'; gym: Gym; why: 'near'; near: NearbyGym[] }
  | { kind: 'failed'; gym: Gym }
  | { kind: 'raid-there'; gym: Gym; raid: RaidParty }
  | (Extract<DeleteOutcome, { kind: 'deleted' }> & { gym: Gym });

export interface WayfarerReviewOptions {
  storage: WayfarerStorage;
  /** The kept Wayspots: "New gym" deletes the row of the Wayspot it makes a gym. */
  wayspots: Pick<WayspotStorage, 'remove'>;
  /** The same in memory: whether that Wayspot was a PokéStop, and forgetting it. */
  kept: Pick<WayspotDirectory, 'byId' | 'forget'>;
  /** "Same as" writes a match as an import does. */
  importer: Pick<WayfarerImportService, 'applyMatch'>;
  admin: Pick<GymAdminService, 'batch' | 'delete' | 'mayTouch' | 'regionsOf' | 'references'>;
  /**
   * The gyms in memory (`GymDirectory`), each server's own (plan 19B-2): a review reads only the
   * gyms of the server whose item it is.
   */
  directory: { of(guildId: number | undefined): Pick<GymView, 'all' | 'get'> };
  log: Logger;
  /** The length of a name as the database stores it; default `storedTextLength`. */
  storedLength?: (text: string) => number;
  /** Default `Date.now`. */
  now?: () => number;
}

/** How many items of gyms that are gone `next` closes in one call before it gives up. */
const GONE_PER_LOOK = 50;

/**
 * The review queue of the Wayfarer import (`/gym review`): the oldest open item of a server,
 * and the answers of its staff. Items are found by their row id, never by memory, and every
 * answer reads its item again: an item that is no longer open is not answered twice, and one
 * whose question an import changed meanwhile is not answered with what no longer fits: every
 * answer that writes reads the item once more under the lock of gym administration, which an
 * import holds while it plans and writes, and does nothing when the item no longer asks the same
 * (`stillAsks`). The answers to one item run one after the other (two staff pressing at once:
 * the second finds it answered). Every answer is logged with who, which gym, which item and
 * what.
 *
 * What an answer writes goes through gym administration: "Same as" as an import matches
 * (`WayfarerImportService.applyMatch`), "New gym" through a batch, "Delete" through
 * `GymAdminService.delete` (refused while a raid is there; the item goes with the gym). What the
 * answers change is announced in one summary per server, a while after the last of them
 * (`GymAdminService`, source `review`).
 */
export class WayfarerReviewService {
  private readonly storedLength: (text: string) => number;
  private readonly now: () => number;
  private readonly items = new KeyedLock<number>();

  constructor(private readonly options: WayfarerReviewOptions) {
    this.storedLength = options.storedLength ?? storedTextLength;
    this.now = options.now ?? Date.now;
  }

  /**
   * The first open item of a server in the order of the queue, or how many wait when none can
   * be shown (`ReviewNone`). An item of a gym that no longer exists for this server (deleted
   * while the directory lagged, or now only in another server's regions) is closed on the way,
   * as an import would close it. An item whose gym became another Wayspot since it was queued
   * (`waits`) is passed over, not closed: the next import of the server asks it anew or closes
   * it.
   */
  async next(guildId: number): Promise<ReviewShown | ReviewNone> {
    return (await this.head(guildId)) ?? { waiting: await this.waiting(guildId) };
  }

  /** How many open items of a server wait for its next import (`waits`). */
  private async waiting(guildId: number): Promise<number> {
    const { storage, directory, admin } = this.options;
    return (await storage.openReviews(guildId)).filter((item) => {
      const gym = directory.of(guildId).get(item.gymId);
      return gym !== undefined && admin.mayTouch(gym.id, guildId) && waits(item, gym);
    }).length;
  }

  /** The first open item `next` shows; undefined when none can be shown. */
  private async head(guildId: number): Promise<ReviewShown | undefined> {
    const { storage } = this.options;
    let closed = 0;
    // The head of the queue first; the whole list only once an item there waits.
    for (; closed < GONE_PER_LOOK; closed++) {
      const item = await storage.nextReview(guildId);
      if (!item) return undefined;
      const look = await this.look(guildId, item);
      if (look === 'waits') break;
      if (look !== 'closed') return look;
    }
    if (closed >= GONE_PER_LOOK) return undefined;
    for (const item of await storage.openReviews(guildId)) {
      const look = await this.look(guildId, item);
      if (look === 'closed' && ++closed >= GONE_PER_LOOK) return undefined;
      if (look !== 'closed' && look !== 'waits') return look;
    }
    return undefined;
  }

  /**
   * An open item as `next` shows it, with what its question shows; `closed` when its gym is
   * gone (it was closed now), `waits` when its gym became another Wayspot since it was queued.
   */
  private async look(
    guildId: number,
    item: StoredReview,
  ): Promise<ReviewShown | 'closed' | 'waits'> {
    const { storage, directory, admin, log } = this.options;
    const gym = directory.of(guildId).get(item.gymId);
    if (gym && admin.mayTouch(gym.id, guildId)) {
      if (waits(item, gym)) return 'waits';
      return this.shownOf(guildId, item, gym);
    }
    await storage.closeReviews(guildId, [item.gymId], 'resolved', null, this.now());
    log.info(
      { review: item.id, gym: item.gymId },
      'a review item of a gym that is gone was closed',
    );
    return 'closed';
  }

  /** An open item of a server with what its question shows; undefined when it is none. */
  async shown(guildId: number, reviewId: number): Promise<ReviewShown | undefined> {
    const { storage, directory, admin } = this.options;
    const item = await storage.review(guildId, reviewId);
    if (!item || item.decision !== null) return undefined;
    const gym = directory.of(guildId).get(item.gymId);
    if (!gym || !admin.mayTouch(gym.id, guildId) || waits(item, gym)) return undefined;
    return this.shownOf(guildId, item, gym);
  }

  /** An item with what its question shows. */
  private async shownOf(guildId: number, item: StoredReview, gym: Gym): Promise<ReviewShown> {
    const { storage, directory, admin } = this.options;
    const left = await storage.openCounts(guildId);
    const heldBy = item.candidates.find((one) => one.heldBy !== undefined)?.heldBy;
    const holder = heldBy === undefined ? undefined : directory.of(guildId).get(heldBy);
    return {
      item,
      gym,
      regions: admin.regionsOf(gym.id, guildId),
      left,
      waiting: await this.waiting(guildId),
      ...(holder && admin.mayTouch(holder.id, guildId) ? { holder } : {}),
    };
  }

  /**
   * Answers an item as the staff member `member` (whose server `place` is). `arg` is the
   * Wayfarer id of the candidate that "Same as" and "New gym" name.
   */
  decide(
    place: StaffPlace,
    member: Member,
    reviewId: number,
    action: ReviewAction,
    arg?: string,
  ): Promise<ReviewOutcome> {
    return this.items.run(reviewId, async () => {
      const outcome = await this.decideNow(place, member, reviewId, action, arg);
      this.options.log.info(
        {
          staff: place.staffId,
          review: reviewId,
          gym: 'gym' in outcome ? outcome.gym.id : undefined,
          action,
          wayspot: arg,
          outcome: outcome.kind,
        },
        'a gym review was answered',
      );
      return outcome;
    });
  }

  private async decideNow(
    place: StaffPlace,
    member: Member,
    reviewId: number,
    action: ReviewAction,
    arg: string | undefined,
  ): Promise<ReviewOutcome> {
    const { storage, directory, admin } = this.options;
    const { guildId } = place;
    if (guildId === undefined) return { kind: 'stale' };
    const item = await storage.review(guildId, reviewId);
    if (!item || item.decision !== null) return { kind: 'stale' };
    const gym = directory.of(guildId).get(item.gymId);
    if (!gym || !admin.mayTouch(gym.id, guildId)) {
      await this.close(place, item, 'resolved');
      return { kind: 'gone' };
    }
    if (action === 'back')
      return waits(item, gym) ? { kind: 'back', waits: true } : { kind: 'back' };
    // Skip needs only that the item is open: it writes nothing but its place in the queue.
    if (action === 'skip') {
      if (!(await storage.skip(guildId, item.id, this.now()))) return { kind: 'stale' };
      return { kind: 'skipped', gym };
    }
    if (waits(item, gym)) return { kind: 'changed', waits: true };
    if (!answers(item.kind, action)) return { kind: 'changed' };
    // "New gym" never for the gym's own Wayspot: that is the gym, not another.
    const candidate =
      action === 'same' || action === 'new'
        ? gymCandidates(item).find(
            (one) => one.id === arg && !(action === 'new' && one.own === true),
          )
        : undefined;
    const still = (): Promise<boolean> => this.stillAsks(guildId, item, action, arg);
    switch (action) {
      case 'none':
        return this.locked(place, item, still, () =>
          this.closed(place, item, gym, 'none-of-these'),
        );
      case 'keep':
        return this.locked(place, item, still, () => this.closed(place, item, gym, 'keep'));
      case 'unlisted':
        return this.locked(place, item, still, async () => {
          await storage.markNotInWayfarer(gym.id, place.staffId, this.now());
          return this.closed(place, item, gym, 'not-in-wayfarer');
        });
      case 'same':
        return candidate ? this.same(place, item, gym, candidate, still) : this.changed(item);
      case 'new':
        return candidate ? this.added(place, item, gym, candidate, still) : this.changed(item);
      case 'delete': {
        // Nothing is written yet: the question, with what goes with the gym.
        const references = await admin.references(gym.id, place.guildId);
        const [raid] = references.raids;
        if (raid) return { kind: 'raid-there', gym, raid };
        return { kind: 'asking', gym, references };
      }
      case 'confirm':
        return this.deleted(place, member, item, gym, still);
    }
  }

  /**
   * Whether the item, read again now, is still open and asks what it asked when the answer was
   * read: the same kind of question about the same Wayspots, and one this action answers, about
   * a gym whose `pogoId` is still what it was when the item was queued (an import of another
   * server whose regions overlap may have matched it meanwhile).
   */
  private async stillAsks(
    guildId: number,
    item: StoredReview,
    action: ReviewAction,
    arg: string | undefined,
  ): Promise<boolean> {
    const now = await this.options.storage.review(guildId, item.id);
    if (!now || now.decision !== null || now.kind !== item.kind) return false;
    const pogoId = this.options.directory.of(guildId).get(item.gymId)?.pogoId ?? null;
    if (now.gymPogoId !== item.gymPogoId || pogoId !== item.gymPogoId) return false;
    if (!answers(now.kind, action)) return false;
    const before = new Set(item.candidates.map((one) => one.id));
    if (now.candidates.length !== before.size) return false;
    if (!now.candidates.every((one) => before.has(one.id))) return false;
    return arg === undefined || gymCandidates(now).some((one) => one.id === arg);
  }

  /** Runs an answer under the lock of gym administration, if the item still asks it. */
  private locked(
    place: StaffPlace,
    item: StoredReview,
    still: () => Promise<boolean>,
    work: () => Promise<ReviewOutcome>,
  ): Promise<ReviewOutcome> {
    return this.options.admin.batch(place, 'review', async (): Promise<ReviewOutcome> =>
      (await still()) ? work() : this.changed(item),
    );
  }

  /**
   * The answer to an item that no longer asks what was answered; it `waits` when its gym is
   * another Wayspot now than when it was queued.
   */
  private changed(item: StoredReview): ReviewOutcome {
    const gym = this.options.directory.of(item.guildId).get(item.gymId);
    return gym && waits(item, gym) ? { kind: 'changed', waits: true } : { kind: 'changed' };
  }

  /** Closes the item with a decision that writes nothing else. */
  private async closed(
    place: StaffPlace,
    item: StoredReview,
    gym: Gym,
    decision: 'none-of-these' | 'keep' | 'not-in-wayfarer',
  ): Promise<ReviewOutcome> {
    if (!(await this.close(place, item, decision))) return { kind: 'stale' };
    return { kind: 'decided', gym, decision };
  }

  /** "Same as": the gym becomes the candidate, as an import writes a match. */
  private async same(
    place: StaffPlace,
    item: StoredReview,
    gym: Gym,
    candidate: ReviewCandidate,
    still: () => Promise<boolean>,
  ): Promise<ReviewOutcome> {
    const outcome = await this.options.importer.applyMatch(
      place,
      gym.id,
      wayspotOf(candidate, this.options.kept.byId(candidate.id)),
      still,
    );
    switch (outcome.kind) {
      case 'gone':
        await this.close(place, item, 'resolved');
        return { kind: 'gone' };
      case 'taken':
        return { kind: 'taken', gym, other: outcome.gym };
      case 'withdrawn':
        return this.changed(item);
      case 'failed':
        return { kind: 'failed', gym };
      case 'matched':
        await this.close(place, item, 'same-as');
        return { kind: 'matched', gym, change: outcome.change, now: outcome.gym };
    }
  }

  /** "New gym": the candidate is added as a gym of its own; the gym of the item stays. */
  private async added(
    place: StaffPlace,
    item: StoredReview,
    gym: Gym,
    candidate: ReviewCandidate,
    still: () => Promise<boolean>,
  ): Promise<ReviewOutcome> {
    const { admin, directory, storage, log } = this.options;
    const name = newGymName(candidate.title, this.storedLength);
    if (name === null) return { kind: 'not-added', gym, why: 'untitled' };
    let outcome: ReviewOutcome;
    try {
      outcome = await admin.batch(place, 'review', async (ops): Promise<ReviewOutcome> => {
        if (!(await still())) return this.changed(item);
        // A gym of this server that is the Wayspot already (plan 19B-2): another server's gym of
        // it is that server's own, and keeps no new gym from this one.
        const holder = directory
          .of(place.guildId)
          .all()
          .find((other) => other.pogoId === candidate.id);
        if (holder) return { kind: 'taken', gym, other: holder };
        // The staff member was shown the gym of the item, which may lie within ten metres. The
        // picture is the kept Wayspot's (an item's candidates keep none), the address Wayfarer's
        // (Matt, 2026-10-16: Google is asked for the places around it only, and for the address
        // of a Wayspot without a street).
        const kept = this.options.kept.byId(candidate.id);
        const added = await ops.add(
          {
            name,
            lat: candidate.lat,
            lon: candidate.lon,
            pogoId: candidate.id,
            imageUrl: kept?.image ?? null,
            geodata: wayfarerGeodata(addressOf(candidate, kept)),
          },
          [gym.id],
          { promoted: wasStop(kept) },
        );
        switch (added.kind) {
          case 'added':
            return { kind: 'added', gym, added: added.gym };
          case 'near':
            return {
              kind: 'not-added',
              gym,
              why: 'near',
              near: added.near.filter((near) => near.gym.id !== gym.id),
            };
        }
      });
    } catch (err) {
      log.error({ err, review: item.id, wayspot: candidate.id }, 'could not add a Wayfarer gym');
      return { kind: 'failed', gym };
    }
    if (outcome.kind !== 'added') return outcome;
    try {
      await storage.seen([outcome.added.id], this.now());
    } catch (err) {
      log.error({ err, gym: outcome.added.id }, 'could not note when a Wayfarer gym was seen');
    }
    // The Wayspot lives in `Gym` now (the next import would delete its row otherwise).
    try {
      await this.options.wayspots.remove([candidate.id]);
    } catch (err) {
      log.error(
        { err, wayspot: candidate.id },
        'could not delete a kept Wayspot that became a gym',
      );
    }
    this.options.kept.forget([candidate.id]);
    await this.close(place, item, 'new-gym');
    return outcome;
  }

  /** "Delete", confirmed: the deletion of gym administration; the item goes with the gym. */
  private async deleted(
    place: StaffPlace,
    member: Member,
    item: StoredReview,
    gym: Gym,
    still: () => Promise<boolean>,
  ): Promise<ReviewOutcome> {
    const outcome = await this.options.admin.delete(gym.id, member, place, still, 'review');
    switch (outcome.kind) {
      case 'withdrawn':
        return this.changed(item);
      case 'gone':
        await this.close(place, item, 'resolved');
        return { kind: 'gone' };
      case 'failed':
        return { kind: 'failed', gym };
      case 'raid-there':
        return { kind: 'raid-there', gym, raid: outcome.raid };
      case 'deleted':
        // The item went with the gym (`on delete cascade`).
        return { ...outcome, gym };
    }
  }

  /**
   * Closes the item; false when it was not open any more (an import closed it meanwhile: what
   * the answer wrote stands, and is logged).
   */
  private async close(
    place: StaffPlace,
    item: StoredReview,
    decision: ReviewDecision,
  ): Promise<boolean> {
    const { guildId } = place;
    if (guildId === undefined) return false;
    const closed = await this.options.storage.decide(
      guildId,
      item.id,
      decision,
      place.staffId,
      this.now(),
    );
    if (!closed) {
      this.options.log.info(
        { staff: place.staffId, review: item.id, gym: item.gymId, decision },
        'a gym review was closed by somebody else meanwhile',
      );
    }
    return closed;
  }
}

/**
 * Whether an item waits for the next import: its gym's `pogoId` is not what it was when the item
 * was queued (an import of another server whose regions overlap matched it, or a "Same as" whose
 * move failed after its `pogoId` was written). No answer but Skip fits it until then.
 */
function waits(item: StoredReview, gym: Gym): boolean {
  return (gym.pogoId ?? null) !== item.gymPogoId;
}

/**
 * Wayfarer's address of a candidate: the one the queue kept with it, else the kept Wayspot's
 * (an item stored before candidates kept their address); empty when neither has one.
 */
function addressOf(candidate: ReviewCandidate, kept: Wayspot | undefined): string {
  return candidate.address ?? kept?.address ?? '';
}

/**
 * A candidate as the Wayspot a match is written from: what the queue kept of it, with Wayfarer's
 * address (`addressOf`). It has no picture there, so "Same as" leaves the gym's picture as it
 * is; the next import brings it.
 */
function wayspotOf(candidate: ReviewCandidate, kept: Wayspot | undefined): ExportedWayspot {
  return {
    id: candidate.id,
    kind: candidate.kind,
    status: '',
    lat: candidate.lat,
    lon: candidate.lon,
    title: candidate.title,
    address: addressOf(candidate, kept),
    description: '',
    image: '',
  };
}
