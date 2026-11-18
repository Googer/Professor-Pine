import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeButton,
  FakeElement,
  focused,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';
import { fakeFormFrame } from './fake-form-frame.js';
import type { MapMeetup } from '../../domain/web/party-data.js';
import type { MapGym } from './popup.js';
import { meetupUi } from './meetup-ui.js';

// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
vi.mock('leaflet', () => ({}));

const MEETUP: MapMeetup = {
  kind: 'meetup',
  postKey: null,
  id: 'm1',
  name: 'Picnic',
  startTime: Date.UTC(2026, 9, 30, 20),
  endTime: null,
  link: 'https://discord.com/channels/1/2',
  attendance: {
    groups: [],
    going: 0,
    mine: null,
    actions: [],
    remote: { offered: false, on: false },
    count: false,
  },
  place: null,
  info: 'Bring snacks.',
  panel: { start: true },
};

const GYM = {
  id: 1,
  lat: 40,
  lon: -80,
  title: 'The Stacks',
  regionIds: [],
} as unknown as MapGym;

const OK = {
  status: 200,
  body: { ok: true, text: 'Named Feast.', meetup: { ...MEETUP, name: 'Feast' } },
};

/**
 * A meetup's popup over a fake page with its Manage… pressed, the side pane's box beside it (plan
 * 8M-22, `fakeFormFrame`), the server answering each change in turn as `answers` say; what the
 * form did to the hold, the popup and the side pane's box.
 */
function managing(answers: readonly { status: number; body: unknown }[], phone = false) {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const section = make('div');
  section.className = 'party-popup post-popup meetup';
  const control = make('button');
  control.setAttribute('data-edit-meetup', MEETUP.id);
  section.append(control);
  popup.append(section);
  body.append(popup, notice);
  const pane = fakeFormFrame(
    body,
    popup,
    'Schenley Park',
    undefined,
    // On a phone (review P7): the card shows the meetup, the form a layer over it.
    phone ? { phone: { showing: 'meetup:m1' } } : {},
  );
  const { tools, idle } = pane;
  const said: string[] = [];
  /** What has the focus: the last focused, or the page itself. */
  const active = {
    get element(): FakeElement {
      return pageHas ? body : (focused().at(-1) ?? body);
    },
  };
  let pageHas = false;
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('document', {
    createElement: make,
    body,
    get activeElement() {
      return active.element;
    },
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
  const posted: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
    posted.push({
      url: url.split('/').at(-1) ?? '',
      body: JSON.parse(init.body) as unknown,
    });
    const answer = answers[posted.length - 1] ?? { status: 500, body: {} };
    return Promise.resolve({
      ok: answer.status < 400,
      status: answer.status,
      json: () => Promise.resolve(answer.body),
    });
  });
  const doneWith: unknown[] = [];
  /** Who waits for the next `done`, and for the next words of the notice. */
  const waitingDone: (() => void)[] = [];
  const waitingSaid: (() => void)[] = [];
  let finished: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const closePopup = vi.fn();
  const answered: { id: string; text: string; ok: boolean }[] = [];
  let shook: () => void = () => undefined;
  const shaken = new Promise<void>((resolve) => {
    shook = resolve;
  });
  const ui = meetupUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    regions: [],
    gyms: new Map(),
    stops: {
      box: () => ({ south: 0, west: 0, north: 1, east: 1 }),
      show: () => undefined,
      clear: () => undefined,
      moved: () => () => undefined,
    },
    frame: pane.frame,
    zone: () => 'America/New_York',
    closePopup,
    answered: (id: string, answer: { text: string; ok: boolean }) => {
      answered.push({ id, ...answer });
    },
    refused: () => {
      shook();
    },
    done: (meetup: unknown) => {
      doneWith.push(meetup);
      finished();
      for (const waiter of waitingDone.splice(0)) waiter();
      return Promise.resolve();
    },
    redrawn: () => undefined,
  });
  ui.editClicked(control as unknown as HTMLButtonElement, MEETUP);
  return {
    ui,
    section,
    control,
    tools,
    idle,
    pane,
    taken: pane.takes,
    closePopup,
    done,
    said,
    posted,
    answered,
    shaken,
    doneWith,
    nextDone: () =>
      new Promise<void>((resolve) => {
        waitingDone.push(resolve);
      }),
    nextSaid: () =>
      new Promise<void>((resolve) => {
        waitingSaid.push(resolve);
      }),
    popup,
    pageFocused: () => {
      pageHas = true;
    },
    held: () => pane.held(),
    /** The form gone meanwhile (another took the hold). */
    formGone: () => {
      pane.takenElsewhere();
    },
  };
}

