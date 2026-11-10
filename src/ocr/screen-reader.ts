import sharp, { type Sharp } from 'sharp';
import {
  brightestStretched,
  imageFormat,
  movedLine,
  scaledBox,
  type Box,
  type TextLine,
} from '../domain/ocr/image.js';
import {
  boxedIn,
  crossesCut,
  cutKept,
  findDivider,
  paneShows,
  panesOf,
  screenAnchors,
  seamCut,
  showsGo,
  textCut,
  trimMargins,
  twoScreens,
  type PaneShows,
} from '../domain/ocr/panes.js';
import {
  cpRowToReadAgain,
  readScreenText,
  screenBody,
  STATUS_BAR,
  statusBandOf,
  withCpReadAgain,
  type CpRow,
  type ScreenText,
} from '../domain/ocr/raid-screen.js';
import { purpleShare } from '../domain/ocr/shadow.js';
import {
  countHeads,
  headBand,
  headTemplate,
  type HeadBand,
  type HeadCount,
  type HeadTemplate,
} from '../domain/ocr/tier-heads.js';
import type { ReadText } from './text-reader.js';

/**
 * Everything the reader saw on one screenshot: what it made of the text, the heads, the purple,
 * and the lines themselves (their boxes in the screenshot's pixels), so that a reading can be
 * judged later without the models. Plain data: it crosses from the reading process to the bot.
 * A pane of a split screen (plan 7P) is read as a screenshot of its own: its `width`, `height`
 * and boxes are the pane's.
 */
export interface ScreenReading {
  width: number;
  height: number;
  text: ScreenText;
  /** Where the heads were looked for, null without a countdown or CP. */
  band: HeadBand | null;
  heads: HeadCount | null;
  /** The share of shadow purple in the middle of the screen (`purpleShare`). */
  purple: number;
  lines: TextLine[];
  status: TextLine[];
  /** How long the reading took, in milliseconds. */
  ms: number;
  /** The most memory the reading process has used so far, in MB. */
  peakMb: number;
}

/** One pane of a split screen, read as a screenshot of its own (plan 7P). */
export interface PaneReading {
  /** 1 the top or left pane, 2 the bottom or right one. */
  index: number;
  of: number;
  /** Where the pane stands in the picture, in its pixels (its own margins trimmed). */
  box: Box;
  /** What the pane shows (`paneShows`): a raid's or a max battle's screen, or none. */
  shows: PaneShows;
  reading: ScreenReading;
}

/**
 * Everything read of one picture: the whole reading (always, as a single screen's), and the
 * panes when a cut was kept, by Android's divider or by the text (plan 7P).
 */
export interface PictureReading {
  /** The whole picture read as one screen, its flat margins trimmed. */
  reading: ScreenReading;
  /**
   * The panes, each read as a screenshot of its own, when a cut was kept: every pane shows one
   * screen or none, and one at least a screen (`cutKept`). Absent otherwise.
   */
  panes?: PaneReading[];
  /** How the kept cut was found. */
  cut?: 'divider' | 'text';
  /**
   * The whole reading shows two screens (`twoScreens`): without kept panes it cannot be used
   * (`two-screens`).
   */
  twoScreens: boolean;
  /**
   * A cut was found but its panes were not read for lack of time (`panesWithinMs`): the whole
   * reading is answered, as two screens when a divider or two screens' text cut it.
   */
  late?: true;
}

export interface PictureOptions {
  /** False: no divider is looked for (`ocr:check --no-divider`: the foldable's path). */
  divider?: boolean;
  /**
   * The time the panes must be read within, from the start (milliseconds): they are read only
   * when foreseen to end in it, by what the whole reading took for its pixels (`OcrService`
   * sets it under its timeout, which ends the reading process).
   */
  panesWithinMs?: number;
  /** The clock the time is judged by; for tests. */
  now?: () => number;
}

