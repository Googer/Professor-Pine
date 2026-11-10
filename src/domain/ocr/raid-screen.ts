import { boxHeight, boxWidth, type Box, type TextLine } from './image.js';

/**
 * What the text of a raid screen says, read from the lines the reader found and their boxes,
 * without assuming a layout: the research found these rules on screenshots of three phones,
 * split screens included (`docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`).
 */
export interface ScreenText {
  /**
   * The phone's clock: the first h:mm in the status bar, as shown (12- or 24-hour), with the
   * reader's confidence (0 to 1) of the line it stands in.
   */
  clock: { hour: number; minute: number; confidence?: number } | null;
  /** The countdown h:mm:ss, in seconds: until the hatch of an egg, the end of a hatched raid. */
  countdown: number | null;
  /** The gym's name as read: the tallest text near the top and the lines under it. */
  gym: string | null;
  /**
   * The line just under the name as read, when it was not taken into it: a name's second line
   * read together with other text (the caption of the gym's picture, "AMBASSADOR PROGRAM …
   * Outgoing"; Matt, 2026-10-24), which the gym search may narrow by (`gymOfText`).
   */
  gymBelow?: string;
  /**
   * How many characters, at its own average width, would still fit after the end of the name's
   * last line before `NAME_END`, where a name may run: GO cuts a name only when its next
   * word does not fit (Matt, 2026-11-10), so the gym search tells by it whether a longer name
   * that begins with the one read may have been cut (`gymOfText`). Null without a name, and in a
   * pane of a split or on a screen of a foldable's shape (`UPRIGHT`) or whose cut was not kept,
   * whose limits cannot be trusted; absent in records read before it was kept.
   */
  gymRoom?: number | null;
  /** The "Elite raid gym" badge stands near the top. */
  eliteBadge: boolean;
  /** The boss's CP, on a hatched raid. */
  cp: number | null;
  /** The text under the CP: the boss's name, as far as the boss does not hide it. */
  bossName: string | null;
  /** Where the countdown and the CP stand: the tier heads are looked for beside them. */
  countdownBox: Box | null;
  /**
   * Where the countdown stands across the screen: centred under an egg, at the right of a
   * hatched raid (the research's samples: the middle at 0.50 and 0.83 of the width).
   */
  countdownPlace: 'centre' | 'right' | null;
  cpBox: Box | null;
  /**
   * Where a "CP" read alone stands (`cpLettersOf`) when no CP was read: the heads stand above
   * its digits all the same (`headBand`). Absent otherwise.
   */
  cpLetters?: Box;
  /** What a max battle's screen says, null on any other (absent in records read before it). */
  max?: MaxText | null;
}

/** The label of a max battle's boss line. */
export type MaxForm = 'dynamax' | 'gigantamax' | 'eternamax';

/** A max battle's screen: the boss's line ("Dynamax Sneasel") and the Power Spot's under it. */
export interface MaxText {
  /**
   * `eternamax`: Eternatus's screen says "Eternamax", a Gigantamax battle in everything but the
   * label (design `2026-10-22-max-battle-screenshots-design.md`, section 4).
   */
  form: MaxForm;
  /** The boss's name as read, without "Dynamax", "Gigantamax" or "Eternamax". */
  species: string;
  /** The Power Spot's name as read (the game shows it in capitals). */
  powerSpot: string | null;
  /**
   * The reader's confidence (0 to 1) of the Power Spot's own line; null without one (absent in
   * records read before it was kept: taken as not sure).
   */
  spotConfidence: number | null;
  /** The boss's line: the heads stand just above it. */
  box: Box;
}

/** The status bar: what starts in the top 4.5% of the screen. */
export const STATUS_BAR = 0.045;
/** The gym's name stands in the top fifth. */
const TOP = 0.2;
/**
 * The gym's name starts right of its picture, at least this many of its lines' heights from the
 * left edge (3.3 to 4.6 on the samples); text read from the picture starts within it (1.7, 2.2).
 */
const PICTURE_EDGE = 3;
/**
 * How a word of a gym's name starts: a capital and a small letter, or a digit. What a sign or a
 * plaque on the picture is read as does not (`HILL SQUIRREL`, `WOES`, `HEINZ`, `od` on the
 * samples), and the light of a hatching egg can stretch a name's box over the picture.
 */
