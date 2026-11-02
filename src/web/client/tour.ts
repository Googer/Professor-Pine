import type { PageNode } from './popup.js';
import type { ViewStorage } from './view.js';

/**
 * The map's walk-through (plan 8M-17, design `docs/superpowers/specs/2026-11-02-web-map-tour-design.md`),
 * its pure part: the steps as data, when it is due, which step comes next, and where the dimming
 * and the card go. A step says what it points at per width: the first target with something
 * showing is the one used, so that one list serves the desktop and the phone. The words explain
 * this page, not the game (Matt, 2026-11-02): only a raid train and what meetups are for are said.
 * `tour-ui.ts` is the page's side.
 */

/** A rectangle on the screen, in pixels. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The screen's size, in pixels. */
export interface Screen {
  width: number;
  height: number;
}

/** What a step may point at: the elements of these selectors, together, and its words there. */
export interface TourTarget {
  selectors: readonly string[];
  words: readonly string[];
}

export interface TourStep {
  id: string;
  heading: string;
  /** Tried in order. None: the step points at nothing. */
  targets: readonly TourTarget[];
  /** Its words when no target shows (a step that is not left out for that). */
  words?: readonly string[];
  /** Left out while none of its targets shows; else shown with no hole. */
  required: boolean;
  /** Presses reach what it points at (Layers alone: a layer's toggle is harmless). */
  pressable?: boolean;
  /** Shows the sample of a raid's marker. */
  sample?: boolean;
}

/** Who a tour is for: a member's page, or the public map. */
export type TourAudience = 'member' | 'visitor';

/** What the steps depend on. */
export interface TourFacts {
  audience: TourAudience;
  /** The box is a member's Find, not "Find a gym" (plan 8M-12). */
  finds: boolean;
  /** How the visitor gets more: the login button, `/maps`, or what the header says they lack. */
  more: 'discord' | 'links' | 'lacking';
}

/** A marker as the map draws a raid's, with words of its own, kept apart from the page's clock. */
export const SAMPLE_MARKER: PageNode = {
  tag: 'div',
  className: 'raid-marker tier-5',
  children: [
    {
      tag: 'span',
      className: 'ring',
      children: [
        {
          tag: 'img',
          attributes: { src: '/eggs/raid_egg_2_icon.png', alt: '', draggable: 'false' },
        },
      ],
    },
    { tag: 'span', className: 'badge', text: 'hatches 2:40' },
    { tag: 'span', className: 'going', text: '4' },
  ],
};

const LAYERS_WHILE_MORE_OPEN = ['#layers .more[open]', '#layers .more[open] .menu'];
const LAYERS_ROW = ['#layers .chips', '#layers .more'];
const LAYERS_PHONE = ['.layers-button'];

function layersStep(audience: TourAudience): TourStep {
  const row =
    audience === 'member'
      ? ['Press a layer to turn it on or off. Try it.', 'More has gyms, PokéStops and others.']
      : ['Open More and turn on Gyms. Try it.'];
  const phone =
    audience === 'member'
      ? ['Press Layers to turn things on or off. Try it.']
      : ['Press Layers and turn on Gyms. Try it.'];
  return {
    id: 'layers',
    heading: 'Choose what shows',
    targets: [
      { selectors: LAYERS_WHILE_MORE_OPEN, words: row },
      { selectors: LAYERS_PHONE, words: phone },
      { selectors: LAYERS_ROW, words: row },
    ],
    required: true,
    pressable: true,
  };
}

function findStep(finds: boolean): TourStep {
  const words = finds
    ? ['Type a name to find reports, trains, meetups and places.']
    : ["Type a gym's name. Gyms must be on."];
  return {
    id: 'find',
    heading: 'Find something',
    targets: [
      { selectors: ['#search-button'], words },
      { selectors: ['#filter'], words },
    ],
    required: true,
  };
}

const AGAIN_STEP: TourStep = {
  id: 'again',
  heading: 'See this again',
  targets: [{ selectors: ['#account .account-menu'], words: ['Map tour is in this menu.'] }],
  required: true,
};

