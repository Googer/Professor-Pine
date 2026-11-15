import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerRegistry } from './layer-registry.js';
import { loggedOutPane, WhatIsOn } from './list-ui.js';
import { keepTools } from './train-forms.js';
import type { FindGroup } from './find.js';
import type { ListLine } from './what-is-on.js';

/** The element that has the focus in the fake document. */
const focused: { element: FakeElement | null } = { element: null };

/** Stubs the document, `HTMLElement` and `CSS` of the page with the fakes. */
function fakeDocument(): void {
  focused.element = null;
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    get activeElement() {
      return focused.element;
    },
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLImageElement', class {});
  vi.stubGlobal('CSS', { escape: (text: string) => text.replace(/["\\:]/gu, '\\$&') });
}

/** Just enough of the DOM for the list: elements in a tree, attributes, values, listeners. */
class FakeElement {
  className = '';
  textContent = '';
  type = '';
  value = '';
  selected = false;
  hidden = false;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(readonly tagName: string) {}

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  get options(): FakeElement[] {
    return this.children;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children.splice(0)) {
      child.parent = undefined;
      // As a browser does, the focus of an element taken out of the page goes to the body.
      if (focused.element && child.contains(focused.element)) focused.element = null;
    }
    this.append(...nodes);
  }

  replaceChild(next: FakeElement, old: FakeElement): void {
    const at = this.children.indexOf(old);
    next.parent?.children.splice(next.parent.children.indexOf(next), 1);
    this.children[at] = next;
    next.parent = this;
    old.parent = undefined;
    if (focused.element && old.contains(focused.element)) focused.element = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getAttributeNames(): string[] {
    return [...this.attributes.keys()];
  }

  /** Whether it is in the page: under the element made the page's (`root`). */
  root = false;
  get isConnected(): boolean {
    return this.parent ? this.parent.isConnected : this.root;
  }

  /** The document's focus: `focused.element`, as `document.activeElement` reads it. */
  focus(): void {
    focused.element = this;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  get childNodes(): FakeElement[] {
    return this.children;
  }

  removeChild(node: FakeElement): void {
    this.children.splice(this.children.indexOf(node), 1);
    node.parent = undefined;
    if (focused.element && node.contains(focused.element)) focused.element = null;
  }

  /** As the DOM's: a node already in the page is taken out first, and loses the focus in it. */
  insertBefore(node: FakeElement, before: FakeElement | null): void {
    if (node.parent) node.parent.removeChild(node);
    const at = before === null ? this.children.length : this.children.indexOf(before);
    this.children.splice(at, 0, node);
    node.parent = this;
  }

  contains(node: FakeElement): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  /** A tag with attributes, `[name]` or `[name="value"]` (escaped as `CSS.escape`), as the list asks. */
  querySelector(selector: string): FakeElement | null {
    const [, tag, rest = ''] = /^(\w+)((?:\[[^\]]*\])*)$/u.exec(selector) ?? [];
    const wanted = [...rest.matchAll(/\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]/gu)].map(
      ([, name = '', value]) => ({ name, value: value?.replace(/\\(.)/gu, '$1') }),
    );
    const matches = (node: FakeElement) =>
      node.tagName === tag &&
      wanted.every(
        ({ name, value }) =>
          node.attributes.has(name) && (value === undefined || node.attributes.get(name) === value),
      );
    const find = (node: FakeElement): FakeElement | null => {
      for (const child of node.children) {
        if (matches(child)) return child;
        const deeper = find(child);
        if (deeper) return deeper;
      }
      return null;
    };
    return find(this);
  }

  /** Every element of the tree under it with this tag. */
  all(tag: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.tagName === tag ? [child] : []),
      ...child.all(tag),
    ]);
  }

  words(): string {
    return [this.textContent, ...this.children.map((child) => child.words())].join(' ');
  }
}

const LINE: ListLine = {
  key: 'train:t2',
  kind: 'trains',
  id: 't2',
  marker: null,
  name: 'Evening train',
  place: 'No route yet',
  point: null,
  picture: null,
  going: 2,
  soonest: null,
  times: { start: null },
};

