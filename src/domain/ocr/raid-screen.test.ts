import { describe, expect, it } from 'vitest';
import type { TextLine } from './image.js';
import {
  clockIn,
  cpRowToReadAgain,
  readScreenText,
  withCpReadAgain,
  screenBody,
  statusBandAsRead,
  statusLines,
} from './raid-screen.js';

const SIZE = { width: 1080, height: 2400 };

const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
  text,
  confidence: 0.95,
  box: { x0, y0, x1, y1 },
});

/** The line as the reader joins the pieces of a row: each `[length, x0, y0, x1, y1]`. */
const withParts = (
  one: TextLine,
  ...parts: [number, number, number, number, number][]
): TextLine => ({
  ...one,
  parts: parts.map(([length, x0, y0, x1, y1]) => ({ length, box: { x0, y0, x1, y1 } })),
});

/**
 * The lines of an egg screen, made up in the layout of the samples: the name starts a quarter of
 * the width in, right of the gym's picture.
 */
const EGG: TextLine[] = [
  line('9:41 5G', 40, 20, 200, 80),
  line('Squirrel Hill', 270, 190, 760, 252),
  line('Green Mural', 272, 260, 700, 322),
  line('PARK OPEN 6AM', 100, 360, 220, 380),
  line('0:42:17', 420, 1500, 660, 1560),
  line('Walk closer to interact with this Gym.', 200, 2200, 880, 2240),
];

/** The lines of a hatched raid. */
const HATCHED: TextLine[] = [
  line('21:05', 60, 20, 180, 80),
  line('ELITE RAID GYM', 270, 150, 510, 180),
  line('Heinz Plant', 270, 200, 690, 262),
  line('0:31:02', 860, 700, 1040, 750),
  line('CP 41234', 300, 1100, 780, 1220),
  line('Yveltal', 400, 1240, 680, 1300),
];

