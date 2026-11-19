import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeButton,
  FakeElement,
  focused,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';
import { fakeFormFrame } from './fake-form-frame.js';
import type { RaidUiDeps } from './raid-ui.js';
import { raidUi, sayInForm } from './raid-ui.js';

// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
vi.mock('leaflet', () => ({}));

/**
 * A raid's popup over a fake page with its Manage…, the side pane's box beside it (plan 8M-22,
 * `fakeFormFrame`), the server answering the lists and a change as `answer` says; what the form's
 * answers went to (`answered`, the notice band `said`).
 */
function changing(
  answer: { status: number; body: unknown } | { status: number; body: unknown }[],
  moves?: unknown,
  /** On a phone (review P7): the form in the card, over the raid it shows. */
  phone = false,
  /** What is opened: the raid's Manage…, or a report at its gym. */
  opens: 'change' | 'report' = 'change',
) {
  const answers = Array.isArray(answer) ? [...answer] : [answer];
  const posted: string[] = [];
  const waitingSaid: (() => void)[] = [];
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const section = make('div');
  section.className = 'party-popup post-popup raid';
  const control = make('button');
  control.setAttribute('data-change-raid', 'r1');
  section.append(control);
  body.append(section, notice);
  const said: string[] = [];
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('document', {
    createElement: make,
    querySelector: (selector: string) => body.querySelector(selector),
    getElementById: (id: string) => {
      if (id !== 'notice') return null;
      return new Proxy(notice, {
        set(target, key, value: unknown) {
          if (key === 'textContent' && typeof value === 'string') {
            said.push(value);
            for (const told of waitingSaid.splice(0)) told();
          }
          return Reflect.set(target, key, value);
        },
      });
    },
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') posted.push(url.split('/').at(-1) ?? '');
    const reply =
      init?.method === 'POST'
        ? (answers.shift() ?? { status: 500, body: {} })
        : url.endsWith('/raid-options')
          ? { status: 200, body: { zone: 'America/New_York', bosses: [], eggs: [] } }
          : moves !== undefined && url.endsWith('/moves')
            ? { status: 200, body: moves }
            : { status: 404, body: { error: 'Not found.' } };
    return Promise.resolve({
      ok: reply.status < 400,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    });
  });
  const pane = fakeFormFrame(
    body,
    section,
    'Library',
    undefined,
    phone ? { phone: { showing: 'gym:1' } } : {},
  );
  const shown = pane.tools.nextForm();
  let done: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });
  let doneCalls = 0;
  const answered: { party: string; text: string; ok: boolean }[] = [];
  let shook: () => void = () => undefined;
  const shaken = new Promise<void>((resolve) => {
    shook = resolve;
  });
  const deps: RaidUiDeps = {
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    regionNames: new Map(),
    done: () => {
      doneCalls += 1;
      done();
      return Promise.resolve();
    },
    frame: pane.frame,
    answered: (party, given) => {
      answered.push({ party, ...given });
    },
    refused: () => {
      shook();
    },
  };
  const ui = raidUi(deps);
  if (opens === 'change') void ui.changeClicked(control as unknown as HTMLButtonElement);
  else {
    ui.reportClicked(
      control as unknown as HTMLElement,
      {
        id: 1,
        name: 'Library',
        lat: 40.44,
        lon: -79.95,
        regionIds: [1],
      } as never,
    );
  }
  return {
    deps,
    section,
    control,
    page: body,
    tools: pane.tools,
    pane,
    doneCalls: () => doneCalls,
    shown,
    finished,
    answered,
    said,
    shaken,
    posted,
    /** The form gone meanwhile (another took the hold). */
    formGone: () => {
      pane.takenElsewhere();
    },
    nextSaid: () =>
      new Promise<void>((resolve) => {
        waitingSaid.push(resolve);
      }),
  };
}

/** Types an end time into the form drawn in `box` and presses Submit. */
function setEnd(section: FakeElement): void {
  const end = section.querySelector('input[name="end"]');
  end?.setAttribute('value', '30');
  // Typed: the form's check runs on the input (plan 8M-22), Submit on.
  end?.dispatch('input');
  section.querySelector('button[data-submit]')?.dispatch('click');
}

