import { describe, expect, it, vi } from 'vitest';
import { addPickAgain, pickAgainPressed } from './pick-again.js';
import type { PageNode } from './popup.js';

// The unit suite has no DOM: a drawn node is the node itself, and the form's buttons are fakes
// that record what was put before them and whether they were pressed. Isolated: a mocked module
// needs a module graph of its own.
vi.mock('./popup.js', () => ({ renderNode: (node: PageNode) => node }));

/** A button of a form's row: its data, whether it is off, and how often it was pressed. */
function button(data: Record<string, string>, disabled = false) {
  const made = {
    dataset: data,
    disabled,
    pressed: 0,
    parentElement: undefined as unknown,
    closest: (selector: string) =>
      selector === 'button[data-pick-again]' && 'pickAgain' in data ? made : null,
    click: () => {
      made.pressed += 1;
    },
  };
  return made;
}

/** A row of buttons, each one's parent. */
function row(...buttons: ReturnType<typeof button>[]) {
  const parent = {
    querySelector: (selector: string) =>
      selector === ':scope > [data-cancel]'
        ? (buttons.find((one) => 'cancel' in one.dataset) ?? null)
        : null,
  };
  for (const one of buttons) one.parentElement = parent;
  return buttons;
}

describe('"← Another …" in a form (Matt, 2026-11-02)', () => {
  it('goes before each Cancel of a form step 2 opened, and nowhere else', () => {
    const put: unknown[] = [];
    const cancel = { before: (node: unknown) => put.push(node) };
    const form = {
      ownerDocument: {},
      querySelectorAll: (selector: string) =>
        selector === '.form-buttons > [data-cancel]' ? [cancel] : [],
    } as unknown as HTMLElement;
    addPickAgain(form, 'raid');
    expect(put).toMatchObject([{ text: '← Another gym' }]);
    addPickAgain(form, undefined);
    addPickAgain(form, 'research');
    expect(put).toHaveLength(1);
  });

  it("presses the form's Cancel, then starts step 2 of its kind again", () => {
    const [again, cancel] = row(button({ pickAgain: 'max' }), button({ cancel: '' }));
    const restarted: string[] = [];
    expect(
      pickAgainPressed(again as unknown as Element, (kind) => {
        restarted.push(kind);
      }),
    ).toBe(true);
    expect(cancel?.pressed).toBe(1);
    expect(restarted).toEqual(['max']);
  });

  it('does nothing while an answer is on its way (Cancel off), and leaves other presses alone', () => {
    const [again, cancel] = row(button({ pickAgain: 'rocket' }), button({ cancel: '' }, true));
    const restarted: string[] = [];
    const restart = (kind: string) => {
      restarted.push(kind);
    };
    expect(pickAgainPressed(again as unknown as Element, restart)).toBe(true);
    expect(cancel?.pressed).toBe(0);
    expect(pickAgainPressed(cancel as unknown as Element, restart)).toBe(false);
    expect(restarted).toEqual([]);
  });
});
