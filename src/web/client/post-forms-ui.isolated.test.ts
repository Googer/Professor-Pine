import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapRaid } from '../../domain/web/party-data.js';
import { postFormsUi } from './post-forms-ui.js';
import { FormHold } from './raid-forms.js';
import {
  FakeButton,
  FakeElement,
  focused,
  focusOn,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';

// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
vi.mock('leaflet', () => ({}));

const NOW = Date.UTC(2026, 9, 13, 18);

/** A raid whose Group… moves the member from group A to group B (the one way left). */
const raid: MapRaid = {
  kind: 'raid',
  postKey: 'k',
  id: 'r1',
  gymId: 1,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid',
  boss: null,
  stage: 'hatched',
  hatchTime: NOW - 600_000,
  endTime: NOW + 600_000,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: true,
  attendance: {
    groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
    going: 1,
    mine: { status: 'coming', group: 'A' },
    actions: [],
    remote: { offered: false, on: false },
    count: true,
    regroup: {
      title: 'Change group',
      text: "You're in group A. Submit moves you to group B.",
      label: 'Move to',
      signedUp: true,
      choices: [{ group: 'B', stamp: 'b1', label: 'Group B', size: '1 trainer' }],
      newGroup: false,
    },
  },
};

/** The post's Group… as the page draws it. */
function groupButton(): FakeElement {
  const button = make('button');
  button.className = 'press secondary';
  button.setAttribute('type', 'button');
  button.setAttribute('data-regroup', 'r1');
  return button;
}

/**
 * The page over a fake document: a post (`.post-popup`) with its Group…, the form's answer from
 * `fetch`, and `done` drawing the post anew, as the list does after a form went through (its
 * buttons new elements).
 */
function page() {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const post = make('div');
  post.className = 'party-popup post-popup raid';
  const button = groupButton();
  post.append(button);
  body.append(post, notice);
  const document = {
    createElement: make,
    getElementById: (id: string) => (id === 'notice' ? notice : null),
    querySelector: (selector: string) => body.querySelector(selector),
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, text: 'You are coming, in group B.' }),
    }),
  );
  const hold = new FormHold<unknown>({
    draw: () => undefined,
    popup: () => undefined,
    later: (run) => {
      run();
    },
    controls: () => undefined,
  });
  let redrawn: FakeElement | undefined;
  /** The parties whose popup or card a form had closed. */
  const closed: unknown[] = [];
  /** What the forms answered into the post's answer line (plan 8M-11A, S9). */
  const answers: { party: string; text: string; ok: boolean }[] = [];
  /** The refusals that kept their form, moving its popup or card (plan 8M-13, A2). */
  const moved: { party: string; form: string }[] = [];
  let drawn: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    drawn = resolve;
  });
  const ui = postFormsUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    hold,
    origin: () => 'https://map.example.test',
    times: () => ({ now: NOW }),
    done: () => {
      // The list drawn anew: the post's controls are new elements.
      redrawn = groupButton();
      post.replaceChildren(redrawn);
      drawn();
      return Promise.resolve();
    },
    closeParty: (party) => {
      closed.push(party);
    },
    answered: (party, answer) => {
      answers.push({ party: party.id, ...answer });
    },
    refused: (party, from) => {
      moved.push({ party: party.id, form: from.className });
    },
  });
  return { ui, button, post, done, redrawn: () => redrawn, closed, answers, moved };
}

/**
 * The post of a desktop popup as the page draws it: the post (`.post`) with the control
 * (`data-<data>="r1"`) and its answer line (`.press-answer`, plan 8M-11A), in the popup's content
 * (`.post-popup`).
 */
function drawnPost(data: string): { post: FakeElement; control: FakeElement } {
  const post = make('div');
  post.className = 'post accent-hatched';
  const control = make('button');
  control.className = 'press secondary';
  control.setAttribute('type', 'button');
  control.setAttribute(`data-${data}`, 'r1');
  const line = make('div');
  line.className = 'press-answer';
  post.append(control, line);
  return { post, control };
}

/**
 * A desktop popup over a fake document (review B-1): its content is drawn anew whenever Leaflet
 * updates it while no form holds (`heldContent`), so the hold's release redraws the post: the
 * post's nodes the form kept are out of the page then. `answer` is what the server answers.
 */