const NAME_WORD = /^(?:[A-Z][a-z]|\d)/;
/**
 * GO's round gym-info button stands at the top right, beside the name's second line on an iPhone
 * (production, 2026-11-10: read as "og", "ogy", a piece of the name's line from 0.877 of the width
 * on, half as tall as the name's letters). A line's last piece that starts right of this share of
 * the width and is under `BUTTON_HEIGHT` of the tallest of its other pieces is the button.
 */
const BUTTON_PLACE = 0.85;
const BUTTON_HEIGHT = 0.7;
/**
 * How far a gym's name is taken to run at most (`ScreenText.gymRoom`), a share of the width: the
 * cautious end of GO's layouts. Lines of names end as far as 0.82 on 2020s screens, but a 2019
 * Android screen ended "Catahecassa Blackhoof War Chief" at 0.75 and wrapped " of" out of sight,
 * which would have ended at 0.81 (`matt-2026-10-21`; its ">" button stands from 0.84).
 */
const NAME_END = 0.8;
/**
 * A screen under this many times as tall as wide has a foldable's shape (`FOLDABLE` of
 * `screen-reader.ts`), never an upright phone's: GO's window may be narrower than it, so no room
 * after the gym's name is measured (`ScreenText.gymRoom`).
 */
const UPRIGHT = 1.6;
/** The CP is the tallest text on a hatched raid: taller than this share of the screen. */
const CP_MIN_HEIGHT = 0.04;
/**
 * A max battle's boss line: "Dynamax", "Gigantamax" or "Eternamax" and the species, in large
 * letters (the space may be lost; an older screen puts the species on the next line).
 */
const MAX_BOSS = /^(dynamax|gigantamax|eternamax)\s*(\S.*)?$/i;
/** The boss's line is 0.023 (in a split screen's half) to 0.05 of the screen's height. */
const MAX_BOSS_MIN_HEIGHT = 0.018;

/** A word that starts with a time: up to two other characters (a symbol, 上午), h:mm or h.mm. */
const CLOCK_WORD = /^\D{0,2}([01]?\d|2[0-3])([:.])([0-5]\d)(.*)$/;
/**
 * What may not follow the minutes in the word: a digit, a unit of speed or a percent sign
 * (`1.25K/s`, `0.5MB/s`, `12.5%`). Anything else may: the clock runs into the icons beside it
 * when read (`1:29C`, `1:37四四四` on the research's samples).
 */
const NOT_A_CLOCK = /^(?:\d|[KMGkmg]?[Bb]?\/s|%)/;
/** A dotted time followed by a dot is a date (`14.10.`). */
const DATE_END = /^\./;
/** A dotted time whose next word is a unit of speed is a speed read apart from it (`1.25 K/s`). */
const SPEED_UNIT = /^[KMGkmg]?[Bb]?\/s/;
/** The middle of an egg's countdown is within this share of the width from the screen's. */
const CENTRED = 0.1;
/** The middle of a hatched raid's countdown is right of this share of the width. */
const AT_THE_RIGHT = 0.65;
const COUNTDOWN = /(\d{1,2})[:.]([0-5]\d)[:.]([0-5]\d)/;
/**
 * The CP's digits, after at most three other characters: "CP", or what the icon beside it and a
 * faint "CP" are read as (`Ocp16997`, `O53394`, `c45435`, `ce41758` on members' screenshots).
 */
