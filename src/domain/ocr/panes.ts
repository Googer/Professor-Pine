import { boxHeight, type Box, type GreyImage, type TextLine } from './image.js';

/**
 * Split screens (plan 7P, design `2026-10-26-split-screen-screenshots-design.md`): what marks a
 * Pokémon GO screen in the text read (`screenAnchors`), whether a reading shows two screens
 * (`twoScreens`), the flat margins of a picture (`trimMargins`), Android's divider between two
 * panes (`findDivider`) and a cut found from the text where there is none (`textCut`). Pure: the
 * reading process gives the pictures as small greyscale copies (values 0 to 255) and the lines in
 * the picture's pixels.
 */

/** What marks a GO screen in its text. */
export type AnchorKind =
  /** A max battle's title: "Dynamax", "Gigantamax" or "Eternamax" (and the species after it). */
  | 'max-title'
  /** A hatched raid's CP, among the tallest text read. */
  | 'cp'
  /** A countdown h:mm:ss (two parts, a max battle's chip or a map's timer, are none). */
  | 'countdown'
  | 'private-group'
  /** The BATTLE button's word. */
  | 'battle'
  /**
   * A gym's title: the tallest text near the top. A name runs over two lines, so two titles show
   * two screens only side by side (`screensApart`).
   */
  | 'title';

export interface Anchor {
  kind: AnchorKind;
  box: Box;
  /** A CP read as digits alone, without "CP" or the icon before them (`589`, `32779`). */
  bare?: true;
  /** A title's line among the reading's lines: two pieces of one row have the same. */
  row?: number;
}

const MAX_WORD = /dynamax|gigantamax|eternamax/gi;
/** As `raid-screen.ts` reads the CP: digits after at most three other characters. */
const CP = /^\D{0,3}?(\d{3,6})$/;
/** A CP stands among the tallest text: at least this share of the tallest line's height. */
const CP_TALL = 0.6;
/** h:mm:ss, a space the reader may put in after a separator (`0: 44:52`). */
const COUNTDOWN = /\d{1,2}[:.] ?[0-5]\d[:.] ?[0-5]\d/g;
const COUNTDOWN_ONE = /\d{1,2}[:.] ?[0-5]\d[:.] ?[0-5]\d/;
/** A gym's title stands in this top share of what was read, among its tallest words. */
const TITLE_TOP = 0.2;
const TITLE_TALL = 0.8;
const LETTERS = /[a-z]{3}/i;
/** The game writes these in capitals; other text that says "battle" or "group" does not. */
const PRIVATE_GROUP = /PRIVATE\s*GROUP/g;
const BATTLE = /BATTLE(?![A-Za-z])/g;

/**
 * Each place `words` matches in a piece of text, its box from the match to the next match's
 * start (or the end), each character taken to be as wide as the average: a piece read across
 * two panes ("PRIVATE GROUP PRIVATE GROUP") gives one anchor per pane.
 */
function wordsIn(piece: TextLine, words: RegExp, kind: AnchorKind): Anchor[] {
  const { box, text } = piece;
  const perCharacter = (box.x1 - box.x0) / Math.max(1, text.length);
  const hits = [...text.matchAll(words)];
  return hits.map((hit, i) => ({
    kind,
    box: {
      ...box,
      x0: box.x0 + hit.index * perCharacter,
      x1: box.x0 + (hits[i + 1]?.index ?? text.length) * perCharacter,
    },
  }));
}

/**
 * The pieces a line was joined from (`TextLine.parts`), each with its own text and box; the
 * line itself when it is one piece. Two panes side by side are read into one line per row.
 */
function piecesOf(line: TextLine): TextLine[] {
  if (!line.parts) return [line];
  let start = 0;
  return line.parts.map((part) => {
    const text = line.text.slice(start, start + part.length);
    start += part.length + 1;
    return { text, confidence: line.confidence, box: part.box };
  });
}

