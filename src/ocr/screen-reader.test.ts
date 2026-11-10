import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Box, RgbImage, TextLine } from '../domain/ocr/image.js';
import { headTemplate } from '../domain/ocr/tier-heads.js';
import {
  headsScale,
  isScreenshotFormat,
  NotAnImageError,
  paneReadSize,
  readPicture,
  readScreen,
} from './screen-reader.js';
import type { ReadText } from './text-reader.js';

/** A screenshot of one colour, as PNG. */
function screenshot(width: number, height: number, colour = { r: 30, g: 120, b: 60 }) {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .png()
    .toBuffer();
}

const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
  text,
  confidence: 0.9,
  box: { x0, y0, x1, y1 },
});

/** A reader that answers the whole screen with `screen` and the status bar with `bar`. */
function fakeReader(screen: TextLine[], bar: TextLine[]): ReadText & { sizes: string[] } {
  const sizes: string[] = [];
  const read = (image: RgbImage) => {
    sizes.push(`${image.width}x${image.height}`);
    expect(image.data).toHaveLength(image.width * image.height * 3);
    return Promise.resolve(sizes.length === 1 ? screen : bar);
  };
  return Object.assign(read, { sizes });
}

const TEMPLATE = headTemplate({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) });

describe('readScreen', () => {
  it('reads the screen at 720 wide and the status bar again at twice 1080 at most', async () => {
    // 1440 × 3200: read at 720 × 1600; the status bar, the top 144 rows, at 2160 × 216.
    const reader = fakeReader(
      [line('Big Fountain', 180, 140, 490, 175), line('0:42:17', 200, 800, 330, 830)],
      [line('9:41', 60, 30, 210, 120)],
    );
    const reading = await readScreen(await screenshot(1440, 3200), reader, TEMPLATE);
    expect(reader.sizes).toEqual(['720x1600', '2160x216']);
    expect(reading).toMatchObject({ width: 1440, height: 3200 });
    // Boxes come back in the screenshot's pixels.
    expect(reading.lines[1]?.box).toEqual({ x0: 400, y0: 1600, x1: 660, y1: 1660 });
    expect(reading.status[0]?.box).toEqual({ x0: 40, y0: 20, x1: 140, y1: 80 });
    expect(reading.text).toMatchObject({
      clock: { hour: 9, minute: 41 },
      gym: 'Big Fountain',
      countdown: 42 * 60 + 17,
    });
    // The heads were looked for under the countdown, and none were there.
    expect(reading.band).toEqual({ top: 1660, bottom: 1660 + 90 * 2.6, unit: 90 });
    expect(reading.heads?.count).toBe(0);
    expect(reading.purple).toBe(0);
  });

  it('reads a small screenshot as it is, and looks for no heads without a countdown or CP', async () => {
    const reader = fakeReader([], []);
    const reading = await readScreen(await screenshot(400, 900), reader, TEMPLATE);
    expect(reader.sizes).toEqual(['400x900', '800x82']);
    expect(reading).toMatchObject({ band: null, heads: null });
  });

  it('measures the purple of a shadow raid', async () => {
    const purple = await screenshot(400, 900, { r: 140, g: 40, b: 220 });
    expect((await readScreen(purple, fakeReader([], []), TEMPLATE)).purple).toBe(1);
  });

  it('refuses pictures no phone takes: too many pixels, or a strip', async () => {
    for (const [width, height] of [
      [4100, 4100],
      [720, 3000],
      [3000, 720],
    ] as const) {
      await expect(
        readScreen(await screenshot(width, height), fakeReader([], []), TEMPLATE),
      ).rejects.toBeInstanceOf(NotAnImageError);
    }
  });

  it('reads PNG, JPEG and WebP, and nothing else reaches the image library', async () => {
    const tiny = sharp({ create: { width: 400, height: 900, channels: 3, background: 'white' } });
    for (const bytes of [
      await tiny.clone().jpeg().toBuffer(),
      await tiny.clone().webp().toBuffer(),
    ]) {
      expect(isScreenshotFormat(bytes)).toBe(true);
      await expect(readScreen(bytes, fakeReader([], []), TEMPLATE)).resolves.toBeDefined();
    }
    const gif = await tiny.clone().gif().toBuffer();
    expect(isScreenshotFormat(gif)).toBe(false);
    await expect(readScreen(gif, fakeReader([], []), TEMPLATE)).rejects.toBeInstanceOf(
      NotAnImageError,
    );
  });

  it('reads a picture wider than tall, or near square, at twice the width', async () => {
    const reader = fakeReader([], []);
    await readScreen(await screenshot(1800, 2100), reader, TEMPLATE);
    expect(reader.sizes[0]).toBe('1440x1680');
  });

  it('reads a tall picture cut side by side by a grey spine at twice the width (a Duo)', async () => {
    // 1600 × 2272 (1.42, as a Duo's 2007 × 2853): panes of a picture each, a grey-60 spine of
    // 10 columns between them. Read whole at 1440, not at 720 as an upright phone is.
    const [width, height] = [1600, 2272];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x >= 795 && x < 805 ? 60 : 60 + ((x * 7 + y * 13) % 140);
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const duo = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const reader = fakeReader([], []);
    await readScreen(duo, reader, TEMPLATE);
    expect(reader.sizes[0]).toBe('1440x2045');
  });

  it('cuts a wide picture at a seam only when its text shows something only GO shows', async () => {
    // Two pictures side by side, 1600 × 1600: no divider, a strong seam in the middle.
    const [width, height] = [1600, 1600];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x < 800 ? 150 + ((x + y) % 60) : 30 + ((x * 3 + y * 5) % 40);
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const wide = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    // A chat and a notes page: no anchor only GO shows.
    const apps = inOrder(
      [line('Notes', 1000, 100, 1200, 140), line('0:32:10 left', 100, 600, 400, 640)],
      [],
    );
    await readPicture(wide, apps, TEMPLATE);
    expect(apps.sizes).toHaveLength(2);
    // GO's BATTLE button on the right: the seam is tried, the panes read.
    const go = inOrder([line('BATTLE', 1100, 1200, 1300, 1240)], []);
    await readPicture(wide, go, TEMPLATE);
    expect(go.sizes).toHaveLength(4);
  });

  it('tries the seam on a foldable’s tall picture too (a Duo beside a chat, no spine found)', async () => {
    // 1000 × 1420 (1.42): read whole at 720 as a phone is, yet two pictures side by side.
    const [width, height] = [1000, 1420];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x < 500 ? 150 + ((x + y) % 60) : 30 + ((x * 3 + y * 5) % 40);
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const duo = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const go = inOrder([line('BATTLE', 120, 1000, 300, 1030)], []);
    await readPicture(duo, go, TEMPLATE);
    expect(go.sizes[0]).toBe('720x1022');
    expect(go.sizes).toHaveLength(4);
  });

  it('reads a landscape picture’s status bar as tall as an upright one’s, at twice its size', async () => {
    // 2448 × 1080: the bar is 4.5% of the longer side, 110 rows, read at twice the size.
    const reader = fakeReader([], []);
    await readScreen(await screenshot(2448, 1080), reader, TEMPLATE);
    expect(reader.sizes).toEqual(['1440x635', '4896x220']);
  });

  it('refuses what is not a picture', async () => {
    await expect(
      readPicture(new TextEncoder().encode('no'), fakeReader([], []), TEMPLATE),
    ).rejects.toBeInstanceOf(NotAnImageError);
  });
});

