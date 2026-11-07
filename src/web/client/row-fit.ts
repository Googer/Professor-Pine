/**
 * How many of the layers' toggles the desktop's row shows (Matt, 2026-11-07: "show / hide entries
 * on desktop according to what fits, and put whatever doesn't under More"). The toggles come in
 * their order of priority (`MAP_LAYERS`' order); the row shows the first ones that fit and the
 * rest go under More, in the same order. Pure: the page measures (`showLayerControls`).
 */
export interface RowWidths {
  /** The room the row has, in pixels (`rowRoom`). */
  room: number;
  /** Each toggle's width, in their order. */
  chips: readonly number[];
  /** More's width, closed. */
  more: number;
  /** The gap between two toggles, and between the last shown and More. */
  gap: number;
}

/**
 * How many toggles are shown, from the first: all of them when they fit together (More then holds
 * nothing and is not shown); otherwise as many as fit with More beside them, never one skipped to
 * show a narrower one after it.
 */
export function rowFits({ room, chips, more, gap }: RowWidths): number {
  const width = (count: number): number =>
    chips.slice(0, count).reduce((sum, chip) => sum + chip, 0) + Math.max(count - 1, 0) * gap;
  if (width(chips.length) <= room) return chips.length;
  let count = 0;
  while (count < chips.length && width(count + 1) + gap + more <= room) count += 1;
  return count;
}

/**
 * The room left for the row in the header: its inner width less the other controls shown (the
 * title, Report, "Find a gym" at the least width it gives way to, the account) and a gap beside
 * each.
 */
export function rowRoom(inner: number, others: readonly number[], gap: number): number {
  return others.reduce((room, width) => room - width - gap, inner);
}
