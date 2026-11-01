import { describe, expect, it } from 'vitest';
import type { GreyImage, TextLine } from './image.js';
import {
  boxedIn,
  crossesCut,
  cutKept,
  findDivider,
  paneShows,
  panesOf,
  paneSide,
  screenAnchors,
  seamCut,
  textCut,
  trimMargins,
  twoScreens,
} from './panes.js';
import { readScreenText, screenBody } from './raid-screen.js';

const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
  text,
  confidence: 0.95,
  box: { x0, y0, x1, y1 },
});

/**
 * A made-up picture: a texture that changes along both sides (what a game screen looks like to
 * these rules), then `paint` draws over it.
 */
function picture(
  width: number,
  height: number,
  paint: (x: number, y: number) => number | undefined = () => undefined,
): GreyImage {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = paint(x, y) ?? 60 + ((x * 7 + y * 13) % 140);
    }
  }
  return { width, height, data };
}

/** Matt's samples scaled to the small copy: 1080 × 2448 at 800 high. */
const W = 353;
const H = 800;
const WHOLE = { x0: 0, y0: 0, x1: W, y1: H };

/**
 * Android's divider as on the samples: grey 20, 26 of 2448 rows (9 here) at `middle`, with a
 * handle of 17.5% of its length in its middle.
 */
function divider(middle: number) {
  const from = Math.round(H * middle) - 4;
  return (x: number, y: number) => {
    if (y < from || y >= from + 9) return undefined;
    const handle = Math.abs(x - W / 2) < (W * 0.175) / 2 && y >= from + 3 && y < from + 6;
    return handle ? 220 : 20;
  };
}

describe('findDivider', () => {
  it('finds Android’s divider between a top and a bottom pane, at each of its places', () => {
    for (const middle of [0.28, 0.5, 0.72]) {
      const cut = findDivider(picture(W, H, divider(middle)), WHOLE);
      expect(cut?.axis).toBe('rows');
      expect(((cut?.from ?? 0) + (cut?.to ?? 0)) / 2 / H).toBeCloseTo(middle, 1);
    }
  });

  it('finds the dark gap of a landscape split, the panes’ black corners included', () => {
    // 2448 × 1080 at 800 wide: black from 1141 to 1307 with the grey band in its middle.
    const grey = picture(800, 353, (x) =>
      x >= 373 && x < 427 ? (x >= 396 && x < 404 ? 20 : 0) : undefined,
    );
    expect(findDivider(grey, { x0: 0, y0: 0, x1: 800, y1: 353 })).toEqual({
      axis: 'columns',
      from: 373,
      to: 427,
    });
  });

  it('finds a foldable’s spine of any one grey between two panes side by side', () => {
    // A Duo of 2007 × 2853 at 800 high: a spine of 12 columns (3 here) of grey 60, the panes
    // filling the height.
    const spine = picture(563, 800, (x) => (x >= 280 && x < 283 ? 60 : undefined));
    expect(findDivider(spine, { x0: 0, y0: 0, x1: 563, y1: 800 })).toEqual({
      axis: 'columns',
      from: 280,
      to: 283,
    });
  });

  it('finds the spine beside a dark app as grey as it, by the picture on its other side', () => {
    // A chat's dark background and text (grey 40 to 79) right of a grey-60 spine; GO left of it.
    const besideChat = picture(563, 800, (x, y) =>
      x >= 280 && x < 283 ? 60 : x >= 283 ? 40 + ((x * 3 + y * 5) % 40) : undefined,
    );
    expect(findDivider(besideChat, { x0: 0, y0: 0, x1: 563, y1: 800 })).toEqual({
      axis: 'columns',
      from: 280,
      to: 283,
    });
  });

  it('takes no flat floor, night sky or edge for a divider', () => {
    // A dark floor a fifth of the screen high: not thin.
    const floor = picture(W, H, (_x, y) => (y >= 500 && y < 660 ? 25 : undefined));
    // A thin dark band with dark above it: no picture on both sides.
    const sky = picture(W, H, (_x, y) => (y < 400 ? 10 + (y % 3) : y < 409 ? 20 : undefined));
    // A thin dark band near the bottom edge (the navigation bar's).
    const edge = picture(W, H, (_x, y) => (y >= 760 && y < 769 ? 20 : undefined));
    // A band that is light outside the handle's place.
    const light = picture(W, H, (x, y) => (y >= 396 && y < 405 ? (x < 50 ? 200 : 20) : undefined));
    for (const grey of [floor, sky, edge, light]) expect(findDivider(grey, WHOLE)).toBeNull();
  });
});

