import { describe, expect, it } from 'vitest';
import type { RegionsMineView } from '../../domain/web/region-data.js';
import {
  OUTLINES_OFF,
  REGIONS_LEGEND,
  outlineStyle,
  regionRows,
  regionsBox,
  regionsOffered,
} from './regions.js';

/*
 * "Your regions" on the map's page (plan 8M-20), its pure part: the outlines' look by how the
 * member stands to each region (R14), whether the box is offered (R11), and its rows (R12, R13).
 */

const NAMES = new Map([
  [1, 'west'],
  [2, 'east'],
  [4, 'plaza'],
]);

const join = (
  roleId: string,
  name: string,
  more: Partial<RegionsMineView['regions'][number]['join'][number]> = {},
) => ({
  roleId,
  name,
  alsoOpens: [],
  alsoLeaves: { roles: [], regions: [] },
  stuck: null,
  ...more,
});

function viewOf(
  regions: RegionsMineView['regions'],
  more: Partial<RegionsMineView> = {},
): RegionsMineView {
  return { readOnly: false, roles: true, regions, ...more };
}

const row = (id: number, more: Partial<RegionsMineView['regions'][number]> = {}) => ({
  id,
  access: 'visible' as const,
  listed: true,
  join: [],
  leave: [],
  ...more,
});

const leave = (
  roleId: string,
  name: string,
  more: Partial<RegionsMineView['regions'][number]['leave'][number]> = {},
) => ({
  roleId,
  name,
  closes: true,
  alsoCloses: [],
  stillOpenBy: [],
  ...more,
});

describe('the outlines of "Your regions"', () => {
  it('draws a region seen on Discord solid, one the map alone shows dashed, one whose raids it does not list fainter (W3)', () => {
    const visible = outlineStyle({ access: 'visible', listed: true });
    const hidden = outlineStyle({ access: 'hidden', listed: true });
    const unlisted = outlineStyle({ access: 'hidden', listed: false });
    const barred = outlineStyle({ access: 'barred', listed: false });
    expect(visible.dashArray).toBeUndefined();
    expect(hidden.dashArray).toBeDefined();
    expect(barred.dashArray).toBe(hidden.dashArray);
    expect(barred.opacity).toBeLessThan(hidden.opacity);
    expect(hidden.opacity).toBeLessThan(visible.opacity);
    // A region the member does not see is grayed as well (staging F1): a solid neighbor draws the
    // border they share solid, so the dashes alone may not show; the gray does.
    expect(visible.veiled).toBe(false);
    expect(hidden.veiled).toBe(true);
    expect(barred.veiled).toBe(true);
    expect(barred.fillOpacity).toBeGreaterThan(hidden.fillOpacity);
    expect(hidden.fillOpacity).toBeGreaterThan(visible.fillOpacity);
    // Hidden, and its raids not on the map either: as fainter as kept out.
    expect(unlisted).toEqual(barred);
    // A region nothing is said of (logged out, read-only, its channel gone) as before: solid,
    // barely filled.
    const before = outlineStyle(undefined);
    expect(before).toEqual({ dashArray: undefined, opacity: 1, fillOpacity: 0.05, veiled: false });
  });

  it('tells the member’s own regions from the others at a glance (Matt, 2026-11-07)', () => {
    const visible = outlineStyle({ access: 'visible', listed: true });
    const hidden = outlineStyle({ access: 'hidden', listed: true });
    const barred = outlineStyle({ access: 'barred', listed: false });
    // Their own tinted in the region color, more than a region nothing is said of.
    expect(visible.fillOpacity).toBeGreaterThanOrEqual(0.15);
    expect(visible.fillOpacity).toBeGreaterThan(outlineStyle(undefined).fillOpacity);
    // The others grayed plainly, the more so where the map does not list their raids either.
    expect(hidden.fillOpacity).toBeGreaterThanOrEqual(0.3);
    expect(barred.fillOpacity).toBeGreaterThanOrEqual(0.45);
  });
});

describe('whether "Your regions…" is offered', () => {
  it('is offered where a region can be joined or left, not where everybody sees every region', () => {
    expect(regionsOffered(viewOf([row(1), row(4)]))).toBe(false);
    expect(regionsOffered(viewOf([row(1, { access: 'hidden', join: [join('r1', 'West')] })]))).toBe(
      true,
    );
    expect(regionsOffered(viewOf([row(1, { leave: [leave('r1', 'West')] })]))).toBe(true);
    // Not read-only, not without roles, not for a region the map does not have.
    expect(
      regionsOffered(
        viewOf([row(1, { access: 'hidden', join: [join('r1', 'West')] })], { readOnly: true }),
      ),
    ).toBe(false);
    expect(
      regionsOffered(
        viewOf([row(1, { access: 'hidden', join: [join('r1', 'West')] })], { roles: false }),
      ),
    ).toBe(false);
  });
});

