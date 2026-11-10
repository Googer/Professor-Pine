/**
 * The phone card of a party (plan 8M-8A, design "A party's popup is its post"): narrower than
 * 768 pixels a party opens as a card docked at the bottom of the screen in the place of its
 * popup, first its summary (its post's heading block with its picture and times, the post's first
 * row of buttons, the map's line: `map.css` shows only those, by the blocks' roles), the whole
 * post once tapped or swiped up; swiped down it goes back to the summary, then closes, as does a
 * tap on the map or Escape. The content is the popup's own (`withPopup`), drawn anew with each
 * list, but not under a form.
 */

/** Where the card is. */
export type CardState = 'closed' | 'summary' | 'whole';

/** How far a finger moves up or down before it is a swipe and not a tap. */
export const SWIPE_PIXELS = 40;

/** Where a swipe of `dy` pixels (up is negative) takes the card. */
export function afterSwipe(state: CardState, dy: number): CardState {
  if (dy <= -SWIPE_PIXELS) return state === 'closed' ? 'closed' : 'whole';
  if (dy >= SWIPE_PIXELS) return state === 'whole' ? 'summary' : 'closed';
  return state;
}

/** Where a tap on the card's handle takes it. */
export function afterTap(state: CardState): CardState {
  return state === 'summary' ? 'whole' : state === 'whole' ? 'summary' : 'closed';
}

/** What the card's handle says it does. */
export function handleWords(state: CardState): string {
  return state === 'whole' ? 'Show less' : 'Show the whole post';
}

/** Whether a party opens as the card: a screen narrower than the desktop's (`map.css`). */
export function cardWanted(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
}

/** The card's elements, made at its first opening. */
interface CardParts {
  element: HTMLElement;
  handle: HTMLButtonElement;
  body: HTMLElement;
}

/** What the page wants to hear of the card. */
export interface PhoneCardHooks {
  /**
   * The card closed (review 8A-1): a form drawn in it went with it, as with a popup's closing
   * (`FormHold.popupClosed`).
   */
  onClose?: () => void;
}

/**
 * The card on the page: one element under `<body>`, made when a party first opens as it, its
 * handle and close button at the top, then the party's content. `open` shows a party's summary
 * and moves the focus to its handle; `refresh` draws the content anew (a new list); `close` hides
 * it and gives the focus back where it was (review 8A-8). A swipe is never also a tap; Escape
 * closes it only while the focus is in it or nowhere.
 */
export class PhoneCard {
  private state: CardState = 'closed';
  private shown: { key: string; content: () => HTMLElement } | undefined;
  /** The content drawn last, in the card's body. */
  private drawn: HTMLElement | undefined;
  private parts: CardParts | undefined;
  private swipeFrom: number | undefined;
  /** A swipe just ended: the click the browser fires after it is no tap. */
  private swiped = false;
  /** What had the focus before the card took it. */
  private focusBefore: HTMLElement | undefined;

  constructor(
    private readonly document: Document,
    private readonly hooks: PhoneCardHooks = {},
  ) {}

  /** The key of the party the card shows (`gym:<id>`, `train:<id>` …); undefined while closed. */
  get key(): string | undefined {
    return this.state === 'closed' ? undefined : this.shown?.key;
  }

  /** What the card shows while it is open (its party's content); undefined while closed. */
  content(): HTMLElement | undefined {
    return this.state === 'closed' ? undefined : this.drawn;
  }

  /** How tall the card is, in pixels (the map pans what was tapped above it). */
  get height(): number {
    return this.parts?.element.getBoundingClientRect?.().height ?? 0;
  }

  /** Shows a party's summary. */
  open(key: string, content: () => HTMLElement): void {
    const { element, handle, body } = this.made();
    const active = this.document.activeElement;
    if (this.state === 'closed' && active instanceof HTMLElement && !element.contains(active)) {
      this.focusBefore = active;
    }
    // Another party in its place: the first is closed for the page, a form in it with it.
    if (this.state !== 'closed' && this.shown?.key !== key) this.hooks.onClose?.();
    this.shown = { key, content };
    this.drawn = content();
    body.replaceChildren(this.drawn);
    this.named();
    this.go('summary');
    handle.focus();
  }