describe('a line of the list shown with its popup (fix round 2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The list over the fake DOM; the line's popup drawn from `party`, as the page has it now. */
  const listed = () => {
    fakeDocument();
    const party = { coming: 2, groups: ['A', 'B'] };
    const section = new FakeElement('section');
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      highlight: () => undefined,
      detail: () => {
        const detail = new FakeElement('div');
        const counts = new FakeElement('div');
        counts.textContent = `Coming ${party.coming}`;
        const pick = new FakeElement('select');
        pick.setAttribute('data-group-pick', '');
        for (const group of ['', ...party.groups]) {
          const option = new FakeElement('option');
          option.value = group;
          pick.append(option);
        }
        detail.append(counts, pick);
        return detail as unknown as HTMLElement;
      },
    });
    list.show([LINE]);
    const [button] = section.all('button');
    button?.fire('click');
    const pick = () => section.querySelector('select[data-group-pick]');
    return { section, list, party, pick };
  };

  it('draws its popup anew from a new list, keeping the group chosen while it is offered', () => {
    const { section, list, party, pick } = listed();
    expect(section.words()).toContain('Coming 2');
    const chosen = pick();
    if (!chosen) throw new Error('no group menu');
    chosen.value = 'B';
    // A move of the map (ListRefresh): the popup stays as it is, the very same element.
    list.render();
    expect(pick()).toBe(chosen);
    // A new list with other attendance: the popup drawn anew, the group chosen kept.
    party.coming = 5;
    list.show([LINE]);
    expect(section.words()).toContain('Coming 5');
    expect(pick()).not.toBe(chosen);
    expect(pick()?.value).toBe('B');
    // The group is no longer offered: the menu's own first choice.
    party.groups = ['A'];
    list.show([LINE]);
    expect(pick()?.value).toBe('');
  });

  it('draws an open line anew when its post came, and nothing for a line that is shut (8A-9)', () => {
    const { section, list, party } = listed();
    party.coming = 7;
    list.redrawLine('some other line');
    expect(section.words()).toContain('Coming 2');
    list.redrawLine(LINE.key);
    expect(section.words()).toContain('Coming 7');
  });
});

describe('the foot line to the official meetups (plan 8V-1, the Campfire links design)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The list over the fake DOM, with the Meetups layer offered or not. */
  const listed = (offered: boolean | undefined) => {
    fakeDocument();
    const section = new FakeElement('section');
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      highlight: () => undefined,
      detail: () => undefined,
      ...(offered === undefined ? {} : { officialMeetups: () => offered }),
    });
    list.show([LINE]);
    return section;
  };

  /** The foot line's words and its link, as a member sees and follows it. */
  const foot = (section: FakeElement) => {
    const line = section.children.at(-1);
    const link = line?.all('a')[0];
    return {
      words: line?.words().replace(/\s+/gu, ' ').trim(),
      href: link?.getAttribute('href'),
      target: link?.getAttribute('target'),
      rel: link?.getAttribute('rel'),
    };
  };

  it('ends the list with "Official meetups: Campfire", a link in a new tab', () => {
    expect(foot(listed(true))).toEqual({
      words: 'Official meetups: Campfire',
      href: 'https://campfire.scopely.com/discover',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('leaves it out where the Meetups layer is not offered', () => {
    expect(listed(false).words()).not.toContain('Campfire');
    expect(listed(undefined).words()).not.toContain('Campfire');
  });

  it('ends the pane of a visitor who is logged out or no member with it too', () => {
    fakeDocument();
    vi.stubGlobal('location', { pathname: '/' });
    for (const login of ['discord', 'links', 'member-only'] as const) {
      const pane = new FakeElement('aside');
      loggedOutPane(pane as unknown as HTMLElement, login, true);
      expect(foot(pane).words).toBe('Official meetups: Campfire');
      expect(foot(pane).href).toBe('https://campfire.scopely.com/discover');
      const without = new FakeElement('aside');
      loggedOutPane(without as unknown as HTMLElement, login, false);
      expect(without.words()).not.toContain('Campfire');
    }
  });
});

describe('a group of the list with a note (plan 8M-9B)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says the note under its heading, kept for a move of the map, gone with the next list', () => {
    fakeDocument();
    const section = new FakeElement('section');
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      highlight: () => undefined,
      detail: () => undefined,
    });
    const note = 'Back at 3:00 PM: the day’s research at 1 stop.';
    list.show([], { research: note });
    const said = () => section.all('p').map((one) => [one.className, one.textContent]);
    expect(section.all('h3').map((one) => one.textContent)).toEqual(['Field research · 0']);
    expect(said()).toEqual([['group-note', note]]);
    list.render();
    expect(said()).toEqual([['group-note', note]]);
    list.show([]);
    expect(said()).toEqual([['empty', 'Nothing is on just now.']]);
  });

  it('puts what its group adds beside its heading and under it (the filters, goal 5)', () => {
    fakeDocument();
    const section = new FakeElement('section');
    const made = (tag: string, text: string) => {
      const element = new FakeElement(tag);
      element.textContent = text;
      return element as unknown as HTMLElement;
    };
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      highlight: () => undefined,
      detail: () => undefined,
      groupHead: (kind) => (kind === 'research' ? [made('button', 'Filter…')] : []),
      groupBody: (kind) => (kind === 'research' ? [made('fieldset', 'Rare Candy')] : []),
    });
    list.show([], { research: '2 hidden by the filter.' });
    const [heading] = section.all('h3');
    expect(heading?.words().trim()).toBe('Field research · 0 Filter…');
    expect(section.all('fieldset').map((one) => one.textContent)).toEqual(['Rare Candy']);
  });
});

