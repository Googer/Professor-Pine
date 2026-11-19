import { liveControl } from './list-ui.js';
import { focusBack } from './post-forms.js';
import type { FormClaim, FormHold } from './raid-forms.js';

/**
 * Where a form of the map is (plan 8M-22, Matt 2026-11-18: "UI consistency is why I think we
 * actually want it for _anything_"): once a place is picked, every form opens in one place of its
 * own, on a wide screen the side pane's box (an aside claim), narrower the phone's card in its form
 * mode (a `'card'` claim, never aside: the pane is not docked for it). The place's popup closes
 * (`FormFrame.leave`; a party the card showed stays under the form) and the form's heading names
 * the place in a line of its own under it (`form-place`). Cancel goes back to where the member was
 * (Matt's ruling 1): the card as it was, else the place's popup opened again, the focus on the
 * control that opened the form (`liveControl`: the popup drawn anew). A success lets the page open
 * what was made (`close('done')`), or the post the form changed (`close('back')`).
 *
 * Where it opened it stays until it closes (a window resized across 768 px moves nothing), but for
 * a phone's form that needs the map ("Add stops…", "Pick on the map"): it hops to the side pane
 * docked under the map (`toPane`) and back into the card when that ends (`toCard`), with what was
 * typed.
 */
export interface FormFrame {
  /** The side pane's box. */
  tools: HTMLElement;
  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'moved'>;
  /** The side pane's box as it is without a form. */
  idle(): void;
  /**
   * The popup or card the form opens from (the one that holds its `control`, review P4), closed (not
   * the card when the form opens in it, `inCard`): the place it showed (its name, for the form's
   * place line) and what opens it again; nothing where the form came from none.
   */
  leave(inCard?: boolean, control?: HTMLElement | null): { place?: string; back?: () => void };
  /** The phone's card (`PhoneCard`), where a form opens on a phone. */
  card?: FormCard;
  /** Whether a form opens in the card now (`cardWanted`: a screen narrower than 768 px). */
  phone?(): boolean;
}

/** What a form needs of the phone's card (`PhoneCard`). */
export interface FormCard {
  /** The party the card shows, if any. */
  readonly key: string | undefined;
  openForm(form: HTMLElement, cancel: () => void): void;
  closeForm(): void;
  close(): void;
  formElement(): HTMLElement | undefined;
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
  /**
   * The form needs the map (Add stops…, Pick on the map): in the side pane, a phone's moved there
   * from its card (docked under the map), its claim moved aside before the card closes; false
   * where it no longer holds.
   */
  toPane(): boolean;
  /**
   * The map no longer needed ("Done adding", a place picked): a phone's form back into its card,
   * the claim the card's once the card has it. Nothing on a wide screen.
   */
  toCard(): void;
  /**
   * The form closed: the side pane's box as it is without a form (or the card as it was), the
   * claim let go; `back` (Cancel, a change that went through) also opens the place again with the
   * focus on the form's control; `done` leaves the page to open what was made.
   */
  close(how?: 'back' | 'done'): void;
  /**
   * What runs as the form closes, whichever way (review P2: Cancel, the card's × or Escape while it
   * loads, a success): a spawn's or a max battle's pin taken away. Once.
   */
  whenClosed(run: () => void): void;
  /**
   * What runs once the form is first drawn (review P10: the map pans a point clear of the card by
   * the card's height with the form in it).
   */
  whenDrawn(run: () => void): void;
}

