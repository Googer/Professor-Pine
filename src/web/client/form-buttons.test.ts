import { describe, expect, it } from 'vitest';
import { cancelButton, formRow, isOff, missingOf, sendButton } from './form-buttons.js';

describe('the row of a form (plan 8M-22)', () => {
  it('has the sending button first, then Cancel, the extras, and the missing line last', () => {
    const row = formRow(sendButton('Report', { 'data-submit': 'x' }), cancelButton(), [
      { tag: 'button', text: 'More' },
    ]);
    expect(row.className).toContain('form-buttons');
    expect(row.className).toContain('form-foot');
    expect(row.children?.map((child) => child.text ?? child.className)).toEqual([
      'Report',
      'Cancel',
      'More',
      'form-answer',
    ]);
  });

  it('draws Report off, named by its line, where something is missing', () => {
    const row = formRow(
      sendButton('Report', { 'data-submit': 'x' }),
      cancelButton(),
      [],
      'Pick it.',
    );
    const [send, , line] = row.children ?? [];
    expect(send?.attributes?.['aria-disabled']).toBe('true');
    expect(send?.attributes?.disabled).toBeUndefined();
    expect(line?.text).toBe('Pick it.');
    expect(line?.attributes?.hidden).toBeUndefined();
  });

  it('draws Report on and the line empty and hidden where nothing is missing', () => {
    const row = formRow(sendButton('Report', { 'data-submit': 'x' }), cancelButton());
    const [send, , line] = row.children ?? [];
    expect(send?.attributes?.['aria-disabled']).toBeUndefined();
    expect(line?.text).toBeUndefined();
    expect(line?.attributes?.hidden).toBe('');
  });

  it('has a row without a sending button (the route editor’s Done)', () => {
    const row = formRow(undefined, cancelButton('Done'));
    expect(row.children?.map((child) => child.text ?? child.className)).toEqual([
      'Done',
      'form-answer',
    ]);
  });
});

describe('what a check says', () => {
  it('is the body’s text, or nothing for a body to send', () => {
    expect(missingOf({ text: 'Pick the boss first.' })).toBe('Pick the boss first.');
    expect(missingOf({ body: { boss: 'x' } })).toBeUndefined();
    expect(missingOf({ text: '' })).toBeUndefined();
  });
});

describe('a button that is off', () => {
  const button = (disabled: boolean, aria: string | null) => ({
    disabled,
    getAttribute: (name: string) => (name === 'aria-disabled' ? aria : null),
  });

  it('is disabled, or aria-disabled', () => {
    expect(isOff(button(true, null))).toBe(true);
    expect(isOff(button(false, 'true'))).toBe(true);
    expect(isOff(button(false, 'false'))).toBe(false);
    expect(isOff(button(false, null))).toBe(false);
  });
});
