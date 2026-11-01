import { describe, expect, it } from 'vitest';
import { PLACE_MOVE_METRES, shownPlace, type KnownPlace } from './place.js';

/** A PokéStop as a meetup kept it when it was named. */
const SNAPSHOT: KnownPlace = {
  kind: 'stop',
  id: '0123456789abcdef0123456789abcdef.16',
  title: 'Fountain Square',
  lat: 40.06,
  lon: -80.06,
  address: '20 Market Street',
  image: null,
};

/** A thousandth of a degree of latitude is about 111 metres. */
const METRES = 1 / 111_000;

describe('shownPlace', () => {
  it('shows the place as it is now while it is the same place: renamed, a new picture', () => {
    const now = {
      ...SNAPSHOT,
      title: 'Fountain Square Park',
      image: 'https://lh3.googleusercontent.com/new',
      address: '22 Market Street',
      lat: SNAPSHOT.lat + 20 * METRES,
    };
    expect(shownPlace(SNAPSHOT, now)).toBe(now);
    expect(PLACE_MOVE_METRES).toBe(25);
  });

  it('shows the place as it was named once it is gone, moved farther, or of another kind', () => {
    expect(shownPlace(SNAPSHOT, undefined)).toBe(SNAPSHOT);
    expect(shownPlace(SNAPSHOT, { ...SNAPSHOT, lat: SNAPSHOT.lat + 30 * METRES })).toBe(SNAPSHOT);
    expect(shownPlace(SNAPSHOT, { ...SNAPSHOT, kind: 'powerspot' })).toBe(SNAPSHOT);
  });
});
