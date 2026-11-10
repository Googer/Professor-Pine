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

/** Where the focus is among the row's controls: a toggle, a checkbox under More, More's button. */
export type RowFocus =
  { where: 'toggle'; at: number } | { where: 'entry'; at: number } | { where: 'more' };

/** What a measure shows and hides, and where the focus goes (review T5). */
export interface FitOutcome {
  /** Each toggle of the row, hidden or not, in their order. */
  toggleHidden: boolean[];
  /** Each checkbox under More, hidden or not, in the same order. */
  entryHidden: boolean[];
  /** The row's toggles all hidden: none fits. */
  rowHidden: boolean;
  /** More hidden (and closed): every toggle fits. */
  moreHidden: boolean;
  /** Where the focus goes, when what had it is hidden; none to leave it. */
  focus: RowFocus | undefined;
}

/**
 * The outcome of a measure: `shown` of `count` toggles in the row, the others under More. A focused
 * toggle that moved under More hands the focus to its checkbox while More is open, else to More's
 * button; a focused checkbox that moved into the row, to its toggle; More's focused button, when
 * More goes, to the row's last toggle.
 */
export function fitOutcome({
  count,
  shown,
  focused,
  moreOpen,
}: {
  count: number;
  shown: number;
  focused: RowFocus | undefined;
  moreOpen: boolean;
}): FitOutcome {
  const moreHidden = shown >= count;
  let focus: RowFocus | undefined;
  if (focused?.where === 'toggle' && focused.at >= shown) {
    focus = moreOpen && !moreHidden ? { where: 'entry', at: focused.at } : { where: 'more' };
  } else if (focused?.where === 'entry' && focused.at < shown) {
    focus = { where: 'toggle', at: focused.at };
  } else if (focused?.where === 'more' && moreHidden && count > 0) {
    focus = { where: 'toggle', at: count - 1 };
  }
  return {
    toggleHidden: Array.from({ length: count }, (_, at) => at >= shown),
    entryHidden: Array.from({ length: count }, (_, at) => at < shown),
    rowHidden: shown === 0,
    moreHidden,
    focus,
  };
}

/**
 * The room left for the row in the header: its inner width less the other controls shown (the
 * title, Report, "Find a gym" at the least width it gives way to, the account) and a gap beside
 * each.
 */
export function rowRoom(inner: number, others: readonly number[], gap: number): number {
  return others.reduce((room, width) => room - width - gap, inner);
}
