import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryActivity } from '../../test/support/activity.js';
import { boardAttendee, boardRecord, keptReport } from '../../test/support/board-cases.js';
import { boardsWith } from '../../test/support/boards.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL } from '../../test/support/parties.js';
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
import type { HistoryRecord } from '../domain/history/party-history.js';
import type { BoardsView, MemberStatsView } from '../domain/web/board-data.js';
import { BOARDS_PER_MINUTE } from './history-routes.js';
import { UNCONFIRMED } from './party-routes.js';

const BOARDS = `/s/${FAKE_GUILD_ID}/api/stats/boards`;
const ME = `/s/${FAKE_GUILD_ID}/api/stats/me`;
const ZONE = 'America/New_York';
const at = (local: string) => zonedAt(local, ZONE);
const NOW = at('2026-11-05T12:00');

const raid = (maker: string, local: string, overrides: Partial<HistoryRecord> = {}) =>
  boardRecord({
    serverId: FAKE_GUILD_ID,
    createdById: maker,
    createdAt: at(local),
    attendees: [boardAttendee(maker, 'done'), boardAttendee(null, 'done')],
    ...overrides,
  });

/**
 * This month Bob reported two raids others completed and Alice one; both are on the boards and
 * members; Carol reported three, with her switch off. Alice's record of March is in East.
 */
async function setup() {
  const made = await partyServiceWith();
  const boards = boardsWith(ZONE);
  boards.reader.records.push(
    raid(BOB, '2026-11-01T10:00'),
    raid(BOB, '2026-11-02T10:00', { reached: 12 }),
    raid(ALICE, '2026-11-03T10:00'),
    raid(ALICE, '2026-03-03T10:00', { regionId: 2 }),
    ...Array.from({ length: 3 }, (_, n) => raid(CAROL, `2026-11-0${String(n + 1)}T12:00`)),
  );
  boards.reader.reports.push(
    keptReport({ serverId: FAKE_GUILD_ID, reporterId: ALICE, endedAt: NOW - 1, reach: 4 }),
  );
  await boards.optIns.joinBoards(ALICE, FAKE_GUILD_ID, 1);
  await boards.optIns.joinBoards(BOB, FAKE_GUILD_ID, 1);
  await boards.optIns.optIn(CAROL, FAKE_GUILD_ID, 1);
  boards.members.add(ALICE, 'Alice').add(BOB, 'Bob').add(CAROL, 'Carol');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
  ]);
  const web = webServerWith({
    members: boards.members,
    parties: partyWebWith(made),
    activity: activityWebWith({
      reader: new MemoryActivity(),
      gyms: gymsFixture(),
      regions: regionsFixture(),
      wayspots: noWayspots(),
      channelName: (channelId) => names.get(channelId),
      boards: boards.boards,
      memberStats: boards.memberStats,
    }),
  });
  web.clock.now = NOW;
  const ask = async (url: string, userId = ALICE, headers: Record<string, string> = {}) => {
    const cookie = await web.loggedIn(userId, 'x');
    return web.app.inject({ method: 'GET', url, headers: { cookie, ...headers } });
  };
  return { boards, web, ask };
}