/** The screen is read this wide: as well as at full size or better, in half the time. */
export const READ_WIDTH = 720;
/**
 * A picture whose height is under this many times its width (wider than tall, or near square:
 * two panes side by side) is read whole at twice `READ_WIDTH`, so that each pane's text has its
 * usual size; so is one cut side by side by a divider into panes narrower than `NARROW_PANE` of it.
 * A pane of that shape is read with its contrast stretched (`paneReadSize`).
 */
const WIDE = 1.4;
const NARROW_PANE = 0.6;
/** The panes are foreseen to cost at least this share of the whole reading's time. */
const PANES_AT_LEAST = 0.8;
/**
 * A picture whose height is under this many times its width is of a foldable's shape (a Duo's
 * inner screen is 1.42), never an upright phone's (1.75 and more): one screen beside another
 * app is looked for by the seam between them.
 */
const FOLDABLE = 1.6;
/**
 * The status bar is read again twice as wide as a phone's screen (the picture's shorter side),
 * at most twice this: as the research read it for every phone up to 1080 pixels wide.
 */
const STATUS_WIDTH = 1080;
/** A screenshot with more pixels than this is refused (a phone's has 2.5 to 4 million). */
export const MAX_PIXELS = 16_000_000;
/** Height ÷ width of what is read: phones, folded or not, tablets, the split screens of samples. */
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 3;
/** The small greyscale copy the margins and the divider are looked for in: its longer side. */
const GREY_SIDE = 800;

/** PNG, JPEG and WebP by their first bytes: nothing else reaches the image library. */
export function isScreenshotFormat(bytes: Uint8Array): boolean {
  return imageFormat(bytes) !== undefined;
}

export class NotAnImageError extends Error {
  constructor() {
    super('not an image the reader can read');
    this.name = 'NotAnImageError';
  }
}

/** The whole picture read as one screen (`readPicture`'s `reading`). */
export async function readScreen(
  bytes: Uint8Array,
  readText: ReadText,
  template: HeadTemplate,
): Promise<ScreenReading> {
  return (await readPicture(bytes, readText, template)).reading;
}

/**
 * Reads a screenshot: the whole picture as one screen, as ever, and when Android's divider or
 * the text cuts it into two panes, each pane as a screenshot of its own; the panes are kept when
 * each shows one screen or none (plan 7P, design section "The rule that keeps single screens as
 * they are"). Throws `NotAnImageError` for anything that is not a PNG, JPEG or WebP of a
 * screen's proportions and at most `MAX_PIXELS`.
 */