  /** Draws the content anew (a new list), keeping the card where it is. */
  refresh(content: (() => HTMLElement) | undefined): void {
    if (this.shown === undefined || this.state === 'closed') return;
    if (content === undefined) {
      this.close();
      return;
    }
    this.shown = { key: this.shown.key, content };
    this.drawn = content();
    this.made().body.replaceChildren(this.drawn);
    this.named();
  }

  /**
   * Names the card (its `aria-label`, review W-6) by the heading of what it shows: the post's
   * heading, else the name the map's own summary shows, else `Party`.
   */
  private named(): void {
    const { element, body } = this.made();
    const heading = body.querySelector('.post-heading') ?? body.querySelector('.name');
    const words = heading?.textContent?.trim() ?? '';
    element.setAttribute('aria-label', words === '' ? 'Party' : words);
  }

  close(): void {
    if (this.state !== 'closed') this.go('closed');
  }

  /**
   * A refusal (plan 8M-13, A2): a small upward bounce of the card, on the element it keeps (its
   * content is drawn anew under a press, so a control pressed is no longer in it when the answer
   * comes). The class taken off and a size read before it comes back, so that the next refusal
   * bounces again; `map.css` runs it only where the device allows motion.
   */
  nudge(): void {
    if (this.state === 'closed' || !this.parts) return;
    const { element } = this.parts;
    element.classList.remove('nudge');
    void element.offsetWidth;
    element.classList.add('nudge');
    element.addEventListener(
      'animationend',
      () => {
        element.classList.remove('nudge');
      },
      { once: true },
    );
  }

  /** Whether the card shows the post of the party `partyId` now. */
  shows(partyId: string): boolean {
    if (this.state === 'closed' || !this.parts) return false;
    return [...this.parts.body.querySelectorAll<HTMLElement>('.post')].some(
      (post) => post.dataset.post === partyId,
    );
  }

  /** Whether `element` is in the card now (a form drawn in it). */
  holds(element: Element): boolean {
    return this.state !== 'closed' && this.parts?.element.contains(element) === true;
  }

  private go(state: CardState): void {
    const { element, handle, body } = this.made();
    const was = this.state;
    this.state = state;
    element.hidden = state === 'closed';
    element.classList.toggle('summary', state === 'summary');
    element.classList.toggle('whole', state === 'whole');
    handle.textContent = handleWords(state);
    handle.setAttribute('aria-expanded', String(state === 'whole'));
    if (state === 'closed' && was !== 'closed') {
      body.replaceChildren();
      this.shown = undefined;
      this.hooks.onClose?.();
      this.focusBefore?.focus();
      this.focusBefore = undefined;
    }
  }

  /** The card's elements, made and put under `<body>` the first time. */
  private made(): CardParts {
    if (this.parts) return this.parts;
    const { document } = this;
    const element = document.createElement('div');
    element.className = 'party-card';
    element.hidden = true;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', 'Party');
    const top = document.createElement('div');
    top.className = 'card-top';
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'card-handle';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'card-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    top.append(handle, close);
    const body = document.createElement('div');
    body.className = 'card-body';
    element.append(top, body);
    document.body.append(element);
    handle.addEventListener('click', () => {
      if (this.swiped) {
        this.swiped = false;
        return;
      }
      this.go(afterTap(this.state));
    });
    close.addEventListener('click', () => {
      this.close();
    });
    top.addEventListener('pointerdown', (event) => {
      this.swipeFrom = event.clientY;
      this.swiped = false;
    });
    top.addEventListener('pointerup', (event) => {
      if (this.swipeFrom === undefined) return;
      const dy = event.clientY - this.swipeFrom;
      this.swipeFrom = undefined;
      if (Math.abs(dy) < SWIPE_PIXELS) return;
      this.swiped = true;
      this.go(afterSwipe(this.state, dy));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.state === 'closed') return;
      const active = document.activeElement;
      const nowhere = active === null || active === document.body;
      if (nowhere || element.contains(active)) this.close();
    });
    this.parts = { element, handle, body };
    return this.parts;
  }
}
