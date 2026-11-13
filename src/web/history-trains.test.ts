import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryActivity } from '../../test/support/activity.js';
import { boardAttendee, boardRecord } from '../../test/support/board-cases.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL } from '../../test/support/gyms.js';
import { MemoryHistory } from '../../test/support/history.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { zonedAt } from '../../test/support/time.js';
import { trainRecord } from '../../test/support/train-history-cases.js';
import { noWayspots } from '../../test/support/wayspots.js';
import {
  activityWebWith,
  partyWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import type { HistoryRecord, HistoryStop } from '../domain/history/party-history.js';
import type { TrainMonthView, TrainRouteView } from '../domain/web/train-history-data.js';
import { TRAINS_LISTED, TRAINS_PER_MINUTE } from './history-routes.js';

const ZONE = 'America/New_York';
const LIST = `/s/${FAKE_GUILD_ID}/api/history/trains`;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** A Thursday of November 2026: the page's now. */
const NOW = zonedAt('2026-11-05T12:00', ZONE);
/** A Sunday evening of June 2026. */
const SUNDAY = zonedAt('2026-06-14T18:00', ZONE);

/** A stop at a gym of the fixtures, in the regions given, at `from` minutes after `at`. */
const at = (
  gymId: number | null,
  regionIds: number[],
  start: number,
  from: number,
): HistoryStop => ({
  gymId,
  legacyGymId: gymId,
  wayspotId: null,
  arrivedAt: start + from * MINUTE,
  leftAt: start + (from + 20) * MINUTE,
  regionIds,
});

/** A train of West only (gyms 1 and 2), made at `start`, three riders. */
const westTrain = (start: number, overrides: Partial<HistoryRecord> = {}): HistoryRecord =>
  trainRecord(start, {
    regionId: 1,
    stops: [at(1, [1], start, 0), at(2, [1], start, 20)],
    ...overrides,
  });

/** A train of the old bot (no times), its stops at gyms of the fixtures or gone ones (null). */
const legacyTrain = (start: number, gyms: (number | null)[]): HistoryRecord =>
  trainRecord(start, {
    source: 'legacy',
    partyId: null,
    legacyKey: `west:${String(start)}`,
    regionId: 1,
    name: 'Old loop',
    endedAt: null,
    endTime: null,
    stops: gyms.map((gymId) => ({
      gymId,
      legacyGymId: gymId ?? 999,
      wayspotId: null,
      arrivedAt: null,
      leftAt: null,
    })),
  });

/**
 * The fakes' server with its history in memory, Alice and Bob members, West and East named by
 * their channels. `records` go in in order: a record's id is its place, from 1.
 */
async function setup(records: readonly HistoryRecord[]) {
  const made = await partyServiceWith();
  const history = new MemoryHistory();
  history.records.push(...records);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const names = new Map([
    [WEST_CHANNEL, 'west'],
    [EAST_CHANNEL, 'east'],
  ]);
  const web = webServerWith({
    members,
    parties: partyWebWith(made),
    activity: activityWebWith({
      reader: new MemoryActivity(),
      gyms: gymsFixture(),
      regions: regionsFixture(),
      wayspots: noWayspots(),
      channelName: (channelId) => names.get(channelId),
      trains: history,
    }),
  });
  web.clock.now = NOW;
  const ask = async (url: string, userId = ALICE) => {
    const cookie = await web.loggedIn(userId, 'x');
    return web.app.inject({ method: 'GET', url, headers: { cookie } });
  };
  const month = async (query: string, userId = ALICE) => ask(`${LIST}?month=${query}`, userId);
  const train = async (id: number | string, userId = ALICE) => ask(`${LIST}/${String(id)}`, userId);
  return { made, web, members, history, ask, month, train };
}

describe('the ended trains on the map’s History (plan 8H-7B)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('lists a month’s trains newest first, worded by the server', async () => {
    const made = await setup([
      trainRecord(SUNDAY),
      westTrain(SUNDAY + DAY, { name: 'Bloomfield <b>run</b>' }),
      legacyTrain(SUNDAY - DAY, [1, null, 2]),
      // May, and another server's.
      westTrain(zonedAt('2026-05-31T23:59', ZONE)),
      westTrain(SUNDAY, { serverId: '412345678901234568' }),
    ]);
    web = made.web;
    const answer = await made.month('2026-06');
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.json<TrainMonthView>()).toEqual({
      month: '2026-06',
      trains: [
        // The name as kept: the page sets it as text.
        {
          id: 2,
          name: 'Bloomfield <b>run</b>',
          when: 'Mon, Jun 15, 6:00 PM',
          about: 'About 2 stops · 3 riders',
        },
        {
          id: 1,
          name: 'Oakland loop',
          when: 'Sun, Jun 14, 6:00 PM',
          about: 'About 2 stops · 3 riders',
        },
        {
          id: 3,
          name: 'Old loop',
          when: 'Sat, Jun 13, 6:00 PM',
          about: '3 stops on the old bot’s record (no times) · 3 riders',
        },
      ],
      more: 0,
      older: false,
    });
  });

  it('leaves out a train fewer than three came to, and a legacy one the map cannot place', async () => {
    const made = await setup([
      westTrain(SUNDAY, {
        attendees: [
          boardAttendee(null, 'here'),
          boardAttendee(null, 'done'),
          boardAttendee(null, 'joined'),
          boardAttendee(null, 'interested'),
        ],
      }),
      legacyTrain(SUNDAY + MINUTE, [null, null]),
      westTrain(SUNDAY + 2 * MINUTE, {
        attendees: [
          boardAttendee(null, 'done'),
          boardAttendee(null, 'done'),
          boardAttendee(null, 'here'),
        ],
      }),
    ]);
    web = made.web;
    const { trains } = (await made.month('2026-06')).json<TrainMonthView>();
    expect(trains.map((one) => one.id)).toEqual([3]);
  });

  it('shows at most fifty, and counts only what the member may see in "more" (G5)', async () => {
    const records = Array.from({ length: TRAINS_LISTED + 2 }, (_, n) =>
      westTrain(SUNDAY + n * MINUTE),
    );
    // The newest one passed through East, whose forum keeps Alice out.
    records.push(trainRecord(SUNDAY + DAY));
    const made = await setup(records);
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.month('2026-06')).json<TrainMonthView>();
    expect(alice.trains).toHaveLength(TRAINS_LISTED);
    expect(alice.trains[0]?.id).toBe(TRAINS_LISTED + 2);
    // The newest fifty held one she may not see, so the last three were read too: all counted.
    expect(alice.more).toBe(2);
    expect(alice.older).toBe(false);
    const bob = (await made.month('2026-06', BOB)).json<TrainMonthView>();
    expect(bob.trains).toHaveLength(TRAINS_LISTED);
    expect(bob.trains[0]?.id).toBe(TRAINS_LISTED + 3);
    // His list was full after the newest fifty: the three older ones were not read, so they
    // are not counted, only said to be possible (plan 8Z-2).
    expect(bob.more).toBe(0);
    expect(bob.older).toBe(true);
  });

  it('reads the cards in growing chunks, newest first, and no further once fifty are shown (plan 8Z-2)', async () => {
    // The newest sixty were ridden by two (never listed); then seventy that are.
    const few = [boardAttendee(null, 'done'), boardAttendee(null, 'here')];
    const made = await setup(
      Array.from({ length: 130 }, (_, n) =>
        westTrain(SUNDAY + n * MINUTE, n >= 70 ? { attendees: few } : {}),
      ),
    );
    web = made.web;
    const reads = vi.spyOn(made.history, 'trainCardRows');
    const asked = () => reads.mock.calls.map(([, ids]) => [ids[0], ids.at(-1), ids.length]);
    const june = (await made.month('2026-06')).json<TrainMonthView>();
    // 130 to 81 (none listed), then 80 to 1 in one read (seventy listed): all are read.
    expect(asked()).toEqual([
      [130, 81, 50],
      [80, 1, 80],
    ]);
    expect(june.trains.map((one) => one.id)).toEqual(
      Array.from({ length: TRAINS_LISTED }, (_, n) => 70 - n),
    );
    expect(june.more).toBe(20);
    expect(june.older).toBe(false);
  });

  it('reads a month of unlisted trains in three reads: 50, 200, then the rest', async () => {
    const few = [boardAttendee(null, 'done'), boardAttendee(null, 'here')];
    const made = await setup(
      Array.from({ length: 600 }, (_, n) => westTrain(SUNDAY + n * MINUTE, { attendees: few })),
    );
    web = made.web;
    const reads = vi.spyOn(made.history, 'trainCardRows');
    const june = (await made.month('2026-06')).json<TrainMonthView>();
    expect(reads.mock.calls.map(([, ids]) => ids.length)).toEqual([50, 200, 350]);
    expect(june).toMatchObject({ trains: [], more: 0, older: false });
  });

  it('says only "older" when the list fills partway through a later chunk (heading 50+)', async () => {
    // The newest ten are listed, the next forty never are, then listed ones: the list fills in
    // the second chunk, and the trains of the third are not read.
    const few = [boardAttendee(null, 'done'), boardAttendee(null, 'here')];
    const made = await setup(
      Array.from({ length: 300 }, (_, n) =>
        westTrain(SUNDAY + n * MINUTE, n >= 290 || n < 250 ? {} : { attendees: few }),
      ),
    );
    web = made.web;
    const june = (await made.month('2026-06')).json<TrainMonthView>();
    expect(june.trains).toHaveLength(TRAINS_LISTED);
    expect(june).toMatchObject({ more: 0, older: true });
  });

  it('stops at the first fifty of a month of many trains', async () => {
    const made = await setup(Array.from({ length: 180 }, (_, n) => westTrain(SUNDAY + n * MINUTE)));
    web = made.web;
    const reads = vi.spyOn(made.history, 'trainCardRows');
    const june = (await made.month('2026-06')).json<TrainMonthView>();
    expect(reads.mock.calls.map(([, ids]) => [ids[0], ids.at(-1)])).toEqual([[180, 131]]);
    expect(june.trains.map((one) => one.id)).toEqual(
      Array.from({ length: TRAINS_LISTED }, (_, n) => 180 - n),
    );
    expect(june).toMatchObject({ more: 0, older: true });
  });

  it('leaves out a train of a barred region, by its own region or any stop’s (G5)', async () => {
    const made = await setup([
      // Made in East, its stops in West.
      westTrain(SUNDAY, { regionId: 2 }),
      // Made in West, one stop in East.
      westTrain(SUNDAY + MINUTE, { stops: [at(1, [1], SUNDAY, 0), at(7, [2], SUNDAY, 20)] }),
      legacyTrain(SUNDAY + 2 * MINUTE, [1]),
      { ...legacyTrain(SUNDAY + 3 * MINUTE, [7]), regionId: 2 },
      westTrain(SUNDAY + 4 * MINUTE),
    ]);
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.month('2026-06')).json<TrainMonthView>();
    expect(alice.trains.map((one) => one.id)).toEqual([5, 3]);
    const bob = (await made.month('2026-06', BOB)).json<TrainMonthView>();
    expect(bob.trains.map((one) => one.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('keeps a train whose region only the member’s roles hide, or that is gone', async () => {
    const made = await setup([
      westTrain(SUNDAY, { regionId: 2 }),
      westTrain(SUNDAY + MINUTE, { regionId: 99 }),
    ]);
    web = made.web;
    made.made.gateway.shutOut(EAST_FORUM, ALICE);
    const alice = (await made.month('2026-06')).json<TrainMonthView>();
    expect(alice.trains.map((one) => one.id)).toEqual([2, 1]);
  });

  it('gives a train’s route as indexes into its places, and its card in the web’s words', async () => {
    const start = SUNDAY;
    const made = await setup([
      trainRecord(start, {
        stops: [
          at(1, [1], start, 0),
          at(7, [2], start, 20),
          // A gym gone since: passed over, the line joins its neighbours.
          at(null, [], start, 40),
          at(1, [1], start, 60),
        ],
      }),
      // A raid recorded at gym 7 while the train was there.
      boardRecord({
        serverId: FAKE_GUILD_ID,
        gymId: 7,
        tier: 'T5',
        createdAt: start,
        hatchTime: start + 10 * MINUTE,
        endTime: start + 55 * MINUTE,
        endedAt: start + 60 * MINUTE,
      }),
    ]);
    web = made.web;
    const answer = await made.train(1);
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    expect(answer.json<TrainRouteView>()).toEqual({
      id: 1,
      name: 'Oakland loop',
      when: 'Sun, Jun 14, 6:00 PM',
      about: 'About 4 stops · 3 riders',
      month: '2026-06',
      points: [
        { lat: 40.05, lon: -80.05 },
        { lat: 40.05, lon: -79.99 },
      ],
      route: [0, 1, 0],
      card: [
        { text: 'How the train went', small: false },
        { text: 'About 4 stops in 1 h 20 min', small: false },
        { text: 'Through #west · #east', small: false },
        { text: '3 riders', small: false },
        { text: 'Recorded along the way: 1 Level 5 raid', small: false },
        {
          text: 'Approximate: a stop made in the game without moving the train in Pine is not counted.',
          small: true,
        },
      ],
    });
  });

  it('gives a legacy train its line and one line of its stops, no card (G3)', async () => {
    const made = await setup([legacyTrain(SUNDAY, [1, null, 7, 1])]);
    web = made.web;
    const view = (await made.train(1)).json<TrainRouteView>();
    expect(view.route).toEqual([0, 1, 0]);
    expect(view.card).toEqual([
      { text: '4 stops on the old bot’s record (no times)', small: false },
    ]);
  });

  it('gates a legacy train by the regions its gyms lie in now, and leaves out one with none (A1)', async () => {
    const made = await setup([
      // No region of its own, a stop at an East gym; one at a gym in no region (10) only.
      { ...legacyTrain(SUNDAY, [7]), regionId: null },
      { ...legacyTrain(SUNDAY + MINUTE, [10]), regionId: null },
      { ...legacyTrain(SUNDAY + 2 * MINUTE, [1]), regionId: null },
    ]);
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const alice = (await made.month('2026-06')).json<TrainMonthView>();
    expect(alice.trains.map((one) => one.id)).toEqual([3]);
    const bob = (await made.month('2026-06', BOB)).json<TrainMonthView>();
    expect(bob.trains.map((one) => one.id)).toEqual([3, 1]);
    const refused = await made.train(999);
    for (const [id, userId] of [
      [1, ALICE],
      [2, BOB],
    ] as const) {
      const answer = await made.train(id, userId);
      expect(answer.statusCode, String(id)).toBe(404);
      expect(answer.body).toBe(refused.body);
    }
    expect((await made.train(1, BOB)).statusCode).toBe(200);
  });

  it('refuses the route of a train with any stop in a barred region (A5)', async () => {
    const made = await setup([
      westTrain(SUNDAY, { stops: [at(1, [1], SUNDAY, 0), at(7, [2], SUNDAY, 20)] }),
    ]);
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const refused = await made.train(999);
    const answer = await made.train(1);
    expect(answer.statusCode).toBe(404);
    expect(answer.body).toBe(refused.body);
    expect((await made.train(1, BOB)).statusCode).toBe(200);
  });

  it('asks Discord the same for any id: every region of the server, before the record (A2)', async () => {
    const asked = async (id: number) => {
      const made = await setup([westTrain(SUNDAY, { regionId: 2 })]);
      const access = vi.spyOn(made.made.gateway, 'memberAccess');
      await made.train(id);
      await made.web.app.close();
      return access.mock.calls.map(([forum]) => forum).sort();
    };
    const existing = await asked(1);
    expect(existing.length).toBeGreaterThan(0);
    expect(await asked(999)).toEqual(existing);
  });

  it('answers 304 for a list or a route the page has (A5)', async () => {
    const made = await setup([westTrain(SUNDAY)]);
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'x');
    for (const url of [`${LIST}?month=2026-06`, `${LIST}/1`]) {
      const first = await made.web.app.inject({ method: 'GET', url, headers: { cookie } });
      const etag = String(first.headers.etag);
      const again = await made.web.app.inject({
        method: 'GET',
        url,
        headers: { cookie, 'if-none-match': etag },
      });
      expect(again.statusCode, url).toBe(304);
    }
  });

  it('gives the card without raids where they cannot be read, and says so in the log (A5)', async () => {
    const made = await setup([westTrain(SUNDAY)]);
    web = made.web;
    vi.spyOn(made.history, 'raidsAlong').mockRejectedValue(new Error('the database is away'));
    const answer = await made.train(1);
    expect(answer.statusCode).toBe(200);
    const lines = answer.json<TrainRouteView>().card.map((line) => line.text);
    expect(lines).toContain('About 2 stops in 40 min');
    expect(lines.some((line) => line.includes('along the way'))).toBe(false);
    expect(made.web.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: 'could not read the raids along the way of an ended train',
        err: expect.objectContaining({ message: 'the database is away' }) as unknown,
      }),
    );
  });

  it('answers every train it will not show with the same 404 (G1, G11)', async () => {
    const made = await setup([
      // 1: two came. 2: another server's. 3: East, barred to Alice. 4: legacy in East.
      westTrain(SUNDAY, { attendees: [boardAttendee(null, 'here'), boardAttendee(null, 'done')] }),
      westTrain(SUNDAY, { serverId: '412345678901234568' }),
      westTrain(SUNDAY, { regionId: 2 }),
      { ...legacyTrain(SUNDAY, [7]), regionId: 2 },
      // 5: a raid. 6: legacy, no stop the map can place. 7: shown.
      boardRecord({ serverId: FAKE_GUILD_ID }),
      legacyTrain(SUNDAY + MINUTE, [null]),
      westTrain(SUNDAY),
    ]);
    web = made.web;
    made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    const refused = await made.train(999);
    expect(refused.statusCode).toBe(404);
    for (const id of [1, 2, 3, 4, 5, 6, 'abc', '07', '1e3', '-7', '9'.repeat(30)]) {
      const answer = await made.train(id);
      expect(answer.statusCode, String(id)).toBe(404);
      expect(answer.body, String(id)).toBe(refused.body);
    }
    expect((await made.train(7)).statusCode).toBe(200);
    expect((await made.train(3, BOB)).statusCode).toBe(200);
  });

  it('is for members: 401 without a session, 403 for others, 503 while Discord cannot say', async () => {
    const made = await setup([westTrain(SUNDAY)]);
    web = made.web;
    for (const url of [`${LIST}?month=2026-06`, `${LIST}/1`]) {
      expect((await made.web.app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
      expect((await made.ask(url, '200000000000000099')).statusCode, url).toBe(403);
    }
    made.members.failing = new Error('Discord is away');
    expect((await made.month('2026-06')).statusCode).toBe(503);
    expect((await made.train(1)).statusCode).toBe(503);
  });

  it('refuses a month it does not know', async () => {
    const made = await setup([]);
    web = made.web;
    for (const query of ['2026-13', '2026-6', 'june', '2026-06&year=2026']) {
      expect((await made.month(query)).statusCode, query).toBe(400);
    }
    expect((await made.ask(LIST)).statusCode).toBe(400);
  });

  it('answers one address only so often, the list and the routes together', async () => {
    const made = await setup([westTrain(SUNDAY)]);
    web = made.web;
    const cookie = await made.web.loggedIn(ALICE, 'Alice');
    let status = 0;
    for (let n = 0; n <= TRAINS_PER_MINUTE; n++) {
      const url = n % 2 === 0 ? `${LIST}?month=2026-06` : `${LIST}/1`;
      status = (await made.web.app.inject({ method: 'GET', url, headers: { cookie } })).statusCode;
    }
    expect(status).toBe(429);
  });
});