describe("a raid's Manage… on the map (review fix F4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is titled as a train’s and a meetup’s are', async () => {
    const made = changing([]);
    await made.shown;
    expect(made.tools.querySelector('.name')?.textContent).toBe('Manage the raid');
  });

  // Plan 8M-22: every form in the side pane, the place's popup closed, its place named.
  it('opens in the side pane, the raid’s popup closed, its place under the heading', async () => {
    const made = changing([]);
    await made.shown;
    expect(made.pane.isOpen()).toBe(false);
    expect(made.pane.takes[0]).toEqual([false, true]);
    expect(made.tools.querySelector('.form-place')?.textContent).toBe('Library');
  });

  it('has Submit off with "Nothing changed yet." until something is typed (plan 8M-22)', async () => {
    const made = changing({ status: 200, body: { ok: true, text: 'Done.' } });
    await made.shown;
    const submit = made.tools.querySelector('button[data-submit]');
    expect(submit?.getAttribute('aria-disabled')).toBe('true');
    expect(made.tools.querySelector('.form-answer')?.textContent).toBe('Nothing changed yet.');
    // A press while off sends nothing, and the form stays.
    submit?.dispatch('click');
    expect(made.posted).toEqual([]);
    expect(made.tools.querySelector('button[data-submit]')).not.toBeNull();
  });

  it("answers a change that went through in the post's answer line, the popup open again", async () => {
    const made = changing({ status: 200, body: { ok: true, text: 'Done. It ends at 3:15 PM.' } });
    await made.shown;
    setEnd(made.tools);
    await made.finished;
    expect(made.answered).toEqual([{ party: 'r1', text: 'Done. It ends at 3:15 PM.', ok: true }]);
    expect(made.said).toEqual([]);
    expect(made.tools.querySelector('button[data-submit]')).toBeNull();
    expect(made.pane.isOpen()).toBe(true);
  });

  it('says a refusal that keeps the form under it and shakes it, not in the band', async () => {
    const made = changing({ status: 422, body: { ok: false, text: 'This raid is over.' } });
    await made.shown;
    setEnd(made.tools);
    await made.shaken;
    expect(made.tools.querySelector('.form-answer')?.textContent).toBe('This raid is over.');
    expect(made.said).toEqual([]);
    expect(made.answered).toEqual([]);
  });

  // Asking for the list would open the popup anew once it came, over the focus just given back
  // (staging of 2026-10-30); nothing changed, and what waited is drawn as the hold lets go.
  it('Cancel opens the popup again, leaves the list alone and gives the focus to Manage…', async () => {
    resetFocus();
    const made = changing([]);
    await made.shown;
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.isOpen()).toBe(true);
    expect(made.tools.childNodes).toEqual([made.pane.idle]);
    expect(made.section.childNodes).toEqual([made.control]);
    expect(made.doneCalls()).toBe(0);
    expect(focused().at(-1) === made.control).toBe(true);
  });

  it('Cancel gives the focus to Manage… in the popup drawn anew as it opens again', async () => {
    resetFocus();
    const made = changing([]);
    await made.shown;
    const fresh = make('button');
    fresh.setAttribute('data-change-raid', 'r1');
    made.pane.onBack.run = () => {
      made.section.replaceChildren(fresh);
    };
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    expect(focused().at(-1) === fresh).toBe(true);
  });

  describe('a refusal with its form gone (review, finding 10)', () => {
    it('says it in the band', async () => {
      const made = changing({ status: 422, body: { ok: false, text: 'This raid is over.' } });
      await made.shown;
      const told = made.nextSaid();
      setEnd(made.tools);
      made.formGone();
      await told;
      expect(made.said).toEqual(['This raid is over.']);
    });

    it('says what went through with it, and asks for the list', async () => {
      const made = changing([
        { status: 200, body: { ok: true, text: 'It hatches soon.' } },
        { status: 422, body: { ok: false, text: 'Not that end.' } },
      ]);
      await made.shown;
      made.tools.querySelector('input[name="hatch"]')?.setAttribute('value', '10');
      setEnd(made.tools);
      made.formGone();
      await made.finished;
      expect(made.said).toEqual(['It hatches soon. Not that end.']);
    });
  });

  describe("the moves while a boss is picked (review, finding 9): they are the old boss's", () => {
    const MOVES = {
      boss: 'Yveltal',
      fast: [{ id: 'SNARL_FAST', name: 'Snarl' }],
      charged: [{ id: 'HURRICANE', name: 'Hurricane' }],
    };
    const fields = (section: FakeElement) => ({
      boss: section.querySelector('select[name="boss"]'),
      quick: section.querySelector('select[name="quick"]'),
      charge: section.querySelector('select[name="charge"]'),
      hint: section.querySelector('.moves-later'),
    });
    const pick = (boss: FakeElement | null, value: string) => {
      boss?.setAttribute('value', value);
      boss?.dispatch('change');
    };

    it('are off and emptied, with a hint, and back on when the boss is cleared', async () => {
      const made = changing({ status: 200, body: { ok: true, text: 'Done.' } }, MOVES);
      await made.shown;
      const { boss, quick, charge, hint } = fields(made.tools);
      expect(quick?.disabled).toBe(false);
      expect(hint?.hidden).toBe(true);
      quick?.setAttribute('value', 'SNARL_FAST');
      pick(boss, 'e:T5:0');
      expect(quick?.disabled).toBe(true);
      expect(charge?.disabled).toBe(true);
      expect(quick?.value).toBe('');
      expect(hint?.hidden).toBe(false);
      pick(boss, '');
      expect(quick?.disabled).toBe(false);
      expect(charge?.disabled).toBe(false);
      expect(hint?.hidden).toBe(true);
    });

    // Staging of 2026-10-30: read on the form with the boss field empty again.
    it('stop naming the old boss once a new one went through, off with the hint', async () => {
      const made = changing(
        [
          { status: 200, body: { ok: true, text: 'A new boss.' } },
          { status: 422, body: { ok: false, text: 'Not that end.' } },
        ],
        MOVES,
      );
      await made.shown;
      const { boss, quick, charge, hint } = fields(made.tools);
      const heading = quick?.parentElement?.querySelector('span');
      expect(heading?.textContent).toBe('Moves of Yveltal');
      pick(boss, 'e:T5:0');
      // Picked, not yet gone through: they are still Yveltal's, and off.
      expect(heading?.textContent).toBe('Moves of Yveltal');
      setEnd(made.tools);
      await made.shaken;
      expect(heading?.textContent).toBe('Moves');
      expect(quick?.disabled).toBe(true);
      expect(charge?.disabled).toBe(true);
      expect(hint?.hidden).toBe(false);
    });

    it('are not sent with a boss, and stay off once it went through and a later change was refused', async () => {
      const made = changing(
        [
          { status: 200, body: { ok: true, text: 'A new boss.' } },
          { status: 422, body: { ok: false, text: 'Not that end.' } },
        ],
        MOVES,
      );
      await made.shown;
      const { boss, quick } = fields(made.tools);
      quick?.setAttribute('value', 'SNARL_FAST');
      pick(boss, 'e:T5:0');
      setEnd(made.tools);
      await made.shaken;
      expect(made.posted).toEqual(['boss', 'end']);
      // The boss is emptied, for it went through: the moves are still the old boss's.
      pick(boss, '');
      expect(quick?.disabled).toBe(true);
    });
  });
});

