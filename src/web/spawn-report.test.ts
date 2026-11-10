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
import { viewOverwrite } from '../../test/support/region-roles.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import type { WayspotDirectory } from '../services/wayspot-directory.js';
import type { PartyWebDeps } from './party-routes.js';
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
import type { KnownPlace } from '../domain/geo/place.js';
import type { SpawnAnswer, SpawnsView, WildOptionsView } from '../domain/web/spawn-data.js';
import { MOD, SAFETY_SERVER } from '../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import type { MeetupSafety } from '../services/meetup-safety.js';
import { UNREACHABLE } from './acting.js';
import { MAP_PLACE_GONE, MAP_SPAWN_BLOCKED } from './spawn-routes.js';

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
    /** The kept Wayspots (`wayspotsWith`); none without it. */
    wayspots?: WayspotDirectory;
    /** The places' pictures the map serves; none without it. */
    places?: PartyWebDeps['places'];
  } = {},
) {
  const throttles = options.throttles ?? new Throttles();
  const made = await partyServiceWith();
  const base = createTestContext({}).ctx.config;
  const { ctx } = createTestContext({
    ...(options.meetupSafety ? { meetupSafety: options.meetupSafety } : {}),
    ...(options.wayspots ? { wayspots: options.wayspots } : {}),
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
    parties: partyWebWith(made, {
      acting,
      throttles,
      ...(options.places ? { places: options.places } : {}),
    }),
    spawns: spawnWebWith(ctx, { channelName: (id) => names.get(id) }),
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

  it('refuses a member blocked from meetups a spawn at a point of the map, a pin; uncounted, nothing posted', async () => {
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
    expect(MAP_SPAWN_BLOCKED).toBe(
      'You are blocked from making meetups in this server, so you cannot report a wild Pokémon at ' +
        "a point of the map. Use \"Report spawn here\" in a gym's, PokéStop's or Power Spot's " +
        'popup instead. To appeal the block, use /meetup on Discord and press "Appeal…".',
    );
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

  // A long press at a place (no place named): a pin, named by the place, as `/wild near:` names a
  // maps link there.
  it('names a point a PokéStop or a Power Spot stands at by it, as a pin', async () => {
    // In West, away from every gym.
    const stop = keptRow(1, { lat: 40.035, lon: -80.045, title: 'Market Fountain' });
    const spot = keptRow(2, { lat: 40.045, lon: -80.025, kind: 'powerspot', title: 'Old Mill' });
    const { wayspots } = await wayspotsWith([stop, spot]);
    const map = await reporting({ wayspots });
    web = map.web;
    for (const [place, words] of [
      [stop, 'Near **Market Fountain** (PokéStop)'],
      [spot, 'Near **Old Mill** (Power Spot)'],
    ] as const) {
      const answer = await map.report({
        pokemon: 'dratini',
        details: 'by the bench',
        lat: place.lat,
        lon: place.lon,
      });
      expect(answer.json.text).toBe(
        `Reported: a wild Dratini near ${place.title}.\nThe report is removed in 30 minutes.`,
      );
      expect(textDisplays(map.reports().at(-1)?.message)[1]).toBe(
        `**Where**\nby the bench\n📍 ${words} · ` +
          `[Map](<https://www.google.com/maps/search/?api=1&query=${String(place.lat)}%2C${String(place.lon)}>)`,
      );
    }
  });

  // Matt, 2026-11-07: "Report spawn here" of a gym, a PokéStop or a Power Spot reports at that
  // place exactly as `/wild near:<that place>` does: the place itself, its address and picture.
  describe('at a place the body names', () => {
    const STOP = keptRow(1, { lat: 40.035, lon: -80.045, title: 'Market Fountain' });
    const SPOT = keptRow(2, { lat: 40.045, lon: -80.025, kind: 'powerspot', title: 'Old Mill' });
    /** The Wayfarer pictures a message shows. */
    const picturesOf = (message: unknown): string[] =>
      JSON.stringify(message ?? null).match(/https:\/\/lh3\.googleusercontent\.com[^"]*/gu) ?? [];
    const placed = async (more: Parameters<typeof reporting>[0] = {}) => {
      const { wayspots } = await wayspotsWith([STOP, SPOT]);
      return reporting({ wayspots, ...more });
    };

    it('reports at a gym, a PokéStop or a Power Spot exactly as /wild near: that place does', async () => {
      const map = await placed();
      web = map.web;
      // /wild with its own limit: six reports in all.
      const router = new InteractionRouter(map.ctx, [wildCommand], [], {
        throttles: new Throttles(),
        now: () => PARTY_NOW,
      });
      vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
      for (const [kind, id, title] of [
        ['gym', '1', 'The Stacks'],
        ['stop', STOP.id, 'Market Fountain'],
        ['powerspot', SPOT.id, 'Old Mill'],
      ] as const) {
        const answer = await map.report({
          pokemon: 'dratini',
          details: 'by the bench',
          place: { kind, id },
        });
        expect(answer.status).toBe(200);
        expect(answer.json.text).toBe(
          `Reported: a wild Dratini near ${title}.\nThe report is removed in 30 minutes.`,
        );
        const onTheMap = map.reports().at(-1)?.message;
        const used = fakeChatInput({
          commandName: 'wild',
          channelId: WEST_CHANNEL,
          userId: ALICE,
          options: { pokemon: 'dratini', details: 'by the bench', near: `${kind}:${id}` },
        });
        await router.handle(used as never);
        const onDiscord = map.reports().at(-1)?.message;
        expect(onDiscord).not.toBe(onTheMap);
        // The place as /wild shows it: its name, kind, address and map link, and its picture.
        expect(textDisplays(onTheMap).slice(1)).toEqual(textDisplays(onDiscord).slice(1));
        expect(picturesOf(onTheMap)).toEqual(picturesOf(onDiscord));
      }
      expect(picturesOf(map.reports().at(-1)?.message)).not.toEqual([]);
      expect(textDisplays(map.reports().at(-1)?.message)[1]).toContain('**Old Mill**');
    });

    it('refuses a place that is gone or of another kind now, or in no region, in words for the map, counting nothing', async () => {
      const throttles = new Throttles();
      const map = await placed({ throttles });
      web = map.web;
      for (const place of [
        { kind: 'gym', id: '999' },
        { kind: 'stop', id: SPOT.id },
        { kind: 'powerspot', id: wayspotId(9) },
      ]) {
        const answer = await map.report({ pokemon: 'dratini', details: 'here', place });
        expect(answer.status).toBe(422);
        expect(answer.json).toEqual({ ok: false, text: MAP_PLACE_GONE });
      }
      expect(MAP_PLACE_GONE).toBe(
        'That place is gone from the map: close its popup and pick it again.',
      );
      // The Lakeview Trailhead lies in no region of the server.
      const nowhere = await map.report({
        pokemon: 'dratini',
        details: 'here',
        place: { kind: 'gym', id: '10' },
      });
      expect(nowhere).toMatchObject({
        status: 422,
        json: { ok: false, text: 'That place is not in a region of this server.' },
      });
      expect(map.reports()).toEqual([]);
      expect(throttles.size).toBe(0);
    });

    it('asks which region of a place that lies in several, and reports at the place in the one picked', async () => {
      const throttles = new Throttles();
      const map = await placed({ throttles });
      web = map.web;
      // East reaches into West, over the stop.
      const east = map.made.regions.rows.find((region) => region.id === 2);
      if (east?.bounds) {
        east.bounds = east.bounds.map((corner) => ({
          ...corner,
          lon: corner.lon === -80 ? -80.05 : corner.lon,
        }));
      }
      const atStop = { pokemon: 'dratini', details: 'here', place: { kind: 'stop', id: STOP.id } };
      const asked = await map.report(atStop);
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
      expect(map.reports(WEST_CHANNEL)).toEqual([]);
      const picked = await map.report({ ...atStop, region: 2 });
      expect(picked.status).toBe(200);
      expect(picked.json.text).toBe(
        'Reported: a wild Dratini near Market Fountain.\nThe report is removed in 30 minutes.',
      );
      expect(map.reports(EAST_CHANNEL)).toHaveLength(1);
      expect(map.reports(WEST_CHANNEL)).toEqual([]);
    });

    it("refuses a member barred from the place's region, counting nothing and posting nothing", async () => {
      const throttles = new Throttles();
      const map = await placed({ throttles });
      web = map.web;
      map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
      const answer = await map.report({
        pokemon: 'dratini',
        details: 'here',
        place: { kind: 'powerspot', id: SPOT.id },
      });
      expect(answer.status).toBe(403);
      expect(throttles.size).toBe(0);
      expect(map.reports()).toEqual([]);
    });

    it('takes a place or a point, never both nor neither, no other kind and no id of no place (400)', async () => {
      const map = await placed();
      web = map.web;
      for (const body of [
        { pokemon: 'dratini', details: 'here', place: { kind: 'stop', id: STOP.id }, ...IN_WEST },
        { pokemon: 'dratini', details: 'here' },
        { pokemon: 'dratini', details: 'here', place: { kind: 'pin', id: '1' } },
        // An id no choice of `/wild near:` has (`readPlaceValue`).
        { pokemon: 'dratini', details: 'here', place: { kind: 'stop', id: 'not an id' } },
        { pokemon: 'dratini', details: 'here', place: { kind: 'gym', id: 'Library' } },
      ]) {
        expect((await map.report(body)).status).toBe(400);
      }
    });

    it('lets a member blocked from meetups report at a place, as /wild does, but not at a point', async () => {
      const safe = await meetupSafetyWith();
      await safe.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
      const map = await placed({ meetupSafety: safe.safety });
      web = map.web;
      const atStop = { pokemon: 'dratini', details: 'here', place: { kind: 'stop', id: STOP.id } };
      expect((await map.report(atStop)).status).toBe(200);
      const atPoint = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
      expect(atPoint).toMatchObject({ status: 403, json: { text: MAP_SPAWN_BLOCKED } });
    });
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
    map.made.gateway.addChannel(WEST_CHANNEL, 'west');
    map.made.gateway.barred.set(WEST_CHANNEL, new Set([ALICE]));
    const kept = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(kept.status).toBe(403);
    // West without a forum: its channel still keeps Alice out.
    const west = map.made.regions.rows.find((region) => region.id === 1);
    if (west) west.forumChannelId = null;
    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
      403,
    );
    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
    const away = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(away.status).toBe(503);
    expect(away.json).toEqual({ error: UNREACHABLE });
    map.made.gateway.failing.delete('memberAccess');
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
    map.made.gateway.addChannel(WEST_CHANNEL, 'west');
    map.made.gateway.barred.set(WEST_CHANNEL, new Set([ALICE]));
    map.made.gateway.failing.set('memberAccess', new Error('not asked of an administrator'));
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

describe('the wild spawns on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  /** The Pinewood Public Library (gym 1 in West) as `/wild near:` names it. */
  const THE_STACKS: KnownPlace = {
    kind: 'gym',
    id: '1',
    title: 'The Stacks',
    lat: 40.05,
    lon: -80.05,
    address: '1 Library Lane',
    image: null,
  };

  /** The spawns as a member sees them, with the answer's status and headers. */
  const listed = async (
    map: Awaited<ReturnType<typeof reporting>>,
    cookie?: string,
    etag?: string,
  ) => {
    const answer = await map.web.app.inject({
      method: 'GET',
      url: SPAWNS,
      headers: {
        ...(cookie === undefined ? {} : { cookie }),
        ...(etag === undefined ? {} : { 'if-none-match': etag }),
      },
    });
    return {
      status: answer.statusCode,
      headers: answer.headers,
      view: answer.statusCode === 200 ? answer.json<SpawnsView>() : undefined,
      body: answer.body,
    };
  };

  it('lists what stands as its region message says it: one reported on the map at its pin, one of /wild near a gym, one without a place', async () => {
    const map = await reporting();
    web = map.web;
    const madeAt = PARTY_NOW;
    expect(
      (await map.report({ pokemon: 'dratini', details: 'by the bench', iv: 'perfect', ...IN_WEST }))
        .status,
    ).toBe(200);
    const [pinned] = map.reports();
    await map.made.spawns.report({
      guildId: FAKE_GUILD_ID,
      regionChannelId: WEST_CHANNEL,
      pokemon: { dex: 19, key: 'rattata_alola', name: 'Alolan Rattata' },
      details: 'under the stairs',
      reporter: { id: BOB, name: 'Bob' },
      near: THE_STACKS,
    });
    await map.made.spawns.report({
      guildId: FAKE_GUILD_ID,
      regionChannelId: EAST_CHANNEL,
      pokemon: { dex: 129, key: 'magikarp', name: 'Magikarp' },
      details: null,
      reporter: { id: BOB },
    });
    const [, gym] = map.reports();
    const [plain] = map.reports(EAST_CHANNEL);
    if (!pinned || !gym || !plain) throw new Error('not posted');
    const answer = await listed(map, await map.web.loggedIn(ALICE, 'Alice'));
    expect(answer.status).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const goneAt = madeAt + 30 * 60_000;
    // No pictures: the test's game data has no icons (`spawn-view.test.ts` shows them).
    expect(answer.view?.spawns).toEqual([
      {
        id: pinned.id,
        pokemon: 'Dratini',
        costumed: false,
        ivs: '100% IVs',
        details: 'by the bench',
        near: 'Dropped pin',
        point: IN_WEST,
        reporter: 'Alice',
        region: '#west',
        madeAt,
        goneAt,
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${pinned.id}`,
        words: ['dratini'],
      },
      {
        id: gym.id,
        pokemon: 'Alolan Rattata',
        costumed: false,
        details: 'under the stairs',
        near: 'Near The Stacks (gym)',
        address: '1 Library Lane',
        point: { lat: THE_STACKS.lat, lon: THE_STACKS.lon },
        reporter: 'Bob',
        region: '#west',
        madeAt,
        goneAt,
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${gym.id}`,
        words: ['alolan', 'rattata', 'alola'],
      },
      {
        id: plain.id,
        pokemon: 'Magikarp',
        costumed: false,
        details: null,
        point: null,
        reporter: 'a member',
        region: '#east',
        madeAt,
        goneAt,
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${EAST_CHANNEL}/${plain.id}`,
        words: ['magikarp'],
      },
    ]);
    // Kept by its ETag; gone from the list at its time, whether or not its message was deleted.
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const again = await listed(map, cookie, String(answer.headers.etag));
    expect(again.status).toBe(304);
    map.web.clock.now = goneAt;
    map.made.clock.now = goneAt;
    expect((await listed(map, cookie)).view).toEqual({ spawns: [] });
  });

  it('leaves out for a member the spawns of a region whose forum or channel keeps them out', async () => {
    const map = await reporting();
    web = map.web;
    await map.made.spawns.report({
      guildId: FAKE_GUILD_ID,
      regionChannelId: WEST_CHANNEL,
      pokemon: { dex: 147, key: 'dratini', name: 'Dratini' },
      details: 'by the bench',
      reporter: { id: ALICE, name: 'Alice' },
    });
    await map.made.spawns.report({
      guildId: FAKE_GUILD_ID,
      regionChannelId: EAST_CHANNEL,
      pokemon: { dex: 129, key: 'magikarp', name: 'Magikarp' },
      details: 'in the pond',
      reporter: { id: ALICE, name: 'Alice' },
    });
    const names = async (userId: string, name: string) =>
      (await listed(map, await map.web.loggedIn(userId, name))).view?.spawns.map(
        (spawn) => spawn.pokemon,
      );
    expect(await names(BOB, 'Bob')).toEqual(['Dratini', 'Magikarp']);
    map.made.gateway.barred.set(WEST_FORUM, new Set([BOB]));
    // What Discord said of a forum or channel is used for a minute.
    map.web.clock.now += 60_000;
    expect(await names(BOB, 'Bob')).toEqual(['Magikarp']);
    expect(await names(ALICE, 'Alice')).toEqual(['Dratini', 'Magikarp']);
    // The region's channel, where its message stands, as the server has it.
    map.made.gateway.addChannel(EAST_CHANNEL, 'east');
    map.made.gateway.barred.set(EAST_CHANNEL, new Set([ALICE]));
    map.web.clock.now += 60_000;
    expect(await names(ALICE, 'Alice')).toEqual(['Dratini']);
  });

  it("takes a report on the map from exactly those who see the region's spawns there: a role of theirs that denies its channel keeps them from both", async () => {
    const map = await reporting();
    web = map.web;
    const muted = '700000000000000001';
    map.made.gateway.addChannel(WEST_CHANNEL, 'west');
    map.made.gateway.memberRoles.set(ALICE, [muted]);
    map.made.gateway.forumOverwrites.set(WEST_CHANNEL, [viewOverwrite(muted, false)]);
    const refused = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
    expect(refused.status).toBe(403);
    expect(map.reports()).toEqual([]);
    // Bob's report there is not on Alice's map either.
    const bob = await map.web.posting(BOB, 'Bob');
    const body = { pokemon: 'dratini', details: 'here', ...IN_WEST };
    expect((await map.report(body, bob)).status).toBe(200);
    const seen = async (userId: string, name: string) =>
      (await listed(map, await map.web.loggedIn(userId, name))).view?.spawns.length;
    expect(await seen(ALICE, 'Alice')).toBe(0);
    expect(await seen(BOB, 'Bob')).toBe(1);
    // An administrator sees it and reports there, whatever the overwrites say.
    map.acting.standing(ALICE, { roleNames: [], administrator: true });
    map.members.standing(ALICE, { roleNames: [], administrator: true });
    // What the directory said of a member is used for a minute.
    map.web.clock.now += 60_000;
    expect(await seen(ALICE, 'Alice')).toBe(1);
    expect((await map.report(body)).status).toBe(200);
  });

  // Staging of 2026-11-07: the popup shows the place's picture, as its region message does.
  it("serves the picture of the place a spawn is near to those who see the spawn, by Pine's address", async () => {
    const LIBRARY = 'https://lh3.googleusercontent.com/library';
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
    const asked: string[] = [];
    const map = await reporting({
      places: {
        keyOf: (url) => (url === `${LIBRARY}=s400` ? 'gym/1' : undefined),
        urlOf: (kind, id) => (kind === 'gym' && id === '1' ? `${LIBRARY}=s400` : undefined),
        read: (kind, id) => {
          asked.push(`${kind}/${id}`);
          return Promise.resolve({ bytes: JPEG, type: 'image/jpeg' });
        },
      },
    });
    web = map.web;
    const picture = `/s/${FAKE_GUILD_ID}/pictures/gym/1`;
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    const fetched = async (who = cookie) =>
      (await map.web.app.inject({ url: picture, headers: { cookie: who } })).statusCode;
    // No spawn shows it yet: nothing is fetched.
    expect(await fetched()).toBe(404);
    await map.made.spawns.report({
      guildId: FAKE_GUILD_ID,
      regionChannelId: WEST_CHANNEL,
      pokemon: { dex: 147, key: 'dratini', name: 'Dratini' },
      details: 'by the bench',
      reporter: { id: BOB, name: 'Bob' },
      near: { ...THE_STACKS, image: LIBRARY },
    });
    const [shown] = (await listed(map, cookie)).view?.spawns ?? [];
    expect(shown).toMatchObject({ address: '1 Library Lane', placePicture: picture });
    // Who is a member is asked once for it (review SF1-3), the spawns' check taking the route's.
    const finds = map.members.asked.length;
    const answer = await map.web.app.inject({ url: picture, headers: { cookie } });
    expect(map.members.asked.length - finds).toBe(1);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toBe('image/jpeg');
    expect(answer.rawPayload).toEqual(JPEG);
    expect((await map.web.app.inject({ url: picture })).statusCode).toBe(401);
    // Not for a member the spawn's region keeps out.
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    map.web.clock.now += 60_000;
    expect(await fetched()).toBe(404);
    expect(asked).toEqual(['gym/1']);
  });

  it('is for members of the server alone, and not while Discord cannot say who is one', async () => {
    const map = await reporting();
    web = map.web;
    expect((await listed(map)).status).toBe(401);
    const eve = await map.web.loggedIn('300000000000000099', 'Eve');
    expect((await listed(map, eve)).status).toBe(403);
    const cookie = await map.web.loggedIn(ALICE, 'Alice');
    map.members.failing = new Error('Discord is away');
    expect((await listed(map, cookie)).status).toBe(503);
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
