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
 * The page with the Report button and the side pane's box (plan 8M-22), the server answering the
 * list of Pokémon; the pins put at a point and taken away, and what the notice band said.
 */
function page(editing = false) {
  resetFocus();
  const body = make('body');
  body.page = true;
  const notice = make('div');
  const report = make('button');
  report.setAttribute('id', 'report-button');
  body.append(report, notice);
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
      ok: true,
      status: 200,
      json: () => Promise.resolve({ pokemon: [['dratini', 'Dratini']] }),
    }),
  );
  const pane = fakeFormFrame(body, undefined);
  const pins: { at: unknown; gone: boolean }[] = [];
  const ui = spawnUi({
    guild: '100000000000000001',
    csrf: { get: () => 'token', set: () => undefined },
    regions: REGIONS,
    hold: { editing },
    frame: pane.frame,
    pinAt: (at) => {
      const pin = { at, gone: false };
      pins.push(pin);
      return () => {
        pin.gone = true;
      };
    },
  });
  return { ui, pane, pins, report, notice };
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
    const made = page(true);
    made.ui.spawnAt({ lat: 40.05, lon: -80.05 });
    expect(made.pins).toEqual([]);
    expect(made.pane.takes).toEqual([]);
    expect(made.notice.textContent).toBe('Close the form that is open first.');
  });
});