export async function readPicture(
  bytes: Uint8Array,
  readText: ReadText,
  template: HeadTemplate,
  options: PictureOptions = {},
): Promise<PictureReading> {
  const started = performance.now();
  const now = options.now ?? (() => performance.now());
  const begun = now();
  const image = () => sharp(bytes, { limitInputPixels: MAX_PIXELS }).removeAlpha();
  if (!isScreenshotFormat(bytes)) throw new NotAnImageError();
  let width: number;
  let height: number;
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!metadata.width || !metadata.height) throw new NotAnImageError();
    width = metadata.width;
    height = metadata.height;
  } catch {
    throw new NotAnImageError();
  }
  const aspect = height / width;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new NotAnImageError();

  // The small greyscale copy: the margins, the divider, the seam of a text cut.
  const scale = Math.min(1, GREY_SIDE / Math.max(width, height));
  const greyWidth = Math.max(1, Math.round(width * scale));
  const greyHeight = Math.max(1, Math.round(height * scale));
  const greyData = await image()
    .greyscale()
    .resize(greyWidth, greyHeight, { fit: 'fill' })
    .raw()
    .toBuffer();
  const grey = { width: greyWidth, height: greyHeight, data: Float32Array.from(greyData) };
  const toPicture = (box: Box): Box => {
    const sx = width / greyWidth;
    const sy = height / greyHeight;
    return {
      x0: Math.max(0, Math.round(box.x0 * sx)),
      y0: Math.max(0, Math.round(box.y0 * sy)),
      x1: Math.min(width, Math.round(box.x1 * sx)),
      y1: Math.min(height, Math.round(box.y1 * sy)),
    };
  };
  const contentGrey = trimMargins(grey);
  const content = toPicture(contentGrey);
  const divider = options.divider === false ? null : findDivider(grey, contentGrey);

  // Read once, after the whole screen (as before 7P), and handed to every pane.
  let statusRead: Promise<TextLine[]> | undefined;
  const status = () => (statusRead ??= readStatus(image, width, height, readText));
  const band = statusBandOf({ width, height });
  const contentWidth = content.x1 - content.x0;
  const narrowPanes =
    divider?.axis === 'columns' &&
    divider.from - contentGrey.x0 < (contentGrey.x1 - contentGrey.x0) * NARROW_PANE &&
    contentGrey.x1 - divider.to < (contentGrey.x1 - contentGrey.x0) * NARROW_PANE;
  const wholeWidth =
    content.y1 - content.y0 < contentWidth * WIDE || narrowPanes ? 2 * READ_WIDTH : READ_WIDTH;
  const region = { image, readText, template, status, band, width, height };
  const wholeFrom = now();
  const whole = await readRegion(region, content, { width: wholeWidth }, true);
  const wholeMs = now() - wholeFrom;
  const wholeBody = screenBody(whole.lines, whole.status, bandIn(band, content), whole.width);
  const two = twoScreens(screenAnchors(wholeBody));

  // The cut: the divider's, or the text's (the whole reading's lines in the picture's pixels).
  let cutBy: PictureReading['cut'];
  let paneBoxes: [Box, Box] | undefined;
  const inPicture = wholeBody.map((line) =>
    movedLine(line, (one) => shifted(one, content.x0, content.y0)),
  );
  // A divider that text runs across is a band through one screen's words (review R4).
  if (divider && !crossesCut(inPicture, divider, greyWidth / width)) {
    cutBy = 'divider';
    paneBoxes = panesOf(contentGrey, divider);
  } else {
    // Two screens by the text; or, on a picture of a foldable's shape (wider than a phone's,
    // `FOLDABLE`), one screen beside something else (a map, a chat) where the picture changes.
    const cut = two
      ? textCut(inPicture, grey, greyWidth / width, contentGrey)
      : content.y1 - content.y0 < contentWidth * FOLDABLE && showsGo(screenAnchors(wholeBody))
        ? seamCut(inPicture, grey, greyWidth / width, contentGrey)
        : null;
    if (cut) {
      cutBy = 'text';
      paneBoxes = panesOf(contentGrey, cut);
    }
  }

  let panes: PaneReading[] | undefined;
  // Whether a divider or two screens' text cut the picture: without its panes its whole reading
  // may be a mix of both (review R1). A seam's cut of one screen beside another app may let the
  // whole reading stand.
  const cutApart = cutBy === 'divider' || two;
  let late = false;
  if (paneBoxes) {
    const boxes = paneBoxes.map((paneGrey) => {
      const box = toPicture(trimMargins(grey, paneGrey, true));
      return { paneGrey, box, size: paneReadSize(toPicture(paneGrey), box) };
    });
    // Read only when foreseen to end in time, by what the whole reading took for its pixels, at
    // least `PANES_AT_LEAST` of it (the recognizer's cost goes by the lines, which the panes
    // read again however small they are): the reading process is ended at its timeout, which no
    // pane may run into (review R2). A pane read enlarged counts its enlarged pixels.
    const pixels = (box: Box, size: ReadSize) => {
      const w = readWidthOf(box, size);
      return (w * ((box.y1 - box.y0) * w)) / Math.max(1, box.x1 - box.x0);
    };
    const panePixels = boxes.reduce((sum, { box, size }) => sum + pixels(box, size), 0);
    const share = Math.max(
      panePixels / Math.max(1, pixels(content, { width: wholeWidth })),
      PANES_AT_LEAST,
    );
    const foreseen = now() - begun + wholeMs * share;
    late = options.panesWithinMs !== undefined && foreseen > options.panesWithinMs;
    const read: PaneReading[] = [];
    for (const [i, { paneGrey, box, size }] of late ? [] : boxes.entries()) {
      if (box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) continue;
      // A pane that does not touch the picture's top has no status bar of its own. Each pane is
      // read as a phone's screenshot is (`READ_WIDTH`): its text has the size it has on a phone
      // (read at twice the width, Matt's splits lost three heads and gained nothing); a small GO
      // boxed in its pane is read enlarged, a pane near square stretched (`paneReadSize`).
      const reading = await readRegion(region, box, size, paneGrey.y0 === contentGrey.y0);
      const body = screenBody(
        reading.lines,
        reading.status,
        paneGrey.y0 === contentGrey.y0 ? bandIn(band, box) : 0,
        reading.width,
      );
      read.push({
        index: i + 1,
        of: paneBoxes.length,
        box,
        shows: paneShows(reading.text, screenAnchors(body)),
        reading,
      });
    }
    if (read.length === paneBoxes.length && cutKept(read.map((pane) => pane.shows))) panes = read;
  }

  const ms = Math.round(performance.now() - started);
  const peakMb = Math.round(process.resourceUsage().maxRSS / 1024);
  const timed = (reading: ScreenReading): ScreenReading => ({ ...reading, ms, peakMb });
  return {
    reading: timed(whole),
    ...(panes
      ? { panes: panes.map((pane) => ({ ...pane, reading: timed(pane.reading) })), cut: cutBy }
      : {}),
    twoScreens: two || (late && cutApart),
    ...(late ? { late: true as const } : {}),
  };
}

