import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { pageTask, researchTasksFixture } from '../../test/support/research.js';
import { feedChoice, rocketLineupsFixture } from '../../test/support/rocket.js';
import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
import {
  meetupWebWith,
  partyWebWith,
  stopWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { stopsByKey } from '../commands/research/research-report.js';
import type { StopsView } from '../domain/web/meetup-data.js';
import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
import { GIOVANNI_ONLY_WHEN_SURE } from '../commands/rocket/rocket-input.js';
import { lineupValue } from '../domain/rocket/lineups.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import type { ResearchTask, TaskReward } from '../domain/research/task.js';
import { taskVersions } from '../domain/research/versions.js';
import { researchOptions } from './stop-options.js';
import { TEST_MAP_ROLE, TestServers, withMapRole } from '../../test/support/server-values.js';

const RESEARCH = `/s/${FAKE_GUILD_ID}/api/research-options`;
const ROCKET = `/s/${FAKE_GUILD_ID}/api/rocket-options`;
const HOUR = 3_600_000;

async function setup(
  serverSettings: TestServers = new TestServers(),
  pictures?: { url(source: string): string | undefined },
) {
  const made = await stopReportingWith();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({
    members,
    parties: partyWebWith(made.made),
    meetups: meetupWebWith(made.ctx),
    stops: stopWebWith(made.ctx),
    serverSettings,
    ...(pictures === undefined ? {} : { pictures }),
  });
  web.clock.now = STOP_NOON;
  const cookie = await web.loggedIn(ALICE, 'Alice');
  const ask = (url: string, headers: Record<string, string> = {}) =>
    web.app.inject({ method: 'GET', url, headers: { cookie, ...headers } });
  return { ...made, web, members, ask };
}

// Review F2 (one path): which rewards a version stands for is the server's (`taskVersions`), never
// guessed by the page from the task's rewards.
describe("a research task's versions in the pick list", () => {
  const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
  const encounter = (name: string, dex: number, shiny: boolean, picture: string): TaskReward => ({
    kind: 'encounter',
    name,
    key: name.toLowerCase(),
    dex,
    shiny,
    cp: null,
    image: `${crop}${picture}`,
  });

  it('carries the rewards of each version, a shiny one listed twice once, their pictures squared', () => {
    const catalogue = catalogueFixture();
    const task: ResearchTask = {
      key: '0123456789abcdef',
      text: 'Catch a Dragon-type Pokémon',
      category: 'Catching',
      rewards: [
        encounter('Dratini', 147, false, 'pm147.icon.png'),
        encounter('Dratini', 147, true, 'pm147.s.icon.png'),
        encounter('Bagon', 371, false, 'pm371.icon.png'),
      ],
    };
    const square = (source: string) => `https://map.example.test/pictures/${source.slice(-14)}`;
    const view = researchOptions({
      tasks: [task],
      versions: (one) => taskVersions(one, catalogue),
      readAt: undefined,
      stale: false,
      listed: { items: new Map(), energies: new Map() },
      origins: ['https://map.example.test'],
      picture: square,
    });
    const versions = view.tasks[0]?.versions ?? [];
    expect(
      versions.map((version) => [version.label, version.rewards.map((one) => one.name)]),
    ).toEqual([
      ['Dratini', ['Dratini']],
      ['Bagon', ['Bagon']],
      ['one of Dratini, Bagon', ['Dratini', 'Bagon']],
    ]);
    expect(versions[1]?.rewards[0]).toMatchObject({
      value: 'pokemon:bagon',
      image: square(`${crop}pm371.icon.png`),
    });
  });
});

describe('the pick lists of reports at stops', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it('gives the whole task list as /research offers it, with the rewards a typed task names', async () => {
    const made = await setup();
    web = made.web;
    const answer = await made.ask(RESEARCH);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<ResearchOptionsView>();
    // The list of 2026-10-21, read more than six hours before the clock: out of date.
    expect(view.stale).toBe(true);
    expect(view.readAt).toBe(Date.UTC(2026, 9, 21, 21, 40));
    expect(view.tasks).toHaveLength(58);
    const dragon = pageTask('Catch a Dragon-type Pokémon');
    expect(view.tasks).toContainEqual(
      expect.objectContaining({ key: dragon.key, text: dragon.text, category: dragon.category }),
    );
    const shown = view.tasks.find((task) => task.key === dragon.key);
    expect(shown?.rewards[0]).toMatchObject({
      kind: 'encounter',
      name: 'Dratini',
      value: 'pokemon:dratini',
    });
    // Its versions, as /research offers them (plan 8R-5, R13).
    expect(shown?.versions[0]).toEqual({
      value: expect.stringMatching(new RegExp(`^${dragon.key}:[0-9a-f]{8}$`)) as string,
      label: 'Dratini',
      oneOf: false,
      rewards: [shown?.rewards[0]],
    });
    expect(shown?.versions.at(-1)).toMatchObject({
      value: dragon.key,
      label: 'one of Dratini, Bagon, Axew',
      oneOf: true,
    });
    expect(shown?.versions.at(-1)?.rewards.map((reward) => reward.name)).toEqual([
      'Dratini',
      'Bagon',
      'Axew',
    ]);
    expect(view.rewards).toContainEqual({ value: 'item:rare-candy', name: 'Rare Candy' });
    expect(view.rewards.some((reward) => reward.value.startsWith('energy:'))).toBe(true);
    expect(
      (await made.ask(RESEARCH, { 'if-none-match': String(answer.headers.etag) })).statusCode,
    ).toBe(304);
  });

  it('says a list read lately is not out of date, and one never read is', async () => {
    const made = await setup();
    web = made.web;
    Object.assign(made.ctx, { researchTasks: researchTasksFixture(undefined, STOP_NOON - HOUR) });
    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>().stale).toBe(false);
    Object.assign(made.ctx, { researchTasks: researchTasksFixture([], null) });
    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>()).toEqual({
      stale: true,
      readAt: null,
      // `/research report`'s stop options and the length of its typed task (branch review W4).
      maxStops: 5,
      maxTyped: 100,
      tasks: [],
      rewards: [],
    });
  });

  it("takes out of date from the lists' own rule, not from the settings", async () => {
    const made = await setup();
    web = made.web;
    // Read two hours ago by lists that are out of date after one: the settings' six and
    // twenty-four hours would call them current.
    Object.assign(made.ctx, {
      researchTasks: researchTasksFixture(undefined, STOP_NOON - 2 * HOUR, 1),
      rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - 2 * HOUR, 1),
    });
    expect((await made.ask(RESEARCH)).json<ResearchOptionsView>().stale).toBe(true);
    expect((await made.ask(ROCKET)).json<RocketOptionsView>().stale).toBe(true);
  });

  it('gives who of Team GO Rocket as /rocket offers it, Giovanni with his warning', async () => {
    const made = await setup();
    web = made.web;
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - HOUR) });
    const answer = await made.ask(ROCKET);
    expect(answer.statusCode).toBe(200);
    const view = answer.json<RocketOptionsView>();
    expect(view.stale).toBe(false);
    expect(view.readAt).toBe(STOP_NOON - HOUR);
    expect(view.choices.map((choice) => choice.key).slice(0, 2)).toEqual([
      'grunt:bug',
      'grunt:dark',
    ]);
    expect(view.choices.find((choice) => choice.key === 'grunt:water')).toMatchObject({
      name: 'Water-type grunt',
      hideout: false,
    });
    expect(view.choices.find((choice) => choice.key === 'grunt:water')?.catches[0]).toEqual({
      kind: 'encounter',
      name: 'Mudkip',
      value: 'pokemon:mudkip',
      quantity: 0,
      shiny: true,
      image: feedChoice('grunt:water').catches[0]?.image,
    });
    // A type of two lineups lists them beside it (plan 8R-4L, B9), as `/rocket` takes them.
    const water = feedChoice('grunt:water');
    const [mudkips, magikarps] = water.lineups ?? [];
    if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
    const lineups = view.choices.find((choice) => choice.key === 'grunt:water')?.lineups;
    expect(lineups?.map(({ catches: _catches, ...rest }) => rest)).toEqual([
      {
        key: 'grunt:water:female',
        value: lineupValue(water, mudkips),
        label: 'Mudkip, Tentacool, Krabby',
        fingerprint: mudkips.fingerprint,
      },
      {
        key: 'grunt:water:male',
        value: lineupValue(water, magikarps),
        label: 'Magikarp, Feebas',
        fingerprint: magikarps.fingerprint,
      },
    ]);
    expect(lineups?.[1]?.catches.map((caught) => caught.value)).toEqual([
      'pokemon:magikarp',
      'pokemon:feebas',
    ]);
    expect(view.choices.filter((choice) => choice.lineups !== undefined)).toHaveLength(2);
    expect(view.choices.at(-1)).toMatchObject({
      key: 'giovanni',
      hideout: true,
      note: GIOVANNI_ONLY_WHEN_SURE,
    });
    expect(view.choices.filter((choice) => choice.note !== undefined)).toHaveLength(1);
    expect(
      (await made.ask(ROCKET, { 'if-none-match': String(answer.headers.etag) })).statusCode,
    ).toBe(304);
  });

  it('names the rewards’ and catches’ pictures as the post does: the square ones Pine serves (plan 8M-9B)', async () => {
    // The square pictures are served at the web server's own address (`publicUrl`), an origin
    // the page may load.
    const square = (source: string) =>
      `https://map.example.test/pictures/${source.length.toString(16).padStart(32, '0')}.png`;
    const made = await setup(new TestServers(), { url: square });
    web = made.web;
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(undefined, STOP_NOON - HOUR) });
    const research = (await made.ask(RESEARCH)).json<ResearchOptionsView>();
    const dragon = research.tasks.find((task) => task.text === 'Catch a Dragon-type Pokémon');
    expect(dragon?.rewards[0]?.image).toBe(square(pageTask(dragon?.text ?? '').rewards[0]!.image!));
    const rocket = (await made.ask(ROCKET)).json<RocketOptionsView>();
    const water = rocket.choices.find((choice) => choice.key === 'grunt:water');
    expect(water?.catches[0]?.image).toBe(square(feedChoice('grunt:water').catches[0]!.image!));
    expect(water?.lineups?.[1]?.catches[0]?.image).toMatch(/\/pictures\/[0-9a-f]{32}\.png$/);
  });

  it('is for members only, and says so while Discord cannot', async () => {
    const made = await setup();
    web = made.web;
    const stranger = await made.web.loggedIn('200000000000000099', 'X');
    for (const url of [RESEARCH, ROCKET]) {
      expect((await made.web.app.inject({ method: 'GET', url })).statusCode).toBe(401);
      expect(
        (await made.web.app.inject({ method: 'GET', url, headers: { cookie: stranger } }))
          .statusCode,
      ).toBe(403);
    }
    made.members.failing = new Error('Discord is away');
    for (const url of [RESEARCH, ROCKET]) expect((await made.ask(url)).statusCode).toBe(503);
  });

  it('is for members with the map’s member role, where the server sets one', async () => {
    const made = await setup(withMapRole());
    web = made.web;
    made.members
      .standing(ALICE, { roleNames: ['Trainer'], roleIds: [], administrator: false })
      .add(BOB, 'Bob')
      .standing(BOB, { roleNames: ['verified'], roleIds: [TEST_MAP_ROLE], administrator: false });
    const bob = await made.web.loggedIn(BOB, 'Bob');
    for (const url of [RESEARCH, ROCKET]) {
      expect((await made.ask(url)).statusCode).toBe(403);
      expect(
        (await made.web.app.inject({ method: 'GET', url, headers: { cookie: bob } })).statusCode,
      ).toBe(200);
    }
  });

  it('lists Pine’s own stops in a box by the keys the reports take (8R-1)', async () => {
    const made = await setup();
    web = made.web;
    made.wayspots.setPineStops([
      {
        stop: {
          id: 7,
          serverId: FAKE_GUILD_ID,
          name: 'Coffee Corner',
          lat: 40.0505,
          lon: -80.05,
          address: null,
          createdBy: ALICE,
          createdAt: 5_000,
          updatedBy: ALICE,
          updatedAt: 5_000,
        },
        guildRow: 1,
      },
    ]);
    const box = 'south=40.04&west=-80.07&north=40.07&east=-80.04';
    const view = (await made.ask(`/s/${FAKE_GUILD_ID}/api/stops?${box}`)).json<StopsView>();
    const pine = view.stops.find(([, , , title]) => title === 'Coffee Corner');
    expect(pine?.[0]).toBe('pine-7');
    expect(
      (await stopsByKey(made.ctx, FAKE_GUILD_ID, [pine?.[0] ?? ''])).map((s) => s.name),
    ).toEqual(['Coffee Corner']);
  });
});
