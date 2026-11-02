import { afterEach, describe, expect, it, vi } from 'vitest';
import { missingPermissions } from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { dmSummary, textDisplays } from '../../test/support/messages.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { MemoryUsers } from '../../test/support/users.js';
import {
  FakeActingMembers,
  partyWebWith,
  spawnWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { WILD_COMMAND, WILD_THROTTLE, wildCommand } from '../commands/notifications/wild.js';
import type { UserSettings } from '../db/repositories/user-repository.js';
import { InteractionRouter } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { RaidPrivacy } from '../domain/party/status.js';
import type { SpawnAnswer, WildOptionsView } from '../domain/web/spawn-data.js';
import { MOD, SAFETY_SERVER } from '../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import type { MeetupSafety } from '../services/meetup-safety.js';
import { UNREACHABLE } from './acting.js';
import { MAP_SPAWN_BLOCKED } from './spawn-routes.js';

const SPAWNS = `/s/${FAKE_GUILD_ID}/api/spawns`;
const OPTIONS = `/s/${FAKE_GUILD_ID}/api/wild-options`;

/** A point in West far from every gym: a pin dropped on the map, named by nothing. */
const IN_WEST = { lat: 40.02, lon: -80.02 };
/** A few metres from the Pinewood Public Library (The Stacks), gym 1 in West. */
const AT_THE_STACKS = { lat: 40.0501, lon: -80.0501 };
/** Outside every region of the server. */
const NOWHERE = { lat: 41.5, lon: -81.5 };

/**
 * The map of a server with the party and spawn services of a test: Alice a member (in the
 * directory, and fetched fresh as `Alice`), Bob too; the clock the parties' own; `settings`
 * what members set; `exceptions` the settings' `wildSpawnExceptions`; `channelNames` the
 * channels the bot sees by name (`west` and `east` unless given).
 */
async function reporting(
  options: {
    throttles?: Throttles;
    settings?: Map<string, Partial<UserSettings>>;
    exceptions?: string[];
    channelNames?: Map<string, string>;
    meetupSafety?: MeetupSafety;
  } = {},
) {
  const throttles = options.throttles ?? new Throttles();
  const made = await partyServiceWith();
  const base = createTestContext({}).ctx.config;
  const { ctx } = createTestContext({
    ...(options.meetupSafety ? { meetupSafety: options.meetupSafety } : {}),
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    spawns: made.spawns,
    wants: made.wants,
    users: new MemoryUsers(options.settings),
    ...(options.exceptions
      ? {
          config: {
            ...base,
            settings: { ...base.settings, wildSpawnExceptions: options.exceptions },
          },
        }
      : {}),
  });
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
  const names =
    options.channelNames ??
    new Map([
      [WEST_CHANNEL, 'west'],
      [EAST_CHANNEL, 'east'],
    ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    spawns: spawnWebWith(ctx, { channelName: (id) => names.get(id), channels: made.gateway }),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const report = async (body: unknown, sent = headers) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: SPAWNS,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<SpawnAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  /** The reports that stand in a region's channel. */
  const reports = (channelId = WEST_CHANNEL) => made.gateway.messagesIn(channelId);
  return { made, ctx, web, acting, members, headers, report, reports, throttles };
}

describe('reporting a wild Pokémon on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it('refuses a member blocked from meetups, every spawn on the map being a pin; uncounted, nothing posted', async () => {
    const safe = await meetupSafetyWith();
    await safe.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    const map = await reporting({ meetupSafety: safe.safety });
    web = map.web;
    const body = { pokemon: 'dratini', details: 'by the bench', ...IN_WEST };
    const refused = await map.report(body);
    expect(refused).toMatchObject({
      status: 403,
      json: { ok: false, text: MAP_SPAWN_BLOCKED },
    });
    expect(map.reports()).toHaveLength(0);
    for (let use = 0; use < WILD_THROTTLE.uses; use += 1) {
      expect(map.throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
    // Others keep their pins.
    const bob = await map.web.posting(BOB, 'Bob');
    expect((await map.report(body, bob)).status).toBe(200);
    expect(map.reports()).toHaveLength(1);
  });

  it("reports at the point as /wild does: as the member, the point as a pin, the command's words, and who wants it is told", async () => {
    const map = await reporting();
    web = map.web;
    await map.made.wants.set(BOB, map.made.gateway.guildId, pokemonTarget(147), 'both');
    const answer = await map.report({
      pokemon: 'dratini',
      details: ' by the fountain ',
      ...IN_WEST,
    });
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({
      ok: true,
      text: 'Reported: a wild Dratini at your pin.\nThe report is removed in 30 minutes.',
    });
    const [posted] = map.reports();
    const shown = textDisplays(posted?.message);
    expect(shown[0]).toMatch(
      new RegExp(`^### Wild Dratini\\nReported by \\*\\*Alice\\*\\* \\(<@${ALICE}>\\)`),
    );
    expect(shown[1]).toBe(
      '**Where**\nby the fountain\n📍 Dropped pin · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02>)',
    );
    await map.made.notify.flush();
    expect(map.made.dms.to(BOB).map((message) => dmSummary(message))).toEqual([
      [
        `A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`,
        'Dratini · Spawns',
      ],
    ]);
  });

  it('gives the use back when the report fails for no fault of the member, as /wild does', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < WILD_THROTTLE.uses - 1; n++) {
      throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    const report = vi
      .spyOn(map.made.spawns, 'report')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      500,
    );
    report.mockRestore();
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      200,
    );
  });

  it('names a point by the place it is near, takes the IVs, and keeps six decimals of the point', async () => {
    const map = await reporting();
    web = map.web;
    const answer = await map.report({
      pokemon: 'Gastly',
      details: 'by the steps',
      iv: 'perfect',
      lat: AT_THE_STACKS.lat + 0.0000004,
      lon: AT_THE_STACKS.lon,
    });
    expect(answer.json.text).toBe(
      'Reported: a wild Gastly with 100% IVs near The Stacks.\nThe report is removed in 30 minutes.',
    );
    expect(textDisplays(map.reports()[0]?.message)[1]).toBe(
      '**Where**\nby the steps\n📍 Near **The Stacks** (gym) · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0501%2C-80.0501>)',
    );
  });

  it("refuses a point in no region of the server in /wild's words, counting nothing", async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...NOWHERE });
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      ok: false,
      text: 'That pin is not in a region of this server. Give a place in the regions here.',
    });
    expect(map.reports()).toEqual([]);
    expect(throttles.size).toBe(0);
  });

  it('reports a point that lies in one region there, whatever region the body names', async () => {
    const map = await reporting();
    web = map.web;
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 2 });
    expect(answer.status).toBe(200);
    expect(map.reports(WEST_CHANNEL)).toHaveLength(1);
    expect(map.reports(EAST_CHANNEL)).toEqual([]);
  });

  it('asks which region of a point that lies in several, and reports into the one picked', async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    // East reaches into West here.
    const east = map.made.regions.rows.find((region) => region.id === 2);
    if (east?.bounds) {
      east.bounds = east.bounds.map((corner) => ({
        ...corner,
        lon: corner.lon === -80 ? -80.05 : corner.lon,
      }));
    }
    const asked = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(asked.status).toBe(422);
    expect(asked.json).toEqual({
      ok: false,
      text: 'This point lies in several regions: pick the one to report the spawn in.',
      regions: [
        { id: 1, name: 'west' },
        { id: 2, name: 'east' },
      ],
    });
    expect(throttles.size).toBe(0);
    // A region the point does not lie in is no answer.
    expect(
      (await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 3 })).status,
    ).toBe(422);
    const picked = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 2 });
    expect(picked.status).toBe(200);
    expect(map.reports(EAST_CHANNEL)).toHaveLength(1);
    expect(map.reports(WEST_CHANNEL)).toEqual([]);
  });

  it("refuses what never appears in the wild and details that say nothing in /wild's words, counting nothing; the settings' exceptions are taken", async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles, exceptions: ['Articuno'] });
    web = map.web;
    const mewtwo = await map.report({ pokemon: 'mewtwo', details: 'here', ...IN_WEST });
    expect(mewtwo.status).toBe(422);
    expect(mewtwo.json).toEqual({ ok: false, text: 'Mewtwo does not appear in the wild.' });
    // The lake trio is no exception in these settings.
    expect((await map.report({ pokemon: 'uxie', details: 'here', ...IN_WEST })).json.text).toBe(
      'Uxie does not appear in the wild.',
    );
    const blank = await map.report({ pokemon: 'dratini', details: '   ', ...IN_WEST });
    expect(blank.status).toBe(422);
    expect(blank.json.text).toBe(
      'Say in details where the Pokémon is: a street corner, a park, a gym.',
    );
    expect(throttles.size).toBe(0);
    expect(map.reports()).toEqual([]);
    expect((await map.report({ pokemon: 'articuno', details: 'here', ...IN_WEST })).status).toBe(
      200,
    );
    expect(map.reports()).toHaveLength(1);
  });

  it("refuses a member kept out of the region's forum, before anything is counted, and while Discord cannot say", async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      403,
    );
    map.made.gateway.barred.delete(WEST_FORUM);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(away.status).toBe(503);
    expect(away.json).toEqual({ error: UNREACHABLE });
    map.made.gateway.failing.delete('memberAccess');
    map.acting.holdBack(ALICE, 'timed-out');
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).json).toEqual({
      error: 'You are timed out in this server, so you cannot do that now.',
    });
    map.acting.remove(ALICE);
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      403,
    );
    expect(throttles.size).toBe(0);
    expect(map.reports()).toEqual([]);
  });

  it("refuses a member kept out of the region's channel by an overwrite of their own, with a forum and without one, and while Discord cannot say", async () => {
    const throttles = new Throttles();
    const map = await reporting({ throttles });
    web = map.web;
    map.made.gateway.ownViewDenials.set(WEST_CHANNEL, new Set([ALICE]));
    const kept = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(kept.status).toBe(403);
    // West without a forum: its channel still keeps Alice out.
    const west = map.made.regions.rows.find((region) => region.id === 1);
    if (west) west.forumChannelId = null;
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      403,
    );
    map.made.gateway.failing.set('ownViewDenied', new Error('Discord is away'));
    const away = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(away.status).toBe(503);
    expect(away.json).toEqual({ error: UNREACHABLE });
    map.made.gateway.failing.delete('ownViewDenied');
    expect(throttles.size).toBe(0);
    expect(map.reports()).toEqual([]);
    // Bob has no such overwrite; nor has Alice in East.
    const bob = await map.web.posting(BOB, 'Bob');
    expect(
      (await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST }, bob)).status,
    ).toBe(200);
    expect(
      (await map.report({ pokemon: 'dratini', details: 'here', lat: 40.05, lon: -79.95 })).status,
    ).toBe(200);
  });

  it("lets an administrator report whatever overwrite of their own the region's channel has, without asking Discord of it", async () => {
    const map = await reporting();
    web = map.web;
    // Discord shows an administrator (and the server's owner) every channel, whatever its
    // overwrites say.
    map.acting.standing(ALICE, { roleNames: [], administrator: true });
    map.made.gateway.ownViewDenials.set(WEST_CHANNEL, new Set([ALICE]));
    map.made.gateway.failing.set('ownViewDenied', new Error('not asked of an administrator'));
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(answer.status).toBe(200);
    expect(map.reports()).toHaveLength(1);
  });

  it('shares the limit of /wild: a report on the map counts, and /wild is refused after it', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < WILD_THROTTLE.uses - 1; n++) {
      throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      200,
    );
    const over = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(over.status).toBe(429);
    expect(over.json).toEqual({ error: 'You can do that again in 30 minutes.' });
    expect(over.headers['retry-after']).toBe('1800');
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    const router = new InteractionRouter(map.ctx, [wildCommand], [], {
      throttles,
      now: () => PARTY_NOW,
    });
    const used = fakeChatInput({
      commandName: 'wild',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      options: { pokemon: 'dratini', details: 'by the fountain' },
    });
    await router.handle(used as never);
    expect(sent(used.reply).content).toBe('You can use /wild again in 30 minutes.');
    expect(map.reports()).toHaveLength(1);
  });

  it('names the reporter in the report as /wild does, by the name Discord has now, and nobody in its answer', async () => {
    const map = await reporting({
      settings: new Map([[ALICE, { raidPrivacy: RaidPrivacy.Anonymous }]]),
    });
    web = map.web;
    // Renamed since the session began: the report names the member as Discord has them now.
    map.acting.add(ALICE, 'Alicia');
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(textDisplays(map.reports()[0]?.message)[0]).toContain(
      `Reported by **Alicia** (<@${ALICE}>)`,
    );
    const everything = JSON.stringify(answer.json);
    for (const text of ['Alice', 'Alicia', ALICE]) expect(everything).not.toContain(text);
  });

  it("says in /wild's words that the region's channel is gone", async () => {
    const map = await reporting();
    web = map.web;
    map.made.gateway.gone.add(WEST_CHANNEL);
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      ok: false,
      text: 'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
    });
  });

  it("says in /wild's words that the bot may not post in the region's channel, naming it as the map sees it", async () => {
    const map = await reporting();
    web = map.web;
    map.made.gateway.failing.set('sendMessage', missingPermissions('POST'));
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      ok: false,
      text: 'I am not allowed to post in #west, so the report was not made. Tell a moderator.',
    });
    expect(map.reports()).toEqual([]);
  });

  it("names a region's channel the bot does not see by the region's number", async () => {
    const map = await reporting({ channelNames: new Map() });
    web = map.web;
    map.made.gateway.failing.set('sendMessage', missingPermissions('POST'));
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(answer.status).toBe(422);
    expect(answer.json).toEqual({
      ok: false,
      text: 'I am not allowed to post in Region 1, so the report was not made. Tell a moderator.',
    });
  });

  it('answers a report that comes while the bot restarts as unavailable for a minute (503), not as a refusal', async () => {
    const map = await reporting();
    web = map.web;
    await map.made.spawns.flush();
    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(answer.status).toBe(503);
    expect(answer.headers['retry-after']).toBe('60');
    expect(answer.json).toEqual({
      error: 'I am restarting just now, so the report was not made. Report it again in a minute.',
    });
    expect(map.reports()).toEqual([]);
    const logged = map.web.entries.find((entry) => entry.msg === 'a spawn was reported on the map');
    expect(logged).toMatchObject({ user: ALICE, region: 1, outcome: 'closed' });
  });

  it('refuses a malformed body (400), and without the CSRF token (403)', async () => {
    const map = await reporting();
    web = map.web;
    const good = { pokemon: 'dratini', details: 'here', ...IN_WEST };
    expect((await map.report({ ...good, lat: '40.02' })).status).toBe(400);
    expect((await map.report({ ...good, lat: 91 })).status).toBe(400);
    expect((await map.report({ ...good, extra: true })).status).toBe(400);
    expect((await map.report({ ...good, details: 'x'.repeat(201) })).status).toBe(400);
    expect((await map.report({ ...good, iv: 'shiny' })).status).toBe(400);
    expect((await map.report({ ...good, pokemon: '' })).status).toBe(400);
    const { 'x-pine-csrf': _token, ...withoutToken } = map.headers;
    expect((await map.report(good, withoutToken)).status).toBe(403);
    expect(map.reports()).toEqual([]);
  });

  it('logs a report as a command is logged: who, where, what came of it; never a text', async () => {
    const map = await reporting();
    web = map.web;
    const answer = await map.report({ pokemon: 'dratini', details: 'by the fountain', ...IN_WEST });
    const logged = map.web.entries.find((entry) => entry.msg === 'a spawn was reported on the map');
    expect(logged).toMatchObject({
      user: ALICE,
      guild: FAKE_GUILD_ID,
      region: 1,
      outcome: 'posted',
    });
    const everything = JSON.stringify(map.web.entries);
    for (const text of [answer.json.text, 'by the fountain', 'Alice', '40.02']) {
      expect(everything).not.toContain(text);
    }
  });

  it('logs a refused report too, one line with what refused it; never a text or the point', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < WILD_THROTTLE.uses; n++) {
      throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW);
    }
    const map = await reporting({ throttles });
    web = map.web;
    await map.report({ pokemon: 'dratini', details: 'here', lat: 10, lon: 10 });
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    map.made.gateway.barred.delete(WEST_FORUM);
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    map.made.gateway.failing.delete('memberAccess');
    await map.report({ pokemon: 'mewtwo', details: 'here', ...IN_WEST });
    await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    const logged = map.web.entries.filter(
      (entry) => entry.msg === 'a spawn was reported on the map',
    );
    expect(logged.map((entry) => (entry as { outcome?: unknown }).outcome)).toEqual([
      'not-here',
      'barred',
      'unreachable',
      'refused',
      'throttled',
    ]);
    expect(logged[1]).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, region: 1 });
    expect(JSON.stringify(map.web.entries)).not.toContain('40.02');
  });
});

