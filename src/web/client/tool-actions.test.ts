import { describe, expect, it } from 'vitest';
import {
  answerWords,
  bodyOf,
  DONE_KEY,
  keepDone,
  NEED_COMMUNITY,
  pressed,
  takeDone,
  type PageStorage,
} from './tool-actions.js';

/** A tab's storage in memory, as `sessionStorage` keeps it. */
function memoryStorage(): PageStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
}

describe('the words of a done press, kept across its reload', () => {
  it('are said once on the page loaded anew, and not on the next load', () => {
    const storage = memoryStorage();
    keepDone(() => storage, 'Approved.');
    expect([...storage.kept.keys()]).toEqual([DONE_KEY]);
    expect(takeDone(() => storage)).toBe('Approved.');
    expect(takeDone(() => storage)).toBeUndefined();
    expect(storage.kept.size).toBe(0);
  });

  it('say nothing on a load that no press came before', () => {
    expect(takeDone(() => memoryStorage())).toBeUndefined();
  });

  it('are lost, never thrown, where the browser keeps nothing for the page', () => {
    const forbidden = (): PageStorage => {
      throw new Error('SecurityError');
    };
    expect(() => keepDone(forbidden, 'Approved.')).not.toThrow();
    expect(takeDone(forbidden)).toBeUndefined();
    const full: PageStorage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => keepDone(() => full, 'Approved.')).not.toThrow();
  });

  it('are not said when they cannot be taken away, so that no reload says them again', () => {
    const storage = memoryStorage();
    keepDone(() => storage, 'Revoked: their link stops now.');
    const stuck: PageStorage = {
      ...storage,
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(takeDone(() => stuck)).toBeUndefined();
  });
});

describe('bodyOf', () => {
  it('sends the community line with a request, and nothing without one', () => {
    expect(bodyOf({ action: 'ask' }, '  Pinewood ')).toEqual({
      body: { action: 'ask', community: '  Pinewood ' },
    });
    expect(bodyOf({ action: 'ask' }, ' \n ')).toEqual({ refused: NEED_COMMUNITY });
  });

  it('sends a new link and the owner’s link as they are', () => {
    expect(bodyOf({ action: 'new-link' }, '')).toEqual({ body: { action: 'new-link' } });
    expect(bodyOf({ action: 'my-link' }, '')).toEqual({ body: { action: 'my-link' } });
  });

  it('sends a decision with its row, and the state and asking its button was drawn with', () => {
    expect(
      bodyOf({ action: 'approve', id: '12', from: 'asked', asked: '1792000000000' }, ''),
    ).toEqual({
      body: { action: 'approve', id: 12, from: 'asked', askedAt: 1792000000000 },
    });
    expect(bodyOf({ action: 'revoke', id: '3', from: 'approved', asked: '5' }, '')).toEqual({
      body: { action: 'revoke', id: 3, from: 'approved', askedAt: 5 },
    });
  });

  it('sends nothing for a button it does not know or a decision without its row', () => {
    expect(bodyOf({ action: 'fly' }, '')).toBeUndefined();
    expect(bodyOf({ action: 'approve', from: 'asked' }, '')).toBeUndefined();
    expect(bodyOf({ action: 'approve', id: 'x', from: 'asked' }, '')).toBeUndefined();
    expect(bodyOf({ action: 'approve', id: '1', from: 'gone', asked: '5' }, '')).toBeUndefined();
    expect(bodyOf({ action: 'approve', id: '1', from: 'asked' }, '')).toBeUndefined();
    expect(
      bodyOf({ action: 'approve', id: '1', from: 'asked', asked: 'soon' }, ''),
    ).toBeUndefined();
    expect(bodyOf({}, '')).toBeUndefined();
  });
});

describe('pressed', () => {
  it('sends at once a button that asks no second press', () => {
    expect(pressed({ action: 'approve' })).toBe('send');
  });

  it('arms a button that asks a second press, and sends at the second', () => {
    expect(pressed({ action: 'revoke', confirm: 'Press again to revoke' })).toBe('arm');
    expect(pressed({ action: 'revoke', confirm: 'Press again to revoke', armed: 'yes' })).toBe(
      'send',
    );
  });
});

describe('answerWords', () => {
  it('says what the server said, done or not', () => {
    expect(answerWords(200, { ok: true, text: 'Approved.' })).toEqual({
      done: true,
      text: 'Approved.',
    });
    expect(answerWords(409, { ok: false, text: 'This request changed meanwhile.' })).toEqual({
      done: false,
      text: 'This request changed meanwhile.',
    });
  });

  it('says what a refusal without words means', () => {
    expect(answerWords(403, undefined).text).toBe(
      'This page is out of date, or your login ended: reload the page and try again.',
    );
    expect(answerWords(429, undefined).text).toBe('Too many requests: try again in a minute.');
    expect(answerWords(500, undefined)).toEqual({
      done: false,
      text: 'That did not get through; try again.',
    });
    expect(answerWords(200, { text: 7 })).toEqual({
      done: false,
      text: 'That did not get through; try again.',
    });
  });
});
