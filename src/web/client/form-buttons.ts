import type { PageNode } from './popup.js';

/**
 * The button that sends a form on the map (Submit, Report, Start, Make the meetup …): the
 * primary blue in every form, as Discord's dialogs draw Submit (Matt, 2026-11-07: "just be
 * consistent"). Cancel, Back and the form's other buttons stay gray. Every form builds its
 * sending button here, so the color is decided once.
 */
export function sendButton(text: string, attributes: Record<string, string>): PageNode {
  return {
    tag: 'button',
    className: 'press primary',
    text,
    attributes: { type: 'button', ...attributes },
  };
}

/** A form's Cancel (or the route editor's Done): gray, `data-cancel`, which Escape presses. */
export function cancelButton(text = 'Cancel', className = 'press'): PageNode {
  return { tag: 'button', className, text, attributes: { type: 'button', 'data-cancel': '' } };
}

/**
 * The row of a form (plan 8M-22), built once for every form: the sending button first, Cancel,
 * the form's other buttons (`extras`; "← Another …" is put before Cancel as `addPickAgain` has
 * it), then the missing line, the form's `.form-answer`, where the check says what is missing
 * and the server's answer is said (small muted text right of the buttons, wrapping below them:
 * the buttons never move with its text). With something `missing` the sending button is drawn
 * off: `aria-disabled`, not `disabled`, so that it keeps the focus and a press says the line
 * (`liveCheck`). The row is pinned under the form's body where the form has a frame of its own
 * (`map.css`, `.form-foot`).
 */
export function formRow(
  send: PageNode | undefined,
  cancel: PageNode,
  extras: readonly PageNode[] = [],
  missing?: string,
): PageNode {
  const off = missing !== undefined && missing !== '';
  const sending: PageNode[] =
    send === undefined
      ? []
      : [off ? { ...send, attributes: { ...send.attributes, 'aria-disabled': 'true' } } : send];
  return {
    tag: 'div',
    className: 'form-buttons form-foot',
    children: [...sending, cancel, ...extras, formLine(off ? missing : undefined)],
  };
}

/** The missing line of a form (`formRow`): hidden while it says nothing. */
function formLine(text: string | undefined): PageNode {
  return text === undefined
    ? { tag: 'p', className: 'form-answer', attributes: { hidden: '' } }
    : { tag: 'p', className: 'form-answer', text };
}

/**
 * What a form's pure check says is missing (`reportBody`, `spawnBody`, …: `{ text }` until the
 * form can be sent), or nothing.
 */
export function missingOf(body: { text: string } | { body: unknown }): string | undefined {
  return 'text' in body && body.text !== '' ? body.text : undefined;
}

/**
 * Whether a button is off: `disabled` (a form on its way, `offWhileSending`) or `aria-disabled`
 * (a form's check says something is missing). A click passes through `aria-disabled`, so every
 * Submit handler asks this first.
 */
export function isOff(button: {
  disabled: boolean;
  getAttribute(name: string): string | null;
}): boolean {
  return button.disabled || button.getAttribute('aria-disabled') === 'true';
}