describe('trimMargins', () => {
  it('trims black bars of a letterboxed screen, and nothing of a screen without them', () => {
    const boxed = picture(W, H, (_x, y) => (y < 80 || y >= 720 ? 0 : undefined));
    expect(trimMargins(boxed)).toEqual({ x0: 0, y0: 80, x1: W, y1: 720 });
    expect(trimMargins(picture(W, H))).toEqual(WHOLE);
  });

  it('keeps a margin thinner than 3% of its side (a dark status bar’s top rows)', () => {
    const thin = picture(W, H, (_x, y) => (y < 12 ? 0 : undefined));
    expect(trimMargins(thin)).toEqual(WHOLE);
  });

  it('trims a pane’s pillarbox within its own box', () => {
    const pillar = picture(W, H, (x, y) => (y >= 400 && (x < 60 || x >= 293) ? 0 : undefined));
    expect(trimMargins(pillar, { x0: 0, y0: 400, x1: W, y1: H })).toEqual({
      x0: 60,
      y0: 400,
      x1: 293,
      y1: H,
    });
  });
});

describe('boxedIn', () => {
  const pane = { x0: 0, y0: 1778, x1: 1080, y1: 2448 };

  it('tells a small GO pillarboxed in its pane, margins on both sides (plan 7P-G)', () => {
    // Matt's split: GO 664 of the pane's 1080, black from 0 to 208 and from 872.
    expect(boxedIn(pane, { x0: 208, y0: 1778, x1: 872, y1: 2448 })).toBe(true);
  });

  it('takes no pane that fills its width, or is trimmed on one side or by a sliver', () => {
    expect(boxedIn(pane, pane)).toBe(false);
    // A landscape split's pane with the phone's black corner on one side; a chat on black.
    expect(boxedIn(pane, { ...pane, x0: 70 })).toBe(false);
    expect(boxedIn(pane, { ...pane, x1: 609 })).toBe(false);
    // Less than 3% of the width on a side.
    expect(boxedIn(pane, { ...pane, x0: 20, x1: 1060 })).toBe(false);
  });
});

/** A max battle's screen's lines, `dx`, `dy` from the top left. */
function maxScreen(dx: number, dy: number, title = 'Dynamax Sableye'): TextLine[] {
  return [
    line('17:06', dx + 600, dy + 560, dx + 680, dy + 590),
    line(title, dx + 200, dy + 600, dx + 880, dy + 660),
    line('SMI AWARE', dx + 420, dy + 690, dx + 660, dy + 715),
    line('BATTLE', dx + 400, dy + 760, dx + 520, dy + 790),
    line('PRIVATE GROUP', dx + 420, dy + 880, dx + 660, dy + 905),
  ];
}

/** A hatched raid's screen's lines, `dx`, `dy` from the top left. */
function raidScreen(dx: number, dy: number): TextLine[] {
  return [
    line('Historic Garden', dx + 200, dy + 60, dx + 700, dy + 100),
    line('CP54793', dx + 300, dy + 140, dx + 780, dy + 230),
    line('Palkia', dx + 400, dy + 240, dx + 680, dy + 300),
    line('0:31:43', dx + 860, dy + 600, dx + 1000, dy + 640),
    line('BATTLE using a Remote Raid Pass', dx + 400, dy + 760, dx + 780, dy + 790),
    line('PRIVATE GROUP', dx + 420, dy + 880, dx + 660, dy + 905),
    line('0:12:01', dx + 100, dy + 1000, dx + 180, dy + 1030),
  ];
}

