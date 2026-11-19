import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, make } from '../../../test/support/fake-page.js';
import { liveCheck, sayLine } from './form-check.js';
import { formKeys } from './form-keys.js';

/** A form with a field, Report and its line, as `formRow` draws them. */
function form() {
  const element = make('div');
  const field = make('input');
  field.setAttribute('name', 'boss');
  const row = make('div');
  row.className = 'form-buttons form-foot';
  const send = make('button');
  send.setAttribute('data-submit', 'report');
  const line = make('p');
  line.className = 'form-answer';
  line.setAttribute('hidden', '');
  row.append(send, line);
  element.append(field, row);
  vi.stubGlobal('HTMLElement', FakeElement);
  return { element, field, send, line };
}

describe('the live check of a form (plan 8M-22)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns Report off with the missing line at once, named by the line', () => {
    const made = form();
    liveCheck(made.element as unknown as HTMLElement, () => 'Pick the boss first.');
    expect(made.send.getAttribute('aria-disabled')).toBe('true');
    expect(made.send.disabled).toBe(false);
    expect(made.line.textContent).toBe('Pick the boss first.');
    expect(made.line.hidden).toBe(false);
    const id = made.line.getAttribute('id');
    expect(id).not.toBeNull();
    expect(made.send.getAttribute('aria-describedby')).toBe(id);
  });

  it('runs the check again on every input and change', () => {
    const made = form();
    let missing: string | undefined = 'Pick the boss first.';
    liveCheck(made.element as unknown as HTMLElement, () => missing);
    missing = undefined;
    made.field.dispatch('input');
    expect(made.send.getAttribute('aria-disabled')).toBeNull();
    expect(made.line.textContent).toBe('');
    expect(made.line.hidden).toBe(true);
    missing = 'Type the time first.';
    made.field.dispatch('change');
    expect(made.send.getAttribute('aria-disabled')).toBe('true');
    expect(made.line.textContent).toBe('Type the time first.');
  });

  it('keeps a server’s refusal on the line when run after sending with nothing missing', () => {
    const made = form();
    const check = liveCheck(made.element as unknown as HTMLElement, () => undefined);
    made.line.textContent = 'That raid has ended.';
    made.line.hidden = false;
    check.run(true);
    expect(made.line.textContent).toBe('That raid has ended.');
    expect(made.send.getAttribute('aria-disabled')).toBeNull();
    // The next input is the member's: the line says what the check says.
    made.field.dispatch('input');
    expect(made.line.textContent).toBe('');
  });

  it('says the line once more on a press of an off Report: cleared, then written next frame', () => {
    const made = form();
    const frames: (() => void)[] = [];
    liveCheck(made.element as unknown as HTMLElement, () => 'Pick the boss first.', {
      nextFrame: (run) => frames.push(run),
    });
    made.send.dispatch('click');
    expect(made.line.textContent).toBe('');
    expect(made.line.getAttribute('aria-live')).toBe('polite');
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(made.line.textContent).toBe('Pick the boss first.');
  });

  // Review P9: Enter on an off Report says the line once, as a press of it does.
  it('says the line once more on Enter in a field while Report is off, sending nothing', () => {
    const made = form();
    const frames: (() => void)[] = [];
    const sent: number[] = [];
    made.send.addEventListener('click', () => sent.push(1));
    liveCheck(made.element as unknown as HTMLElement, () => 'Pick the boss first.', {
      nextFrame: (run) => frames.push(run),
    });
    formKeys(made.element as unknown as HTMLElement);
    made.field.setAttribute('type', 'text');
    made.field.dispatch('keydown', {
      key: 'Enter',
      keyCode: 13,
      repeat: false,
      isComposing: false,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
    });
    expect(sent).toEqual([]);
    expect(made.line.textContent).toBe('');
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(made.line.textContent).toBe('Pick the boss first.');
  });

  it('says nothing on a press of Report while it is on', () => {
    const made = form();
    const frames: (() => void)[] = [];
    liveCheck(made.element as unknown as HTMLElement, () => undefined, {
      nextFrame: (run) => frames.push(run),
    });
    made.send.dispatch('click');
    expect(frames).toHaveLength(0);
  });
});

// Branch review W1: a line becomes live before its text changes, or screen readers miss it.
describe('a line said after a press (sayLine)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is made live and cleared, then written on the next frame', () => {
    const made = form();
    made.line.textContent = 'Pick the boss first.';
    const frames: (() => void)[] = [];
    sayLine(made.line as unknown as HTMLElement, 'This raid is over.', (run) => frames.push(run));
    expect(made.line.getAttribute('aria-live')).toBe('polite');
    expect(made.line.textContent).toBe('');
    expect(made.line.hidden).toBe(false);
    frames[0]?.();
    expect(made.line.textContent).toBe('This raid is over.');
  });
});
