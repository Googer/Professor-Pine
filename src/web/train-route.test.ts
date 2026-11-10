import { gymIdOf, gymStop, spotStop, stopKey } from '../domain/party/stops.js';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import type { WayspotDirectory } from '../services/wayspot-directory.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  TEST_OWNER_ID,
  trainWebWith,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { ROUTE_STOP_THROTTLE } from '../commands/trains/train-changes.js';
import { Throttles } from '../discord/throttle.js';
import { MAX_ROUTE_STOPS } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { SavedRoutesView, TrainAnswer } from '../domain/web/train-data.js';
import { MAP_WRITES_FULL, MAP_WRITES_PER_MINUTE, UNREACHABLE } from './acting.js';

const WEST = 1;

/**
 * A train of the party services of a test (`createdTrain`, made by `REPORTER`) on a route of
 * three gyms unless `stops` says otherwise, on the map: Alice signed up as coming and a member of
 * the server (fetched fresh as `Alice`), Bob a member who is not signed up, the bot's owner a
 * member (staff). The web server's clock is the parties' own.
 */
async function arranging(
  stops: readonly number[] = [4, 1, 7],
  options: { throttles?: Throttles; wayspots?: WayspotDirectory } = {},
) {
  const { wayspots } = options;
  const made = await createdTrain({ route: stops }, wayspots === undefined ? {} : { wayspots });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const throttles = options.throttles ?? new Throttles();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    users: made.users,
    ...(wayspots === undefined ? {} : { wayspots }),
  });
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(REPORTER, 'Reporter')
    .add(TEST_OWNER_ID, 'Owner');
  const acting = new FakeActingMembers()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(REPORTER, 'Reporter')
    .add(TEST_OWNER_ID, 'Owner');
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    trains: trainWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const edit = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/trains/${partyId}/route/${what}`,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<TrainAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const saved = async (sent = headers) => {
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/routes`,
      headers: { cookie: sent.cookie ?? '' },
    });
    return { status: answer.statusCode, json: answer.json<SavedRoutesView>() };
  };
  /** The lines said in the post since the setup, one by one. */
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.trains.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const route = () => made.current().train.route.map((ref) => gymIdOf(ref));
  return { made, ctx, web, acting, members, headers, edit, saved, lines, route, throttles, drawn };
}

