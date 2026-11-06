import { describe, expect, it } from 'vitest';
import { TRAIN_WEB_MIN_RIDERS, trainShownOnWeb } from './trains-on-web.js';

describe('trainShownOnWeb: which ended trains the web may show (G2)', () => {
  it('shows a train three members or more came to, by Here and Done together', () => {
    expect(TRAIN_WEB_MIN_RIDERS).toBe(3);
    expect(trainShownOnWeb({ here: 3, done: 0 })).toBe(true);
    expect(trainShownOnWeb({ here: 1, done: 2 })).toBe(true);
    expect(trainShownOnWeb({ here: 0, done: 12 })).toBe(true);
  });

  it('leaves out a train one or two members ran: its route often traces a home', () => {
    expect(trainShownOnWeb({ here: 0, done: 0 })).toBe(false);
    expect(trainShownOnWeb({ here: 1, done: 1 })).toBe(false);
    expect(trainShownOnWeb({ here: 0, done: 2 })).toBe(false);
  });
});
