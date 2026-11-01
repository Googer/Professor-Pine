/**
 * Just enough of a page for the forms of the live map in a test (`post-forms-ui.ts`, `raid-ui.ts`):
 * elements with attributes and `dataset`, the tree, fields, the focus, bubbling events, and the
 * selectors the forms ask. Stub `document`, `HTMLElement` and `HTMLButtonElement` with these.
 */

export type Listener = (event: {
  target: FakeElement;
  stopPropagation(): void;
  key?: string;
}) => void;

/** What has had the focus, in order, and who waits for an element to get it. */
let focusedList: FakeElement[] = [];
let focusWaiters: { element: FakeElement | undefined; resolve: () => void }[] = [];

/** What has had the focus, in order. */
export function focused(): FakeElement[] {
  return focusedList;
}

/** Forgets the focus and its waiters: a test's page starts with none. */
export function resetFocus(): void {
  focusedList = [];
  focusWaiters = [];
}

/**
 * When `element` gets the focus, or (`undefined`) anything does next (a wait that never comes in
 * fails as the test's timeout, as the page's own tests wait: no sleeps).
 */
export function focusOn(element: FakeElement | undefined): Promise<void> {
  if (element !== undefined && focusedList.includes(element)) return Promise.resolve();
  return new Promise((resolve) => focusWaiters.push({ element, resolve }));
}

/**
 * Just enough of an element for the forms of the post's controls (`post-forms-ui.ts`): attributes
 * and `dataset`, the tree, fields, the focus, bubbling events, and the selectors it asks (tags,
 * classes, attributes with or without a value, `:checked`, lists, a descendant).
 */
export class FakeElement {
  className = '';
  hidden = false;
  disabled = false;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  childNodes: FakeElement[] = [];
  parent: FakeElement | undefined;
  page = false;
  private text: string | null = '';
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tag: string) {}

  get tagName(): string {
    return this.tag.toUpperCase();
  }

  get textContent(): string | null {
    return this.childNodes.length > 0
      ? this.childNodes.map((child) => child.textContent ?? '').join('')
      : this.text;
  }

  set textContent(text: string | null) {
    this.childNodes = [];
    this.text = text;
  }

  get name(): string {
    return this.attributes.get('name') ?? '';
  }

  get value(): string {
    return (
      this.attributes.get('value') ??
      (this.tag.toLowerCase() === 'textarea' ? (this.textContent ?? '') : '')
    );
  }

  set value(value: string) {
    this.attributes.set('value', value);
  }

  get checked(): boolean {
    return this.attributes.has('checked');
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()];
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent?.childNodes.splice(child.parent.childNodes.indexOf(child), 1);
      child.parent = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.childNodes) child.parent = undefined;
    this.childNodes = [];
    this.append(...children);
  }

  get parentElement(): FakeElement | null {
    return this.parent ?? null;
  }

  contains(other: unknown): boolean {
    return other instanceof FakeElement && upward(other).includes(this);
  }

  get isConnected(): boolean {
    return upward(this).some((at) => at.page);
  }

  focus(): void {
    focusedList.push(this);
    const due = (one: { element: FakeElement | undefined }) =>
      one.element === undefined || one.element === this;
    for (const waiter of focusWaiters.filter(due)) waiter.resolve();
    focusWaiters = focusWaiters.filter((one) => !due(one));
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** An event at this element, bubbling up the tree until a listener stops it. */
  dispatch(type: string): void {
    let stopped = false;
    const event = {
      target: this,
      stopPropagation: () => {
        stopped = true;
      },
    };
    for (const at of upward(this)) {
      for (const listener of at.listeners.get(type) ?? []) listener(event);
      if (stopped) return;
    }
  }

  closest(selector: string): FakeElement | null {
    return upward(this).find((at) => matches(at, selector)) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const below = (element: FakeElement): FakeElement[] =>
      element.childNodes.flatMap((child) => [child, ...below(child)]);
    return below(this).filter((element) => matches(element, selector));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export class FakeButton extends FakeElement {}

function upward(from: FakeElement): FakeElement[] {
  const line: FakeElement[] = [];
  for (let at: FakeElement | undefined = from; at; at = at.parent) line.push(at);
  return line;
}

/** One compound selector: `button.press[data-regroup="r1"]`, `input[type="radio"]:checked`. */
function matchesOne(element: FakeElement, compound: string): boolean {
  const checked = compound.endsWith(':checked');
  const rest = compound.replace(/:checked$/, '');
  const tag = /^[a-z]+/.exec(rest)?.[0];
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((found) => found[1] ?? '');
  const attributes = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((found) => ({
    name: found[1] ?? '',
    value: found[2],
  }));
  const own = element.className.split(' ');
  return (
    (tag === undefined || element.tag === tag) &&
    classes.every((name) => own.includes(name)) &&
    attributes.every(
      ({ name, value }) =>
        element.attributes.has(name) &&
        (value === undefined || element.attributes.get(name) === value),
    ) &&
    (!checked || element.checked)
  );
}

function matches(element: FakeElement, selector: string): boolean {
  return selector.split(',').some((one) => {
    const parts = one.trim().split(/\s+/);
    const last = parts.pop() ?? '';
    if (!matchesOne(element, last)) return false;
    let at = element.parent;
    for (const part of parts.reverse()) {
      while (at && !matchesOne(at, part)) at = at.parent;
      if (!at) return false;
      at = at.parent;
    }
    return true;
  });
}

export const make = (tag: string): FakeElement =>
  tag === 'button' ? new FakeButton(tag) : new FakeElement(tag);
