import { afterEach, describe, expect, it } from 'vitest';
import { activityBucket } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_FORUM, OTHER_GUILD_ROW, UNBOUNDED_CHANNEL } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import {
  gymsFixture,
  regionsFixture,
  THEIR_GYM,
  twoServerGyms,
  type TestGyms,
} from '../../test/support/providers.js';
import { STOP_ROWS } from '../../test/support/stop-reporting.js';
import { zonedAt } from '../../test/support/time.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import {
  activityWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { ActivityView } from '../domain/web/activity-data.js';
import { ACTIVITY_READ_FRESH_MS, KeptActivity } from '../services/kept-activity.js';
import { ACTIVITY_PER_MINUTE } from './history-routes.js';

const URL = `/s/${FAKE_GUILD_ID}/api/activity`;
const ZONE = 'America/New_York';
/** A Thursday at 18:40 in the posts' zone. */
const THURSDAY = zonedAt('2026-10-22T18:40', ZONE);
/** The Power Spot of `STOP_ROWS`, Library Garden. */
const SPOT = wayspotId(5);

/**
 * The map of the fakes' server with buckets in memory (`MemoryActivity`), the invented gyms and
 * regions (West 1, East 2 with their forums), the kept Wayspots of `STOP_ROWS`, Alice and Bob
 * members, the clock at `THURSDAY`. With `kept`, the routes read through the kept reads on the
 * web's clock, as the bot's do (`KeptActivity`); without, each request reads the buckets itself.
 */
async function setup(
  options: { kept?: boolean; gyms?: TestGyms; others?: Parameters<typeof wayspotsWith>[3] } = {},
) {
  const made = await partyServiceWith();
  const activity = new MemoryActivity();
  const { wayspots } = await wayspotsWith(STOP_ROWS, undefined, undefined, options.others);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const web: TestWeb = webServerWith({
    members,
    parties: partyWebWith(made),
    activity: activityWebWith({
      reader:
        options.kept === true ? new KeptActivity(activity, { now: () => web.clock.now }) : activity,
      gyms: options.gyms ?? gymsFixture(),
      regions: regionsFixture(),
      wayspots,
    }),
  });
  web.clock.now = THURSDAY;
  const ask = async (query = '', userId = ALICE, headers: Record<string, string> = {}) => {
    const cookie = await web.loggedIn(userId, 'x');
    return web.app.inject({
      method: 'GET',
      url: `${URL}${query}`,
      headers: { cookie, ...headers },
    });
  };
  return { made, web, members, activity, ask };
}

