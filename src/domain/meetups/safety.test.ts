import { describe, expect, it } from 'vitest';
import type { DroppedPin, KnownPlace } from '../geo/place.js';
import {
  askableAt,
  DEFAULT_FLAGGED_WORDS,
  flaggedWordIn,
  flaggedWordsOf,
  meetupPlaceVerdict,
  mayRequestReview,
  requestExpiry,
  rulingKeyOf,
  type PlaceCheck,
} from './safety.js';

const HOUR = 3_600_000;
const NOW = 1_792_000_000_000;

function stop(title: string, kind: KnownPlace['kind'] = 'stop'): KnownPlace {
  return { kind, id: 'a1b2c3.16', title, lat: 40.06, lon: -80.06, address: null, image: null };
}

const PIN: DroppedPin = { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null };

const WORDS = flaggedWordsOf(undefined);

/** The check of an ordinary member at a place with no ruling, the safety on. */
function check(place: PlaceCheck['place'], more: Partial<PlaceCheck> = {}): PlaceCheck {
  return {
    on: true,
    place,
    staff: false,
    blocked: false,
    ruling: undefined,
    flaggedWords: WORDS,
    ...more,
  };
}

describe('flaggedWordIn', () => {
  it('finds the words of a front-yard feature in real titles, and nothing in the others', () => {
    const flagged = (title: string) => flaggedWordIn(title, WORDS);
    expect(flagged('Little Free Library at St. Paul’s')).toBe('little free library');
    expect(flagged('Oakland Apartments sign')).toBe('apartments');
    expect(flagged('LITTLE FREE LIBRARY #48213')).toBe('little free library');
    expect(flagged('Maple Court Condominiums')).toBe('condominiums');
    expect(flagged('Smith Apt 3 Garden')).toBe('apt');
    expect(flagged('Home of the 1972 State Champions')).toBeUndefined();
    expect(flagged('Smith Family Daycare')).toBe('daycare');
    expect(flagged('St. Paul’s Church')).toBeUndefined();
    expect(flagged('Riverside Park')).toBeUndefined();
    expect(flagged('Mural on Liberty Ave')).toBeUndefined();
    expect(flagged('Fountain Square')).toBeUndefined();
  });

  it('matches whole words only, not a part of another word', () => {
    expect(flaggedWordIn('Apartmentalized Art', WORDS)).toBeUndefined();
    expect(flaggedWordIn('Privateer Memorial', WORDS)).toBeUndefined();
    expect(flaggedWordIn('Studios', WORDS)).toBeUndefined();
    expect(flaggedWordIn('Art-Studio Gate', WORDS)).toBe('studio');
  });

  it('takes the words of a phrase across any white space, and a word with signs in it as written', () => {
    expect(flaggedWordIn('Little  Free\nLibrary', WORDS)).toBe('little free library');
    expect(flaggedWordIn('Corner (apt.) Bench', flaggedWordsOf(['(apt.)']))).toBe('(apt.)');
  });
});

describe('flaggedWordsOf', () => {
  it('is the default list with the words of the settings added, in lower case, once each', () => {
    expect(DEFAULT_FLAGGED_WORDS).toEqual(
      expect.arrayContaining([
        'little free library',
        'apartment',
        'apartments',
        'apts',
        'condo',
        'condos',
        'condominium',
        'condominiums',
        'townhome',
        'townhomes',
        'townhouse',
        'townhouses',
        'residence',
        'private',
        'salon',
        'studio',
        'llc',
        'daycare',
        'apt',
      ]),
    );
    expect(DEFAULT_FLAGGED_WORDS).not.toContain('home of');
    const words = flaggedWordsOf([' Duplex ', 'PRIVATE', '  ']);
    expect(words).toContain('duplex');
    expect(words.filter((word) => word === 'private')).toHaveLength(1);
    expect(words).not.toContain('');
    expect(flaggedWordIn('Blue Duplex', words)).toBe('duplex');
  });
});

