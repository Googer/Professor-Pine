import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, OTHER_GUILD_ID, WEST_CHANNEL } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { pageTask } from '../../test/support/research.js';
import { MemoryStopPosts } from '../../test/support/research-store.js';
import { feedChoice } from '../../test/support/rocket.js';
import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
import { wayspotId } from '../../test/support/wayspot-cases.js';
import {
  FakeActingMembers,
  partyWebWith,
  stopWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { readTask } from '../commands/research/research-input.js';
import { reportResearchAs, stopsByKey } from '../commands/research/research-report.js';
import { reportRocketAs } from '../commands/rocket/rocket-report.js';
import { DISCORD_CHANNEL } from '../render/research.js';
import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
import type { StopReportsView } from '../domain/web/stop-report-data.js';
import { StopPostService } from '../services/stop-posts.js';
import type { WebDeps } from './server.js';
import { STOP_REPORTS_PER_MINUTE, type StopWebDeps } from './stop-routes.js';

const URL = `/s/${FAKE_GUILD_ID}/api/stop-reports`;
const DRAGON = pageTask('Catch a Dragon-type Pokémon');
const ALICE_AS = { id: ALICE, name: 'Alice' };

/**
 * The map of the fakes' server over the stop reports' services, Alice and Bob members, the clock
 * at `STOP_NOON` (Date faked to it too); the posts of the stops hold every task in a message of their
 * own (`posts`), unless `posts` makes the real ones of the context.
 */
async function setup(
  postsOf: (made: Awaited<ReturnType<typeof stopReportingWith>>) => StopWebDeps['posts'] = () => ({
    linkOf: (channelId: string, key: string) => ({
      channelId,
      messageId: `${channelId.slice(-2)}${key.length}`,
    }),
  }),
  pictures?: WebDeps['pictures'],
) {
  const made = await stopReportingWith();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const posts = postsOf(made);
  const web = webServerWith({
    members,
    parties: partyWebWith(made.made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
    stops: stopWebWith(made.ctx, { posts, grunts: made.grunts }),
    ...(pictures ? { pictures } : {}),
  });
  web.clock.now = STOP_NOON;
  const research = async (keys: string[], reporter = ALICE_AS) =>
    reportResearchAs(made.ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, keys),
      subject: readTask(made.ctx, DRAGON.key, null),
      reporter,
    });
  const rocket = async (who: string, key: string, reporter = ALICE_AS) => {
    const [stop] = await stopsByKey(made.ctx, FAKE_GUILD_ID, [key]);
    if (!stop) throw new Error('no stop');
    return reportRocketAs(
      made.ctx,
      FAKE_GUILD_ID,
      { choice: feedChoice(who), stop, reporter },
      DISCORD_CHANNEL,
    );
  };
  const ask = async (userId = ALICE, headers: Record<string, string> = {}) => {
    const cookie = await web.loggedIn(userId, 'x');
    const answer = await web.app.inject({
      method: 'GET',
      url: URL,
      headers: { cookie, ...headers },
    });
    return answer;
  };
  return { ...made, web, members, research, rocket, ask };
}

