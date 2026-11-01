import { describe, expect, it } from 'vitest';
import {
  LayerRegistry,
  LAYERS_KEY,
  MAP_LAYERS,
  regionLabelsShown,
  type LayerSpec,
} from './layer-registry.js';
import {
  chipLabel,
  inViewWords,
  layersButtonLabel,
  moreCloses,
  SheetFocus,
  switchLabel,
  toggleName,
} from './layers-ui.js';
import type { ViewStorage } from './view.js';

/** A browser's storage of the test's, which may refuse (private mode, full). */
function storage(refuses = false): ViewStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => {
      if (refuses) throw new Error('SecurityError');
      return items.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (refuses) throw new Error('QuotaExceededError');
      items.set(key, value);
    },
  };
}

/** The registry with the map's layers, as the page registers them. */
function mapRegistry(kept: ViewStorage | undefined): LayerRegistry {
  const registry = new LayerRegistry(kept);
  for (const layer of MAP_LAYERS) registry.register(layer);
  return registry;
}

describe('whether a layer is offered, by its id (plan 8V-1)', () => {
  it('offers a members-only layer to members only, the Meetups layer among them (plan 8M-13)', () => {
    const registry = mapRegistry(storage());
    expect(registry.isOffered('meetups', false)).toBe(false);
    expect(registry.isOffered('meetups', true)).toBe(true);
    expect(registry.isOffered('outlines', false)).toBe(true);
    expect(registry.isOffered('research', false)).toBe(false);
    expect(registry.isOffered('research', true)).toBe(true);
    expect(registry.isOffered('nothing such', true)).toBe(false);
  });
});

describe('the layers of the map (plan 8M-7)', () => {
  it('are on by default for what happens now, off for the places and spawns (plan 8M-9A)', () => {
    const registry = mapRegistry(storage());
    expect(registry.layers().map((layer) => [layer.id, registry.isOn(layer.id)])).toEqual([
      ['raids', true],
      ['trains', true],
      ['meetups', true],
      // Reports at stops (plan 8M-9B): live, on.
      ['research', true],
      ['rocket', true],
      ['spawns', false],
      // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from.
      ['gyms', false],
      ['stops', false],
      ['spots', false],
      ['outlines', true],
    ]);
    // The desktop row: the live ones as toggles, the background ones under "More".
    expect(
      registry
        .layers()
        .filter((layer) => layer.kind === 'live')
        .map((l) => l.name),
    ).toEqual(['Raids', 'Trains', 'Meetups', 'Field research', 'Team GO Rocket']);
    // Short in the desktop's row (B7), the full name in the sheet and the toggle's title.
    expect(
      registry
        .layers()
        .filter((layer) => layer.kind === 'live')
        .map((l) => chipLabel(l)),
    ).toEqual(['Raids', 'Trains', 'Meetups', 'Research', 'Rocket']);
    // A filter on says itself on the toggle: its title and name for a screen reader (goal 5).
    const research = registry.layers().find((layer) => layer.id === 'research');
    expect(research && toggleName(research, 'Rare Candy')).toBe('Field research · Rare Candy');
    expect(research && toggleName(research, undefined)).toBe('Field research');
    expect(
      registry
        .layers()
        .filter((layer) => layer.kind === 'background')
        .map((l) => l.name),
    ).toEqual(['Wild spawns', 'Gyms', 'PokéStops', 'Power Spots', 'Region outlines']);
  });

  it('keeps the choice in the browser, and reads it back on the next visit', () => {
    const kept = storage();
    const first = mapRegistry(kept);
    const told: string[] = [];
    first.onChange((id, on) => told.push(`${id} ${on}`));
    first.set('stops', true);
    first.set('raids', false);
    first.set('raids', false);
    expect(told).toEqual(['stops true', 'raids false']);
    expect(JSON.parse(kept.items.get(LAYERS_KEY) ?? '{}')).toEqual({ stops: true, raids: false });
    const next = mapRegistry(kept);
    expect(next.isOn('stops')).toBe(true);
    expect(next.isOn('raids')).toBe(false);
    expect(next.isOn('trains')).toBe(true);
  });

  // Plan 8M-9A: the Gyms layer's default changed, the choices kept by earlier visits did not.
  it('keeps the Gyms layer on for a browser that kept it on', () => {
    const kept = storage();
    kept.items.set(LAYERS_KEY, '{"gyms":true}');
    expect(mapRegistry(kept).isOn('gyms')).toBe(true);
    expect(mapRegistry(storage()).isOn('gyms')).toBe(false);
  });

  it('works on with the defaults where the browser keeps nothing or something else', () => {
    const refusing = mapRegistry(storage(true));
    expect(refusing.isOn('raids')).toBe(true);
    expect(() => {
      refusing.set('stops', true);
    }).not.toThrow();
    expect(refusing.isOn('stops')).toBe(true);
    const odd = storage();
    odd.items.set(LAYERS_KEY, '{"gyms":"yes","raids":false}');
    const read = mapRegistry(odd);
    expect(read.isOn('gyms')).toBe(false);
    expect(read.isOn('raids')).toBe(false);
    odd.items.set(LAYERS_KEY, 'not json');
    expect(mapRegistry(odd).isOn('raids')).toBe(true);
    expect(mapRegistry(undefined).isOn('outlines')).toBe(true);
  });

  it('offers the PokéStops and Power Spots to members only, and counts the layers on', () => {
    const registry = mapRegistry(storage());
    const offered = (member: boolean) =>
      registry
        .layers()
        .filter((layer) => registry.offered(layer, member))
        .map((layer) => layer.id);
    expect(offered(false)).not.toContain('stops');
    expect(offered(false)).not.toContain('spots');
    // Reports at stops are a member's (plan 8M-9B): not offered logged out.
    expect(offered(false)).not.toContain('research');
    expect(offered(false)).not.toContain('rocket');
    expect(offered(true)).toEqual(expect.arrayContaining(['research', 'rocket']));
    expect(offered(true)).toEqual(expect.arrayContaining(['stops', 'spots']));
    // Wild spawns wait for their data (no route lists spawns yet).
    expect(offered(true)).not.toContain('spawns');
    registry.setOffered('spawns', true);
    expect(offered(true)).toContain('spawns');
    registry.set('stops', true);
    // Raids, trains, meetups, research, Rocket, outlines and the stops: the Gyms layer is off
    // (plan 8M-9A).
    expect(registry.countOn(true)).toBe(7);
    // A visitor is offered the outlines alone of these: the rest is not counted, though on.
    expect(registry.countOn(false)).toBe(1);
  });

  // Plan 8M-13 (L1): logged out, or not a member, the server gives the gyms and the regions'
  // outlines (`/api/geo`) and nothing else.
  it('offers a visitor only the layers that hold something for them: Gyms and Region outlines', () => {
    const registry = mapRegistry(storage());
    // Even once wild spawns had data, they would be a member's.
    registry.setOffered('spawns', true);
    const offered = (member: boolean) =>
      registry
        .layers()
        .filter((layer) => registry.offered(layer, member))
        .map((layer) => layer.id);
    expect(offered(false)).toEqual(['gyms', 'outlines']);
    expect(offered(true)).toEqual(MAP_LAYERS.map((layer) => layer.id));
  });

  it("words the phone's button and its sheet's counts", () => {
    expect(layersButtonLabel(5)).toBe('Layers · 5');
    expect(inViewWords(4)).toBe('4 in view');
    expect(inViewWords(undefined)).toBe('');
  });

  it('adds a layer in one call, and counts what each shows in view', () => {
    const registry = mapRegistry(storage());
    const research: LayerSpec = { id: 'research', name: 'Field research', on: true, kind: 'live' };
    registry.register(research);
    expect(registry.layers().map((layer) => layer.id)).toContain('research');
    expect(registry.isOn('research')).toBe(true);
    const counts: string[] = [];
    registry.onCount((id, count) => counts.push(`${id} ${count}`));
    registry.setCount('raids', 3);
    registry.setCount('raids', 3);
    registry.setCount('research', 0);
    expect(registry.count('raids')).toBe(3);
    expect(counts).toEqual(['raids 3', 'research 0']);
  });
});

