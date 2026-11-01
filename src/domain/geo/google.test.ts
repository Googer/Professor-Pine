import { describe, expect, it } from 'vitest';
import { addressText } from './geodata.js';
import {
  geodataJson,
  addressLine,
  geodataParts,
  PLACE_TYPES,
  placesRadius,
  placesRequest,
  placesText,
  readGeocode,
  readPlaces,
} from './google.js';

/** A reverse geocoding answer in the shape Google documents, written by hand. */
const GEOCODE_ANSWER = {
  plus_code: { compound_code: 'C2R4+6J Pinewood, PA, USA' },
  results: [
    {
      address_components: [
        { long_name: '12', short_name: '12', types: ['street_number'] },
        { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['route'] },
        { long_name: 'Old Town', short_name: 'Old Town', types: ['neighborhood', 'political'] },
        { long_name: 'Pinewood', short_name: 'Pinewood', types: ['locality', 'political'] },
        {
          long_name: 'Pennsylvania',
          short_name: 'PA',
          types: ['administrative_area_level_1', 'political'],
        },
        { long_name: '15999', short_name: '15999', types: ['postal_code'] },
      ],
      formatted_address: '12 Maple Ave, Pinewood, PA 15999, USA',
      types: ['street_address'],
    },
    {
      address_components: [
        { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['Route'] },
        { long_name: 'Market Street', short_name: 'Market St', types: ['route'] },
        { long_name: 'Pinewood', short_name: 'Pinewood', types: ['locality', 'political'] },
      ],
      types: ['intersection'],
    },
    { address_components: 'nonsense' },
    null,
  ],
  status: 'OK',
};

describe('readGeocode', () => {
  it('collects the distinct short names of every type over every result', () => {
    expect(readGeocode(GEOCODE_ANSWER)).toEqual({
      kind: 'ok',
      components: {
        street_number: '12',
        route: 'Maple Ave Market St',
        neighborhood: 'Old Town',
        political: 'Old Town Pinewood PA',
        locality: 'Pinewood',
        administrative_area_level_1: 'PA',
        postal_code: '15999',
        formatted_address: '12 Maple Ave, Pinewood, PA 15999, USA',
      },
    });
  });

  it('reads an answer without results as an address of nothing', () => {
    expect(readGeocode({ results: [], status: 'ZERO_RESULTS' })).toEqual({
      kind: 'ok',
      components: {},
    });
    expect(readGeocode({ results: [], status: 'OK' })).toEqual({ kind: 'ok', components: {} });
  });

  it('tells a refused key from other failures', () => {
    expect(
      readGeocode({
        error_message: 'This API project is not authorized to use this API.',
        results: [],
        status: 'REQUEST_DENIED',
      }),
    ).toEqual({ kind: 'denied', message: 'This API project is not authorized to use this API.' });
    expect(readGeocode({ results: [], status: 'REQUEST_DENIED' })).toEqual({
      kind: 'denied',
      message: 'REQUEST_DENIED',
    });
    expect(readGeocode({ results: [], status: 'OVER_QUERY_LIMIT' })).toEqual({
      kind: 'failed',
      status: 'OVER_QUERY_LIMIT',
    });
    expect(readGeocode('<html>')).toEqual({ kind: 'failed', status: 'not an answer' });
    expect(readGeocode({})).toEqual({ kind: 'failed', status: 'no status' });
  });
});

