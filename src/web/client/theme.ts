/**
 * The colours the pages draw with Leaflet (plan 8M-6): outlines, dots, lines and rings, which no
 * stylesheet reaches. Their values are custom properties of `theme.css`, beside every other
 * colour and the sizes a restyle would touch, so that the look is changed in one file; the page
 * reads them at its first drawing (`theme()`), the stylesheet having loaded before the script,
 * and again when the device changes between light and dark (plan 8M-7: `theme.css` has a set of
 * values for each; `onThemeChange`). No colour is written anywhere else in the pages' code
 * (`page-theme.test.ts`).
 */

import { browserStorage } from './staged-storage.js';
import {
  applyThemeChoice,
  choiceIsDark,
  keepThemeChoice,
  type ThemeChoice,
} from './theme-choice.js';

/** Each colour drawn from TypeScript, by the custom property of `theme.css` that holds it. */
export const DRAWN_COLOURS = {
  /** The map's gym dots. */
  gym: '--gym',
  /** The map's region outlines. */
  region: '--region',
  /** A raid's dot, and the ring round its picture. */
  raid: '--raid',
  /** A train's line and stop, and route mode's numbers. */
  train: '--train',
  /** A meetup's ring. */
  meetup: '--meetup',
  /** The PokéStops shown while a meetup's place is picked. */
  stop: '--stop',
  /** The activity heatmap's circles (plan 8H-4). */
  activity: '--activity',
  /** Your location (plan 8M-7): the blue dot and its accuracy, and the dot's edge. */
  you: '--you',
  youEdge: '--you-edge',
  /** The region editor: other servers' outlines. */
  others: '--others',
  /** The region editor: an outline that cannot be saved. */
  broken: '--broken',
  /** The region editor: gyms, PokéStops, power spots and Wayfarer gyms. */
  editorGym: '--editor-gym',
  editorStop: '--editor-stop',
  powerSpot: '--power-spot',
  wayfarerGym: '--wayfarer-gym',
  /** The region editor: a place in no region. */
  outside: '--outside',
  /** The region editor: overlaps and gaps. */
  overlap: '--overlap',
  gap: '--gap',
  /** The region editor: a region somebody else changed. */
  theirs: '--theirs',
  /** The region editor: the outlines a fix would draw. */
  preview: '--preview',
} as const;

/** The region editor's colours of regions, in turn. */
export const REGION_PALETTE = [
  '--region-1',
  '--region-2',
  '--region-3',
  '--region-4',
  '--region-5',
  '--region-6',
  '--region-7',
  '--region-8',
] as const;

export type DrawnColour = keyof typeof DRAWN_COLOURS;

/**
 * The sizes the page draws with Leaflet (Matt, 2026-10-25): a raid marker's circle at each size
 * (full from zoom 15, middle at 14, small below), in pixels, which the rings round it and the tap
 * target follow; by their custom properties of `theme.css`.
 */
export const DRAWN_SIZES = {
  raidFull: '--raid-full',
  raidMiddle: '--raid-middle',
  raidSmall: '--raid-small',
  /** A selected train's number on a stop. */
  badgeSize: '--badge-size',
} as const;

/** What a size the stylesheet lacks gives. */
const SIZE_DEFAULTS: Readonly<Record<keyof typeof DRAWN_SIZES, number>> = {
  raidFull: 44,
  raidMiddle: 30,
  raidSmall: 20,
  badgeSize: 20,
};

/**
 * The opacities the page draws a train's line with (plan 8M-11B, S27): the legs ahead, and the
 * legs it has done, fainter; by their custom properties of `theme.css`, from 0 to 1.
 */
export const DRAWN_OPACITIES = {
  trainAhead: '--train-ahead',
  trainDone: '--train-done',
} as const;

/** What an opacity the stylesheet lacks (or gives out of range) gives. */
const OPACITY_DEFAULTS: Readonly<Record<keyof typeof DRAWN_OPACITIES, number>> = {
  trainAhead: 0.8,
  trainDone: 0.35,
};

export interface Theme {
  colours: Readonly<Record<DrawnColour, string>>;
  /** Never empty. */
  palette: readonly string[];
  sizes: Readonly<Record<keyof typeof DRAWN_SIZES, number>>;
  opacities: Readonly<Record<keyof typeof DRAWN_OPACITIES, number>>;
}

/** What a property the stylesheet lacks gives: grey, so that what is drawn still shows. */
export const MISSING_COLOUR = 'gray';

