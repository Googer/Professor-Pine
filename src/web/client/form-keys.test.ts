import { describe, expect, it } from 'vitest';
import { formKeys } from './form-keys.js';

interface KeyEvent {
  key: string;
  target: unknown;
  defaultPrevented: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

/** A field of a form, as the event's target: its tag and attributes. */
const field = (tag: string, attributes: Record<string, string> = {}, form = 'manage') => ({
  tagName: tag,
  closest: (selector: string) => (selector === `[data-form="${form}"]` ? {} : null),
  getAttribute: (name: string) => attributes[name] ?? null,
  hasAttribute: (name: string) => name in attributes,
});

const TEXT = field('INPUT', { type: 'text' });

/** A form with its Submit and Cancel (or without), the keydown listener it was given, what was done. */
function form(buttons: { cancel?: boolean; submit?: boolean } = {}) {
  const { cancel = true, submit = true } = buttons;
  const done: string[] = [];
  let listener: ((event: KeyEvent) => void) | undefined;
  const pressable = (name: string) => ({
    click: () => {
      done.push(name);
    },
  });
  const element = {
    addEventListener: (type: string, handler: (event: KeyEvent) => void) => {
      if (type === 'keydown') listener = handler;
    },
    querySelector: (selector: string) => {
      if (cancel && selector === 'button[data-cancel]') return pressable('cancel');
      if (submit && selector === 'button[data-submit]') return pressable('submit');
      return null;
    },
  };
  const press = (key: string, target: unknown = TEXT, more: Partial<KeyEvent> = {}) => {
    listener?.({
      key,
      target,
      defaultPrevented: false,
      repeat: false,
      isComposing: false,
      keyCode: 13,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      stopPropagation: () => {
        done.push('stopped');
      },
      preventDefault: () => {
        done.push('prevented');
      },
      ...more,
    });
  };
  formKeys(element as unknown as HTMLElement);
  return { done, press };
}

describe('Escape in a form of the map (plan 8M-11A, S16)', () => {
  it('closes the form as its Cancel does, and goes no further: the popup under it stays', () => {
    const { done, press } = form();
    press('Escape');
    expect(done).toEqual(['stopped', 'prevented', 'cancel']);
  });

  it('leaves other keys, a key a field took already, and a form without Cancel alone', () => {
    const some = form();
    some.press('a');
    some.press('Escape', TEXT, { defaultPrevented: true });
    expect(some.done).toEqual([]);
    const none = form({ cancel: false });
    none.press('Escape');
    expect(none.done).toEqual([]);
  });
});

// Matt, 2026-10-31: the forms are no `<form>`, so the browser's own Enter does nothing in them.
describe('Enter in a form of the map', () => {
  it.each([
    ['a text field', TEXT],
    ['a field of no type', field('INPUT')],
    ['a radio choice', field('INPUT', { type: 'radio' })],
    ['a checkbox', field('INPUT', { type: 'checkbox' })],
  ])('presses Submit from %s, and goes no further', (_name, target) => {
    const { done, press } = form();
    press('Enter', target);
    expect(done).toEqual(['stopped', 'prevented', 'submit']);
  });

  it.each([
    // Enter is a new line there, as in every dialog.
    ['a text area', field('TEXTAREA')],
    // Enter opens the list or picks from it.
    ['a menu', field('SELECT')],
    // Enter presses that button: Cancel stays Cancel.
    ['a button', field('BUTTON')],
    // Enter there searches: research's task box, whose member has not picked yet.
    ['a search box', field('INPUT', { type: 'search' })],
    // Enter there may pick a suggestion: a spawn's Pokémon, a typed reward.
    ['a field with suggestions', field('INPUT', { type: 'text', list: 'pokemon' })],
    // Staff's Delete…: an arrow key checks "Delete post", which has no undo.
    ['the choice of Delete…', field('INPUT', { type: 'radio' }, 'close')],
  ])('leaves %s to itself', (_name, target) => {
    const { done, press } = form();
    press('Enter', target);
    expect(done).toEqual([]);
  });

  it.each([
    ['held down', { repeat: true }],
    ['ending a composition', { isComposing: true }],
    // Safari ends the composition before the key: only this says so.
    ['ending a composition in Safari', { keyCode: 229 }],
    ['with Shift', { shiftKey: true }],
    ['with Ctrl', { ctrlKey: true }],
    ['with Alt', { altKey: true }],
    ['with the Meta key', { metaKey: true }],
    ['taken by the field already', { defaultPrevented: true }],
  ])('sends nothing %s', (_name, more) => {
    const { done, press } = form();
    press('Enter', TEXT, more);
    expect(done).not.toContain('submit');
  });

  // A held Enter whose answer moved the focus to a button: its repeats would press it (review 5).
  it('stops a key held down on a button from pressing it, and leaves a text area its lines', () => {
    const button = form();
    button.press('Enter', field('BUTTON'), { repeat: true });
    expect(button.done).toEqual(['prevented']);
    const area = form();
    area.press('Enter', field('TEXTAREA'), { repeat: true });
    expect(area.done).toEqual([]);
  });

  it('leaves a form without Submit alone', () => {
    const { done, press } = form({ submit: false });
    press('Enter');
    expect(done).toEqual([]);
  });
});
