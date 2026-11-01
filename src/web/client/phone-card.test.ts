import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterSwipe, afterTap, handleWords, PhoneCard, SWIPE_PIXELS } from './phone-card.js';
import { FormHold, formPlace } from './raid-forms.js';

describe('the phone card of a party (plan 8M-8A)', () => {
  it('shows the whole post when swiped up, the summary again when swiped down, then closes', () => {
    expect(afterSwipe('summary', -SWIPE_PIXELS)).toBe('whole');
    expect(afterSwipe('whole', -200)).toBe('whole');
    expect(afterSwipe('whole', SWIPE_PIXELS)).toBe('summary');
    expect(afterSwipe('summary', 120)).toBe('closed');
  });

  it('takes a short move for a tap, not a swipe', () => {
    expect(afterSwipe('summary', -(SWIPE_PIXELS - 1))).toBe('summary');
    expect(afterSwipe('whole', SWIPE_PIXELS - 1)).toBe('whole');
  });

  it('switches between the summary and the whole post with a tap on its handle, saying which', () => {
    expect(afterTap('summary')).toBe('whole');
    expect(afterTap('whole')).toBe('summary');
    expect(handleWords('summary')).toBe('Show the whole post');
    expect(handleWords('whole')).toBe('Show less');
  });
});

/** Just enough of the DOM for the card: elements in a tree, classes, listeners, the focus. */
class FakeElement {
  className = '';
  textContent = '';
  type = '';
  hidden = false;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly classList = {
    toggle: (name: string, on: boolean) => {
      const names = new Set(this.className.split(' ').filter((one) => one !== ''));
      if (on) names.add(name);
      else names.delete(name);
      this.className = [...names].join(' ');
    },
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (name: string) => {
      this.classList.toggle(name, true);
    },
    remove: (name: string) => {
      this.classList.toggle(name, false);
    },
  };
  readonly dataset: Record<string, string> = {};
  /** How many times a size was read (the browser's restyle before a class comes back). */
  sizeReads = 0;
  get offsetWidth(): number {
    this.sizeReads += 1;
    return 0;
  }