/**
 * A screenshot 400 × 900 split by Android's divider: grey 20 from row 440 to 451, a picture
 * (two colours) on either side.
 */
function splitScreenshot() {
  const band = {
    create: { width: 400, height: 11, channels: 3 as const, background: { r: 20, g: 20, b: 20 } },
  };
  return sharp({
    create: { width: 400, height: 900, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .composite([
      {
        input: {
          create: { width: 400, height: 449, channels: 3, background: { r: 200, g: 90, b: 160 } },
        },
        left: 0,
        top: 451,
      },
      { input: band, left: 0, top: 440 },
    ])
    .png()
    .toBuffer();
}

/** A reader that answers the calls in order: the whole screen, the status bar, then each pane. */
function inOrder(...answers: TextLine[][]): ReadText & { sizes: string[] } {
  const sizes: string[] = [];
  const read = (image: RgbImage) => {
    sizes.push(`${image.width}x${image.height}`);
    return Promise.resolve(answers[sizes.length - 1] ?? []);
  };
  return Object.assign(read, { sizes });
}

/** The whole split read: a max battle's title on top and a raid's CP under it. */
const WHOLE_SPLIT = [
  line('Dynamax Machop', 60, 300, 340, 330),
  line('PRIVATE GROUP', 120, 400, 280, 412),
  line('CP 12345', 100, 560, 300, 610),
  line('PRIVATE GROUP', 120, 850, 280, 862),
];
const TOP_PANE = [line('Dynamax Machop', 60, 300, 340, 330), line('GAZEBO', 120, 340, 280, 360)];
/** The bottom pane, in its own pixels: a two-part time at its top (no clock: no status bar). */
const BOTTOM_PANE = [
  line('9:58', 20, 2, 80, 16),
  line('Big Fountain', 120, 30, 330, 50),
  line('CP 12345', 100, 110, 300, 160),
  line('0:20:00', 300, 300, 370, 320),
];

describe('readPicture', () => {
  it('reads each pane of a split as a screenshot of its own, the clock handed down', async () => {
    const reader = inOrder(WHOLE_SPLIT, [line('9:41', 20, 4, 90, 30)], TOP_PANE, BOTTOM_PANE);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
    expect(picture).toMatchObject({ cut: 'divider', twoScreens: true });
    const [top, bottom] = picture.panes ?? [];
    // The divider's rows, as the small copy finds them: about 440 to 451.
    const below = bottom?.box.y0 ?? 0;
    expect(below).toBeGreaterThanOrEqual(449);
    expect(below).toBeLessThanOrEqual(452);
    expect(reader.sizes.slice(2)).toEqual(['400x440', `400x${900 - below}`]);
    expect(top).toMatchObject({ index: 1, of: 2, shows: 'max', box: { y0: 0, y1: 440 } });
    expect(bottom).toMatchObject({ index: 2, of: 2, shows: 'raid', box: { y1: 900 } });
    expect(top?.reading.text.clock).toMatchObject({ hour: 9, minute: 41 });
    expect(bottom?.reading.text).toMatchObject({ clock: { hour: 9, minute: 41 }, cp: 12345 });
  });

  /** A reader in order whose clock moves by `ms` while it reads the whole picture. */
  const timed = (clock: { now: number }, ms: number, ...answers: TextLine[][]) => {
    const reader = inOrder(...answers);
    const read: ReadText = (image) => {
      if (reader.sizes.length === 0) clock.now += ms;
      return reader(image);
    };
    return Object.assign(read, { sizes: reader.sizes });
  };

  it('refuses as two screens a split whose panes it had no time to read (review R1)', async () => {
    // The whole reading shows one screen only, yet a divider cut the picture: without its
    // panes it may be a mix of both, so it is two screens it could not tell apart.
    const clock = { now: 0 };
    const one = [line('Dynamax Machop', 60, 300, 340, 330), line('GAZEBO', 120, 340, 280, 360)];
    const reader = timed(clock, 9_000, one, [], TOP_PANE, BOTTOM_PANE);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE, {
      panesWithinMs: 10_000,
      now: () => clock.now,
    });
    expect(picture).toEqual({
      reading: expect.anything() as unknown,
      twoScreens: true,
      late: true,
    });
    expect(reader.sizes).toHaveLength(2);
  });

  it('reads the panes only when they are foreseen to end within the budget (review R2)', async () => {
    // The whole reading took 3 s of 10: the panes, as many pixels again, would end at about 6.
    const soon = { now: 0 };
    const fits = timed(soon, 3_000, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const read = await readPicture(await splitScreenshot(), fits, TEMPLATE, {
      panesWithinMs: 10_000,
      now: () => soon.now,
    });
    expect(read.panes).toHaveLength(2);
    // It took 6 s of 10: the panes would end past the budget, so none is begun.
    const slow = { now: 0 };
    const late = timed(slow, 6_000, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const skipped = await readPicture(await splitScreenshot(), late, TEMPLATE, {
      panesWithinMs: 10_000,
      now: () => slow.now,
    });
    expect(skipped).toMatchObject({ twoScreens: true, late: true });
    expect(late.sizes).toHaveLength(2);
  });

  it('foresees the panes as costing at least 0.8 of the whole reading, by its lines', async () => {
    // A split of two small pillarboxed screens (GO in x 150 to 250 of each pane, a status bar
    // across the top): the panes have a quarter of the whole reading's pixels, but the
    // recognizer reads as many lines again. With 5.5 s of the 10 s timeout gone on the whole
    // reading, they would end past the budget (8.5 s), so none is begun.
    const [width, height] = [400, 900];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const go = x >= 150 && x < 250;
        const value =
          y < 30 ? 230 : y >= 440 && y < 451 ? 20 : go ? 60 + ((x * 7 + y * 13) % 140) : 0;
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const split = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const clock = { now: 0 };
    const reader = timed(clock, 5_500, WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const picture = await readPicture(split, reader, TEMPLATE, {
      panesWithinMs: 8_500,
      now: () => clock.now,
    });
    expect(picture).toMatchObject({ late: true, twoScreens: true });
    expect(reader.sizes).toHaveLength(2);
  });

  it('reads a small GO boxed in its pane enlarged to the pane’s width, its contrast stretched', async () => {
    // 400 × 900 split at rows 440 to 451; the bottom pane shows GO boxed in black margins left
    // and right (x 100 to 300), dim (greys 100 to 150): its tiny gym line read at the pane's
    // width, 400, not at its own 200 (plan 7P-G: Matt's 664 of 1080 lost the gym's name).
    const [width, height] = [400, 900];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const top = 60 + ((x * 7 + y * 13) % 140);
        const go = x >= 100 && x < 300 ? 100 + ((x * 3 + y * 5) % 51) : 0;
        const value = y >= 440 && y < 451 ? 20 : y < 440 ? top : go;
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const split = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const ranges: { low: number; high: number }[] = [];
    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const read: ReadText = (image) => {
      let [low, high] = [255, 0];
      for (const value of image.data) [low, high] = [Math.min(low, value), Math.max(high, value)];
      ranges.push({ low, high });
      return reader(image);
    };
    const picture = await readPicture(split, read, TEMPLATE);
    const bottom = picture.panes?.[1];
    expect(bottom?.box).toMatchObject({ x0: 100, x1: 300 });
    const tall = (box?: Box) => (box?.y1 ?? 0) - (box?.y0 ?? 0);
    // The top pane fills its width: read as it is, as before.
    expect(reader.sizes.slice(2)).toEqual([
      `400x${tall(picture.panes?.[0]?.box)}`,
      `400x${tall(bottom?.box) * 2}`,
    ]);
    // The boxed-in pane is stretched, its greys 100 to 150 spread over nearly all levels (the
    // top one, near square, is stretched too, at its own size: plan 7P-H).
    expect(ranges[3]?.high).toBe(255);
    expect(ranges[3]?.low).toBeLessThan(20);
    // Its lines come back in the pane's own pixels.
    expect(bottom?.reading.lines.find((l) => l.text === 'Big Fountain')?.box).toEqual({
      x0: 60,
      y0: 15,
      x1: 165,
      y1: 25,
    });
  });

  it('stretches the contrast of a pane near square, which GO draws by its height (plan 7P-H)', async () => {
    // 400 × 1150 split at rows 440 to 451, both panes dim (greys 100 to 150). The top pane,
    // 400 × 440, is near square: GO fills its width but draws its header by its height, small
    // and light on its light sky (Matt's split of 2026-11-05: the gym's name 26 pixels tall in a
    // pane 1080 × 1212, read "Hollov unBr"). Read at its size as before, its contrast stretched;
    // the bottom pane, 400 × 699, is a phone’s shape and read as it is.
    const [width, height] = [400, 1150];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = y >= 440 && y < 451 ? 20 : 100 + ((x * 3 + y * 5) % 51);
        data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    const split = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const ranges: { low: number; high: number }[] = [];
    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const read: ReadText = (image) => {
      let [low, high] = [255, 0];
      for (const value of image.data) [low, high] = [Math.min(low, value), Math.max(high, value)];
      ranges.push({ low, high });
      return reader(image);
    };
    const picture = await readPicture(split, read, TEMPLATE);
    expect(picture.panes).toHaveLength(2);
    const tall = (box?: Box) => (box?.y1 ?? 0) - (box?.y0 ?? 0);
    expect(reader.sizes.slice(2)).toEqual([
      `400x${tall(picture.panes?.[0]?.box)}`,
      `400x${tall(picture.panes?.[1]?.box)}`,
    ]);
    // The top pane's greys 100 to 150 spread over nearly all levels; the bottom keeps its own.
    expect(ranges[2]?.high).toBeGreaterThan(230);
    expect(ranges[2]?.low).toBeLessThan(20);
    expect(ranges[3]?.high).toBe(150);
    // Its heads are counted on the picture's own pixels, as before.
    const top = picture.panes?.[0]?.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
    expect(headsScale(top, paneReadSize(top, top))).toBe(1);
  });

  it('reads a CP on a bright sky again, its row alone, the brightest levels stretched', async () => {
    // Production, 2026-11-10: a Zamazenta's CP white on a bright white sky, read "367" far right
    // of a "CP" read alone. 1440 × 3200, greys 192 to 255: read at 720 × 1600, the "CP" there 35
    // pixels tall (70 in the picture). Its row, from 185 to the edge and from 406 to 641, is read
    // again at 50 pixels a letter, its greys from 192 up stretched over every level.
    const [width, height] = [1440, 3200];
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++)
        data.fill(192 + (x % 64), (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
    const bright = await sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const whole = [
      line('Maple Grove', 140, 80, 380, 110),
      line('367', 320, 230, 460, 315),
      line('CP', 110, 280, 160, 315),
      line('Zan enta', 65, 320, 490, 400),
      line('0:07:59', 430, 710, 510, 735),
    ];
    // The row read again, in its own pixels: 1255 × 235 at 50 / 70.
    const reader = inOrder(whole, [], [line('CP 56867', 22, 10, 520, 120)]);
    const ranges: { low: number; high: number }[] = [];
    const read: ReadText = (image) => {
      let [low, high] = [255, 0];
      for (const value of image.data) [low, high] = [Math.min(low, value), Math.max(high, value)];
      ranges.push({ low, high });
      return reader(image);
    };
    const reading = await readScreen(bright, read, TEMPLATE);
    expect(reader.sizes).toEqual(['720x1600', '2160x216', '896x168']);
    expect(ranges[0]?.low).toBe(192);
    expect(ranges[2]?.low).toBeLessThan(10);
    expect(ranges[2]?.high).toBeGreaterThan(250);
    expect(reading.text).toMatchObject({ cp: 56867, bossName: 'Zan enta' });
    expect(reading.lines.map((one) => one.text)).toEqual([
      'Maple Grove',
      'Zan enta',
      '0:07:59',
      'CP 56867',
    ]);
  });

  it('counts a boxed-in pane’s heads enlarged as its text was read, smoothly', () => {
    // Matt's 192 and its fake without the divider: GO 664 or 665 wide read at 1080. Its heads,
    // 17 pixels tall, counted at their own size (blown up block by block to the template's work
    // size) read 3 in one and 1 in the other by a few pixels of the title's box; enlarged as the
    // text was, 3 in both, however the band's edges and its unit moved.
    const pane = { x0: 0, y0: 1753, x1: 1080, y1: 2422 };
    const box = { x0: 209, y0: 1753, x1: 874, y1: 2422 };
    expect(headsScale(box, paneReadSize(pane, box))).toBeCloseTo(1080 / 665, 6);
    // Every other screen's heads are counted at the picture's own size, as before.
    expect(headsScale(pane, paneReadSize(pane, pane))).toBe(1);
    const phone = { x0: 0, y0: 0, x1: 1440, y1: 3200 };
    expect(headsScale(phone, { width: 720 })).toBe(1);
  });

  it('cuts no picture at a divider that text runs across (review R4)', async () => {
    // One screen with a dark band through its words: the band is no divider.
    const across = [line('Big Fountain Plaza of the Old Town', 20, 430, 380, 460)];
    const reader = inOrder(across, []);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
    expect(picture.panes).toBeUndefined();
    expect(reader.sizes).toHaveLength(2);
  });

  it('takes no time at the top of a pane under another for the clock', async () => {
    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, BOTTOM_PANE);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
    expect(picture.panes?.[1]?.reading.text.clock).toBeNull();
  });

  it('keeps the whole reading when a pane shows something that is no screen', async () => {
    // The bottom pane shows a button and nothing else of a screen: the cut went wrong.
    const reader = inOrder(WHOLE_SPLIT, [], TOP_PANE, [line('PRIVATE GROUP', 120, 400, 280, 412)]);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE);
    expect(picture).toMatchObject({ twoScreens: true });
    expect(picture.panes).toBeUndefined();
  });

  // Review of the exact-name rule (2026-11-10): GO's window there is narrower than the picture.
  it('measures no room after the gym name of a whole reading whose cut was not kept', async () => {
    const name = line('Big Fountain', 120, 60, 230, 80);
    const cut = inOrder([name, ...WHOLE_SPLIT], [], TOP_PANE, [
      line('PRIVATE GROUP', 120, 400, 280, 412),
    ]);
    const kept = await readPicture(await splitScreenshot(), cut, TEMPLATE);
    expect(kept.panes).toBeUndefined();
    expect(kept.reading.text).toMatchObject({ gym: 'Big Fountain', gymRoom: null });
    // The same picture with no cut looked for: one screen, its room measured.
    const one = await readPicture(await splitScreenshot(), inOrder([name], []), TEMPLATE, {
      divider: false,
    });
    expect(one.reading.text.gymRoom).toBeGreaterThan(0);
  });

  it('looks for no divider when told not to, and finds no cut in the text of one screen', async () => {
    const one = [line('Big Fountain', 120, 30, 330, 50), line('CP 12345', 100, 110, 300, 160)];
    const reader = inOrder(one, []);
    const picture = await readPicture(await splitScreenshot(), reader, TEMPLATE, {
      divider: false,
    });
    expect(picture).toEqual({ reading: expect.anything() as unknown, twoScreens: false });
    expect(reader.sizes).toHaveLength(2);
  });
});

describe('readScreen, what is not an image', () => {
  it('refuses what is not a picture', async () => {
    const bytes = new TextEncoder().encode('not a picture at all');
    await expect(readScreen(bytes, fakeReader([], []), TEMPLATE)).rejects.toBeInstanceOf(
      NotAnImageError,
    );
  });
});
