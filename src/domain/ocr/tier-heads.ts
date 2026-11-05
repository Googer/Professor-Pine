import { boxHeight, type GreyImage } from './image.js';
import type { ScreenText } from './raid-screen.js';

/**
 * Counting the tier heads of a raid screen by template matching: the game's own head icon
 * (`ic_raid_small.png`) is matched by normalised cross-correlation inside its outline, so that
 * whatever stands behind a head does not count, at several scales, in a band beside the
 * countdown (an egg) or the CP (a hatched raid). The heads stand in a row centred on the screen;
 * counts of 7 down to 1 are tried with a spacing that is searched. The values are the research's
 * (28 of 28 samples right for every threshold from 0.40 to 0.55).
 */

/** A template: values and a mask (1 inside the head's outline, 0 outside). */
export interface HeadTemplate {
  width: number;
  height: number;
  data: Float32Array;
  mask: Float32Array;
}

/** The band of the screen the heads are looked for in, and the expected height of a head. */
export interface HeadBand {
  top: number;
  bottom: number;
  unit: number;
}

export interface HeadCount {
  /** 0 when no row of heads was found. */
  count: number;
  /** The best match's correlation (−1 to 1). */
  score: number;
  /** The scale of the template, relative to the expected head, that matched. */
  scale: number;
  /** The best match just outside the row (−1 when there is no row or no room). */
  outside: number;
}

/** The work is done at the size where a head is this many pixels high. */
const WORK_HEAD = 24;
/** A row needs one match at least this good, and each of its heads at least `LOW`. */
const MIN_PEAK = 0.45;
const LOW = 0.45;
const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25];
/** Heads stand 1.2 to 1.5 head widths apart, centre to centre. */
const SPACING_FROM = 1.2;
const SPACING_TO = 1.5;
const SPACING_STEP = 0.03;
export const MAX_HEADS = 7;
/**
 * How far above a hatched raid's CP its heads' band reaches, in units (`headBand`): 1.6 on the
 * research's screens, but GO draws the heads higher over the CP in a short pane of a split screen
 * (plan 7P-H: their tops 1.9 units over it, 1.25 units tall), and a band cut through them counted
 * none (or 3 of 5).
 */
const CP_BAND_REACH = 2.4;

/**
 * The template of an RGBA picture of the head: its alpha as the values (the head is opaque white,
 * its eyes and mouth transparent), and as the mask everything but the transparent area that
 * touches the border (found by flood fill), so the eyes and mouth count and the outside does not.
 */
export function headTemplate(icon: {
  width: number;
  height: number;
  data: Uint8Array;
}): HeadTemplate {
  const { width, height } = icon;
  const data = new Float32Array(width * height);
  for (let k = 0; k < data.length; k++) data[k] = icon.data[k * 4 + 3] ?? 0;
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length > 0) {
    const k = stack.pop() ?? 0;
    if (outside[k] || (data[k] ?? 0) > 127) continue;
    outside[k] = 1;
    const x = k % width;
    const y = (k - x) / width;
    if (x > 0) stack.push(k - 1);
    if (x < width - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - width);
    if (y < height - 1) stack.push(k + width);
  }
  const mask = Float32Array.from(outside, (o) => 1 - o);
  return { width, height, data, mask };
}

/**
 * Where the heads are looked for: just above a max battle's boss line (a head about 0.42 of its
 * height, between 1.5 and 0.6 of its heights above it), else above the CP of a hatched raid (a
 * unit 0.3 of the CP's height, from `CP_BAND_REACH` units above its top to 0.4 below), else under the countdown of an egg (a head about 1.5 of
 * the countdown's height); null without any.
 */
export function headBand(
  text: Pick<ScreenText, 'cpBox' | 'countdownBox' | 'max'>,
): HeadBand | null {
  if (text.max) {
    const height = boxHeight(text.max.box);
    return {
      top: text.max.box.y0 - height * 1.5,
      bottom: text.max.box.y0 - height * 0.6,
      unit: height * 0.42,
    };
  }
  if (text.cpBox) {
    const unit = boxHeight(text.cpBox) * 0.3;
    return { top: text.cpBox.y0 - unit * CP_BAND_REACH, bottom: text.cpBox.y0 + unit * 0.4, unit };
  }
  if (text.countdownBox) {
    const unit = boxHeight(text.countdownBox) * 1.5;
    return { top: text.countdownBox.y1, bottom: text.countdownBox.y1 + unit * 2.6, unit };
  }
  return null;
}

/** A picture (and its mask) scaled by nearest neighbour. */
function resized<
  T extends { width: number; height: number; data: Float32Array; mask?: Float32Array },
>(image: T, scale: number): T {
  const width = Math.max(4, Math.round(image.width * scale));
  const height = Math.max(4, Math.round(image.height * scale));
  const data = new Float32Array(width * height);
  const mask = image.mask ? new Float32Array(width * height) : undefined;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      data[y * width + x] = image.data[sy * image.width + sx] ?? 0;
      if (mask && image.mask) mask[y * width + x] = image.mask[sy * image.width + sx] ?? 0;
    }
  }
  return { ...image, width, height, data, ...(mask ? { mask } : {}) };
}