function popupPage(data: string, answer: { status: number; body: unknown }) {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const content = make('div');
  content.className = 'party-popup post-popup raid';
  const first = drawnPost(data);
  content.append(first.post);
  body.append(content, notice);
  vi.stubGlobal('document', {
    createElement: make,
    getElementById: (id: string) => (id === 'notice' ? notice : null),
    querySelector: (selector: string) => body.querySelector(selector),
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: answer.status < 400,
      status: answer.status,
      json: () => Promise.resolve(answer.body),
    }),
  );
  let current = first.control;
  /** What the forms answered into the post's answer line (plan 8M-11A, S9). */
  const answers: { party: string; text: string; ok: boolean }[] = [];
  /**
   * Where each answer could land when it was given (review BR-1): whether the control it came
   * from is in the page (a refusal shakes its popup), and whether the post's answer line is.
   */
  const landed: { control: boolean; line: boolean }[] = [];
  let told: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    told = resolve;
  });
  const hold: FormHold<unknown> = new FormHold<unknown>({
    draw: () => undefined,
    // Leaflet's `update()`: the content drawn anew unless a form holds it.
    popup: () => ({
      update: () => {
        if (hold.editing) return;
        const again = drawnPost(data);
        current = again.control;
        content.replaceChildren(again.post);
      },
    }),
    later: (run) => {
      run();
    },
    controls: () => undefined,
  });
  const ui = postFormsUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    hold,
    origin: () => 'https://map.example.test',
    times: () => ({ now: NOW }),
    done: () => Promise.resolve(),
    closeParty: () => undefined,
    answered: (party, answer, from) => {
      answers.push({ party: party.id, ...answer });
      landed.push({
        control: (from as unknown as FakeElement).isConnected,
        line: content.querySelector('.press-answer')?.isConnected ?? false,
      });
      told();
    },
    refused: () => undefined,
  });
  return {
    ui,
    button: first.control,
    content,
    current: () => current,
    answers,
    landed,
    answered,
  };
}

describe('the forms of the post’s controls in a popup drawn anew (review B-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives the focus back to the control in the post drawn anew when Cancel closes the form', async () => {
    const { ui, button, content, current } = popupPage('regroup', {
      status: 200,
      body: { ok: true, text: 'Done.' },
    });
    ui.regroupClicked(button as unknown as HTMLButtonElement, raid);
    await Promise.resolve();
    await Promise.resolve();
    content.querySelector('button[data-cancel]')?.dispatch('click');
    // Compared as booleans: the fake elements do not print.
    expect(current() === button).toBe(false);
    expect(focused().at(-1) === current()).toBe(true);
  });

  // Review BR-1: the post is back in the page before its answer is given, so that the answer goes
  // into its answer line (not the notice band) and a refusal shakes its popup.
  it('gives the answer of a form that closes once the post is back in the page, done or refused', async () => {
    for (const body of [
      { ok: true, text: 'You are coming, in group B.' },
      { ok: false, text: 'Group B has changed since: press Group… again.' },
    ]) {
      const made = popupPage('regroup', { status: body.ok ? 200 : 422, body });
      made.ui.regroupClicked(made.button as unknown as HTMLButtonElement, raid);
      await Promise.resolve();
      await Promise.resolve();
      made.content.querySelector('button[data-submit]')?.dispatch('click');
      await made.answered;
      expect(made.answers).toEqual([{ party: 'r1', ...body }]);
      expect(made.landed).toEqual([{ control: true, line: true }]);
    }
  });

  it('says why a form does not open in the answer line, as a refusal, and focuses its control', async () => {
    const { ui, button, current, answers } = popupPage('meet', {
      status: 422,
      body: { error: 'You are not signed up for this raid.' },
    });
    const focus = focusOn(undefined);
    ui.meetClicked(button as unknown as HTMLButtonElement, raid);
    await focus;
    expect(current() === button).toBe(false);
    expect(focused().at(-1) === current()).toBe(true);
    // Plan 8M-11A (S20): in the post's answer line (and a shake), not a line to Discord.
    expect(answers).toEqual([
      { party: 'r1', text: 'You are not signed up for this raid.', ok: false },
    ]);
  });

  // Plan 8M-11A (S9): "do this on Discord" as a note box in the form's place, the post's link a
  // button; Back puts the post back.
  it('shows the note box of a button done on Discord in the place of the post, Back puts it back', async () => {
    const { ui, button, content, current } = popupPage('regroup', {
      status: 200,
      body: { ok: true, text: 'Done.' },
    });
    const post = 'https://discord.com/channels/100000000000000001/2';
    ui.noteClicked(
      button as unknown as HTMLButtonElement,
      { ...raid, link: post },
      'A new group is started on Discord.',
    );
    await focusOn(undefined);
    const note = content.querySelector('.note-box');
    expect(note?.textContent).toContain('A new group is started on Discord.');
    const link = note?.querySelector('a.press');
    expect(link?.textContent).toBe('Open the post on Discord');
    expect(link?.getAttribute('href')).toBe(post);
    content.querySelector('button[data-cancel]')?.dispatch('click');
    expect(content.querySelector('.note-box')).toBeNull();
    expect(current().isConnected).toBe(true);
  });
});

describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Review N-1: a form that went through draws the post anew; the focus goes to its control
  // there, not to the page.
  it('gives the focus to the control that opened the form, found again in the post drawn anew', async () => {
    const { ui, button, post, done, redrawn } = page();
    ui.regroupClicked(button as unknown as HTMLButtonElement, raid);
    // The form is drawn once its (here, ready) choices are in.
    await Promise.resolve();
    await Promise.resolve();
    const submit = post.querySelector('button[data-submit]');
    expect(submit).not.toBeNull();
    submit?.dispatch('click');
    await done;
    const again = redrawn();
    if (!again) throw new Error('the post was not drawn anew');
    await focusOn(again);
    expect(focused().at(-1)).toBe(again);
    expect(again.isConnected).toBe(true);
  });

  // Plan 8M-11A (S9): a form that went through answers in the post's answer line.
  it('puts the answer of a form that went through into the post’s answer line', async () => {
    const { ui, button, post, done, answers } = page();
    ui.regroupClicked(button as unknown as HTMLButtonElement, raid);
    await Promise.resolve();
    await Promise.resolve();
    post.querySelector('button[data-submit]')?.dispatch('click');
    await done;
    expect(answers).toEqual([{ party: 'r1', text: 'You are coming, in group B.', ok: true }]);
  });

  // Plan 8M-11A (S21): Meet…'s group changed since: the form closes as Group…'s does, the answer
  // in the answer line.
  it('closes Meet… on a refusal of a group changed since, the answer in the answer line', async () => {
    const { ui, button, post, done, answers } = page();
    const meet = {
      title: 'Meeting time',
      text: 'For your group: everybody in it is told.',
      label: 'When does your group meet?',
      group: 'A',
      stamp: 'a1',
      times: [{ at: NOW + 600_000, rsvp: true }],
      set: null,
      picked: NOW + 600_000,
    };
    const refusal = 'Group A has changed since: press Meet… again.';
    vi.stubGlobal('fetch', (_url: string, init?: { method?: string }) => {
      const posting = init?.method === 'POST';
      return Promise.resolve({
        ok: !posting,
        status: posting ? 422 : 200,
        json: () => Promise.resolve(posting ? { ok: false, text: refusal } : meet),
      });
    });
    ui.meetClicked(button as unknown as HTMLButtonElement, raid);
    await focusOn(undefined);
    post.querySelector('select')?.setAttribute('value', String(NOW + 600_000));
    post.querySelector('button[data-submit]')?.dispatch('click');
    await done;
    expect(post.querySelector('button[data-submit]')).toBeNull();
    expect(answers).toEqual([{ party: 'r1', text: refusal, ok: false }]);
  });

  // Review N-3: the popup or card of the party closed is that of the party the form was opened
  // for, which a poll may have taken out of the list before the answer came.
  it('closes the popup or card of the party Delete… was opened for, by the party it holds', async () => {
    const { ui, button, post, done, closed } = page();
    const staffs = { ...raid, close: { mayDelete: false, forum: '#west-raids', word: 'raid' } };
    ui.closeClicked(button as unknown as HTMLButtonElement, staffs);
    await Promise.resolve();
    await Promise.resolve();
    post.querySelector('button[data-submit]')?.dispatch('click');
    await done;
    expect(closed).toEqual([staffs]);
  });

  // Plan 8M-13 (A2): a refusal that keeps its form moves the form's popup or card as the page
  // decides (the card nudged where it holds the form), not by a shake of its own.
  it('hands a refusal that keeps its form to the page, with the form, said under it', async () => {
    const { ui, button, post, answers, moved } = page();
    const refusal = 'You may not delete this raid.';
    let refused: () => void = () => undefined;
    const said = new Promise<void>((resolve) => {
      refused = resolve;
    });
    vi.stubGlobal('fetch', () => {
      refused();
      return Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ ok: false, text: refusal }),
      });
    });
    const staffs = { ...raid, close: { mayDelete: false, forum: '#west-raids', word: 'raid' } };
    ui.closeClicked(button as unknown as HTMLButtonElement, staffs);
    await Promise.resolve();
    await Promise.resolve();
    post.querySelector('button[data-submit]')?.dispatch('click');
    await said;
    await focusOn(undefined);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.party).toBe('r1');
    // The form stays, its words under it; nothing in the answer line.
    expect(post.querySelector('button[data-submit]')).not.toBeNull();
    expect(answers).toEqual([]);
  });
});

