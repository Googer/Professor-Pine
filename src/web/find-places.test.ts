import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { STOP_NOON, STOP_ROWS, stopReportingWith } from '../../test/support/stop-reporting.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { partyWebWith, stopWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import type { FoundPlacesView } from '../domain/web/find-data.js';
import { FIND_PER_MINUTE } from './find-routes.js';

const URL = `/s/${FAKE_GUILD_ID}/api/find-places`;

/** Twelve PokéStops called "Little Free Library" in West, a little apart, beside `STOP_ROWS`. */
const LIBRARIES = Array.from({ length: 12 }, (_, n) =>
  keptRow(20 + n, { title: 'Little Free Library', lat: 40.02 + n / 1000, lon: -80.02 }),
);

/** The map over the stops of `stopReportingWith`, Alice a member, the clock at `STOP_NOON`. */
async function setup(rows = STOP_ROWS) {
  const made = await stopReportingWith(rows);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({
    members,
    parties: partyWebWith(made.made),
    stops: stopWebWith(made.ctx),
  });
  web.clock.now = STOP_NOON;
  const ask = async (query: string, userId = ALICE, address = '127.0.0.1') =>
    web.app.inject({
      method: 'GET',
      url: `${URL}?${query}`,
      headers: { cookie: await web.loggedIn(userId, 'x') },
      remoteAddress: address,
    });
  return { ...made, web, members, ask };
}