describe('screenAnchors and twoScreens', () => {
  it('sees one screen in a raid’s or a max battle’s reading, a nearby raid’s timer too', () => {
    expect(twoScreens(screenAnchors(raidScreen(0, 0)))).toBe(false);
    expect(twoScreens(screenAnchors(maxScreen(0, 0)))).toBe(false);
  });

  it('takes no two-part chip for a countdown (a max battle’s 17:48, a map’s 18:14)', () => {
    const map = [line('18:14', 100, 100, 180, 130), line('3:09', 400, 900, 460, 930)];
    expect(screenAnchors(map)).toEqual([]);
  });

  it('sees two screens one above the other: two titles, or a title and a raid’s CP', () => {
    expect(twoScreens(screenAnchors([...maxScreen(0, 0), ...maxScreen(0, 1200)]))).toBe(true);
    expect(twoScreens(screenAnchors([...maxScreen(0, 0), ...raidScreen(0, 1200)]))).toBe(true);
  });

  it('sees a max battle’s title with a countdown far from it (190: the raid’s, half a screen away)', () => {
    const lines = [...maxScreen(0, 0).slice(1, 3), line('0:32:25', 700, 1900, 860, 1940)];
    expect(twoScreens(screenAnchors(lines))).toBe(true);
  });

  it('counts each title and button of a line read across two panes', () => {
    const merged = [
      line('Dynamax Sableye Dynamax Sableye', 100, 600, 1700, 660),
      line('PRIVATE GROUP PRIVATE GROUP', 300, 880, 1500, 905),
    ];
    const anchors = screenAnchors(merged);
    expect(anchors.filter((a) => a.kind !== 'title').map((a) => a.kind)).toEqual([
      'max-title',
      'max-title',
      'private-group',
      'private-group',
    ]);
    expect(twoScreens(anchors)).toBe(true);
  });
});

describe('two gyms’ titles', () => {
  /** An egg's screen: its title, a countdown and the buttons, `dx` from the left. */
  const egg = (dx: number, name: string): TextLine[] => [
    line(name, dx + 200, 130, dx + 800, 190),
    line('0:02:49', dx + 400, 600, dx + 560, 640),
    line('PRIVATE GROUP', dx + 420, 880, dx + 660, 905),
  ];

  it('sees two screens in two titles side by side (two eggs of a foldable, one row read)', () => {
    const [left, right] = [egg(0, 'Temple Garden'), egg(1000, 'Sixth Church')];
    const rows = left.map((one, i) => {
      const other = right[i] ?? one;
      return {
        ...one,
        text: `${one.text} ${other.text}`,
        box: { ...one.box, x1: other.box.x1 },
        parts: [
          { box: one.box, length: one.text.length },
          { box: other.box, length: other.text.length },
        ],
      };
    });
    expect(twoScreens(screenAnchors(rows))).toBe(true);
  });

  it('sees one screen in a name over two lines', () => {
    const lines = [
      line('Sixth Presbyterian', 200, 130, 800, 190),
      line('Church', 200, 200, 420, 260),
    ];
    expect(twoScreens(screenAnchors([...lines, ...egg(0, 'x').slice(1)]))).toBe(false);
  });
});

describe('textCut', () => {
  it('cuts two screens side by side where the picture changes, between the screens’ text', () => {
    // 2 × 1000 wide and 1200 high, the right pane a picture of its own from x 1000 on; the
    // small copy at a fifth.
    const lines = [...maxScreen(0, 0), ...raidScreen(1000, 0)];
    const grey = picture(400, 240, (x, y) => (x >= 200 ? 30 + ((x * 3 + y * 5) % 40) : undefined));
    const cut = textCut(lines, grey, 0.2, { x0: 0, y0: 0, x1: 400, y1: 240 });
    expect(cut?.axis).toBe('columns');
    expect(cut?.from).toBe(200);
  });

  it('cuts nothing where a line read across both panes leaves no band free', () => {
    const lines = [
      ...maxScreen(0, 0).filter((one) => !one.text.startsWith('PRIVATE')),
      ...raidScreen(1000, 0).filter((one) => !one.text.startsWith('PRIVATE')),
      line('PRIVATE GROUP PRIVATE GROUP', 0, 880, 2000, 905),
      line('a caption over the middle of everything', 0, 300, 2000, 1100),
    ];
    const grey = picture(400, 240);
    expect(textCut(lines, grey, 0.2, { x0: 0, y0: 0, x1: 400, y1: 240 })).toBeNull();
  });

  it('cuts nothing on one screen', () => {
    expect(
      textCut(raidScreen(0, 0), picture(200, 240), 0.2, { x0: 0, y0: 0, x1: 200, y1: 240 }),
    ).toBeNull();
  });
});

