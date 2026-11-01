import { describe, expect, it } from 'vitest';
import { TRAIN_KINDS } from '../party/party.js';
import { TRAIN_KIND_WORDS } from './party-data.js';
import { MAP_TRAIN_KINDS } from './train-data.js';

// The page's copy of the kinds has no import of the server's code: kept to the domain's here.
describe('the train kinds a page reads (plan 8X-5)', () => {
  it('are the kinds of trains, in the order /train kind: offers them, each with its words', () => {
    expect(MAP_TRAIN_KINDS).toEqual(TRAIN_KINDS);
    expect(Object.keys(TRAIN_KIND_WORDS)).toEqual([...TRAIN_KINDS]);
  });
});
