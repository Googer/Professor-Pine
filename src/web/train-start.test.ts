import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { dmBrief } from '../../test/support/messages.js';
import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  trainWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
import { OPEN_PARTIES_FULL } from '../commands/parties/open-parties.js';
import { MAX_OPEN_PARTIES } from '../domain/party/open-parties.js';
import { testTrain } from '../../test/support/parties.js';
import { Throttles } from '../discord/throttle.js';
import { isTrain, type TrainParty } from '../domain/party/party.js';
import { PartyStatus, RaidPrivacy } from '../domain/party/status.js';
import type { TrainAnswer } from '../domain/web/train-data.js';
import { UNREACHABLE } from './acting.js';

const START = `/s/${FAKE_GUILD_ID}/api/trains`;

/**
 * The map of a server with the party services of a test and no train yet: Alice a member (in
 * the directory, and fetched fresh as `Alice` of team mystic), Bob a member, the clock the
 * parties' own, the channels named `west` and `east` as the bot sees them.
 */
async function starting(options: { throttles?: Throttles } = {}) {
  const throttles = options.throttles ?? new Throttles();
  const made = await partyServiceWith([]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    users: made.users,
  });
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
    [UNBOUNDED_CHANNEL, 'unbounded'],
  ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    trains: trainWebWith(ctx, { channelName: (id) => names.get(id) }),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const start = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: START,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<TrainAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const trains = (): TrainParty[] => made.store.active().filter(isTrain);
  return { made, ctx, web, acting, members, headers, start, trains, throttles };
}

