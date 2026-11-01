import { describe, expect, it } from 'vitest';
import { ADDRESS_PARTS, addressText } from './geodata.js';

describe('addressText', () => {
  it('joins the parts that tell one gym from another, in a fixed order', () => {
    const geodata = JSON.stringify({
      addressComponents: {
        street_number: '4400',
        route: 'Forbes Avenue',
        neighborhood: 'Oakland',
        locality: 'Pittsburgh',
        administrative_area_level_1: 'Pennsylvania',
        country: 'United States',
        postal_code: '15213',
        point_of_interest: 'Carnegie Library',
      },
    });
    expect(addressText(geodata)).toBe('Forbes Avenue Oakland Pittsburgh 15213 Carnegie Library');
  });

  it('knows twelve parts', () => {
    expect(ADDRESS_PARTS).toHaveLength(12);
  });

  it('accepts a part that is a list', () => {
    const geodata = JSON.stringify({ addressComponents: { route: ['Main Street', 'Route 8'] } });
    expect(addressText(geodata)).toBe('Main Street Route 8');
  });

  it('skips parts that are not text', () => {
    const geodata = JSON.stringify({
      addressComponents: {
        route: 5,
        locality: null,
        premise: { name: 'x' },
        neighborhood: 'Shadyside',
      },
    });
    expect(addressText(geodata)).toBe('Shadyside');
  });

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['text that is not JSON', 'not json'],
    ['a JSON string', '"route"'],
    ['a JSON list', '[1, 2]'],
    ['an object without address parts', '{"lat": 1}'],
    ['address parts that are not an object', '{"addressComponents": "Forbes Avenue"}'],
    ['address parts that are null', '{"addressComponents": null}'],
  ])('gives an empty text for %s', (_what, geodata) => {
    expect(addressText(geodata)).toBe('');
  });
});