describe('the reports at stops on the map', () => {
  let web: TestWeb | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  it('gives a member today’s research, grunts and hideouts, with their links', async () => {
    const made = await setup();
    web = made.web;
    await made.research([wayspotId(1), wayspotId(3)]);
    await made.rocket('grunt:water', wayspotId(2));
    await made.rocket('leader:arlo', wayspotId(1), { id: BOB, name: '' });
    const answer = await made.ask();
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<StopReportsView>();
    expect(
      view.research.map((one) => [one.stop.name, one.text, one.reporter, one.mayTakeBack]),
    ).toEqual([
      ['Yellow Mural', DRAGON.text, 'Alice', true],
      ['East Fountain', DRAGON.text, 'Alice', true],
    ]);
    // The board's message that holds the task, in the region the stop lies in.
    expect(view.research[0]?.link).toBe(
      `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/01${String(DRAGON.key.length)}`,
    );
    expect(view.research[1]?.link).toBe(
      `https://discord.com/channels/${FAKE_GUILD_ID}/${EAST_CHANNEL}/02${String(DRAGON.key.length)}`,
    );
    const [message] = made.made.gateway.messagesIn(WEST_CHANNEL);
    expect(view.grunts).toMatchObject([
      {
        who: 'grunt:water',
        name: 'Water-type grunt',
        stop: { name: 'Paititi Inti' },
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
      },
    ]);
    expect(view.hideouts).toMatchObject([
      { who: 'leader:arlo', name: 'Arlo', reporter: 'a member', mayTakeBack: false },
    ]);
  });

  it('gives what Find finds each report by, a water grunt "not sure which" not confirmed (plan 8M-12)', async () => {
    const made = await setup();
    web = made.web;
    await made.research([wayspotId(1)]);
    await made.rocket('grunt:water', wayspotId(2));
    await made.rocket('grunt:dragon', wayspotId(3));
    const view = (await made.ask()).json<StopReportsView>();
    // "One of" Dratini, Bagon and Axew: not confirmed.
    expect(view.research[0]?.words).toEqual(expect.arrayContaining(['dragon', 'dratini', 'axew']));
    expect(view.research[0]?.unconfirmed).toEqual({ kind: 'one-of', count: 3, encounters: true });
    // The water grunts have two lineups in the lineups of 2026-10-22; the dragon grunts one.
    const grunts = new Map(view.grunts.map((one) => [one.who, one]));
    expect(grunts.get('grunt:water')?.unconfirmed).toEqual({ kind: 'not-sure-which', count: 2 });
    expect(grunts.get('grunt:dragon')).not.toHaveProperty('unconfirmed');
    expect(grunts.get('grunt:dragon')?.words).toEqual(expect.arrayContaining(['dragon', 'deino']));
  });

  it('names a hideout’s picture as the post of the stops does, none where it is gone (plan 8R-6)', async () => {
    const made = await setup(undefined, {
      read: () => Promise.resolve(undefined),
      url: (source) => (source === LEADER_PORTRAITS.arlo ? undefined : source),
    });
    web = made.web;
    await made.rocket('leader:arlo', wayspotId(1));
    await made.rocket('leader:cliff', wayspotId(2));
    const view = (await made.ask()).json<StopReportsView>();
    expect(view.hideouts.map((one) => [one.who, one.picture])).toEqual([
      ['leader:arlo', undefined],
      ['leader:cliff', LEADER_PORTRAITS.cliff],
    ]);
  });

  it('leaves out what lies only in a region whose forum keeps the member out', async () => {
    const made = await setup();
    web = made.web;
    await made.research([wayspotId(1), wayspotId(3)]);
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const view = (await made.ask()).json<StopReportsView>();
    expect(view.research.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
    const bob = (await made.ask(BOB)).json<StopReportsView>();
    expect(bob.research.map((one) => one.stop.name)).toEqual(['Yellow Mural', 'East Fountain']);
  });

  it('answers 304 for the view the page has, and anew once a report comes or goes', async () => {
    const made = await setup();
    web = made.web;
    const first = await made.ask();
    const etag = String(first.headers.etag);
    expect((await made.ask(ALICE, { 'if-none-match': etag })).statusCode).toBe(304);
    // A grunt tells the posts nothing: the view follows the reports themselves.
    await made.rocket('grunt:water', wayspotId(2));
    const after = await made.ask(ALICE, { 'if-none-match': etag });
    expect(after.statusCode).toBe(200);
    expect(after.json<StopReportsView>().grunts).toHaveLength(1);
    // Its half hour over: gone from the view, though the store keeps it until the upkeep.
    vi.setSystemTime(STOP_NOON + 31 * 60_000);
    made.web.clock.now = STOP_NOON + 31 * 60_000;
    expect((await made.ask()).json<StopReportsView>().grunts).toEqual([]);
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: URL })).statusCode).toBe(401);
    expect((await made.ask('200000000000000099')).statusCode).toBe(403);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask()).statusCode).toBe(503);
  });

  it('reads nothing of the server for somebody who is no member', async () => {
    const made = await setup();
    web = made.web;
    await made.research([wayspotId(1)]);
    const standing = vi.spyOn(made.ctx.stopReports, 'standing');
    const idFor = vi.spyOn(made.ctx.guilds, 'idFor');
    expect((await made.ask('200000000000000099')).statusCode).toBe(403);
    expect(standing).not.toHaveBeenCalled();
    expect(idFor).not.toHaveBeenCalled();
    // A member is read for, and one Discord said lately still is while it is away (read-only).
    expect((await made.ask()).statusCode).toBe(200);
    expect(standing).toHaveBeenCalledTimes(1);
    made.members.failing = new Error('Discord is away');
    const away = await made.ask();
    expect(away.statusCode).toBe(200);
    expect(away.json<StopReportsView>().research).toMatchObject([
      { stop: { name: 'Yellow Mural' }, mayTakeBack: false },
    ]);
  });

  it('answers one address only so often', async () => {
    const made = await setup();
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'Alice');
    let status = 0;
    for (let n = 0; n <= STOP_REPORTS_PER_MINUTE; n++) {
      status = (await made.web.app.inject({ method: 'GET', url: URL, headers: { cookie } }))
        .statusCode;
    }
    expect(status).toBe(429);
  });

  it('gives no report of another server', async () => {
    const made = await setup();
    web = made.web;
    await made.research([wayspotId(1)]);
    await made.ctx.stopReports.reportResearch({
      serverId: OTHER_GUILD_ID,
      stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(2)]),
      subject: readTask(made.ctx, DRAGON.key, null),
      reporter: ALICE_AS,
    });
    expect(made.store.rows.size).toBe(2);
    const view = (await made.ask()).json<StopReportsView>();
    expect(view.research.map((one) => one.stop.name)).toEqual(['Yellow Mural']);
  });

  it('places the reports in their regions once a request, however many there are', async () => {
    const made = await setup();
    web = made.web;
    const all = vi.spyOn(made.ctx.regions, 'all');
    await made.research([wayspotId(1)]);
    all.mockClear();
    await made.ask();
    const once = all.mock.calls.length;
    await made.research([wayspotId(2), wayspotId(3)]);
    await made.rocket('grunt:water', wayspotId(2));
    all.mockClear();
    await made.ask();
    expect(all.mock.calls.length).toBe(once);
  });

  it('reads the posts of the stops as last drawn, and never draws one itself', async () => {
    let posts: StopPostService | undefined;
    // West's board post (plan 8R-9), made once the gateway is there.
    let board: string | null = null;
    const made = await setup((reporting) => {
      posts = new StopPostService({
        storage: new MemoryStopPosts(),
        reports: reporting.ctx.stopReports,
        events: reporting.ctx.raidEvents,
        regions: {
          all: () =>
            reporting.ctx.regions
              .all()
              .map((region) =>
                region.channelId === WEST_CHANNEL ? { ...region, summaryMessageId: board } : region,
              ),
        },
        guilds: {
          ...reporting.ctx.guilds,
          snowflakeOf: (row) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
        },
        gateway: reporting.made.gateway,
        zone: reporting.ctx.config.settings.timezone,
        log: reporting.ctx.log,
        now: () => STOP_NOON,
        // Long enough that only `flush` draws while the test runs.
        delayMs: 60_000,
      });
      return posts;
    });
    web = made.web;
    if (!posts) throw new Error('no posts');
    const forum = made.ctx.regions.all().find((one) => one.channelId === WEST_CHANNEL);
    made.made.gateway.addForum(forum?.forumChannelId ?? '');
    board =
      (await made.made.gateway.createPost(forum?.forumChannelId ?? '', {
        title: 'Today and coming up',
        message: { content: 'The summary' },
        tagIds: [],
      })) ?? null;
    try {
      await made.research([wayspotId(1)]);
      await posts.flush();
      const [post] = made.made.gateway.messagesIn(board ?? '');
      const calls = [...made.made.gateway.calls];
      // A change still gathering: the poll shows the post as drawn, and draws nothing.
      await made.rocket('leader:arlo', wayspotId(2));
      const view = (await made.ask()).json<StopReportsView>();
      expect(view.research[0]?.link).toBe(
        `https://discord.com/channels/${FAKE_GUILD_ID}/${board ?? ''}/${post?.id ?? ''}`,
      );
      expect(view.hideouts).toHaveLength(1);
      expect(made.made.gateway.calls).toEqual(calls);
    } finally {
      await posts.close();
    }
  });
});
