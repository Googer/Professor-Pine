import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import { FormHold } from './raid-forms.js';
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

describe('the spawn form at a point of the map (spawnAt)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('closes the popup it opened when another form took the hold as the popup opened', () => {
    // Just enough of a document for the box the popup shows while the list loads.
    vi.stubGlobal('document', {
      createElement: () => ({ className: '', textContent: '' }),
    });
    const hold = new FormHold<string>({
      draw: () => undefined,
      popup: () => undefined,
      later: (run) => {
        run();
      },
      controls: () => undefined,
    });
    const popups: { content: HTMLElement; closed: boolean }[] = [];
    const ui = spawnUi({
      guild: '100000000000000001',
      csrf: { get: () => 'token', set: () => undefined },
      regions: REGIONS,
      hold,
      popupAt: (_point, content) => {
        const popup = { content, closed: false };
        popups.push(popup);
        // Opening the popup let another form in first (a raid form of a popup it closed).
        hold.take(true);
        return {
          close: () => {
            popup.closed = true;
          },
        };
      },
    });
    ui.spawnAt({ lat: 40.05, lon: -80.05 });
    expect(popups).toHaveLength(1);
    expect(popups[0]?.content.textContent).toBe('Loading the Pokémon…');
    expect(popups[0]?.closed).toBe(true);
  });
});
