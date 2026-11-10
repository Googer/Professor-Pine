import { describe, expect, it } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import { geoAgain, takeGeo, type ShownGeo } from './geo-again.js';
import type { Me } from './notice.js';

const square = (lat: number): Array<[number, number]> => [
  [lat, -80],
  [lat + 0.1, -80],
  [lat + 0.1, -79.9],
  [lat, -80],
];
const WEST = { id: 1, name: 'west', outline: square(40) };
const EAST = { id: 2, name: 'east', outline: square(41) };
const gym = (id: number, regionIds: number[]): GeoView['gyms'][number] => ({
  id,
  name: `Gym ${String(id)}`,
  nickname: null,
  lat: 40.05,
  lon: -79.95,
  regionIds,
  address: null,
  description: null,
  notice: null,
});
/** What a visitor sees of a server whose East only its members see, and what a member sees. */
const PUBLIC: GeoView = { regions: [WEST], gyms: [gym(1, [1]), gym(4, [1])] };
const MEMBERS: GeoView = {
  regions: [EAST, WEST],
  gyms: [gym(1, [1]), gym(3, [2]), gym(4, [1, 2])],
};

const ME = { loggedIn: true, name: 'Ash', csrf: 'token' } as const;
/** `/api/me` while Discord could not say whether Ash is a member. */
const UNCONFIRMED: Me = { ...ME, member: false, readOnly: true };
const MEMBER: Me = { ...ME, member: true, readOnly: false };

/** `ask` answering from a list, a failure where an Error stands. */
function asking(answers: Array<GeoView | Error>) {
  let asked = 0;
  const grown: GeoView[] = [];
  return {
    ask: () => {
      asked += 1;
      const next = answers.shift();
      if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    grow: (view: GeoView) => {
      grown.push(view);
    },
    asked: () => asked,
    grown,
  };
}

describe('the map asks its regions and gyms again (8Z-2 final fix F2)', () => {
  it('once the first list of parties came, where the page loaded before Discord said who is asking', async () => {
    const { ask, grow, asked, grown } = asking([MEMBERS]);
    const again = geoAgain(UNCONFIRMED, ask, grow);
    await again.listDrawn();
    expect(asked()).toBe(1);
    expect(grown).toEqual([MEMBERS]);
    // Once is enough: the next lists ask nothing.
    await again.listDrawn();
    expect(asked()).toBe(1);
  });

  it('again at the next list when the ask failed', async () => {
    const { ask, grow, asked, grown } = asking([new Error('offline'), MEMBERS]);
    const again = geoAgain(UNCONFIRMED, ask, grow);
    await again.listDrawn();
    expect(grown).toEqual([]);
    await again.listDrawn();
    expect(asked()).toBe(2);
    expect(grown).toEqual([MEMBERS]);
  });

  it('never for a member Discord confirmed at load, whose map is the members’ already', async () => {
    const { ask, grow, asked } = asking([MEMBERS]);
    const again = geoAgain(MEMBER, ask, grow);
    await again.listDrawn();
    expect(asked()).toBe(0);
  });
});

describe('takeGeo', () => {
  it('takes the members’ view in place of the visitors’, and says which regions are new', () => {
    const shown: ShownGeo = {
      gyms: new Map(PUBLIC.gyms.map((one) => [one.id, one])),
      names: new Map([[WEST.id, WEST.name]]),
      regions: [...PUBLIC.regions],
    };
    const { regions, gyms, names } = shown;
    const changed = takeGeo(shown, MEMBERS);
    expect(changed).toEqual({ added: [EAST], removed: [] });
    // The same maps and list, which the parties and the forms hold, now the members'.
    expect(shown.regions).toBe(regions);
    expect(regions).toEqual([EAST, WEST]);
    expect([...gyms.keys()]).toEqual([1, 3, 4]);
    expect(gyms.get(4)?.regionIds).toEqual([1, 2]);
    expect(names.get(2)).toBe('east');
  });

  it('says which regions are gone, should a view lose one', () => {
    const shown: ShownGeo = {
      gyms: new Map(MEMBERS.gyms.map((one) => [one.id, one])),
      names: new Map([
        [EAST.id, EAST.name],
        [WEST.id, WEST.name],
      ]),
      regions: [...MEMBERS.regions],
    };
    expect(takeGeo(shown, PUBLIC)).toEqual({ added: [], removed: [EAST.id] });
    expect([...shown.names.keys()]).toEqual([1]);
    expect([...shown.gyms.keys()]).toEqual([1, 4]);
  });
});
