import type { PageNode } from './popup.js';
import type { KeyValueStorage } from './staged-storage.js';

/**
 * Light, Dark or Device (plan 8M-13, S10): the map's and the region editor's theme, chosen in the
 * account menu (or the visitor's ⋮ button) and kept in the browser. Device, the default, follows
 * the device as the pages always did. The page sets `data-theme="light" | "dark"` on `<html>` for
 * a forced choice and nothing for Device; the stylesheets' dark rules apply where the page is not
 * forced light and the device is dark, and wherever it is forced dark (`theme.css`; the build adds
 * the forced copy, `scripts/web/forced-dark.ts`). The head script (`theme-head.ts`) applies the
 * kept choice before the page is drawn. Imports nothing at run time: the head script is tiny.
 */

export type ThemeChoice = 'light' | 'dark' | 'device';

/** The choices in the order the menu offers them. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'device'];

/** Where the browser keeps the choice: one for every server, as the layers'. */
export const THEME_KEY = 'pine-map-theme';

/** Each choice's word in the menu. */
const THEME_WORDS: Readonly<Record<ThemeChoice, string>> = {
  light: 'Light',
  dark: 'Dark',
  device: 'Device',
};

/** The choice the browser keeps (`browserStorage`), Device where it keeps none or cannot say. */
export function readThemeChoice(storage: KeyValueStorage | undefined): ThemeChoice {
  try {
    const kept = storage?.getItem(THEME_KEY);
    return kept === 'light' || kept === 'dark' ? kept : 'device';
  } catch {
    return 'device';
  }
}

/** Keeps a choice: Light or Dark under `THEME_KEY`, Device by forgetting it; never throws. */
export function keepThemeChoice(storage: KeyValueStorage | undefined, choice: ThemeChoice): void {
  try {
    if (choice === 'device') storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or a full storage: the choice holds for this visit.
  }
}

/** Sets the page's `data-theme` for a forced choice, and takes it off for Device. */
export function applyThemeChoice(
  root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
  choice: ThemeChoice,
): void {
  if (choice === 'device') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Whether the page is dark: by the choice, else by the device. */
export function choiceIsDark(choice: ThemeChoice, deviceDark: boolean): boolean {
  return choice === 'device' ? deviceDark : choice === 'dark';
}

/**
 * The menu's item "Theme: Light · Dark · Device", a button per choice (`data-theme-choice`), the
 * current one pressed.
 */
export function themeItemNode(current: ThemeChoice): PageNode {
  const children: PageNode[] = [{ tag: 'span', className: 'theme-label', text: 'Theme: ' }];
  THEME_CHOICES.forEach((choice, index) => {
    if (index > 0) {
      children.push({ tag: 'span', text: ' · ', attributes: { 'aria-hidden': 'true' } });
    }
    children.push({
      tag: 'button',
      className: choice === current ? 'theme-option chosen' : 'theme-option',
      text: THEME_WORDS[choice],
      attributes: {
        type: 'button',
        'data-theme-choice': choice,
        'aria-pressed': String(choice === current),
      },
    });
  });
  return {
    tag: 'div',
    className: 'theme-choice',
    attributes: { role: 'group', 'aria-label': 'Theme' },
    children,
  };
}