describe('geodataJson and geodataParts', () => {
  it('stores the parts as the search and the legacy bot read them', () => {
    const reading = readGeocode(GEOCODE_ANSWER);
    if (reading.kind !== 'ok') throw new Error('not read');
    const stored = geodataJson(reading.components);
    expect(stored).toBe(
      '{"addressComponents":{"street_number":"12","route":"Maple Ave Market St",' +
        '"neighborhood":"Old Town","political":"Old Town Pinewood PA","locality":"Pinewood",' +
        '"administrative_area_level_1":"PA","postal_code":"15999",' +
        '"formatted_address":"12 Maple Ave, Pinewood, PA 15999, USA"}}',
    );
    // The address as Google writes it is for showing, never for the search.
    expect(addressLine(stored)).toBe('12 Maple Ave, Pinewood, PA 15999, USA');
    expect(addressText(stored)).toBe('Maple Ave Market St Old Town Pinewood 15999');
    expect(geodataParts(stored).slice(0, 2)).toEqual([
      { type: 'street_number', value: '12' },
      { type: 'route', value: 'Maple Ave Market St' },
    ]);
  });

  it('makes one line of the parts of a row that has no written address', () => {
    const parts = (components: Record<string, unknown>) =>
      addressLine(JSON.stringify({ addressComponents: components }));
    expect(
      parts({
        street_number: '12',
        route: 'Maple Avenue',
        political: 'Old Town Pinewood PA',
        locality: 'Pinewood',
        administrative_area_level_1: 'PA',
        country: 'US',
        postal_code: '15999',
      }),
    ).toBe('12 Maple Avenue, Pinewood, PA 15999');
    // Several street numbers (the legacy bot joined those of every result) say nothing.
    expect(
      parts({ street_number: '2982 2950 2918', route: 'Forbes Ave', locality: 'Oakland' }),
    ).toBe('Forbes Ave, Oakland');
    expect(parts({ street_number: '12', postal_code: ['15999'] })).toBe('15999');
    expect(parts({ political: 'PA', country: 'US' })).toBe('');
    expect(addressLine(null)).toBe('');
    expect(addressLine('not json')).toBe('');
    expect(parts({ formatted_address: '  ', locality: 'Pinewood' })).toBe('Pinewood');
  });

  it('stores nothing for an address of nothing', () => {
    expect(geodataJson({})).toBeNull();
  });

  it('shows nothing of a stored text it cannot read', () => {
    expect(geodataParts(null)).toEqual([]);
    expect(geodataParts('not json')).toEqual([]);
    expect(geodataParts('{"other":1}')).toEqual([]);
    expect(geodataParts('{"addressComponents":"x"}')).toEqual([]);
    // Older rows may hold lists; an empty value is left out.
    expect(geodataParts('{"addressComponents":{"route":["A St","B St"],"premise":" "}}')).toEqual([
      { type: 'route', value: 'A St B St' },
    ]);
  });
});

describe('readPlaces', () => {
  /** A Nearby Search answer of the Places API (New), written by hand. */
  const answer = {
    places: [
      {
        types: ['bakery', 'food', 'store'],
        displayName: { text: 'Corner Bakery', languageCode: 'en' },
      },
      { types: ['dentist', 'health'], displayName: { text: ' Maple   Dental ' } },
      { types: ['transit_station'], displayName: { text: 'Maple Ave at Market St' } },
      { types: ['cafe'], displayName: { text: 'Corner Bakery' } },
      { types: ['park'], displayName: {} },
      { types: ['park'] },
      { displayName: { text: 'No Types' } },
      'nonsense',
    ],
  };

  it('keeps the names of the places of a kind worth keeping, each once, in order', () => {
    expect(readPlaces(answer)).toEqual(['Corner Bakery', 'Maple Dental']);
  });

  it('reads an answer without places as none', () => {
    expect(readPlaces({})).toEqual([]);
    expect(readPlaces({ places: 'x' })).toEqual([]);
    expect(readPlaces(null)).toEqual([]);
  });

  it('stores the names joined by spaces, and nothing for none', () => {
    expect(placesText(['Corner Bakery', 'Maple Dental'])).toBe('Corner Bakery Maple Dental');
    expect(placesText([])).toBeNull();
  });

  it('has the legacy list of kinds', () => {
    expect(PLACE_TYPES.size).toBe(96);
    expect(PLACE_TYPES.has('library')).toBe(true);
    expect(PLACE_TYPES.has('transit_station')).toBe(false);
  });
});

describe('placesRadius and placesRequest', () => {
  it('looks half the way to the nearest gym, within its bounds', () => {
    expect(placesRadius(300)).toBe(150);
    expect(placesRadius(20)).toBe(25);
    expect(placesRadius(0)).toBe(25);
    expect(placesRadius(5_000)).toBe(500);
    expect(placesRadius(undefined)).toBe(500);
    expect(placesRadius(Number.NaN)).toBe(500);
  });

  it('asks for twenty places in a circle around the point', () => {
    expect(placesRequest({ lat: 40.44, lon: -79.99 }, 150)).toEqual({
      maxResultCount: 20,
      languageCode: 'en',
      locationRestriction: {
        circle: { center: { latitude: 40.44, longitude: -79.99 }, radius: 150 },
      },
    });
  });
});
