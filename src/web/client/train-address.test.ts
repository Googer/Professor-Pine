import { describe, expect, it } from 'vitest';
import { addressWithoutTrain, loginNext, trainOfAddress } from './train-address.js';

const MAP = '/s/412345678901234567/map';

describe('the map’s address of an ended train (plan 8H-7B, G4)', () => {
  it('reads the train a record’s id names, digits only', () => {
    expect(trainOfAddress('?train=42')).toBe(42);
    expect(trainOfAddress('?region=3&train=42')).toBe(42);
    for (const search of [
      '',
      '?train=',
      '?train=0',
      '?train=07',
      '?train=4x',
      '?train=1e3',
      '?train=-1',
    ]) {
      expect(trainOfAddress(search), search).toBeUndefined();
    }
    expect(trainOfAddress(`?train=${'9'.repeat(16)}`)).toBeUndefined();
  });

  it('drops the train from the address once the map took it, keeping the rest', () => {
    expect(addressWithoutTrain(MAP, '?train=42', '')).toBe(MAP);
    expect(addressWithoutTrain(MAP, '?edit=regions&train=42', '#x')).toBe(`${MAP}?edit=regions#x`);
  });

  it('passes the train to the login of the map, and nothing else of the query', () => {
    expect(loginNext(MAP, '?train=42')).toBe(`${MAP}?train=42`);
    expect(loginNext(MAP, '?login=failed&train=42&x=1')).toBe(`${MAP}?train=42`);
    expect(loginNext(MAP, '?x=1')).toBe(MAP);
    expect(loginNext(MAP, '?train=nope')).toBe(MAP);
    // Another page than the map keeps its path alone.
    expect(loginNext('/s/412345678901234567/history', '?train=42')).toBe(
      '/s/412345678901234567/history',
    );
  });
});
