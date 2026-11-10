import type { SpotAddressView } from '../../domain/web/max-data.js';
import type { ShownPlaces } from './places-ui.js';
import { addressLine, renderNode } from './popup.js';

/**
 * A Power Spot's address on the map (design `2026-11-04-power-spot-address-design.md`): Wayfarer
 * gives Power Spots none, so a popup of one without an address asks the server
 * (`/api/powerspots/<id>/address`, which looks it up of Google within a budget) as it opens,
 * whichever way it opens: its dot, Find's results and the list of what is on, and a battle's
 * popup at it. One helper does the asking for all of them: one question per spot while the page
 * lives (a second popup meanwhile waits for the same answer; a question that failed is asked
 * again at the next popup), the line drawn under the popup's name when the answer comes if the
 * popup is still open, nothing shown while it waits or when no address comes. An address found
 * is told to `heard` (the places' last list keeps it, `ShownPlaces.addressFound`).
 */

/** What a popup is to the helper: its elements, and whether it is still in the page. */
type Popup = Pick<HTMLElement, 'isConnected' | 'querySelector'>;

export interface SpotAddressesDeps {
  /** The server's answer for a spot: its address line, or null for none. */
  ask(spotId: string): Promise<string | null>;
  /** An address came for a spot. */
  heard?(spotId: string, address: string): void;
  document: { createElement(tag: string): HTMLElement };
  /** Default `Date.now`. */
  now?: () => number;
}

/** A spot whose question failed is not asked again for this long (a minute). */
export const FAILED_AGAIN_MS = 60_000;

export class SpotAddresses {
  /** The answers, by spot: an address, or null where none came. */
  private readonly known = new Map<string, string | null>();
  private readonly asking = new Map<string, Promise<string | null>>();
  /** When a spot's last question failed: none is asked again until `FAILED_AGAIN_MS` after. */
  private readonly failedAt = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly deps: SpotAddressesDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Fills a Power Spot's popup in with the spot's address, asked for where the page has none:
   * at once when it is known, else when the answer comes and the name line it was asked under is
   * still in the page (a form that took the popup's place took it). A popup without a name line
   * (a battle's post) asks nothing: nothing would be drawn there. A spot whose question failed
   * is not asked again for `FAILED_AGAIN_MS`. Its promise settles once that is done (or nothing
   * was to be done); it never rejects.
   */
  fill(
    popup: Popup | undefined,
    spot: { id: string | null | undefined; address?: string | null },
  ): Promise<void> {
    const { id } = spot;
    if (!popup || !id || (spot.address ?? '').trim() !== '') return Promise.resolve();
    const name = popup.querySelector('.name');
    if (!name || popup.querySelector('.address')) return Promise.resolve();
    if (this.known.has(id)) {
      const known = this.known.get(id);
      if (known) this.draw(name, known);
      return Promise.resolve();
    }
    const failed = this.failedAt.get(id);
    if (failed !== undefined && this.now() - failed < FAILED_AGAIN_MS) return Promise.resolve();
    return this.answerOf(id).then((address) => {
      if (address && popup.isConnected && name.isConnected && !popup.querySelector('.address')) {
        this.draw(name, address);
      }
    });
  }

  /** The answer for a spot, asked once at a time; none for a question that failed. */
  private answerOf(id: string): Promise<string | null> {
    const on = this.asking.get(id);
    if (on) return on;
    const answer = this.deps
      .ask(id)
      .then((address) => {
        const line = address === null || address.trim() === '' ? null : address;
        this.known.set(id, line);
        this.failedAt.delete(id);
        if (line) this.deps.heard?.(id, line);
        return line;
      })
      .catch(() => {
        this.failedAt.set(id, this.now());
        return null;
      })
      .finally(() => {
        this.asking.delete(id);
      });
    this.asking.set(id, answer);
    return answer;
  }

  /** The address line under the popup's name line, as `placeHead` draws it. */
  private draw(name: Element, address: string): void {
    const [node] = addressLine({ address });
    if (!node) return;
    name.after(renderNode(node, this.deps.document));
  }
}

/**
 * The map's helper (`main.ts`): it asks the server's route of the map's server
 * (`SpotAddressView`, through the page's `getJson`) and keeps an address that came in the places'
 * last list (`ShownPlaces.addressFound`).
 */
export function pageSpotAddresses(page: {
  guild: string;
  getJson: <T>(url: string) => Promise<T>;
  places: Pick<ShownPlaces, 'addressFound'>;
  document: SpotAddressesDeps['document'];
}): SpotAddresses {
  return new SpotAddresses({
    ask: async (id) =>
      (
        await page.getJson<SpotAddressView>(
          `/s/${page.guild}/api/powerspots/${encodeURIComponent(id)}/address`,
        )
      ).address,
    heard: (id, address) => {
      page.places.addressFound(id, address);
    },
    document: page.document,
  });
}