describe('starting a train on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("makes a train as /train does, in the region picked, with its start read as /meet reads it: the member signed up, the command's words as text, the train as the map shows it", async () => {
    const map = await starting();
    web = map.web;
    await map.made.newTrains.set(BOB, map.made.gateway.guildId, true, 1);
    const answer = await map.start({ region: 1, name: 'Park loop', time: '6:15pm' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'Your train is made. It starts at 6:15 PM. Tap gyms or Power Spots on the map to add stops to its route.',
      train: {
        kind: 'train',
        name: 'Park loop',
        startTime: at('2026-10-13T18:15'),
        route: [],
        stop: null,
        attendance: { mine: { status: 'interested', group: 'A' } },
      },
    });
    const [made] = map.trains();
    expect(made).toMatchObject({
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      anonymous: false,
      timed: { name: 'Park loop', startTime: at('2026-10-13T18:15') },
      train: { atEnd: 'finish' },
      attendees: { [ALICE]: { status: PartyStatus.Interested, name: 'Alice', team: 'mystic' } },
    });
    expect(answer.json.train?.id).toBe(made?.id);
    // The train is made with its start: its post says it from the first, and so does the DM of
    // who asked to hear of new trains.
    await map.made.notify.flush();
    const [told] = map.made.dms.to(BOB);
    expect(dmBrief(told).join('\n')).toContain(`<t:${String(at('2026-10-13T18:15') / 1000)}:`);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a train was started on the map',
        user: ALICE,
        guild: FAKE_GUILD_ID,
        region: 1,
        outcome: 'made',
      }),
    );
  });

  it("follows the maker's privacy and automatic status, and the mode picked, as /train does; without a time it has none", async () => {
    const map = await starting();
    web = map.web;
    map.made.userSettings.set(ALICE, {
      raidPrivacy: RaidPrivacy.Anonymous,
      autoStatus: PartyStatus.NotInterested,
    });
    const answer = await map.start({ region: 2, name: 'East loop', atEnd: 'loop' });
    expect(answer.status).toBe(200);
    // Not signed up: said as /train says it.
    expect(answer.json.text).toBe(
      'Your train is made. Tap gyms or Power Spots on the map to add stops to its route. You are not signed up for ' +
        'it, as your status is None (in /settings on Discord): sign up in its popup or its post to move ' +
        'the train or to be its conductor.',
    );
    expect(answer.json.train).toMatchObject({ startTime: null, attendance: { mine: null } });
    expect(map.trains()[0]).toMatchObject({
      anonymous: true,
      attendees: {},
      timed: { startTime: null },
      train: { atEnd: 'loop' },
    });
  });

  // Plan 8X-5: the kind of `/train kind:` (8X-4), a raid train when none is given.
  it('makes a train of the kind picked, as /train kind: does, and a raid train without one', async () => {
    const map = await starting();
    web = map.web;
    const giga = await map.start({ region: 1, name: 'Wild Area', kind: 'gigantamax' });
    expect(giga.status).toBe(200);
    expect(giga.json.train).toMatchObject({
      trainKind: 'gigantamax',
      trainKindWords: 'Gigantamax Train',
    });
    const plain = await map.start(
      { region: 1, name: 'Park loop' },
      await map.web.posting(BOB, 'Bob'),
    );
    expect(plain.json.train).toMatchObject({ trainKind: 'raid', trainKindWords: 'Raid Train' });
    expect(
      map
        .trains()
        .map((train) => train.train.kind)
        .sort(),
    ).toEqual(['gigantamax', 'raid']);
    expect((await map.start({ region: 1, name: 'Park loop', kind: 'max' })).status).toBe(400);
  });

  it("refuses what /train's guard and /meet's reader refuse, in their words as text, before its throttle", async () => {
    const throttles = new Throttles();
    const map = await starting({ throttles });
    web = map.web;
    // One use of /train is left in its window.
    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
    const blank = await map.start({ region: 1, name: '   ' });
    expect(blank.status).toBe(422);
    expect(blank.json).toEqual({ ok: false, text: 'Give a name of 1 to 80 characters.' });
    const unread = await map.start({ region: 1, name: 'Park loop', time: 'soonish' });
    expect(unread.status).toBe(422);
    expect(unread.json.text).toMatch(/^I could not read "soonish" as the time the train starts\./);
    // A word that removes a time, of a train that has none yet: refused as /train refuses it.
    const removal = await map.start({ region: 1, name: 'Park loop', time: 'none' });
    expect(removal.status).toBe(422);
    // In /train's words, as the page shows them (no Markdown).
    expect(removal.json.text).toBe('A new train has no start to remove: leave start out.');
    const noForum = await map.start({ region: 3, name: 'Park loop' });
    expect(noForum.status).toBe(422);
    expect(noForum.json.text).toBe(
      'The region #unbounded has no forum yet. A moderator can create it with /admin setup-forums.',
    );
    expect(map.trains()).toEqual([]);
    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
    const again = await map.start({ region: 1, name: 'Second loop' });
    expect(again.status).toBe(429);
    expect(again.json.error).toBe('You can do that again in 15 minutes.');
    expect(again.headers['retry-after']).toBeDefined();
  });

  it('says plainly that the bot may not make posts in the forum, and does not count it', async () => {
    const map = await starting();
    web = map.web;
    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 2; n++) {
      const refused = await map.start({ region: 1, name: 'Park loop' });
      expect(refused.status).toBe(422);
      expect(refused.json).toMatchObject({ ok: false });
      expect(JSON.stringify(refused.json)).toContain('I lack the permission Manage Posts there.');
    }
    map.made.gateway.refusePosts.delete(WEST_FORUM);
    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
    expect((await map.start({ region: 1, name: 'Lake loop' })).status).toBe(200);
    expect((await map.start({ region: 1, name: 'Hill loop' })).status).toBe(429);
  });

  it('gives the use back when the train could not be started for no fault of the member', async () => {
    const map = await starting();
    web = map.web;
    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
    for (let n = 0; n < 2; n++) {
      expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(500);
    }
    map.made.gateway.failing.delete('createPost');
    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
    expect((await map.start({ region: 1, name: 'Lake loop' })).status).toBe(200);
    expect((await map.start({ region: 1, name: 'Hill loop' })).status).toBe(429);
  });

  it('refuses past the cap of open trains and meetups (plan 8Z), uncounted; others not held by it', async () => {
    const throttles = new Throttles();
    const map = await starting({ throttles });
    web = map.web;
    for (let n = 0; n < MAX_OPEN_PARTIES; n += 1) {
      await map.made.store.add({
        ...testTrain({ id: `00000000-0000-4000-8000-00000000010${n}`, createdById: ALICE }),
        forumChannelId: WEST_FORUM,
        forumPostId: `30000000000000010${n}`,
      });
    }
    const refused = await map.start({ region: 1, name: 'One more' });
    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: OPEN_PARTIES_FULL } });
    expect(throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW)).toBeUndefined();
    expect(throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW)).toBeUndefined();
    const bob = await map.web.posting(BOB, 'Bob');
    expect((await map.start({ region: 1, name: 'Of Bob' }, bob)).status).toBe(200);
  });

  it('counts in the window of /train: two from the map and Discord together', async () => {
    const throttles = new Throttles();
    const map = await starting({ throttles });
    web = map.web;
    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(429);
    expect(map.trains()).toEqual([]);
  });

  it('knows no region of another server or none at all (404), and refuses a body that is not the form', async () => {
    const map = await starting();
    web = map.web;
    map.made.regions.rows.push({
      id: 9,
      guildId: 2,
      channelId: '100000000000000099',
      description: null,
      bounds: null,
      forumChannelId: '100000000000000098',
      summaryMessageId: null,
    });
    expect((await map.start({ region: 9, name: 'Park loop' })).status).toBe(404);
    expect((await map.start({ region: 77, name: 'Park loop' })).status).toBe(404);
    expect((await map.start({ region: 1, name: 'Park loop', at: 'end' })).status).toBe(400);
    expect((await map.start({ region: 1, name: 'x'.repeat(81) })).status).toBe(400);
    expect((await map.start({ region: 1, name: 'Park loop', atEnd: 'around' })).status).toBe(400);
    expect(map.trains()).toEqual([]);
  });

  it("refuses a member kept out of the region's forum (403), and nothing while Discord cannot say (503)", async () => {
    const map = await starting();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(403);
    map.made.gateway.barred.clear();
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.start({ region: 1, name: 'Park loop' });
    expect(away.status).toBe(503);
    expect(away.json.error).toBe(UNREACHABLE);
    expect(map.trains()).toEqual([]);
  });

  it('is for members who may act: nobody else starts a train', async () => {
    const map = await starting();
    web = map.web;
    const stranger = await map.web.posting('300000000000000009', 'Stranger');
    expect((await map.start({ region: 1, name: 'Park loop' }, stranger)).status).toBe(403);
    map.acting.holdBack(ALICE, 'timed-out');
    expect((await map.start({ region: 1, name: 'Park loop' })).json.error).toBe(
      'You are timed out in this server, so you cannot do that now.',
    );
    const { 'x-pine-csrf': _token, ...noToken } = map.headers;
    expect((await map.start({ region: 1, name: 'Park loop' }, noToken)).status).toBe(403);
    expect(map.trains()).toEqual([]);
  });
});
