import { afterEach, describe, expect, it } from 'vitest';
import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { MOD } from '../../test/support/meetup-safety-cases.js';
import {
  MOD_CHANNEL,
  meetupSafetyWith,
  type SafetyOptions,
} from '../../test/support/meetup-safety-service.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { textOf } from '../../test/support/messages.js';
import { ALICE, at, BOB, PARTY_NOW, testTrain } from '../../test/support/parties.js';
import { OPEN_PARTIES_FULL } from '../commands/parties/open-parties.js';
import { MAX_OPEN_PARTIES } from '../domain/party/open-parties.js';
import { createTestContext } from '../../test/support/test-context.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import {
  FakeActingMembers,
  meetupWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import {
  MEETUP_HELD,
  MEETUP_NOT_SENT,
  MEETUP_THROTTLE,
  MEETUP_TOO_SOON,
  NO_INFORMATION,
  NO_MEETUP_HERE,
  ASK_ON_DISCORD,
} from '../commands/meetups/meetup.js';
import { Throttles } from '../discord/throttle.js';
import { isMeetup, type MeetupParty } from '../domain/party/party.js';
import { MAX_MAP_STOPS, type MeetupAnswer, type StopsView } from '../domain/web/meetup-data.js';
import type { WayspotRow } from '../domain/wayspots/kept.js';
import { MAP_PLACE_KINDS_ONLY, MAP_BLOCKED } from './meetup-routes.js';

const MAKE = `/s/${FAKE_GUILD_ID}/api/meetups`;

/** A PokéStop in West that no flagged word names, and one that a flagged word does. */
const FOUNTAIN_STOP = keptRow(1, { lat: 40.061, lon: -80.061, title: 'Market Fountain' });
const LIBRARY_STOP = keptRow(2, { lat: 40.062, lon: -80.062, title: 'Little Free Library' });
/** A power spot in West, and a stop without a title. */
const POWER_SPOT = keptRow(3, { lat: 40.063, lon: -80.063, kind: 'powerspot', title: 'Salon' });

/**
 * The map of a server with meetup safety (on, by default, with the moderators' channel) and the
 * kept stops above: Alice and Bob members (Alice fetched fresh as `Alice` of team mystic), the
 * clock the parties' own, the channels named `west` and `east`.
 */
async function making(
  safety: SafetyOptions = {},
  options: { throttles?: Throttles } = {},
  stops: readonly WayspotRow[] = [],
) {
  const throttles = options.throttles ?? new Throttles();
  const made = await meetupSafetyWith(safety);
  const { wayspots } = await wayspotsWith([FOUNTAIN_STOP, LIBRARY_STOP, POWER_SPOT, ...stops]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
    wayspots,
  });
  await ctx.placeFinder.built();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [WEST_FORUM, 'west-meetups'],
    [EAST_CHANNEL, 'east'],
    [UNBOUNDED_CHANNEL, 'unbounded'],
  ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    meetups: meetupWebWith(ctx, { channelName: (id) => names.get(id) }),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const make = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: MAKE,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<MeetupAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  const meetups = (): MeetupParty[] => made.store.active().filter(isMeetup);
  return { made, ctx, web, acting, members, headers, make, meetups, throttles };
}

/** A meetup at a place, at six, in West, as the form sends it. */
function asked(place: unknown, more: object = {}) {
  return { region: 1, name: 'Picnic', place, start: '6pm', info: 'Bring snacks.', ...more };
}

