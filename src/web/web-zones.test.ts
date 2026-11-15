import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryActivity } from '../../test/support/activity.js';
import { boardAttendee, boardRecord } from '../../test/support/board-cases.js';
import { boardsWith } from '../../test/support/boards.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { MemoryHistory } from '../../test/support/history.js';
import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW, TEST_SPOT, asMax, at } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { pageTask } from '../../test/support/research.js';
import { changeServers, withZones } from '../../test/support/server-values.js';
import { STOP_NOON, stopReportingWith } from '../../test/support/stop-reporting.js';
import { createTestContext } from '../../test/support/test-context.js';
import { zonedAt } from '../../test/support/time.js';
import { trainRecord } from '../../test/support/train-history-cases.js';
import { wayspotId } from '../../test/support/wayspot-cases.js';
import { noWayspots, wayspotsWith } from '../../test/support/wayspots.js';
import {
  activityWebWith,
  FakeActingMembers,
  maxWebWith,
  meetupWebWith,
  partyWebWith,
  raidWebWith,
  stopWebWith,
  trainWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { readTask } from '../commands/research/research-input.js';
import { reportResearchAs, stopsByKey } from '../commands/research/research-report.js';
import type { BoardsView } from '../domain/web/board-data.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { StopReportsView } from '../domain/web/stop-report-data.js';
import type { TrainMonthView } from '../domain/web/train-history-data.js';

const BERLIN = 'Europe/Berlin';
const berlin = (local: string) => zonedAt(local, BERLIN);
const API = `/s/${FAKE_GUILD_ID}/api`;

describe('the web in its server’s zone (plan 19A-2)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await web?.app.close();
    web = undefined;
  });

  /** A POST of Alice's to the map of the fakes' server, as the page sends it. */
  async function post(served: TestWeb, path: string, body: unknown) {
    const headers = await served.posting(ALICE, 'Alice');
    const answer = await served.app.inject({
      method: 'POST',
      url: `${API}${path}`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<Record<string, unknown>>() };
  }

  /** A GET of Alice's on the map of the fakes' server. */
  async function get(served: TestWeb, path: string) {
    const cookie = await served.loggedIn(ALICE, 'Alice');
    return served.app.inject({ url: `${API}${path}`, headers: { cookie } });
  }

  it('gives the parties’ view in the zone of the server it shows, not the instance’s', async () => {
    const made = await reportedRaid();
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made),
      serverSettings: withZones({ [FAKE_GUILD_ID]: BERLIN }),
    });
    web.clock.now = PARTY_NOW;
    const answer = await get(web, '/parties');
    expect(answer.statusCode).toBe(200);
    expect(answer.json<PartiesView>().zone).toBe(BERLIN);
  });

  it('gives the heatmap’s hours in the zone of the server it shows', async () => {
    // Kolkata is half an hour off New York's hours.
    const made = await partyServiceWith();
    const servers = withZones({ [FAKE_GUILD_ID]: 'Asia/Kolkata' });
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made),
      serverSettings: servers,
      activity: activityWebWith({
        reader: new MemoryActivity(),
        gyms: gymsFixture(),
        regions: regionsFixture(),
        wayspots: noWayspots(),
        servers,
      }),
    });
    web.clock.now = PARTY_NOW;
    const answer = await get(web, '/activity?mode=now');
    expect(answer.statusCode).toBe(200);
    // 14:00 in New York is 23:30 in Kolkata: the window moves on at 00:00 there, a Wednesday.
    expect(answer.json<{ weekday: number | null; changesInMs: number | null }>()).toMatchObject({
      weekday: 2,
      changesInMs: 30 * 60_000,
    });
  });

  // One route of each family whose words, times or days would be New York's with the instance's
  // zone (fix round 2, N7 d).

  it('words a raid report’s refusal in the server’s clock (raids)', async () => {
    const made = await partyServiceWith([]);
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      raids: made.raids,
      parties: made.store,
      regions: made.regions,
    });
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
      raids: raidWebWith(ctx),
      serverSettings: withZones({ [FAKE_GUILD_ID]: BERLIN }),
    });
    // 14:00 in New York, 20:00 in Berlin: an egg hatches between 19:15 and 21:00 there.
    web.clock.now = PARTY_NOW;
    const late = await post(web, '/raids', { gym: 1, boss: 'e:T5:0', time: '11pm' });
    expect(late.status).toBe(422);
    expect(late.json['text']).toBe(
      '"11pm" cannot be the time the egg hatches: it must be between 7:15 PM and 9:00 PM.',
    );
  });

  it('reads a max battle’s end on the server’s clock, and words it there (max battles)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
    const made = await maxReportingWith();
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
      maxes: maxWebWith(made.ctx, { channelName: () => 'west' }),
      serverSettings: withZones({ [FAKE_GUILD_ID]: BERLIN }),
    });
    // 14:00 in New York, 20:00 in Berlin: the battle stands until 21:00 there.
    web.clock.now = MAX_THURSDAY;
    const answer = await post(web, '/maxes', { spot: TEST_SPOT.id, boss: 'm:D2:machop' });
    expect(answer.status).toBe(200);
    expect(answer.json['text']).toBe(
      'Reported: Dynamax Machop (2★) at Gazebo of the Park, until 9:00 PM.',
    );
    expect(asMax(made.store.active()[0]).endTime).toBe(berlin('2026-10-22T21:00'));
  });

  it('gives a meetup’s start hint with a date of the server’s calendar (meetups)', async () => {
    const made = await meetupSafetyWith({});
    const { wayspots } = await wayspotsWith([]);
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
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
      meetups: meetupWebWith(ctx, { channelName: () => 'west' }),
      serverSettings: withZones({ [FAKE_GUILD_ID]: BERLIN }),
    });
    // 20:00 on the 13th in New York is 02:00 on the 14th in Berlin: three days on is the 17th.
    web.clock.now = at('2026-10-13T20:00');
    const answer = await post(web, '/meetups', {
      region: 1,
      name: 'Picnic',
      place: { kind: 'gym', id: '1' },
      start: 'none',
      info: 'Bring snacks.',
    });
    expect(answer.status).toBe(422);
    expect(answer.json['text']).toContain('10-17 6:15pm');
  });

  it('reads a train’s typed start on the server’s clock, and words it there (trains)', async () => {
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
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
      trains: trainWebWith(ctx, { channelName: () => 'west' }),
      serverSettings: withZones({ [FAKE_GUILD_ID]: BERLIN }),
    });
    // 14:00 in New York, 20:00 in Berlin.
    web.clock.now = PARTY_NOW;
    const answer = await post(web, '/trains', { region: 1, name: 'Park loop', time: '9:15pm' });
    expect(answer.status).toBe(200);
    expect(answer.json['text']).toContain('It starts at 9:15 PM.');
    expect(answer.json['train']).toMatchObject({ startTime: berlin('2026-10-13T21:15') });
  });

  it('shows the stops’ reports of the server’s own day (stops)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: STOP_NOON });
    const made = await stopReportingWith();
    // The context's servers are the web's: the reports' day and the routes read one zone.
    changeServers(made.ctx, { timezone: BERLIN });
    const served = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made.made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
      stops: stopWebWith(made.ctx, { grunts: made.grunts }),
      serverSettings: made.ctx.servers,
    });
    web = served;
    // 17:00 in New York, 23:00 in Berlin: a report of Berlin's 22nd, standing until its midnight.
    vi.setSystemTime(zonedAt('2026-10-22T17:00', 'America/New_York'));
    await reportResearchAs(made.ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]),
      subject: readTask(
        made.ctx,
        FAKE_GUILD_ID,
        pageTask('Catch a Dragon-type Pokémon').key,
        null,
        BERLIN,
      ),
      reporter: { id: ALICE, name: 'Alice' },
    });
    const shown = async (time: number) => {
      vi.setSystemTime(time);
      served.clock.now = time;
      const answer = await get(served, '/stop-reports');
      return answer.json<StopReportsView>().research.map((one) => one.stop.name);
    };
    expect(await shown(berlin('2026-10-22T23:30'))).toEqual(['Yellow Mural']);
    // Berlin's midnight, 18:30 in New York: a new day there.
    expect(await shown(berlin('2026-10-23T00:30'))).toEqual([]);
  });

  it('ranks the boards by the server’s months (boards)', async () => {
    const made = await partyServiceWith();
    const servers = withZones({ [FAKE_GUILD_ID]: BERLIN });
    const boards = boardsWith((serverId) => servers.zoneOf(serverId));
    // 20:00 on October 31st in New York is 01:00 on November 1st in Berlin: of November there.
    boards.reader.records.push(
      boardRecord({
        serverId: FAKE_GUILD_ID,
        createdById: BOB,
        createdAt: zonedAt('2026-10-31T20:00', 'America/New_York'),
        attendees: [boardAttendee(BOB, 'done'), boardAttendee(null, 'done')],
      }),
    );
    await boards.optIns.joinBoards(BOB, FAKE_GUILD_ID, 1);
    boards.members.add(ALICE, 'Alice').add(BOB, 'Bob');
    web = webServerWith({
      members: boards.members,
      parties: partyWebWith(made),
      serverSettings: servers,
      activity: activityWebWith({
        reader: new MemoryActivity(),
        gyms: gymsFixture(),
        regions: regionsFixture(),
        wayspots: noWayspots(),
        channelName: (channelId) => (channelId === WEST_CHANNEL ? 'west' : undefined),
        boards: boards.boards,
        memberStats: boards.memberStats,
        servers,
      }),
    });
    web.clock.now = berlin('2026-11-05T12:00');
    const view = (await get(web, '/stats/boards')).json<BoardsView>();
    expect(view.boards[0]?.rows).toEqual([{ rank: 1, name: 'Bob', count: '1 raid' }]);
  });

  it('lists the ended trains by the server’s days and clock (history trains)', async () => {
    const made = await partyServiceWith();
    const servers = withZones({ [FAKE_GUILD_ID]: BERLIN });
    const history = new MemoryHistory();
    // 18:00 on Sunday June 14th in New York is midnight on Monday the 15th in Berlin.
    history.records.push(trainRecord(zonedAt('2026-06-14T18:00', 'America/New_York')));
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      parties: partyWebWith(made),
      serverSettings: servers,
      activity: activityWebWith({
        reader: new MemoryActivity(),
        gyms: gymsFixture(),
        regions: regionsFixture(),
        wayspots: noWayspots(),
        trains: history,
        servers,
      }),
    });
    web.clock.now = berlin('2026-11-05T12:00');
    const view = (await get(web, '/history/trains?month=2026-06')).json<TrainMonthView>();
    expect(view.trains.map((train) => train.when)).toEqual(['Mon, Jun 15, 12:00 AM']);
  });
});
