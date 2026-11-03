import { renderNode } from './popup.js';
import { pickAgainNode, REPORT_KINDS } from './report-menu.js';
import type { ReportKindId } from './report-icons.js';

/**
 * A form the Report button's step 2 opened (`again`, its kind) gets "← Another …" before each of
 * its Cancel buttons (`pickAgainNode`), at every draw of the form. Its press is the Report button's
 * (`reportUi`): the form's Cancel, then step 2 of that kind again.
 */
export function addPickAgain(form: HTMLElement, again: ReportKindId | undefined): void {
  const kind = REPORT_KINDS.find((one) => one.id === again);
  const node = kind === undefined ? undefined : pickAgainNode(kind);
  if (node === undefined) return;
  for (const cancel of form.querySelectorAll('.form-buttons > [data-cancel]')) {
    cancel.before(renderNode(node, form.ownerDocument));
  }
}

/**
 * A press of "← Another …": the Cancel beside it pressed (the form closes as its own Cancel closes
 * it, the hold let go), then `restart` with its kind. False where the press is not one; true and
 * nothing done while its Cancel is off (an answer on its way, which disables both).
 */
export function pickAgainPressed(target: Element, restart: (kind: ReportKindId) => void): boolean {
  const button = target.closest<HTMLButtonElement>('button[data-pick-again]');
  const kind = REPORT_KINDS.find((one) => one.id === button?.dataset.pickAgain);
  if (!button || !kind) return false;
  const cancel = button.parentElement?.querySelector<HTMLButtonElement>(':scope > [data-cancel]');
  if (!cancel || cancel.disabled || button.disabled) return true;
  cancel.click();
  restart(kind.id);
  return true;
}