describe('the Pokémon a member may report on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('lists what /wild takes, with the settings’ exceptions, for members only, kept by its ETag', async () => {
    const map = await reporting();
    web = map.web;
    const asked = (cookie?: string, etag?: string) =>
      map.web.app.inject({
        method: 'GET',
        url: OPTIONS,
        headers: {
          ...(cookie === undefined ? {} : { cookie }),
          ...(etag === undefined ? {} : { 'if-none-match': etag }),
        },
      });
    expect((await asked()).statusCode).toBe(401);
    expect((await asked(await map.web.loggedIn('300000000000000099', 'Eve'))).statusCode).toBe(403);
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const answer = await asked(cookie);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const { pokemon } = answer.json<WildOptionsView>();
    const keys = new Set(pokemon.map(([key]) => key));
    expect(pokemon).toContainEqual(['dratini', 'Dratini']);
    expect(pokemon).toContainEqual(['rattata_alola', 'Alolan Rattata']);
    for (const key of ['uxie', 'mesprit', 'azelf']) expect(keys.has(key)).toBe(true);
    for (const key of ['mewtwo', 'mew', 'kartana', 'kyogre_primal', 'charizard_mega_x']) {
      expect(keys.has(key)).toBe(false);
    }
    const again = await asked(cookie, String(answer.headers.etag));
    expect(again.statusCode).toBe(304);
    // While Discord cannot say who is a member, nobody gets the list.
    map.members.failing = new Error('Discord is away');
    const away = await asked(cookie);
    expect(away.statusCode).toBe(503);
    expect(away.json()).toEqual({ error: 'Not available just now. Try again in a moment.' });
  });
});