describe("a train's route on the map", () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  describe('the map writes of a member in a minute (plan 8Z)', () => {
    /**
     * A route's stop added by Alice from a second address each time: the per-address limit, which
     * a household shares, is not what is tried here. `drawn` is stale, so nothing changes.
     */
    const writing = (map: Awaited<ReturnType<typeof arranging>>, sent = map.headers) => {
      let address = 0;
      return async () => {
        address += 1;
        const answer = await map.web.app.inject({
          method: 'POST',
          url: `/s/${FAKE_GUILD_ID}/api/trains/${map.made.party.id}/route/add`,
          headers: { ...sent, 'content-type': 'application/json' },
          payload: JSON.stringify({ drawn: ['nothing'], stop: '2' }),
          remoteAddress: `198.51.100.${address}`,
        });
        return {
          status: answer.statusCode,
          error: answer.json<{ error?: string }>().error,
          retryAfter: answer.headers['retry-after'],
        };
      };
    };

    it('are refused past the limit before the forced fetch, 429 with the wait, in words the route mode shows', async () => {
      const map = await arranging();
      web = map.web;
      const write = writing(map);
      for (let use = 0; use < MAP_WRITES_PER_MINUTE; use += 1) {
        expect((await write()).status).not.toBe(429);
      }
      expect(map.acting.asked).toHaveLength(MAP_WRITES_PER_MINUTE);
      expect(await write()).toEqual({ status: 429, error: MAP_WRITES_FULL, retryAfter: '60' });
      // No fetch for it.
      expect(map.acting.asked).toHaveLength(MAP_WRITES_PER_MINUTE);
      // Another member's own.
      const bob = await map.web.posting(BOB, 'Bob');
      expect((await writing(map, bob)()).status).not.toBe(429);
      // A minute on, room again.
      map.web.clock.now += 60_000;
      expect((await write()).status).not.toBe(429);
    });

    it('in the same words from one address, which holds room for more than one member', async () => {
      const map = await arranging();
      web = map.web;
      const fromHome = async (sent: Record<string, string>) => {
        const answer = await map.web.app.inject({
          method: 'POST',
          url: `/s/${FAKE_GUILD_ID}/api/trains/${map.made.party.id}/route/add`,
          headers: { ...sent, 'content-type': 'application/json' },
          payload: JSON.stringify({ drawn: ['nothing'], stop: '2' }),
          remoteAddress: '198.51.100.7',
        });
        return { status: answer.statusCode, error: answer.json<{ error?: string }>().error };
      };
      for (let use = 0; use < MAP_WRITES_PER_MINUTE; use += 1) {
        expect((await fromHome(map.headers)).status).not.toBe(429);
      }
      expect(await fromHome(map.headers)).toEqual({ status: 429, error: MAP_WRITES_FULL });
      // Another member at the same address still has theirs.
      const bob = await map.web.posting(BOB, 'Bob');
      expect((await fromHome(bob)).status).not.toBe(429);
    });
  });

  it("adds a gym as /route add does: the line in the post, the command's words as text, the train as it is now", async () => {
    const map = await arranging();
    web = map.web;
    const answer = await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Old Stone Fountain is stop 4 of the route.',
      train: { id: map.made.party.id, route: ['4', '1', '7', '2'], stop: 0 },
    });
    expect(map.route()).toEqual([4, 1, 7, 2]);
    expect(await map.lines()).toContain(
      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Old Stone Fountain**.`,
    );
  });

  it('removes, moves and clears as /route remove, move and clear do', async () => {
    const map = await arranging();
    web = map.web;
    const removed = await map.edit('remove', { drawn: ['4', '1', '7'], stop: 2 });
    expect(removed.json).toMatchObject({
      ok: true,
      text: 'The Stacks is off the route, which has 2 stops now.',
      train: { route: ['4', '7'] },
    });
    const moved = await map.edit('move', { drawn: ['4', '7'], from: 2, to: 1 });
    expect(moved.json).toMatchObject({
      ok: true,
      text:
        'Harbor Lighthouse Mural is stop 1 of the route now, before Veterans Memorial Bridge. ' +
        'The train is still at Veterans Memorial Bridge, now stop 2.',
      train: { route: ['7', '4'], stop: 1 },
    });
    // Clearing is for the conductor and the staff: the bot's owner.
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    const cleared = await map.edit('clear', { drawn: ['7', '4'] }, owner);
    expect(cleared.json).toMatchObject({
      ok: true,
      text: 'The route of this train is cleared.',
      train: { route: [], stop: null },
    });
    expect(map.route()).toEqual([]);
  });

  it('refuses an edit drawn from a route that changed meanwhile, and gives the route as it is now', async () => {
    const map = await arranging();
    web = map.web;
    await map.made.trains.addStop(map.made.party.id, { id: ALICE }, gymStop(2));
    const stale = await map.edit('remove', { drawn: ['4', '1', '7'], stop: 3 });
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({
      ok: false,
      text: 'The route changed meanwhile: here it is as it is now.',
      train: { route: ['4', '1', '7', '2'] },
    });
    expect((await map.edit('add', { drawn: ['4', '1'], stop: '3' })).status).toBe(409);
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    expect((await map.edit('clear', { drawn: [] }, owner)).status).toBe(409);
    expect((await map.edit('save', { drawn: ['4', '1', '7'], name: 'Old' })).status).toBe(409);
    expect(map.made.routes.rows).toEqual([]);
    expect(map.route()).toEqual([4, 1, 7, 2]);
  });

  it("takes only gyms of the server's regions (404 for any other, uncounted) and refuses what the route cannot take in the command's words", async () => {
    const throttles = new Throttles();
    const map = await arranging([4, 1, 7], { throttles });
    web = map.web;
    for (let use = 0; use < ROUTE_STOP_THROTTLE.uses - 1; use += 1) {
      throttles.use('route add', ALICE, ROUTE_STOP_THROTTLE, PARTY_NOW);
    }
    // Gym 10 lies in no region; no gym has the id 999.
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '10' })).status).toBe(404);
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '999' })).status).toBe(404);
    const twice = await map.edit('add', { drawn: ['4', '1', '7'], stop: '1' });
    expect(twice.status).toBe(422);
    expect(twice.json).toMatchObject({ ok: false, text: 'That stop is on the route already.' });
    const counted = await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' });
    expect(counted.status).toBe(429);
    expect(counted.json.error).toBe('You can do that again in 1 minute.');
  });

  it("adds a Power Spot of the server's regions by its key, in any region of the server, and none of another server or none kept as one (404)", async () => {
    // A power spot in West, one in East (another region of the server), one in the region of
    // another server, a Wayspot that is a PokéStop, a power spot an import found gone.
    const lake = keptRow(901, {
      kind: 'powerspot',
      title: 'Gazebo of the Lake',
      lat: 40.05,
      lon: -80.05,
    });
    const north = keptRow(903, {
      kind: 'powerspot',
      title: 'Gazebo of the Hill',
      lat: 40.25,
      lon: -80.05,
    });
    const stop = keptRow(904, { kind: 'stop', title: 'Little Bench', lat: 40.05, lon: -80.06 });
    const east = keptRow(905, {
      kind: 'powerspot',
      title: 'Harbor Anchor',
      lat: 40.05,
      lon: -79.95,
    });
    const gone = keptRow(906, { kind: 'powerspot', title: 'Old Kiosk', lat: 40.05, lon: -80.07 });
    const { storage, wayspots } = await wayspotsWith([lake, north, stop, east, gone]);
    await storage.saveFromImport({ upsert: [], remove: [], gone: [gone.id] }, 5_000);
    await wayspots.load();
    const map = await arranging([4, 1, 7], { wayspots });
    web = map.web;
    const added = await map.edit('add', { drawn: ['4', '1', '7'], stop: `w${lake.id}` });
    expect(added.status).toBe(200);
    expect(added.json).toMatchObject({
      ok: true,
      text: 'Gazebo of the Lake (Power Spot) is stop 4 of the route.',
      train: { route: ['4', '1', '7', `w${lake.id}`] },
    });
    expect(map.made.current().train.route.at(-1)).toEqual(spotStop(lake.id));
    const drawn = ['4', '1', '7', `w${lake.id}`];
    expect((await map.edit('add', { drawn, stop: `w${north.id}` })).status).toBe(404);
    expect((await map.edit('add', { drawn, stop: `w${stop.id}` })).status).toBe(404);
    expect((await map.edit('add', { drawn, stop: `w${wayspotId(999)}` })).status).toBe(404);
    expect((await map.edit('add', { drawn, stop: `w${gone.id}` })).status).toBe(404);
    expect(map.made.current().train.route).toHaveLength(4);
    // Another region of the same server is the train's server: the spot is added.
    const eastward = await map.edit('add', { drawn, stop: `w${east.id}` });
    expect(eastward.status).toBe(200);
    expect(map.made.current().train.route.at(-1)).toEqual(spotStop(east.id));
  });

  it(`refuses a stop beyond ${MAX_ROUTE_STOPS}`, async () => {
    const map = await arranging();
    web = map.web;
    const long = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => gymStop(1000 + index));
    await map.made.store.update(map.made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...party.train, route: long } } : party,
    }));
    const full = await map.edit('add', { drawn: long.map(stopKey), stop: '2' });
    expect(full.status).toBe(422);
    expect(full.json.text).toBe(`A route has at most ${MAX_ROUTE_STOPS} stops.`);
  });

  it("lets only who may arrange the route arrange it, in the command's words before its throttle: the signed up, the maker, the staff; clearing for the conductor and staff", async () => {
    const throttles = new Throttles();
    const map = await arranging([4, 1, 7], { throttles });
    web = map.web;
    const bob = await map.web.posting(BOB, 'Bob');
    const refused = await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' }, bob);
    expect(refused.status).toBe(403);
    // With the train as Bob sees it: the page draws the editor again, without its controls.
    expect(refused.json).toMatchObject({
      ok: false,
      text: 'You are not signed up for this train.',
      train: { route: ['4', '1', '7'], may: { arrange: false, clear: false, load: false } },
    });
    expect(throttles.use('route add', BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW)).toBeUndefined();
    const notLeading = await map.edit('clear', { drawn: ['4', '1', '7'] });
    expect(notLeading.status).toBe(403);
    expect(notLeading.json).toMatchObject({
      text: 'Only the conductor of this train and the moderators can do that.',
      train: { route: ['4', '1', '7'], may: { arrange: true, clear: false } },
    });
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' }, owner)).status).toBe(200);
    expect(map.route()).toEqual([4, 1, 7, 2]);
  });

  it("tells who may arrange the route in the train's view: the signed up and staff, the conductor clears", async () => {
    const map = await arranging();
    web = map.web;
    const viewOf = async (userId: string, name: string) => {
      const cookie = await map.web.loggedIn(userId, name);
      const answer = await map.web.app.inject({
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie },
      });
      return answer.json<PartiesView>().trains[0]?.may;
    };
    expect(await viewOf(ALICE, 'Alice')).toMatchObject({ arrange: true, clear: false });
    expect(await viewOf(BOB, 'Bob')).toMatchObject({ arrange: false, clear: false, load: false });
    expect(await viewOf(TEST_OWNER_ID, 'Owner')).toMatchObject({
      arrange: true,
      clear: true,
      load: true,
    });
    await map.made.trains.setConductor(map.made.party.id, { id: ALICE });
    expect(await viewOf(ALICE, 'Alice')).toMatchObject({ arrange: true, clear: true, load: true });
  });

  it('saves, lists, loads and forgets saved routes as /route save, load and forget do', async () => {
    const map = await arranging();
    web = map.web;
    expect((await map.saved()).json).toEqual({ routes: [] });
    const saved = await map.edit('save', { drawn: ['4', '1', '7'], name: 'Downtown' });
    expect(saved.json).toMatchObject({
      ok: true,
      text:
        'I saved this route as Downtown: 3 stops. At the end it finishes the route. ' +
        '/route load puts it into a train of this region.',
    });
    const listed = (await map.saved()).json.routes;
    expect(listed.map(({ id: _id, ...route }) => route)).toEqual([
      { name: 'Downtown', stops: 3, atEnd: 'finish' },
    ]);
    const id = listed[0]?.id;
    expect(id).toBe(map.made.routes.rows[0]?.id);
    await map.edit(
      'clear',
      { drawn: ['4', '1', '7'] },
      await map.web.posting(TEST_OWNER_ID, 'Owner'),
    );
    const loaded = await map.edit('load', { drawn: [], route: id });
    expect(loaded.json).toMatchObject({
      ok: true,
      text: 'This train has the route Downtown now: 3 stops. It is at the first. At the end it finishes the route.',
      train: { route: ['4', '1', '7'], stop: 0 },
    });
    const forgotten = await map.edit('forget', { route: id });
    expect(forgotten.json).toMatchObject({ ok: true, text: 'I forgot your saved route Downtown.' });
    expect((await map.saved()).json).toEqual({ routes: [] });
  });

  it("knows only the member's own saved routes of the train's region", async () => {
    const map = await arranging();
    web = map.web;
    const bobs = map.made.routes.add(BOB, WEST, 'Bobs', [2, 3]);
    const theirs = await map.edit('load', { drawn: ['4', '1', '7'], route: bobs.id });
    expect(theirs.status).toBe(422);
    expect(theirs.json.text).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
    expect((await map.edit('forget', { route: bobs.id })).status).toBe(422);
    expect(map.made.routes.rows).toHaveLength(1);
    expect((await map.saved()).json.routes).toEqual([]);
  });

  it("answers a train that is over, another party's id or another server's as the commands do: 409", async () => {
    const map = await arranging();
    web = map.web;
    const meetup = await createdMeetup();
    const notATrain = await map.edit('add', { drawn: [], stop: '2' }, map.headers, meetup.party.id);
    expect(notATrain.status).toBe(409);
    expect(notATrain.json).toEqual({ ok: false, text: 'This train is over.' });
    await map.made.service.end(map.made.party.id);
    const over = await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' });
    expect(over.status).toBe(409);
    expect(over.json).toEqual({ ok: false, text: 'This train is over.' });
    expect((await map.saved()).status).toBe(409);
  });

  it("refuses a member kept out of the train's forum (403), and nothing while Discord cannot say (503)", async () => {
    const map = await arranging();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' })).status).toBe(403);
    expect((await map.saved()).status).toBe(403);
    map.made.gateway.barred.clear();
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' });
    expect(away.status).toBe(503);
    expect(away.json.error).toBe(UNREACHABLE);
    expect(map.route()).toEqual([4, 1, 7]);
  });

  it('gives the use back when an edit fails for no fault of the member, as /route add does', async () => {
    const throttles = new Throttles();
    const map = await arranging(undefined, { throttles });
    web = map.web;
    for (let n = 0; n < ROUTE_STOP_THROTTLE.uses - 1; n++) {
      throttles.use('route add', ALICE, ROUTE_STOP_THROTTLE, PARTY_NOW);
    }
    const update = vi
      .spyOn(map.made.store, 'update')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' })).status).toBe(500);
    update.mockRestore();
    // The failed one did not count: the window still has room for one.
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' })).status).toBe(200);
  });

  it('knows only its edits (404) and their bodies (400)', async () => {
    const map = await arranging();
    web = map.web;
    expect((await map.edit('reverse', { drawn: ['4', '1', '7'] })).status).toBe(404);
    expect((await map.edit('add', { stop: '2' })).status).toBe(400);
    // A stop is named by its key (plan 8X-4): the gym of before, or what is no key, is none.
    expect((await map.edit('add', { drawn: ['4', '1', '7'], gym: 2 })).status).toBe(400);
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: 'g:2' })).status).toBe(400);
    expect((await map.edit('remove', { drawn: ['4', '1', '7'], stop: 'two' })).status).toBe(400);
    expect((await map.edit('save', { drawn: ['4', '1', '7'], name: 'x'.repeat(81) })).status).toBe(
      400,
    );
    expect(map.route()).toEqual([4, 1, 7]);
  });

  it('logs an edit as a command is logged: who, where, which train, what; never a name', async () => {
    const map = await arranging();
    web = map.web;
    await map.edit('save', { drawn: ['4', '1', '7'], name: 'Secret loop' });
    const logged = map.web.entries.find(
      (entry) => entry.msg === "a train's route was changed on the map",
    );
    expect(logged).toMatchObject({
      user: ALICE,
      guild: FAKE_GUILD_ID,
      party: map.made.party.id,
      edit: 'save',
      outcome: 'ok',
    });
    expect(JSON.stringify(logged)).not.toMatch(/Secret/u);
  });
  it('answers an edit of the route once the post shows it (plan 8M-11A, S1): the ticket taken after the change', async () => {
    const map = await arranging();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' })).status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
