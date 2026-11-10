import { afterEach, describe, expect, it } from 'vitest';
import { activityBucket } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { zonedAt } from '../../test/support/time.js';
import { noWayspots } from '../../test/support/wayspots.js';
import {
  activityWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { RegionTallyView } from '../domain/web/region-tally-data.js';
import { TALLY_PER_MINUTE } from './history-routes.js';

const URL = `/s/${FAKE_GUILD_ID}/api/stats/regions`;
const ZONE = 'America/New_York';
/** A Thursday of November 2026. */
const NOW = zonedAt('2026-11-05T12:00', ZONE);

/**
 * The fakes' server with buckets in memory: this month West (`west`) 4 raids and a max battle,
 * East (`east`) 6 raids, region 3 (whose channel the bot does not see) nothing, a deleted region
 * 99 two raids; East 20 more in 2019. Alice and Bob are members.
 */
async function setup() {
  const made = await partyServiceWith();
  const activity = new MemoryActivity();
  await activity.add(FAKE_GUILD_ID, [
    activityBucket(1, '2026-11', 2, 18, { regionId: 1, raids: 4, maxes: 1 }),
    activityBucket(7, '2026-11', 3, 18, { regionId: 2, raids: 6 }),
    activityBucket(9, '2026-11', 3, 18, { regionId: 99, raids: 2 }),
    activityBucket(7, '2019-06', 6, 13, { regionId: 2, raids: 20 }),
  ]);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
  ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made),
    activity: activityWebWith({
      reader: activity,
      gyms: gymsFixture(),
      regions: regionsFixture(),
      wayspots: noWayspots(),
      zone: ZONE,
      channelName: (channelId) => names.get(channelId),
    }),
  });
  web.clock.now = NOW;
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

describe('the region tally on the web', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('gives a member this month’s tally by default, regions named by their channels', async () => {
    const made = await setup();
    web = made.web;
    const answer = await made.ask();
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.json<RegionTallyView>()).toEqual({
      period: 'month',
      title: 'Raids and max battles by region, this month',
      rows: [
        { name: '#east', raids: 6, maxes: 0 },
        { name: '#west', raids: 4, maxes: 1 },
      ],
      quiet: ['Region 3'],
      gone: { raids: 2, maxes: 0 },
      total: { raids: 12, maxes: 1 },
    });
  });

  it('gives this year and all time', async () => {
    const made = await setup();
    web = made.web;
    const year = (await made.ask('?period=year')).json<RegionTallyView>();
    expect(year.title).toBe('Raids and max battles by region, this year');
    expect(year.total).toEqual({ raids: 12, maxes: 1 });
    const all = (await made.ask('?period=all')).json<RegionTallyView>();
    expect(all.rows[0]).toEqual({ name: '#east', raids: 26, maxes: 0 });
    expect(all.total).toEqual({ raids: 32, maxes: 1 });
  });

  it('leaves out a region whose forum keeps the member out, from its line and the total', async () => {
    const made = await setup();
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.ask()).json<RegionTallyView>();
    expect(alice.rows.map((row) => row.name)).toEqual(['#west']);
    expect(alice.quiet).toEqual(['Region 3']);
    expect(alice.total).toEqual({ raids: 6, maxes: 1 });
    const bob = (await made.ask('', BOB)).json<RegionTallyView>();
    expect(bob.rows.map((row) => row.name)).toEqual(['#east', '#west']);
  });

  it('keeps a region whose forum only the member’s roles hide, as the map does (spec 2.5)', async () => {
    const made = await setup();
    web = made.web;
    made.made.gateway.shutOut(EAST_FORUM, ALICE);
    const alice = (await made.ask()).json<RegionTallyView>();
    expect(alice.rows.map((row) => row.name)).toEqual(['#east', '#west']);
  });

  it('judges a region without a forum by its text channel (8H5-2)', async () => {
    const made = await setup();
    web = made.web;
    made.made.gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded');
    made.made.gateway.barred.set(UNBOUNDED_CHANNEL, new Set([ALICE]));
    const alice = (await made.ask()).json<RegionTallyView>();
    expect(alice.rows.map((row) => row.name)).toEqual(['#east', '#west']);
    expect(alice.quiet).toEqual([]);
    const bob = (await made.ask('', BOB)).json<RegionTallyView>();
    expect(bob.rows.map((row) => row.name)).toEqual(['#east', '#west']);
    // Quiet this month, named as the rows are (the page's names know no channel of it).
    expect(bob.quiet).toEqual(['Region 3']);
  });

  it('answers 304 for the tally the page has, and anew once it changed', async () => {
    const made = await setup();
    web = made.web;
    const etag = String((await made.ask()).headers.etag);
    expect((await made.ask('', ALICE, { 'if-none-match': etag })).statusCode).toBe(304);
    await made.activity.add(FAKE_GUILD_ID, [
      activityBucket(1, '2026-11', 4, 9, { regionId: 1, raids: 1, maxes: 0 }),
    ]);
    const later = await made.ask('', ALICE, { 'if-none-match': etag });
    expect(later.statusCode).toBe(200);
    expect(later.json<RegionTallyView>().total).toEqual({ raids: 13, maxes: 1 });
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    expect((await made.ask('', '200000000000000099')).statusCode).toBe(403);
    // Nothing of the server was read.
    expect(made.activity.reads).toBe(0);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask()).statusCode).toBe(503);
    expect(made.activity.reads).toBe(0);
  });

  it('refuses a period it does not know', async () => {
    const made = await setup();
    web = made.web;
    for (const query of ['?period=week', '?period=month&zone=UTC']) {
      expect((await made.ask(query)).statusCode, query).toBe(400);
    }
    expect(made.activity.reads).toBe(0);
  });

  it('answers one address only so often', async () => {
    const made = await setup();
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'Alice');
    let status = 0;
    for (let n = 0; n <= TALLY_PER_MINUTE; n++) {
      status = (await made.web.app.inject({ method: 'GET', url: URL, headers: { cookie } }))
        .statusCode;
    }
    expect(status).toBe(429);
  });
});