describe('the rows of "Your regions"', () => {
  it('lists the regions by name with their state and buttons, the role named where it differs', () => {
    const rows = regionRows(
      viewOf([
        row(1, {
          access: 'hidden',
          join: [join('metro', 'Metro', { alsoOpens: [2] }), join('west', 'West')],
        }),
        row(2, { access: 'barred', listed: false }),
        row(4),
        row(9, { access: 'hidden', join: [join('nine', 'Nine')] }),
      ]),
      NAMES,
    );
    // Only regions the map has (R11), by name.
    expect(rows.map((one) => [one.name, one.state])).toEqual([
      ['east', 'Kept out: ask staff'],
      ['plaza', 'On Discord'],
      ['west', 'Map only'],
    ]);
    // Hidden, and its raids not on the map either (a self-assignable role denies it, W3): Join
    // still offered (A6).
    const [unlisted] = regionRows(
      viewOf([row(4, { access: 'hidden', listed: false, join: [join('east', 'East')] })]),
      NAMES,
    );
    expect(unlisted?.state).toBe('Not on Discord');
    expect(unlisted?.buttons.map((button) => button.label)).toEqual(['Join (East)']);
    expect(rows[2]?.buttons).toEqual([
      {
        action: 'join',
        regionId: 1,
        roleId: 'metro',
        label: 'Join (Metro)',
        ariaLabel: 'Join west (Metro)',
        disabled: false,
        notes: ['Also opens east.'],
      },
      {
        action: 'join',
        regionId: 1,
        roleId: 'west',
        label: 'Join',
        ariaLabel: 'Join west',
        disabled: false,
        notes: [],
      },
    ]);
  });

  it('says what a join takes along, what a leave closes, and what keeps a region open (A2)', () => {
    const [east, , west] = regionRows(
      viewOf([
        row(1, {
          leave: [
            leave('west', 'West'),
            leave('metro', 'Metro', {
              closes: false,
              stillOpenBy: ['West', 'a role staff gave you'],
            }),
          ],
        }),
        row(2, {
          access: 'hidden',
          join: [join('east', 'East', { alsoLeaves: { roles: ['West'], regions: [1] } })],
        }),
        row(4, { leave: [leave('metro', 'Metro', { alsoCloses: [1, 2] })] }),
      ]),
      NAMES,
    );
    expect(east?.buttons[0]?.notes).toEqual(['Also leaves west.']);
    expect(west?.buttons).toEqual([
      {
        action: 'leave',
        regionId: 1,
        roleId: 'west',
        label: 'Leave',
        ariaLabel: 'Leave west',
        disabled: false,
        notes: [],
      },
      {
        action: 'leave',
        regionId: 1,
        roleId: 'metro',
        label: 'Leave (Metro)',
        ariaLabel: 'Leave west (Metro)',
        disabled: false,
        notes: ['You would still see it through West and a role staff gave you.'],
      },
    ]);
    const plaza = regionRows(
      viewOf([row(4, { leave: [leave('metro', 'Metro', { alsoCloses: [1, 2] })] })]),
      NAMES,
    )[0];
    expect(plaza?.buttons[0]?.notes).toEqual(['Also closes west and east.']);
    // A leave that keeps its region open and closes another says both (W1).
    const kept = regionRows(
      viewOf([
        row(1, {
          leave: [
            leave('metro', 'Metro', { closes: false, alsoCloses: [2], stillOpenBy: ['West'] }),
          ],
        }),
      ]),
      NAMES,
    )[0];
    expect(kept?.buttons[0]?.notes).toEqual([
      'You would still see it through West.',
      'Also closes east.',
    ]);
    // A role given back with no region closing.
    const given = regionRows(
      viewOf([
        row(2, {
          access: 'hidden',
          join: [join('east', 'East', { alsoLeaves: { roles: ['Mod'], regions: [] } })],
        }),
      ]),
      NAMES,
    )[0];
    expect(given?.buttons[0]?.notes).toEqual(['Also takes away Mod.']);
  });

  it('shows a stuck join as a button that cannot be pressed, with why', () => {
    const [west] = regionRows(
      viewOf([
        row(1, {
          access: 'hidden',
          join: [join('west', 'West', { stuck: 'West was not given: you hold Mod.' })],
        }),
      ]),
      NAMES,
    );
    expect(west?.buttons[0]).toMatchObject({
      disabled: true,
      notes: ['West was not given: you hold Mod.'],
    });
  });
});

