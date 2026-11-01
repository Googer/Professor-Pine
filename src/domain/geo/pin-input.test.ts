import { describe, expect, it } from 'vitest';
import { readPin } from './pin-input.js';

const pin = (lat: number, lon: number, linkName: string | null = null) => ({
  kind: 'pin',
  point: { lat, lon },
  linkName,
});

describe('readPin', () => {
  it.each([
    ['40.43812, -79.92306'],
    ['40.43812,-79.92306'],
    ['  40.43812 -79.92306  '],
    ['40.43812° N, 79.92306° W'],
  ])('reads typed coordinates %j', (text) => {
    expect(readPin(text)).toEqual(pin(40.43812, -79.92306));
  });

  it('reads geo: addresses, with the label a phone gives the place', () => {
    expect(readPin('geo:40.43812,-79.92306')).toEqual(pin(40.43812, -79.92306));
    expect(readPin('geo:40.43812,-79.92306;u=35')).toEqual(pin(40.43812, -79.92306));
    // Android shares a place as 0,0 with the place in its question.
    expect(readPin('geo:0,0?q=40.43812,-79.92306(Blue%20Tent)')).toEqual(
      pin(40.43812, -79.92306, 'Blue Tent'),
    );
    expect(readPin('GEO:40.43812,-79.92306?z=17')).toEqual(pin(40.43812, -79.92306));
    expect(readPin('geo:95,10')).toEqual({ kind: 'out-of-range' });
  });

  it('keeps a link’s name to 100 characters, never half of an emoji', () => {
    // The emoji takes the 100th and 101st code units: it is left out whole.
    const label = `${'a'.repeat(99)}🦊 Den`;
    expect(readPin(`geo:0,0?q=40.43812,-79.92306(${label})`)).toEqual(
      pin(40.43812, -79.92306, 'a'.repeat(99)),
    );
  });

  it('reads Google Maps addresses: the pin of a place first, and the name it gives the place', () => {
    // As the browser shows a place a member opened: the map's centre (`@`) is beside the pin.
    expect(
      readPin(
        'https://www.google.com/maps/place/Blue+Tent/@40.4385,-79.9241,17z/data=!3m1!4b1!4m6' +
          '!3m5!1s0x8834f2:0x1c5!8m2!3d40.43812!4d-79.92306!16s%2Fg%2F11c1',
      ),
    ).toEqual(pin(40.43812, -79.92306, 'Blue Tent'));
    expect(
      readPin('https://www.google.com/maps/place/Caf%C3%A9+%C3%89lan/@40.43812,-79.92306,17z/'),
    ).toEqual(pin(40.43812, -79.92306, 'Café Élan'));
    // A place given by its coordinates names nothing.
    expect(
      readPin(
        "https://www.google.com/maps/place/40%C2%B026'17.2%22N+79%C2%B055'23.0%22W/@40.4,-79.9,17z",
      ),
    ).toMatchObject({ kind: 'pin', linkName: null });
    // A bare map: its centre.
    expect(readPin('https://www.google.com/maps/@40.43812,-79.92306,17z')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://www.google.com/maps?q=40.43812,-79.92306')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://www.google.com/maps/search/?api=1&query=40.43812%2C-79.92306')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://maps.google.com/?ll=40.43812,-79.92306&z=16')).toEqual(
      pin(40.43812, -79.92306),
    );
  });

  it('reads Apple Maps: its place, coordinates it was asked for, or the middle of a bare map', () => {
    expect(readPin('https://maps.apple.com/?ll=40.43812,-79.92306&q=Dropped%20Pin')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://maps.apple.com/?q=40.43812,-79.92306')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://maps.apple.com/?sll=40.43812,-79.92306')).toEqual(
      pin(40.43812, -79.92306),
    );
    // A search near a point shows no one place, as Google's search link does not.
    expect(readPin('https://maps.apple.com/?sll=40.43812,-79.92306&q=coffee')).toEqual({
      kind: 'no-point',
    });
  });

  it('reads OpenStreetMap: the marker first, else the middle of the map', () => {
    expect(
      readPin(
        'https://www.openstreetmap.org/?mlat=40.43812&mlon=-79.92306#map=17/40.43900/-79.92400',
      ),
    ).toEqual(pin(40.43812, -79.92306));
    expect(readPin('https://www.openstreetmap.org/#map=17/40.43812/-79.92306')).toEqual(
      pin(40.43812, -79.92306),
    );
    expect(readPin('https://openstreetmap.org/#map=17/95.1/-79.9')).toEqual({
      kind: 'out-of-range',
    });
  });

  it('names a short link as one, and follows none', () => {
    for (const text of [
      'https://maps.app.goo.gl/AbC123xyz',
      'maps.app.goo.gl/AbC123xyz?g_st=ic',
      'https://goo.gl/maps/AbC123',
      // What Apple Maps and OpenStreetMap share.
      'https://maps.apple/p/AbC123xyz',
      'https://osm.org/go/ZX3c~-',
    ]) {
      expect(readPin(text)).toEqual({ kind: 'short-link' });
    }
  });

  it.each([
    // A search, with the map's middle or without: the results are not one place.
    'https://www.google.com/maps/search/coffee/@40.4407,-79.9558,15z',
    'https://www.google.com/maps/search/?api=1&query=coffee',
    'https://www.google.com/maps?q=coffee&ll=40.44,-79.95',
    // Street View: where the camera stood, not a place.
    'https://www.google.com/maps/@40.4440,-79.9532,3a,75y,90t/data=!3m6!1e1',
    'https://www.google.com/maps/@?api=1&map_action=map&center=40.44,-79.95&zoom=15',
    'https://www.google.com/maps/place/Big+Fountain',
    'https://maps.apple.com/?q=coffee',
    'https://www.openstreetmap.org/',
    // A phone shares a place it knows only by its address so.
    'geo:0,0?q=20+Market+Street,+Pittsburgh',
    'geo:0,0',
  ])('reads no place in the maps link %j', (text) => {
    expect(readPin(text)).toEqual({ kind: 'no-point' });
  });

  it('refuses numbers that are no place on earth', () => {
    expect(readPin('91.5, 10.25')).toEqual({ kind: 'out-of-range' });
    expect(readPin('https://www.google.com/maps?q=40.4,-190')).toEqual({ kind: 'out-of-range' });
  });

  it.each([
    'Fountain Square',
    '40,44',
    '40.43812',
    'https://example.com/?q=40.43812,-79.92306',
    'geo:',
    'geo:a,b',
  ])('reads no pin in %j: that is a name to search for, or nothing', (text) => {
    expect(readPin(text)).toEqual({ kind: 'none' });
  });
});