/**
 * The anchors of a reading's lines (the status bar's left out by the caller), piece by piece: a
 * row read across two panes gives each pane's anchors.
 */
export function screenAnchors(lines: readonly TextLine[]): Anchor[] {
  const rows = lines.flatMap((line, row) => piecesOf(line).map((piece) => ({ piece, row })));
  const pieces = rows.map(({ piece }) => piece);
  const tallest = Math.max(0, ...pieces.map((piece) => boxHeight(piece.box)));
  const anchors: Anchor[] = [];
  // Titles: the tallest words in the top fifth of what was read, as `raid-screen.ts` finds a gym.
  const top = Math.min(...pieces.map((piece) => piece.box.y0));
  const bottom = Math.max(...pieces.map((piece) => piece.box.y1));
  const nearTop = rows.filter(
    ({ piece }) =>
      piece.box.y1 < top + (bottom - top) * TITLE_TOP &&
      LETTERS.test(piece.text) &&
      !COUNTDOWN_ONE.test(piece.text),
  );
  const tallestNearTop = Math.max(0, ...nearTop.map(({ piece }) => boxHeight(piece.box)));
  for (const { piece, row } of nearTop) {
    if (boxHeight(piece.box) >= tallestNearTop * TITLE_TALL) {
      anchors.push({ kind: 'title', box: piece.box, row });
    }
  }
  for (const piece of pieces) {
    const { box, text } = piece;
    anchors.push(...wordsIn(piece, MAX_WORD, 'max-title'));
    const compact = text.replace(/\s+/g, '');
    if (CP.test(compact) && boxHeight(box) >= tallest * CP_TALL) {
      anchors.push(/^\d+$/.test(compact) ? { kind: 'cp', box, bare: true } : { kind: 'cp', box });
    }
    anchors.push(...wordsIn(piece, COUNTDOWN, 'countdown'));
    anchors.push(...wordsIn(piece, PRIVATE_GROUP, 'private-group'));
    anchors.push(...wordsIn(piece, BATTLE, 'battle'));
  }
  return anchors;
}

/** Kinds a single screen shows once at most (a raid screen may show a nearby raid's countdown). */
const ONCE: ReadonlySet<AnchorKind> = new Set(['max-title', 'cp', 'private-group', 'battle']);
/**
 * A max battle's time chip stands beside its title: a countdown farther from the title than this
 * many of the title's heights belongs to another screen.
 */
const CHIP_REACH = 3;

/** The space between two boxes: 0 when they touch or overlap. */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

/**
 * Two boxes at about one height (their rows overlap) with a gap
 * between them at least as wide as the taller one is high: two titles of two panes.
 */
function sideBySide(a: Box, b: Box): boolean {
  const rows = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const gap = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  return rows > 0 && gap >= Math.max(boxHeight(a), boxHeight(b));
}

/** The kinds a raid's screen shows once, centered under its name (`oneName`). */
const MIDDLE: ReadonlySet<AnchorKind> = new Set(['cp', 'battle', 'private-group']);
/**
 * How far from the middle of a name's two pieces taken together (in shares of their whole
 * width) the screen's CP, BATTLE or PRIVATE GROUP may stand for them to be one name: 0.11 on the
 * raid pane of 2026-11-11; two screens side by side stand theirs about a quarter of the picture
 * from that middle.
 */
const NAME_MIDDLE = 0.15;

/**
 * Whether two titles side by side are one name: two pieces of one row read with words between
 * them too faint to keep, the screen's CP, BATTLE or PRIVATE GROUP centered under the two taken
 * together (a raid pane of 2026-11-11). Two screens side by side keep those under their own
 * titles, away from the middle of both.
 */