describe('the layer controls for keyboards and screen readers (plan 8M-7, fix round 1)', () => {
  it('names each switch by its layer', () => {
    expect(switchLabel({ id: 'gyms', name: 'Gyms', on: true, kind: 'background' })).toBe('Gyms');
  });

  it('moves the focus into the sheet, closes it on Escape and gives the focus back', () => {
    const focused: string[] = [];
    const element = (name: string) => ({
      focus: () => {
        focused.push(name);
      },
    });
    const sheet = { hidden: true };
    const first = element('first switch');
    const control = new SheetFocus(sheet, () => [first, element('Done')]);
    control.open(element('Layers button'));
    expect(sheet.hidden).toBe(false);
    expect(focused).toEqual(['first switch']);
    expect(control.key('Tab', false, first)).toBe(false);
    expect(sheet.hidden).toBe(false);
    expect(control.key('Escape')).toBe(true);
    expect(sheet.hidden).toBe(true);
    expect(focused).toEqual(['first switch', 'Layers button']);
    // Closed already: Escape is somebody else's.
    expect(control.key('Escape')).toBe(false);
  });

  it('keeps Tab and Shift+Tab inside the open sheet, a modal dialog (review fix 9)', () => {
    const focused: string[] = [];
    const element = (name: string) => ({
      focus: () => {
        focused.push(name);
      },
    });
    const sheet = { hidden: true };
    const [first, second, done] = [element('first'), element('second'), element('Done')];
    const control = new SheetFocus(sheet, () => [first, second, done]);
    control.open(element('Layers button'));
    focused.length = 0;
    // Within the sheet the browser moves the focus itself.
    expect(control.key('Tab', false, first)).toBe(false);
    expect(control.key('Tab', true, done)).toBe(false);
    // From its last control to its first, and back.
    expect(control.key('Tab', false, done)).toBe(true);
    expect(control.key('Tab', true, first)).toBe(true);
    expect(focused).toEqual(['first', 'Done']);
    // The focus somewhere outside it (a tap on the page behind): back to its first control.
    expect(control.key('Tab', false, element('the map'))).toBe(true);
    expect(control.key('Tab', true, null)).toBe(true);
    expect(focused).toEqual(['first', 'Done', 'first', 'Done']);
    // Closed, Tab is the page's.
    control.close();
    expect(control.key('Tab', false, done)).toBe(false);
  });

  it('closes "More" on Escape and on a click outside it, not on one inside', () => {
    expect(moreCloses({ key: 'Escape' })).toBe(true);
    expect(moreCloses({ clickInside: false })).toBe(true);
    expect(moreCloses({ clickInside: true })).toBe(false);
    expect(moreCloses({ key: 'Enter' })).toBe(false);
  });
});

describe("the regions' names (fix round 1)", () => {
  it('are shown only zoomed out, below street level, where they help to find a region', () => {
    expect(regionLabelsShown(10)).toBe(true);
    expect(regionLabelsShown(14)).toBe(true);
    // At street level they would sit under the markers.
    expect(regionLabelsShown(15)).toBe(false);
    expect(regionLabelsShown(18)).toBe(false);
  });
});
