import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, focused, make, resetFocus } from '../../../test/support/fake-page.js';
import type { RegionChangeAnswer, RegionsMineView } from '../../domain/web/region-data.js';
import { regionsUi } from './regions-ui.js';

/*
 * The box of "Your regions" (plan 8M-20) over a page of fakes: opened as an aside claim of the
 * side pane's box, a press that disables every Join and Leave, says the answer in its row and in
 * the box's live line and draws the rows anew in place, and ×, ← Back and Escape that close it.
 * Isolated: it stubs `document`.
 */

const GUILD = '412345678901234567';

const hiddenWest: RegionsMineView = {
  readOnly: false,
  roles: true,
  regions: [
    {
      id: 1,
      access: 'hidden',
      listed: true,
      join: [
        {
          roleId: 'west',
          name: 'West',
          alsoOpens: [],
          alsoLeaves: { roles: [], regions: [] },
          stuck: null,
        },
      ],
      leave: [],
    },
    {
      id: 4,
      access: 'visible',
      listed: true,
      join: [],
      leave: [{ roleId: 'plaza', name: 'Plaza', closes: true, alsoCloses: [], stillOpenBy: [] }],
    },
  ],
};

const seenWest: RegionsMineView = {
  ...hiddenWest,
  regions: [
    {
      id: 1,
      access: 'visible',
      listed: true,
      join: [],
      leave: [{ roleId: 'west', name: 'West', closes: true, alsoCloses: [], stillOpenBy: [] }],
    },
    hiddenWest.regions[1] ?? hiddenWest.regions[0]!,
  ],
};

type Key = {
  key: string;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
};