describe('the places Find finds on the map (plan 8M-12)', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it('finds gyms, PokéStops and Power Spots of the server by name, as Discord’s search does', async () => {
    const made = await setup();
    web = made.web;
    const answer = await made.ask('q=library');
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-store');
    const { places } = answer.json<FoundPlacesView>();
    expect(places).toEqual(
      expect.arrayContaining([
        {
          kind: 'gym',
          id: '1',
          name: 'Pinewood Public Library',
          lat: 40.05,
          lon: -80.05,
          guess: false,
        },
        {
          kind: 'powerspot',
          id: wayspotId(5),
          name: 'Library Garden',
          lat: 40.0502,
          lon: -80.0502,
          guess: false,
        },
      ]),
    );
    // The beginning of a word as typed, accents and case ignored.
    const begun = (await made.ask('q=YELL')).json<FoundPlacesView>().places;
    expect(begun.map((place) => [place.kind, place.name])).toEqual([['stop', 'Yellow Mural']]);
    expect(
      (await made.ask(`q=${encodeURIComponent('cafe elan')}`)).json<FoundPlacesView>().places,
    ).toMatchObject([{ kind: 'gym', name: 'Café Élan Fresco' }]);
  });

  it('gives the nearer of places that fit alike first, from the point it is given', async () => {
    const made = await setup();
    web = made.web;
    // Gym 5 lies in West, gym 9 in East.
    const fromEast = (await made.ask('q=starbucks&near=40.08,-79.95')).json<FoundPlacesView>();
    expect(fromEast.places.map((place) => place.id)).toEqual(['9', '5']);
    const fromWest = (await made.ask('q=starbucks&near=40.02,-80.08')).json<FoundPlacesView>();
    expect(fromWest.places.map((place) => place.id)).toEqual(['5', '9']);
  });

  it('gives ten of each kind at most, the nearest of those that fit alike', async () => {
    const made = await setup([...STOP_ROWS, ...LIBRARIES]);
    web = made.web;
    const { places } = (
      await made.ask('q=little%20free%20library&near=40.02,-80.02')
    ).json<FoundPlacesView>();
    const stops = places.filter((place) => place.kind === 'stop');
    expect(stops).toHaveLength(10);
    expect(stops.map((stop) => stop.id)).toEqual(LIBRARIES.slice(0, 10).map((row) => row.id));
  });

  it('leaves out guesses that miss a word typed, and places of no region of the server', async () => {
    const made = await setup();
    web = made.web;
    // Gym 10, Lakeview Trailhead, lies in no region.
    expect((await made.ask('q=lakeview')).json<FoundPlacesView>().places).toEqual([]);
    expect((await made.ask('q=yellow%20zebra')).json<FoundPlacesView>().places).toEqual([]);
    // A short word is read only as typed (`allowedTypos`): "art" is not "Park" (review F3).
    expect((await made.ask('q=art')).json<FoundPlacesView>().places).toEqual([]);
    expect((await made.ask('q=yellow%20art')).json<FoundPlacesView>().places).toEqual([]);
    // Gym 11 is Riverside Park Gazebo: "art" is two letters off "park", and too short to be
    // misspelt at all.
    expect((await made.ask('q=riverside%20art')).json<FoundPlacesView>().places).toEqual([]);
    expect((await made.ask('q=riverside%20gazebo')).json<FoundPlacesView>().places).toMatchObject([
      { kind: 'gym', id: '11' },
    ]);
    // A word too common to search by asks nothing of the name.
    expect((await made.ask('q=the%20yellow%20mural')).json<FoundPlacesView>().places).toMatchObject(
      [{ kind: 'stop', name: 'Yellow Mural' }],
    );
    // A word misspelt is still read, as Discord reads it.
    expect((await made.ask('q=yelow%20mural')).json<FoundPlacesView>().places).toMatchObject([
      { kind: 'stop', name: 'Yellow Mural' },
    ]);
  });

  // Plan 8M-13 (O1): the page shows a misspelling's places only when it found nothing else.
  it('says which places it found only by a misspelling', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.ask('q=yelow%20mural')).json<FoundPlacesView>().places).toMatchObject([
      { name: 'Yellow Mural', guess: true },
    ]);
    expect((await made.ask('q=yellow%20mural')).json<FoundPlacesView>().places).toMatchObject([
      { name: 'Yellow Mural', guess: false },
    ]);
  });

  it('is not for a member without the map’s role (review F8)', async () => {
    const made = await stopReportingWith();
    const members = new FakeMemberDirectory().add(ALICE, 'Alice');
    web = webServerWith({
      members,
      parties: partyWebWith(made.made),
      stops: stopWebWith(made.ctx),
      web: { memberRole: 'Verified' },
    });
    web.clock.now = STOP_NOON;
    const ask = async () =>
      web?.app.inject({
        method: 'GET',
        url: `${URL}?q=yellow`,
        headers: { cookie: await web.loggedIn(ALICE, 'x') },
      });
    expect((await ask())?.statusCode).toBe(403);
    members.standing(ALICE, { roleNames: ['Verified'], administrator: false });
    expect((await ask())?.statusCode).toBe(200);
  });

  it('takes two letters to 100, and a point on the earth', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.ask('q=y')).statusCode).toBe(400);
    expect((await made.ask(`q=${'y'.repeat(101)}`)).statusCode).toBe(400);
    expect((await made.ask('')).statusCode).toBe(400);
    expect((await made.ask('q=yellow&near=91,0')).statusCode).toBe(400);
    expect((await made.ask('q=yellow&count=3')).statusCode).toBe(400);
    expect((await made.ask('q=ye')).statusCode).toBe(200);
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: `${URL}?q=yellow` })).statusCode).toBe(
      401,
    );
    expect((await made.ask('q=yellow', BOB)).statusCode).toBe(403);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask('q=yellow')).statusCode).toBe(503);
  });

  it(`answers one address ${String(FIND_PER_MINUTE)} times a minute, typing never emptying it`, async () => {
    const made = await setup();
    web = made.web;
    for (let n = 0; n < FIND_PER_MINUTE; n++) {
      expect((await made.ask('q=yellow')).statusCode).toBe(200);
    }
    const refused = await made.ask('q=yellow');
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
    // Another address is not refused for it.
    expect((await made.ask('q=yellow', ALICE, '10.1.2.3')).statusCode).toBe(200);
  });
});