/** What the side pane or card shows while a form's lists are on their way. */
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
  const { hold, card } = frame;
  let claim: FormClaim | undefined;
  let left: { place?: string; back?: () => void } = {};
  let drawn = false;
  /** Where the form is now: the side pane, or the phone's card. */
  let where: 'pane' | 'card' = 'pane';
  /**
   * Where it opened (review P6): only a form that opened in the card goes back into it after the
   * map was needed; a window resized across 768 px moves nothing.
   */
  let opened: 'pane' | 'card' = 'pane';
  /** What runs as the form closes (`whenClosed`). */
  const closers: (() => void)[] = [];
  /** What runs once the form is first drawn (`whenDrawn`). */
  const drawers: (() => void)[] = [];
  /** Whether the card showed a party under the form, which it shows again as the form closes. */
  let cardShowed = false;

  const holds = (): boolean => claim !== undefined && hold.holds(claim);
  const element = (): HTMLElement =>
    where === 'card' ? (card?.formElement() ?? frame.tools) : frame.tools;

  /** The card's × and Escape: the form's own Cancel, or the form closed while it loads. */
  const cancelPressed = (): void => {
    const cancel = element().querySelector<HTMLButtonElement>('button[data-cancel]');
    if (cancel) cancel.click();
    else home.close('back');
  };

  /**
   * "Loading…" while the form's lists are on their way, with a Cancel (review P2: an answer that
   * never comes leaves no hold stuck), which the card's × and Escape press too.
   */
  const loadingLine = (): HTMLElement => {
    const box = document.createElement('div');
    box.className = 'form-loading';
    const words = document.createElement('p');
    words.className = 'hint';
    // Read as it comes and as it goes (second review R2).
    words.setAttribute('role', 'status');
    words.textContent = LOADING;
    const cancel = document.createElement('button');
    cancel.setAttribute('type', 'button');
    cancel.className = 'press';
    cancel.setAttribute('data-cancel', '');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      home.close('back');
    });
    // Escape on it closes the form as its Cancel, as `formKeys` has it in a form.
    cancel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      home.close('back');
    });
    box.append(words, cancel);
    return box;
  };

  const home: FormHome = {
    open() {
      if (card && frame.phone?.() === true) {
        claim = hold.take('card');
        if (!claim) return undefined;
        where = 'card';
        opened = 'card';
        cardShowed = card.key !== undefined;
        left = frame.leave(true, opener.control);
        card.openForm(loadingLine(), cancelPressed);
        return claim;
      }
      // An aside claim (the review's ruling): the list goes on being drawn under it.
      claim = hold.take(false, true);
      if (!claim) return undefined;
      left = frame.leave(false, opener.control);
      const loading = loadingLine();
      frame.tools.replaceChildren(loading);
      // The focus on its Cancel (second review R2): the control that had it went with its popup.
      loading.querySelector<HTMLElement>('button[data-cancel]')?.focus();
      return claim;
    },
    inPane: () => where === 'pane',
    holds,
    element,
    draw(form) {
      placeLine(form, opener.place?.() ?? left.place);
      if (where === 'card' && card) card.openForm(form, cancelPressed);
      else frame.tools.replaceChildren(form);
      if (drawn) return;
      drawn = true;
      for (const run of drawers.splice(0)) run();
      // The form's heading takes the focus as it opens (the control that had it is gone with its
      // popup, or under the card's form); a form that focuses a field of its own moves it on.
      const heading = headingOf(form);
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    },
    toPane() {
      if (where === 'pane') return holds();
      if (!claim || !card) return false;
      // The claim aside first (the review's ruling): the card's closing takes no aside claim.
      const moved = hold.moved(claim, false, true);
      if (!moved) return false;
      claim = moved;
      const form = card.formElement()?.firstElementChild;
      card.closeForm();
      card.close();
      cardShowed = false;
      where = 'pane';
      if (form) frame.tools.replaceChildren(form);
      return true;
    },
    toCard() {
      if (where === 'card' || opened !== 'card' || !card || !claim || !holds()) return;
      const form = frame.tools.firstElementChild;
      // The card opened first, the claim the card's after (its opening may close a party shown).
      card.openForm(form instanceof HTMLElement ? form : loadingLine(), cancelPressed);
      // In the card before the page hears of the move: the pane is docked no more.
      where = 'card';
      const moved = hold.moved(claim, 'card');
      if (!moved) {
        where = 'pane';
        return;
      }
      claim = moved;
      frame.idle();
    },
    close(how = 'done') {
      for (const run of closers.splice(0)) run();
      const held = holds();
      const inCard = where === 'card';
      if (held && !inCard) frame.idle();
      if (claim) hold.release(claim);
      claim = undefined;
      // The card as it was: what it showed, or closed.
      if (inCard) card?.closeForm();
      if (how !== 'back' || !held) return;
      if (!(inCard && cardShowed)) left.back?.();
      // Opening the place again drew it anew: the control in it as it is now.
      if (opener.control) focusBack(liveControl(opener.control));
    },
    whenClosed(run) {
      closers.push(run);
    },
    whenDrawn(run) {
      drawers.push(run);
    },
  };
  return home;
}