describe('readScreenText', () => {
  it('reads an egg: clock, gym over two lines, countdown, no CP', () => {
    const text = readScreenText(EGG, [], SIZE);
    expect(text).toMatchObject({
      clock: { hour: 9, minute: 41 },
      gym: 'Squirrel Hill Green Mural',
      countdown: 42 * 60 + 17,
      eliteBadge: false,
      cp: null,
      bossName: null,
      cpBox: null,
    });
    expect(text.countdownBox).toEqual({ x0: 420, y0: 1500, x1: 660, y1: 1560 });
    expect(text.countdownPlace).toBe('centre');
  });

  // Matt, 2026-10-24: the gym's picture is the Community Ambassador badge, whose caption was read
  // into the name's second line ("Outgoing"), so the picture's rule cut that line away.
  it('keeps the line under the name as read, for the gym search to narrow by', () => {
    const lines = [
      line('3:16 92%', 84, 9, 1004, 52),
      line('PeRENY Pittsburgh Campsite -', 82, 130, 844, 211),
      line('AMBASSADOR PROGRAM C 0 murit Outgoing', 70, 216, 531, 286),
      line('0:31:04', 822, 1414, 983, 1462),
    ];
    expect(readScreenText(lines, [], { width: 1080, height: 2448 })).toMatchObject({
      gym: 'PeRENY Pittsburgh Campsite -',
      gymBelow: 'AMBASSADOR PROGRAM C 0 murit Outgoing',
    });
  });

  it('reads a hatched raid: badge, CP and the name under it, a 24-hour clock', () => {
    expect(readScreenText(HATCHED, [], SIZE)).toMatchObject({
      clock: { hour: 21, minute: 5 },
      gym: 'Heinz Plant',
      eliteBadge: true,
      countdown: 31 * 60 + 2,
      cp: 41234,
      bossName: 'Yveltal',
      countdownPlace: 'right',
    });
  });

  it('takes the clock from the status bar read alone, before the whole screen', () => {
    const status = [line('@9:43', 30, 20, 160, 70), line('12:00', 500, 20, 600, 70)];
    expect(readScreenText(EGG, status, SIZE).clock).toEqual({
      hour: 9,
      minute: 43,
      confidence: 0.95,
    });
  });

  it('answers null for what is not there', () => {
    expect(readScreenText([line('Walk closer', 200, 2200, 880, 2240)], [], SIZE)).toEqual({
      clock: null,
      countdown: null,
      gym: null,
      eliteBadge: false,
      cp: null,
      bossName: null,
      countdownBox: null,
      countdownPlace: null,
      cpBox: null,
      max: null,
    });
  });

  it('does not take small digits for the CP, nor a name the boss hides', () => {
    const lines = [line('1234', 300, 1100, 400, 1130), line('CP 9999', 300, 1100, 780, 1220)];
    expect(readScreenText(lines, [], SIZE)).toMatchObject({ cp: 9999, bossName: null });
  });

  it('reads the CP behind an icon or a "CP" misread, run into the digits', () => {
    const cpOf = (text: string) =>
      readScreenText(
        [line(text, 60, 1100, 920, 1300), line('Gothitelle', 160, 1300, 920, 1430)],
        [],
        SIZE,
      ).cp;
    expect(cpOf('Ocp16997')).toBe(16997);
    expect(cpOf('O 53394')).toBe(53394);
    expect(cpOf('c45435')).toBe(45435);
    expect(cpOf('ce41758')).toBe(41758);
    // A word before a number is no CP.
    expect(cpOf('Route 6300')).toBeNull();
  });

  it('leaves out the words of the gym’s picture that were read into the name', () => {
    const gymOf = (lines: TextLine[]) => readScreenText(lines, [], SIZE).gym;
    // A sign in the picture, read into the name's second line and taller than the first.
    expect(
      gymOf([
        line('Welcome to Maple', 276, 149, 811, 206),
        line('GROVE MAPLE Grove', 114, 209, 370, 275),
      ]),
    ).toBe('Welcome to Maple Grove');
    // A plaque in the picture, read into a name of one line.
    expect(gymOf([line('WOES Oak Street Garden', 123, 186, 816, 242)])).toBe('Oak Street Garden');
    // A name whose box the light of a hatching egg stretched over the picture keeps its words.
    expect(gymOf([line('NewHope Chapel', 62, 246, 803, 354)])).toBe('NewHope Chapel');
  });

  // Production, 2026-11-10 (iPhone, 1125x2436): GO's round gym-info button at the top right was
  // read into the name's second line ("og", "ogy"), a piece of its own half as tall as the name's.
  it('leaves out the gym-info button read into the name at the right edge', () => {
    const iphone = { width: 1125, height: 2436 };
    const gymOf = (lines: TextLine[]) => readScreenText(lines, [], iphone).gym;
    const first = line("Christ's Lutheran", 287, 157, 754, 216);
    expect(
      gymOf([
        first,
        withParts(
          line('Church og', 286, 216, 1024, 292),
          [6, 286, 227, 491, 292],
          [2, 987, 216, 1024, 249],
        ),
      ]),
    ).toBe("Christ's Lutheran Church");
    expect(
      gymOf([
        first,
        withParts(
          line('Church Firepit ogy', 287, 214, 1029, 292),
          [14, 287, 228, 683, 292],
          [3, 986, 214, 1029, 249],
        ),
      ]),
    ).toBe("Christ's Lutheran Church Firepit");
    // A word of the name's own size read apart at the right stays, as does a short word that is
    // not at the right edge; a cut name ends in a small word ("Buhl Planetarium and").
    expect(
      gymOf([
        withParts(
          line('Saint Paul Cathedral Hall', 287, 157, 1060, 216),
          [20, 287, 157, 900, 216],
          [4, 960, 160, 1060, 216],
        ),
      ]),
    ).toBe('Saint Paul Cathedral Hall');
    expect(
      gymOf([
        withParts(
          line('Market Square og', 287, 157, 760, 216),
          [13, 287, 157, 640, 216],
          [2, 700, 170, 760, 200],
        ),
      ]),
    ).toBe('Market Square og');
    expect(gymOf([line('Buhl Planetarium and', 287, 157, 860, 216)])).toBe('Buhl Planetarium and');
  });

  it('reads a max battle screen: Dynamax or Gigantamax, the species, the Power Spot under it', () => {
    const maxScreen = (species: string) => [
      line('7:36 SOS 74', 130, 50, 980, 100),
      line('1', 940, 140, 965, 170),
      line('9:24:00', 820, 1380, 980, 1430),
      line(species, 135, 1500, 950, 1600),
      line('HOLLOWAY BROTHERS, PRINTERS', 180, 1710, 905, 1750),
      line('BATTLE', 395, 1820, 565, 1865),
      line('a Remote Raid Pass', 390, 1905, 700, 1940),
      line('PRIVATE GROUP', 345, 2060, 745, 2100),
    ];
    expect(readScreenText(maxScreen('Dynamax Sneasel'), [], SIZE)).toMatchObject({
      max: {
        form: 'dynamax',
        species: 'Sneasel',
        powerSpot: 'HOLLOWAY BROTHERS, PRINTERS',
        box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
      },
      gym: null,
      cp: null,
      countdown: 9 * 3600 + 24 * 60,
    });
    expect(readScreenText(maxScreen('Gigantamax Lapras'), [], SIZE).max).toMatchObject({
      form: 'gigantamax',
      species: 'Lapras',
    });
    // A raid screen is none.
    expect(readScreenText(HATCHED, [], SIZE).max).toBeNull();
  });

  it('reads a max battle’s name run together, smaller in a split screen, or over two lines', () => {
    // A split screen's lower half: the name smaller and read without its space.
    expect(
      readScreenText(
        [
          line('13:35:27', 707, 1780, 829, 1816),
          line('DynamaxSneasel', 285, 1890, 795, 1946),
          line('BRIARWOODIUM', 439, 2010, 641, 2045),
        ],
        [],
        SIZE,
      ).max,
    ).toMatchObject({ form: 'dynamax', species: 'Sneasel', powerSpot: 'BRIARWOODIUM' });
    // An older screen: the form on a line of its own, the species under it.
    expect(
      readScreenText(
        [
          line('16:57', 836, 1275, 964, 1329),
          line('Gigantamax', 271, 1395, 826, 1494),
          line('Snorlax', 367, 1523, 718, 1613),
          line("ROSIE'S LANTERN CORNER CAFE", 211, 1664, 872, 1709),
        ],
        [],
        SIZE,
      ).max,
    ).toMatchObject({
      form: 'gigantamax',
      species: 'Snorlax',
      powerSpot: "ROSIE'S LANTERN CORNER CAFE",
      box: { x0: 271, y0: 1395, x1: 826, y1: 1494 },
    });
  });

  it('keeps the confidence of the Power Spot’s own line', () => {
    const lines = [
      line('0:24:00', 820, 1380, 980, 1430),
      line('Dynamax Machop', 135, 1500, 950, 1600),
      { ...line('BRAMBLE CREEK KIOSK', 180, 1710, 905, 1750), confidence: 0.81 },
    ];
    expect(readScreenText(lines, [], SIZE).max).toMatchObject({
      powerSpot: 'BRAMBLE CREEK KIOSK',
      spotConfidence: 0.81,
    });
    // No Power Spot line: no confidence.
    expect(readScreenText(lines.slice(0, 2), [], SIZE).max).toMatchObject({
      powerSpot: null,
      spotConfidence: null,
    });
  });

  it('reads an Eternamax battle as a form of its own, on one line or two', () => {
    expect(
      readScreenText(
        [
          line('0:24:00', 820, 1380, 980, 1430),
          line('Eternamax Eternatus', 135, 1500, 950, 1600),
          line('BRAMBLE CREEK KIOSK', 180, 1710, 905, 1750),
        ],
        [],
        SIZE,
      ).max,
    ).toMatchObject({ form: 'eternamax', species: 'Eternatus' });
    expect(
      readScreenText(
        [
          line('Eternamax', 271, 1395, 826, 1494),
          line('Eternatus', 367, 1523, 718, 1613),
          line('BRAMBLE CREEK KIOSK', 211, 1664, 872, 1709),
        ],
        [],
        SIZE,
      ).max,
    ).toMatchObject({ form: 'eternamax', species: 'Eternatus', powerSpot: 'BRAMBLE CREEK KIOSK' });
  });

  it('takes the badge of an EX raid gym, as older screens show it, for the badge and not the name', () => {
    for (const badge of ['EX RAID GYM', 'EXRAID GYM', 'EXRAIDGYM', 'EUTE RAID GYM']) {
      const text = readScreenText(
        [line(badge, 270, 210, 460, 250), line('Maple Grove', 266, 290, 690, 352)],
        [],
        SIZE,
      );
      expect(text).toMatchObject({ gym: 'Maple Grove', eliteBadge: true });
    }
  });

  // Matt, 2026-10-27: the upper pane of a split, a raid over a max battle on a picture 2448 high.
  // GO squeezes its header in a short pane: the badge and the name start inside the picture's
  // 4.5% (110 pixels), well under the status bar as read (it ends at 48).
  it('takes a short pane’s header under the status bar as read for the screen, not the bar', () => {
    const pane = [
      line('6:10 5G+ LTE 80%', 85, 7.4, 1005, 53.5),
      line('ELITE RAID GYM', 173, 62.4, 323, 92.1),
      line('Larchmont Pickleball Courts', 173, 109.94, 735, 154.5),
      line('cp47444', 358, 220, 729, 313.5),
      line('Landorus', 367, 313.5, 725, 390.7),
      line('0:33:16', 716, 725, 820, 757.7),
    ];
    const status = [
      line('6:10 AUTO 5G* 80%', 87, 10.3, 1000, 48.1),
      line('HZ LTE', 594, 31, 742, 47),
    ];
    const read = (bar: TextLine[]) =>
      readScreenText(pane, bar, { width: 1080, height: 1141 }, { statusBand: 2448 * 0.045 });
    expect(read(status)).toMatchObject({
      clock: { hour: 6, minute: 10 },
      gym: 'Larchmont Pickleball Courts',
      eliteBadge: true,
      cp: 47444,
      bossName: 'Landorus',
    });
    expect(screenBody(pane, status, 2448 * 0.045, 1080).map((l) => l.text)).toEqual(
      pane.slice(1).map((l) => l.text),
    );
    // The strip, 4.5% of the picture's height, also reads the pane's badge under the bar: the
    // bar is the clock's row, not the strip's lowest line.
    expect(read([...status, line('ELITE RAID GYM', 173, 63, 323, 91)])).toMatchObject({
      gym: 'Larchmont Pickleball Courts',
      eliteBadge: true,
    });
    // Without a status bar read, the band handed in stands.
    expect(read([])).toMatchObject({ gym: null, eliteBadge: false });
  });

  // A guard, not a fix: a rule that the CP is the screen's tallest line (tried for 7P-F) read
  // six real full screens wrong in the ocr:check of 2026-10-27, whose boss's or gym's name was
  // read taller than the CP.
  it('takes the CP of a full screen whose boss’s name is read taller than it', () => {
    const lines = [
      line('Maple Grove', 270, 170, 690, 230),
      line('CP 41234', 300, 1100, 780, 1200),
      line('Dialga', 250, 1210, 830, 1360),
      line('0:31:02', 860, 700, 1040, 750),
    ];
    expect(readScreenText(lines, [], SIZE)).toMatchObject({ cp: 41234, bossName: 'Dialga' });
  });

  it('takes a hatched raid’s own countdown, at the right edge, over another raid’s timer', () => {
    const lines = [
      line('Maple Grove', 270, 170, 690, 230),
      line('CP 53394', 200, 400, 880, 560),
      line('Dialga', 270, 560, 790, 720),
      line('0:01:26', 730, 900, 910, 950),
      line('0:24:33', 830, 1320, 990, 1370),
    ];
    expect(readScreenText(lines, [], SIZE)).toMatchObject({
      countdown: 24 * 60 + 33,
      countdownPlace: 'right',
    });
  });
});