  constructor(
    readonly tagName: string,
    private readonly doc: FakeDocument,
  ) {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children.splice(0)) child.parent = undefined;
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(
    type: string,
    listener: (event: unknown) => void,
    options?: { once?: boolean },
  ): void {
    const run =
      options?.once === true
        ? (event: unknown) => {
            this.listeners.set(
              type,
              (this.listeners.get(type) ?? []).filter((one) => one !== run),
            );
            listener(event);
          }
        : listener;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), run]);
  }

  fire(type: string, event: object = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** Every element under it of one class (`.name`). */
  querySelectorAll(selector: string): FakeElement[] {
    const name = selector.replace(/^\./u, '');
    return this.children.flatMap((child) => [
      ...(child.classList.contains(name) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  focus(): void {
    this.doc.activeElement = this;
  }

  contains(other: FakeElement | null): boolean {
    for (let node: FakeElement | undefined = other ?? undefined; node; node = node.parent) {
      if (node === this) return true;
    }
    return false;
  }

  closest(selector: string): FakeElement | null {
    const names = selector.split(',').map((one) => one.trim().replace(/^\./u, ''));
    if (names.some((name) => this.classList.contains(name))) return this;
    return this.parent?.closest(selector) ?? null;
  }

  /** The first element under it of one class (`.name`), as a browser finds it. */
  querySelector(selector: string): FakeElement | null {
    return this.find(selector.replace(/^\./u, '')) ?? null;
  }

  /** The element under it with this class. */
  find(name: string): FakeElement | undefined {
    for (const child of this.children) {
      if (child.classList.contains(name)) return child;
      const deeper = child.find(name);
      if (deeper) return deeper;
    }
    return undefined;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement('body', this);
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  key(key: string): void {
    for (const listener of this.listeners.get('keydown') ?? []) listener({ key });
  }
}

describe('the phone card on the page (review 8A-1, 8A-8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A card over the fake document, a party's content with a field in it, a button elsewhere. */
  const opened = () => {
    const doc = new FakeDocument();
    vi.stubGlobal('HTMLElement', FakeElement);
    const closed: number[] = [];
    const card = new PhoneCard(doc as unknown as Document, {
      onClose: () => {
        closed.push(1);
      },
    });
    const outside = doc.createElement('button');
    doc.body.append(outside);
    outside.focus();
    const content = doc.createElement('div');
    content.className = 'party-popup';
    const field = doc.createElement('input');
    content.append(field);
    card.open('gym:1', () => content as unknown as HTMLElement);
    const element = doc.body.children.find((one) => one.classList.contains('party-card'));
    if (!element) throw new Error('no card');
    const part = (name: string) => {
      const found = element.find(name);
      if (!found) throw new Error(`no ${name}`);
      return found;
    };
    return { doc, card, element, part, outside, field, closed };
  };

  /** A hold over nothing, as the page's. */
  const holding = () =>
    new FormHold<string>({
      draw: () => undefined,
      popup: () => undefined,
      later: (run) => {
        run();
      },
      controls: () => undefined,
    });

  it('lets go of a form held in it when it closes, and only then (8A-1, N2)', () => {
    const { card, field, closed } = opened();
    const hold = holding();
    expect(formPlace(field as unknown as HTMLElement)).toBe('card');
    expect(hold.take(formPlace(field as unknown as HTMLElement))).toBeDefined();
    expect(hold.editing).toBe(true);
    // A Leaflet popup closing elsewhere (the place list, a gym's own) takes nothing of the card.
    hold.popupClosed();
    expect(hold.editing).toBe(true);
    // The page's hook: the card's closing lets the card's form go (`hold.cardClosed`).
    card.close();
    expect(closed).toEqual([1]);
    hold.cardClosed();
    expect(hold.editing).toBe(false);
  });

  it('closes the first party, its form with it, when a second opens in its place (two in a row)', () => {
    const { doc, card, closed } = opened();
    const second = doc.createElement('div');
    card.open('train:t1', () => second as unknown as HTMLElement);
    expect(closed).toEqual([1]);
    expect(card.key).toBe('train:t1');
    // The same party drawn anew (a new list) closes nothing.
    card.open('train:t1', () => second as unknown as HTMLElement);
    expect(closed).toEqual([1]);
  });

  it('takes no tap after a swipe, moves the focus in and gives it back (8A-8)', () => {
    const { doc, element, part, outside } = opened();
    const handle = part('card-handle');
    expect(doc.activeElement).toBe(handle);
    const top = part('card-top');
    top.fire('pointerdown', { clientY: 400 });
    top.fire('pointerup', { clientY: 300 });
    // The click the browser fires after the swipe's pointerup is no tap.
    handle.fire('click');
    expect(element.classList.contains('whole')).toBe(true);
    part('card-close').fire('click');
    expect(element.hidden).toBe(true);
    expect(doc.activeElement).toBe(outside);
  });

  it('closes on Escape only when the focus is in it or nowhere (8A-8)', () => {
    const { doc, element, outside } = opened();
    outside.focus();
    doc.key('Escape');
    expect(element.hidden).toBe(false);
    doc.activeElement = null;
    doc.key('Escape');
    expect(element.hidden).toBe(true);
  });

  it('is named by the heading of the party it shows (review W-6)', () => {
    const { doc, card, element } = opened();
    // No heading in the content: the card is a party's.
    expect(element.attributes.get('aria-label')).toBe('Party');
    const post = doc.createElement('div');
    const heading = doc.createElement('h3');
    heading.className = 'post-heading';
    heading.textContent = 'Level 5 raid (egg)';
    const name = doc.createElement('strong');
    name.className = 'name';
    name.textContent = 'Library';
    post.append(name, heading);
    card.open('gym:2', () => post as unknown as HTMLElement);
    expect(element.attributes.get('aria-label')).toBe('Level 5 raid (egg)');
    // The map's own summary until the post came: the name it shows.
    const summary = doc.createElement('div');
    summary.append(name);
    card.refresh(() => summary as unknown as HTMLElement);
    expect(element.attributes.get('aria-label')).toBe('Library');
  });

  // Plan 8M-13 (A2): the card is drawn anew under a press, so it moves itself for a refusal.
  describe('nudged for a refusal', () => {
    /** A post of the party `id` with a button in it, as the popup's content draws it. */
    const postOf = (doc: FakeDocument, id: string) => {
      const content = doc.createElement('div');
      const post = doc.createElement('div');
      post.className = 'post';
      post.dataset.post = id;
      const button = doc.createElement('button');
      post.append(button);
      content.append(post);
      return { content, button };
    };

    it('bounces once per refusal, again for the next one, on the element it keeps', () => {
      const { card, element } = opened();
      card.nudge();
      expect(element.classList.contains('nudge')).toBe(true);
      // Taken off and read before it comes back, so that a second refusal bounces again.
      const reads = element.sizeReads;
      card.nudge();
      expect(element.sizeReads).toBe(reads + 1);
      expect(element.classList.contains('nudge')).toBe(true);
      element.fire('animationend');
      expect(element.classList.contains('nudge')).toBe(false);
    });

    it('does not move while closed', () => {
      const { card, element } = opened();
      card.close();
      card.nudge();
      expect(element.classList.contains('nudge')).toBe(false);
    });

    it("says whether it shows a party's post, and holds an element, through its redraws", () => {
      const { doc, card } = opened();
      const first = postOf(doc, 'r1');
      card.open('gym:1', () => first.content as unknown as HTMLElement);
      expect(card.shows('r1')).toBe(true);
      expect(card.shows('r2')).toBe(false);
      expect(card.holds(first.button as unknown as Element)).toBe(true);
      // Drawn anew: the button pressed is gone, the party still shown.
      const again = postOf(doc, 'r1');
      card.refresh(() => again.content as unknown as HTMLElement);
      expect(card.holds(first.button as unknown as Element)).toBe(false);
      expect(card.shows('r1')).toBe(true);
      card.close();
      expect(card.shows('r1')).toBe(false);
    });
  });
});