describe("a train's forms in the page (plan 8M-8C)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Review, finding 7: what was picked is not lost to a time mistyped.
  // Staging of 2026-10-30: nor to a limit, which says nothing of the form's choices.
  it.each([
    {
      why: 'a time could not be read',
      status: 422,
      body: { ok: false, text: 'I could not read it.', keepsForm: true },
      said: 'I could not read it.',
    },
    {
      why: 'it is at a limit',
      status: 429,
      body: { error: 'You can do that again in 3 minutes.' },
      said: 'You can do that again in 3 minutes.',
    },
  ])('keeps Manage… open when the server says $why', async ({ status, body, said }) => {
    const { ui, button, post, moved, answers } = page();
    const manage = {
      title: 'Manage the train',
      text: 'At stop 1 of 3: Veterans Memorial Bridge',
      kind: {
        label: 'What the train is mainly for',
        options: [{ value: 'raid', label: 'Raids' }],
        picked: 'raid',
      },
      shown: { from: '4', first: '4', atEnd: 'finish', kind: 'raid' },
    };
    vi.stubGlobal('fetch', (_url: string, init?: { method?: string }) => {
      const answer = init?.method === 'POST' ? { status, body } : { status: 200, body: manage };
      return Promise.resolve({
        ok: answer.status < 400,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      });
    });
    ui.manageClicked(button as unknown as HTMLButtonElement, raid);
    await focusOn(undefined);
    const answered = focusOn(undefined);
    post.querySelector('button[data-submit]')?.dispatch('click');
    await answered;
    expect(post.querySelector('button[data-submit]')).not.toBeNull();
    expect(post.querySelector('.form-answer')?.textContent).toBe(said);
    expect(moved).toHaveLength(1);
    expect(answers).toEqual([]);
  });

  // Manage… asks the trains' address what the dialog shows, and sends its Submit there; a
  // refusal that gives the train as it is now (moved on meanwhile) closes the form and asks for
  // the list again, without taking the train for over.
  it('opens Manage… from the trains’ address, and a refusal with the train closes it without closing the popup', async () => {
    const { ui, button, post, done, closed } = page();
    const asked: Array<{ url: string; method: string; body?: unknown }> = [];
    const manage = {
      title: 'Manage the train',
      text: 'At stop 1 of 3: Veterans Memorial Bridge',
      kind: {
        label: 'What the train is mainly for',
        options: [
          { value: 'raid', label: 'Raids' },
          { value: 'dynamax', label: 'Dynamax Battles' },
        ],
        picked: 'raid',
      },
      shown: { from: '4', first: '4', atEnd: 'finish', kind: 'raid' },
    };
    vi.stubGlobal('fetch', (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      asked.push({
        url,
        method,
        ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) as unknown }),
      });
      const answer =
        method === 'GET'
          ? { status: 200, body: manage }
          : {
              status: 409,
              body: { ok: false, text: 'The train has moved on.', train: { id: 'r1', route: [] } },
            };
      return Promise.resolve({
        ok: answer.status < 400,
        status: answer.status,
        json: () => Promise.resolve(answer.body),
      });
    });
    ui.manageClicked(button as unknown as HTMLButtonElement, raid);
    await focusOn(undefined);
    post.querySelector('button[data-submit]')?.dispatch('click');
    await done;
    expect(asked).toEqual([
      { url: '/s/100000000000000001/api/trains/r1/manage', method: 'GET' },
      {
        url: '/s/100000000000000001/api/trains/r1/manage',
        method: 'POST',
        body: { shown: manage.shown, picked: { kind: 'raid' } },
      },
    ]);
    expect(closed).toEqual([]);
  });
});
