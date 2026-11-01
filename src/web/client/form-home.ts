import { liveControl } from './list-ui.js';
import { focusBack } from './post-forms.js';
import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';

/**
 * Where a form opened at a place is drawn (Matt, 2026-10-30: if it can be anchored to a place, it
 * is): in `box`, the control's own part of the place's popup or card, in place of what is there,
 * as a raid's report is; without a box in the side pane's. A form that comes to need the map (a
 * place or stops picked) goes to the side pane (`toPane`), which closes the popup.
 */
export interface FormHomeDeps {
  /** The side pane's box. */
  tools: HTMLElement;
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'fit'>;
  closePopup(): void;
  /** The side pane's box as it is without a form. */
  idle(): void;
}

export interface FormHome {
  /** The form's claim of the hold, or undefined while another form is open. */
  open(): FormClaim | undefined;
  /** Whether it is in the side pane: the list is drawn under it. */
  inPane(): boolean;
  /** Whether it still holds: a popup closed takes a form in it along. */
  holds(): boolean;
  /** What it is drawn in. */
  element(): HTMLElement;
  draw(form: HTMLElement): void;
  /** Moves to the side pane (what it holds is drawn there anew); false if it could not. */
  toPane(): boolean;
  /** What was there back, the claim let go, the focus on the control that opened it. */
  close(): void;
}

export function formHome(
  deps: FormHomeDeps,
  anchored?: { box: HTMLElement; control: HTMLButtonElement },
): FormHome {
  const { hold } = deps;
  let at = anchored;
  let before: ChildNode[] = [];
  let claim: FormClaim | undefined;

  const putBack = (): void => {
    if (at) at.box.replaceChildren(...before);
  };

  return {
    open() {
      if (at) {
        const { box } = at;
        const place = formPlace(box);
        claim = hold.take(place, false, place === false ? () => box.isConnected : undefined);
        if (claim) before = [...box.childNodes];
      } else claim = hold.take(false, true);
      return claim;
    },
    inPane: () => at === undefined,
    holds: () => claim !== undefined && hold.holds(claim),
    element: () => at?.box ?? deps.tools,
    draw(form) {
      if (at) {
        at.box.replaceChildren(form);
        hold.fit();
      } else deps.tools.replaceChildren(form);
    },
    toPane() {
      if (!at) return true;
      // A form gone with its popup, another open since: it stays what it was, and moves nothing.
      if (!claim || !hold.holds(claim)) return false;
      const { box } = at;
      const shown = [...box.childNodes];
      putBack();
      hold.release(claim);
      const moved = hold.take(false, true);
      if (!moved) {
        box.replaceChildren(...shown);
        claim = undefined;
        return false;
      }
      at = undefined;
      claim = moved;
      deps.closePopup();
      return true;
    },
    close() {
      if (at) putBack();
      else deps.idle();
      if (claim) hold.release(claim);
      // The release may have drawn the popup anew: the control in it as it is now.
      if (at) focusBack(liveControl(at.control));
    },
  };
}
