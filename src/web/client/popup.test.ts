import { describe, expect, it } from 'vitest';
import {
  gymPopup,
  popupMaxHeight,
  popupPanPadding,
  regionLabel,
  renderNode,
  type MapGym,
  type PageNode,
} from './popup.js';

const gym = (more: Partial<MapGym> = {}): MapGym => ({
  id: 1,
  name: 'Pinewood Public Library',
  nickname: 'The Stacks',
  lat: 40.05,
  lon: -80.05,
  regionIds: [1, 2],
  address: '12 Maple Avenue, Pinewood',
  description: 'Mural of readers',
  notice: 'Closed on Sundays',
  ...more,
});

describe("a popup's room at the map's top left", () => {
  // Leaflet's zoom buttons with a touch screen's size, from the map's top left: a 10 px margin and
  // a bar 34 wide, 65 tall (`leaflet.css`).
  const ZOOM = { right: 44, bottom: 75 };

  // A post's popup at its widest: 381 of content, its margins, the wrapper's padding, the side bar.
  const WIDEST = 429;
  const mapOf = (x: number, y: number) => ({ getSize: () => ({ x, y }) });

  it('keeps a popup on a wide map right of the zoom buttons, without moving it down for them', () => {
    const [left, top] = popupPanPadding(mapOf(1000, 800));
    expect(left).toBeGreaterThan(ZOOM.right);
    expect(top).toBeLessThan(ZOOM.bottom);
    expect(left + WIDEST).toBeLessThan(1000);
  });

  it('keeps a popup on a map too narrow beside them below them, whatever the page is wide', () => {
    // 768 px of page less the side pane's 340, where the page's breakpoint still says desktop.
    for (const width of [360, 428, 460, 480]) {
      const [left, top] = popupPanPadding(mapOf(width, 800));
      expect(left, String(width)).toBeLessThan(10);
      expect(top, String(width)).toBeGreaterThan(ZOOM.bottom);
    }
  });

  it('keeps the widest popup whole beside them from where it goes beside them', () => {
    for (const width of [490, 500, 667]) {
      const [left, top] = popupPanPadding(mapOf(width, 800));
      expect(left, String(width)).toBeGreaterThan(ZOOM.right);
      expect(top, String(width)).toBeLessThan(ZOOM.bottom);
      expect(left + WIDEST, String(width)).toBeLessThanOrEqual(width);
    }
  });

  it('leaves room for the tallest popup, a phone on its side too', () => {
    // The content's margins and the wrapper's padding (28), the tip's margin below it (20).
    for (const [width, height] of [
      [360, 360],
      [428, 360],
      [428, 395],
      [360, 396],
      [360, 600],
      [428, 800],
      [640, 360],
      [667, 320],
      [1000, 800],
    ] as const) {
      const map = mapOf(width, height);
      const [, top] = popupPanPadding(map);
      expect(top + popupMaxHeight(map) + 48, `${String(width)}x${String(height)}`).toBeLessThan(
        height,
      );
    }
  });

  it('keeps a phone on its side beside the buttons', () => {
    expect(popupPanPadding(mapOf(640, 320))[0]).toBeGreaterThan(ZOOM.right);
    expect(popupPanPadding(mapOf(640, 320))[1]).toBeLessThan(ZOOM.bottom);
  });
});

/** Every text of a tree, in order. */
function texts(node: PageNode): string[] {
  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
}

/** A document just big enough for `renderNode`; it records what was asked of it. */
function fakeDocument() {
  interface FakeElement {
    tag: string;
    className: string;
    textContent: string;
    attributes: Record<string, string>;
    children: FakeElement[];
    setAttribute(name: string, value: string): void;
    append(child: FakeElement): void;
  }
  const document = {
    createElement(tag: string): FakeElement {
      const element: FakeElement = {
        tag,
        className: '',
        textContent: '',
        attributes: {},
        children: [],
        setAttribute(name, value) {
          element.attributes[name] = value;
        },
        append(child) {
          element.children.push(child);
        },
      };
      return element;
    },
  };
  return document;
}

describe('gymPopup', () => {
  it('names the gym, its nickname and address, a way there, then its notes', () => {
    const popup = gymPopup(gym());
    expect(texts(popup)).toEqual([
      'Pinewood Public Library',
      'The Stacks',
      '12 Maple Avenue, Pinewood',
      'Directions',
      'Closed on Sundays',
      'Mural of readers',
    ]);
    const link = popup.children?.find((one) => one.className === 'map-line')?.children?.at(-1);
    expect(link).toMatchObject({
      tag: 'a',
      attributes: {
        href: 'https://www.google.com/maps/dir/?api=1&destination=40.05,-80.05',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
  });

  it("says how far the gym is once your location is known, in the settings' units", () => {
    const popup = gymPopup(gym({ nickname: null, description: null, notice: null }), {
      located: { lat: 40.05, lon: -80.05 },
      units: 'imperial',
    });
    expect(texts(popup)).toEqual([
      'Pinewood Public Library',
      '12 Maple Avenue, Pinewood',
      '0 ft',
      ' · ',
      'Directions',
    ]);
  });

  it('leaves out what the gym does not have, and never calls it an elite raid gym', () => {
    // A view of an older server still marked such gyms: the page shows no mark all the same.
    const popup = gymPopup({
      ...gym({ nickname: null, address: null, description: null, notice: null, regionIds: [2] }),
      ...{ elite: true },
    });
    expect(texts(popup)).toEqual(['Pinewood Public Library', 'Directions']);
  });

  it('keeps markup in what members wrote as text, never as HTML', () => {
    const name = '<img src=x onerror="alert(1)">';
    const popup = gymPopup(gym({ name, nickname: '<b>bold</b>' }));
    const element = renderNode(popup, fakeDocument());
    expect(element.children[0]).toMatchObject({ tag: 'strong', textContent: name });
    expect(element.children[1]).toMatchObject({ textContent: '<b>bold</b>' });
    expect(JSON.stringify(element)).not.toContain('innerHTML');
  });

  it('builds an element per node, with its class and attributes', () => {
    const element = renderNode(gymPopup(gym()), fakeDocument());
    expect(element).toMatchObject({ tag: 'div', className: 'gym-popup' });
    expect(element.children[2]).toMatchObject({ className: 'address' });
  });
});

describe('regionLabel', () => {
  it('keeps markup in a channel name as text, never as HTML', () => {
    const name = '<img src=x onerror="alert(1)">';
    const element = renderNode(regionLabel(name), fakeDocument());
    expect(element).toMatchObject({ tag: 'span', className: 'region-name', textContent: name });
    expect(element.children).toEqual([]);
  });
});
