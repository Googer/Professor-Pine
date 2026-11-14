import type { FillableTexts } from '../db/repositories/gym-repository.js';
import { emptyGymText, FILLABLE_GYM_TEXTS, type FillableGymText } from '../domain/gyms/gym-text.js';
import type { GymProvider } from './gym-directory.js';
import type { NeighborMatches } from './neighbor-matches.js';

/**
 * How many gyms a copy changes between two turns of the event loop: each gym is a write and a
 * re-read of that gym, and a city's copy is thousands.
 */
export const COPY_BATCH = 100;

/** The curated texts a copy takes from a neighbor's gym (the search words are `keywords`). */
export const COPIED_FIELDS = FILLABLE_GYM_TEXTS;
export type CopiedField = FillableGymText;

/**
 * What a copy did: how many gyms it changed and, by field, how many texts it copied; `shared` the
 * gyms both servers have as one row (one row's texts are both servers' already: nothing to copy).
 */
export type CopyCounts = Record<CopiedField, number> & { gyms: number; shared: number };

export interface NeighborCopyOptions {
  gyms: Pick<GymProvider, 'of' | 'stored'>;
  matches: Pick<NeighborMatches, 'matchedGyms'>;
  /**
   * Writes the texts of a gym that are still empty when written (`GymAdminService.fillEmpty`:
   * decided in the same step as the write, then the directory reads that gym again and the posts
   * that show it are drawn anew), and gives those it filled; undefined for no such gym.
   */
  fill: (
    id: number,
    texts: FillableTexts,
    staffId: string,
  ) => Promise<{ filled: readonly CopiedField[] } | undefined>;
  batch?: number;
  /** Waits a turn of the event loop between batches. */
  pause?: () => Promise<void>;
}

/**
 * Copying a neighbor's curated gym text (plan 19E; spec "Copy from a neighbor": `/admin neighbors
 * copy`): its nickname, notice, description and search words, onto this server's gyms that are
 * the same gyms (`NeighborMatches.matchedGyms`, inside both servers' regions), each field only
 * where this server's is empty (`emptyGymText`): never overwritten, also by a text staff set
 * while the copy runs (the write decides, review R7), so it can be run again; not a live link. A
 * gym both servers have as one row is passed over. In batches of `COPY_BATCH` gyms, through gym
 * administration's own write of each gym; one copy of a server at a time. Counted as written.
 */
export class NeighborCopy {
  private readonly running = new Set<number>();

  constructor(private readonly options: NeighborCopyOptions) {}

  /** Whether a copy onto this server is under way. */
  busy(ourRow: number): boolean {
    return this.running.has(ourRow);
  }

  async copy(ourRow: number, theirRow: number, staffId: string): Promise<CopyCounts> {
    if (this.running.has(ourRow)) throw new Error('a copy onto this server is under way');
    this.running.add(ourRow);
    try {
      return await this.copyAll(ourRow, theirRow, staffId);
    } finally {
      this.running.delete(ourRow);
    }
  }

  private async copyAll(ourRow: number, theirRow: number, staffId: string): Promise<CopyCounts> {
    const { gyms, matches, fill } = this.options;
    const batch = this.options.batch ?? COPY_BATCH;
    const pause = this.options.pause ?? (() => new Promise<void>((done) => setImmediate(done)));
    const counts: CopyCounts = {
      gyms: 0,
      shared: 0,
      nickname: 0,
      notice: 0,
      description: 0,
      keywords: 0,
    };
    const pairs = [...matches.matchedGyms(ourRow, theirRow)].sort(([a], [b]) => a - b);
    for (let start = 0; start < pairs.length; start += batch) {
      if (start > 0) await pause();
      for (const [ourId, theirId] of pairs.slice(start, start + batch)) {
        if (ourId === theirId) {
          counts.shared += 1;
          continue;
        }
        // As they are now: the view of this server, the neighbor's gym by its id. Only what looks
        // empty here is offered; the write decides again.
        const ours = gyms.of(ourRow).get(ourId);
        const theirs = gyms.stored(theirId);
        if (!ours || !theirs) continue;
        const texts: FillableTexts = {};
        for (const field of COPIED_FIELDS) {
          if (!emptyGymText(ours, field) || emptyGymText(theirs, field)) continue;
          if (field === 'keywords') texts.keywords = [...theirs.keywords];
          else texts[field] = theirs[field];
        }
        if (Object.keys(texts).length === 0) continue;
        const written = await fill(ourId, texts, staffId);
        if (!written || written.filled.length === 0) continue;
        for (const field of written.filled) counts[field] += 1;
        counts.gyms += 1;
      }
    }
    return counts;
  }
}