/** The theme as `read` gives each custom property (its value, or empty when there is none). */
export function readTheme(read: (property: string) => string): Theme {
  const value = (property: string): string => read(property).trim() || MISSING_COLOUR;
  const colours = Object.fromEntries(
    Object.entries(DRAWN_COLOURS).map(([name, property]) => [name, value(property)]),
  ) as Record<DrawnColour, string>;
  const sizes = Object.fromEntries(
    Object.entries(DRAWN_SIZES).map(([name, property]) => {
      const px = Number.parseFloat(read(property));
      return [name, Number.isFinite(px) ? px : SIZE_DEFAULTS[name as keyof typeof DRAWN_SIZES]];
    }),
  ) as Record<keyof typeof DRAWN_SIZES, number>;
  const opacities = Object.fromEntries(
    Object.entries(DRAWN_OPACITIES).map(([name, property]) => {
      const text = read(property).trim();
      const opacity = text === '' ? Number.NaN : Number(text);
      const usual = OPACITY_DEFAULTS[name as keyof typeof DRAWN_OPACITIES];
      return [name, opacity >= 0 && opacity <= 1 ? opacity : usual];
    }),
  ) as Record<keyof typeof DRAWN_OPACITIES, number>;
  return { colours, palette: REGION_PALETTE.map(value), sizes, opacities };
}

/**
 * What the page asks of the browser's `matchMedia('(prefers-color-scheme: dark)')`: whether the
 * device is dark now, and a listener for when it changes.
 */
export interface SchemeQuery {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

/**
 * The theme of a page (plan 8M-7): read once, and read again when what is drawn turns light or
 * dark (`theme.css` holds a set of values for each), after which every listener is told, so that
 * what Leaflet drew is drawn in the new colors. Dark is the member's choice (plan 8M-13, S10:
 * Light, Dark or Device, `choice`), else the device's scheme; a change of either that turns the
 * page tells. Without a query (a browser that cannot say) the device is light.
 */
export class ThemeWatch {
  private current: Theme | undefined;
  private readonly listeners: Array<(theme: Theme) => void> = [];
  /** Whether the page was dark when last told (or first asked). */
  private wasDark: boolean;

  constructor(
    private readonly read: (property: string) => string,
    private readonly query: SchemeQuery | undefined,
    private readonly choice: () => ThemeChoice = () => 'device',
  ) {
    this.wasDark = this.dark();
    query?.addEventListener('change', () => {
      this.changed();
    });
  }

  theme(): Theme {
    this.current ??= readTheme(this.read);
    return this.current;
  }

  /** Whether the page is dark now: by the choice, else by the device. */
  dark(): boolean {
    return choiceIsDark(this.choice(), this.query?.matches ?? false);
  }

  /** The member chose another theme (its `data-theme` already set): told where it turned. */
  chosen(): void {
    this.changed();
  }

  /** The theme read anew and every listener told, where the page turned light or dark. */
  private changed(): void {
    const dark = this.dark();
    if (dark === this.wasDark) return;
    this.wasDark = dark;
    this.current = undefined;
    const next = this.theme();
    for (const listener of this.listeners) listener(next);
  }

  /** Tells `listener` the new theme after each change of the scheme. */
  onChange(listener: (theme: Theme) => void): void {
    this.listeners.push(listener);
  }
}

let watch: ThemeWatch | undefined;

/**
 * The choice the page shows now: its `data-theme` (set by the head script from what the browser
 * keeps, `theme-head.ts`, and by `chooseTheme`), Device without one.
 */
export function shownThemeChoice(): ThemeChoice {
  const shown = document.documentElement.getAttribute('data-theme');
  return shown === 'light' || shown === 'dark' ? shown : 'device';
}

/**
 * Said on the document when the member chose a theme (`chooseTheme`): the region editor's
 * bundle keeps a watch of its own, which hears it as the map's does.
 */
const THEME_CHOSEN = 'pine-theme-chosen';

/** The page's own watch, made at the first call, told of the device's changes and the choice's. */
function pageWatch(): ThemeWatch {
  if (watch) return watch;
  const made = new ThemeWatch(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property),
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined,
    shownThemeChoice,
  );
  document.addEventListener(THEME_CHOSEN, () => {
    made.chosen();
  });
  watch = made;
  return made;
}

/** The page's theme, read from `:root` at the first call and again after a change of scheme. */
export function theme(): Theme {
  return pageWatch().theme();
}

/** Whether the page is dark now: the member's choice, else the device (plan 8M-13, S10). */
export function darkScheme(): boolean {
  return pageWatch().dark();
}

/**
 * The member chose Light, Dark or Device (plan 8M-13, S10): kept in the browser, set on the page
 * (`data-theme`), and the tiles and colors told where the page turned.
 */
export function chooseTheme(choice: ThemeChoice): void {
  keepThemeChoice(
    browserStorage(() => window.localStorage),
    choice,
  );
  applyThemeChoice(document.documentElement, choice);
  pageWatch();
  document.dispatchEvent(new Event(THEME_CHOSEN));
}

/** Calls `listener` after each change between light and dark, the theme read anew. */
export function onThemeChange(listener: (theme: Theme) => void): void {
  pageWatch().onChange(listener);
}