describe('the focus in the list drawn anew (review fix 2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lines: ListLine[] = [1, 2, 3].map((n) => ({
    ...LINE,
    key: `train:t${n}`,
    id: `t${n}`,
    name: `Train ${n}`,
  }));

  /** The list of three trains over the fake DOM, each line flying the map (none expanded). */
  const listed = () => {
    fakeDocument();
    const section = new FakeElement('section');
    section.root = true;
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => true,
      highlight: () => undefined,
      detail: () => undefined,
    });
    list.show(lines);
    /** The line button that has the focus, by the train it names. */
    const focusedLine = () =>
      focused.element?.tagName === 'button'
        ? focused.element.words().trim().split(/\s+/u).slice(0, 2).join(' ')
        : focused.element?.tagName;
    return { section, list, focusedLine };
  };

  it('stays on the line it was on, for a move of the map and for a new list', () => {
    const { section, list, focusedLine } = listed();
    section.all('button')[2]?.focus();
    expect(focusedLine()).toBe('Train 3');
    list.render();
    expect(focusedLine()).toBe('Train 3');
    expect(focused.element?.isConnected).toBe(true);
    list.show(lines);
    expect(focusedLine()).toBe('Train 3');
    expect(focused.element?.isConnected).toBe(true);
  });

  // Plan 8M-11A (S22): "What's going on", in the heading and the pane of somebody logged out.
  it("is headed What's going on, with its count, as is the pane of a non-member", () => {
    const { section } = listed();
    expect(section.words()).toContain("What's going on · 3");
    const pane = new FakeElement('aside');
    loggedOutPane(pane as unknown as HTMLElement, 'member-only');
    expect(pane.words()).toContain("What's going on");
    expect(pane.words()).toContain('Only members of this server see what is going on.');
    // A server in setup (plan 19C-2, S11): only its region editor is there.
    const setup = new FakeElement('aside');
    loggedOutPane(setup as unknown as HTMLElement, 'in-setup');
    expect(setup.words()).toContain(
      'Pine is not set up in this server yet. Draw its regions with Edit regions in your menu.',
    );
  });

  it('goes to the sort when the line it was on drops out (8M-7 follow-up N1)', () => {
    const { section, list } = listed();
    section.all('button')[2]?.focus();
    list.show(lines.slice(0, 2));
    expect(focused.element?.tagName).toBe('select');
    expect(focused.element?.attributes.has('data-sort')).toBe(true);
  });

  // Plan 8M-11A (S11): the parties' redraw arranges the side pane (`keepTools`), then shows the
  // new list; the line whose party ended gives its focus to the sort, not to the page.
  it('goes to the sort when the line it was on drops out in the redraw of the side pane', () => {
    const { section, list } = listed();
    const pane = new FakeElement('aside');
    pane.root = true;
    section.root = false;
    const box = new FakeElement('div');
    pane.append(section);
    section.all('button')[2]?.focus();
    // The redraw: the trains' box offered now, then the list without the third train.
    keepTools<FakeElement>(pane, [box, section]);
    list.show(lines.slice(0, 2));
    expect(focused.element?.tagName).toBe('select');
    expect(focused.element?.attributes.has('data-sort')).toBe(true);
    expect(focused.element?.isConnected).toBe(true);
  });

  it('stays on the sort while it is changed', () => {
    const { section, list } = listed();
    const [sort] = section.all('select');
    sort?.focus();
    list.render();
    expect(focused.element?.tagName).toBe('select');
    expect(focused.element).not.toBe(sort);
    expect(focused.element?.isConnected).toBe(true);
  });
});

describe("the list before the parties' list came (review round 2, R1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says that nothing is on only once the parties are known', () => {
    fakeDocument();
    const section = new FakeElement('section');
    let known = false;
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      highlight: () => undefined,
      detail: () => undefined,
      partiesKnown: () => known,
    });
    list.show([]);
    expect(section.words()).not.toContain('Nothing is on just now.');
    known = true;
    list.render();
    expect(section.words()).toContain('Nothing is on just now.');
  });
});

