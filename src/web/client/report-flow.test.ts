import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import { nearestLines, pickBox, pickLive, regionHolding } from './report-flow.js';
import { REPORT_KINDS } from './report-menu.js';

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** The nodes of a tree with this tag. */
const tagged = (node: PageNode, tag: string): PageNode[] => [
  ...(node.tag === tag ? [node] : []),
  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
];

const kind = (id: string) => {
  const found = REPORT_KINDS.find((one) => one.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("the Report button's step 2 (plan 8M-9A)", () => {
  it('says what to tap for each kind, with a way back to step 1 and Cancel', () => {
    const raid = pickBox(kind('raid'));
    expect(texts(raid)).toEqual([
      'Report a raid',
      'Tap a gym on the map to report its raid.',
      '← Back',
      'Cancel',
    ]);
    // R1-3, R2-2: the words that change (the pin, the nearest) told from a part of its own that
    // stays in the page, drawn anew alone (`pickLive`); its heading takes the focus as step 2
    // begins.
    expect(raid.attributes).not.toHaveProperty('aria-live');
    const live = pickLive(kind('raid'), []);
    expect(live.attributes).toEqual({ 'aria-live': 'polite', 'data-pick-live': '' });
    expect(texts(live)).toEqual(['Nearest', 'None near here.']);
    expect(
      (raid.children ?? []).find((child) => child.attributes?.['data-pick-live'] !== undefined),
    ).toEqual(pickLive(kind('raid')));
    expect(tagged(raid, 'span').find((span) => span.text === 'Report a raid')?.attributes).toEqual({
      tabindex: '-1',
      'data-pick-heading': '',
    });
    expect(tagged(raid, 'button').map((button) => button.attributes)).toEqual([
      { type: 'button', 'data-report-back': '' },
      { type: 'button', 'data-cancel': '' },
    ]);
    expect(texts(pickBox(kind('max'))).slice(0, 2)).toEqual([
      'Report a max battle',
      'Tap a Power Spot, or anywhere on the map for an unlisted power spot.',
    ]);
    expect(texts(pickBox(kind('spawn'))).slice(0, 2)).toEqual([
      'Report a wild spawn',
      'Tap the map where the Pokémon is.',
    ]);
  });

  // A4: the nearest few beside the places drawn, from your location, else the map's middle.
  it('lists the nearest places with their distances, each a button that picks it', () => {
    const lines = nearestLines(
      [
        { id: '3', name: 'Far Fountain', lat: 40.46, lon: -79.95 },
        { id: '1', name: 'Library', lat: 40.441, lon: -79.95 },
        { id: '2', name: 'Bridge', lat: 40.444, lon: -79.95 },
      ],
      { lat: 40.44, lon: -79.95 },
      'imperial',
      2,
    );
    expect(lines).toEqual([
      { id: '1', name: 'Library', distance: '360 ft' },
      { id: '2', name: 'Bridge', distance: '0.3 mi' },
    ]);
    const box = pickBox(kind('raid'), lines);
    expect(texts(box)).toEqual([
      'Report a raid',
      'Tap a gym on the map to report its raid.',
      'Nearest',
      'Library',
      '360 ft',
      'Bridge',
      '0.3 mi',
      '← Back',
      'Cancel',
    ]);
    expect(
      tagged(box, 'button')
        .map((button) => button.attributes?.['data-report-near'])
        .filter((id) => id !== undefined),
    ).toEqual(['1', '2']);
    // Still asked for (the Power Spots of the view): said so; none near: said so.
    expect(texts(pickBox(kind('max'), 'loading'))).toContain('Finding the nearest…');
    expect(texts(pickBox(kind('max'), []))).toContain('None near here.');
    // R1-6: Power Spots that cannot be had, or are not drawn at this zoom, said so.
    expect(texts(pickBox(kind('max'), 'failed'))).toContain(
      'The Power Spots could not be loaded. Tap the map for an unlisted power spot.',
    );
    expect(texts(pickBox(kind('max'), 'zoom'))).toContain(
      'Zoom in to see the Power Spots near here.',
    );
  });

  // R1-1: a point tapped is a pin first; its line in the box opens the form there.
  it('offers the pin a tap put, by the line "… here · Report here"', () => {
    const at = { lat: 40.44, lon: -79.95 };
    const max = pickBox(kind('max'), [], at);
    expect(texts(max)).toEqual(expect.arrayContaining(['Unlisted power spot here', 'Report here']));
    expect(
      tagged(max, 'button').find((button) => button.attributes?.['data-report-pin'] !== undefined)
        ?.text,
    ).toBe('Report here');
    expect(texts(pickBox(kind('spawn'), undefined, at))).toEqual(
      expect.arrayContaining(['Spawn here', 'Report here']),
    );
    // Review SH-6: a spawn's pin put on a place names it, as the report will.
    expect(
      texts(
        pickLive(kind('spawn'), undefined, at, undefined, undefined, 'Market Fountain (PokéStop)'),
      ),
    ).toEqual(expect.arrayContaining(['Spawn at Market Fountain (PokéStop)', 'Report here']));
  });

  // A5: a new train's region, prefilled where one region alone holds the place.
  it("prefills a train's region when one region alone holds your location or the map's middle", () => {
    const square = (south: number, west: number, size: number): Array<[number, number]> => [
      [south, west],
      [south + size, west],
      [south + size, west + size],
      [south, west + size],
      [south, west],
    ];
    const regions = [
      { id: 1, name: 'oakland', outline: square(40.43, -79.97, 0.02) },
      { id: 2, name: 'shadyside', outline: square(40.44, -79.96, 0.02) },
    ];
    expect(regionHolding({ lat: 40.435, lon: -79.965 }, regions)).toBe(1);
    // In both: none prefilled; in none: none.
    expect(regionHolding({ lat: 40.445, lon: -79.955 }, regions)).toBeUndefined();
    expect(regionHolding({ lat: 41, lon: -79 }, regions)).toBeUndefined();
  });
});
