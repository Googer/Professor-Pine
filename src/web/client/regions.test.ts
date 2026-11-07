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
  it('draws a region seen on Discord solid, one the map alone shows dashed, one kept out fainter', () => {
    const visible = outlineStyle('visible');
    const hidden = outlineStyle('hidden');
    const barred = outlineStyle('barred');
    expect(visible.dashArray).toBeUndefined();
    expect(hidden.dashArray).toBeDefined();
    expect(barred.dashArray).toBe(hidden.dashArray);
    expect(barred.opacity).toBeLessThan(hidden.opacity);
    expect(hidden.opacity).toBeLessThan(visible.opacity);
    // A region nothing is said of (logged out, read-only, its channel gone) as before.
    expect(outlineStyle(undefined)).toEqual(visible);
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
        row(2, { access: 'barred' }),
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
    expect(given?.buttons[0]?.notes).toEqual(['Also gives back Mod.']);
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
    expect(textOf(hidden)).toContain(REGIONS_LEGEND);
    expect(REGIONS_LEGEND).toBe(
      'Solid: a region you see on Discord. Dashed: one only the map shows you. Fainter dashes: one you are kept out of.',
    );
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
