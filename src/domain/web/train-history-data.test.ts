import { describe, expect, it } from 'vitest';
import { localPath } from '../../web/local-path.js';
import { trainMapLinkOf, trainMapPath } from './train-history-data.js';

describe('the map’s address of an ended train (plan 8H-7B)', () => {
  it('is the server’s map with the record’s id, which a login may return to', () => {
    const path = trainMapPath('412345678901234567', 42);
    expect(path).toBe('/s/412345678901234567/map?train=42');
    expect(localPath(path)).toBe(path);
  });

  it('is whole on the instance’s public address, for the post’s link', () => {
    expect(trainMapLinkOf('https://map.example.test')('412345678901234567', 42)).toBe(
      'https://map.example.test/s/412345678901234567/map?train=42',
    );
  });
});
