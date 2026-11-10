import { describe, expect, it } from 'vitest';
import { alreadyGranted, LOCATION_DENIED, locationRefusal } from './your-location.js';

describe('your location (plan 8M-7)', () => {
  it('is shown on load only where the browser granted it already, never asked for', async () => {
    const asked: string[] = [];
    const permissions = (state: string) => ({
      query: (descriptor: { name: string }) => {
        asked.push(descriptor.name);
        return Promise.resolve({ state });
      },
    });
    expect(await alreadyGranted(permissions('granted'))).toBe(true);
    expect(await alreadyGranted(permissions('prompt'))).toBe(false);
    expect(await alreadyGranted(permissions('denied'))).toBe(false);
    expect(asked).toEqual(['geolocation', 'geolocation', 'geolocation']);
    // A browser that cannot say: as if not granted.
    expect(await alreadyGranted(undefined)).toBe(false);
    expect(
      await alreadyGranted({
        query: () => Promise.reject(new TypeError('geolocation is not a permission here')),
      }),
    ).toBe(false);
  });

  it('says in one line why it is not shown', () => {
    expect(locationRefusal(1)).toBe(LOCATION_DENIED);
    expect(LOCATION_DENIED).toBe('Your browser did not share your location.');
    expect(locationRefusal(2)).toBe('Your location is not available just now.');
    expect(locationRefusal(3)).toBe('Your location is not available just now.');
    expect(locationRefusal('unsupported')).toBe(
      'This browser cannot share your location with this page.',
    );
  });
});