describe('meetupPlaceVerdict', () => {
  it('allows an ordinary Wayspot and holds a pin and a flagged title for a moderator', () => {
    expect(meetupPlaceVerdict(check(stop('Riverside Park')))).toBe('allowed');
    expect(meetupPlaceVerdict(check(stop('Old Stone Fountain', 'gym')))).toBe('allowed');
    expect(meetupPlaceVerdict(check(PIN))).toBe('review');
    expect(meetupPlaceVerdict(check(stop('Little Free Library')))).toBe('review');
    expect(meetupPlaceVerdict(check(stop('Oakland Apartments sign', 'powerspot')))).toBe('review');
  });

  it('follows a ruling of the place over its title', () => {
    expect(meetupPlaceVerdict(check(stop('Little Free Library'), { ruling: 'allow' }))).toBe(
      'allowed',
    );
    expect(meetupPlaceVerdict(check(stop('Riverside Park'), { ruling: 'refuse' }))).toBe('refused');
  });

  it('never lets a ruling decide for a pin', () => {
    expect(meetupPlaceVerdict(check(PIN, { ruling: 'allow' }))).toBe('review');
    expect(meetupPlaceVerdict(check(PIN, { ruling: 'refuse' }))).toBe('review');
  });

  it('holds a place whose other name is flagged: a gym by its official name or its nickname', () => {
    const gym = stop('Old Stone Fountain', 'gym');
    expect(meetupPlaceVerdict(check(gym, { otherTitles: ['Maple Court Condominiums Sign'] }))).toBe(
      'review',
    );
    expect(meetupPlaceVerdict(check(gym, { otherTitles: ['Fountain on Main'] }))).toBe('allowed');
    expect(
      meetupPlaceVerdict(
        check(gym, { otherTitles: ['Maple Court Condominiums Sign'], ruling: 'allow' }),
      ),
    ).toBe('allowed');
  });

  it('refuses a blocked member anywhere, and lets staff skip everything', () => {
    expect(meetupPlaceVerdict(check(stop('Riverside Park'), { blocked: true }))).toBe('blocked');
    expect(meetupPlaceVerdict(check(PIN, { blocked: true }))).toBe('blocked');
    for (const place of [PIN, stop('Little Free Library')]) {
      expect(
        meetupPlaceVerdict(check(place, { staff: true, ruling: 'refuse', blocked: true })),
      ).toBe('allowed');
    }
  });

  it('allows everything while the safety is off: no moderators to ask, no blocks', () => {
    const off = { on: false, blocked: true, ruling: 'refuse' as const };
    expect(meetupPlaceVerdict(check(PIN, off))).toBe('allowed');
    expect(meetupPlaceVerdict(check(stop('Little Free Library'), off))).toBe('allowed');
  });
});

describe('rulingKeyOf', () => {
  it('is the kind and id of a known place, and nothing for a pin', () => {
    expect(rulingKeyOf(stop('Riverside Park'))).toEqual({ kind: 'stop', id: 'a1b2c3.16' });
    expect(rulingKeyOf(PIN)).toBeUndefined();
  });
});

describe('requestExpiry', () => {
  it('is 48 hours after the request, or an hour before the start when that is sooner', () => {
    expect(requestExpiry(NOW, NOW + 72 * HOUR)).toBe(NOW + 48 * HOUR);
    expect(requestExpiry(NOW, NOW + 5 * HOUR)).toBe(NOW + 4 * HOUR);
  });

  it('leaves a request at least an hour for the moderators: a start two hours ahead', () => {
    expect(mayRequestReview(NOW, NOW + 2 * HOUR)).toBe(true);
    expect(mayRequestReview(NOW, NOW + 2 * HOUR - 60_000)).toBe(false);
    expect(mayRequestReview(NOW, NOW + 30 * 60_000)).toBe(false);
    expect(mayRequestReview(NOW, NOW + 30 * 24 * HOUR)).toBe(true);
  });
});

describe('askableAt', () => {
  it('lets members ask fourteen days after the refusal, or after the last Keep refused', () => {
    expect(askableAt({ ruledAt: NOW, keptAt: null })).toBe(NOW + 14 * 24 * HOUR);
    expect(askableAt({ ruledAt: NOW, keptAt: NOW + 20 * 24 * HOUR })).toBe(NOW + 34 * 24 * HOUR);
  });
});
