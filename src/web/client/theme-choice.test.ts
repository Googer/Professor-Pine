import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from './staged-storage.js';
import {
  applyThemeChoice,
  choiceIsDark,
  keepThemeChoice,
  readThemeChoice,
  THEME_KEY,
  themeItemNode,
} from './theme-choice.js';

/** A storage of the test's: what it holds, or one that throws at every use. */
function storage(held: Record<string, string> = {}, throws = false): KeyValueStorage {
  const check = () => {
    if (throws) throw new Error('storage forbidden');
  };
  return {
    getItem: (key) => {
      check();
      return held[key] ?? null;
    },
    setItem: (key, value) => {
      check();
      held[key] = value;
    },
    removeItem: (key) => {
      check();
      delete held[key];
    },
  };
}

describe('the theme chosen in the browser (plan 8M-13, S10)', () => {
  it('is Device unless the browser keeps Light or Dark under pine-map-theme', () => {
    expect(THEME_KEY).toBe('pine-map-theme');
    expect(readThemeChoice(storage())).toBe('device');
    expect(readThemeChoice(storage({ 'pine-map-theme': 'dark' }))).toBe('dark');
    expect(readThemeChoice(storage({ 'pine-map-theme': 'light' }))).toBe('light');
    expect(readThemeChoice(storage({ 'pine-map-theme': 'purple' }))).toBe('device');
    // A blocked storage, or none at all, leaves Device.
    expect(readThemeChoice(storage({ 'pine-map-theme': 'dark' }, true))).toBe('device');
    expect(readThemeChoice(undefined)).toBe('device');
  });

  it('keeps Light or Dark, and forgets the choice for Device', () => {
    const held: Record<string, string> = {};
    keepThemeChoice(storage(held), 'dark');
    expect(held).toEqual({ 'pine-map-theme': 'dark' });
    keepThemeChoice(storage(held), 'device');
    expect(held).toEqual({});
    // A storage that keeps nothing: the choice holds for the visit, nothing thrown.
    expect(() => {
      keepThemeChoice(storage({}, true), 'light');
    }).not.toThrow();
    expect(() => {
      keepThemeChoice(undefined, 'light');
    }).not.toThrow();
  });

  it('sets data-theme on the page for a forced choice, and nothing for Device', () => {
    const attributes = new Map<string, string>();
    const root = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    };
    applyThemeChoice(root, 'dark');
    expect(attributes.get('data-theme')).toBe('dark');
    applyThemeChoice(root, 'light');
    expect(attributes.get('data-theme')).toBe('light');
    applyThemeChoice(root, 'device');
    expect(attributes.has('data-theme')).toBe(false);
  });

  it('is dark by the choice, else by the device', () => {
    expect(choiceIsDark('dark', false)).toBe(true);
    expect(choiceIsDark('light', true)).toBe(false);
    expect(choiceIsDark('device', true)).toBe(true);
    expect(choiceIsDark('device', false)).toBe(false);
  });

  it('is offered as "Theme: Light · Dark · Device", the current one marked', () => {
    const node = themeItemNode('dark');
    const buttons = (node.children ?? []).filter((child) => child.tag === 'button');
    const words = (node.children ?? []).map((child) => child.text ?? '').join('');
    expect(words).toBe('Theme: Light · Dark · Device');
    expect(buttons.map((button) => button.attributes?.['data-theme-choice'])).toEqual([
      'light',
      'dark',
      'device',
    ]);
    expect(buttons.map((button) => button.attributes?.['aria-pressed'])).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(node.attributes).toMatchObject({ role: 'group', 'aria-label': 'Theme' });
  });
});