function oneName(a: Anchor, b: Anchor, anchors: readonly Anchor[]): boolean {
  if (a.row === undefined || a.row !== b.row) return false;
  const x0 = Math.min(a.box.x0, b.box.x0);
  const x1 = Math.max(a.box.x1, b.box.x1);
  const middle = (x0 + x1) / 2;
  return anchors.some(
    (one) =>
      MIDDLE.has(one.kind) &&
      Math.abs((one.box.x0 + one.box.x1) / 2 - middle) <= (x1 - x0) * NAME_MIDDLE,
  );
}

/** Whether two boxes share pixels (boxes that only touch do not: two words of one line). */
function overlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Two anchors that cannot be of one screen, or undefined: the same kind twice where a screen
 * shows it once, apart (not one line read twice); two titles side by side (not `oneName`); a
 * max battle's title with a raid's CP; a max battle's title with a countdown far from it.
 */
export function screensApart(anchors: readonly Anchor[]): [Anchor, Anchor] | undefined {
  for (const [i, a] of anchors.entries()) {
    for (const b of anchors.slice(i + 1)) {
      if (a.kind === b.kind && ONCE.has(a.kind)) {
        if (!overlap(a.box, b.box)) return [a, b];
        continue;
      }
      if (a.kind === 'title' && b.kind === 'title') {
        if (sideBySide(a.box, b.box) && !oneName(a, b, anchors)) return [a, b];
        continue;
      }
      const title = a.kind === 'max-title' ? a : b.kind === 'max-title' ? b : undefined;
      const other = title === a ? b : a;
      if (!title || other === title) continue;
      if (other.kind === 'cp') return [a, b];
      if (
        other.kind === 'countdown' &&
        gapBetween(title.box, other.box) > CHIP_REACH * boxHeight(title.box)
      ) {
        return [a, b];
      }
    }
  }
  return undefined;
}

/** Whether a reading's anchors show two screens (`screensApart`). */
export function twoScreens(anchors: readonly Anchor[]): boolean {
  return screensApart(anchors) !== undefined;
}

/** How the panes of a picture lie: one above the other (`rows`) or side by side (`columns`). */
export type CutAxis = 'rows' | 'columns';

/**
 * Where a picture is cut: along `axis`, the panes before `from` and from `to` on (the divider's
 * band between them; a text cut's `from` and `to` are one place).
 */
export interface Cut {
  axis: CutAxis;
  from: number;
  to: number;
}

/**
 * Text read across a place this far past a cut's band (in the picture's pixels) runs across it;
 * less is the band's own edge read as a piece's edge.
 */
const ACROSS = 8;

/**
 * Whether a piece of the whole reading's text (`lines`, in the picture's pixels, a joined row by
 * its pieces) runs across `cut` (in `grey`'s pixels, `scale` of the picture's): then the cut
 * goes through one screen's words, not between two screens (plan 7P, review R4).
 */
export function crossesCut(lines: readonly TextLine[], cut: Cut, scale: number): boolean {
  const [from, to] = [cut.from / scale, cut.to / scale];
  return (
    lines
      .flatMap(piecesOf)
      // A piece whose own words show two screens was read across both panes: it is no text of one.
      .filter((piece) => !twoScreens(screenAnchors([piece])))
      .some((piece) =>
        cut.axis === 'rows'
          ? piece.box.y0 < from - ACROSS && piece.box.y1 > to + ACROSS
          : piece.box.x0 < from - ACROSS && piece.box.x1 > to + ACROSS,
      )
  );
}

/** The two panes of `box` cut by `cut` (in the same pixels): the top or left one first. */
export function panesOf(box: Box, cut: Cut): [Box, Box] {
  return cut.axis === 'rows'
    ? [
        { ...box, y1: cut.from },
        { ...box, y0: cut.to },
      ]
    : [
        { ...box, x1: cut.from },
        { ...box, x0: cut.to },
      ];
}

/** The box in another scale. */
export function scaleBox(box: Box, by: number): Box {
  return { x0: box.x0 * by, y0: box.y0 * by, x1: box.x1 * by, y1: box.y1 * by };
}

