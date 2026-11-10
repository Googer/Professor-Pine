import { describe, expect, it } from 'vitest';
import { LOCATION_FORMS, readLocation } from './location-input.js';

const point = (lat: number, lon: number) => ({ kind: 'point', point: { lat, lon } });
/** A point read from where a map was centred. */
const near = (lat: number, lon: number) => ({ ...point(lat, lon), approximate: true });

describe('readLocation', () => {
  it.each([
    ['40.4406,-79.9959', 40.4406, -79.9959],
    ['40.4406, -79.9959', 40.4406, -79.9959],
    ['  40.4406 -79.9959 ', 40.4406, -79.9959],
    ['-33.8568;151.2153', -33.8568, 151.2153],
    ['40.0, -80', 40, -80],
    ['40 -80.5', 40, -80.5],
    ['+40.5,+10.25', 40.5, 10.25],
    ['40.4406° N, 79.9959° W', 40.4406, -79.9959],
    ['33.8568 S 151.2153 E', -33.8568, 151.2153],
  ])('reads the coordinates %s', (text, lat, lon) => {
    expect(readLocation(text)).toEqual(point(lat, lon));
  });

  it('reads a long run of white space as one space', () => {
    expect(readLocation(`40.4406${' '.repeat(2_000)}-79.9959`)).toEqual(point(40.4406, -79.9959));
    expect(readLocation(`40.4406${'\n'.repeat(500)}N 79.9959 W`)).toEqual(point(40.4406, -79.9959));
    expect(readLocation(`1${' '.repeat(500)}N${' '.repeat(998)}x`)).toEqual({ kind: 'unreadable' });
  });

  it('reads degrees, minutes and seconds, whichever comes first', () => {
    const read = readLocation(`40°26'26.2"N 79°59'45.2"W`);
    expect(read.kind).toBe('point');
    if (read.kind !== 'point') return;
    expect(read.point.lat).toBeCloseTo(40.440611, 5);
    expect(read.point.lon).toBeCloseTo(-79.995889, 5);
    expect(readLocation(`79°59'45.2"W 40°26'26.2"N`)).toEqual(read);
    // Two latitudes are no place.
    expect(readLocation(`40°26'26.2"N 41°26'26.2"N`)).toEqual({ kind: 'unreadable' });
  });

  it('refuses minutes or seconds of sixty or more', () => {
    expect(readLocation(`40°60'26.2"N 79°59'45.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°26'60"N 79°59'45.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°26'26.2"N 79°59'75.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°59'59.9"N 79°59'59.9"W`).kind).toBe('point');
  });

  it('does not take two whole numbers for a place: that is a decimal comma', () => {
    expect(readLocation('40,44')).toEqual({ kind: 'unreadable' });
    expect(readLocation('40, -80')).toEqual({ kind: 'unreadable' });
    expect(readLocation('40 44')).toEqual({ kind: 'unreadable' });
    expect(readLocation('91, 10')).toEqual({ kind: 'unreadable' });
    // In a link the two numbers are a pair by their place in it.
    expect(readLocation('https://www.google.com/maps?q=40,-80')).toEqual(point(40, -80));
  });

  it('refuses numbers that are no place on earth', () => {
    expect(readLocation('91.0, 10')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('-90.01,10')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('45, 180.5')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('90.0, -180')).toEqual(point(90, -180));
    expect(readLocation('https://maps.google.com/?q=95,10')).toEqual({ kind: 'out-of-range' });
  });

  it('takes the pin of a Google Maps address, not the middle of the map', () => {
    const address =
      'https://www.google.com/maps/place/Big+Fountain/@40.4420,-79.9990,17z/' +
      'data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.4406!4d-79.9959!16s%2Fg%2F1';
    expect(readLocation(address)).toEqual(point(40.4406, -79.9959));
  });

  it('takes the last pin when an address has several', () => {
    const address =
      'https://www.google.com/maps/place/A/@40.5,-79.9,12z/data=!4m9!1m2!3d40.1!4d-79.1!1m2!3d40.2!4d-79.2';
    expect(readLocation(address)).toEqual(point(40.2, -79.2));
  });

  it('reads the link that "View in map" of Pokémon GO shares as the place itself', () => {
    // The main way staff give a location (Matt, 2026-10-13): the gym, View in map, share.
    const shared =
      'https://maps.google.com/?q=40.434846,-79.923097&entry=gps&g_ep=CAESBzI1LjMuMTAYACDXggM%3D&shorturl=1';
    expect(readLocation(shared)).toEqual(point(40.434846, -79.923097));
    for (const spelled of [
      'https://maps.google.com/?q=40.434846%2C-79.923097&entry=gps&shorturl=1',
      'https://maps.google.com/?q=40.434846,+-79.923097&entry=gps',
      'https://maps.google.com/?q=40.434846, -79.923097&entry=gps',
      'HTTPS://MAPS.GOOGLE.COM/?q=40.434846,-79.923097&entry=gps',
      'maps.google.com/?q=40.434846,-79.923097&shorturl=1',
    ]) {
      expect(readLocation(spelled), spelled).toEqual(point(40.434846, -79.923097));
    }
    // With the name of the place behind the coordinates, as some apps write it.
    expect(readLocation('https://maps.google.com/?q=40.43,-79.92(Big+Fountain)')).toEqual(
      point(40.43, -79.92),
    );
    expect(readLocation('https://maps.google.com/?q=40.43,-79.92 (Big Fountain)')).toEqual(
      point(40.43, -79.92),
    );
  });

  it('reads a route by where it ends, never by where it starts', () => {
    // Asked for by its destination.
    expect(
      readLocation('https://www.google.com/maps/dir/?api=1&destination=40.4406,-79.9959'),
    ).toEqual(point(40.4406, -79.9959));
    expect(
      readLocation(
        'https://www.google.com/maps/dir/?api=1&origin=40.1,-79.1&destination=40.4406%2C-79.9959',
      ),
    ).toEqual(point(40.4406, -79.9959));
    // The end as coordinates, whatever follows it in the path.
    expect(
      readLocation(
        'https://www.google.com/maps/dir/Home/40.4406,-79.9959/@40.3,-79.5,11z/data=!4m2!1d-79.1!2d40.1',
      ),
    ).toEqual(point(40.4406, -79.9959));
    expect(
      readLocation('https://www.google.com/maps/dir/Home/40.4406,-79.9959/am=t/data=!3e0'),
    ).toEqual(point(40.4406, -79.9959));
    // An end that is named: the last waypoint of the data (longitude first), when the data has
    // one for every named stop. That is where Google found the name, so it is only near.
    expect(
      readLocation(
        'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park/@40.44,-80.0,15z/' +
          'data=!3m1!4b1!4m9!4m8!1m0!1m5!1m1!1s0x8834f1:0x1!2m2!1d-80.0119!2d40.4416!3e2',
      ),
    ).toEqual(near(40.4416, -80.0119));
    expect(
      readLocation(
        'https://www.google.com/maps/dir/Home/Cafe/Park/@40.44,-80.0,15z/data=!4m14' +
          '!1m5!1m1!1s0x1!2m2!1d-79.9!2d40.1!1m5!1m1!1s0x2!2m2!1d-79.8!2d40.2' +
          '!1m5!1m1!1s0x3!2m2!1d-80.0119!2d40.4416',
      ),
    ).toEqual(near(40.4416, -80.0119));
    // No place, and never the start:
    for (const address of [
      // a start as coordinates and an end that nothing says;
      'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park',
      'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park/@40.44,-80.0,15z',
      'https://www.google.com/maps/dir/Home/Park/@40.44,-80.0,15z/data=!3m1!4b1',
      'https://www.google.com/maps/dir/Home/Park/@40.44,-80.0,15z/data=!4m2!3d40.1!4d-79.1',
      // a start that Google found and an end it did not (`!1m0`): the one waypoint is the start;
      'https://www.google.com/maps/dir/Point+State+Park/Somewhere+typed/@40.44,-80.0,15z/' +
        'data=!4m9!4m8!1m5!1m1!1s0x8834f1:0x1!2m2!1d-80.0119!2d40.4416!1m0!3e0',
      // fewer waypoints than names.
      'https://www.google.com/maps/dir/Home/Cafe/Park/@40.44,-80.0,15z/' +
        'data=!4m14!1m5!1m1!1s0x1!2m2!1d-79.9!2d40.1!1m5!1m1!1s0x2!2m2!1d-80.0119!2d40.4416',
    ]) {
      expect(readLocation(address), address).toEqual({ kind: 'unreadable' });
    }
  });

  it('reads coordinates that were searched for as the place', () => {
    expect(readLocation('https://www.google.com/maps/search/40.4406,+-79.9959')).toEqual(
      point(40.4406, -79.9959),
    );
    expect(
      readLocation('https://www.google.com/maps/search/40.4406,-79.9959/@40.5,-79.9,15z'),
    ).toEqual(point(40.4406, -79.9959));
  });

  it.each([
    ['https://www.google.com/maps?q=40.4406,-79.9959', 40.4406, -79.9959],
    ['https://maps.google.com/?q=loc:40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/search/?api=1&query=40.4406%2C-79.9959', 40.4406, -79.9959],
    ['https://www.google.co.uk/maps?q=51.5007,-0.1246', 51.5007, -0.1246],
    ['www.google.com/maps?q=40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/place/40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/dir/Home/40.4406,-79.9959', 40.4406, -79.9959],
    [
      'https://www.google.com/maps/dir/40.1,-79.1/40.4406,-79.9959/@40.3,-79.5,11z',
      40.4406,
      -79.9959,
    ],
  ])('reads the Google Maps address %s', (address, lat, lon) => {
    expect(readLocation(address)).toEqual(point(lat, lon));
  });

  it('reads the place of a Google Maps address written in degrees, minutes and seconds', () => {
    const read = readLocation(
      `https://www.google.com/maps/place/40%C2%B026'26.2%22N+79%C2%B059'45.2%22W/@40.5,-79.9,17z`,
    );
    expect(read.kind).toBe('point');
    if (read.kind !== 'point') return;
    expect(read.point.lat).toBeCloseTo(40.440611, 5);
    expect(read.point.lon).toBeCloseTo(-79.995889, 5);
  });

  it('reads the middle of a map or of a place page as near the place, and says so', () => {
    expect(readLocation('https://www.google.com/maps/@40.4406,-79.9959,17z')).toEqual(
      near(40.4406, -79.9959),
    );
    expect(readLocation('https://www.google.com/maps/@40.4406,-79.9959,17.25z/data=!5m1')).toEqual(
      near(40.4406, -79.9959),
    );
    expect(
      readLocation('https://www.google.com/maps/place/Big+Fountain/@40.4406,-79.9959,17z'),
    ).toEqual(near(40.4406, -79.9959));
    expect(readLocation('https://maps.google.com/maps?ll=40.4406,-79.9959&z=16')).toEqual(
      near(40.4406, -79.9959),
    );
    // A pin, a place in coordinates and a typed pair are the place itself.
    expect(readLocation('40.4406,-79.9959')).not.toHaveProperty('approximate');
    expect(
      readLocation('https://www.google.com/maps/place/40.4406,-79.9959/@40.5,-79.9,17z'),
    ).toEqual(point(40.4406, -79.9959));
    // Apple's `ll` is its place.
    expect(readLocation('https://maps.apple.com/?ll=40.4406,-79.9959')).not.toHaveProperty(
      'approximate',
    );
  });

  it.each([
    ['a search', 'https://www.google.com/maps/search/pizza/@40.4406,-79.9959,15z'],
    ['a search with data', 'https://www.google.com/maps/search/pizza/@40.44,-79.99,15z/data=!3m1'],
    [
      'a name with the centre of the map',
      'https://www.google.com/maps?q=Starbucks&ll=40.44,-79.99',
    ],
    ['a query by name', 'https://www.google.com/maps/@40.44,-79.99,15z?query=Starbucks'],
    ['a Street View', 'https://www.google.com/maps/@40.4406,-79.9959,3a,75y,90t/data=!3m6!1e1'],
    ['a map without a zoom', 'https://www.google.com/maps/@40.4406,-79.9959'],
  ])('does not take the middle of the map of %s for a place', (_what, address) => {
    expect(readLocation(address)).toEqual({ kind: 'unreadable' });
  });

  it('reads Apple Maps and Ingress intel links', () => {
    expect(readLocation('https://maps.apple.com/?ll=40.4406,-79.9959&q=Pin')).toEqual(
      point(40.4406, -79.9959),
    );
    expect(readLocation('https://maps.apple.com/place?coordinate=40.4406,-79.9959')).toEqual(
      point(40.4406, -79.9959),
    );
    // `pll` is the portal; `ll` only the middle of the map.
    expect(
      readLocation('https://intel.ingress.com/intel?ll=40.5,-79.5&z=17&pll=40.4406,-79.9959'),
    ).toEqual(point(40.4406, -79.9959));
    expect(readLocation('https://intel.ingress.com/intel?ll=40.5,-79.5&z=17')).toEqual({
      kind: 'unreadable',
    });
  });

  it('names a short link of the Maps app as one, without following it', () => {
    expect(readLocation('https://maps.app.goo.gl/AbC123xyz')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/AbC123xyz',
    });
    expect(readLocation('maps.app.goo.gl/AbC123xyz?g_st=ic')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/AbC123xyz?g_st=ic',
    });
    expect(readLocation('http://goo.gl/maps/AbC123')).toEqual({
      kind: 'short-link',
      url: 'https://goo.gl/maps/AbC123',
    });
    // `goo.gl` shortens anything: only its Maps links count.
    expect(readLocation('https://goo.gl/AbC123')).toEqual({ kind: 'unreadable' });
    expect(readLocation('https://maps.app.goo.gl/')).toEqual({ kind: 'unreadable' });
  });

  it.each([
    '',
    'the library',
    '40.4406',
    '40.4406, -79.9959, 12',
    'https://example.com/?q=40.4406,-79.9959',
    'https://google.com.evil.example/maps?q=40.4406,-79.9959',
    'https://www.google.com/maps/place/Big+Fountain',
    'https://www.google.com/maps?q=Big+Fountain',
    'javascript:alert(1)',
    '40.4406, -79.9959 https://example.com',
  ])('does not read %j', (text) => {
    expect(readLocation(text)).toEqual({ kind: 'unreadable' });
  });

  it('says what it reads', () => {
    expect(LOCATION_FORMS).toContain('40.4406, -79.9959');
  });
});