function memberSteps(facts: TourFacts): TourStep[] {
  const browse = ['Everything your layers show, across the server.', 'Press a line to go to it.'];
  return [
    {
      id: 'welcome',
      heading: 'Welcome to the map',
      targets: [],
      words: ['See what is going on, join in and report. A quick look around.'],
      required: false,
    },
    layersStep('member'),
    {
      id: 'read',
      heading: 'Read the map',
      targets: [{ selectors: ['#map .raid-marker'], words: READ_WORDS }],
      words: READ_WORDS,
      required: false,
      sample: true,
    },
    {
      id: 'browse',
      heading: 'Browse what is on',
      targets: [
        { selectors: ['#list-button'], words: ['Press List.', ...browse] },
        { selectors: ['#parties'], words: browse },
      ],
      required: true,
    },
    findStep(facts.finds),
    {
      id: 'report',
      heading: 'Report something',
      targets: [
        { selectors: ['.report-control .report'], words: REPORT_WORDS },
        { selectors: ['#report-button'], words: REPORT_WORDS },
      ],
      required: true,
    },
    AGAIN_STEP,
  ];
}

/** Under the sample of a marker: how to read what is drawn, and the two things to say. */
const READ_WORDS = [
  'A circle shows the boss or egg, the time and how many are going. Zoom in for all of it.',
  'Press anything to open it and join.',
  'A line is a raid train: a group raiding gym after gym.',
  'A ring is a meetup: trades, lure parties, playing as a group.',
];

const REPORT_WORDS = ['Press Report, pick what, pick where on the map, then fill in the form.'];

function visitorSteps(facts: TourFacts): TourStep[] {
  const login: Record<TourFacts['more'], TourTarget> = {
    discord: {
      selectors: ['#account a.login'],
      words: ['Log in to see raids, trains and meetups, and to report.'],
    },
    links: {
      selectors: ['#account .line'],
      words: ['Log in this way to see raids, trains and meetups, and to report.'],
    },
    lacking: {
      selectors: ['#account .line'],
      words: ['This says what you need to see raids, trains and meetups, and to report.'],
    },
  };
  return [
    {
      id: 'welcome',
      heading: 'Welcome to the map',
      targets: [],
      words: ["This server's gyms and regions. A quick look around."],
      required: false,
    },
    layersStep('visitor'),
    findStep(false),
    {
      id: 'more',
      heading: facts.more === 'lacking' ? 'See more' : 'Log in',
      targets: [login[facts.more]],
      required: true,
    },
    AGAIN_STEP,
  ];
}

/** The steps of a tour. */
export function tourSteps(facts: TourFacts): readonly TourStep[] {
  return facts.audience === 'member' ? memberSteps(facts) : visitorSteps(facts);
}

/** The region editor's tour, opened the first time it opens: it shows on a wide screen alone. */
export const EDITOR_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'draw',
    heading: 'Draw and reshape',
    targets: [
      {
        selectors: ['#editor-map .leaflet-pm-toolbar'],
        words: ['Draw a new region, reshape an outline, or move one.'],
      },
    ],
    required: true,
  },
  {
    id: 'panel',
    heading: 'Regions and problems',
    targets: [
      {
        selectors: ['#editor-panel'],
        words: [
          'Pick a region here to split or remove it.',
          'Overlaps and gaps are listed here, with Fix.',
        ],
      },
    ],
    required: true,
  },
  {
    id: 'save',
    heading: 'Save when ready',
    targets: [
      {
        selectors: ['#editor-tools'],
        words: [
          'Nothing goes live until Save…, which checks it first.',
          'Unsaved changes stay in this browser. Undo, Redo and KML files are here too.',
        ],
      },
    ],
    required: true,
  },
  {
    id: 'back',
    heading: 'Back to the map',
    targets: [
      {
        selectors: ['#editor-back'],
        words: ['Leave the editor here. Editor tour is in your menu.'],
      },
    ],
    required: true,
  },
];

/** What the tour needs of `/api/me`. */
export interface TourAsker {
  loggedIn: boolean;
  member?: boolean;
  readOnly?: boolean;
}

/**
 * A member's page for a member and while Discord is away for one logged in: `main.ts` draws the
 * layers and the list for them alike, Report dropping out by not showing.
 */