/**
 * A raid's CP white on a bright white sky (production, 2026-11-10, an iPhone 1125 × 2436): the
 * "CP" read alone, of the digits only the last three, far right of it, or none at all.
 */
const IPHONE = { width: 1125, height: 2436 };
const BRIGHT_SKY: TextLine[] = [
  line('10:26', 43, 61, 214, 107),
  line('Maple Grove', 286, 155, 755, 219),
  line('Church Fire Ring', 287, 214, 683, 292),
  line('367', 637, 451, 928, 612),
  line('CP', 219, 541, 324, 612),
  line('Zan enta', 130, 623, 980, 799),
  line('0:07:59', 854, 1417, 1020, 1467),
  line('BATTLE', 417, 1841, 602, 1889),
];

describe('cpRowToReadAgain and withCpReadAgain', () => {
  it('reads the CP’s row again where its digits stand far right of "CP", or are not read', () => {
    // The row: from half the letters' height left of them to the screen's edge, from 3.2 of
    // their heights over their foot to 0.15 under it; read at 50 pixels a letter (71 here).
    const row = {
      box: { x0: 184, y0: 385, x1: 1125, y1: 623 },
      scale: 50 / 71,
    };
    expect(cpRowToReadAgain(BRIGHT_SKY, IPHONE)).toEqual(row);
    const none = BRIGHT_SKY.filter((one) => one.text !== '367');
    expect(cpRowToReadAgain(none, IPHONE)).toEqual(row);
    // Two pieces of digits: one lost between them.
    const pieces = [...none, line('56', 330, 451, 500, 612), line('67', 700, 451, 928, 612)];
    expect(cpRowToReadAgain(pieces, IPHONE)).toEqual(row);
    // Two digits beside the letters are no CP: the rest was lost.
    expect(cpRowToReadAgain([...none, line('65', 400, 451, 640, 612)], IPHONE)).toEqual(row);
  });

  it('reads nothing again where the CP was read with its letters, or its digits beside them', () => {
    expect(cpRowToReadAgain(HATCHED, SIZE)).toBeNull();
    const apart = [
      ...BRIGHT_SKY.filter((one) => one.text !== '367'),
      line('56867', 340, 451, 928, 612),
    ];
    expect(cpRowToReadAgain(apart, IPHONE)).toBeNull();
    // Small "CP" low on the screen is no raid's CP (a Pokémon's in a list).
    expect(cpRowToReadAgain([line('CP', 100, 1800, 140, 1820)], IPHONE)).toBeNull();
  });

  it('takes the row read again in place of what stood there when it read more digits', () => {
    const row = cpRowToReadAgain(BRIGHT_SKY, IPHONE);
    expect(row).not.toBeNull();
    const box = row?.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
    const again = [line('CP 56867', 219, 451, 928, 612)];
    const lines = withCpReadAgain(BRIGHT_SKY, box, again);
    expect(lines.map((one) => one.text)).toEqual([
      '10:26',
      'Maple Grove',
      'Church Fire Ring',
      'Zan enta',
      '0:07:59',
      'BATTLE',
      'CP 56867',
    ]);
    expect(readScreenText(lines, [], IPHONE)).toMatchObject({ cp: 56867, bossName: 'Zan enta' });
    // Fewer digits, or none, leave the first reading as it was.
    expect(withCpReadAgain(BRIGHT_SKY, box, [line('CP 67', 219, 451, 928, 612)])).toBe(BRIGHT_SKY);
    expect(withCpReadAgain(BRIGHT_SKY, box, [line('CP', 219, 541, 324, 612)])).toBe(BRIGHT_SKY);
  });

  it('keeps where a "CP" read alone stands when no CP was read, for the heads above it', () => {
    const none = BRIGHT_SKY.filter((one) => one.text !== '367');
    expect(readScreenText(none, [], IPHONE)).toMatchObject({
      cp: null,
      cpBox: null,
      cpLetters: { x0: 219, y0: 541, x1: 324, y1: 612 },
      countdownPlace: 'right',
    });
    expect(readScreenText(HATCHED, [], SIZE).cpLetters).toBeUndefined();
  });
});

