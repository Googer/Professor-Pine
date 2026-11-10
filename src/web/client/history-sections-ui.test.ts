import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeElement, make } from '../../../test/support/fake-page.js';
import { showBoards } from './history-boards-ui.js';
import { showDays } from './history-days-ui.js';
import { showTally } from './history-tally-ui.js';

const GUILD = '412345678901234567';

/**
 * The history page's elements, made as they are asked for, at the address `search`, and a server
 * that answers every question with `status` (a failure), or with what `answer` says of its
 * address. `settled` is the first thing a section does with its answer: its status written (other
 * than "Loading…") or the section hidden; `asking(test)` the first question whose address passes.
 */
function page(status: number, search = '', answer: (url: string) => number = () => status) {
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
  const location = { search, pathname: `/s/${GUILD}/history` };
  vi.stubGlobal('location', location);
  const replaced: string[] = [];
  vi.stubGlobal('history', {
    replaceState: (_state: unknown, _title: string, address: string) => {
      replaced.push(address);
      location.search = address.includes('?') ? address.slice(address.indexOf('?')) : '';
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        // The chart is never drawn here.
      }
    },
  );
  const asked: string[] = [];
  const waiting: Array<{ test: (url: string) => boolean; found: (url: string) => void }> = [];
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url);
    for (const one of waiting.filter((wait) => wait.test(url))) one.found(url);
    return Promise.resolve({
      ok: false,
      status: answer(url),
      text: () => Promise.resolve(''),
    });
  });
  const asking = (test: (url: string) => boolean): Promise<string> => {
    const already = asked.find(test);
    if (already !== undefined) return Promise.resolve(already);
    return new Promise((found) => {
      waiting.push({ test, found });
    });
  };
  return { element, settled, asked, asking, replaced };
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

describe('raids by day and the year in the address (W5)', () => {
  const days = (url: string) => url.includes('/api/history/days');

  it('asks for the newest year where the address names one before the game (2016)', async () => {
    const { asking, asked } = page(503, '?year=2015');
    showDays(GUILD, 'discord');
    await asking(days);
    expect(asked.filter(days)).toEqual([`/s/${GUILD}/api/history/days`]);
  });

  it('asks again without the year where the server refused it, the address without it', async () => {
    const { asking, asked, replaced } = page(503, '?year=2017&period=all', (url) =>
      url.includes('year=') ? 400 : 503,
    );
    showDays(GUILD, 'discord');
    await asking((url) => days(url) && !url.includes('year='));
    expect(asked.filter(days)).toEqual([
      `/s/${GUILD}/api/history/days?year=2017`,
      `/s/${GUILD}/api/history/days`,
    ]);
    expect(replaced).toEqual([`/s/${GUILD}/history?period=all`]);
  });
});
