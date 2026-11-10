import { z } from 'zod';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import { MAX_WAYSPOT_TEXT, type WayspotKind } from '@pine/wayspot-core/export-file';

/**
 * What the review queue asks about a gym (spec "The review queue"): `match`, which of the
 * Wayspots nearby it is; `missing`, its Wayspot is no gym any more or gone from a covered cell;
 * `unknown`, it never had a Wayspot and its covered cell shows none.
 */
export type ReviewKind = 'match' | 'missing' | 'unknown';

export const REVIEW_KINDS: readonly ReviewKind[] = ['match', 'missing', 'unknown'];

/** A Wayspot offered for a gym, as it was in the file, with its distance from the gym. */
export interface ReviewCandidate {
  /** The Wayfarer id. */
  id: string;
  kind: WayspotKind;
  title: string;
  lat: number;
  lon: number;
  /** Metres from the gym when the item was queued. */
  metres: number;
  /**
   * Its address as Wayfarer gives it, which "Same as" and "New gym" write instead of asking
   * Google; absent where Wayfarer gave none (and on items stored before it was kept).
   */
  address?: string;
  /**
   * The gym's own Wayspot: the one its Wayfarer id names, or its namesake that is a stop or a
   * power spot now. Absent on the others (and on items stored before it was kept).
   */
  own?: true;
  /**
   * On the gym's own Wayspot only: another gym of the import holds the same Wayfarer id and lies
   * nearer to it, so that gym is the Wayspot (`matchGyms`); this one shares it. Such a candidate
   * can be neither "Same as" nor "New gym". Absent otherwise.
   */
  heldBy?: number;
}

/** A question an import puts in the queue: at most one open per gym and server. */
export interface ReviewItem {
  gymId: number;
  kind: ReviewKind;
  /** Nearest first. */
  candidates: ReviewCandidate[];
}

/**
 * An item as an import queues it: with the gym's `pogoId` at that moment (absent: none), so that
 * an answer given after the gym became another Wayspot (an import of another server whose
 * regions overlap) is refused.
 */
export interface QueuedReview extends ReviewItem {
  gymPogoId?: string | null;
}

/**
 * How an item was closed. `resolved`: an import found the gym certainly, or no longer has a
 * question about it. The others are staff's answers: `same-as` (a candidate is the gym),
 * `new-gym` (a candidate was added as a gym), `none-of-these`, `keep` (a missing gym stays),
 * `not-in-wayfarer`. A deleted gym takes its items with it, so it needs no decision.
 */
export type ReviewDecision =
  'resolved' | 'same-as' | 'new-gym' | 'none-of-these' | 'keep' | 'not-in-wayfarer';

export const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'resolved',
  'same-as',
  'new-gym',
  'none-of-these',
  'keep',
  'not-in-wayfarer',
];

/**
 * Whether staff's last answer about a gym still answers what an import would ask (Matt,
 * 2026-10-15): "Keep" and "None of these" stand until Wayfarer changes, that is until the
 * question is of another kind or about another set of Wayspots (one appeared or went within
 * 100 metres). Any other answer, or none, does not. Only the file of the new import says what
 * went (`covered`, its covered cells): a Wayspot answered about whose cell it did not cover is not
 * missed (two files may cover different cells of one gym's surroundings), while a Wayspot new to
 * the question is a change wherever it lies.
 */
export function stillAnswered(
  item: ReviewItem,
  last: (ReviewItem & { decision: ReviewDecision | null }) | undefined,
  covered: ReadonlySet<string>,
): boolean {
  if (!last || (last.decision !== 'keep' && last.decision !== 'none-of-these')) return false;
  if (last.kind !== item.kind) return false;
  const before = new Set(last.candidates.map((candidate) => candidate.id));
  const now = new Set(item.candidates.map((candidate) => candidate.id));
  return (
    item.candidates.every((candidate) => before.has(candidate.id)) &&
    last.candidates.every(
      (candidate) => now.has(candidate.id) || !covered.has(wayfarerCellAt(candidate)),
    )
  );
}

/** What an import did, by what (the import service names the keys). */
export type ImportCounts = Record<string, number>;

const candidates = z.array(
  z.strictObject({
    id: z.string().min(1),
    kind: z.enum(['gym', 'stop', 'powerspot']),
    title: z.string(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    metres: z.number().nonnegative(),
    address: z.string().max(MAX_WAYSPOT_TEXT).optional(),
    own: z.literal(true).optional(),
    heldBy: z.number().int().positive().optional(),
  }),
);

const counts = z.record(z.string(), z.number().int().nonnegative());

/** A stored value read back, or why it cannot be. */
export type Read<T> = { ok: true; value: T } | { ok: false; problem: string };

function read<T>(schema: z.ZodType<T>, value: unknown): Read<T> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problem: z.prettifyError(parsed.error) };
}

/** The `candidates` of a stored item, checked. */
export function readCandidates(value: unknown): Read<ReviewCandidate[]> {
  return read(candidates, value);
}

/** The `counts` of a stored import, checked. */
export function readImportCounts(value: unknown): Read<ImportCounts> {
  return read(counts, value);
}

export function isReviewKind(value: string): value is ReviewKind {
  return (REVIEW_KINDS as readonly string[]).includes(value);
}

export function isReviewDecision(value: string): value is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(value);
}