describe('statusBandAsRead', () => {
  const BAND = 2448 * 0.045;
  const BAR = [
    line('3:10 AUTO v5G* 80%', -119.2, 12.8, 796.1, 52.1),
    line('Hz LTE', 385.1, 33.9, 541.4, 50.6),
  ];

  it('ends at the row of the bar’s clock, not at a line of the screen the strip read under it', () => {
    expect(statusBandAsRead(BAR, BAND, 664)).toBe(52.1);
    // GO's friends list: its tabs stand in the strip (Matt's split of 2026-10-22).
    const tabs = line('ME FRIENDS SOCIAL', 98.7, 70.7, 575.2, 97.2);
    expect(statusBandAsRead([...BAR, tabs], BAND, 664)).toBe(52.1);
    // No line of the bar read: the band handed in.
    expect(statusBandAsRead([], BAND, 664)).toBe(BAND);
    expect(statusBandAsRead(BAR, 0, 664)).toBe(0);
  });

  it('takes no speck above the bar for the bar', () => {
    const speck = line('.', 500, 2, 512, 10);
    expect(statusBandAsRead([speck, ...BAR], BAND, 664)).toBe(52.1);
    // Without a clock read, the first row as tall as half the strip's tallest line.
    const noClock = [speck, line('v5G+ LTE 80%', 300, 12.8, 796.1, 52.1)];
    expect(statusBandAsRead(noClock, BAND, 664)).toBe(52.1);
  });

  it('leaves out the strip’s lines over the other pane of a split side by side', () => {
    // A pane 540 wide: the other pane's title, right of it, reaches into the bar's row.
    const other = line('Larchmont Pickleball Courts', 600, 30, 1000, 75);
    expect(statusBandAsRead([line('6:10', 40, 10, 140, 48), other], BAND, 540)).toBe(48);
    const pane = [
      line('6:10', 40, 8, 140, 50),
      line('ELITE RAID GYM', 120, 60, 300, 90),
      line('Maple Grove Courts', 120, 100, 500, 150),
    ];
    expect(
      readScreenText(
        pane,
        [line('6:10', 40, 10, 140, 48), other],
        { width: 540, height: 1141 },
        { statusBand: BAND },
      ),
    ).toMatchObject({ eliteBadge: true, gym: 'Maple Grove Courts' });
  });
});

