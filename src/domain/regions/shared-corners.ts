import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Bases, Draft, Edit } from './edits.js';
import { normalisedOutline, roundSix } from './version.js';

/**
 * Corners regions share (plan 8M-10, C13; Matt's note of 2026-10-18): dragging a corner that two
 * or three of the server's regions have in common moves it in all of them, as one staged step,
 * so that a border between neighbours is edited once. A corner is shared where the outlines have
 * the very same point at six decimals (as the editor keeps them, `normalisedOutline`; the outlines
 * after Fix and Fix all share their corners exactly). A corner of one region that lies on the side
 * of another, not at a corner of it (a T-junction), is no shared corner: the other has nothing to
 * move there. Only the server's own regions, not staged for removal, move together; other servers'
 * outlines are never edited, so a corner shared with one of them comes apart.
 */

const samePoint = (a: LatLon, b: LatLon): boolean =>
  roundSix(a.lat) === roundSix(b.lat) && roundSix(a.lon) === roundSix(b.lon);

/** The regions other than `key` that have a corner at `at` (six decimals), in the drafts' order. */
export function cornerSharers(drafts: readonly Draft[], key: string, at: LatLon): string[] {
  return drafts
    .filter(
      (draft) =>
        draft.key !== key &&
        draft.removed === null &&
        draft.outline !== null &&
        draft.outline.some((corner) => samePoint(corner, at)),
    )
    .map((draft) => draft.key);
}

/**
 * An outline with every corner at `from` moved to `to` (its closing corner too), at six decimals
 * and tidied as the editor keeps outlines (`normalisedOutline`: a corner the move repeats is
 * dropped).
 */
export function movedCorner(outline: readonly LatLon[], from: LatLon, to: LatLon): LatLon[] {
  return normalisedOutline(
    outline.map((corner) => (samePoint(corner, from) ? { lat: to.lat, lon: to.lon } : corner)),
  );
}

/**
 * An outline without its corner at `at` (plan 8M-11C, S32): every corner at the point taken out,
 * at six decimals as the editor keeps outlines (`normalisedOutline`); a closed ring (its last
 * corner its first) stays closed, at its new first corner when the first was taken; an open one
 * stays open. Undefined when fewer than three distinct corners would be left: no area.
 */
export function removedCorner(outline: readonly LatLon[], at: LatLon): LatLon[] | undefined {
  const first = outline[0];
  const last = outline[outline.length - 1];
  const closed = outline.length > 1 && first && last ? samePoint(first, last) : false;
  const ring = normalisedOutline(
    (closed ? outline.slice(0, -1) : outline).filter((corner) => !samePoint(corner, at)),
  );
  // Taking a corner out can bring the first and last corners of an open list together.
  const start = ring[0];
  if (start && ring.length > 1 && samePoint(start, ring[ring.length - 1] ?? start)) ring.pop();
  if (new Set(ring.map(({ lat, lon }) => `${lat} ${lon}`)).size < 3) return undefined;
  return closed && start ? [...ring, { ...start }] : ring;
}

/**
 * The staged edit of a corner deleted at `at` from the region `key` with "Move shared corners
 * together" on (S32): every region of the server that has the corner too (`cornerSharers`: not
 * one staged for removal, not one that has the point on a side) without it, the region's own
 * first, as one `batch` (one step of undo); without a sharer, the region's own `outline` edit.
 * Refused whole, naming the first region (its own first) that would keep fewer than three
 * corners (`removedCorner`). Other servers' outlines are no drafts: they are never touched.
 */
export function sharedCornerRemoval(
  drafts: readonly Draft[],
  key: string,
  at: LatLon,
  bases: (keys: readonly string[]) => Bases,
): { ok: true; edit: Edit } | { ok: false; region: string } {
  const edits: Edit[] = [];
  for (const region of [key, ...cornerSharers(drafts, key, at)]) {
    const outline = drafts.find((draft) => draft.key === region)?.outline;
    if (!outline) continue;
    const left = removedCorner(outline, at);
    if (left === undefined) return { ok: false, region };
    edits.push({ kind: 'outline', key: region, outline: left, bases: bases([region]) });
  }
  const [own] = edits;
  return { ok: true, edit: edits.length === 1 && own ? own : { kind: 'batch', edits } };
}

/**
 * What the editor does with a region's corner Geoman is about to delete (plan 8M-11C, S32, review
 * C5): first, whatever the option says and whoever shares it, `refuse` naming the region itself
 * when its own outline would keep fewer than three corners (branch review BR-1: one ring rule for
 * every deletion; Geoman would remove the whole outline). Then, with "Move shared corners
 * together" off, or a corner nobody shares, `allow` (Geoman deletes it, the region's own edit, as
 * before); shared, `refuse` naming the region that would keep fewer than three corners (nothing is
 * deleted), or `stage` the batch that deletes it in every region that has it
 * (`sharedCornerRemoval`).
 */
export function cornerRemoval(
  moveTogether: boolean,
  drafts: readonly Draft[],
  key: string,
  corner: LatLon,
  bases: (keys: readonly string[]) => Bases,
): { kind: 'allow' } | { kind: 'stage'; edit: Edit } | { kind: 'refuse'; region: string } {
  const own = drafts.find((draft) => draft.key === key)?.outline;
  if (own && removedCorner(own, corner) === undefined) return { kind: 'refuse', region: key };
  if (!moveTogether || cornerSharers(drafts, key, corner).length === 0) return { kind: 'allow' };
  const removal = sharedCornerRemoval(drafts, key, corner, bases);
  return removal.ok
    ? { kind: 'stage', edit: removal.edit }
    : { kind: 'refuse', region: removal.region };
}

/**
 * The staged edit of a corner dragged from `from` to `to` with "Move shared corners together" on:
 * the dragged region's outline as it was drawn, and every region that had a corner at `from`
 * with that corner moved too, as one `batch` (one step of undo); without such a region, or with
 * the corner where it was, the dragged region's own `outline` edit.
 */
export function sharedCornerEdit(
  drafts: readonly Draft[],
  dragged: { key: string; outline: LatLon[] },
  from: LatLon,
  to: LatLon,
  bases: (keys: readonly string[]) => Bases,
): Edit {
  const own: Edit = {
    kind: 'outline',
    key: dragged.key,
    outline: dragged.outline,
    bases: bases([dragged.key]),
  };
  if (samePoint(from, to)) return own;
  const sharers = cornerSharers(drafts, dragged.key, from);
  if (sharers.length === 0) return own;
  return {
    kind: 'batch',
    edits: [
      own,
      ...sharers.flatMap((key): Edit[] => {
        const outline = drafts.find((draft) => draft.key === key)?.outline;
        return outline
          ? [{ kind: 'outline', key, outline: movedCorner(outline, from, to), bases: bases([key]) }]
          : [];
      }),
    ],
  };
}