const CP = /^\D{0,3}?(\d{3,6})$/;
const BOSS_NAME = /^[A-Za-z][A-Za-z.'\- ]{2,}$/;
/** The letters "CP" read alone, without the digits GO draws right after them. */
const CP_LETTERS = /^\W{0,2}CP\W{0,2}$/;
/** A raid's "CP" stands in the screen's top half, at least this share of its height tall. */
const CP_LETTERS_MIN_HEIGHT = 0.015;
/** GO draws the CP's digits this many times as tall as its "CP", their feet on one line. */
export const CP_DIGITS = 2.3;
/**
 * The CP's row read again (`cpRowToReadAgain`) at the size where its "CP" is this many pixels
 * tall: a little larger than a phone's screenshot read at `READ_WIDTH` shows it (71 pixels of
 * 1125 at 720 is 45); of 40 to 56 tried on the production screens of 2026-11-10, 50 read the CP
 * the boss half hides most often.
 */
const CP_LETTERS_READ = 50;
const LETTERS = /[a-z]{2}/i;
/** The badge of an elite raid gym, or of an EX raid gym as older screens show it ("… RAID GYM"). */
const ELITE = /elite\s*raid|\bex\s*raid|raid\s*gym/i;

/** Whether a line near the top starts on the gym's picture. */
function onPicture(line: TextLine): boolean {
  return line.box.x0 < boxHeight(line.box) * PICTURE_EDGE;
}

/**
 * A line near the top without the words at its start that were read off the gym's picture (a
 * sign or a plaque on it, read into the name beside it): those left of `column`, where the name
 * starts, each character taken to be as wide as the line's average, that do not start as a
 * name's words do; null when every word is such.
 */
function besidePicture(line: TextLine, column: number): TextLine | null {
  const perCharacter = (line.box.x1 - line.box.x0) / line.text.length;
  const words = [...line.text.matchAll(/\S+/g)];
  const start = words.findIndex(
    (word) => line.box.x0 + word.index * perCharacter >= column || NAME_WORD.test(word[0]),
  );
  const first = words[start];
  if (!first) return null;
  return {
    ...line,
    text: words
      .slice(start)
      .map((word) => word[0])
      .join(' '),
    box: { ...line.box, x0: line.box.x0 + first.index * perCharacter },
  };
}

/**
 * A line near the top without GO's gym-info button read into it as its last piece
 * (`BUTTON_PLACE`), on a screen `width` wide; the line itself when it has none. It keeps the
 * row's average confidence: the pieces have none of their own, and the gym's name uses none.
 */
function withoutInfoButton(line: TextLine, width: number): TextLine {
  const parts = line.parts;
  const last = parts?.at(-1);
  if (!parts || !last) return line;
  const rest = parts.slice(0, -1);
  const tallest = Math.max(...rest.map((part) => boxHeight(part.box)));
  if (last.box.x0 < width * BUTTON_PLACE || boxHeight(last.box) >= tallest * BUTTON_HEIGHT) {
    return line;
  }
  return {
    confidence: line.confidence,
    text: line.text.slice(0, Math.max(0, line.text.length - last.length - 1)),
    box: {
      x0: Math.min(...rest.map((part) => part.box.x0)),
      y0: Math.min(...rest.map((part) => part.box.y0)),
      x1: Math.max(...rest.map((part) => part.box.x1)),
      y1: Math.max(...rest.map((part) => part.box.y1)),
    },
    ...(rest.length > 1 ? { parts: rest } : {}),
  };
}

/** The lines that stand in the status bar of a screen of this height. */
export function statusLines(lines: readonly TextLine[], height: number): TextLine[] {
  return linesInBand(lines, height * STATUS_BAR, height * STATUS_BOTTOM);
}

/** A status bar's lines start in its band and end within this share of the screen. */
const STATUS_BOTTOM = 0.07;

/** The lines that start above `band` and end above `bottom`. */
function linesInBand(lines: readonly TextLine[], band: number, bottom: number): TextLine[] {
  return lines.filter((l) => l.box.y0 < band && l.box.y1 < bottom);
}

/**
 * The lines of a screen but its status bar's (`statusBarOf`; `status`, `band` and `width` as
 * `readScreenText`'s).
 */
export function screenBody(
  lines: readonly TextLine[],
  status: readonly TextLine[],
  band: number,
  width: number,
): TextLine[] {
  const inStatus = new Set(statusBarOf(lines, status, band, width));
  return lines.filter((line) => !inStatus.has(line));
}

/** How far a status bar's line may end, in its band's heights. */
const STATUS_REACH = STATUS_BOTTOM / STATUS_BAR;

/**
 * Where a screen's status bar ends by the bar as read (`status`, the strip read alone, in the
 * screen's pixels, `width` wide): the bottom of the bar's row (`barRow`) among the strip's lines
 * that stand in `band` (`statusBandOf`, or a pane's share of the picture's) and over the screen,
 * never below `band`; `band` itself when no line of the bar was read. GO squeezes its header in a
 * short pane of a split screen: the elite badge and the gym's name start inside the picture's
 * 4.5%, under the phone's bar (Matt, 2026-10-27: the name at 110 of a band of 110, the bar's text
 * ending at 48), and the strip may read them, or the tabs of GO's friends list, as well. A line
 * of the other pane of a split side by side is left out. The margin is the line's own height: a
 * line of the screen is the bar's when it starts above the bar's bottom, however much taller the
 * screen's reading made its box.
 */
export function statusBandAsRead(status: readonly TextLine[], band: number, width: number): number {
  if (band <= 0) return 0;
  const strip = linesInBand(status, band, band * STATUS_REACH).filter(
    (l) => l.box.x1 > 0 && l.box.x0 < width,
  );
  const row = barRow(strip);
  return row.length === 0 ? band : Math.min(band, Math.max(...row.map((l) => l.box.y1)));
}

/**
 * The status bar's row among the strip's lines: the lines grouped into rows, one above the
 * other, by their boxes overlapping from the top down; the row of the clock (`clockIn`), or
 * without one the first row as tall as half the strip's tallest line (a speck above the bar is
 * none).
 */
function barRow(strip: readonly TextLine[]): TextLine[] {
  const rows: { lines: TextLine[]; bottom: number }[] = [];
  for (const l of [...strip].sort((a, b) => a.box.y0 - b.box.y0)) {
    const last = rows.at(-1);
    if (last && l.box.y0 < last.bottom) {
      last.lines.push(l);
      last.bottom = Math.max(last.bottom, l.box.y1);
    } else rows.push({ lines: [l], bottom: l.box.y1 });
  }
  const clock = rows.find((row) => clockIn(row.lines) !== null);
  if (clock) return clock.lines;
  const tallest = Math.max(0, ...strip.map((l) => boxHeight(l.box)));
  return (
    rows.find((row) => Math.max(...row.lines.map((l) => boxHeight(l.box))) >= tallest * 0.5)
      ?.lines ?? []
  );
}

/**
 * The lines of the status bar among `lines`: those that start above the bar as read
 * (`statusBandAsRead`) and end within `STATUS_REACH` of `band`; none when `band` is 0.
 */
function statusBarOf(
  lines: readonly TextLine[],
  status: readonly TextLine[],
  band: number,
  width: number,
): TextLine[] {
  return band > 0
    ? linesInBand(lines, statusBandAsRead(status, band, width), band * STATUS_REACH)
    : [];
}

/**
 * How far down the status bar reaches on a picture of this size: `STATUS_BAR` of its height. A
 * landscape picture's bar is thinner still (its GO pane's title starts at 10% of the height on
 * Matt's splits, so a band of the longer side's 4.5% took it for the status bar).
 */
export function statusBandOf(size: { width: number; height: number }): number {
  return size.height * STATUS_BAR;
}

/** The CP's row read again reaches this many of its "CP"'s heights over the letters' foot… */
const CP_ROW_ABOVE = 3.2;
/** …and this many under it: not into the boss's name. */
const CP_ROW_BELOW = 0.15;

/**
 * The letters "CP" read alone (`CP_LETTERS`) in the screen's top half, tall enough for a raid's
 * (`CP_LETTERS_MIN_HEIGHT`): the CP's digits were read apart from them, or not at all.
 */
export function cpLettersOf(lines: readonly TextLine[], height: number): TextLine | undefined {
  return lines.find(
    (l) =>
      CP_LETTERS.test(l.text.trim()) &&
      l.box.y1 < height / 2 &&
      boxHeight(l.box) > height * CP_LETTERS_MIN_HEIGHT,
  );
}

/** The CP's row to read again, in the screen's pixels, and how much to scale it for the reading. */
export interface CpRow {
  box: Box;
  scale: number;
}

/**
 * Where a raid's CP should be read again (production, 2026-11-10: a Zamazenta's CP white on a
 * bright white sky, read "367" far right of "CP", or not at all; its digits are drawn white
 * with a light grey edge): the row of a "CP" read alone (`cpLettersOf`) whose digits on its row
 * are not one line of three digits at least, starting within a digit's width of the letters.
 * The row runs from half the letters' height left of them to the screen's right edge, from
 * `CP_ROW_ABOVE` of their heights over their foot to `CP_ROW_BELOW` under it; it is read at the
 * size where the letters are `CP_LETTERS_READ` pixels tall. Null when the CP was read whole.
 */
export function cpRowToReadAgain(
  lines: readonly TextLine[],
  size: { width: number; height: number },
): CpRow | null {
  const letters = cpLettersOf(lines, size.height);
  if (!letters) return null;
  const { box } = letters;
  const height = boxHeight(box);
  const digits = lines.filter(
    (l) =>
      l !== letters &&
      /^\d+$/.test(l.text.replace(/\s/g, '')) &&
      l.box.x0 >= box.x0 &&
      l.box.y0 < box.y1 &&
      l.box.y1 > box.y0,
  );
  const [only] = digits;
  if (digits.length === 1 && only) {
    const count = only.text.replace(/\s/g, '').length;
    if (count >= 3 && only.box.x0 - box.x1 <= boxWidth(only.box) / count) return null;
  }
  return {
    box: {
      x0: Math.max(0, Math.round(box.x0 - height * 0.5)),
      y0: Math.max(0, Math.round(box.y1 - height * CP_ROW_ABOVE)),
      x1: size.width,
      y1: Math.min(size.height, Math.round(box.y1 + height * CP_ROW_BELOW)),
    },
    scale: CP_LETTERS_READ / height,
  };
}

/**
 * The lines of a screen with its CP's row (`row`, `cpRowToReadAgain`) read again (`again`, in the
 * screen's pixels): when the row read again has a CP of more digits than the lines in the row had
 * (by the CP's rule), its line stands in place of every line whose middle lies in the row;
 * otherwise `lines` as they are.
 */
export function withCpReadAgain(
  lines: TextLine[],
  row: Box,
  again: readonly TextLine[],
): TextLine[] {
  const digits = (l: TextLine) => CP.exec(l.text.replace(/\s/g, ''))?.[1]?.length ?? 0;
  const inRow = (l: TextLine) => {
    const x = (l.box.x0 + l.box.x1) / 2;
    const y = (l.box.y0 + l.box.y1) / 2;
    return x >= row.x0 && x < row.x1 && y >= row.y0 && y < row.y1;
  };
  const found = [...again].sort((a, b) => digits(b) - digits(a))[0];
  const before = Math.max(0, ...lines.filter(inRow).map(digits));
  if (!found || digits(found) <= before) return lines;
  return [...lines.filter((l) => !inRow(l)), found];
}

/**
 * The phone's clock in the lines of a status bar: the first time that starts a word, from the
 * left, an h:mm before any h.mm (a dot is also how speeds and dates are written). A time followed
 * by a digit or a unit is not the clock, nor a dotted one followed by a dot (a date) or by a
 * word that is a unit of speed.
 */
export function clockIn(lines: readonly TextLine[]): ScreenText['clock'] {
  let dotted: ScreenText['clock'] = null;
  for (const line of [...lines].sort((a, b) => a.box.x0 - b.box.x0)) {
    // A word ends at a space, or after a percent sign: the clock may follow the battery's
    // percentage unspaced (`81%11:25AM`).
    const words = line.text.split(/\s+|(?<=%)/);
    for (const [i, word] of words.entries()) {
      const hit = CLOCK_WORD.exec(word);
      // An iPhone's location arrow right after its clock is read as a 1 (`7:361`).
      if (hit && hit[2] === ':' && hit[4] === '1') hit[4] = '';
      if (!hit || NOT_A_CLOCK.test(hit[4] ?? '')) continue;
      if (hit[2] === '.' && DATE_END.test(hit[4] ?? '')) continue;
      if (hit[2] === '.' && !hit[4] && SPEED_UNIT.test(words[i + 1] ?? '')) continue;
      const clock = { hour: Number(hit[1]), minute: Number(hit[3]), confidence: line.confidence };
      if (hit[2] === ':') return clock;
      dotted ??= clock;
    }
  }
  return dotted;
}

/**
 * What a max battle's screen says: the boss's line, large, "Dynamax", "Gigantamax" or "Eternamax" and the
 * species; the Power Spot is the first line of letters under it, within two of its heights.
 */
function maxText(body: readonly TextLine[], height: number): MaxText | null {
  // The first line of letters under `above`, within two of its heights.
  const under = (above: TextLine) =>
    body.find(
      (l) =>
        l.box.y0 >= above.box.y1 - boxHeight(above.box) * 0.2 &&
        l.box.y0 < above.box.y1 + boxHeight(above.box) * 2 &&
        LETTERS.test(l.text),
    );
  for (const line of body) {
    const hit = MAX_BOSS.exec(line.text.trim());
    if (!hit?.[1] || boxHeight(line.box) < height * MAX_BOSS_MIN_HEIGHT) continue;
    // An older screen gives the form a line of its own and the species the next.
    const speciesLine = hit[2] ? line : under(line);
    if (!speciesLine) continue;
    const spot = under(speciesLine);
    return {
      form: hit[1].toLowerCase() as MaxForm,
      species: hit[2] ? hit[2].trim() : speciesLine.text.trim(),
      powerSpot: spot ? spot.text.trim() : null,
      spotConfidence: spot ? spot.confidence : null,
      box: line.box,
    };
  }
  return null;
}

export interface ScreenTextOptions {
  /**
   * How far down the status bar reaches, in the lines' pixels (`statusBandOf` the screen by
   * default): the lines above it are the status bar's, not the screen's, or above the bar as read
   * when `status` holds a line in it (`statusBandAsRead`). A pane of a split screen
   * gets the picture's band moved to its own pixels, and 0 when it does not touch the picture's
   * top (plan 7P: a countdown at a pane's top is never the clock).
   */
  statusBand?: number;
  /**
   * The screen is a pane of a split (plan 7P): GO's window there is small, and the gym's name
   * may be cut however much room its last line leaves (`ScreenText.gymRoom` null).
   */
  pane?: boolean;
}

/**
 * What the lines of a raid screen say. `lines` were read from the whole screen, `status` from the
 * status bar read again alone and enlarged (its boxes in the screen's pixels): the clock comes
 * from those first, since read whole the clock runs into the icons beside it.
 */
export function readScreenText(
  lines: readonly TextLine[],
  status: readonly TextLine[],
  size: { width: number; height: number },
  options: ScreenTextOptions = {},
): ScreenText {
  const { width, height } = size;
  const sorted = [...lines].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  const band = options.statusBand ?? statusBandOf(size);
  const inStatus = new Set(statusBarOf(sorted, status, band, width));
  const body = sorted.filter((l) => !inStatus.has(l));
  const clock = clockIn(status) ?? clockIn([...inStatus]);

  // The CP: digits after "CP" or little else, in a tall line.
  const cpLine = body.find(
    (l) => CP.test(l.text.replace(/\s/g, '')) && boxHeight(l.box) > height * CP_MIN_HEIGHT,
  );

  // The countdown: the first, or on a hatched raid (a CP) the one that ends farthest right: the
  // raid's own stands at the right edge, a nearby raid's timer further in.
  const countdowns = body.flatMap((line) => {
    const hit = COUNTDOWN.exec(line.text.replace(/\s+/g, ''));
    return hit ? [{ hit, box: line.box }] : [];
  });
  const own = cpLine ? [...countdowns].sort((a, b) => b.box.x1 - a.box.x1)[0] : countdowns[0];
  const countdown = own
    ? Number(own.hit[1]) * 3600 + Number(own.hit[2]) * 60 + Number(own.hit[3])
    : null;
  const countdownBox: Box | null = own?.box ?? null;

  let countdownPlace: ScreenText['countdownPlace'] = null;
  if (countdownBox) {
    const middle = (countdownBox.x0 + countdownBox.x1) / 2 / width;
    if (Math.abs(middle - 0.5) <= CENTRED) countdownPlace = 'centre';
    else if (middle >= AT_THE_RIGHT) countdownPlace = 'right';
  }

  const badge = body.find((l) => ELITE.test(l.text) && l.box.y0 < height * TOP);

  // The gym's name: the tallest line in the top fifth that is not the badge (the name is the
  // largest text there; text on the gym's picture is small), then the lines under it that start
  // where it starts and are about as tall. Words on the picture are left out first: those left
  // of where the other lines of the name's size start, or of the picture's edge when no other
  // line shows it; GO's gym-info button at the right edge is left out of the line it was read
  // into.
  const nearTop = body
    .filter(
      (l) =>
        l.box.y1 < height * TOP &&
        l !== badge &&
        LETTERS.test(l.text) &&
        !COUNTDOWN.test(l.text.replace(/\s+/g, '')),
    )
    .map((l) => withoutInfoButton(l, width));
  const tallestNearTop = Math.max(0, ...nearTop.map((l) => boxHeight(l.box)));
  const starts = nearTop
    .filter((l) => !onPicture(l) && boxHeight(l.box) > tallestNearTop * 0.6)
    .map((l) => l.box.x0);
  const top = nearTop
    .map((l) =>
      onPicture(l)
        ? besidePicture(
            l,
            starts.length > 0
              ? Math.min(...starts) - width * 0.04
              : boxHeight(l.box) * PICTURE_EDGE,
          )
        : l,
    )
    .filter((l): l is TextLine => l !== null && LETTERS.test(l.text));
  const tallest = [...top].sort((a, b) => boxHeight(b.box) - boxHeight(a.box))[0];
  let gym: string | null = null;
  let gymBelow: string | undefined;
  let gymRoom: number | null = null;
  if (tallest) {
    const block = top
      .filter(
        (l) =>
          Math.abs(l.box.x0 - tallest.box.x0) < width * 0.04 &&
          boxHeight(l.box) > boxHeight(tallest.box) * 0.6,
      )
      .sort((a, b) => a.box.y0 - b.box.y0);
    const kept: TextLine[] = [];
    for (const l of block) {
      const previous = kept.at(-1);
      if (!previous || l.box.y0 - previous.box.y1 < boxHeight(previous.box) * 0.8) kept.push(l);
    }
    gym =
      kept
        .map((l) => l.text.trim())
        .join(' ')
        .replace(/\s+/g, ' ') || null;
    const last = kept.at(-1);
    const lastText = last?.text.trim() ?? '';
    if (
      last &&
      gym !== null &&
      options.pane !== true &&
      height >= width * UPRIGHT &&
      lastText.length > 0
    ) {
      const perCharacter = boxWidth(last.box) / lastText.length;
      gymRoom = Math.max(0, (width * NAME_END - last.box.x1) / perCharacter);
    }
    if (last) {
      const gap = boxHeight(last.box) * 0.8;
      const under = body
        .filter(
          (l) =>
            l !== badge &&
            l.box.y0 > last.box.y0 + boxHeight(last.box) * 0.5 &&
            l.box.y0 - last.box.y1 < gap &&
            l.box.y1 < height * TOP &&
            !kept.some((k) => k.box.y0 === l.box.y0),
        )
        .sort((a, b) => a.box.y0 - b.box.y0)[0];
      const text = under && withoutInfoButton(under, width).text.trim().replace(/\s+/g, ' ');
      if (text) gymBelow = text;
    }
  }

  // The boss's name is the first line of letters under the CP.
  let cp: number | null = null;
  let bossName: string | null = null;
  if (cpLine) {
    cp = Number(CP.exec(cpLine.text.replace(/\s/g, ''))?.[1]);
    const below = body.find(
      (l) =>
        l.box.y0 > cpLine.box.y0 + boxHeight(cpLine.box) * 0.5 && BOSS_NAME.test(l.text.trim()),
    );
    bossName = below ? below.text.trim() : null;
  }

  const cpLetters = cpLine ? undefined : cpLettersOf(body, height)?.box;
  return {
    clock,
    countdown,
    gym,
    ...(gymBelow === undefined ? {} : { gymBelow }),
    gymRoom,
    eliteBadge: badge !== undefined,
    cp,
    bossName,
    countdownBox,
    countdownPlace,
    cpBox: cpLine?.box ?? null,
    ...(cpLetters ? { cpLetters } : {}),
    max: maxText(body, height),
  };
}