interface CorrelationMap {
  width: number;
  height: number;
  data: Float32Array;
}

/** Normalised cross-correlation of the template at every position where it fits, inside its mask. */
function correlation(image: GreyImage, template: HeadTemplate): CorrelationMap {
  const size = template.width * template.height;
  let n = 0;
  let mean = 0;
  for (let k = 0; k < size; k++) {
    const m = template.mask[k] ?? 0;
    n += m;
    mean += (template.data[k] ?? 0) * m;
  }
  mean /= n;
  const centred = new Float32Array(size);
  let norm = 0;
  for (let k = 0; k < size; k++) {
    centred[k] = ((template.data[k] ?? 0) - mean) * (template.mask[k] ?? 0);
    norm += (centred[k] ?? 0) ** 2;
  }
  norm = Math.sqrt(norm);
  const width = image.width - template.width + 1;
  const height = image.height - template.height + 1;
  const data = new Float32Array(Math.max(0, width * height));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let squares = 0;
      let cross = 0;
      for (let ty = 0; ty < template.height; ty++) {
        const row = (y + ty) * image.width + x;
        const trow = ty * template.width;
        for (let tx = 0; tx < template.width; tx++) {
          if (!template.mask[trow + tx]) continue;
          const v = image.data[row + tx] ?? 0;
          sum += v;
          squares += v * v;
          cross += v * (centred[trow + tx] ?? 0);
        }
      }
      const variance = squares - (sum * sum) / n;
      data[y * width + x] = variance > 1e-6 ? cross / (Math.sqrt(variance) * norm) : 0;
    }
  }
  return { width, height, data };
}

/** The best position in the map. */
function peak(map: CorrelationMap): { x: number; y: number; score: number } | undefined {
  let best: { x: number; y: number; score: number } | undefined;
  for (let k = 0; k < map.data.length; k++) {
    const score = map.data[k] ?? -1;
    if (!best || score > best.score)
      best = { x: k % map.width, y: Math.floor(k / map.width), score };
  }
  return best;
}

/** The best correlation near a head whose corner is at (x, y). */
function near(map: CorrelationMap, template: HeadTemplate, x: number, y: number): number {
  const dx = Math.round(template.width * 0.15);
  const dy = Math.round(template.height * 0.3);
  let best = -1;
  for (let yy = y - dy; yy <= y + dy; yy++) {
    if (yy < 0 || yy >= map.height) continue;
    for (let xx = x - dx; xx <= x + dx; xx++) {
      if (xx < 0 || xx >= map.width) continue;
      best = Math.max(best, map.data[yy * map.width + xx] ?? -1);
    }
  }
  return best;
}

/**
 * How many heads stand in a row centred on the band (`band` spans the screen's width, `unit` is
 * the expected head height in its pixels). At each scale: the best match must reach `MIN_PEAK`,
 * then the largest count whose every position (centred, a searched spacing apart, one of them
 * the best match) reaches `LOW`. A scale at which a row fits beats one at which none does,
 * whatever its peak; among those the best peak wins.
 */
export function countHeads(band: GreyImage, unit: number, template: HeadTemplate): HeadCount {
  const work = WORK_HEAD / unit;
  const small = resized({ ...band }, work);
  let best: HeadCount = { count: 0, score: 0, scale: 0, outside: -1 };
  for (const scale of SCALES) {
    const t = resized(template, (WORK_HEAD * scale) / template.height);
    if (t.width >= small.width || t.height >= small.height) continue;
    const map = correlation(small, t);
    const top = peak(map);
    if (!top || top.score < MIN_PEAK) continue;
    if (best.count > 0 && top.score <= best.score) continue;
    const centre = small.width / 2 - t.width / 2;
    let count = 0;
    let outside = -1;
    let row: { xs: number[]; step: number } | undefined;
    for (let n = MAX_HEADS; n >= 1 && !row; n--) {
      for (let k = SPACING_FROM; k <= SPACING_TO + 1e-9 && !row; k += SPACING_STEP) {
        const step = t.width * k;
        const xs = Array.from({ length: n }, (_, i) =>
          Math.round(centre + (i - (n - 1) / 2) * step),
        );
        if (!xs.some((x) => Math.abs(x - top.x) <= t.width * 0.2)) continue;
        if (xs.every((x) => near(map, t, x, top.y) >= LOW)) row = { xs, step };
      }
    }
    // How much the places just outside the row look like heads, kept for review: on the
    // research's samples 0.12 to 0.49 beside rows counted right, so it decides nothing.
    if (row) {
      const first = row.xs[0] ?? 0;
      const last = row.xs.at(-1) ?? 0;
      const outward = [first - row.step, last + row.step].map(Math.round);
      const inside = outward.filter((x) => x >= 0 && x < map.width);
      outside = Math.max(-1, ...inside.map((x) => near(map, t, x, top.y)));
      count = row.xs.length;
    }
    if (count > 0 || best.count === 0) {
      if (count > 0 || top.score > best.score) best = { count, score: top.score, scale, outside };
    }
  }
  return best;
}
