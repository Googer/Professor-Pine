import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { maxWebWith, partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import type { WayspotRow } from '../domain/wayspots/kept.js';
import { maxChoiceValue } from '../commands/max/max-input.js';
import type { MaxBossChoice } from '../domain/pogo/max-boss-list.js';
import { MAX_MAP_SPOTS, type MaxOptionsView, type PowerSpotsView } from '../domain/web/max-data.js';
import { currentMaxBossChoices } from '../services/max-boss-service.js';
import { maxOptions } from './max-options.js';

const OPTIONS = `/s/${FAKE_GUILD_ID}/api/max-options`;
const ORIGINS = ['https://cdn.leekduck.com'];

/** The map of the fakes' server with what `/max` reads, Alice a member; kept power spots `rows`. */
async function serving(rows: readonly WayspotRow[] = []) {
  const made = await maxReportingWith({ moderation: null }, rows);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({ members, parties: partyWebWith(made), maxes: maxWebWith(made.ctx) });
  web.clock.now = MAX_THURSDAY;
  return { ...made, web };
}

/** The bosses `/max` offers now, as the context lists them. */
function offered(made: Awaited<ReturnType<typeof maxReportingWith>>): MaxBossChoice[] {
  const { ctx } = made;
  return currentMaxBossChoices(
    {
      maxBosses: ctx.maxBosses,
      maxEvents: ctx.raidEvents,
      pokemon: ctx.pokemon,
      gameData: ctx.gameData,
      zone: ctx.config.settings.timezone,
    },
    MAX_THURSDAY,
  );
}

describe('the pick lists of a max battle report (maxOptions)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the bosses in /max's order with the values its choices have, the tiers in the posts' words, and the tiers for a boss on no list", async () => {
    const made = await maxReportingWith();
    const choices = offered(made);
    const view = maxOptions(choices, 'America/New_York', () => undefined, ORIGINS);
    expect(view.zone).toBe('America/New_York');
    expect(view.bosses.map((boss) => boss.value)).toEqual(
      choices.map((choice) => maxChoiceValue(choice.boss)),
    );
    expect(view.bosses).toContainEqual({
      value: 'm:D2:machop',
      name: 'Machop',
      level: 'D2',
      tier: 'Dynamax 2★',
      featured: false,
    });
    expect(view.tiers).toEqual([
      { value: 'D1', tier: 'Dynamax 1★' },
      { value: 'D2', tier: 'Dynamax 2★' },
      { value: 'D3', tier: 'Dynamax 3★' },
      { value: 'D4', tier: 'Dynamax 4★' },
      { value: 'D5', tier: 'Dynamax 5★' },
      { value: 'G', tier: 'Gigantamax' },
    ]);
  });

  it('marks the featured bosses, gives a picture only from a host the page may load, and leaves out a value over 100 characters', () => {
    const boss = (key: string, featured: boolean): MaxBossChoice => ({
      boss: {
        key,
        tier: 'D1',
        shiny: false,
        name: key,
        entry: undefined,
        source: 'feed',
        autoset: false,
        pokemonId: key.toUpperCase(),
        form: null,
      },
      name: `${key} · Dynamax 1★`,
      featured,
    });
    const view = maxOptions(
      [boss('sneasel', true), boss('skwovet', false), boss('x'.repeat(96), false)],
      'America/New_York',
      (one) =>
        one.key === 'sneasel'
          ? 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm215.icon.png'
          : 'https://evil.example/x.png',
      ORIGINS,
    );
    expect(view.bosses).toEqual([
      {
        value: 'm:D1:sneasel',
        name: 'sneasel',
        level: 'D1',
        tier: 'Dynamax 1★',
        featured: true,
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm215.icon.png',
      },
      { value: 'm:D1:skwovet', name: 'skwovet', level: 'D1', tier: 'Dynamax 1★', featured: false },
    ]);
  });
});