function fixture(options: { asks?: Array<RegionsMineView | Error>; outlinesShown?: boolean } = {}) {
  resetFocus();
  const listeners: Record<string, Array<(event: never) => void>> = {};
  vi.stubGlobal('document', {
    createElement: make,
    activeElement: null,
    addEventListener: (type: string, listener: (event: never) => void) => {
      (listeners[type] ??= []).push(listener);
    },
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeElement);
  const body = make('body');
  body.page = true;
  const tools = make('div');
  const idle = make('button');
  tools.append(idle);
  const elsewhere = make('div');
  body.append(tools, elsewhere);
  const takes: unknown[][] = [];
  let holder: object | undefined;
  const released: unknown[] = [];
  const hold = {
    take: (...args: unknown[]) => {
      if (holder !== undefined) return undefined;
      takes.push(args);
      holder = {};
      return holder as never;
    },
    holds: (claim: unknown) => claim === holder,
    release: (claim: unknown) => {
      released.push(claim);
      if (claim === holder) holder = undefined;
    },
  };
  const shown: Array<RegionsMineView | undefined> = [];
  const highlighted: Array<number | undefined> = [];
  const posted: Array<{ url: string; token: string; body: unknown }> = [];
  const said: string[] = [];
  const asks = [...(options.asks ?? [hiddenWest])];
  let escapeTaken = false;
  const counts = { redrawn: 0, popupsClosed: 0, focusedBack: 0 };
  // The end of a press: the parties asked again (the client's type check has no Node's timers).
  let pressed = (): void => undefined;
  const nextPress = () =>
    new Promise<void>((resolve) => {
      pressed = resolve;
    });
  let answer: (sent: { status: number; body: unknown }) => void = () => undefined;
  /** What waits for the next frame (W7). */
  const frames: Array<() => void> = [];
  const ui = regionsUi({
    guild: GUILD,
    csrf: { get: () => 'token', set: vi.fn() },
    hold,
    tools: tools as unknown as HTMLElement,
    idle: () => {
      tools.replaceChildren(idle);
    },
    names: new Map([
      [1, 'west'],
      [4, 'plaza'],
    ]),
    shown: (view) => shown.push(view),
    highlight: (id) => highlighted.push(id),
    partiesChanged: () => {
      pressed();
    },
    redrawn: () => {
      counts.redrawn += 1;
    },
    closePopup: () => {
      counts.popupsClosed += 1;
    },
    escapeTaken: () => escapeTaken,
    outlinesShown: () => options.outlinesShown ?? true,
    focusBack: () => {
      counts.focusedBack += 1;
    },
    ask: <T>() => {
      const next = asks.length > 1 ? asks.shift() : asks[0];
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as T);
    },
    post: (url, token, sent) => {
      posted.push({ url, token, body: sent });
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
    me: () => Promise.resolve({ loggedIn: false }),
    say: (text) => said.push(text),
    nextFrame: (run) => frames.push(run),
  });
  const reply = (sent: RegionChangeAnswer | { error: string }, status = 200) => {
    answer({ status, body: sent });
  };
  const button = (label: string) =>
    tools
      .querySelectorAll('button')
      .find((one) => one.attributes.get('aria-label') === label || one.textContent === label);
  const key = (name: string): Key => {
    const event = { key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of listeners.keydown ?? []) listener(event as never);
    return event;
  };
  const clickOn = (target: FakeElement) => {
    target.dispatch('click');
    for (const listener of listeners.click ?? []) listener({ target } as never);
  };
  return {
    ui,
    tools,
    idle,
    elsewhere,
    takes,
    released,
    shown,
    highlighted,
    posted,
    said,
    counts,
    reply,
    button,
    key,
    clickOn,
    nextPress,
    /** The next frame comes: what waited for it runs. */
    frame: () => {
      for (const run of frames.splice(0)) run();
    },
    takeEscape: () => {
      escapeTaken = true;
    },
    takeHold: () => hold.take(),
  };
}

const live = (tools: FakeElement) => tools.querySelector('[data-regions-live]')?.textContent;
const rowAnswer = (tools: FakeElement, id: number) =>
  tools.querySelector(`[data-region-answer="${String(id)}"]`);

describe('the box of "Your regions"', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the view, restyles the outlines and says whether it is offered', async () => {
    const made = fixture();
    await made.ui.load();
    expect(made.shown).toEqual([hiddenWest]);
    expect(made.ui.offered()).toBe(true);
  });

  it('opens over a closed popup as an aside claim, and closes by ×, ← Back and Escape (B3, B4)', async () => {
    const made = fixture();
    await made.ui.load();
    made.ui.open();
    expect(made.takes).toEqual([[false, true]]);
    expect(made.counts).toMatchObject({ popupsClosed: 1, redrawn: 1 });
    expect(made.ui.inTools()).toBe(true);
    expect(made.tools.querySelector('[data-form="regions"]')).not.toBeNull();
    made.button('×')?.dispatch('click');
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(made.released).toHaveLength(1);
    expect(made.counts).toMatchObject({ redrawn: 2, focusedBack: 1 });
    expect(made.ui.inTools()).toBe(false);
    made.ui.open();
    made.button('← Back')?.dispatch('click');
    expect(made.released).toHaveLength(2);
    made.ui.open();
    const escape = made.key('Escape');
    expect(escape.preventDefault.mock.calls).toHaveLength(1);
    expect(made.released).toHaveLength(3);
  });

  it('leaves Escape to a popup, the card, the layers or the tour while one is open (B3)', async () => {
    const made = fixture();
    await made.ui.load();
    made.ui.open();
    made.takeEscape();
    expect(made.key('Escape').preventDefault.mock.calls).toHaveLength(0);
    expect(made.ui.inTools()).toBe(true);
  });

  it('says why it does not open: the view not loaded, or another form open (B13)', async () => {
    const failed = fixture({ asks: [new Error('offline')] });
    await failed.ui.load();
    failed.ui.open();
    expect(failed.said).toEqual(['Your regions could not be loaded. Try again in a moment.']);
    vi.unstubAllGlobals();
    const held = fixture();
    await held.ui.load();
    held.takeHold();
    held.ui.open();
    expect(held.said).toEqual(['Close the form that is open first.']);
    expect(held.ui.inTools()).toBe(false);
  });

  it('presses Join: every button off, the answer in its row and the live line, the rows anew in place (B2, B9)', async () => {
    const made = fixture();
    await made.ui.load();
    made.ui.open();
    const box = made.tools.childNodes[0];
    const join = made.button('Join west');
    const leavePlaza = made.button('Leave plaza');
    join?.dispatch('click');
    expect(join?.disabled).toBe(true);
    expect(leavePlaza?.disabled).toBe(true);
    expect(made.posted).toEqual([
      { url: `/s/${GUILD}/api/regions/1/join`, token: 'token', body: { role: 'west' } },
    ]);
    const done = made.nextPress();
    made.reply({ ok: true, outcome: 'done', text: 'You have West now.', view: seenWest });
    await done;
    expect(made.tools.childNodes[0]).toBe(box);
    expect(made.shown.at(-1)).toEqual(seenWest);
    expect(rowAnswer(made.tools, 1)?.textContent).toBe('You have West now.');
    expect(made.button('Leave west')?.disabled).toBe(false);
    expect(made.button('Leave plaza')?.disabled).toBe(false);
    // The Join is gone: the focus on the row's answer line, which is read as it is focused; the
    // live line is not written, so the answer is not said twice (W7).
    expect(focused().at(-1)).toBe(rowAnswer(made.tools, 1));
    made.frame();
    expect(live(made.tools)).toBe('');
  });

  it('says a refusal in the row with the buttons back, and keeps the focus on the same control (B13)', async () => {
    const made = fixture();
    await made.ui.load();
    made.ui.open();
    made.button('Join west')?.dispatch('click');
    const done = made.nextPress();
    made.reply({ error: 'That role no longer opens this region.' }, 409);
    await done;
    expect(rowAnswer(made.tools, 1)?.textContent).toBe('That role no longer opens this region.');
    expect(made.button('Join west')?.disabled).toBe(false);
    expect(focused().at(-1)).toBe(made.button('Join west'));
    // The live line cleared, then written on the next frame, so that the same words twice are
    // read again (W7).
    expect(live(made.tools)).toBe('');
    made.frame();
    expect(live(made.tools)).toBe('That role no longer opens this region.');
    made.button('Join west')?.dispatch('click');
    const again = made.nextPress();
    made.reply({ error: 'That role no longer opens this region.' }, 409);
    await again;
    expect(live(made.tools)).toBe('');
    made.frame();
    expect(live(made.tools)).toBe('That role no longer opens this region.');
  });

  it('writes the answer and gives the buttons back where the view cannot be read again (B10)', async () => {
    const made = fixture({ asks: [hiddenWest, new Error('offline')] });
    await made.ui.load();
    made.ui.open();
    made.button('Join west')?.dispatch('click');
    const done = made.nextPress();
    made.reply({ error: 'Not available just now.' }, 503);
    await done;
    made.frame();
    expect(live(made.tools)).toBe('Not available just now.');
    expect(made.button('Join west')?.disabled).toBe(false);
    // The rows, the outlines and the entry as they were (W5).
    expect(made.shown).toEqual([hiddenWest]);
    expect(made.button('Leave plaza')?.disabled).toBe(false);
    expect(made.ui.offered()).toBe(true);
  });

  it('keeps the rows, the outlines and the entry where the view asked again is read-only (W5)', async () => {
    const readOnly: RegionsMineView = { readOnly: true, roles: true, regions: [] };
    const made = fixture({ asks: [hiddenWest, readOnly] });
    await made.ui.load();
    made.ui.open();
    made.button('Join west')?.dispatch('click');
    const done = made.nextPress();
    made.reply({ error: 'Not available just now.' }, 503);
    await done;
    expect(rowAnswer(made.tools, 1)?.textContent).toBe('Not available just now.');
    expect(made.button('Join west')?.disabled).toBe(false);
    expect(made.button('Leave plaza')?.disabled).toBe(false);
    expect(made.shown).toEqual([hiddenWest]);
    expect(made.ui.offered()).toBe(true);
  });

  it('outlines a row’s region while hovered or focused, and a tapped one until a tap elsewhere (B8)', async () => {
    const made = fixture();
    await made.ui.load();
    made.ui.open();
    const row = made.tools.querySelector('[data-region-row="1"]');
    row?.dispatch('mouseenter');
    row?.dispatch('mouseleave');
    row?.dispatch('focusin');
    row?.dispatch('focusout');
    expect(made.highlighted).toEqual([1, undefined, 1, undefined]);
    if (row) made.clickOn(row);
    expect(made.highlighted.at(-1)).toBe(1);
    // Another row hovered or focused and left: the tapped one marked again (W6).
    const plaza = made.tools.querySelector('[data-region-row="4"]');
    plaza?.dispatch('mouseenter');
    expect(made.highlighted.at(-1)).toBe(4);
    plaza?.dispatch('mouseleave');
    expect(made.highlighted.at(-1)).toBe(1);
    plaza?.dispatch('focusin');
    plaza?.dispatch('focusout');
    expect(made.highlighted.at(-1)).toBe(1);
    made.clickOn(made.elsewhere);
    expect(made.highlighted.at(-1)).toBeUndefined();
  });

  it('says in the box when the outlines layer is off (B8)', async () => {
    const made = fixture({ outlinesShown: false });
    await made.ui.load();
    made.ui.open();
    expect(made.tools.querySelector('[data-regions-outlines-off]')?.hidden).toBe(false);
  });
});
