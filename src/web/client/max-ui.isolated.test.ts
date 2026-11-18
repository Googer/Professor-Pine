import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MaxOptionsView } from '../../domain/web/max-data.js';
import {
  FakeButton,
  FakeElement,
  focused,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';
import { fakeFormFrame } from './fake-form-frame.js';
import { maxUi, UNLISTED_SPOT } from './max-ui.js';

// Leaflet reads the browser's `window` as it loads; the page's helpers it comes in with are not
// used here. Isolated: a mocked module needs a module graph of its own (testing.md).
vi.mock('leaflet', () => ({}));

const MAX: MaxOptionsView = {
  zone: 'America/New_York',
  bosses: [
    { value: 'm:D5:zapdos', name: 'Zapdos', level: 'D5', tier: 'Dynamax 5★', featured: true },
  ],
  tiers: [{ value: 'D5', tier: 'Dynamax 5★' }],
};

const OLD_MILL = { id: 'spot-abc', title: 'Old Mill', lat: 40.44, lon: -79.95 };

/**
 * A phone's page (review P7, plan 8M-22) with a Power Spot's popup (its "Report max battle here")
 * shown as a plain popup, the card closed, the server answering the bosses; the pins put at a
 * point, told once the form is drawn, and taken away.
 */
function page() {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const report = make('button');
  report.setAttribute('id', 'report-button');
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const control = make('button');
  control.setAttribute('data-report-max', OLD_MILL.id);
  popup.append(control);
  body.append(report, notice, popup);
  vi.stubGlobal('document', {
    createElement: make,
    getElementById: (id: string) => (id === 'notice' ? notice : null),
    querySelector: (selector: string) => body.querySelector(selector),
  });
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeButton);
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MAX) }),
  );
  const pane = fakeFormFrame(body, popup, OLD_MILL.title, undefined, { phone: {} });
  const pins: { at: unknown; drawn: number; gone: boolean }[] = [];
  const ui = maxUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    regions: [],
    hold: { editing: false },
    frame: pane.frame,
    pinAt: (at) => {
      const pin = { at, drawn: 0, gone: false };
      pins.push(pin);
      return {
        drawn: () => {
          pin.drawn += 1;
        },
        remove: () => {
          pin.gone = true;
        },
      };
    },
    done: () => Promise.resolve(),
  });
  return { ui, pane, pins, report, control };
}

describe("a max battle's form on a phone (plan 8M-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens at a Power Spot in the card, its popup closed; Cancel opens the spot's popup again", async () => {
    const made = page();
    const drawn = made.pane.tools.nextForm();
    made.ui.maxClicked(made.control as unknown as HTMLElement, OLD_MILL);
    expect(made.pane.places).toEqual(['card']);
    expect(made.pane.isOpen()).toBe(false);
    const form = await drawn;
    expect(made.pane.card?.layer.childNodes).toEqual([form]);
    expect(form.querySelector('.form-place')?.textContent).toBe('Old Mill');
    expect(made.pins).toEqual([]);
    made.pane.card?.pressX();
    expect(made.pane.isOpen()).toBe(true);
    expect(focused().at(-1) === made.control).toBe(true);
  });

  it('opens at a pin in the card, the pin panned above it once drawn and taken away by Cancel', async () => {
    const made = page();
    const drawn = made.pane.tools.nextForm();
    made.ui.maxAt({ lat: 40.45, lon: -79.95 }, true, made.report as unknown as HTMLElement);
    expect(made.pane.places).toEqual(['card']);
    expect(made.pins[0]?.drawn).toBe(0);
    const form = await drawn;
    expect(form.querySelector('.form-place')?.textContent).toBe(UNLISTED_SPOT);
    expect(made.pins[0]?.drawn).toBe(1);
    form.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pins[0]?.gone).toBe(true);
    expect(made.pane.held()).toBe(false);
    expect(focused().at(-1) === made.report).toBe(true);
  });
});
