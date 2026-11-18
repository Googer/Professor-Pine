import { liveControl } from './list-ui.js';
import { focusBack } from './post-forms.js';
import type { FormClaim, FormHold } from './raid-forms.js';

/**
 * Where a form of the map is (plan 8M-22, Matt 2026-11-18: "UI consistency is why I think we
 * actually want it for _anything_"): once a place is picked, every form opens in one place of its
 * own, the side pane's box, never in the place's popup or card, which closes as the form opens
 * (`FormFrame.leave`). Its heading names the place in a line of its own under it (`form-place`).
 * Cancel goes back to where the member was (Matt's ruling 1): the place's popup opened again, the
 * focus on the control that opened the form (`liveControl`: the popup drawn anew). A success
 * lets the page open what was made (`close('done')`), or the post the form changed
 * (`close('back')`).
 */
export interface FormFrame {
  /** The side pane's box. */
  tools: HTMLElement;
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release'>;
  /** The side pane's box as it is without a form. */
  idle(): void;
  /**
   * The popup or card the form opens from, closed: the place it showed (its name, for the form's
   * place line) and what opens it again; nothing where none was open.
   */
  leave(): { place?: string; back?: () => void };
}

/** Where a form was opened from. */
export interface FormOpener {
  /**
   * The control that opened it (a popup's button, a line's, the Report button for its step 3):
   * the focus goes back to it as the form is canceled.
   */
  control?: HTMLElement | null | undefined;
  /**
   * The place the form is at, named under its heading (the first stop and "+2" of research's);
   * else the name the popup it was opened from showed.
   */
  place?: () => string | undefined;
}

export interface FormHome {
  /** The form's claim of the hold, or undefined while another form is open. */
  open(): FormClaim | undefined;
  /** Whether it is in the side pane: the list is drawn under it. */
  inPane(): boolean;
  /** Whether it still holds. */
  holds(): boolean;
  /** What it is drawn in. */
  element(): HTMLElement;
  /** Draws the form, its place under its heading; the heading takes the focus at the first. */
  draw(form: HTMLElement): void;
  /** Where the form needs the map (Add stops…, Pick on the map): it is in the side pane. */
  toPane(): boolean;
  /**
   * The form closed: the side pane's box as it is without a form, the claim let go; `back`
   * (Cancel, a change that went through) also opens the place again with the focus on the form's
   * control; `done` leaves the page to open what was made.
   */
  close(how?: 'back' | 'done'): void;
}

/** What the side pane shows while a form's lists are on their way. */
const LOADING = 'Loading…';

/** The heading of a form: the node marked as such, else its title or name. */
function headingOf(form: HTMLElement): HTMLElement | null {
  return (
    form.querySelector<HTMLElement>('[data-form-heading]') ??
    form.querySelector<HTMLElement>('.form-title, .name')
  );
}

/**
 * The place's line under a form's heading (plan 8M-22), unless the form names it already (its own
 * `form-place`, a max battle's "Unlisted power spot").
 */
function placeLine(form: HTMLElement, place: string | undefined): void {
  if (place === undefined || place === '' || form.querySelector('.form-place') !== null) return;
  const line = document.createElement('p');
  line.className = 'form-place';
  line.textContent = place;
  const heading = headingOf(form);
  if (heading) heading.after(line);
  else form.prepend(line);
}

export function formHome(frame: FormFrame, opener: FormOpener = {}): FormHome {
  const { hold } = frame;
  let claim: FormClaim | undefined;
  let left: { place?: string; back?: () => void } = {};
  let drawn = false;

  const holds = (): boolean => claim !== undefined && hold.holds(claim);

  return {
    open() {
      // An aside claim (the review's ruling): the list goes on being drawn under it.
      claim = hold.take(false, true);
      if (!claim) return undefined;
      left = frame.leave();
      const loading = document.createElement('p');
      loading.className = 'hint form-loading';
      loading.textContent = LOADING;
      frame.tools.replaceChildren(loading);
      return claim;
    },
    inPane: () => true,
    holds,
    element: () => frame.tools,
    draw(form) {
      placeLine(form, opener.place?.() ?? left.place);
      frame.tools.replaceChildren(form);
      if (drawn) return;
      drawn = true;
      // The form's heading takes the focus as it opens (the control that had it is gone with its
      // popup); a form that focuses a field of its own moves it on.
      const heading = headingOf(form);
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    },
    toPane: holds,
    close(how = 'done') {
      const held = holds();
      if (held) frame.idle();
      if (claim) hold.release(claim);
      claim = undefined;
      if (how !== 'back' || !held) return;
      left.back?.();
      // Opening the place again drew it anew: the control in it as it is now.
      if (opener.control) focusBack(liveControl(opener.control));
    },
  };
}