describe('seamCut', () => {
  // 2000 × 1200 at a fifth: a map on the left, a screen on the right from x 1000.
  const meeting = picture(400, 240, (x, y) =>
    x >= 200 ? 30 + ((x * 3 + y * 5) % 40) : 150 + ((x + y) % 60),
  );
  const box = { x0: 0, y0: 0, x1: 400, y1: 240 };

  it('cuts a wide picture where one screen meets something else, no text crossing there', () => {
    expect(seamCut(raidScreen(1000, 0), meeting, 0.2, box)).toEqual({
      axis: 'columns',
      from: 200,
      to: 200,
    });
  });

  it('cuts nothing where text crosses the middle, or where the picture goes on alike', () => {
    const across = [...raidScreen(1000, 0), line('a line over the middle', 300, 500, 1700, 540)];
    expect(seamCut(across, meeting, 0.2, box)).toBeNull();
    expect(seamCut(raidScreen(1000, 0), picture(400, 240), 0.2, box)).toBeNull();
  });
});

describe('crossesCut', () => {
  it('tells a cut that text runs across (one screen with a grey band through its words)', () => {
    // A cut of columns 99 to 101 at a tenth of the picture's pixels (990 to 1010).
    const cut = { axis: 'columns' as const, from: 99, to: 101 };
    const across = [line('Temple Sinai Garden', 700, 200, 1300, 260)];
    const beside = [line('Temple', 700, 200, 980, 260), line('Garden', 1020, 200, 1300, 260)];
    // A few pixels past the band are the band's own edges read, not text across it.
    const touching = [line('Garden', 1006, 200, 1300, 260)];
    expect(crossesCut(across, cut, 0.1)).toBe(true);
    expect(crossesCut(beside, cut, 0.1)).toBe(false);
    expect(crossesCut(touching, cut, 0.1)).toBe(false);
    // A row joined across two panes is its pieces, each on its own side.
    const joined = {
      ...line('BATTLE BATTLE', 300, 700, 1700, 740),
      parts: [
        { box: { x0: 300, y0: 700, x1: 500, y1: 740 }, length: 6 },
        { box: { x0: 1500, y0: 700, x1: 1700, y1: 740 }, length: 6 },
      ],
    };
    expect(crossesCut([joined], cut, 0.1)).toBe(false);
    // One piece the detector read across the band whose words are two screens' (two titles
    // that meet at a Duo's spine): it shows the band is between two screens, not through one.
    const titles = [line('Dynamax Skwovet Dynamax Sneasel', 5, 1785, 1994, 1904)];
    expect(crossesCut(titles, cut, 0.1)).toBe(false);
  });
});

describe('paneSide', () => {
  it('names panes one above the other top and bottom, side by side left and right', () => {
    const rows = [
      { index: 1, box: { x0: 0, y0: 0, x1: 1080, y1: 1212 } },
      { index: 2, box: { x0: 0, y0: 1236, x1: 1080, y1: 2448 } },
    ];
    const columns = [
      { index: 1, box: { x0: 70, y0: 0, x1: 1141, y1: 1080 } },
      { index: 2, box: { x0: 1307, y0: 0, x1: 2378, y1: 1080 } },
    ];
    expect(rows.map((pane) => paneSide(pane, rows))).toEqual(['top', 'bottom']);
    expect(columns.map((pane) => paneSide(pane, columns))).toEqual(['left', 'right']);
    // Panes trimmed of their own margins still stand one above the other.
    const trimmed = [rows[0], { index: 2, box: { x0: 208, y0: 1300, x1: 872, y1: 2448 } }].filter(
      (pane) => pane !== undefined,
    );
    expect(trimmed.map((pane) => paneSide(pane, trimmed))).toEqual(['top', 'bottom']);
  });
});