/**
 * How a screen is read: at most `width` wide, or, `enlarged`, exactly that wide, its contrast
 * stretched; `stretched`, at most that wide, its contrast stretched (`paneReadSize`).
 */
export interface ReadSize {
  width: number;
  enlarged?: true;
  stretched?: true;
}

/** The width `box` is read at by `size`. */
function readWidthOf(box: Box, size: ReadSize): number {
  return size.enlarged ? size.width : Math.min(box.x1 - box.x0, size.width);
}

/**
 * How a pane (`pane` in the picture's pixels, `box` its content, both in the picture's pixels) is
 * read: at most `READ_WIDTH` wide, as a phone's screenshot, unless it is a small GO boxed in its
 * pane (`boxedIn`) narrower than that. Such a GO draws its text smaller than a phone's (Matt's
 * splits: the gym's name 17 pixels tall in a box 664 wide, light on GO's light sky, read
 * "Histori htowi" or not at all), so it is read enlarged to its pane's width (at most twice
 * `READ_WIDTH`), as GO would fill it, with its contrast stretched (plan 7P-G). Any other pane
 * near square or wider (its content under `WIDE` times as tall as wide), which GO fills but
 * draws by its height as it draws a boxed-in one, is read at its usual size with its contrast
 * stretched (plan 7P-H: Matt's pane 1080 × 1212, the gym's name 26 pixels tall on GO's light sky,
 * read "Hollov unBr" or not at all; stretched, whole. Read larger, its text boxes moved the max
 * battles' heads' bands of Matt's other splits, which then lost heads).
 */
export function paneReadSize(pane: Box, box: Box): ReadSize {
  const width = box.x1 - box.x0;
  if (width < READ_WIDTH && boxedIn(pane, box))
    return { width: Math.min(pane.x1 - pane.x0, 2 * READ_WIDTH), enlarged: true };
  if (box.y1 - box.y0 < width * WIDE) return { width: READ_WIDTH, stretched: true };
  return { width: READ_WIDTH };
}

