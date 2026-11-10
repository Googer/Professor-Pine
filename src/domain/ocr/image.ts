/** A picture as 8-bit RGB, three bytes a pixel, row by row. */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A picture with one value a pixel (grey, a probability, an alpha), row by row. */
export interface GreyImage {
  width: number;
  height: number;
  data: Float32Array;
}

/** An axis-aligned box in pixels: `x0`, `y0` inside, `x1`, `y1` just outside. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A line of text the reader found, with where it stands and how sure the model was (0 to 1). */
export interface TextLine {
  text: string;
  confidence: number;
  box: Box;
  /**
   * The pieces a row was joined from, when more than one (`groupLines`), left to right: each
   * one's box and how many characters of `text` it gave (a space between two). Two panes side by
   * side are read into one line per row; the pieces tell them apart (plan 7P).
   */
  parts?: { box: Box; length: number }[];
}

/** The line with its box, and its parts' boxes, moved by `move`. */
export function movedLine(line: TextLine, move: (box: Box) => Box): TextLine {
  return {
    ...line,
    box: move(line.box),
    ...(line.parts ? { parts: line.parts.map((part) => ({ ...part, box: move(part.box) })) } : {}),
  };
}

export const boxHeight = (box: Box): number => box.y1 - box.y0;
export const boxWidth = (box: Box): number => box.x1 - box.x0;

/** The box in another scale: x by `sx`, y by `sy`. */
export function scaledBox(box: Box, sx: number, sy: number): Box {
  return { x0: box.x0 * sx, y0: box.y0 * sy, x1: box.x1 * sx, y1: box.y1 * sy };
}

/**
 * The picture in grey: each pixel's brightest channel, from `from` up stretched over every level
 * (darker black). What is white or light grey keeps its difference, stretched; a colour as bright
 * in any channel (a blue Pokémon, a light blue sky) becomes as light as white (`readCpRow`: GO's
 * white digits with a light grey edge on a bright sky, a Pokémon's spikes before them).
 */
export function brightestStretched(image: RgbImage, from: number): RgbImage {
  const data = new Uint8Array(image.data.length);
  const gain = 255 / (255 - from);
  for (let k = 0; k + 2 < image.data.length; k += 3) {
    const brightest = Math.max(image.data[k] ?? 0, image.data[k + 1] ?? 0, image.data[k + 2] ?? 0);
    const value = Math.max(0, Math.min(255, Math.round((brightest - from) * gain)));
    data[k] = data[k + 1] = data[k + 2] = value;
  }
  return { width: image.width, height: image.height, data };
}

/** The kinds of picture the reader reads, by the file extension each is kept under. */
export type ImageFormat = 'png' | 'jpg' | 'webp';

/** PNG, JPEG or WebP by the first bytes; undefined for anything else. */
export function imageFormat(bytes: Uint8Array): ImageFormat | undefined {
  const starts = (offset: number, ...values: number[]) =>
    values.every((value, i) => bytes[offset + i] === value);
  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return undefined;
}