describe('panes, paneShows and cutKept', () => {
  it('cuts a box into the panes before and after the cut', () => {
    expect(
      panesOf({ x0: 0, y0: 10, x1: 100, y1: 200 }, { axis: 'rows', from: 90, to: 99 }),
    ).toEqual([
      { x0: 0, y0: 10, x1: 100, y1: 90 },
      { x0: 0, y0: 99, x1: 100, y1: 200 },
    ]);
  });

  it('keeps a cut whose panes each show one screen or none, one at least a screen', () => {
    const empty = {
      cp: null,
      countdown: null,
      countdownPlace: null,
      countdownBox: null,
      gym: null,
    };
    const raid = paneShows({ ...empty, cp: 54793 }, screenAnchors(raidScreen(0, 0)));
    const max = paneShows({ ...empty, max: {} }, screenAnchors(maxScreen(0, 0)));
    const map = paneShows(empty, []);
    // Only the BATTLE button and PRIVATE GROUP: the bottom of a screen cut through.
    const bottom = paneShows(empty, screenAnchors(raidScreen(0, 0).slice(4, 6)));
    expect([raid, max, map, bottom]).toEqual(['raid', 'max', 'none', 'unclear']);
    expect(cutKept([raid, max])).toBe(true);
    expect(cutKept([map, raid])).toBe(true);
    expect(cutKept([map, map])).toBe(false);
    expect(cutKept([raid, bottom])).toBe(false);
  });

  it('takes an egg by its gym and a countdown alone and centred, never another app’s text', () => {
    const empty = { cp: null, max: null, gym: 'Old Fountain', countdown: 1800 };
    const egg = { x0: 400, y0: 600, x1: 560, y1: 640 };
    const countdown = [{ kind: 'countdown' as const, box: egg }];
    expect(paneShows({ ...empty, countdownPlace: 'centre', countdownBox: egg }, countdown)).toBe(
      'raid',
    );
    // A countdown alone in its line off the middle (a chat message that is only "0:32:10", a
    // map's raid timer) is no screen; centered without a gym read it may be an egg read badly:
    // unclear, so the whole reading stands and no egg is dropped.
    expect(paneShows({ ...empty, countdownPlace: null, countdownBox: egg }, countdown)).toBe(
      'none',
    );
    expect(
      paneShows({ ...empty, gym: null, countdownPlace: 'centre', countdownBox: egg }, countdown),
    ).toBe('unclear');
    // A chat: "omw, 0:32:10 left on mine" in a line of its own, centred by chance, under the
    // channel's name, and "CP 54793 is the hundo right?" (no CP alone in its line).
    const chat = [
      line('# raids-north-side', 100, 96, 400, 133),
      line('omw, 0:32:10 left on mine', 100, 425, 980, 458),
      line('CP 54793 is the hundo right?', 100, 382, 980, 420),
    ];
    const sentence = { x0: 100, y0: 425, x1: 980, y1: 458 };
    expect(
      paneShows(
        { ...empty, gym: '# raids-north-side', countdownPlace: 'centre', countdownBox: sentence },
        screenAnchors(chat),
      ),
    ).toBe('none');
  });
});

/** The line as the reader joins pieces of a row: each `[length, x0, y0, x1, y1]`. */
function joined(one: TextLine, ...parts: [number, number, number, number, number][]): TextLine {
  return {
    ...one,
    parts: parts.map(([length, x0, y0, x1, y1]) => ({ length, box: { x0, y0, x1, y1 } })),
  };
}