describe('making a meetup on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('makes a meetup at a gym as /meetup does: the same snapshot of the place, its start and information, the maker signed up', async () => {
    const map = await making();
    web = map.web;
    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      outcome: 'posted',
      text: 'Your meetup is made. To change its name, information or times, use Manage… in its popup.',
      meetup: { kind: 'meetup', name: 'Picnic', startTime: at('2026-10-13T18:00') },
    });
    const [made] = map.meetups();
    expect(made).toMatchObject({
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      timed: { name: 'Picnic', startTime: at('2026-10-13T18:00') },
      meetup: {
        description: 'Bring snacks.',
        // As `namedPlace` makes it: the gym by the name its post shows, the nickname first.
        place: { kind: 'gym', id: '1', title: 'The Stacks', lat: 40.05, lon: -80.05 },
      },
    });
    expect(answer.json.meetup?.id).toBe(made?.id);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a meetup was made on the map',
        user: ALICE,
        guild: FAKE_GUILD_ID,
        region: 1,
        outcome: 'posted',
      }),
    );
  });

  it('takes an end as /meetup end: does, in its words, and a meetup held for the moderators keeps it', async () => {
    const map = await making();
    web = map.web;
    const early = await map.make(asked({ kind: 'gym', id: '1' }, { end: '5pm' }));
    expect(early.status).toBe(422);
    expect(early.json.text).toMatch(/^"5pm" cannot be the time the meetup ends/);
    const same = await map.make(asked({ kind: 'gym', id: '1' }, { end: '6pm' }));
    expect(same).toMatchObject({
      status: 422,
      json: {
        text: 'A meetup cannot end before it starts. Give a later end, or change the start first with /meet.',
      },
    });
    const unread = await map.make(asked({ kind: 'gym', id: '1' }, { end: 'later' }));
    expect(unread.status).toBe(422);
    expect(unread.json.text).toMatch(/^I could not read "later" as the time the meetup ends\./);
    expect(map.meetups()).toEqual([]);
    // Neither counted.
    const made = await map.make(asked({ kind: 'gym', id: '1' }, { end: '8pm' }));
    expect(made.status).toBe(200);
    expect(map.meetups()[0]?.endTime).toBe(at('2026-10-13T20:00'));
    const held = await map.make(asked({ lat: 40.0805, lon: -80.0805 }, { end: '8pm' }));
    expect(held.json.outcome).toBe('held');
    const [request] = map.made.storage.requests.values();
    expect(request?.endTime).toBe(at('2026-10-13T20:00'));
    // `none`, or no end at all (a page from before), is no end.
    map.web.clock.now += 16 * 60_000;
    const none = await map.make(asked({ kind: 'gym', id: '3' }, { name: 'Open end', end: 'none' }));
    expect(none.status).toBe(200);
    expect(map.meetups().find((one) => one.timed.name === 'Open end')?.endTime).toBeNull();
  });

  it('makes one at a PokéStop as a pick of /meetup near: makes it', async () => {
    const map = await making();
    web = map.web;
    const answer = await map.make(asked({ kind: 'stop', id: wayspotId(1) }));
    expect(answer.status).toBe(200);
    expect(map.meetups()[0]?.meetup.place).toEqual({
      kind: 'stop',
      id: wayspotId(1),
      title: 'Market Fountain',
      lat: 40.061,
      lon: -80.061,
      address: FOUNTAIN_STOP.address,
      image: FOUNTAIN_STOP.image,
    });
  });

  it('holds a pin for the moderators, whose post says it was asked for on the map', async () => {
    const map = await making();
    web = map.web;
    const answer = await map.make(asked({ lat: 40.0805, lon: -80.0805 }));
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ ok: true, outcome: 'held', text: MEETUP_HELD });
    expect(map.meetups()).toEqual([]);
    const [request] = map.made.storage.requests.values();
    expect(request).toMatchObject({
      source: 'map',
      place: { kind: 'pin', lat: 40.0805, lon: -80.0805, linkName: null },
      regionChannelId: WEST_CHANNEL,
    });
    const [post] = map.made.gateway.messagesIn(MOD_CHANNEL);
    expect(textOf(post?.message)).toContain(` on the map in <#${WEST_CHANNEL}>`);
  });

  it('holds a flagged PokéStop too, and a pin is named by the nearest gym or stop alone', async () => {
    const map = await making();
    web = map.web;
    expect((await map.make(asked({ kind: 'stop', id: wayspotId(2) }))).json.outcome).toBe('held');
    // Beside the power spot alone: never named by it; beside a stop, by the stop.
    await map.make(asked({ lat: 40.0631, lon: -80.0631 }));
    // Past `/meetup`'s window of two a quarter of an hour.
    map.web.clock.now += 16 * 60_000;
    await map.make(asked({ lat: 40.0611, lon: -80.0611 }));
    const pins = [...map.made.storage.requests.values()].map((request) => request.place);
    expect(pins[1]).toMatchObject({ kind: 'pin', near: null });
    expect(pins[2]).toMatchObject({
      kind: 'pin',
      near: { kind: 'stop', title: 'Market Fountain' },
    });
  });

  it('refuses a Power Spot and any place that is no gym, PokéStop or pin, and counts none of it', async () => {
    const map = await making();
    web = map.web;
    for (const kind of ['powerspot', 'portal']) {
      const answer = await map.make(asked({ kind, id: wayspotId(3) }));
      expect(answer.status).toBe(422);
      expect(answer.json).toEqual({ ok: false, text: MAP_PLACE_KINDS_ONLY });
    }
    // A gym of no region of the server, a stop gone, a pin outside the regions.
    expect((await map.make(asked({ kind: 'gym', id: '10' }))).status).toBe(422);
    expect((await map.make(asked({ kind: 'stop', id: wayspotId(99) }))).status).toBe(422);
    expect((await map.make(asked({ lat: 40.5, lon: -80.05 }))).status).toBe(422);
    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
  });

  it('refuses past the cap of open trains and meetups (plan 8Z), before its limit; requests waiting count', async () => {
    const map = await making();
    web = map.web;
    for (let n = 0; n < MAX_OPEN_PARTIES - 1; n += 1) {
      await map.made.store.add({
        ...testTrain({ id: `00000000-0000-4000-8000-00000000010${n}`, createdById: ALICE }),
        forumChannelId: WEST_FORUM,
        forumPostId: `30000000000000010${n}`,
      });
    }
    await map.made.held({ maker: { id: ALICE, name: 'Alice' } });
    const refused = await map.make(asked({ kind: 'gym', id: '2' }));
    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: OPEN_PARTIES_FULL } });
    expect(map.meetups()).toEqual([]);
    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
  });

  it("refuses in /meetup's words what its guards refuse, before its limit: a place refused for good, a start too soon to review, a start it cannot read, a bad name, no information", async () => {
    const map = await making();
    web = map.web;
    await map.made.storage.rule(FAKE_GUILD_ID, { kind: 'gym', id: '2' }, 'refuse', MOD);
    const refused = await map.make(asked({ kind: 'gym', id: '2' }));
    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: NO_MEETUP_HERE } });
    // Refused long enough ago: the members may ask the moderators, on Discord.
    await map.made.storage.rule(FAKE_GUILD_ID, { kind: 'gym', id: '2' }, 'refuse', {
      ...MOD,
      at: PARTY_NOW - 15 * 24 * 3_600_000,
    });
    expect((await map.make(asked({ kind: 'gym', id: '2' }))).json).toEqual({
      ok: false,
      text: `${NO_MEETUP_HERE} ${ASK_ON_DISCORD}`,
    });
    const soon = await map.make(asked({ lat: 40.08, lon: -80.08 }, { start: 'in 30' }));
    expect(soon).toMatchObject({ status: 422, json: { ok: false, text: MEETUP_TOO_SOON } });
    const unread = await map.make(asked({ kind: 'gym', id: '1' }, { start: 'whenever' }));
    expect(unread.status).toBe(422);
    expect(unread.json.text).toContain(
      'I could not read "whenever" as the time the meetup starts.',
    );
    const blank = await map.make(asked({ kind: 'gym', id: '1' }, { name: '   ' }));
    expect(blank).toMatchObject({
      status: 422,
      json: { text: 'Give a name of 1 to 80 characters.' },
    });
    const empty = await map.make(asked({ kind: 'gym', id: '1' }, { info: ' \n ' }));
    expect(empty).toMatchObject({ status: 422, json: { ok: false, text: NO_INFORMATION } });
    expect(map.meetups()).toEqual([]);
    // None of them counted: both of the quarter-hour's meetups may still be made.
    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
  });

  it("counts a meetup in /meetup's own window, shared with the command", async () => {
    const throttles = new Throttles();
    throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW);
    const map = await making({}, { throttles });
    web = map.web;
    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
    const third = await map.make(asked({ kind: 'gym', id: '3' }));
    expect(third.status).toBe(429);
    expect(third.json.error).toMatch(/^You can do that again in /);
    expect(third.headers['retry-after']).toBeDefined();
    expect(map.meetups()).toHaveLength(1);
  });

  it('tells a blocked member so without an Appeal, pointing them to /meetup, before reading the place, uncounted', async () => {
    const map = await making();
    web = map.web;
    await map.made.storage.addBlock(FAKE_GUILD_ID, ALICE, MOD);
    const answer = await map.make(asked({ kind: 'powerspot', id: wayspotId(3) }));
    expect(answer).toMatchObject({ status: 403, json: { ok: false, text: MAP_BLOCKED } });
    expect(MAP_BLOCKED).toContain('/meetup');
    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
  });

  it('tells a member blocked after the check so, without an Appeal, and posts nothing', async () => {
    const map = await making();
    web = map.web;
    // The route reads the block once and finds none; `make` reads it again and finds one.
    const { storage } = map.made;
    const block = storage.block.bind(storage);
    let reads = 0;
    storage.block = async (serverId, memberId) => {
      reads += 1;
      if (reads === 1) return undefined;
      await storage.addBlock(serverId, memberId, MOD);
      return block(serverId, memberId);
    };
    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
    expect(answer).toEqual({
      status: 403,
      json: { ok: false, text: MAP_BLOCKED },
      headers: expect.anything() as unknown,
    });
    expect(map.meetups()).toEqual([]);
  });

  it('gives the use back when the meetup could not be made for no fault of the member', async () => {
    const map = await making();
    web = map.web;
    map.made.gateway.failing.set('createPost', new Error('Discord is away'));
    for (let n = 0; n < 2; n++) {
      expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(500);
    }
    map.made.gateway.failing.delete('createPost');
    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(429);
  });

  it('says plainly that the bot may not make posts in the forum, the forum by its name, and does not count it', async () => {
    const map = await making();
    web = map.web;
    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 2; n++) {
      expect(await map.make(asked({ kind: 'gym', id: '1' }))).toMatchObject({
        status: 422,
        json: {
          ok: false,
          text:
            'I am not allowed to make posts in #west-meetups: I lack the permission Manage Posts ' +
            "there. Nothing was made. The server's staff must give it to me.",
        },
      });
    }
    map.made.gateway.refusePosts.delete(WEST_FORUM);
    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(429);
  });

  it("says in /meetup's words that the moderators could not be asked, and keeps nothing", async () => {
    const map = await making({ channel: false });
    web = map.web;
    const answer = await map.make(asked({ lat: 40.0805, lon: -80.0805 }));
    expect(answer).toMatchObject({ status: 422, json: { ok: false, text: MEETUP_NOT_SENT } });
    expect(map.made.storage.requests.size).toBe(0);
  });

  it('says a region lost its forum when it did so while the meetup was being made', async () => {
    const map = await making();
    web = map.web;
    // The forum is asked about last before the meetup is made: it goes then.
    const { gateway, regions } = map.made;
    const access = gateway.memberAccess.bind(gateway);
    gateway.memberAccess = (forumId, memberId) => {
      regions.rows = regions.rows.map((row) =>
        row.id === 1 ? { ...row, forumChannelId: null } : row,
      );
      return access(forumId, memberId);
    };
    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
    expect(answer).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'The region #west has no forum yet. A moderator can create it with /admin setup-forums.',
      },
    });
    expect(map.meetups()).toEqual([]);
  });

  it('lets staff skip the check: a pin of a moderator is posted at once', async () => {
    const map = await making();
    web = map.web;
    map.members.standing(BOB, { roleNames: ['Moderator'], roleIds: [], administrator: false });
    map.acting.standing(BOB, { roleNames: ['Moderator'], roleIds: [], administrator: false });
    const answer = await map.make(
      asked({ lat: 40.0805, lon: -80.0805 }),
      await map.web.posting(BOB, 'Bob'),
    );
    expect(answer.json).toMatchObject({ ok: true, outcome: 'posted' });
    expect(map.meetups()[0]?.meetup.place).toMatchObject({ kind: 'pin' });
    expect(map.made.storage.requests.size).toBe(0);
  });

  it('posts every place at once while the safety is off', async () => {
    const map = await making({ moderation: null });
    web = map.web;
    expect((await map.make(asked({ lat: 40.0805, lon: -80.0805 }))).json.outcome).toBe('posted');
  });

  it('knows the regions of this server alone, says a region has no forum, and keeps out who is barred from its forum', async () => {
    const map = await making();
    web = map.web;
    expect((await map.make(asked({ kind: 'gym', id: '1' }, { region: 99 }))).status).toBe(404);
    const unbounded = await map.make(asked({ kind: 'gym', id: '1' }, { region: 3 }));
    expect(unbounded).toMatchObject({
      status: 422,
      json: {
        ok: false,
        text: 'The region #unbounded has no forum yet. A moderator can create it with /admin setup-forums.',
      },
    });
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(403);
    // Any region of the server, whatever the place's: a meetup in East at a gym of West.
    const east = await map.make(asked({ kind: 'gym', id: '1' }, { region: 2 }));
    expect(east.status).toBe(200);
  });

  it('refuses a malformed body, and anybody who is no member or not logged in', async () => {
    const map = await making();
    web = map.web;
    expect((await map.make({ ...asked({ kind: 'gym', id: '1' }), extra: 1 })).status).toBe(400);
    expect((await map.make(asked({ gym: 1 }))).status).toBe(400);
    const stranger = await map.web.posting('200000000000000099', 'Stranger');
    expect((await map.make(asked({ kind: 'gym', id: '1' }), stranger)).status).toBe(403);
    const answer = await map.web.app.inject({
      method: 'POST',
      url: MAKE,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(asked({ kind: 'gym', id: '1' })),
    });
    expect(answer.statusCode).toBe(403);
    expect(map.meetups()).toEqual([]);
  });

  it('logs a refused meetup too, one line with what refused it; never a text or the place', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < MEETUP_THROTTLE.uses; n++) {
      throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW);
    }
    const map = await making({}, { throttles });
    web = map.web;
    await map.make(asked({ kind: 'gym', id: '1' }, { region: 99 }));
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await map.make(asked({ kind: 'gym', id: '1' }));
    map.made.gateway.barred.delete(WEST_FORUM);
    await map.make(asked({ kind: 'gym', id: '1' }, { start: 'whenever suits us' }));
    await map.make(asked({ kind: 'gym', id: '1' }));
    const logged = map.web.entries.filter((entry) => entry.msg === 'a meetup was made on the map');
    expect(logged.map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
      'no-region',
      'barred',
      'refused',
      'throttled',
    ]);
    expect(logged[1]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, region: 1 });
    expect(JSON.stringify(map.web.entries)).not.toContain('whenever suits us');
  });
});