describe("Find's results in the list pane (plan 8M-12)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const REPORT: ListLine = {
    key: 'research:4',
    kind: 'research',
    id: '4',
    marker: 'stop:stop-4',
    name: 'Yellow Mural 4',
    place: 'Catch 10 Grass-type Pokémon · one of Sunkern, Seedot, Shroomish +3',
    point: null,
    picture: null,
    going: 0,
    soonest: null,
    times: { until: Date.UTC(2026, 9, 28, 4) },
    mark: 'not confirmed: one of 6 encounters',
  };

  /** The list with a search the test sets (`search.now`), the pane's scroll and the presses. */
  const finding = () => {
    fakeDocument();
    const section = new FakeElement('section');
    const scroller = { scrollTop: 0 };
    const search: { now: { text: string; groups: FindGroup[] } | undefined } = { now: undefined };
    const opened: string[] = [];
    const picked: string[] = [];
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      scroller,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: (line) => {
        opened.push(line.key);
        return true;
      },
      pick: (line) => {
        picked.push(line.key);
        return true;
      },
      highlight: () => undefined,
      detail: () => undefined,
      found: () => search.now,
    });
    list.show([LINE]);
    return { section, scroller, search, list, opened, picked };
  };

  it('shows the groups found instead of the list, a report not confirmed marked, no sort', () => {
    const { section, search, list, picked, opened } = finding();
    search.now = {
      text: 'skiddo',
      groups: [{ kind: 'reports', heading: 'Reports at stops · 1', lines: [REPORT] }],
    };
    list.render();
    const words = section.words();
    expect(words).toContain('Reports at stops · 1');
    expect(words).toContain('Yellow Mural 4');
    expect(words).toContain('not confirmed: one of 6 encounters');
    expect(words).not.toContain('Evening train');
    expect(section.all('select')).toEqual([]);
    // A tap on a line found picks it: its layer on, the map flown there.
    section.all('button')[0]?.fire('click');
    expect(picked).toEqual(['research:4']);
    expect(opened).toEqual([]);
  });

  // Branch review BR-3: a way back from "Found" besides emptying the box.
  it('offers "Back to the list" in the heading, which empties the box', () => {
    fakeDocument();
    const section = new FakeElement('section');
    let backs = 0;
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => true,
      highlight: () => undefined,
      detail: () => undefined,
      found: () => ({ text: 'zz', groups: [] }),
      back: () => {
        backs += 1;
      },
    });
    list.show([LINE]);
    const back = section
      .all('button')
      .find((button) => button.getAttribute('aria-label') === 'Back to the list');
    expect(back?.textContent).toBe('×');
    back?.fire('click');
    expect(backs).toBe(1);
  });

  it('says what is being asked for, and when nothing at all was found', () => {
    const { section, search, list } = finding();
    search.now = {
      text: 'zz',
      groups: [{ kind: 'places', heading: 'Places', lines: [], note: 'Finding places…' }],
    };
    list.render();
    expect(section.words()).toContain('Finding places…');
    expect(section.words()).not.toContain('Nothing found');
    search.now = { text: 'zz', groups: [] };
    list.render();
    expect(section.words()).toContain('Nothing found for ‘zz’.');
  });

  // Review F6: a line Find opened under its row stays Find's.
  it('shuts the lines Find opened under their rows once the box is cleared', () => {
    fakeDocument();
    const section = new FakeElement('section');
    const search: { now: { text: string; groups: FindGroup[] } | undefined } = { now: undefined };
    const list = new WhatIsOn({
      section: section as unknown as HTMLElement,
      registry: { isOn: () => true } as unknown as LayerRegistry,
      storage: undefined,
      origin: () => undefined,
      zone: () => 'America/New_York',
      units: 'imperial',
      open: () => false,
      // The map draws nothing for it: its popup under its row.
      pick: () => false,
      highlight: () => undefined,
      detail: () => {
        const detail = new FakeElement('div');
        detail.textContent = 'Its popup';
        return detail as unknown as HTMLElement;
      },
      found: () => search.now,
    });
    list.show([LINE]);
    search.now = {
      text: 'evening',
      groups: [{ kind: 'going', heading: 'Going on · 1', lines: [LINE] }],
    };
    list.render();
    section.all('button')[0]?.fire('click');
    expect(section.words()).toContain('Its popup');
    search.now = undefined;
    list.render();
    expect(section.words()).toContain('Evening train');
    expect(section.words()).not.toContain('Its popup');
  });

  it('gives the list back as it was once the box is cleared: its lines and its scroll', () => {
    const { section, scroller, search, list } = finding();
    scroller.scrollTop = 240;
    search.now = { text: 'skiddo', groups: [] };
    list.render();
    expect(scroller.scrollTop).toBe(0);
    scroller.scrollTop = 30;
    search.now = undefined;
    list.render();
    expect(section.words()).toContain('Evening train');
    expect(section.all('select')).toHaveLength(1);
    expect(scroller.scrollTop).toBe(240);
  });
});
