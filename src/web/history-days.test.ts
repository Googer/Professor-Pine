import { afterEach, describe, expect, it } from 'vitest';
import { activityDay } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { zonedAt } from '../../test/support/time.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import {
  activityWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { ActivityDay } from '../domain/history/activity.js';
import { dayNumber, dayText } from '../domain/history/big-days.js';
import type {
  BigDaysView,
  BossListView,
  BossTrendView,
  HistoryDaysView,
} from '../domain/web/history-days-data.js';
import { HistoryDays } from '../services/history-days.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { bigDaysView } from './history-days.js';
import { DAYS_PER_MINUTE } from './history-routes.js';

const BASE = `/s/${FAKE_GUILD_ID}/api/history`;
const ZONE = 'America/New_York';
const NOW = zonedAt('2026-11-06T12:00', ZONE);

/** `count` days from `first`: 40 raids a day in West (region 1), and the days `spikes` gives. */
function stretch(first: string, count: number, spikes: Record<string, ActivityDay[]> = {}) {
  const start = dayNumber(first);
  return Array.from({ length: count }, (_, index) => {
    const day = dayText(start + index);
    return spikes[day] ?? [activityDay(day, '', 40 + ((index * 7) % 5) - 2)];
  }).flat();
}

/** Mewtwo's evening of 2019-10-08: 180 of 412 raids, 60 of them and 100 others in East. */
const MEWTWO_DAY = [
  activityDay('2019-10-08', 'mewtwo', 120),
  activityDay('2019-10-08', 'mewtwo', 60, { regionId: 2 }),
  activityDay('2019-10-08', '', 132),
  activityDay('2019-10-08', '', 100, { regionId: 2 }),
];

/**
 * The history page's days over raids per day in memory, the fakes' server with the invented
 * regions (West 1, East 2 with their forums), Alice and Bob members, the clock at `NOW`.
 */
async function setup(days: readonly ActivityDay[]) {
  const made = await partyServiceWith();
  const activity = new MemoryActivity();
  await activity.addDays(FAKE_GUILD_ID, days);
  const { wayspots } = await wayspotsWith([]);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const web = webServerWith({
    members,
    parties: partyWebWith(made),
    activity: activityWebWith({
      reader: activity,
      gyms: gymsFixture(),
      regions: regionsFixture(),
      wayspots,
    }),
  });
  web.clock.now = NOW;
  const ask = async (path: string, userId = ALICE, headers: Record<string, string> = {}) => {
    const cookie = await web.loggedIn(userId, 'x');
    return web.app.inject({
      method: 'GET',
      url: `${BASE}${path}`,
      headers: { cookie, ...headers },
    });
  };
  return { made, web, members, activity, ask };
}