describe('GET /s/<guild>/api/max-options', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it('answers a member with the pick lists, kept by an ETag, private', async () => {
    const made = await serving();
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await web.app.inject({ url: OPTIONS, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<MaxOptionsView>();
    expect(view.bosses.map((boss) => boss.value)).toEqual(
      offered(made).map((choice) => maxChoiceValue(choice.boss)),
    );
    const again = await web.app.inject({
      url: OPTIONS,
      headers: { cookie, 'if-none-match': String(answer.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });

  it('is for members only: 401 without a login, 403 for somebody who is not a member', async () => {
    const made = await serving();
    web = made.web;
    expect((await web.app.inject({ url: OPTIONS })).statusCode).toBe(401);
    const cookie = await web.loggedIn(BOB, 'Bob');
    expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(403);
  });

  it('may be asked 30 times a minute from one address', async () => {
    const made = await serving();
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    for (let n = 0; n < 30; n++) {
      expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(200);
    }
    expect((await web.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(429);
  });
});

describe('GET /s/<guild>/api/powerspots', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  /** The power spots in a box, asked by `cookie`. */
  const spotsIn = async (map: TestWeb, cookie: string | undefined, box: string) => {
    const answer = await map.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/powerspots?${box}`,
      headers: cookie === undefined ? {} : { cookie },
    });
    return { status: answer.statusCode, json: answer.json<PowerSpotsView>(), answer };
  };

  it('gives a member the titled Power Spots of the server in the box, nearest to its middle first, never a PokéStop', async () => {
    const made = await serving([
      keptRow(2, { kind: 'powerspot', lat: 40.062, lon: -80.062, title: 'Salon' }),
      keptRow(3, { kind: 'powerspot', lat: 40.0651, lon: -80.0651, title: 'Bandstand' }),
      keptRow(4, { kind: 'powerspot', lat: 40.063, lon: -80.063, title: ' ' }),
      keptRow(5, { kind: 'stop', lat: 40.064, lon: -80.064, title: 'Market Fountain' }),
    ]);
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await spotsIn(web, cookie, 'south=40.06&west=-80.07&north=40.07&east=-80.06');
    expect(answer.status).toBe(200);
    expect(answer.answer.headers['cache-control']).toBe('private, no-store');
    expect(answer.json).toEqual({
      spots: [
        [wayspotId(3), 40.0651, -80.0651, 'Bandstand'],
        [wayspotId(2), 40.062, -80.062, 'Salon'],
      ],
      more: false,
    });
  });

  it(`gives at most ${String(MAX_MAP_SPOTS)}, and says there are more`, async () => {
    const rows = Array.from({ length: MAX_MAP_SPOTS + 5 }, (_, n) =>
      keptRow(10 + n, { kind: 'powerspot', lat: 40.05 + n / 100_000, lon: -80.05 }),
    );
    const made = await serving(rows);
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await spotsIn(web, cookie, 'south=40&west=-80.1&north=40.1&east=-80');
    expect(answer.json.spots).toHaveLength(MAX_MAP_SPOTS);
    expect(answer.json.more).toBe(true);
  });

  // Plan 8M-11A: Report → Max battle lists the five nearest, wherever they are, not those in view.
  it('gives the nearest of a point, as many as asked, by the search Discord lists nearby places with', async () => {
    const made = await serving([
      keptRow(2, { kind: 'powerspot', lat: 40.062, lon: -80.062, title: 'Salon' }),
      keptRow(3, { kind: 'powerspot', lat: 40.0651, lon: -80.0651, title: 'Bandstand' }),
      keptRow(5, { kind: 'stop', lat: 40.0652, lon: -80.0652, title: 'Market Fountain' }),
    ]);
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await spotsIn(web, cookie, 'near=40.0652,-80.0652&count=2');
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({
      spots: [
        [wayspotId(3), 40.0651, -80.0651, 'Bandstand'],
        [wayspotId(2), 40.062, -80.062, 'Salon'],
      ],
      more: false,
    });
    const all = await spotsIn(web, cookie, 'near=40.0652,-80.0652&count=5');
    // Every titled Power Spot of the server's regions, the nearest first; never a PokéStop.
    expect(all.json.spots.slice(0, 2).map((spot) => spot[3])).toEqual(['Bandstand', 'Salon']);
    expect(all.json.spots.map((spot) => spot[3])).not.toContain('Market Fountain');
    for (const bad of [
      'near=91,0&count=5',
      'near=40,-80&count=0',
      'near=40,-80&count=26',
      'near=x',
    ]) {
      expect((await spotsIn(web, cookie, bad)).status, bad).toBe(400);
    }
  });

  it('is for members alone, refuses a box that is none, and 120 a minute from one address', async () => {
    const made = await serving();
    web = made.web;
    const box = 'south=40&west=-80.1&north=40.1&east=-80';
    expect((await spotsIn(web, undefined, box)).status).toBe(401);
    const stranger = await web.loggedIn(BOB, 'Bob');
    expect((await spotsIn(web, stranger, box)).status).toBe(403);
    const cookie = await web.loggedIn(ALICE, 'Alice');
    expect((await spotsIn(web, cookie, 'south=41&west=-80.1&north=40&east=-80')).status).toBe(400);
    for (let n = 0; n < 117; n++) expect((await spotsIn(web, cookie, box)).status).toBe(200);
    expect((await spotsIn(web, cookie, box)).status).toBe(429);
  });
});
