import { describe, expect, it } from 'vitest';
import {
  addressWithoutOpening,
  EVERYONE_ITEMS,
  memberItems,
  menuItemNode,
  openByAddress,
  openingAsked,
  regionsAsked,
  type MapOpening,
} from './account-items.js';
import type { Me } from './notice.js';

const GUILD = '412345678901234567';
const MEMBER: Me = { loggedIn: true, name: 'Ash', csrf: 't', member: true, readOnly: false };
const STAFF: Me = { ...MEMBER, mayEditRegions: true };

describe("the account menu's items (Matt, 2026-11-07)", () => {
  it("are the map's for a member on every page, in the map's order", () => {
    expect(memberItems(STAFF, 'map')).toEqual(['history', 'me', 'regions', 'edit', 'editor-tour']);
    // The editor is never on there: no "Editor tour".
    expect(memberItems(STAFF, 'history')).toEqual(['history', 'me', 'regions', 'edit']);
    expect(memberItems(STAFF, 'me')).toEqual(['history', 'me', 'regions', 'edit']);
    expect(memberItems(MEMBER, 'me')).toEqual(['history', 'me', 'regions']);
  });

  it('give "Edit regions" to staff who are not members, and nothing to a visitor', () => {
    const staffOnly: Me = { ...STAFF, member: false };
    expect(memberItems(staffOnly, 'map')).toEqual(['edit', 'editor-tour']);
    expect(memberItems(staffOnly, 'history')).toEqual(['edit']);
    expect(memberItems({ ...MEMBER, member: false }, 'history')).toEqual([]);
    expect(memberItems({ loggedIn: false }, 'history')).toEqual([]);
  });

  it('have "Map tour" for whoever asks', () => {
    expect(EVERYONE_ITEMS).toEqual(['tour']);
  });

  it('mark the page you are on, and keep it in the menu', () => {
    const history = menuItemNode('history', GUILD, 'history');
    expect(history.attributes).toEqual({
      href: `/s/${GUILD}/history`,
      'aria-current': 'page',
    });
    expect(menuItemNode('me', GUILD, 'history').attributes).toEqual({ href: `/s/${GUILD}/me` });
    expect(menuItemNode('me', GUILD, 'me').attributes?.['aria-current']).toBe('page');
    expect(menuItemNode('history', GUILD, 'map').attributes?.['aria-current']).toBeUndefined();
  });

  it('are links on the history pages to the map, which opens the thing there', () => {
    for (const page of ['history', 'me'] as const) {
      expect(menuItemNode('regions', GUILD, page)).toMatchObject({
        tag: 'a',
        className: 'regions-item',
        text: 'Your regions…',
        attributes: { href: `/s/${GUILD}/map?open=regions` },
      });
      expect(menuItemNode('tour', GUILD, page)).toMatchObject({
        tag: 'a',
        className: 'tour-item',
        text: 'Map tour',
        attributes: { href: `/s/${GUILD}/map?open=tour` },
      });
      expect(menuItemNode('edit', GUILD, page)).toMatchObject({
        tag: 'a',
        className: 'edit-regions',
        text: 'Edit regions',
        attributes: { href: `/s/${GUILD}/regions/edit` },
      });
    }
    // The unsaved count the map's item says.
    expect(menuItemNode('edit', GUILD, 'history', 3).text).toBe('Edit regions · 3 unsaved');
  });

  it('are buttons on the map, where they act in place', () => {
    for (const [item, className, text] of [
      ['regions', 'regions-item', 'Your regions…'],
      ['edit', 'edit-regions', 'Edit regions'],
      ['editor-tour', 'editor-tour-item', 'Editor tour'],
      ['tour', 'tour-item', 'Map tour'],
    ] as const) {
      const node = menuItemNode(item, GUILD, 'map');
      expect(node, item).toMatchObject({ tag: 'button', className, text });
      expect(node.attributes?.type, item).toBe('button');
      expect(node.attributes?.href, item).toBeUndefined();
    }
  });

  it('hide "Your regions…" until the view of the regions offers it', () => {
    expect(menuItemNode('regions', GUILD, 'map').attributes).toHaveProperty('hidden');
    expect(menuItemNode('regions', GUILD, 'me').attributes).toHaveProperty('hidden');
  });

  it('ask the view of the regions where the map asks it: a member, not read-only', () => {
    expect(regionsAsked(MEMBER)).toBe(true);
    expect(regionsAsked({ ...MEMBER, readOnly: true })).toBe(false);
    expect(regionsAsked({ ...STAFF, member: false })).toBe(false);
    expect(regionsAsked({ loggedIn: false })).toBe(false);
  });
});

describe('what the address asks the map to open (?open=)', () => {
  it('is the regions dialog or the tour, nothing else', () => {
    expect(openingAsked('?open=regions')).toBe('regions');
    expect(openingAsked('?train=4&open=tour')).toBe('tour');
    expect(openingAsked('?open=raids')).toBeUndefined();
    expect(openingAsked('?opens=tour')).toBeUndefined();
    expect(openingAsked('')).toBeUndefined();
  });

  it('is taken out of the address, the rest kept', () => {
    expect(addressWithoutOpening('/s/1/map', '?open=regions', '')).toBe('/s/1/map');
    expect(addressWithoutOpening('/s/1/map', '?edit=regions&open=tour', '#x')).toBe(
      '/s/1/map?edit=regions#x',
    );
  });

  /** The page's side of `openByAddress`, recording what it was told. */
  function page(offered: boolean) {
    const said: string[] = [];
    return {
      said,
      offered: (what: MapOpening) => {
        said.push(`offered ${what}`);
        return offered;
      },
      open: (what: MapOpening) => {
        said.push(`open ${what}`);
      },
      leave: () => {
        said.push('leave');
      },
    };
  }

  it('opens the thing once what it waits for settled, and leaves the address', async () => {
    const shown = page(true);
    let settle = (): void => undefined;
    const waiting = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const done = openByAddress(
      'regions',
      [waiting, Promise.reject(new Error('map failed'))],
      shown,
    );
    await Promise.resolve();
    expect(shown.said).toEqual([]);
    settle();
    await done;
    expect(shown.said).toEqual(['leave', 'offered regions', 'open regions']);
  });

  it('ignores it where the thing is not offered, the address left all the same', async () => {
    const shown = page(false);
    await openByAddress('regions', [], shown);
    expect(shown.said).toEqual(['leave', 'offered regions']);
  });

  it('does nothing where the address asks nothing', async () => {
    const shown = page(true);
    await openByAddress(undefined, [], shown);
    expect(shown.said).toEqual([]);
  });
});