describe('the history page’s raids by day', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('gives a year’s days, its month totals and its big days in the server’s words', async () => {
    const made = await setup(stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }));
    web = made.web;
    const answer = await made.ask('/days?year=2019');
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<HistoryDaysView>();
    expect(view).toMatchObject({
      year: 2019,
      years: [2019],
      title: 'Raids by day, 2019',
      length: 365,
      maxes: false,
      bigTitle: 'Big days of 2019',
      // What a big day is, in plain words, both signals (B5).
      bigNote: 'A big day had far more raids than the weeks around it, or far more of one boss.',
      big: [
        {
          day: '2019-10-08',
          date: 'Tuesday, October 8, 2019',
          short: 'Oct 8',
          raids: 412,
          label: 'Mewtwo day, 180 of 412 raids',
          labeled: true,
          top: true,
        },
      ],
      // The words of the chart's table (B12).
      monthWord: 'Month',
      bigDayWord: 'Big day',
    });
    expect(view.days).toHaveLength(40);
    expect(view.months.map((one) => one.month)).toHaveLength(12);
    expect(view.months[9]).toMatchObject({ month: 'October', maxes: 0 });
    // Without a year, the newest the server has.
    expect((await made.ask('/days')).json<HistoryDaysView>().year).toBe(2019);
  });

  it('lists a year’s big days by date, labels one day of a run, and marks the top three (B1, B6)', async () => {
    const made = await setup(
      stretch('2019-09-01', 120, {
        '2019-09-18': [activityDay('2019-09-18', 'mewtwo', 500)],
        '2019-10-08': MEWTWO_DAY,
        '2019-10-09': [activityDay('2019-10-09', '', 300)],
        '2019-11-02': [activityDay('2019-11-02', 'regirock', 200)],
        '2019-11-20': [activityDay('2019-11-20', 'deoxys', 600)],
      }),
    );
    web = made.web;
    const view = (await made.ask('/days?year=2019')).json<HistoryDaysView>();
    expect(view.big.map((one) => [one.day, one.labeled, one.top])).toEqual([
      ['2019-09-18', true, true],
      ['2019-10-08', true, true],
      // The run's lesser day: colored on the chart, not labeled; the run is in the top once.
      ['2019-10-09', false, false],
      ['2019-11-02', true, false],
      ['2019-11-20', true, true],
    ]);
  });

  it('gives the year of now in the zone where the server has no days (A6)', async () => {
    const made = await setup([]);
    web = made.web;
    // 03:00 UTC of New Year's Day is the last evening of the year before in New York.
    made.web.clock.now = Date.UTC(2026, 0, 1, 3);
    expect((await made.ask('/days')).json<HistoryDaysView>().year).toBe(2025);
  });

  it('leaves out a region whose forum keeps the member out, and judges what is left', async () => {
    const made = await setup(stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }));
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.ask('/days?year=2019')).json<HistoryDaysView>();
    expect(alice.big).toMatchObject([{ raids: 252, label: 'Mewtwo day, 120 of 252 raids' }]);
    // A forum only the member's roles hide leaves nothing out.
    made.made.gateway.shutOut(EAST_FORUM, BOB);
    const bob = (await made.ask('/days?year=2019', BOB)).json<HistoryDaysView>();
    expect(bob.big).toMatchObject([{ raids: 412 }]);
    // Every route leaves the region out alike (G4).
    const bosses = (await made.ask('/bosses')).json<BossListView>();
    expect(bosses.bosses).toEqual([{ key: 'mewtwo', name: 'Mewtwo', raids: 120 }]);
    const trend = (await made.ask('/bosses/mewtwo')).json<BossTrendView>();
    expect(trend.total).toBe(120);
  });

  it('agrees with the events forum’s post for a member of no roles (G16)', async () => {
    const made = await setup(stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }));
    web = made.web;
    // East hidden from Bob as from everybody without a role: his page still counts it.
    made.made.gateway.shutOut(EAST_FORUM, BOB);
    const page = (await made.ask('/big-days', BOB)).json<BigDaysView>();
    // What the post counts: every region (none is barred to a member of no roles).
    const post = new HistoryDays({
      reader: made.activity,
      zoneOf: () => ZONE,
      bossName: (key) => catalogueFixture().byKey(key)?.name,
    });
    const posted = await post.everyYear(FAKE_GUILD_ID, new Set(), NOW);
    expect(page).toEqual(bigDaysView(posted));
    expect(page.years[0]?.days[0]?.label).toBe('Mewtwo day, 180 of 412 raids');
  });

  it('gives the top three of every year, newest first', async () => {
    const made = await setup([
      ...stretch('2018-11-20', 50, {
        '2018-12-15': [activityDay('2018-12-15', 'lugia', 300)],
        '2018-12-16': [activityDay('2018-12-16', 'lugia', 320)],
      }),
      ...stretch('2019-09-20', 40, { '2019-10-08': MEWTWO_DAY }),
    ]);
    web = made.web;
    const view = (await made.ask('/big-days')).json<BigDaysView>();
    expect(view.title).toBe('Big days of every year');
    expect(view.years.map((one) => [one.year, one.days.map((day) => day.label)])).toEqual([
      [2019, ['Mewtwo day, 180 of 412 raids']],
      [2018, ['Lugia day, 320 of 320 raids']],
    ]);
  });

  it('lists the bosses, and one boss’s raids by month', async () => {
    const made = await setup([
      activityDay('2018-11-21', 'mewtwo', 300),
      activityDay('2019-01-08', 'mewtwo', 20),
      activityDay('2019-01-08', 'lugia', 3),
    ]);
    web = made.web;
    expect((await made.ask('/bosses')).json<BossListView>()).toEqual({
      bosses: [
        { key: 'lugia', name: 'Lugia', raids: 3 },
        { key: 'mewtwo', name: 'Mewtwo', raids: 320 },
      ],
      // The page's words are the server's (B12).
      none: 'No raids with a known boss yet.',
      pick: 'Pick a boss from the list.',
    });
    const trend = (await made.ask('/bosses/mewtwo')).json<BossTrendView>();
    expect(trend).toEqual({
      key: 'mewtwo',
      name: 'Mewtwo',
      title: 'Mewtwo raids by month',
      summary: 'Mewtwo raids by month: 320 in all.',
      monthWord: 'Month',
      raidsWord: 'Raids',
      months: [
        { month: '2018-11', label: 'Nov 2018', raids: 300 },
        { month: '2018-12', label: 'Dec 2018', raids: 0 },
        { month: '2019-01', label: 'Jan 2019', raids: 20 },
      ],
      total: 320,
    });
    // A key the catalogue does not know is none; one no key can be is refused.
    expect((await made.ask('/bosses/missingno')).statusCode).toBe(404);
    expect((await made.ask('/bosses/Mew%20two')).statusCode).toBe(400);
  });

  it('answers 304 for the view the page has', async () => {
    const made = await setup(stretch('2019-09-20', 40));
    web = made.web;
    const first = await made.ask('/days?year=2019');
    const again = await made.ask('/days?year=2019', ALICE, {
      'if-none-match': String(first.headers.etag),
    });
    expect(again.statusCode).toBe(304);
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup(stretch('2019-09-20', 40));
    web = made.web;
    for (const path of ['/days?year=2019', '/big-days', '/bosses', '/bosses/mewtwo']) {
      expect(
        (await made.web.app.inject({ method: 'GET', url: `${BASE}${path}` })).statusCode,
        path,
      ).toBe(401);
      expect((await made.ask(path, '200000000000000099')).statusCode, path).toBe(403);
    }
    expect(made.activity.reads).toBe(0);
    made.members.failing = new Error('Discord is away');
    expect((await made.ask('/big-days')).statusCode).toBe(503);
    expect(made.activity.reads).toBe(0);
  });

  it('refuses what it does not know', async () => {
    const made = await setup(stretch('2019-09-20', 40));
    web = made.web;
    // A year before the game's (B13) is none.
    for (const path of [
      '/days?year=19',
      '/days?year=2015',
      '/days?year=2019&zone=UTC',
      '/big-days?year=2019',
    ]) {
      expect((await made.ask(path)).statusCode, path).toBe(400);
    }
    expect(made.activity.reads).toBe(0);
  });

  it('answers one address only so often', async () => {
    const made = await setup([]);
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'Alice');
    let status = 0;
    for (let n = 0; n <= DAYS_PER_MINUTE; n++) {
      status = (
        await made.web.app.inject({ method: 'GET', url: `${BASE}/big-days`, headers: { cookie } })
      ).statusCode;
    }
    expect(status).toBe(429);
  });
});
