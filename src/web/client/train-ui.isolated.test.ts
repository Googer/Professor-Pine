import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapTrain } from '../../domain/web/party-data.js';
import type { RaidOptionsView } from '../../domain/web/raid-options-data.js';
import type { MapGym } from './popup.js';
import { FormHold, keepClicksInPopup } from './raid-forms.js';
import { formControls, raidUi } from './raid-ui.js';
import { spawnUi } from './spawn-ui.js';
import { gymSpawnPlace } from './spawn-forms.js';
import type { FirstStop } from './train-forms.js';
import { trainUi } from './train-ui.js';

// Leaflet reads the browser's `window` as it loads; the page's helpers it comes in with are not
// used here. Isolated: a mocked module needs a module graph of its own (testing.md).
vi.mock('leaflet', () => ({}));

type Listener = (event: { target: FakeElement; stopPropagation(): void }) => void;

/**
 * Just enough of an element for the trains' side of the page: attributes and `dataset`, the
 * tree, the fields' names and values, listeners (an event bubbles up the tree), and the
 * selectors `train-ui.ts` and its helpers ask (tags, classes, attributes, `:not([…])`, a
 * descendant).
 */
class FakeElement {
  /** What took the focus last. */
  static focused: FakeElement | undefined;
  focus(): void {
    FakeElement.focused = this;
  }
  className = '';
  hidden = false;
  disabled = false;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  childNodes: FakeElement[] = [];
  parent: FakeElement | undefined;
  /** The page itself: what hangs from it is in the page (`isConnected`). */
  page = false;
  private text: string | null = '';
  private typed: string | undefined;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tag: string) {}

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

  /** What was typed or picked; else the value it was drawn with (a menu's selected option). */
  get value(): string {
    if (this.typed !== undefined) return this.typed;
    if (this.tag === 'select') {
      const options = this.childNodes.filter((child) => child.tag === 'option');
      const picked = options.find((option) => option.attributes.has('selected')) ?? options[0];
      return picked?.attributes.get('value') ?? '';
    }
    return this.attributes.get('value') ?? '';
  }

  set value(value: string) {
    this.typed = value;
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

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.remove();
      child.parent = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.childNodes) child.parent = undefined;
    this.childNodes = [];
    this.append(...children);
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this);
    this.parent = undefined;
  }

  get parentElement(): FakeElement | null {
    return this.parent ?? null;
  }

  get firstElementChild(): FakeElement | null {
    return this.childNodes[0] ?? null;
  }

  get isConnected(): boolean {
    return upward(this).some((at) => at.page);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /**
   * An event at this element, bubbling up the tree as it was when the event began (a browser
   * fixes the way up first: an element taken out of the page meanwhile still has its event go up
   * to its old ancestors), until a listener stops it.
   */
  dispatch(type: string, more: { clientY?: number; pointerId?: number } = {}): void {
    let stopped = false;
    const event = {
      target: this,
      ...more,
      preventDefault: () => undefined,
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

  /** Where it is drawn: its row of the stop list as a test lays it out (`box`). */
  box = { top: 0, bottom: 0 };

  getBoundingClientRect(): { top: number; bottom: number } {
    return this.box;
  }

  /** A pointer captured (a drag): the events go to this element, as they are dispatched here. */
  setPointerCapture(): void {
    return undefined;
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

/** An element and its ancestors, nearest first. */
function upward(from: FakeElement): FakeElement[] {
  const line: FakeElement[] = [];
  for (let at: FakeElement | undefined = from; at; at = at.parent) line.push(at);
  return line;
}

/**
 * How often something has happened, as a count a test can wait for (`Tally` of
 * `test/support/`, which the page's own type check cannot take: its timers are Node's). A wait
 * that never comes in fails as the test's timeout.
 */
class Count {
  private seen = 0;
  private waiting: { times: number; resolve: () => void }[] = [];

  add(): void {
    this.seen += 1;
    const due = this.waiting.filter((waiter) => waiter.times <= this.seen);
    this.waiting = this.waiting.filter((waiter) => waiter.times > this.seen);
    for (const waiter of due) waiter.resolve();
  }

  reached(times: number): Promise<void> {
    if (this.seen >= times) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push({ times, resolve }));
  }
}

class FakeButton extends FakeElement {}
class FakeSelect extends FakeElement {}

/** Whether an element is what one compound selector says (`button.press[data-edit]:not([…])`). */
function matchesOne(element: FakeElement, compound: string): boolean {
  const nots = [...compound.matchAll(/:not\(\[([\w-]+)\]\)/g)].map((found) => found[1] ?? '');
  const rest = compound.replace(/:not\(\[[\w-]+\]\)/g, '');
  const tag = /^[a-z]+/.exec(rest)?.[0];
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((found) => found[1] ?? '');
  const attributes = [...rest.matchAll(/\[([\w-]+)\]/g)].map((found) => found[1] ?? '');
  const own = element.className.split(' ');
  return (
    (tag === undefined || element.tag === tag) &&
    classes.every((name) => own.includes(name)) &&
    attributes.every((name) => element.attributes.has(name)) &&
    nots.every((name) => !element.attributes.has(name))
  );
}

/** Whether an element is what a selector list says, a descendant combinator included. */
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

function make(tag: string): FakeElement {
  return tag === 'button'
    ? new FakeButton(tag)
    : tag === 'select'
      ? new FakeSelect(tag)
      : new FakeElement(tag);
}

const GUILD = '100000000000000001';

const gymOf = (id: number, name: string, nickname: string | null = null): MapGym => ({
  id,
  name,
  nickname,
  lat: 40.05,
  lon: -80.05,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

const GYMS = new Map([
  [4, gymOf(4, 'Veterans Memorial Bridge')],
  [1, gymOf(1, 'Pinewood Public Library', 'The Stacks')],
  [7, gymOf(7, 'Harbor Lighthouse Mural')],
  [2, gymOf(2, 'Riverside Gazebo')],
]);

const train = (more: Partial<MapTrain> = {}): MapTrain => ({
  kind: 'train',
  postKey: null,
  trainKind: 'raid',
  trainKindWords: 'Raid Train',
  endTime: null,
  id: 't1',
  name: 'Saturday legendaries',
  startTime: null,
  route: ['4', '1', '7'],
  spots: [],
  stop: 1,
  atEnd: 'finish',
  stopsAhead: [2],
  ahead: null,
  link: 'https://discord.com/channels/1/2',
  attendance: {
    groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
    going: 1,
    mine: null,
    actions: [],
    remote: { offered: false, on: false },
    count: false,
  },
  may: { arrange: true, clear: false, load: true },
  moves: {
    title: 'Move the train',
    place: '1',
    text: 'At stop 2 of 3: The Stacks\nNext is Harbor Lighthouse Mural',
    label: 'Where to',
    moves: [
      { move: 'next', target: '7', label: 'Next: Harbor Lighthouse Mural' },
      { move: 'previous', target: '4', label: 'Previous: Veterans Memorial Bridge' },
    ],
  },
  conductor: { who: null, mayTake: true, mayDrop: false },
  moveRefusal: null,
  mayManage: true,
  ...more,
});

/** The raids' pick lists as `/api/raid-options` gives them. */
const RAID_OPTIONS: RaidOptionsView = {
  zone: 'America/New_York',
  bosses: [{ value: 'b:yveltal:T5:0', name: 'Yveltal', tier: 'Level 5 raid' }],
  eggs: [{ value: 'e:T5:0', tier: 'Level 5 raid' }],
};

/** What the server answers a request of the page. */
type Answer = { status: number; body: unknown };

/**
 * The trains' side of the page (`trainUi`) over a fake document and `fetch`: `answer` gives what
 * the server answers each request (by default the member's saved routes, none, and 200 for the
 * rest). It records what was sent (`sent`, `requests`), what the notice said (`said`, `notices`),
 * route mode's drawings (`overlays`, `drawn`), the list drawn anew (`events`) and `done`.
 */
function page(
  answer: (url: string, body: unknown) => Answer | Promise<Answer> | undefined = () => undefined,
) {
  const notices = new Count();
  const said: string[] = [];
  const notice = make('div');
  /** The page's own key listeners (a drag's Escape), and a key pressed anywhere on it. */
  const keyListeners = new Set<(event: { key: string }) => void>();
  const document = {
    createElement: make,
    getElementById: (id: string) => (id === 'notice' ? sayer : null),
    addEventListener: (type: string, listener: (event: { key: string }) => void) => {
      if (type === 'keydown') keyListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: { key: string }) => void) => {
      if (type === 'keydown') keyListeners.delete(listener);
    },
  };
  const keyDown = (key: string): void => {
    for (const listener of [...keyListeners]) listener({ key });
  };
  // The notice's text, as `say` sets it.
  const sayer = new Proxy(notice, {
    set(target, key, value: unknown) {
      if (key === 'textContent' && typeof value === 'string') {
        said.push(value);
        notices.add();
      }
      return Reflect.set(target, key, value);
    },
  });
  vi.stubGlobal('document', document);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('HTMLSelectElement', FakeSelect);
  const sent: { url: string; body: unknown }[] = [];
  const requests = new Count();
  vi.stubGlobal('fetch', (url: string, init?: { body?: string }) => {
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(init.body);
    sent.push({ url, body });
    requests.add();
    const given =
      answer(url, body) ??
      (url.endsWith('/routes')
        ? { status: 200, body: { routes: [] } }
        : { status: 200, body: { ok: true, text: 'Done.' } });
    return Promise.resolve(given).then((one) => ({
      ok: one.status < 400,
      status: one.status,
      json: () => Promise.resolve(one.body),
    }));
  });
  const body = make('body');
  body.page = true;
  const tools = make('div');
  body.append(tools);
  /** The popup open on the map, which a form drawn into it is fitted to (`leafletPopup`). */
  const popups: { open?: { update(): void } } = {};
  const hold = new FormHold<unknown>({
    draw: () => undefined,
    popup: () => popups.open,
    later: (run) => {
      run();
    },
    controls: () => undefined,
  });
  const overlays: MapTrain[] = [];
  const drawn = new Count();
  const events: string[] = [];
  const done: (MapTrain | undefined)[] = [];
  const finished = new Count();
  /** Route mode begun (true) and ended (false), as the map is told. */
  const modes: boolean[] = [];
  /** What went into a post's answer line (plan 8M-11A, S9). */
  const answers: { partyId: string; text: string; ok: boolean }[] = [];
  /**
   * The dragged stop's new legs on the map (plan 8M-11B, S24): where it would land as each was
   * shown (`from>to`), `cleared` when they went.
   */
  const dragLines: string[] = [];
  /** The map held while a stop's handle is held (S25): how often held, and whether it is now. */
  const map = { holds: 0, held: false };
  /** How often the open popup or card was closed. */
  const closed = { popups: 0 };
  const ui = trainUi({
    answered: (partyId, answer) => {
      answers.push({ partyId, ...answer });
    },
    guild: GUILD,
    csrf: { get: () => 'token', set: () => undefined },
    regions: [],
    gyms: GYMS,
    hold,
    tools: tools as unknown as HTMLElement,
    overlay: {
      show: (shown) => {
        overlays.push(shown);
        drawn.add();
      },
      clear: () => {
        events.push('numbers cleared');
      },
    },
    closePopup: () => {
      closed.popups += 1;
    },
    done: (opened) => {
      events.push(`done ${opened?.id ?? 'none'}`);
      done.push(opened);
      finished.add();
      return Promise.resolve();
    },
    refresh: () => Promise.resolve(),
    routeMode: (on: boolean) => {
      modes.push(on);
    },
    dragLine: {
      show: (_train, from, to) => {
        dragLines.push(`${String(from)}>${String(to)}`);
      },
      clear: () => {
        dragLines.push('cleared');
      },
    },
    holdMap: () => {
      map.holds += 1;
      map.held = true;
      return () => {
        map.held = false;
      };
    },
    redrawn: () => {
      events.push(`list drawn, routing ${ui.routing()?.id ?? 'none'}`);
    },
  });
  /** A train's action button, as its popup or side panel item has it. */
  const action = (attribute: string, value: string, inBox?: FakeElement) => {
    const button = make('button');
    button.setAttribute(attribute, value);
    inBox?.append(button);
    return button as unknown as HTMLButtonElement;
  };
  return {
    ui,
    tools,
    body,
    hold,
    popups,
    sent,
    requests,
    said,
    notices,
    overlays,
    drawn,
    events,
    done,
    finished,
    action,
    modes,
    keyDown,
    answers,
    dragLines,
    map,
    closed,
  };
}

/** The route editor as route mode drew it last. */
const editorOf = (tools: FakeElement): FakeElement => {
  const editor = tools.firstElementChild;
  if (editor?.dataset.form !== 'route') throw new Error('route mode drew no editor');
  return editor;
};

describe('"Start train here": a train started at a gym or a Power Spot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const newTrain = train({ route: [], stop: null, stopsAhead: [] });

  /** The start form opened at `first`, its name typed, and Start pressed. */
  const started = (shown: ReturnType<typeof page>, first: FirstStop): void => {
    shown.ui.trainHereClicked(first, 1);
    const form = shown.tools.firstElementChild;
    const name = form?.querySelector('input[name="name"]');
    const region = form?.querySelector('select[name="region"]');
    if (!form || !name || !region) throw new Error('no start form');
    name.value = 'Mill run';
    region.value = '1';
    form.querySelector('button[data-submit="train"]')?.dispatch('click');
  };

  const answers = (added: Answer) => (url: string) => {
    if (url.endsWith('/api/trains')) {
      return { status: 200, body: { ok: true, text: 'Your train is made.', train: newTrain } };
    }
    return url.endsWith('/route/add') ? added : undefined;
  };

  it('opens the form with the popup closed and the place named', () => {
    const shown = page();
    shown.ui.trainHereClicked({ name: 'The Stacks', stop: { gym: 1 } }, 1);
    expect(shown.closed.popups).toBe(1);
    const form = shown.tools.firstElementChild;
    expect(form?.dataset.form).toBe('train');
    expect(form?.querySelector('.first-stop')?.textContent).toBe('First stop: The Stacks');
    expect(FakeElement.focused?.attributes.get('name')).toBe('name');
  });

  it('is off while another form is open', () => {
    const shown = page();
    const button = shown.action('data-train-here', '7', shown.tools);
    formControls(shown.tools as unknown as HTMLElement, false);
    expect(button.disabled).toBe(true);
  });

  it('makes the train, opens route mode and adds the gym as its first stop', async () => {
    const shown = page(
      answers({
        status: 200,
        body: {
          ok: true,
          text: 'The Stacks is stop 1 of the route. The train is there now.',
          train: { ...newTrain, route: ['1'], stop: 0 },
        },
      }),
    );
    started(shown, { name: 'The Stacks', stop: { gym: 1 } });
    await shown.requests.reached(3);
    // "Your train is made", then the stop added.
    await shown.notices.reached(2);
    const posts = shown.sent.filter((one) => !one.url.endsWith('/routes'));
    expect(posts.map((one) => one.url)).toEqual([
      `/s/${GUILD}/api/trains`,
      `/s/${GUILD}/api/trains/t1/route/add`,
    ]);
    expect(posts[0]?.body).toMatchObject({ name: 'Mill run', region: 1 });
    expect(posts[0]?.body).not.toHaveProperty('kind');
    expect(posts[1]?.body).toMatchObject({ drawn: [], stop: '1' });
    expect(shown.ui.routing()?.route).toEqual(['1']);
    expect(shown.modes).toEqual([true]);
  });

  it('makes a Dynamax train at a Power Spot, and adds the spot by its key', async () => {
    const shown = page(
      answers({ status: 200, body: { ok: true, text: 'Added.', train: newTrain } }),
    );
    started(shown, {
      name: 'Old Mill (Power Spot)',
      stop: { spot: 'wabc' },
      kind: 'dynamax',
    });
    await shown.requests.reached(3);
    const posted = shown.sent.filter((one) => !one.url.endsWith('/routes'));
    expect(posted[0]?.body).toMatchObject({ kind: 'dynamax' });
    expect(posted[1]?.body).toMatchObject({ drawn: [], stop: 'wabc' });
  });

  it('stays in route mode with the refusal under the editor when the stop is refused', async () => {
    const shown = page(
      answers({
        status: 422,
        body: { ok: false, text: 'That stop cannot be added.', train: newTrain },
      }),
    );
    started(shown, { name: 'The Stacks', stop: { gym: 1 } });
    await shown.requests.reached(3);
    // "Your train is made", then the refusal.
    await shown.notices.reached(2);
    expect(shown.ui.routing()?.id).toBe('t1');
    expect(editorOf(shown.tools).querySelector('.form-answer')?.textContent).toBe(
      'Your train is made. That stop cannot be added.',
    );
  });

  // Review N1: a refusal answers before the saved routes, whose answer draws the editor anew.
  it('keeps the answer under the editor when the saved routes come after it', async () => {
    let release = (_answer: Answer): void => undefined;
    const held = new Promise<Answer>((resolve) => {
      release = resolve;
    });
    const refused = answers({
      status: 422,
      body: { ok: false, text: 'That stop cannot be added.', train: newTrain },
    });
    const shown = page((url) => (url.endsWith('/routes') ? held : refused(url)));
    started(shown, { name: 'The Stacks', stop: { gym: 1 } });
    await shown.notices.reached(2);
    // Drawn as route mode began and with the answer; then the two questions of the saved routes.
    release({ status: 200, body: { routes: [] } });
    await shown.drawn.reached(4);
    expect(editorOf(shown.tools).querySelector('.form-answer')?.textContent).toBe(
      'Your train is made. That stop cannot be added.',
    );
  });

  it('adds nothing for a member who may not arrange the train, and opens its popup', async () => {
    const shown = page((url) =>
      url.endsWith('/api/trains')
        ? {
            status: 200,
            body: {
              ok: true,
              text: 'Your train is made.',
              train: { ...newTrain, may: { arrange: false, clear: false, load: false } },
            },
          }
        : undefined,
    );
    started(shown, { name: 'The Stacks', stop: { gym: 1 } });
    await shown.finished.reached(1);
    expect(shown.sent.map((one) => one.url)).toEqual([`/s/${GUILD}/api/trains`]);
    expect(shown.done[0]?.id).toBe('t1');
    expect(shown.ui.routing()).toBeUndefined();
  });

  describe('at a place, its popup closed while the train is made (review, finding 4)', () => {
    /** The start form in a popup, in the place of its control, filled in and sent. */
    const sentFromPopup = (shown: ReturnType<typeof page>) => {
      const popup = make('div');
      popup.className = 'leaflet-popup';
      const box = make('div');
      popup.append(box);
      shown.body.append(popup);
      const here = shown.action('data-train-here', '1', box);
      shown.ui.trainHereClicked({ name: 'The Stacks', stop: { gym: 1 } }, 1, here);
      const form = box.firstElementChild;
      const name = form?.querySelector('input[name="name"]');
      const region = form?.querySelector('select[name="region"]');
      if (!form || !name || !region) throw new Error('no start form in the popup');
      name.value = 'Mill run';
      region.value = '1';
      form.querySelector('button[data-submit="train"]')?.dispatch('click');
    };
    const added = {
      status: 200,
      body: { ok: true, text: 'The Stacks is stop 1.', train: train() },
    };

    it('is drawn in the place of its control, the popup and the side pane left alone', () => {
      const shown = page();
      const popup = make('div');
      popup.className = 'leaflet-popup';
      const box = make('div');
      popup.append(box);
      shown.body.append(popup);
      const here = shown.action('data-train-here', '1', box);
      shown.ui.trainHereClicked({ name: 'The Stacks', stop: { gym: 1 } }, 1, here);
      expect(box.firstElementChild?.dataset.form).toBe('train');
      expect(shown.closed.popups).toBe(0);
      expect(shown.ui.inTools()).toBe(false);
    });

    it('says the train, adds its first stop without route mode, and opens nothing', async () => {
      const shown = page(answers(added));
      sentFromPopup(shown);
      shown.hold.popupClosed();
      await shown.finished.reached(1);
      expect(shown.sent.map((one) => one.url.split('/').slice(-2).join('/'))).toEqual([
        'api/trains',
        'route/add',
      ]);
      expect(shown.said.at(-1)).toBe('Your train is made. The Stacks is stop 1.');
      expect(shown.done).toEqual([undefined]);
      expect(shown.ui.routing()).toBeUndefined();
      expect(shown.modes).toEqual([]);
      expect(shown.closed.popups).toBe(0);
    });

    it('says a refusal of the train, and adds nothing', async () => {
      const shown = page((url) =>
        url.endsWith('/api/trains') ? { status: 422, body: { ok: false, text: 'No.' } } : undefined,
      );
      sentFromPopup(shown);
      shown.hold.popupClosed();
      await shown.notices.reached(1);
      expect(shown.said).toEqual(['No.']);
      expect(shown.sent).toHaveLength(1);
      expect(shown.done).toEqual([]);
    });
  });

  it('refuses while another form is open, and makes nothing when Cancel is pressed', () => {
    const shown = page();
    shown.ui.trainHereClicked({ name: 'The Stacks', stop: { gym: 1 } }, 1);
    shown.ui.trainHereClicked({ name: 'Riverside Gazebo', stop: { gym: 2 } }, 1);
    expect(shown.said).toHaveLength(1);
    const form = shown.tools.firstElementChild;
    expect(form?.querySelector('.first-stop')?.textContent).toBe('First stop: The Stacks');
    form?.querySelector('button[data-cancel]')?.dispatch('click');
    expect(shown.sent).toEqual([]);
    expect(shown.ui.routing()).toBeUndefined();
  });
});

describe('route mode (trainUi)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Plan 8M-11A (S9): the conductor's buttons answer in the post's answer line, not the notice.
  it("answers Be the conductor in the post's answer line", async () => {
    const shown = page();
    shown.ui.actionClicked(shown.action('data-conductor', 'take'), train());
    await shown.finished.reached(1);
    expect(shown.answers).toEqual([{ partyId: 't1', text: 'Done.', ok: true }]);
    expect(shown.said).toEqual([]);
  });

  // Re-review N1: the gyms' and Power Spots' dots are Tab stops only in route mode.
  it('tells the map when route mode begins and when it ends', async () => {
    const shown = page();
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    expect(shown.modes).toEqual([true]);
    await shown.drawn.reached(2);
    editorOf(shown.tools).querySelector('button[data-cancel]')?.dispatch('click');
    await shown.finished.reached(1);
    expect(shown.modes).toEqual([true, false]);
  });

  it("draws the list anew as route mode starts and ends: the train's own line leaves at once and comes back on Done", async () => {
    const shown = page();
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    expect(shown.events).toEqual(['list drawn, routing t1']);
    await shown.requests.reached(1);
    editorOf(shown.tools).querySelector('button[data-cancel]')?.dispatch('click');
    await shown.finished.reached(1);
    expect(shown.events).toEqual([
      'list drawn, routing t1',
      'numbers cleared',
      'list drawn, routing none',
      'done t1',
    ]);
  });

  it('keeps the name typed to save under and the saved route picked when an answer draws the editor anew; a route saved clears the name', async () => {
    const longer = train({ route: ['4', '1', '7', '2'] });
    const shown = page((url) => {
      if (url.endsWith('/routes')) {
        return {
          status: 200,
          body: { routes: [{ id: 5, name: 'Downtown', stops: 3, atEnd: 'loop' }] },
        };
      }
      if (url.endsWith('/route/add')) {
        return { status: 200, body: { ok: true, text: 'Stop 4 is added.', train: longer } };
      }
      if (url.endsWith('/route/save')) {
        return { status: 200, body: { ok: true, text: 'I saved this route.', train: longer } };
      }
      return undefined;
    });
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    // Drawn, then drawn again with the saved routes.
    await shown.drawn.reached(2);
    const field = (selector: string) => editorOf(shown.tools).querySelector(selector);
    const typed = field('input[name]');
    const menu = field('select[name]');
    if (!typed || !menu) throw new Error('the editor has no name or saved route to pick');
    typed.value = 'Harbor loop';
    menu.value = '5';
    const riverside = GYMS.get(2);
    if (!riverside) throw new Error('no Riverside Gazebo');
    expect(shown.ui.gymClicked(riverside)).toBe(true);
    await shown.drawn.reached(3);
    expect(shown.overlays.at(-1)?.route).toEqual(['4', '1', '7', '2']);
    expect(field('input[name]')?.value).toBe('Harbor loop');
    expect(field('select[name]')?.value).toBe('5');
    const save = editorOf(shown.tools)
      .querySelectorAll('button')
      .find((button) => button.dataset.edit === 'save');
    save?.dispatch('click');
    // Drawn from the answer, then again with the saved routes as they are now.
    await shown.drawn.reached(5);
    expect(shown.sent.find(({ url }) => url.endsWith('/route/save'))?.body).toEqual({
      drawn: ['4', '1', '7', '2'],
      name: 'Harbor loop',
    });
    expect(field('input[name]')?.value).toBe('');
    expect(field('select[name]')?.value).toBe('5');
  });

  // Plan 8M-8C, R6: a stop dragged in the stop list and dropped is one `/route move`.
  it('moves a stop dragged by its handle and dropped on another row, with the route as it was drawn', async () => {
    const shown = page();
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    await shown.drawn.reached(2);
    const editor = editorOf(shown.tools);
    const rows = editor.querySelectorAll('li');
    rows.forEach((row, index) => {
      row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
    });
    const handle = rows[2]?.querySelector('.drag-handle');
    if (!handle) throw new Error('no handle on the third stop');
    handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
    handle.dispatch('pointermove', { clientY: 140, pointerId: 1 });
    handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
    expect(rows[0]?.className.split(' ')).toContain('drop-target');
    handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
    expect(rows.some((row) => row.className.split(' ').includes('drop-target'))).toBe(false);
    await shown.requests.reached(2);
    expect(shown.sent.at(-1)).toEqual({
      url: `/s/${GUILD}/api/trains/t1/route/move`,
      body: { drawn: ['4', '1', '7'], from: 3, to: 1 },
    });
    // A drop where the stop was sends nothing.
    await shown.drawn.reached(3);
    const again = editorOf(shown.tools).querySelectorAll('li');
    again.forEach((row, index) => {
      row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
    });
    const second = again[1]?.querySelector('.drag-handle');
    second?.dispatch('pointerdown', { clientY: 145, pointerId: 2 });
    second?.dispatch('pointerup', { clientY: 145, pointerId: 2 });
    expect(shown.sent).toHaveLength(2);
  });

  /**
   * Route mode on a page, drawn and with the saved routes in, and the handle of a stop of the
   * editor drawn last, its rows laid out 30 pixels high from 100.
   */
  const dragging = async (answer?: Parameters<typeof page>[0]) => {
    const shown = page(answer);
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    await shown.drawn.reached(2);
    const handleOf = (stop: number) => {
      const rows = editorOf(shown.tools).querySelectorAll('li');
      rows.forEach((row, index) => {
        row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
      });
      const handle = rows[stop - 1]?.querySelector('.drag-handle');
      if (!handle) throw new Error(`no handle on stop ${stop}`);
      return { handle, rows };
    };
    return { shown, handleOf };
  };
  /** The stops whose rows are marked as where the dragged stop would land. */
  const marked = (rows: FakeElement[]) =>
    rows.flatMap((row, index) =>
      row.className.split(' ').includes('drop-target') ? [index + 1] : [],
    );

  // Review C2: a drag never outlives the editor it began in.
  it('drops nothing of a drag whose editor was drawn anew between the press and the release', async () => {
    const longer = train({ route: ['4', '1', '7', '2'] });
    const { shown, handleOf } = await dragging((url) =>
      url.endsWith('/route/add')
        ? { status: 200, body: { ok: true, text: 'Stop 4 is added.', train: longer } }
        : undefined,
    );
    const old = handleOf(3);
    old.handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
    old.handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
    // A gym clicked meanwhile is added: its answer draws the editor anew.
    const riverside = GYMS.get(2);
    if (!riverside) throw new Error('no Riverside Gazebo');
    shown.ui.gymClicked(riverside);
    await shown.drawn.reached(3);
    expect(marked(old.rows)).toEqual([]);
    old.handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
    expect(shown.sent.map(({ url }) => url.split('/').slice(-2).join('/'))).toEqual([
      't1/routes',
      'route/add',
    ]);
  });

  // Branch review B1: an edit begun while a drag is on (a second finger taps a gym) ends the drag,
  // so its pointer lifted before the edit's answer queues no move against the route before.
  it('ends a drag when an edit begins: the pointer released before the edit is answered moves nothing', async () => {
    const { shown, handleOf } = await dragging();
    const old = handleOf(3);
    old.handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
    old.handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
    const riverside = GYMS.get(2);
    if (!riverside) throw new Error('no Riverside Gazebo');
    shown.ui.gymClicked(riverside);
    expect(marked(old.rows)).toEqual([]);
    old.handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
    // An edit after the add's answer goes out next: a move queued by the release would go first.
    await shown.drawn.reached(3);
    shown.ui.spotClicked({ id: '0a1b2c3d4', title: 'Lake Gazebo' });
    await shown.requests.reached(3);
    expect(shown.sent.map(({ url }) => url.split('/').slice(-2).join('/'))).toEqual([
      't1/routes',
      'route/add',
      'route/add',
    ]);
  });

  // Review C2: Escape, a pointer lost and another pointer move nothing.
  it('ends a drag on Escape or when its pointer is lost, and follows the pointer that began it only', async () => {
    const { shown, handleOf } = await dragging();
    const escaped = handleOf(3);
    escaped.handle.dispatch('pointerdown', { clientY: 175, pointerId: 2 });
    escaped.handle.dispatch('pointermove', { clientY: 110, pointerId: 2 });
    expect(marked(escaped.rows)).toEqual([1]);
    shown.keyDown('Escape');
    expect(marked(escaped.rows)).toEqual([]);
    escaped.handle.dispatch('pointerup', { clientY: 110, pointerId: 2 });
    // The pointer lost (the browser took it back).
    const lost = handleOf(3);
    lost.handle.dispatch('pointerdown', { clientY: 175, pointerId: 3 });
    lost.handle.dispatch('pointermove', { clientY: 110, pointerId: 3 });
    lost.handle.dispatch('lostpointercapture', { pointerId: 3 });
    expect(marked(lost.rows)).toEqual([]);
    lost.handle.dispatch('pointerup', { clientY: 110, pointerId: 3 });
    // Another pointer's moves and release are not the drag's.
    const other = handleOf(3);
    other.handle.dispatch('pointerdown', { clientY: 175, pointerId: 4 });
    other.handle.dispatch('pointermove', { clientY: 110, pointerId: 5 });
    other.handle.dispatch('pointerup', { clientY: 110, pointerId: 5 });
    expect(marked(other.rows)).toEqual([]);
    other.handle.dispatch('pointerup', { clientY: 175, pointerId: 4 });
    expect(shown.sent.map(({ url }) => url.split('/').slice(-2).join('/'))).toEqual(['t1/routes']);
    // The drag that follows moves the stop.
    other.handle.dispatch('pointerdown', { clientY: 175, pointerId: 6 });
    other.handle.dispatch('pointermove', { clientY: 110, pointerId: 6 });
    other.handle.dispatch('pointerup', { clientY: 110, pointerId: 6 });
    await shown.requests.reached(2);
    expect(shown.sent.at(-1)?.body).toEqual({ drawn: ['4', '1', '7'], from: 3, to: 1 });
  });

  // Plan 8M-11B (S24): the map shows where the dragged stop would land, until the drag ends.
  it("shows the dragged stop's new legs on the map as the pointer moves, and clears them at the drop", async () => {
    const { shown, handleOf } = await dragging();
    const { handle } = handleOf(3);
    handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
    handle.dispatch('pointermove', { clientY: 140, pointerId: 1 });
    handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
    handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
    expect(shown.dragLines).toEqual(['3>3', '3>2', '3>1', 'cleared']);
  });

  // Plan 8M-11B (S25): the map's touch zoom and dragging are off while a stop is held, whatever
  // ends the drag.
  describe('holds the map while a stop is held, and lets it go however the drag ends', () => {
    const ends: Array<
      [string, (end: Awaited<ReturnType<typeof dragging>>, handle: FakeElement) => void]
    > = [
      [
        'dropped on another row',
        (_end, handle) => {
          handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
          handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
        },
      ],
      [
        'dropped where it was',
        (_end, handle) => {
          handle.dispatch('pointerup', { clientY: 175, pointerId: 1 });
        },
      ],
      ['Escape', ({ shown }) => shown.keyDown('Escape')],
      [
        'the pointer canceled',
        (_end, handle) => {
          handle.dispatch('pointercancel', { pointerId: 1 });
        },
      ],
      [
        'the pointer capture lost',
        (_end, handle) => {
          handle.dispatch('lostpointercapture', { pointerId: 1 });
        },
      ],
      [
        'an edit begun (a gym tapped)',
        ({ shown }) => {
          const riverside = GYMS.get(2);
          if (!riverside) throw new Error('no Riverside Gazebo');
          shown.ui.gymClicked(riverside);
        },
      ],
      [
        'route mode ended',
        ({ shown }) => {
          editorOf(shown.tools).querySelector('button[data-cancel]')?.dispatch('click');
        },
      ],
    ];
    for (const [how, end] of ends) {
      it(how, async () => {
        const started = await dragging();
        const { handle } = started.handleOf(3);
        handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
        expect(started.shown.map).toEqual({ holds: 1, held: true });
        end(started, handle);
        expect(started.shown.map).toEqual({ holds: 1, held: false });
        expect(started.shown.dragLines.at(-1)).toBe('cleared');
      });
    }

    it('another pointer neither holds the map nor lets it go', async () => {
      const started = await dragging();
      const { handle } = started.handleOf(3);
      handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
      handle.dispatch('pointerup', { clientY: 110, pointerId: 2 });
      handle.dispatch('pointerdown', { clientY: 145, pointerId: 3 });
      expect(started.shown.map).toEqual({ holds: 1, held: true });
    });
  });

  // Plan 8M-8C, R5: a Power Spot of the map's layer is a stop to tap in route mode, as a gym is.
  it('adds a Power Spot tapped in route mode as the next stop, by its key; out of route mode a tap is its own', async () => {
    const shown = page();
    const lake = { id: '0a1b2c3d4', title: 'Lake Gazebo' };
    expect(shown.ui.spotClicked(lake)).toBe(false);
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    await shown.drawn.reached(2);
    expect(shown.ui.spotClicked(lake)).toBe(true);
    await shown.requests.reached(2);
    expect(shown.sent.at(-1)).toEqual({
      url: `/s/${GUILD}/api/trains/t1/route/add`,
      body: { drawn: ['4', '1', '7'], stop: 'w0a1b2c3d4' },
    });
  });

  it('says a gym clicked that is on the route already under the editor, and sends nothing', async () => {
    const shown = page();
    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
    await shown.drawn.reached(2);
    const stacks = GYMS.get(1);
    if (!stacks) throw new Error('no Stacks');
    expect(shown.ui.gymClicked(stacks)).toBe(true);
    await shown.notices.reached(1);
    expect(shown.said).toEqual(['That stop is on the route already.']);
    expect(editorOf(shown.tools).querySelector('.form-answer')?.textContent).toBe(
      'That stop is on the route already.',
    );
    expect(shown.sent.map(({ url }) => url)).toEqual([`/s/${GUILD}/api/trains/t1/routes`]);
  });
});

describe('a form in a popup on the map, as Leaflet takes its clicks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Whether Leaflet marked an element as one whose clicks are not the map's. */
  const marked = (element: FakeElement): boolean =>
    (element as unknown as Record<string, unknown>)._leaflet_disable_click === true;

  /**
   * A popup open on the map as Leaflet 1.9.4 makes it: the map's element; the popup's, which
   * `DomEvent.disableClickPropagation` marks `_leaflet_disable_click`, around its content's; the
   * content a function held while a form is open (`FormHold.content`), which `update()` asks
   * again and puts in anew (`DivOverlay._updateContent`); and the map's click as
   * `Map._handleDOMEvent` takes it: the map's own unless a marked element is found walking up from
   * the click's target (`_isClickDisabled`), and a click of the map's closes the popup that is
   * open (`closePopupOnClick`, by the `preclick` it fires first). The page keeps the clicks in a
   * popup as it opens (`keepClicksInPopup`, the map's `popupopen` in `party-layer.ts`).
   */
  const leafletPopup = (shown: ReturnType<typeof page>, draw: () => FakeElement) => {
    const map = make('div');
    shown.body.append(map);
    const element = make('div');
    element.className = 'leaflet-popup';
    (element as unknown as Record<string, unknown>)._leaflet_disable_click = true;
    const content = make('div');
    element.append(content);
    map.append(element);
    const held = shown.hold.content(draw);
    const updates = new Count();
    const popup = {
      update: () => {
        content.replaceChildren(held());
        updates.add();
      },
    };
    let closed = false;
    map.addEventListener('click', (event) => {
      for (let at: FakeElement | undefined = event.target; at && at !== map; at = at.parent) {
        if (marked(at)) return;
      }
      closed = true;
      element.remove();
      shown.popups.open = undefined;
      shown.hold.popupClosed();
    });
    popup.update();
    shown.popups.open = popup;
    keepClicksInPopup(element);
    return { updates, closed: () => closed };
  };

  it("puts a gym's button back when the spawn form in its popup is cancelled, the popup open", async () => {
    const shown = page((url) =>
      url.endsWith('/wild-options')
        ? { status: 200, body: { pokemon: [['pikachu', 'Pikachu']] } }
        : undefined,
    );
    const spawns = spawnUi({
      guild: GUILD,
      csrf: { get: () => 'token', set: () => undefined },
      regions: [],
      hold: shown.hold,
      popupAt: () => {
        throw new Error('the form opens in the gym’s popup');
      },
    });
    const stacks = GYMS.get(1);
    if (!stacks) throw new Error('no Stacks');
    const control = spawns.spawnControl(gymSpawnPlace(stacks)) as unknown as FakeElement;
    const button = control.querySelector('button');
    const popup = leafletPopup(shown, () => {
      const drawn = make('div');
      drawn.append(control);
      return drawn;
    });
    button?.dispatch('click');
    // Fitted to the form once the list of Pokémon came.
    await popup.updates.reached(2);
    control.querySelector('button[data-cancel]')?.dispatch('click');
    expect(popup.closed()).toBe(false);
    expect(control.childNodes).toEqual([button]);
    expect(shown.hold.editing).toBe(false);
  });

  /** The raids' side of the page (`raidUi`) over `shown`'s page; `done` records what it opened. */
  const raidsOf = (shown: ReturnType<typeof page>) => {
    const done: unknown[] = [];
    const raids = raidUi({
      guild: GUILD,
      csrf: { get: () => 'token', set: () => undefined },
      regionNames: new Map([[1, 'downtown']]),
      hold: shown.hold,
      done: (raid) => {
        done.push(raid);
        return Promise.resolve();
      },
      answered: () => undefined,
      refused: () => undefined,
    });
    return { raids, done };
  };

  /** The pick lists (`/raid-options`); a raid's moves are not known (404). */
  const raidLists = (url: string): Answer | undefined =>
    url.endsWith('/raid-options')
      ? { status: 200, body: RAID_OPTIONS }
      : url.endsWith('/moves')
        ? { status: 404, body: {} }
        : undefined;

  it("puts a gym's Report raid button back when the report form in its popup is cancelled, the popup open", async () => {
    const shown = page(raidLists);
    const { raids } = raidsOf(shown);
    const stacks = GYMS.get(1);
    if (!stacks) throw new Error('no Stacks');
    const control = raids.reportControl(stacks) as unknown as FakeElement;
    const button = control.querySelector('button');
    const popup = leafletPopup(shown, () => {
      const drawn = make('div');
      drawn.append(control);
      return drawn;
    });
    button?.dispatch('click');
    // Fitted to the form once the pick lists came.
    await popup.updates.reached(2);
    expect(control.querySelector('select[name]')).not.toBeNull();
    expect(shown.hold.editing).toBe(true);
    control.querySelector('button[data-cancel]')?.dispatch('click');
    expect(popup.closed()).toBe(false);
    expect(control.childNodes).toEqual([button]);
    expect(shown.hold.editing).toBe(false);
  });

  it("puts a raid's section back when the change form in its popup is cancelled, the popup open", async () => {
    const shown = page(raidLists);
    const { raids, done } = raidsOf(shown);
    const section = make('div');
    section.className = 'raid';
    const title = make('div');
    title.textContent = 'Yveltal';
    const change = make('button');
    change.setAttribute('data-change-raid', 'r1');
    section.append(title, change);
    const popup = leafletPopup(shown, () => {
      const drawn = make('div');
      drawn.append(section);
      // As the party layer hands "Manage…" to the raids' side (`draw`).
      drawn.addEventListener('click', (event) => {
        if (event.target.dataset.changeRaid !== undefined) {
          raids.changeClicked(event.target as unknown as HTMLButtonElement);
        }
      });
      return drawn;
    });
    change.dispatch('click');
    // Fitted to the form once the pick lists and the moves were asked for.
    await popup.updates.reached(2);
    expect(section.childNodes.includes(title)).toBe(false);
    expect(section.querySelector('button[data-cancel]')).not.toBeNull();
    expect(shown.hold.editing).toBe(true);
    section.querySelector('button[data-cancel]')?.dispatch('click');
    expect(popup.closed()).toBe(false);
    expect(section.childNodes).toEqual([title, change]);
    expect(shown.hold.editing).toBe(false);
    expect(done).toEqual([]);
  });
});
