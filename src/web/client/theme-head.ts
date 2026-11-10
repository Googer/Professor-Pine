import { browserStorage } from './staged-storage.js';
import { applyThemeChoice, readThemeChoice } from './theme-choice.js';

/**
 * The map page's head script (plan 8M-13, S10): a classic script of its own (`<script src>`, the
 * CSP lets nothing inline in), run before the page is drawn, that sets the theme the browser
 * keeps on `<html>` (`data-theme`), so that the page does not show the device's scheme first.
 * Built as `assets/theme-<hash>.js` (`scripts/web/build.ts`).
 */
applyThemeChoice(
  document.documentElement,
  readThemeChoice(browserStorage(() => window.localStorage)),
);