/** Darker than this is dark: Android's divider is grey 20 on the samples. */
const DARK = 30;
/** A pixel this bright or more is not part of a dark, flat line. */
const LIGHT = 50;
/** A flat dark line has at most this share of pixels that are `LIGHT`. */
const STRAY = 0.02;
/** A line next to a divider is a picture: at least this share of its pixels are `LIGHT`. */
const PICTURE = 0.2;
/**
 * The middle share of a divider's length that may hold its handle (the samples' is 17.5% of the
 * band's length; up to about 25% is allowed, with some room).
 */
const HANDLE = 0.3;
/** A divider is at most this share of the side across it (26 of 2448 pixels on the samples). */
const DIVIDER_MAX = 0.08;
/** …and lies between these shares of that side, never at an edge. */
const DIVIDER_FROM = 0.15;
const DIVIDER_TO = 0.85;
/** A margin is trimmed only when it is at least this share of its side. */
const MARGIN_MIN = 0.03;

/** The values of line `i` along `axis` (a row's or a column's), within `box`. */
function lineValues(grey: GreyImage, axis: CutAxis, i: number, box: Box): Float32Array {
  if (axis === 'rows') return grey.data.subarray(i * grey.width + box.x0, i * grey.width + box.x1);
  const values = new Float32Array(box.y1 - box.y0);
  for (let y = box.y0; y < box.y1; y++) values[y - box.y0] = grey.data[y * grey.width + i] ?? 0;
  return values;
}

function lightShare(values: ArrayLike<number>, from = 0, to = values.length): number {
  let light = 0;
  for (let k = from; k < to; k++) if ((values[k] ?? 0) >= LIGHT) light++;
  return to > from ? light / (to - from) : 0;
}

function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  let sum = 0;
  for (let k = from; k < to; k++) sum += values[k] ?? 0;
  return to > from ? sum / (to - from) : 0;
}

/** A line that is dark and flat over its whole length (a margin). */
function marginLine(values: ArrayLike<number>): boolean {
  return mean(values) <= DARK && lightShare(values) <= STRAY / 2;
}

/**
 * A pane's margin may hold the status bar's text or a floating button of the system (a small GO
 * pillarboxed in its pane): at least this share of the line is dark.
 */
const LOOSE_DARK = 0.75;

/** A line of a pane's margin: mostly dark (`LOOSE_DARK`). */
function looseMarginLine(values: ArrayLike<number>): boolean {
  let dark = 0;
  for (let k = 0; k < values.length; k++) if ((values[k] ?? 0) <= DARK) dark++;
  return values.length > 0 && dark / values.length >= LOOSE_DARK;
}

/**
 * A line that is dark and flat outside its middle (`HANDLE`), where a divider's handle may stand.
 */
function dividerLine(values: ArrayLike<number>): boolean {
  const n = values.length;
  const a = Math.floor((n * (1 - HANDLE)) / 2);
  const b = Math.ceil((n * (1 + HANDLE)) / 2);
  const outside = (fn: (from: number, to: number) => number) =>
    (fn(0, a) * a + fn(b, n) * (n - b)) / Math.max(1, a + n - b);
  return (
    outside((from, to) => mean(values, from, to)) <= DARK &&
    outside((from, to) => lightShare(values, from, to)) <= STRAY
  );
}

/**
 * The picture's content within `box` (whole by default): its flat dark margins at the edges
 * trimmed (the black bars of a letterboxed or pillarboxed screen), each only when it is at least
 * `MARGIN_MIN` of its side, and never all of it. A pane's (`pane`) are mostly dark lines
 * (`LOOSE_DARK`): the status bar over a small pillarboxed GO, a floating button beside it.
 */