/**
 * How much the heads' band of `box` is enlarged before they are counted: as much as its text was
 * for a pane read enlarged (`paneReadSize`), smoothly by the image library, otherwise not at all.
 * A small GO's heads are 17 pixels tall on Matt's splits; counted at that size, blown up block by
 * block to the template's work size (`countHeads`), the two beside Sableye's light eyes scored
 * just under the row's threshold or just over it by a few pixels of the title's box (192's pane
 * read 3 heads, its fake without the divider 1); enlarged smoothly, 3 in both (plan 7P-G).
 */
export function headsScale(box: Box, size: ReadSize): number {
  return size.enlarged ? readWidthOf(box, size) / Math.max(1, box.x1 - box.x0) : 1;
}

/** The status band (`band`, in the picture's pixels) in the pixels of `box`: 0 below its top. */
function bandIn(band: number, box: Box): number {
  return Math.max(0, band - box.y0);
}

interface Region {
  image: () => Sharp;
  readText: ReadText;
  template: HeadTemplate;
  /** The status bar's lines, read once, in the picture's pixels. */
  status: () => Promise<TextLine[]>;
  /** How far down the picture's status bar reaches (`statusBandOf`). */
  band: number;
  width: number;
  height: number;
}

/**
 * The picture's status bar read again alone, enlarged: twice as wide as a phone's screen (the
 * shorter side, so that a landscape picture's is read as large as an upright one's), at most
 * twice `STATUS_WIDTH`, the strip `STATUS_BAR` of the longer side high (an upright phone's
 * height: a landscape picture's clock reaches below 4.5% of its height). Its boxes in the
 * picture's pixels.
 */
async function readStatus(
  image: () => Sharp,
  width: number,
  height: number,
  readText: ReadText,
): Promise<TextLine[]> {
  const barHeight = Math.min(height, Math.max(1, Math.round(Math.max(width, height) * STATUS_BAR)));
  const phone = Math.min(width, height);
  const scale = (2 * Math.min(phone, STATUS_WIDTH)) / phone;
  const barWidth = Math.round(width * scale);
  const barScaled = Math.max(1, Math.round(barHeight * scale));
  const bar = await image()
    .extract({ left: 0, top: 0, width, height: barHeight })
    .resize(barWidth, barScaled, { fit: 'fill' })
    .raw()
    .toBuffer();
  return (await readText({ width: barWidth, height: barScaled, data: bar })).map((line) =>
    movedLine(line, (box) => scaledBox(box, width / barWidth, barHeight / barScaled)),
  );
}

/** The box moved by `dx`, `dy`. */
function shifted(box: Box, dx: number, dy: number): Box {
  return { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy };
}

/**
 * One screen of the picture, `box` in its pixels, read as a screenshot of its own as `size` says
 * (`ReadSize`): its lines, the text, the heads, the purple, with the picture's status lines
 * moved into its pixels (the clock is the picture's), and the status band only when it touches
 * the picture's top (`touchesTop`). The heads and the purple are measured on the picture's own
 * pixels, never on the stretched ones (the heads' band enlarged as the text was, `headsScale`).
 */
