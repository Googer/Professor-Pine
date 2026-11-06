import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, make } from '../../../test/support/fake-page.js';
import { showBoards } from './history-boards-ui.js';
import { showTally } from './history-tally-ui.js';

const GUILD = '412345678901234567';

/**
 * The history page's elements, made as they are asked for, and a server that answers every
 * question with `status`. `settled` is the first thing a section does with its answer: its status
 * written (other than "Loading…") or the section hidden.
 */
function page(status: number) {
  const elements = new Map<string, FakeElement>();
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const element = (id: string): FakeElement => {
    let found = elements.get(id);
    if (found === undefined) {
      found = make(id === 'tally-table' ? 'table' : 'div');
      const watched = found;
      let hidden = false;
      Object.defineProperty(watched, 'hidden', {
        get: () => hidden,
        set: (value: boolean) => {
          hidden = value;
          if (value && (id === 'tally' || id === 'boards')) settle();
        },
      });
      if (id.endsWith('-status')) {
        const replace = watched.replaceChildren.bind(watched);
        watched.replaceChildren = (...children: FakeElement[]) => {
          replace(...children);
          settle();
        };
        const text = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'textContent');
        Object.defineProperty(watched, 'textContent', {
          get: () => text?.get?.call(watched) as string | null,
          set: (value: string | null) => {
            text?.set?.call(watched, value);
            if (value !== 'Loading…') settle();
          },
        });
      }
      elements.set(id, found);
    }
    return found;
  };
  vi.stubGlobal('document', {
    getElementById: element,
    createElement: make,
  });
  vi.stubGlobal('location', { search: '', pathname: `/s/${GUILD}/history` });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: false,
      status,
      text: () => Promise.resolve(''),
    }),
  );
  return { element, settled };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the history page’s tally and boards when the member cannot see them (B9)', () => {
  const shows = [
    ['the region tally', 'tally', showTally],
    ['the boards', 'boards', showBoards],
  ] as const;

  for (const [name, id, show] of shows) {
    for (const status of [401, 403]) {
      it(`${name} hides, leaving the login line to raids by day (${String(status)})`, async () => {
        const { element, settled } = page(status);
        show(GUILD, 'discord');
        await settled;
        expect(element(id).hidden).toBe(true);
        expect(element(`${id}-status`).childNodes.some((child) => child.tag === 'a')).toBe(false);
      });
    }

    it(`${name} says what may pass`, async () => {
      const { element, settled } = page(503);
      show(GUILD, 'discord');
      await settled;
      expect(element(id).hidden).toBe(false);
      expect(element(`${id}-status`).textContent).toBe(
        'Discord cannot be reached just now. Try again in a moment.',
      );
    });
  }
});