describe('the boards on the web', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('gives every board of this month, worded as /stats boards words them', async () => {
    const made = await setup();
    web = made.web;
    const answer = await made.ask(BOARDS);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<BoardsView>();
    expect(view.period).toBe('month');
    expect(view.boards.map((board) => board.board)).toEqual([
      'raids',
      'trains',
      'meetups',
      'reports',
      'wanted',
      'sent',
      'tasks',
    ]);
    expect(view.boards[0]).toEqual({
      board: 'raids',
      title: 'Raids reported that others completed, this month',
      rows: [
        { rank: 1, name: 'Bob', count: '2 raids' },
        { rank: 2, name: 'Alice', count: '1 raid' },
      ],
      empty: null,
      note: null,
      viewer: null,
    });
    expect(view.boards[1]?.empty).toBe('Nobody is ranked here this month.');
    expect(view.boards[5]?.rows).toEqual([
      { rank: 1, name: 'Mewtwo', count: 'sent to 12 members' },
    ]);
  });

  it('tells a member whose switch is off where they would be', async () => {
    const made = await setup();
    web = made.web;
    const view = (await made.ask(`${BOARDS}?period=year`, CAROL)).json<BoardsView>();
    expect(view.boards[0]?.rows.map((row) => row.name)).toEqual(['Bob', 'Alice']);
    expect(view.boards[0]?.viewer).toBe(
      'You would be #1 with 3 raids. Turn the boards on in /settings on Discord to be ranked.',
    );
  });

  it('is for members, and refuses a period it does not know', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: BOARDS })).statusCode).toBe(401);
    expect((await made.ask(BOARDS, '200000000000000099')).statusCode).toBe(403);
    expect((await made.ask(`${BOARDS}?period=week`)).statusCode).toBe(400);
    expect(made.boards.reader.reads).toBe(0);
    made.boards.members.failing = new Error('Discord is away');
    expect((await made.ask(BOARDS)).statusCode).toBe(503);
  });

  it('answers 503 while Discord cannot name the members, as for membership (B5)', async () => {
    const made = await setup();
    web = made.web;
    // Membership is answered (`find`); the names are not (`named`).
    const named = vi
      .spyOn(made.boards.members, 'named')
      .mockRejectedValue(new Error('Discord is away'));
    const answer = await made.ask(BOARDS);
    expect(answer.statusCode).toBe(503);
    expect(answer.json()).toEqual({ error: UNCONFIRMED });
    named.mockRestore();
    // Said in the bot's log (plan 8Z-2): Fastify's own logger is off, where it went unseen.
    expect(made.web.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: 'could not name the members of the boards',
        guild: FAKE_GUILD_ID,
        err: expect.objectContaining({ type: 'NamesUnavailable' }) as unknown,
      }),
    );
  });

  it('answers 304 for the boards the page has', async () => {
    const made = await setup();
    web = made.web;
    const etag = String((await made.ask(BOARDS)).headers.etag);
    expect((await made.ask(BOARDS, ALICE, { 'if-none-match': etag })).statusCode).toBe(304);
  });

  it('answers one address only so often', async () => {
    const made = await setup();
    web = made.web;
    let status = 0;
    for (let n = 0; n <= BOARDS_PER_MINUTE; n++) status = (await made.ask(BOARDS)).statusCode;
    expect(status).toBe(429);
  });
});

describe('"Your history" on the web', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('gives the member their own numbers of all time, with their years and months', async () => {
    const made = await setup();
    web = made.web;
    const answer = await made.ask(ME);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.json<MemberStatsView>()).toEqual({
      optedIn: true,
      year: null,
      years: [2026],
      title: 'Your history, all time',
      raids: { count: 2, anonymous: 0 },
      trains: { count: 0, anonymous: 0 },
      meetups: { count: 0, anonymous: 0 },
      reports: { count: 1, confirmations: 0 },
      completed: 2,
      trainsCame: 0,
      meetupsCame: 0,
      busiestRegion: '#west',
      bosses: [{ name: 'Mewtwo', count: 2 }],
      sent: 4,
      months: [
        { month: '2026-03', came: 1, reports: 0 },
        { month: '2026-11', came: 1, reports: 1 },
      ],
    });
  });

  it('keeps to a year, and refuses one that is no year', async () => {
    const made = await setup();
    web = made.web;
    const year = (await made.ask(`${ME}?year=2026`)).json<MemberStatsView>();
    expect(year.optedIn && year.empty === undefined && year.title).toBe('Your history in 2026');
    for (const query of ['?year=26', '?year=2026&x=1']) {
      expect((await made.ask(`${ME}${query}`)).statusCode, query).toBe(400);
    }
  });

  it('says of a year with nothing what /stats me says, with the member’s years (B3)', async () => {
    const made = await setup();
    web = made.web;
    const view = (await made.ask(`${ME}?year=2019`)).json<MemberStatsView>();
    expect(view).toEqual({
      optedIn: true,
      empty: 'Nothing of yours is in my history for 2019.',
      title: 'Your history in 2019',
      year: 2019,
      years: [2026],
    });
  });

  it('tells a member without the opt-in what would be counted', async () => {
    const made = await setup();
    web = made.web;
    await made.boards.optIns.optOut(BOB, FAKE_GUILD_ID);
    const view = (await made.ask(ME, BOB)).json<MemberStatsView>();
    expect(view.optedIn).toBe(false);
    expect(!view.optedIn && view.text).toBe(
      'Your history is off in this server, so I have nothing of yours to count. Turn it on in ' +
        '/settings on Discord, and I count what you do from then on.',
    );
  });

  it('is for members only', async () => {
    const made = await setup();
    web = made.web;
    expect((await made.web.app.inject({ method: 'GET', url: ME })).statusCode).toBe(401);
    expect((await made.ask(ME, '200000000000000099')).statusCode).toBe(403);
    expect(made.boards.reader.reads).toBe(0);
  });
});