describe('paneShows: a raid by its CP', () => {
  /** What a pane shows, read as the reader reads one (`statusBand`: the picture's, or 0). */
  const showsOf = (
    lines: TextLine[],
    status: TextLine[],
    statusBand: number,
    size = { width: 664, height: 670 },
  ) =>
    paneShows(
      readScreenText(lines, status, size, { statusBand }),
      screenAnchors(screenBody(lines, status, statusBand, size.width)),
    );

  // Matt's split of 2026-10-22 (1080x2448): GO's friends list above a max battle, as the reader
  // read it (names invented). The friends' count is a number alone in a line, just tall enough
  // for a CP; the tabs above it are the tallest text near the top, read as a gym and as titles.
  const FRIENDS = [
    joined(
      line('= v5G+', 377.5, 12, 588.9, 48.9),
      [1, 377.5, 14, 502.9, 48.9],
      [4, 502.9, 12, 588.9, 39.9],
    ),
    line('LTE', 506.9, 32.9, 544.4, 51.8),
    // The tabs, read in three pieces: two of them, as tall as the top's tallest text, are titles
    // side by side.
    joined(
      line('ME FRIENDS SOCIAL', 98.8, 69.8, 576.1, 98.7),
      [2, 98.8, 70.8, 143.3, 98.7],
      [7, 279.6, 69.8, 386.3, 97.7],
      [6, 485.2, 69.8, 576.1, 98.7],
    ),
    line('589', 310.3, 106.7, 355.7, 133.6),
    line('SCOPELY', 589.9, 199.4, 649.2, 216.4),
    line('EYPLORE', 587.9, 213.4, 650.2, 230.3),
    joined(
      line('Tamsin ADD FRIEND SEARCH INVITE', 71.1, 287.1, 601.8, 316.1),
      [6, 71.1, 291.1, 136.4, 316.1],
      [10, 192.7, 289.1, 324.1, 313.1],
      [6, 366.6, 288.1, 454.5, 313.1],
      [6, 525.7, 287.1, 601.8, 315.1],
    ),
    joined(
      line('Brightfn!. 2+ days ago', 193.7, 413.8, 622.5, 450.7),
      [10, 193.7, 413.8, 331, 444.7],
      [11, 483.2, 415.8, 622.5, 450.7],
    ),
    line('Brightfnsentyou a Gift!', 293.5, 486.5, 562.2, 513.5),
    joined(
      line('Mossvel 2+ days ago', 192.7, 626.1, 620.5, 661),
      [7, 192.7, 626.1, 320.1, 657],
      [11, 483.2, 629.1, 620.5, 661],
    ),
  ];
  const BAR = [
    line('3:10 AUTO v5G* 80%', -119.2, 12.8, 796.1, 52.1),
    line('Hz LTE', 385.1, 33.9, 541.4, 50.6),
  ];
  const TABS = line('ME FRIENDS SOCIAL', 98.7, 70.7, 575.2, 97.2);
  const BAND = 2448 * 0.045;

  it('shows no screen in GO’s friends list, whose friends’ count reads as a CP', () => {
    // The strip read the tabs, or only the bar; the list as the lower pane, without a bar.
    expect(showsOf(FRIENDS, [...BAR, TABS], BAND)).toBe('none');
    expect(showsOf(FRIENDS, BAR, BAND)).toBe('none');
    expect(showsOf(FRIENDS.slice(2), [], 0)).toBe('none');
  });

  it('keeps two screens in a pane unclear when either shows more of GO than titles', () => {
    const titles = [
      line('Maple Grove', 60, 60, 400, 110),
      line('Old Fountain', 640, 60, 1000, 110),
      line('Walk closer to interact', 200, 1000, 880, 1030),
    ];
    const both = screenAnchors(titles);
    expect(twoScreens(both)).toBe(true);
    const empty = {
      cp: null,
      countdown: null,
      countdownPlace: null,
      countdownBox: null,
      gym: null,
    };
    expect(paneShows(empty, both)).toBe('none');
    const battle = screenAnchors([...titles, line('BATTLE', 400, 1800, 560, 1840)]);
    expect(paneShows(empty, battle)).toBe('unclear');
  });

  const SIZE = { width: 1080, height: 2400 };
  const GYM = line('Maple Grove', 270, 170, 690, 230);
  const CP = line('CP 41234', 300, 1100, 780, 1220);
  const BOSS = line('Dialga', 300, 1230, 780, 1330);

  it('takes a CP for a raid with its countdown or its buttons beside it', () => {
    expect(showsOf([CP, BOSS, line('0:31:02', 860, 700, 1040, 750)], [], 0, SIZE)).toBe('raid');
    expect(showsOf([CP, BOSS, line('BATTLE', 400, 1800, 560, 1840)], [], 0, SIZE)).toBe('raid');
    expect(showsOf([CP, BOSS, line('PRIVATE GROUP', 420, 2000, 660, 2030)], [], 0, SIZE)).toBe(
      'raid',
    );
    // A bare number with its countdown: a raid's CP read without its letters.
    const bare = line('41234', 300, 1100, 780, 1220);
    expect(showsOf([bare, BOSS, line('0:31:02', 860, 700, 1040, 750)], [], 0, SIZE)).toBe('raid');
  });

  it('keeps the whole reading for a CP with its letters and no other sign, drops a bare number', () => {
    // A raid whose countdown was misread: unclear, so no raid is dropped unsaid. A gym is no
    // sign: any screen's tallest text near the top reads as one.
    expect(showsOf([GYM, CP, BOSS], [], 0, SIZE)).toBe('unclear');
    expect(showsOf([CP, BOSS], [], 0, SIZE)).toBe('unclear');
    expect(showsOf([GYM, line('41234', 300, 1100, 780, 1220), BOSS], [], 0, SIZE)).toBe('none');
  });
});
