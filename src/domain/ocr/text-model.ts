import type { Box, RgbImage, TextLine } from './image.js';

/**
 * What surrounds the two PaddleOCR models, without the models: the detector's input and the
 * boxes of text in its output (DB: a map of the probability that a pixel is text), the
 * recogniser's input and the decoding of its output (CTC over the dictionary), and the lines
 * the boxes make. The values are the ones the research measured on the sample screenshots
 * (`docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`): change one only with
 * `npm run ocr:check` over every sample.
 */

/** The detector takes sides that are multiples of this. */
const DETECTOR_STEP = 32;
/** A pixel of the detector's map is text above this probability. */
export const TEXT_THRESHOLD = 0.03;
/** The DB "unclip": a box is grown on every side by its area × this / its perimeter. */
const UNCLIP_RATIO = 1.5;
/** A region narrower than this (pixels of the map) is no text; once grown, narrower than the second. */
const MIN_SIDE = 3;
const MIN_GROWN_SIDE = 5;
/** The recogniser reads a line scaled to this height. */
export const LINE_HEIGHT = 48;
/**
 * The widest line the recogniser is given: a wider one is squeezed to it, so that a box across a
 * whole screen (or a strange picture) cannot make the model's input, and its memory, unbounded.
 * Text on a raid screen is far narrower.
 */
export const MAX_LINE_WIDTH = 3200;
/** A line read with less mean confidence than this is dropped. */
export const MIN_CONFIDENCE = 0.5;

/**
 * The detector reads at most this many pixels: a screen at 720 wide is about 1.2 million, its
 * status bar about 0.5. Anything larger is scaled down, so no picture can make the model's
 * memory explode.
 */
export const DETECTOR_PIXELS = 2_000_000;

/**
 * The size the detector reads a picture at: scaled down to `DETECTOR_PIXELS` when larger, then
 * each side up to a multiple of 32.
 */
export function detectorSize(width: number, height: number): { width: number; height: number } {
  const shrink = Math.min(1, Math.sqrt(DETECTOR_PIXELS / (width * height)));
  const up = (side: number) =>
    Math.max(DETECTOR_STEP, Math.ceil((side * shrink) / DETECTOR_STEP) * DETECTOR_STEP);
  return { width: up(width), height: up(height) };
}

/**
 * A picture as the models take it: three planes, blue, green, red (the models were trained on
 * OpenCV's order), each value a byte / 255. `width` may be larger than the picture's: the rest of
 * each row stays 0 (padding of a line to the width of others).
 */
export function modelInput(image: RgbImage, width = image.width): Float32Array {
  const plane = image.height * width;
  const out = new Float32Array(3 * plane);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const k = (y * image.width + x) * 3;
      const o = y * width + x;
      out[o] = (image.data[k + 2] ?? 0) / 255;
      out[plane + o] = (image.data[k + 1] ?? 0) / 255;
      out[2 * plane + o] = (image.data[k] ?? 0) / 255;
    }
  }
  return out;
}

/**
 * The boxes of text in the detector's map: each region of pixels above `TEXT_THRESHOLD` that
 * touch (also across a corner) is one box, its bounding box grown by the unclip distance and
 * kept inside the map. Boxes are in the map's pixels.
 */
export function textBoxes(map: Float32Array, width: number, height: number): Box[] {
  const seen = new Uint8Array(width * height);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < map.length; start++) {
    if (seen[start] || (map[start] ?? 0) <= TEXT_THRESHOLD) continue;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const k = stack.pop() ?? 0;
      const x = k % width;
      const y = (k - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (!seen[n] && (map[n] ?? 0) > TEXT_THRESHOLD) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    const w = x1 + 1 - x0;
    const h = y1 + 1 - y0;
    if (Math.min(w, h) < MIN_SIDE) continue;
    const d = (w * h * UNCLIP_RATIO) / (2 * (w + h));
    const grown = {
      x0: Math.max(0, Math.round(x0 - d)),
      y0: Math.max(0, Math.round(y0 - d)),
      x1: Math.min(width, Math.round(x1 + 1 + d)),
      y1: Math.min(height, Math.round(y1 + 1 + d)),
    };
    if (Math.min(grown.x1 - grown.x0, grown.y1 - grown.y0) < MIN_GROWN_SIDE) continue;
    boxes.push(grown);
  }
  return boxes;
}

/**
 * The width a box is read at: its height scaled to `LINE_HEIGHT`, its width alike, at most
 * `MAX_LINE_WIDTH`.
 */
export function lineWidth(box: Box): number {
  const width = Math.round((LINE_HEIGHT * (box.x1 - box.x0)) / (box.y1 - box.y0));
  return Math.min(MAX_LINE_WIDTH, Math.max(1, width));
}

/**
 * The text of one line from the recogniser's output, `steps` × `classes` scores from `offset`:
 * the best class of each step, repeats folded and the blank (class 0) dropped; class `c` is the
 * dictionary's entry `c - 1`. The confidence is the mean score of the characters kept.
 */
export function ctcDecode(
  scores: Float32Array,
  offset: number,
  steps: number,
  classes: number,
  dictionary: readonly string[],
): { text: string; confidence: number } {
  let text = '';
  let sum = 0;
  let count = 0;
  let previous = -1;
  for (let step = 0; step < steps; step++) {
    const base = offset + step * classes;
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < classes; c++) {
      const score = scores[base + c] ?? -Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best !== 0 && best !== previous) {
      text += dictionary[best - 1] ?? '';
      sum += bestScore;
      count++;
    }
    previous = best;
  }
  return { text, confidence: count === 0 ? 0 : sum / count };
}

/** The recogniser's dictionary: one character a line of the keys file, and a space last. */
export function dictionaryOf(keys: string): string[] {
  return [...keys.replaceAll('\r\n', '\n').split('\n'), ' '];
}

/**
 * Pieces read on one row are one line: pieces whose middles differ by less than half the mean
 * height of all pieces join the first such line, left to right, words separated by a space; the
 * lines are ordered top down. Pieces read with too little confidence are dropped first.
 */
export function groupLines(pieces: readonly TextLine[]): TextLine[] {
  const kept = pieces.filter((piece) => piece.confidence >= MIN_CONFIDENCE);
  if (kept.length === 0) return [];
  const meanHeight = kept.reduce((sum, p) => sum + (p.box.y1 - p.box.y0), 0) / kept.length;
  const middle = (piece: TextLine) => (piece.box.y0 + piece.box.y1) / 2;
  const rows: TextLine[][] = [];
  for (const piece of kept) {
    const row = rows.find((r) => r[0] && Math.abs(middle(r[0]) - middle(piece)) < meanHeight / 2);
    if (row) row.push(piece);
    else rows.push([piece]);
  }
  return rows
    .map((row) => row.sort((a, b) => a.box.x0 - b.box.x0))
    .sort((a, b) => (a[0]?.box.y0 ?? 0) - (b[0]?.box.y0 ?? 0))
    .map((row) => ({
      text: row.map((p) => p.text).join(' '),
      confidence: row.reduce((sum, p) => sum + p.confidence, 0) / row.length,
      box: {
        x0: Math.min(...row.map((p) => p.box.x0)),
        y0: Math.min(...row.map((p) => p.box.y0)),
        x1: Math.max(...row.map((p) => p.box.x1)),
        y1: Math.max(...row.map((p) => p.box.y1)),
      },
      ...(row.length > 1 ? { parts: row.map((p) => ({ box: p.box, length: p.text.length })) } : {}),
    }));
}