async function readRegion(
  region: Region,
  box: Box,
  size: ReadSize,
  touchesTop: boolean,
): Promise<ScreenReading> {
  const { image, readText, template } = region;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const whole = width === region.width && height === region.height;
  const cropped = () =>
    whole ? image() : image().extract({ left: box.x0, top: box.y0, width, height });
  const smallWidth = readWidthOf(box, size);
  const smallHeight = Math.max(1, Math.round((height * smallWidth) / width));
  const small = await cropped().resize(smallWidth, smallHeight, { fit: 'fill' }).raw().toBuffer();
  const smallImage = { width: smallWidth, height: smallHeight, data: small };
  const raw = { width: smallWidth, height: smallHeight, channels: 3 as const };
  const readImage =
    size.enlarged || size.stretched
      ? { ...smallImage, data: await sharp(small, { raw }).normalise().raw().toBuffer() }
      : smallImage;
  const firstLines = (await readText(readImage)).map((line) =>
    movedLine(line, (one) => scaledBox(one, width / smallWidth, height / smallHeight)),
  );
  const status = (await region.status()).map((line) =>
    movedLine(line, (one) => shifted(one, -box.x0, -box.y0)),
  );
  const cpRow = cpRowToReadAgain(firstLines, { width, height });
  const lines = cpRow
    ? withCpReadAgain(firstLines, cpRow.box, await readCpRow(region, box, cpRow))
    : firstLines;
  const text = readScreenText(
    lines,
    status,
    { width, height },
    { statusBand: touchesTop ? bandIn(region.band, box) : 0 },
  );
  const band = headBand(text);
  let heads: HeadCount | null = null;
  if (band) {
    const top = Math.max(0, Math.round(band.top));
    const bottom = Math.min(height, Math.round(band.bottom));
    if (bottom - top > 1) {
      const scale = headsScale(box, size);
      const grey = image()
        .extract({ left: box.x0, top: box.y0 + top, width, height: bottom - top })
        .greyscale();
      const { data, info } = await (
        scale === 1
          ? grey
          : grey.resize(
              Math.max(1, Math.round(width * scale)),
              Math.max(1, Math.round((bottom - top) * scale)),
              { fit: 'fill' },
            )
      )
        .raw()
        .toBuffer({ resolveWithObject: true });
      heads = countHeads(
        { width: info.width, height: info.height, data: Float32Array.from(data) },
        band.unit * scale,
        template,
      );
    }
  }
  return {
    width,
    height,
    text,
    band,
    heads,
    purple: purpleShare(smallImage),
    lines,
    status,
    ms: 0,
    peakMb: 0,
  };
}

/**
 * The levels the CP's row read again is stretched from (`readCpRow`, `brightestStretched`): from
 * this grey up to white over every level, everything darker black.
 */
const CP_ROW_FROM = 192;

/**
 * The CP's row of a screen (`row`, `cpRowToReadAgain`, in the pixels of `box`, the screen in the
 * picture) read again alone, from the picture's own pixels, at `row.scale`, in grey: each
 * pixel's brightest channel, from `CP_ROW_FROM` up stretched over every level
 * (`brightestStretched`). GO draws the CP's digits white with a light grey edge, which on a
 * bright white sky the recognizer misses (production, 2026-11-10: a Zamazenta's 56867 read "367"
 * or not at all, read whole so; normalised instead, digits still lost); by the brightest channel
 * the Pokémon's blue spikes before a digit turn as light as the sky, not black (read by luminance
 * one screen lost its last digits, "569"). Its lines in the screen's pixels.
 */
async function readCpRow(region: Region, box: Box, row: CpRow): Promise<TextLine[]> {
  const width = Math.max(1, row.box.x1 - row.box.x0);
  const height = Math.max(1, row.box.y1 - row.box.y0);
  const readWidth = Math.max(1, Math.round(width * row.scale));
  const readHeight = Math.max(1, Math.round(height * row.scale));
  const data = await region
    .image()
    .extract({ left: box.x0 + row.box.x0, top: box.y0 + row.box.y0, width, height })
    .resize(readWidth, readHeight, { fit: 'fill' })
    .raw()
    .toBuffer();
  const stretched = brightestStretched({ width: readWidth, height: readHeight, data }, CP_ROW_FROM);
  return (await region.readText(stretched)).map((line) =>
    movedLine(line, (one) =>
      shifted(scaledBox(one, width / readWidth, height / readHeight), row.box.x0, row.box.y0),
    ),
  );
}

/** The head template from the game's icon file (`ic_raid_small.png`). */
export async function loadHeadTemplate(file: string): Promise<HeadTemplate> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return headTemplate({ width: info.width, height: info.height, data });
}