describe('the PokéStops of a box of the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  /** The stops in a box, asked by `cookie`. */
  const stopsIn = async (map: TestWeb, cookie: string | undefined, box: string) => {
    const answer = await map.app.inject({
      method: 'GET',
      url: `/s/${FAKE_GUILD_ID}/api/stops?${box}`,
      headers: cookie === undefined ? {} : { cookie },
    });
    return { status: answer.statusCode, json: answer.json<StopsView>() };
  };

  it('gives a member the titled stops of the server in the box, nearest to its middle first, never a Power Spot', async () => {
    const map = await making();
    web = map.web;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const answer = await stopsIn(
      map.web,
      cookie,
      'south=40.06&west=-80.07&north=40.07&east=-80.06',
    );
    expect(answer.status).toBe(200);
    const shown = answer.json;
    expect(shown.more).toBe(false);
    expect(shown.stops.map((stop) => stop.slice(0, 4))).toEqual([
      [wayspotId(2), 40.062, -80.062, 'Little Free Library'],
      [wayspotId(1), 40.061, -80.061, 'Market Fountain'],
    ]);
    // Its address as one line, for the popup's head (Matt, 2026-11-01); null where none is known.
    expect(shown.stops[1]?.[4]).toBe(wayspotAddressLine(FOUNTAIN_STOP.address) || null);
    const outside = await stopsIn(map.web, cookie, 'south=40.2&west=-80.1&north=40.3&east=-80.0');
    expect(outside.json).toEqual({ stops: [], more: false });
  });

  // Plan 8M-11A: the Report button's research and Rocket list the nearest stops, wherever they are.
  it('gives the nearest stops of a point, as many as asked, never a Power Spot', async () => {
    const map = await making();
    web = map.web;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const answer = await stopsIn(map.web, cookie, 'near=40.0612,-80.0612&count=1');
    expect(answer.json).toEqual({
      stops: [[wayspotId(1), 40.061, -80.061, 'Market Fountain', expect.anything()]],
      more: false,
    });
  });

  it(`gives at most ${String(MAX_MAP_STOPS)}, and says there are more`, async () => {
    const rows = Array.from({ length: MAX_MAP_STOPS + 5 }, (_, n) =>
      keptRow(10 + n, { lat: 40.05 + n / 100_000, lon: -80.05 }),
    );
    const map = await making({}, {}, rows);
    web = map.web;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const answer = await stopsIn(map.web, cookie, 'south=40&west=-80.1&north=40.1&east=-80');
    expect(answer.json.stops).toHaveLength(MAX_MAP_STOPS);
    expect(answer.json.more).toBe(true);
  });

  it('is for members alone, and refuses a box that is none', async () => {
    const map = await making();
    web = map.web;
    const box = 'south=40&west=-80.1&north=40.1&east=-80';
    expect((await stopsIn(map.web, undefined, box)).status).toBe(401);
    const stranger = await map.web.loggedIn('200000000000000099', 'Stranger');
    expect((await stopsIn(map.web, stranger, box)).status).toBe(403);
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    expect((await stopsIn(map.web, cookie, 'south=41&west=-80.1&north=40&east=-80')).status).toBe(
      400,
    );
    expect((await stopsIn(map.web, cookie, 'south=x&west=-80.1&north=40&east=-80')).status).toBe(
      400,
    );
  });
});