export function tourAudience(me: TourAsker): TourAudience {
  return me.loggedIn && (me.member === true || me.readOnly === true) ? 'member' : 'visitor';
}

/** Where the browser keeps who the tour was shown as: one for every server, as the layers'. */
export const TOUR_KEY = 'pine-map-tour';

/** Who the tour was shown as in this browser; none where it keeps nothing or cannot say. */
export function readTourSeen(storage: ViewStorage | undefined): TourAudience | undefined {
  try {
    const kept = storage?.getItem(TOUR_KEY);
    return kept === 'member' || kept === 'visitor' ? kept : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keeps that the tour was shown; it only moves up (a member's tour is never forgotten for a
 * visitor's). Whether the browser holds it now: one that cannot would show it at every load.
 */
export function keepTourSeen(storage: ViewStorage | undefined, audience: TourAudience): boolean {
  try {
    if (storage === undefined) return false;
    if (readTourSeen(storage) === 'member') return true;
    storage.setItem(TOUR_KEY, audience);
    return readTourSeen(storage) === audience;
  } catch {
    return false;
  }
}

/** Where the browser keeps that the region editor's tour was shown. */
export const EDITOR_TOUR_KEY = 'pine-editor-tour';

/**
 * Whether the region editor's tour opens now, marked seen if so: once, and not in a browser that
 * cannot keep that.
 */
export function editorTourOpens(storage: ViewStorage | undefined): boolean {
  try {
    if (storage === undefined || storage.getItem(EDITOR_TOUR_KEY) !== null) return false;
    storage.setItem(EDITOR_TOUR_KEY, 'seen');
    return storage.getItem(EDITOR_TOUR_KEY) !== null;
  } catch {
    return false;
  }
}

/** Whether the tour is due: a visitor's once, and a member's once whatever was seen before. */
export function tourDue(seen: TourAudience | undefined, audience: TourAudience): boolean {
  return audience === 'member' ? seen !== 'member' : seen === undefined;
}

/**
 * The target of a step that shows now: the first with something of a size, its rectangles
 * together (`rectsOf`: of a selector's elements on the screen).
 */
export function shownTarget(
  step: TourStep,
  rectsOf: (selector: string) => readonly Rect[],
): { target: TourTarget; hole: Rect } | undefined {
  for (const target of step.targets) {
    const rects = target.selectors
      .flatMap((selector) => rectsOf(selector))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const [first, ...rest] = rects;
    if (first !== undefined) return { target, hole: rest.reduce(unionOf, first) };
  }
  return undefined;
}

function unionOf(one: Rect, other: Rect): Rect {
  const left = Math.min(one.left, other.left);
  const top = Math.min(one.top, other.top);
  return {
    left,
    top,
    width: Math.max(one.left + one.width, other.left + other.width) - left,
    height: Math.max(one.top + one.height, other.top + other.height) - top,
  };
}

/** Which step of a tour is showing; a required step with nothing to point at is passed over. */
export class TourRun {
  private at: number;

  constructor(
    private readonly steps: readonly TourStep[],
    /** Whether a step can be shown now. */
    private readonly shows: (step: TourStep) => boolean,
  ) {
    this.at = this.steps.findIndex((step) => this.shows(step));
  }

  current(): TourStep | undefined {
    return this.steps[this.at];
  }

  /** Moves on; false after the last step. */
  next(): boolean {
    const found = this.steps.findIndex((step, index) => index > this.at && this.shows(step));
    if (found < 0) return false;
    this.at = found;
    return true;
  }

  /** Moves back, where there is a step to go back to. */
  back(): void {
    const earlier = this.steps.slice(0, Math.max(this.at, 0)).filter((step) => this.shows(step));
    const step = earlier.at(-1);
    if (step !== undefined) this.at = this.steps.indexOf(step);
  }

  /** "2 of 6", of the steps that show now and the one showing. */
  position(): { at: number; of: number; first: boolean; last: boolean } {
    const steps = this.steps.filter((step, index) => index === this.at || this.shows(step));
    const current = this.current();
    const at = current === undefined ? 0 : steps.indexOf(current) + 1;
    return { at, of: steps.length, first: at <= 1, last: at === steps.length };
  }
}

/** The room left round a hole, so that the ring does not sit on the control. */
const HOLE_MARGIN = 4;

/** A hole with its margin, kept on the screen. */
export function holeOnScreen(hole: Rect, screen: Screen): Rect {
  const left = Math.max(hole.left - HOLE_MARGIN, 0);
  const top = Math.max(hole.top - HOLE_MARGIN, 0);
  return {
    left,
    top,
    width: Math.min(hole.left + hole.width + HOLE_MARGIN, screen.width) - left,
    height: Math.min(hole.top + hole.height + HOLE_MARGIN, screen.height) - top,
  };
}

/** The four rectangles that dim all but the hole (all of the screen without one). */
export function dimmedAround(hole: Rect | undefined, screen: Screen): Rect[] {
  if (hole === undefined) {
    return [{ left: 0, top: 0, width: screen.width, height: screen.height }];
  }
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;
  return [
    { left: 0, top: 0, width: screen.width, height: hole.top },
    { left: 0, top: bottom, width: screen.width, height: screen.height - bottom },
    { left: 0, top: hole.top, width: hole.left, height: hole.height },
    { left: right, top: hole.top, width: screen.width - right, height: hole.height },
  ];
}

/** How far a card stays from the screen's edge and from the hole. */
const CARD_GAP = 12;

/**
 * Where the card goes: beside the hole on a side it fits, the side with the most room; where it
 * fits on none, the side with the most room all the same, kept on the screen. In the middle
 * without a hole.
 */
export function cardPlace(
  hole: Rect | undefined,
  card: { width: number; height: number },
  screen: Screen,
): { left: number; top: number } {
  const keep = (at: number, size: number, whole: number): number =>
    Math.max(CARD_GAP, Math.min(at, whole - size - CARD_GAP));
  if (hole === undefined) {
    return {
      left: Math.max(CARD_GAP, (screen.width - card.width) / 2),
      top: Math.max(CARD_GAP, (screen.height - card.height) / 2),
    };
  }
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;
  const across = keep(hole.left + hole.width / 2 - card.width / 2, card.width, screen.width);
  const along = keep(hole.top + hole.height / 2 - card.height / 2, card.height, screen.height);
  const sides = [
    {
      room: screen.height - bottom,
      need: card.height + 2 * CARD_GAP,
      left: across,
      top: bottom + CARD_GAP,
    },
    {
      room: hole.top,
      need: card.height + 2 * CARD_GAP,
      left: across,
      top: hole.top - card.height - CARD_GAP,
    },
    {
      room: screen.width - right,
      need: card.width + 2 * CARD_GAP,
      left: right + CARD_GAP,
      top: along,
    },
    {
      room: hole.left,
      need: card.width + 2 * CARD_GAP,
      left: hole.left - card.width - CARD_GAP,
      top: along,
    },
  ];
  const most = (list: typeof sides) =>
    list.reduce<(typeof sides)[number] | undefined>(
      (best, side) => (best === undefined || side.room > best.room ? side : best),
      undefined,
    );
  const side = most(sides.filter((one) => one.room >= one.need)) ?? most(sides);
  return {
    left: keep(side?.left ?? across, card.width, screen.width),
    top: keep(side?.top ?? along, card.height, screen.height),
  };
}

/** What the tour's opening by itself looks at, beyond whether it is due. */
export interface TourMoment {
  /** The list says the map is read-only (Discord away: it waits for a normal visit). */
  readOnly: boolean;
  /** The region editor is off, was not opened on this visit and was not asked by address. */
  editorAlone: boolean;
  /** Nothing is open, typed or being said: `quietPage` of `tour-ui.ts`. */
  quiet: boolean;
}

/** Whether the tour opens by itself now; otherwise it stays due for the next visit. */
export function tourOpensByItself(
  seen: TourAudience | undefined,
  audience: TourAudience,
  moment: TourMoment,
): boolean {
  return tourDue(seen, audience) && !moment.readOnly && moment.editorAlone && moment.quiet;
}