export function trimMargins(
  grey: GreyImage,
  box: Box = { x0: 0, y0: 0, x1: grey.width, y1: grey.height },
  pane = false,
): Box {
  const out = { ...box };
  const margin = pane ? looseMarginLine : marginLine;
  const run = (axis: CutAxis, from: number, step: 1 | -1, limit: number, across: Box) => {
    let i = from;
    while (i !== limit && margin(lineValues(grey, axis, i, across))) i += step;
    return Math.abs(i - from);
  };
  const height = box.y1 - box.y0;
  const top = run('rows', box.y0, 1, box.y1, box);
  const bottom = run('rows', box.y1 - 1, -1, box.y0 - 1, box);
  if (top < height && top >= height * MARGIN_MIN) out.y0 += top;
  if (bottom < height && bottom >= height * MARGIN_MIN) out.y1 -= bottom;
  if (out.y1 <= out.y0) return { ...box };
  const width = out.x1 - out.x0;
  const left = run('columns', out.x0, 1, out.x1, out);
  const right = run('columns', out.x1 - 1, -1, out.x0 - 1, out);
  if (left < width && left >= width * MARGIN_MIN) out.x0 += left;
  if (right < width && right >= width * MARGIN_MIN) out.x1 -= right;
  return out.x1 > out.x0 ? out : { ...box };
}

/**
 * Whether a pane's content (`box`, its margins trimmed) is a small GO boxed in the pane: margins
 * on both sides of it, each at least `MARGIN_MIN` of the pane's width (Matt's split: GO 664 of
 * 1080, black from 0 to 208 and from 872). A landscape split's pane trimmed of the phone's corner
 * on one side, or a chat on black trimmed to its text, is none (plan 7P-G).
 */
export function boxedIn(pane: Box, box: Box): boolean {
  const margin = (pane.x1 - pane.x0) * MARGIN_MIN;
  return box.x0 - pane.x0 >= margin && pane.x1 - box.x1 >= margin;
}

/**
 * Android's divider between two panes within `box`: a band of rows (top and bottom) or of
 * columns (side by side) that is dark and flat but for a handle in its middle, thin
 * (`DIVIDER_MAX`), between `DIVIDER_FROM` and `DIVIDER_TO` of the side, and with a picture on
 * either side of it (GO's own flat floor or a night sky is not dark-and-thin-and-different). The
 * band nearest the middle when there are several; null when there is none.
 */
export function findDivider(grey: GreyImage, box: Box): Cut | null {
  let best: { cut: Cut; off: number } | null = null;
  for (const axis of ['rows', 'columns'] as const) {
    const [start, end] = axis === 'rows' ? [box.y0, box.y1] : [box.x0, box.x1];
    const side = end - start;
    const values = (i: number) => lineValues(grey, axis, i, box);
    // Android's dark divider (a picture on either side, by its light pixels), and a flat band
    // of any one grey with a picture on either side (a foldable's spine: the Duo's is grey 60).
    const kinds: {
      level: (i: number) => number | undefined;
      picture: (i: number) => boolean;
      apart?: (before: number, after: number, level: number) => boolean;
      widest: number;
    }[] = [
      {
        level: (i: number) => (dividerLine(values(i)) ? 0 : undefined),
        picture: (i: number) => lightShare(values(i)) >= PICTURE,
        widest: DIVIDER_MAX,
      },
      // Only between panes side by side, thin, and unlike the picture on a side (a game screen's
      // sky, an app's margin, a chat's background are flat too, and like both their sides).
      ...(axis === 'columns'
        ? [
            {
              level: (i: number) => uniformLevel(values(i)),
              picture: (i: number) => uniformLevel(values(i)) === undefined,
              // Unlike the picture on one side at least: an app beside it may be as dark.
              apart: (before: number, after: number, level: number) =>
                Math.max(
                  Math.abs(medianOf(values(before)) - level),
                  Math.abs(medianOf(values(after)) - level),
                ) >= SPINE_APART,
              widest: SPINE_MAX,
            },
          ]
        : []),
    ];
    for (const kind of kinds) {
      let i = start;
      while (i < end) {
        const level = kind.level(i);
        if (level === undefined) {
          i++;
          continue;
        }
        let j = i;
        for (; j < end; j++) {
          const here = kind.level(j);
          if (here === undefined || Math.abs(here - level) > FLAT) break;
        }
        const thick = j - i;
        const before = i - 2;
        const after = j + 1;
        const fits =
          thick >= 2 &&
          thick <= side * kind.widest &&
          i - start >= side * DIVIDER_FROM &&
          j - start <= side * DIVIDER_TO &&
          before >= start &&
          after < end &&
          kind.picture(before) &&
          kind.picture(after) &&
          (kind.apart?.(before, after, level) ?? true);
        if (fits) {
          const off = Math.abs((i + j) / 2 - (start + end) / 2) / side;
          if (!best || off < best.off) best = { cut: { axis, from: i, to: j }, off };
        }
        i = j;
      }
    }
  }
  return best?.cut ?? null;
}

