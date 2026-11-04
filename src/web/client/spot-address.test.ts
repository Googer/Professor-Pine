import { describe, expect, it } from 'vitest';
import { SpotAddresses, type SpotAddressesDeps } from './spot-address.js';

/** Just enough of an element for a popup's head: its class, text, children, and a place in the page. */
class FakeElement {
  className = '';
  textContent: string | null = '';
  isConnected = true;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  constructor(readonly tag: string) {}
  setAttribute(): void {}
  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  /** The first element below of a class (`.name`, `.address`): all the selectors used. */
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.className.split(' ').includes(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  after(node: FakeElement): void {
    const parent = this.parent;
    if (!parent) return;
    node.parent = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
}

const document = {
  createElement: (tag: string) => new FakeElement(tag),
} as unknown as SpotAddressesDeps['document'];

/** A Power Spot's popup as `placeHead` draws it: its name, then the map's line. */
function spotPopup(): FakeElement {
  const popup = new FakeElement('div');
  popup.className = 'place-popup';
  const name = new FakeElement('strong');
  name.className = 'name';
  name.textContent = 'Lake Gazebo';
  const line = new FakeElement('div');
  line.className = 'map-line';
  popup.append(name, line);
  return popup;
}

const classes = (popup: FakeElement) => popup.children.map((child) => child.className);
const addressText = (popup: FakeElement) => popup.querySelector('.address')?.textContent;
const asHtml = (popup: FakeElement) => popup as unknown as HTMLElement;

/** A server that answers what `answers` says for each spot, its questions recorded. */
function server(answers: Record<string, string | null | Error>) {
  const asked: string[] = [];
  const pending: Array<() => void> = [];
  const ask = (id: string): Promise<string | null> => {
    asked.push(id);
    return new Promise((resolve, reject) => {
      pending.push(() => {
        const answer = answers[id] ?? null;
        if (answer instanceof Error) reject(answer);
        else resolve(answer);
      });
    });
  };
  /** Answers every question on its way. */
  const answer = () => {
    for (const run of pending.splice(0)) run();
  };
  return { ask, asked, answer };
}

describe("a Power Spot's address on the page (SpotAddresses)", () => {
  it('asks for it as the popup opens and draws the line under the name when it comes', async () => {
    const google = server({ 'spot-1': '600 Grant St, Pittsburgh' });
    const heard: unknown[] = [];
    const addresses = new SpotAddresses({
      ask: google.ask,
      heard: (id, address) => heard.push([id, address]),
      document,
    });
    const popup = spotPopup();
    const filled = addresses.fill(asHtml(popup), { id: 'spot-1' });
    // Nothing shown while it waits.
    expect(classes(popup)).toEqual(['name', 'map-line']);
    google.answer();
    await filled;
    expect(classes(popup)).toEqual(['name', 'address', 'map-line']);
    expect(addressText(popup)).toBe('600 Grant St, Pittsburgh');
    expect(heard).toEqual([['spot-1', '600 Grant St, Pittsburgh']]);
    // The next popup of that spot has it at once, nothing asked again.
    const again = spotPopup();
    void addresses.fill(asHtml(again), { id: 'spot-1' });
    expect(addressText(again)).toBe('600 Grant St, Pittsburgh');
    expect(google.asked).toEqual(['spot-1']);
  });

  it('asks once for a spot whose popups open while the answer is on its way', async () => {
    const google = server({ 'spot-1': '600 Grant St' });
    const addresses = new SpotAddresses({ ask: google.ask, document });
    const [first, second] = [spotPopup(), spotPopup()];
    const filled = [
      addresses.fill(asHtml(first), { id: 'spot-1' }),
      addresses.fill(asHtml(second), { id: 'spot-1' }),
    ];
    google.answer();
    await Promise.all(filled);
    expect(google.asked).toEqual(['spot-1']);
    expect([addressText(first), addressText(second)]).toEqual(['600 Grant St', '600 Grant St']);
  });

  it('draws nothing in a popup closed meanwhile, nor where no address came', async () => {
    const google = server({ 'spot-1': '600 Grant St', 'spot-2': null });
    const addresses = new SpotAddresses({ ask: google.ask, document });
    const closed = spotPopup();
    const none = spotPopup();
    const filled = [
      addresses.fill(asHtml(closed), { id: 'spot-1' }),
      addresses.fill(asHtml(none), { id: 'spot-2' }),
    ];
    closed.isConnected = false;
    google.answer();
    await Promise.all(filled);
    expect(classes(closed)).toEqual(['name', 'map-line']);
    expect(classes(none)).toEqual(['name', 'map-line']);
    // None came: not asked again while the page lives.
    void addresses.fill(asHtml(spotPopup()), { id: 'spot-2' });
    expect(google.asked).toEqual(['spot-1', 'spot-2']);
  });

  it('asks again after a question that failed', async () => {
    const google = server({ 'spot-1': new Error('429') });
    const addresses = new SpotAddresses({ ask: google.ask, document });
    const popup = spotPopup();
    const filled = addresses.fill(asHtml(popup), { id: 'spot-1' });
    google.answer();
    await filled;
    expect(classes(popup)).toEqual(['name', 'map-line']);
    void addresses.fill(asHtml(spotPopup()), { id: 'spot-1' });
    expect(google.asked).toEqual(['spot-1', 'spot-1']);
  });

  it('asks nothing for a spot with an address, a pin, or a popup that shows one already', () => {
    const google = server({});
    const addresses = new SpotAddresses({ ask: google.ask, document });
    void addresses.fill(asHtml(spotPopup()), { id: 'spot-1', address: '1 Park Lane' });
    void addresses.fill(asHtml(spotPopup()), { id: null });
    const shown = spotPopup();
    const line = new FakeElement('div');
    line.className = 'address';
    shown.children[0]?.after(line);
    void addresses.fill(asHtml(shown), { id: 'spot-3' });
    void addresses.fill(undefined, { id: 'spot-4' });
    expect(google.asked).toEqual([]);
  });
});
