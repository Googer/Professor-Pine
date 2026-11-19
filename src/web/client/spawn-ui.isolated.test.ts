import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import {
  FakeButton,
  FakeElement,
  focused,
  make,
  resetFocus,
} from '../../../test/support/fake-page.js';
import { fakeFormFrame } from './fake-form-frame.js';
import { spawnUi } from './spawn-ui.js';

// Leaflet reads the browser's `window` as it loads; the page's helpers it comes in with are not
// used here. Isolated: a mocked module needs a module graph of its own (testing.md).
vi.mock('leaflet', () => ({}));

/** West as `/api/geo` gives it. */
const REGIONS: GeoView['regions'] = [
  {
    id: 1,
    name: 'west',
    outline: [
      [40, -80.1],
      [40.1, -80.1],
      [40.1, -80],
      [40, -80],
      [40, -80.1],
    ],
  },
];

/**
 * The page with the Report button and the side pane's box (plan 8M-22), on a phone its card
 * (`phone`), the server answering the list of Pokémon (never, with `listsNever`); the pins put at a
 * point, whether the map was told the form there was drawn (to pan it clear of the card), and
 * whether they were taken away; what the notice band said.
 */
function page(options: { editing?: boolean; phone?: boolean; listsNever?: boolean } = {}) {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const report = make('button');
  report.setAttribute('id', 'report-button');
  const popup = make('div');
  popup.className = 'leaflet-popup';
  const control = make('button');
  control.setAttribute('data-spawn', '1');
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
    options.listsNever === true
      ? new Promise(() => undefined)
      : Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ pokemon: [['dratini', 'Dratini']] }),
        }),
  );
  const pane = fakeFormFrame(
    body,
    popup,
    'Library',
    undefined,
    options.phone === true ? { phone: {} } : {},
  );
  const pins: { at: unknown; drawn: number; gone: boolean }[] = [];
  const ui = spawnUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    regions: REGIONS,
    hold: { editing: options.editing ?? false },
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
  });
  return { ui, pane, pins, report, notice, popup, control };
}

describe('the spawn form at a point of the map (spawnAt, plan 8M-22)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens in the side pane with step 2’s pin at the point, taken away by Cancel', async () => {
    const made = page();
    const drawn = made.pane.tools.nextForm();
    made.ui.spawnAt(
      { lat: 40.05, lon: -80.05 },
      false,
      undefined,
      made.report as unknown as HTMLElement,
    );
    expect(made.pins.map((pin) => pin.at)).toEqual([{ lat: 40.05, lon: -80.05 }]);
    const form = await drawn;
    expect(form.getAttribute('data-form')).toBe('spawn');
    expect(made.pins[0]?.gone).toBe(false);
    form.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pins[0]?.gone).toBe(true);
    expect(made.pane.tools.childNodes).toEqual([made.pane.idle]);
    expect(made.pane.held()).toBe(false);
    // Opened by the Report button's step 3: the focus back on it.
    expect(focused().at(-1) === made.report).toBe(true);
  });

  it('opens nothing while another form is open, and puts no pin', () => {
    const made = page({ editing: true });
    made.ui.spawnAt({ lat: 40.05, lon: -80.05 });
    expect(made.pins).toEqual([]);
    expect(made.pane.takes).toEqual([]);
    expect(made.notice.textContent).toBe('Close the form that is open first.');
  });

  // Review P2: lists that never come leave no hold stuck and no pin behind.
  it('is closed by the Cancel of its loading line in the side pane, the pin taken away', () => {
    const made = page({ listsNever: true });
    made.ui.spawnAt({ lat: 40.05, lon: -80.05 });
    made.pane.tools.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.held()).toBe(false);
    expect(made.pins[0]?.gone).toBe(true);
  });

  // Review P7: on a phone in the card's form mode, the pin panned above the card once drawn.
  it('opens in the card on a phone, the pin panned above it once the form is drawn', async () => {
    const made = page({ phone: true });
    const drawn = made.pane.tools.nextForm();
    made.ui.spawnAt({ lat: 40.05, lon: -80.05 }, false, undefined, made.report as never);
    expect(made.pane.places).toEqual(['card']);
    // Not panned while it loads: the card's height is the form's once it is drawn.
    expect(made.pins[0]?.drawn).toBe(0);
    const form = await drawn;
    expect(made.pane.card?.layer.childNodes).toEqual([form]);
    expect(made.pane.tools.querySelector('[data-form="spawn"]')).toBeNull();
    expect(made.pins[0]?.drawn).toBe(1);
    made.pane.card?.pressX();
    expect(made.pins[0]?.gone).toBe(true);
    expect(made.pane.card?.formShown()).toBe(false);
    expect(made.pane.held()).toBe(false);
  });

  // Review P2: the card's × while it loads runs the same close: the pin taken away.
  it("takes the pin away when the card's × closes it while it loads", () => {
    const made = page({ phone: true, listsNever: true });
    made.ui.spawnAt({ lat: 40.05, lon: -80.05 });
    made.pane.card?.pressX();
    expect(made.pane.held()).toBe(false);
    expect(made.pins[0]?.gone).toBe(true);
    expect(made.pane.card?.formShown()).toBe(false);
  });
});

describe('the spawn form at a place (spawnClicked, plan 8M-22)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens in the card on a phone over the place, and Cancel opens its popup again', async () => {
    const made = page({ phone: true });
    const drawn = made.pane.tools.nextForm();
    made.ui.spawnClicked(made.control as unknown as HTMLElement, {
      kind: 'gym',
      id: '1',
      lat: 40.05,
      lon: -80.05,
    });
    expect(made.pane.places).toEqual(['card']);
    expect(made.pane.isOpen()).toBe(false);
    const form = await drawn;
    expect(form.querySelector('.form-place')?.textContent).toBe('Library');
    expect(made.pins).toEqual([]);
    form.querySelector('button[data-cancel]')?.dispatch('click');
    expect(made.pane.isOpen()).toBe(true);
    expect(focused().at(-1) === made.control).toBe(true);
  });
});