describe('the activity heatmap on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('gives a member Expected now: each busy place at its point, by weight', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18, { raids: 4 }),
      activityBucket(7, '2026-10', 4, 19, { regionId: 2, raids: 2 }),
      activityBucket(5, '2026-10', 4, 17, { placeKind: 'spot', placeId: SPOT, raids: 0, maxes: 2 }),
      // Another weekday: out of the window. Another month: in the slider's range.
      activityBucket(2, '2019-06', 1, 18),
    ]);
    const answer = await made.ask();
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<ActivityView>();
    expect(view).toEqual({
      mode: 'now',
      weekday: 4,
      // Gym 7 and the Power Spot have two parties each in the window: quiet, not drawn.
      places: [{ kind: 'gym', id: '1', lat: 40.05, lon: -80.05, weight: 1, parties: 4 }],
      leftOut: 0,
      months: { first: '2019-06', last: '2026-10' },
      // 20 minutes to the next hour on the wall clock: the page's own clock is not asked.
      changesInMs: 20 * 60_000,
    });
  });

  it('draws gyms and Power Spots alike, each with three parties in the window', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18, { raids: 6 }),
      activityBucket(5, '2026-10', 4, 17, { placeKind: 'spot', placeId: SPOT, raids: 0, maxes: 3 }),
      activityBucket(2, '2026-10', 4, 18, { raids: 2 }),
    ]);
    const view = (await made.ask()).json<ActivityView>();
    expect(view.places).toEqual([
      { kind: 'gym', id: '1', lat: 40.05, lon: -80.05, weight: 1, parties: 6 },
      { kind: 'spot', id: SPOT, lat: 40.0502, lon: -80.0502, weight: 0.5, parties: 3 },
    ]);
    expect(view.leftOut).toBe(0);
  });

  it('places a Power Spot by the server’s own copy, and none only another server keeps (plan 19B-3)', async () => {
    const made = await setup({
      others: [
        {
          guildId: OTHER_GUILD_ROW,
          rows: [
            keptRow(5, { title: 'Their Garden', kind: 'powerspot', lat: 40.07, lon: -80.07 }),
            keptRow(9, { title: 'Their Spot', kind: 'powerspot', lat: 40.06, lon: -80.06 }),
          ],
        },
      ],
    });
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(5, '2026-10', 4, 17, { placeKind: 'spot', placeId: SPOT, raids: 0, maxes: 3 }),
      activityBucket(9, '2026-10', 4, 17, {
        placeKind: 'spot',
        placeId: wayspotId(9),
        raids: 0,
        maxes: 3,
      }),
    ]);
    const view = (await made.ask()).json<ActivityView>();
    // Its own Library Garden where it keeps it (positive control); the other server's alone not.
    expect(view.places).toEqual([
      { kind: 'spot', id: SPOT, lat: 40.0502, lon: -80.0502, weight: 1, parties: 3 },
    ]);
  });

  it('gives a preset and History, by year and by month', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2019-06', 2, 19, { raids: 4 }),
      activityBucket(2, '2019-07', 6, 13, { raids: 3 }),
    ]);
    const evenings = (await made.ask('?mode=evenings')).json<ActivityView>();
    expect(evenings).toMatchObject({ mode: 'evenings', weekday: null, changesInMs: null });
    expect(evenings.places.map((place) => place.id)).toEqual(['1']);
    const weekend = (await made.ask('?mode=weekend')).json<ActivityView>();
    expect(weekend.places.map((place) => place.id)).toEqual(['2']);
    const year = (await made.ask('?mode=history&year=2019')).json<ActivityView>();
    expect(year.places.map((place) => [place.id, place.weight])).toEqual([
      ['1', 1],
      ['2', 0.75],
    ]);
    const june = (await made.ask('?mode=history&month=2019-06')).json<ActivityView>();
    expect(june.places.map((place) => place.id)).toEqual(['1']);
  });

  it('leaves out what lies only in a region whose forum keeps the member out, and its count', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(7, '2026-10', 4, 18, { regionId: 2 }),
      activityBucket(0, '2026-10', 4, 18, {
        regionId: 2,
        placeKind: 'none',
        placeId: '0',
        raids: 2,
      }),
    ]);
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.ask()).json<ActivityView>();
    expect(alice.places.map((place) => place.id)).toEqual(['1']);
    expect(alice.leftOut).toBe(0);
    const bob = (await made.ask('', BOB)).json<ActivityView>();
    expect(bob.places.map((place) => place.id)).toEqual(['1', '7']);
    expect(bob.leftOut).toBe(2);
  });

  it('keeps what lies in a region whose forum only the member’s roles hide, as the map does (spec 2.5)', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(7, '2026-10', 4, 18, { regionId: 2 }),
    ]);
    made.made.gateway.shutOut(EAST_FORUM, ALICE);
    const alice = (await made.ask()).json<ActivityView>();
    expect(alice.places.map((place) => place.id)).toEqual(['1', '7']);
    const bob = (await made.ask('', BOB)).json<ActivityView>();
    expect(bob.places.map((place) => place.id)).toEqual(['1', '7']);
  });

  it('judges a region without a forum by its text channel (8H5-2)', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(2, '2026-10', 4, 18, { regionId: 3 }),
    ]);
    made.made.gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded');
    made.made.gateway.barred.set(UNBOUNDED_CHANNEL, new Set([ALICE]));
    const alice = (await made.ask()).json<ActivityView>();
    expect(alice.places.map((place) => place.id)).toEqual(['1']);
    const bob = (await made.ask('', BOB)).json<ActivityView>();
    expect(bob.places.map((place) => place.id).sort()).toEqual(['1', '2']);
  });

  it('counts a place in a visible and a barred region by the visible parties alone', async () => {
    const made = await setup();
    web = made.web;
    // Gym 4 lies by the border: two parties recorded in West, three in East.
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(4, '2026-10', 4, 18, { regionId: 1, raids: 2 }),
      activityBucket(4, '2026-10', 4, 18, { regionId: 2, raids: 3 }),
      activityBucket(1, '2026-10', 4, 18, { raids: 3 }),
    ]);
    const bob = (await made.ask('', BOB)).json<ActivityView>();
    expect(bob.places.map((place) => [place.id, place.parties])).toEqual([
      ['1', 3],
      ['4', 5],
    ]);
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    // Alice sees West's two: below three, the gym is quiet for her, and nothing is left out.
    const alice = (await made.ask()).json<ActivityView>();
    expect(alice.places.map((place) => [place.id, place.parties])).toEqual([['1', 3]]);
    expect(alice.leftOut).toBe(0);
  });

  it('shows every member the parties of a region no longer there, as those of region 0 (8H4-1)', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18, { raids: 3 }),
      // Region 99 was deleted since: its forum is gone, and nobody is barred from it.
      activityBucket(2, '2026-10', 4, 18, { regionId: 99, raids: 6 }),
      activityBucket(0, '2026-10', 4, 18, { regionId: 99, placeKind: 'none', placeId: '0' }),
      // Region 0 is a record without one, which every member sees.
      activityBucket(3, '2026-10', 4, 18, { regionId: 0, raids: 3 }),
    ]);
    // Alice is barred from East's forum: that bars nothing of a region without a forum.
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const view = (await made.ask()).json<ActivityView>();
    expect(view.places.map((place) => [place.id, place.parties])).toEqual([
      ['1', 3],
      ['2', 6],
      ['3', 3],
    ]);
    expect(view.leftOut).toBe(3);
  });

  it('counts as left out the parties at gyms no longer listed, at Power Spots gone and at pins', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(404, '2026-10', 4, 18, { raids: 5 }),
      activityBucket(0, '2026-10', 4, 18, {
        placeKind: 'spot',
        placeId: 'gone.16',
        raids: 0,
        maxes: 1,
      }),
      activityBucket(0, '2026-10', 4, 18, {
        regionId: 0,
        placeKind: 'none',
        placeId: '0',
        raids: 0,
        maxes: 2,
      }),
    ]);
    const view = (await made.ask()).json<ActivityView>();
    expect(view.places.map((place) => place.id)).toEqual(['1']);
    expect(view.leftOut).toBe(8);
  });

  it("counts as left out the parties at a gym that is no longer this server's, though another server keeps it (plan 19B-2)", async () => {
    const made = await setup({ gyms: twoServerGyms().gyms });
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(THEIR_GYM, '2026-10', 4, 18, { raids: 5 }),
    ]);
    const view = (await made.ask()).json<ActivityView>();
    expect(view.places.map((place) => place.id)).toEqual(['1']);
    expect(view.leftOut).toBe(5);
  });

  it('bounds the slider’s months to the game’s launch and this month, whatever a bucket says (8H4-3)', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2019-06', 4, 18),
      // Buckets of a bad time, written before the months were bounded.
      activityBucket(2, '2010-01', 4, 18),
      activityBucket(3, '2099-05', 4, 18),
    ]);
    const view = (await made.ask('?mode=evenings')).json<ActivityView>();
    expect(view.months).toEqual({ first: '2016-07', last: '2026-10' });
  });

  it('answers 304 for the view the page has, and anew once the hour moves on', async () => {
    const made = await setup();
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [activityBucket(1, '2026-10', 4, 18)]);
    const first = await made.ask();
    const etag = String(first.headers.etag);
    expect((await made.ask('', ALICE, { 'if-none-match': etag })).statusCode).toBe(304);
    made.web.clock.now = zonedAt('2026-10-22T20:05', ZONE);
    const later = await made.ask('', ALICE, { 'if-none-match': etag });
    expect(later.statusCode).toBe(200);
    // 19:00 to 21:59 now: the bucket of 18:00 is out of the window.
    expect(later.json<ActivityView>().places).toEqual([]);
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    expect((await made.ask('', '200000000000000099')).statusCode).toBe(403);
    // Neither the buckets nor the months were read (`reads` counts both, 8H4-4).
    expect(made.activity.reads).toBe(0);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask()).statusCode).toBe(503);
    expect(made.activity.reads).toBe(0);
    // A member's question reads both.
    made.members.failing = undefined;
    expect((await made.ask()).statusCode).toBe(200);
    expect(made.activity.reads).toBe(2);
  });

  it('refuses a mode it does not know, and History without one year or one month', async () => {
    const made = await setup();
    web = made.web;
    for (const query of [
      '?mode=tonight',
      '?mode=history',
      '?mode=history&year=2019&month=2019-06',
      '?mode=history&month=2019-13',
      '?mode=history&year=twenty',
      '?mode=now&year=2019',
      '?mode=now&zone=UTC',
    ]) {
      expect((await made.ask(query)).statusCode, query).toBe(400);
    }
    expect(made.activity.reads).toBe(0);
  });

  it('reads a window once for the members of a minute, each seeing their own regions (plan 8Z-2)', async () => {
    const made = await setup({ kept: true });
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-10', 4, 18),
      activityBucket(7, '2026-10', 4, 18, { regionId: 2 }),
    ]);
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.ask()).json<ActivityView>();
    // The buckets and the months, once.
    expect(made.activity.reads).toBe(2);
    const bob = (await made.ask('', BOB)).json<ActivityView>();
    expect((await made.ask()).json<ActivityView>()).toEqual(alice);
    expect(made.activity.reads).toBe(2);
    // One read, and still what each may see of it.
    expect(alice.places.map((place) => place.id)).toEqual(['1']);
    expect(bob.places.map((place) => place.id)).toEqual(['1', '7']);
    // A minute on (the same hours): read again.
    made.web.clock.now += ACTIVITY_READ_FRESH_MS;
    expect((await made.ask()).statusCode).toBe(200);
    expect(made.activity.reads).toBe(4);
  });

  it('does not keep a read that failed: the next request reads again', async () => {
    const made = await setup({ kept: true });
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [activityBucket(1, '2026-10', 4, 18)]);
    made.activity.failing = new Error('no database');
    expect((await made.ask()).statusCode).toBe(500);
    made.activity.failing = undefined;
    const answer = await made.ask();
    expect(answer.statusCode).toBe(200);
    expect(answer.json<ActivityView>().places.map((place) => place.id)).toEqual(['1']);
  });

  it('answers a month the server has no activity in without reading its buckets', async () => {
    const made = await setup({ kept: true });
    web = made.web;
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2019-06', 4, 18),
      activityBucket(2, '2026-10', 4, 18),
    ]);
    for (const query of ['month=2019-05', 'month=2026-11', 'month=9999-12', 'year=2018']) {
      const answer = await made.ask(`?mode=history&${query}`);
      expect(answer.statusCode, query).toBe(200);
      expect(answer.json<ActivityView>(), query).toMatchObject({
        places: [],
        leftOut: 0,
        months: { first: '2019-06', last: '2026-10' },
      });
    }
    // The server's months, read once and kept; no bucket was read.
    expect(made.activity.reads).toBe(1);
    const june = (await made.ask('?mode=history&month=2019-06')).json<ActivityView>();
    expect(june.places.map((place) => place.id)).toEqual(['1']);
    expect(made.activity.reads).toBe(2);
  });

  it('answers one address only so often', async () => {
    const made = await setup();
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'Alice');
    let status = 0;
    for (let n = 0; n <= ACTIVITY_PER_MINUTE; n++) {
      status = (await made.web.app.inject({ method: 'GET', url: URL, headers: { cookie } }))
        .statusCode;
    }
    expect(status).toBe(429);
  });
});
