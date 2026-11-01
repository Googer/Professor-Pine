/**
 * The buttons of the page `/userscript` (plan 8W-P), in their pure parts: what a button's POST
 * sends, whether a press is the first of two, and what an answer says. The page's script
 * (`userscript.ts`) wires them to the DOM.
 */

/** A button's `data-` attributes, as the page draws them. */
export interface ButtonData {
  action?: string;
  id?: string;
  from?: string;
  /** The asking a decision's button was drawn for (`askedAt`, epoch ms). */
  asked?: string;
  /** The words of a button that asks a second press; `armed` once it was pressed once. */
  confirm?: string;
  armed?: string;
}

/** What the page says of a request without a community line, before anything is sent. */
export const NEED_COMMUNITY = 'Say which community you run Pine for.';
/** What the page says when the answer says nothing it can read. */
export const NOT_THROUGH = 'That did not get through; try again.';

const STATES = ['asked', 'approved', 'refused', 'revoked'];
const DECISIONS = ['approve', 'refuse', 'revoke'];

/** The body of a button's POST, a refusal said in the page, or undefined for no such button. */
export function bodyOf(
  data: ButtonData,
  community: string,
): { body: Record<string, unknown> } | { refused: string } | undefined {
  switch (data.action) {
    case 'ask':
      return community.trim() === ''
        ? { refused: NEED_COMMUNITY }
        : { body: { action: 'ask', community } };
    case 'new-link':
    case 'my-link':
      return { body: { action: data.action } };
    default: {
      if (data.action === undefined || !DECISIONS.includes(data.action)) return undefined;
      const id = Number(data.id);
      if (!/^\d+$/.test(data.id ?? '') || !Number.isSafeInteger(id)) return undefined;
      if (data.from === undefined || !STATES.includes(data.from)) return undefined;
      const askedAt = Number(data.asked);
      if (!/^\d+$/.test(data.asked ?? '') || !Number.isSafeInteger(askedAt)) return undefined;
      return { body: { action: data.action, id, from: data.from, askedAt } };
    }
  }
}

/** Whether a press sends, or only arms a button that asks a second press ("Press again to …"). */
export function pressed(data: ButtonData): 'arm' | 'send' {
  return data.confirm !== undefined && data.armed !== 'yes' ? 'arm' : 'send';
}

/** What the page needs of the tab's `sessionStorage`. */
export interface PageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where the words of a done press wait for the page loaded anew. */
export const DONE_KEY = 'pine-userscript-done';

/**
 * Keeps the words of a done press for the page loaded anew after it (`get`: `() =>
 * window.sessionStorage`, which may throw itself). Where the browser keeps nothing, the words are
 * lost and the page still loads anew.
 */
export function keepDone(get: () => PageStorage, text: string): void {
  try {
    get().setItem(DONE_KEY, text);
  } catch {
    // Not kept: the page shows the state as it is now all the same.
  }
}

/**
 * The words a done press kept for this load, taken away so that the next load does not say them
 * again; undefined when there are none, or when they cannot be taken away (they would be said at
 * every load).
 */
export function takeDone(get: () => PageStorage): string | undefined {
  try {
    const storage = get();
    const text = storage.getItem(DONE_KEY);
    if (text === null) return undefined;
    storage.removeItem(DONE_KEY);
    return text;
  } catch {
    return undefined;
  }
}

/** Whether an answer of the page's POST was done, and the words to say. */
export function answerWords(status: number, json: unknown): { done: boolean; text: string } {
  const answer = json as { ok?: unknown; text?: unknown } | undefined;
  if (answer && typeof answer.text === 'string') {
    return { done: answer.ok === true && status >= 200 && status < 300, text: answer.text };
  }
  if (status === 403) {
    return {
      done: false,
      text: 'This page is out of date, or your login ended: reload the page and try again.',
    };
  }
  if (status === 429) return { done: false, text: 'Too many requests: try again in a minute.' };
  return { done: false, text: NOT_THROUGH };
}