// Review P7: on a phone every form is a layer over the card.
// Second review R1: a form canceled while it loads says nothing of a failure that comes after.
describe("a raid's Manage… canceled while it loads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says nothing when its lists fail after Cancel', async () => {
    const made = changing([]);
    await made.shown;
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    let fail: (error: Error) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const control = make('button');
    control.setAttribute('data-change-raid', 'r2');
    made.section.append(control);
    const opening = raidUi({ ...made.deps }).changeClicked(control as unknown as HTMLButtonElement);
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    fail(new Error('offline'));
    await opening;
    expect(made.said).toEqual([]);
  });
});

describe("a raid's forms on a phone (plan 8M-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['change', 'report'] as const)(
    'opens its %s form in the card over the raid it shows; Cancel shows the raid again',
    async (opens) => {
      resetFocus();
      const made = changing([], undefined, true, opens);
      const form = await made.shown;
      expect(made.pane.places).toEqual(['card']);
      expect(made.pane.card?.layer.childNodes).toEqual([form]);
      expect(made.tools.childNodes).toEqual([made.pane.idle]);
      expect(form.querySelector('.form-place')?.textContent).toBe('Library');
      form.querySelector('button[data-cancel]')?.dispatch('click');
      expect(made.pane.card?.formShown()).toBe(false);
      expect(made.pane.held()).toBe(false);
      expect(focused().at(-1) === made.control).toBe(true);
    },
  );
});

// Branch review W1: a server's refusal under a form is read: live first, written next frame.
describe('an answer said under a form (sayInForm)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes the line live and clears it, then writes the answer on the next frame', () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
    const form = make('div');
    const line = make('p');
    line.className = 'form-answer';
    line.textContent = 'Nothing changed yet.';
    form.append(line);
    sayInForm(form as unknown as HTMLElement, 'You may not delete this raid.');
    expect(line.getAttribute('aria-live')).toBe('polite');
    expect(line.textContent).toBe('');
    frames[0]?.();
    expect(line.textContent).toBe('You may not delete this raid.');
  });
});