describe('statusLines and clockIn', () => {
  it('keeps the lines of the top 4.5%, and reads the first h:mm from the left', () => {
    const lines = [line('10:02', 500, 10, 600, 60), line('7:15', 20, 10, 120, 60), ...EGG.slice(1)];
    expect(statusLines(lines, 2400)).toHaveLength(2);
    expect(clockIn(statusLines(lines, 2400))).toEqual({ hour: 7, minute: 15, confidence: 0.95 });
    expect(clockIn([line('99:99', 0, 0, 10, 10)])).toBeNull();
  });

  it('does not take a network speed, a percentage or a longer number for the clock', () => {
    const at = (...texts: string[]) =>
      clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
    expect(at('0.12K/s', '9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
    expect(at('1.25K/s 9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
    expect(at('1.25K/s', '85%')).toBeNull();
    expect(at('12:345')).toBeNull();
    expect(at('9:41PM')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
    // The clock runs into the icons beside it when read.
    expect(at('1:29C SOS 80')).toEqual({ hour: 1, minute: 29, confidence: 0.95 });
    expect(at('0.5MB/s', '12.5%')).toBeNull();
    expect(at('12.50%')).toBeNull();
  });

  it('reads a clock with an iPhone’s location arrow after it, read as a 1', () => {
    expect(clockIn([line('7:361 SOS 74', 160, 0, 1190, 40)])).toEqual({
      hour: 7,
      minute: 36,
      confidence: 0.95,
    });
    expect(clockIn([line('10:341', 25, 0, 95, 40)])).toEqual({
      hour: 10,
      minute: 34,
      confidence: 0.95,
    });
    expect(clockIn([line('12:345', 25, 0, 95, 40)])).toBeNull();
  });

  it('reads a clock written right after the battery’s percentage', () => {
    for (const [text, hour, minute] of [
      ['81%11:25AM', 11, 25],
      ['20%12:32PM', 12, 32],
      ['79%自2:28PM', 2, 28],
    ] as const) {
      expect(clockIn([line(text, 300, 0, 500, 40)])).toEqual({ hour, minute, confidence: 0.95 });
    }
  });

  it('takes h.mm only when no h:mm stands in the bar', () => {
    const at = (...texts: string[]) =>
      clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
    expect(at('14.10.', '9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
    expect(at('Tue 14.10.')).toBeNull();
    expect(at('9.41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
    // A speed read apart from its unit.
    expect(at('1.25 K/s')).toBeNull();
    expect(at('1.25 KB/s', '9.41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
  });

  it('reads a clock with a morning or afternoon word before it, as East Asian phones show it', () => {
    for (const text of ['下午9:41', '午後 9:41', '오후 9:41', '9:41 PM', '09.41']) {
      expect(clockIn([line(text, 0, 0, 100, 40)])).toEqual({
        hour: 9,
        minute: 41,
        confidence: 0.95,
      });
    }
  });
});
