import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeButton,
  FakeElement,
  focused,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';
import { fakeFormFrame } from './fake-form-frame.js';
import { rocketUi } from './rocket-ui.js';
import { caseRocketOptions } from './stop-report-cases.js';

// Leaflet reads the browser's `window` as it loads; the page's helpers it comes in with are not
// used here. Isolated: a mocked module needs a module graph of its own (testing.md).
vi.mock('leaflet', () => ({}));

/**
 * A stop's popup with "Report Rocket here" over a fake page, the side pane's box beside it or on a
 * phone the card (`phone`, closed: the stop's popup is a plain one), the server answering the
 * lineups.
 */
function page(phone: boolean) {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const control = make('button');
  control.setAttribute('data-report-rocket', 'stop-5');
  popup.append(control);
  body.append(notice, popup);
  vi.stubGlobal('document', {
    createElement: make,
    getElementById: (id: string) => (id === 'notice' ? notice : null),
    querySelector: (selector: string) => body.querySelector(selector),
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(caseRocketOptions()) }),
  );
  const pane = fakeFormFrame(body, popup, 'Yellow Mural 5', undefined, phone ? { phone: {} } : {});
  const ui = rocketUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    frame: pane.frame,
    done: () => Promise.resolve(),
  });
  return { ui, pane, control };
}

describe("Team GO Rocket's form (plan 8M-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['in the side pane on a wide screen', false, 'pane'],
    ['in the card on a phone', true, 'card'],
  ] as const)('opens %s, the stop named; Cancel opens its popup again', async (_how, phone, at) => {
    const made = page(phone);
    const drawn = made.pane.tools.nextForm();
    made.ui.rocketClicked(made.control as unknown as HTMLButtonElement);
    expect(made.pane.places).toEqual([at]);
    expect(made.pane.isOpen()).toBe(false);
    const form = await drawn;
    expect(form.getAttribute('data-form')).toBe('rocket');
    expect(form.querySelector('.form-place')?.textContent).toBe('Yellow Mural 5');
    expect((phone ? made.pane.card?.layer : made.pane.tools)?.childNodes).toEqual([form]);
    form.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.isOpen()).toBe(true);
    expect(made.pane.held()).toBe(false);
    expect(focused().at(-1) === made.control).toBe(true);
  });
});
