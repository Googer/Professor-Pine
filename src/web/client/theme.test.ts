import { describe, expect, it } from 'vitest';
import {
  DRAWN_COLOURS,
  MISSING_COLOUR,
  readTheme,
  REGION_PALETTE,
  DRAWN_OPACITIES,
  DRAWN_SIZES,
  ThemeWatch,
  type SchemeQuery,
} from './theme.js';
import { choiceIsDark, type ThemeChoice } from './theme-choice.js';

/** A `matchMedia('(prefers-color-scheme: dark)')` of the test's, whose scheme it changes. */
function fakeScheme(dark: boolean): SchemeQuery & { change(dark: boolean): void } {
  const listeners: Array<() => void> = [];
  return {
    matches: dark,
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    change(next) {
      this.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('ThemeWatch (plan 8M-7)', () => {
  it('reads the theme once, and again when the device changes between light and dark', () => {
    const scheme = fakeScheme(false);
    let reads = 0;
    const watch = new ThemeWatch((property) => {
      reads += 1;
      return property === '--gym' ? (scheme.matches ? '#3ba55c' : '#2d7a3a') : '#123456';
    }, scheme);
    expect(watch.theme().colours.gym).toBe('#2d7a3a');
    const once = reads;
    expect(watch.theme().colours.gym).toBe('#2d7a3a');
    expect(reads).toBe(once);
    expect(watch.dark()).toBe(false);

    const told: string[] = [];
    watch.onChange((theme) => told.push(theme.colours.gym));
    scheme.change(true);
    expect(told).toEqual(['#3ba55c']);
    expect(watch.theme().colours.gym).toBe('#3ba55c');
    expect(watch.dark()).toBe(true);
  });

  it('is light and never changes where the browser cannot say its scheme', () => {
    const watch = new ThemeWatch(() => '#123456', undefined);
    expect(watch.dark()).toBe(false);
    expect(watch.theme().colours.raid).toBe('#123456');
  });

  // Plan 8M-13 (S10): Light, Dark or Device, chosen on the page.
  describe('with a choice of Light, Dark or Device', () => {
    /** A watch over a scheme and a choice of the test's; the page's colors follow both. */
    const watched = (device: boolean, chosen: ThemeChoice) => {
      const scheme = fakeScheme(device);
      const choice = { now: chosen };
      const dark = () => choiceIsDark(choice.now, scheme.matches);
      const watch = new ThemeWatch(
        (property) => (property === '--gym' ? (dark() ? 'dark-gym' : 'light-gym') : '#123456'),
        scheme,
        () => choice.now,
      );
      const told: string[] = [];
      watch.onChange((theme) => told.push(theme.colours.gym));
      return { scheme, choice, watch, told };
    };

    it('is the choice, else the device', () => {
      expect(watched(false, 'dark').watch.dark()).toBe(true);
      expect(watched(true, 'light').watch.dark()).toBe(false);
      expect(watched(true, 'device').watch.dark()).toBe(true);
    });

    it('tells the tiles and colors when the choice changes what is drawn', () => {
      const { choice, watch, told } = watched(false, 'device');
      expect(watch.theme().colours.gym).toBe('light-gym');
      choice.now = 'dark';
      watch.chosen();
      expect(told).toEqual(['dark-gym']);
      expect(watch.dark()).toBe(true);
      // Device on a light device: light again.
      choice.now = 'device';
      watch.chosen();
      expect(told).toEqual(['dark-gym', 'light-gym']);
      // Light from Device on a light device changes nothing drawn: nobody is told.
      choice.now = 'light';
      watch.chosen();
      expect(told).toEqual(['dark-gym', 'light-gym']);
    });

    it('follows the device only while the choice is Device', () => {
      const forced = watched(false, 'light');
      forced.scheme.change(true);
      expect(forced.told).toEqual([]);
      expect(forced.watch.dark()).toBe(false);
      const device = watched(false, 'device');
      device.scheme.change(true);
      expect(device.told).toEqual(['dark-gym']);
    });
  });
});

describe('readTheme', () => {
  it("reads each drawn colour and the editor's palette from their custom properties", () => {
    const asked: string[] = [];
    const theme = readTheme((property) => {
      asked.push(property);
      return property === '--raid' ? '  #c0392b ' : `value of ${property}`;
    });
    expect(theme.colours.raid).toBe('#c0392b');
    expect(theme.colours.train).toBe('value of --train');
    expect(theme.palette).toEqual(REGION_PALETTE.map((property) => `value of ${property}`));
    expect(asked.sort()).toEqual(
      [
        ...Object.values(DRAWN_COLOURS),
        ...REGION_PALETTE,
        ...Object.values(DRAWN_SIZES),
        ...Object.values(DRAWN_OPACITIES),
      ].sort(),
    );
  });

  it('draws a property the stylesheet lacks in grey, so that the shape still shows', () => {
    const theme = readTheme((property) => (property === '--gap' ? ' ' : '#123456'));
    expect(theme.colours.gap).toBe(MISSING_COLOUR);
    expect(theme.colours.overlap).toBe('#123456');
  });
});

describe('the sizes of a raid marker (Matt, 2026-10-25)', () => {
  it('are read from theme.css in pixels, the usual ones where it lacks them', () => {
    const theme = readTheme((property) => (property === '--raid-middle' ? ' 32px ' : ''));
    expect(theme.sizes).toEqual({
      raidFull: 44,
      raidMiddle: 32,
      raidSmall: 20,
      badgeSize: 20,
    });
  });
});

describe("the opacities of a train's line (plan 8M-11B, S27)", () => {
  it('are read from theme.css, the usual ones where it lacks them or they are out of range', () => {
    const theme = readTheme((property) => (property === '--train-done' ? ' 0.3 ' : ''));
    expect(theme.opacities).toEqual({ trainAhead: 0.8, trainDone: 0.3 });
    const wrong = readTheme((property) => (property === '--train-ahead' ? '2' : ''));
    expect(wrong.opacities).toEqual({ trainAhead: 0.8, trainDone: 0.35 });
  });
});