describe('the box of "Your regions"', () => {
  const textOf = (node: { text?: string; children?: unknown[] }): string =>
    [node.text ?? '', ...(node.children ?? []).map((child) => textOf(child as never))].join(' ');

  /** Whether the box shows a line of its own: in it, without `hidden`. */
  const shows = (box: ReturnType<typeof regionsBox>, attribute: string): boolean => {
    const found: Array<{ attributes?: Record<string, string> }> = [];
    const walk = (node: { attributes?: Record<string, string>; children?: unknown[] }): void => {
      if (node.attributes?.[attribute] !== undefined) found.push(node);
      for (const child of node.children ?? []) walk(child as never);
    };
    walk(box);
    return found.length === 1 && found[0]?.attributes?.hidden === undefined;
  };

  it('says the legend only where a region is not seen on Discord, kept-out ones too (B6)', () => {
    const seen = regionsBox(regionRows(viewOf([row(1)]), NAMES), { outlinesShown: true });
    expect(shows(seen, 'data-regions-legend')).toBe(false);
    const hidden = regionsBox(regionRows(viewOf([row(1, { access: 'hidden' })]), NAMES), {
      outlinesShown: true,
    });
    expect(shows(hidden, 'data-regions-legend')).toBe(true);
  });

  it('draws the legend as the outlines look, a swatch beside the words of each (Matt, 2026-11-07)', () => {
    const box = regionsBox(regionRows(viewOf([row(1, { access: 'hidden' })]), NAMES), {
      outlinesShown: true,
    });
    const legend: Array<{ tag?: string; className?: string; children?: unknown[] }> = [];
    const walk = (node: {
      attributes?: Record<string, string>;
      children?: unknown[];
      tag?: string;
    }): void => {
      if (node.attributes?.['data-regions-legend'] !== undefined) legend.push(node);
      for (const child of node.children ?? []) walk(child as never);
    };
    walk(box);
    const list = legend[0];
    expect(list?.tag).toBe('ul');
    const items = (list?.children ?? []) as Array<{ children?: Array<{ className?: string }> }>;
    expect(items.map((item) => item.children?.[0]?.className)).toEqual([
      'swatch swatch-visible',
      'swatch swatch-map-only',
      'swatch swatch-hidden',
    ]);
    expect(REGIONS_LEGEND).toEqual([
      'On Discord',
      'Map only',
      'Not on Discord or kept out: its raids are not shown',
    ]);
    for (const words of REGIONS_LEGEND) expect(textOf(box)).toContain(words);
  });

  it('says when the outlines layer is off, and holds a line for the answers that stays (B2, B8)', () => {
    const rows = regionRows(viewOf([row(1)]), NAMES);
    expect(shows(regionsBox(rows, { outlinesShown: true }), 'data-regions-outlines-off')).toBe(
      false,
    );
    const off = regionsBox(rows, { outlinesShown: false });
    expect(shows(off, 'data-regions-outlines-off')).toBe(true);
    expect(textOf(off)).toContain(OUTLINES_OFF);
    expect(shows(off, 'data-regions-live')).toBe(true);
  });

  it('closes by × and ← Back, and carries what a press needs', () => {
    const box = regionsBox(
      regionRows(viewOf([row(1, { access: 'hidden', join: [join('west', 'West')] })]), NAMES),
      { outlinesShown: true },
    );
    const all: Array<{ tag: string; text?: string; attributes?: Record<string, string> }> = [];
    const walk = (node: { tag: string; children?: unknown[] }): void => {
      all.push(node);
      for (const child of node.children ?? []) walk(child as never);
    };
    walk(box);
    const buttons = all.filter((node) => node.tag === 'button');
    expect(buttons.map((one) => one.text)).toEqual(['×', 'Join', '← Back']);
    expect(buttons[1]?.attributes).toMatchObject({
      'data-region-action': 'join',
      'data-region': '1',
      'data-role': 'west',
      'aria-label': 'Join west',
    });
    expect(all.some((node) => node.attributes?.['data-region-answer'] === '1')).toBe(true);
  });
});