/** Types a name into the editor in `box` and presses Submit. */
function submitName(section: FakeElement, name = 'Feast'): void {
  const field = section.querySelector('input[name="name"]');
  field?.setAttribute('value', name);
  // Typed: the form's check runs on the input (plan 8M-22), Submit on.
  field?.dispatch('input');
  section.querySelector('button[data-submit]')?.dispatch('click');
}

// Review P7: on a phone the editor is a layer over the card that shows the meetup.
describe("a meetup's Manage… on a phone (plan 8M-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens over the card, claimed as the card’s; Cancel shows the meetup again', () => {
    const made = managing([], true);
    expect(made.pane.places).toEqual(['card']);
    const editor = made.pane.card?.layer.querySelector('[data-form="meetup-edit"]');
    expect(editor).not.toBeNull();
    expect(made.tools.childNodes).toEqual([made.idle]);
    editor?.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.card?.formShown()).toBe(false);
    expect(focused().at(-1) === made.control).toBe(true);
  });
});

describe("a meetup's Manage… on the map (Matt, 2026-10-30)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Plan 8M-22: every form in the side pane, the place's popup closed, its place named.
  it('opens in the side pane, the meetup’s popup closed, its place under the heading', () => {
    const made = managing([OK]);
    expect(made.tools.querySelector('[data-form="meetup-edit"]')).not.toBeNull();
    expect(made.tools.querySelector('button[data-change]')).toBeNull();
    expect(made.pane.isOpen()).toBe(false);
    expect(made.taken[0]).toEqual([false, true]);
    expect(made.tools.querySelector('.form-place')?.textContent).toBe('Picnic');
  });

  it('Submit sends what was changed, opens the post again and answers in its line', async () => {
    const made = managing([OK]);
    submitName(made.tools);
    await made.done;
    expect(made.posted).toEqual([{ url: 'name', body: { drawn: 'Picnic', name: 'Feast' } }]);
    expect(made.pane.isOpen()).toBe(true);
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(made.held()).toBe(false);
    expect(made.answered).toEqual([{ id: 'm1', text: 'Named Feast.', ok: true }]);
    expect(made.said).toEqual([]);
  });

  it('Submit sends every change made, in turn, and joins their answers', async () => {
    const made = managing([OK, { status: 200, body: { ok: true, text: 'Ends at 8.' } }]);
    made.tools.querySelector('input[name="end"]')?.setAttribute('value', '8pm');
    submitName(made.tools);
    await made.done;
    expect(made.posted.map((one) => one.url)).toEqual(['name', 'end']);
    expect(made.answered).toEqual([{ id: 'm1', text: 'Named Feast. Ends at 8.', ok: true }]);
  });

  it('has Submit off with "Nothing changed yet." until something is typed (plan 8M-22)', () => {
    const made = managing([]);
    const submit = made.tools.querySelector('button[data-submit]');
    expect(submit?.getAttribute('aria-disabled')).toBe('true');
    expect(made.tools.querySelector('.form-answer')?.textContent).toBe('Nothing changed yet.');
    // A press while off sends nothing, and the form stays.
    submit?.dispatch('click');
    expect(made.posted).toEqual([]);
    expect(made.answered).toEqual([]);
    expect(made.tools.querySelector('[data-form="meetup-edit"]')).not.toBeNull();
  });

  it('a refusal keeps the form, says what went through and does not send it again', async () => {
    const refused = {
      status: 422,
      body: { ok: false, text: 'That time has passed.', meetup: MEETUP },
    };
    const made = managing([OK, refused]);
    made.tools.querySelector('input[name="end"]')?.setAttribute('value', 'nonsense');
    submitName(made.tools);
    await made.shaken;
    expect(made.tools.querySelector('[data-form="meetup-edit"]')).not.toBeNull();
    expect(made.tools.querySelector('.form-answer')?.textContent).toBe(
      'Named Feast. That time has passed.',
    );
    expect(made.held()).toBe(true);
    expect(made.answered).toEqual([]);
    expect(made.tools.querySelector('input[name="end"]')?.getAttribute('value')).toBe('nonsense');
  });

  // Asking for the list would open the popup anew once it came, over the focus just given back
  // (staging of 2026-10-30); nothing changed, and what waited is drawn as the hold lets go.
  it('Cancel opens the popup again, lets the hold go, the focus on Manage…', () => {
    const made = managing([]);
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.isOpen()).toBe(true);
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(made.section.childNodes).toEqual([made.control]);
    expect(made.held()).toBe(false);
    expect(made.posted).toEqual([]);
    expect(made.doneWith).toEqual([]);
    expect(focused().at(-1) === made.control).toBe(true);
  });

  it('closes when the answer ends it, in the band, its popup not opened again', async () => {
    const made = managing([{ status: 409, body: { ok: false, text: 'This meetup is over.' } }]);
    submitName(made.tools);
    await made.done;
    expect(made.tools.childNodes).toEqual([made.idle]);
    expect(made.pane.isOpen()).toBe(false);
    expect(made.held()).toBe(false);
    expect(made.said).toContain('This meetup is over.');
  });

  it('"Hold meetup here" opens in the side pane, and stays there to pick a place', () => {
    const made = managing([]);
    made.tools.querySelector('button[data-cancel]')?.dispatch('click');
    const box = make('div');
    const here = make('button');
    box.append(here);
    made.section.append(box);
    made.ui.meetupHereClicked(GYM, here as unknown as HTMLButtonElement);
    expect(made.tools.querySelector('[data-form="meetup"]')).not.toBeNull();
    expect(made.pane.isOpen()).toBe(false);
    expect(made.ui.inTools()).toBe(true);
    made.tools.querySelector('input[name="name"]')?.setAttribute('value', 'Picnic');
    made.tools.querySelector('button[data-pick="start"]')?.dispatch('click');
    expect(made.ui.inTools()).toBe(true);
    expect(made.tools.querySelector('input[name="name"]')?.getAttribute('value')).toBe('Picnic');
  });

  describe('both times, one request: the server orders them (re-review, 1)', () => {
    const type = (section: FakeElement, name: string, value: string) => {
      const field = section.querySelector(`input[name="${name}"]`);
      field?.setAttribute('value', value);
      field?.dispatch('input');
    };
    const submit = (section: FakeElement) => {
      section.querySelector('button[data-submit]')?.dispatch('click');
    };
    const value = (section: FakeElement, name: string) =>
      section.querySelector(`input[name="${name}"]`)?.getAttribute('value') ?? null;

    it('sends both as one, with what each was drawn from, and answers in the line', async () => {
      const made = managing([
        { status: 200, body: { ok: true, text: 'Ends at 9. Starts at 8.', meetup: MEETUP } },
      ]);
      type(made.tools, 'start', '8pm');
      type(made.tools, 'end', '9pm');
      submit(made.tools);
      await made.done;
      expect(made.posted).toEqual([
        {
          url: 'times',
          body: {
            start: { drawn: MEETUP.startTime, time: '8pm' },
            end: { drawn: MEETUP.endTime, time: '9pm' },
          },
        },
      ]);
      expect(made.answered).toEqual([{ id: 'm1', text: 'Ends at 9. Starts at 8.', ok: true }]);
    });

    it('sends name and information first', async () => {
      const made = managing([
        OK,
        { status: 200, body: { ok: true, text: 'Ends at 9. Starts at 8.', meetup: MEETUP } },
      ]);
      type(made.tools, 'start', '8pm');
      type(made.tools, 'end', '9pm');
      submitName(made.tools);
      await made.done;
      expect(made.posted.map((one) => one.url)).toEqual(['name', 'times']);
    });

    it('keeps a time changed alone on its own address', async () => {
      const made = managing([
        { status: 200, body: { ok: true, text: 'Ends at 8.', meetup: MEETUP } },
      ]);
      type(made.tools, 'end', '8pm');
      submit(made.tools);
      await made.done;
      expect(made.posted.map((one) => one.url)).toEqual(['end']);
    });

    it('never tries a refused start again; both stay typed when nothing went', async () => {
      const made = managing([
        { status: 422, body: { ok: false, text: 'Not a time.', meetup: MEETUP } },
      ]);
      type(made.tools, 'start', 'whenever');
      type(made.tools, 'end', '9pm');
      submit(made.tools);
      await made.shaken;
      expect(made.posted.map((one) => one.url)).toEqual(['times']);
      expect(made.tools.querySelector('.form-answer')?.textContent).toBe('Not a time.');
      expect(value(made.tools, 'start')).toBe('whenever');
      expect(value(made.tools, 'end')).toBe('9pm');
      expect(made.answered).toEqual([]);
    });

    it('a partial refusal keeps the form: what went shows the meetup, the other its text', async () => {
      const moved = { ...MEETUP, endTime: Date.UTC(2026, 9, 31, 1) };
      const made = managing([
        {
          status: 422,
          body: { ok: false, text: 'Ends at 9. Not after its end.', meetup: moved, went: ['end'] },
        },
      ]);
      type(made.tools, 'start', '8pm');
      type(made.tools, 'end', '9pm');
      submit(made.tools);
      await made.shaken;
      expect(made.tools.querySelector('.form-answer')?.textContent).toBe(
        'Ends at 9. Not after its end.',
      );
      expect(value(made.tools, 'start')).toBe('8pm');
      expect(value(made.tools, 'end')).toBeNull();
    });
  });

  describe('the focus (review, finding 11)', () => {
    it('opens with its first field focused, and stays on the form after a refusal', async () => {
      const made = managing([{ status: 422, body: { ok: false, text: 'No.', meetup: MEETUP } }]);
      expect(focused().at(-1)?.getAttribute('name')).toBe('name');
      submitName(made.tools);
      await made.shaken;
      const submit = made.tools.querySelector('button[data-submit]');
      expect(focused().at(-1) === submit).toBe(true);
    });

    it('leaves the focus alone when it moved out of the form meanwhile (re-review, 5)', async () => {
      const made = managing([{ status: 422, body: { ok: false, text: 'No.', meetup: MEETUP } }]);
      const elsewhere = make('input');
      made.section.append(elsewhere);
      submitName(made.tools);
      elsewhere.focus();
      await made.shaken;
      expect(focused().at(-1) === elsewhere).toBe(true);
    });

    it('takes the focus back from the page itself after an answer (re-review, 5)', async () => {
      const made = managing([{ status: 422, body: { ok: false, text: 'No.', meetup: MEETUP } }]);
      submitName(made.tools);
      made.pageFocused();
      await made.shaken;
      expect(focused().at(-1) === made.tools.querySelector('button[data-submit]')).toBe(true);
    });

    it('goes back to the control as the popup is drawn anew when it opens again', () => {
      const made = managing([]);
      const fresh = make('button');
      fresh.setAttribute('data-edit-meetup', MEETUP.id);
      made.pane.onBack.run = () => {
        made.popup.replaceChildren(fresh);
      };
      made.tools.querySelector('button[data-cancel]')?.dispatch('click');
      expect(focused().at(-1) === fresh).toBe(true);
    });

    it('focuses the name of a new meetup', () => {
      const made = managing([]);
      made.tools.querySelector('button[data-cancel]')?.dispatch('click');
      resetFocus();
      const box = make('div');
      const here = make('button');
      box.append(here);
      made.section.append(box);
      made.ui.meetupHereClicked(GYM, here as unknown as HTMLButtonElement);
      expect(focused().at(-1)?.getAttribute('name')).toBe('name');
    });
  });

  describe('a new meetup at a place whose form went meanwhile (review, finding 4)', () => {
    /** "Hold meetup here" in the popup, the form filled in; `submit` sends it. */
    const madeAt = (answers: readonly { status: number; body: unknown }[]) => {
      const made = managing(answers);
      made.tools.querySelector('button[data-cancel]')?.dispatch('click');
      const box = make('div');
      const here = make('button');
      box.append(here);
      made.section.append(box);
      made.ui.meetupHereClicked(GYM, here as unknown as HTMLButtonElement);
      const fill = (name: string, value: string) => {
        const field = made.tools.querySelector(`[name="${name}"]`);
        field?.setAttribute('value', value);
        // Typed: the form's check runs on the input (plan 8M-22).
        field?.dispatch('input');
      };
      fill('name', 'Picnic');
      fill('region', '1');
      fill('start', '6pm');
      fill('info', 'Bring snacks.');
      made.doneWith.length = 0;
      return {
        ...made,
        box,
        here,
        submit: () => {
          made.tools.querySelector('button[data-submit]')?.dispatch('click');
        },
      };
    };

    it('says a meetup that was made and asks for the list, nothing opened or closed', async () => {
      const made = madeAt([{ status: 200, body: { ok: true, text: 'Made.', meetup: MEETUP } }]);
      const done = made.nextDone();
      made.submit();
      made.formGone();
      made.closePopup.mockClear();
      await done;
      expect(made.said.at(-1)).toBe('Made.');
      expect(made.doneWith).toEqual([undefined]);
      expect(made.closePopup).not.toHaveBeenCalled();
      expect(made.ui.inTools()).toBe(false);
    });

    it('says a refusal, and asks for nothing', async () => {
      const made = madeAt([{ status: 422, body: { ok: false, text: 'No such place.' } }]);
      const told = made.nextSaid();
      made.submit();
      made.formGone();
      await told;
      expect(made.said.at(-1)).toBe('No such place.');
      expect(made.doneWith).toEqual([]);
    });

    it('with the form still there, closes it and opens what was made', async () => {
      const made = madeAt([{ status: 200, body: { ok: true, text: 'Made.', meetup: MEETUP } }]);
      const done = made.nextDone();
      made.submit();
      await done;
      expect(made.doneWith.map((one) => (one as MapMeetup).id)).toEqual(['m1']);
      expect(made.tools.childNodes).toEqual([made.idle]);
    });
  });

  it('only says the answer when its form went meanwhile', async () => {
    const made = managing([OK]);
    submitName(made.tools);
    made.formGone();
    await made.done;
    expect(made.said).toEqual(['Named Feast.']);
    expect(made.answered).toEqual([]);
    expect(made.tools.querySelector('.form-answer')?.textContent).toBe('');
  });
});