/** A flat line's values lie within this of its level (JPEG's noise). */
const FLAT = 12;
/** A spine is at most this share of the width (the Duo's: 12 of 2007 pixels). */
const SPINE_MAX = 0.02;
/** A spine's grey differs from the median of the lines beside it by at least this much. */
const SPINE_APART = 20;

function medianOf(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The grey of a line that is one flat grey outside its middle (`HANDLE`, where a divider's
 * handle may stand): all but `STRAY` of its pixels within `FLAT` of their median; undefined
 * for any other line (a picture's).
 */
function uniformLevel(values: ArrayLike<number>): number | undefined {
  const n = values.length;
  const a = Math.floor((n * (1 - HANDLE)) / 2);
  const b = Math.ceil((n * (1 + HANDLE)) / 2);
  const outside = [...Array.from({ length: a }, (_, k) => values[k] ?? 0)];
  for (let k = b; k < n; k++) outside.push(values[k] ?? 0);
  if (outside.length === 0) return undefined;
  const sorted = [...outside].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const off = outside.filter((value) => Math.abs(value - median) > FLAT).length;
  return off <= outside.length * STRAY ? median : undefined;
}

/**
 * How strongly the picture changes from line `i` to line `i + 1` along `axis` within `box`: the
 * median difference along the line (two pictures meeting differ along their whole length, a
 * button's edge only along part of it).
 */
function seam(grey: GreyImage, axis: CutAxis, i: number, box: Box): number {
  const a = lineValues(grey, axis, i, box);
  const b = lineValues(grey, axis, i + 1, box);
  const diffs = Array.from(a, (value, k) => Math.abs(value - (b[k] ?? 0))).sort((x, y) => x - y);
  return diffs[Math.floor(diffs.length / 2)] ?? 0;
}

/**
 * A cut found from the text where no divider is (a foldable's panes meet without one): the
 * anchors (`screenAnchors` of `lines`, in the picture's pixels) split into two groups along an
 * axis, the first wholly before the second and neither showing two screens; between them, in a
 * band of the picture that no line's box crosses, the place where the picture changes most
 * (`seam`, on `grey` at `scale` of the picture's pixels). Null when the anchors show one screen,
 * or no such band is there (a line read across both panes). The cut is in `grey`'s pixels, as
 * `findDivider`'s.
 */
export function textCut(
  lines: readonly TextLine[],
  grey: GreyImage,
  scale: number,
  box: Box,
): Cut | null {
  const anchors = screenAnchors(lines);
  if (!twoScreens(anchors)) return null;
  let best: { cut: Cut; strength: number } | null = null;
  for (const axis of ['rows', 'columns'] as const) {
    const lo = (b: Box) => (axis === 'rows' ? b.y0 : b.x0);
    const hi = (b: Box) => (axis === 'rows' ? b.y1 : b.x1);
    const sorted = [...anchors].sort((a, b) => lo(a.box) + hi(a.box) - lo(b.box) - hi(b.box));
    for (let k = 1; k < sorted.length; k++) {
      const first = sorted.slice(0, k);
      const second = sorted.slice(k);
      if (twoScreens(first) || twoScreens(second)) continue;
      const from = Math.max(...first.map((a) => hi(a.box)));
      const to = Math.min(...second.map((a) => lo(a.box)));
      const found = strongestSeam(lines, grey, scale, box, axis, from, to);
      if (found && (!best || found.strength > best.strength)) best = found;
    }
  }
  return best?.cut ?? null;
}

/**
 * Between `from` and `to` (the picture's pixels) along `axis`, the place no piece of text
 * crosses where the picture changes most (`seam`), as a cut in `grey`'s pixels; null when text
 * crosses everywhere.
 */
function strongestSeam(
  lines: readonly TextLine[],
  grey: GreyImage,
  scale: number,
  box: Box,
  axis: CutAxis,
  from: number,
  to: number,
): { cut: Cut; strength: number } | null {
  if (to <= from) return null;
  const lo = (b: Box) => (axis === 'rows' ? b.y0 : b.x0);
  const hi = (b: Box) => (axis === 'rows' ? b.y1 : b.x1);
  const covered = lines
    .flatMap((line) => piecesOf(line).map((piece) => piece.box))
    .map((one) => [lo(one), hi(one)] as const)
    .filter(([a, b]) => b > from && a < to);
  const [g0, g1] = axis === 'rows' ? [box.y0, box.y1] : [box.x0, box.x1];
  let best: { cut: Cut; strength: number } | null = null;
  for (let i = Math.max(Math.ceil(from * scale), g0); i < Math.min(to * scale, g1 - 1); i++) {
    const at = (i + 1) / scale;
    if (covered.some(([a, b]) => a < at && b > at)) continue;
    const strength = seam(grey, axis, i, box);
    if (!best || strength > best.strength)
      best = { cut: { axis, from: i + 1, to: i + 1 }, strength };
  }
  return best;
}

/** Where two pictures side by side may meet: this middle share of the width. */
const SEAM_FROM = 0.3;
const SEAM_TO = 0.7;
/**
 * Two pictures meeting differ along the whole seam by at least this much (the median grey
 * difference): a game screen's own columns change by a few levels.
 */
const SEAM_MIN = 20;

/**
 * A cut of a wide picture (`box`, in `grey`'s pixels) that shows one screen beside something
 * else (a foldable's map beside GO, plan 7P): the strongest seam (`SEAM_MIN`) between columns in
 * the middle of the picture that no text crosses; null when there is none. Its panes are kept
 * only when each reads as one screen or none (`cutKept`).
 */
export function seamCut(
  lines: readonly TextLine[],
  grey: GreyImage,
  scale: number,
  box: Box,
): Cut | null {
  const width = box.x1 - box.x0;
  const found = strongestSeam(
    lines,
    grey,
    scale,
    box,
    'columns',
    (box.x0 + width * SEAM_FROM) / scale,
    (box.x0 + width * SEAM_TO) / scale,
  );
  return found && found.strength >= SEAM_MIN ? found.cut : null;
}

/**
 * What a pane shows by its reading (`kind` from the screen's text): a raid's or a max battle's
 * screen, no screen (a map, a chat, notes: no anchor that only a GO screen shows), or something
 * unclear (a button or a title of GO that makes no screen, or two screens).
 */
export type PaneShows = 'raid' | 'max' | 'none' | 'unclear';

/**
 * Anchors only a GO screen shows. A countdown or a title alone is no screen: a chat says
 * "0:32:10 left", a map shows a raid's timer, any app has a heading.
 */
const SCREEN_ONLY: ReadonlySet<AnchorKind> = new Set([
  'max-title',
  'cp',
  'private-group',
  'battle',
]);
/** Whether the anchors hold one that only a GO screen shows (`SCREEN_ONLY`). */
export function showsGo(anchors: readonly Anchor[]): boolean {
  return anchors.some((one) => SCREEN_ONLY.has(one.kind));
}

/** An egg's countdown stands alone in its line: at most this many of its heights wide. */
const COUNTDOWN_ALONE = 6;

export function paneShows(
  text: {
    max?: unknown;
    cp: number | null;
    countdown: number | null;
    countdownPlace: string | null;
    countdownBox: Box | null;
    gym: string | null;
    /** Where the reader's CP stands: a bare number there is no raid's sign by itself. */
    cpBox?: Box | null;
  },
  anchors: readonly Anchor[],
): PaneShows {
  // Two screens in a pane keep the whole reading, when one of them shows GO by more than its
  // titles: titles side by side alone, and bare numbers, are no screens of GO (the tabs of GO's
  // friends list, read in pieces, and its friends' count: Matt's split of 2026-10-22).
  const beyondTitles = anchors.some((one) => one.kind !== 'title' && !one.bare);
  if (twoScreens(anchors) && beyondTitles) return 'unclear';
  if (text.max) return 'max';
  // A hatched raid by its CP; an egg by its gym and its countdown, alone in its line and
  // centered under it (a chat's countdown is in a sentence).
  const box = text.countdownBox;
  const alone = box !== null && box.x1 - box.x0 <= COUNTDOWN_ALONE * boxHeight(box);
  const egg =
    text.countdown !== null && alone && text.countdownPlace === 'centre' && text.gym !== null;
  // A CP only with a raid's own sign beside it: its countdown, BATTLE or PRIVATE GROUP (every
  // raid the samples' readings showed had a countdown read). A gym is no sign: any screen's
  // tallest text near the top reads as one (the tabs of GO's friends list, whose friends' count,
  // a number alone in a line, reads as a CP: Matt's split of 2026-10-22).
  const raidSign =
    text.countdown !== null ||
    anchors.some((one) => one.kind === 'battle' || one.kind === 'private-group');
  if ((text.cp !== null && raidSign) || egg) return 'raid';
  // A countdown alone in its line and centered that makes no egg (no gym read) may be an egg
  // read badly: unclear, so the whole reading stands and no egg is dropped unsaid. Off the
  // middle it is a chat message that is only a time, or a map's raid timer.
  if (text.countdown !== null && alone && text.countdownPlace === 'centre') return 'unclear';
  // A CP with its letters but no other sign may be a raid whose countdown was misread: unclear,
  // so no raid is dropped unsaid. A bare number (`bare`) alone is no sign of GO in a pane; a
  // whole picture's anchors (`twoScreens`) still count it as a CP.
  const cpBox = text.cpBox;
  const readCp = cpBox
    ? anchors.filter((one) => one.kind === 'cp' && overlaps(one.box, cpBox))
    : [];
  const bareCp = readCp.length > 0 && readCp.every((one) => one.bare);
  if (text.cp !== null && !bareCp) return 'unclear';
  return showsGo(anchors.filter((one) => !one.bare)) ? 'unclear' : 'none';
}

/** Whether two boxes share some area. */
function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Whether a cut's panes are kept in place of the whole reading: every pane shows one screen or
 * none, and at least one shows a screen.
 */
export function cutKept(shows: readonly PaneShows[]): boolean {
  return (
    shows.every((one) => one !== 'unclear') && shows.some((one) => one === 'raid' || one === 'max')
  );
}

/** Where a pane stands in its picture, as members name it. */
export type PaneSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * The side of `pane` among the panes of its picture: top or bottom when they stand one above the
 * other (the second starts below the first), else left or right.
 */
export function paneSide(
  pane: { index: number; box: Box },
  panes: readonly { index: number; box: Box }[],
): PaneSide {
  const [first, second] = [...panes].sort((a, b) => a.index - b.index);
  const rows = !first || !second || second.box.y0 >= first.box.y1 - 2;
  if (rows) return pane.index === 1 ? 'top' : 'bottom';
  return pane.index === 1 ? 'left' : 'right';
}
