import { asTestServerGyms } from '../../test/support/providers.js';
import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, TEST_GUILD_ROW, testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER, stops, gym, inGyms } from '../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { MAX_SAVED_ROUTES } from '../db/repositories/saved-route-repository.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import { TrainService } from './train-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const WEST = 1;

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** A train on a route, with Alice coming beside the member who made it. */
async function boarded(route: readonly number[] = [4, 1, 7]): Promise<Made> {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const lines = async (made: Made): Promise<string[]> => {
  await made.attendance.flush();
  return made.said().join('\n').split('\n').filter(Boolean);
};

describe('TrainService.saveRoute', () => {
  it('saves the route of the train for the member and the region of the train', async () => {
    const made = await boarded();
    const before = made.current();
    const saved = await made.trains.saveRoute(made.party.id, alice, '  Downtown   loop ');
    expect(saved).toEqual({
      kind: 'saved',
      route: {
        id: expect.any(Number) as number,
        name: 'Downtown loop',
        stops: stops(4, 1, 7),
        atEnd: 'finish',
      },
    });
    expect(made.routes.rows).toMatchObject([
      { memberId: ALICE, regionId: WEST, name: 'Downtown loop', stops: stops(4, 1, 7) },
    ]);
    // It changes nothing about the train, and nothing is said.
    expect(made.current()).toBe(before);
    expect(await lines(made)).toEqual([]);
  });

  it('saves the whole route, wherever the train is on it, for anybody in the post', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    expect(await made.trains.saveRoute(made.party.id, carol, 'Loop')).toMatchObject({
      kind: 'saved',
      route: { stops: stops(4, 1, 7) },
    });
    expect(made.routes.rows[0]?.memberId).toBe(CAROL);
  });

  it('replaces the member’s route of the same name, and nobody else’s', async () => {
    const made = await boarded();
    const first = await made.trains.saveRoute(made.party.id, alice, 'Loop');
    await made.trains.saveRoute(made.party.id, bob, 'Loop');
    await made.trains.addStop(made.party.id, alice, gym(2));
    const again = await made.trains.saveRoute(made.party.id, alice, 'loop');
    expect(again).toMatchObject({
      kind: 'replaced',
      route: { name: 'loop', stops: stops(4, 1, 7, 2) },
    });
    expect(again.kind === 'replaced' && first.kind === 'saved' && again.route.id).toBe(
      first.kind === 'saved' && first.route.id,
    );
    expect(made.routes.rows.map((row) => [row.memberId, row.stops.length])).toEqual([
      [ALICE, 4],
      [BOB, 3],
    ]);
  });

  it('refuses a train without a route, and a text that is no name', async () => {
    const made = await createdTrain();
    expect(await made.trains.saveRoute(made.party.id, alice, 'Loop')).toEqual({
      kind: 'refused',
      reason: 'empty-route',
    });
    const routed = await boarded();
    for (const name of ['   ', 'x'.repeat(81)]) {
      expect(await routed.trains.saveRoute(routed.party.id, alice, name)).toEqual({
        kind: 'refused',
        reason: 'bad-name',
      });
    }
    expect(routed.routes.rows).toEqual([]);
  });

  it('refuses the twenty-sixth route of a member in a region', async () => {
    const made = await boarded();
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) made.routes.add(ALICE, WEST, `Route ${n}`, [1]);
    expect(await made.trains.saveRoute(made.party.id, alice, 'One more')).toEqual({ kind: 'full' });
    expect(await made.trains.saveRoute(made.party.id, alice, 'Route 7')).toMatchObject({
      kind: 'replaced',
    });
    expect(await made.trains.saveRoute(made.party.id, bob, 'One more')).toMatchObject({
      kind: 'saved',
    });
  });

  it('finds no train in a meetup, or where there is no party', async () => {
    const made = await createdMeetup();
    expect(await made.trains.saveRoute(made.party.id, alice, 'Loop')).toEqual({ kind: 'gone' });
    expect(await made.trains.saveRoute('no-such-party', alice, 'Loop')).toEqual({ kind: 'gone' });
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([]);
  });
});

describe('TrainService.loadRoute', () => {
  it('replaces the route by the saved one and starts at its first stop', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    const saved = made.routes.add(ALICE, WEST, 'River *walk*', [2, 3, 11]);
    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, route: saved, missing: 0 });
    expect(made.current().train).toMatchObject({ route: stops(2, 3, 11), stop: 0 });
    expect((await lines(made)).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded the route **River \\*walk\\***: 3 stops. The train is at the first.`,
    );
  });

  it('leaves out gyms that no longer exist, and says how many', async () => {
    const made = await boarded();
    const saved = made.routes.add(ALICE, WEST, 'Old round', [2, 998, 3, 999]);
    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(inGyms(outcome)).toMatchObject(inGyms({ kind: 'ok', missing: 2 }));
    expect(inGyms(made.current().train.route)).toEqual(inGyms([2, 3]));
    const gone = made.routes.add(ALICE, WEST, 'All gone', [998, 999]);
    expect(await made.trains.loadRoute(made.party.id, alice, gone.id)).toEqual({
      kind: 'refused',
      reason: 'empty-route',
    });
    expect(inGyms(made.current().train.route)).toEqual(inGyms([2, 3]));
  });

  it('decides inside the store which gyms exist: one deleted while the load waited is left out', async () => {
    // The gym list as the services see it; gym 6 goes at the moment the store takes the change,
    // as when its deletion finished while the load waited for the train's turn.
    const list = gymsFixture();
    let gone = false;
    const gyms = {
      get: (id: number) => (gone && id === 6 ? undefined : list.stored(id)),
      regionsOf: (id: number) => (gone && id === 6 ? [] : list.of(TEST_GUILD_ROW).regionsOf(id)),
    };
    const made = await createdTrain({ route: stops(4) }, { gyms: asTestServerGyms(gyms) });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    const saved = made.routes.add(ALICE, WEST, 'Round', [2, 6, 3]);
    const update = made.store.update.bind(made.store);
    const whileGoing: typeof made.store.update = (id, change) =>
      update(id, (party) => {
        gone = true;
        return change(party);
      });
    made.store.update = whileGoing;

    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);

    expect(inGyms(outcome)).toMatchObject(inGyms({ kind: 'ok', missing: 1 }));
    expect(inGyms(made.current().train.route)).toEqual(inGyms([2, 3]));
    expect((await lines(made)).at(-1)).toContain('2 stops');
  });

  it('is for a member who is signed up, and only with a route of their own for this region', async () => {
    const made = await boarded();
    const mine = made.routes.add(ALICE, WEST, 'Mine', [2]);
    const east = made.routes.add(ALICE, 2, 'Of East', [8]);
    const carols = made.routes.add(CAROL, WEST, 'Hers', [3]);
    expect(await made.trains.loadRoute(made.party.id, alice, east.id)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, alice, carols.id)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, alice, 12345)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, carol, carols.id)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1, 7]));
    expect(await made.trains.loadRoute(made.party.id, alice, mine.id)).toMatchObject({
      kind: 'ok',
    });
  });

  it('goes by the region the train was made in', async () => {
    const made = await createdTrain({ regionChannelId: EAST_CHANNEL });
    const west = made.routes.add(REPORTER, WEST, 'Of West', [2]);
    const east = made.routes.add(REPORTER, 2, 'Of East', [8, 9]);
    expect(await made.trains.savedRoutes(made.party.id, REPORTER)).toEqual([east]);
    expect(await made.trains.loadRoute(made.party.id, { id: REPORTER }, west.id)).toEqual({
      kind: 'none',
    });
    expect(await made.trains.loadRoute(made.party.id, { id: REPORTER }, east.id)).toMatchObject({
      kind: 'ok',
    });
  });

  it('reads what the legacy bot left: a gym twice counts once, a route without a name is named so', async () => {
    const made = await boarded();
    const odd = made.routes.add(ALICE, WEST, '', [2, 3, 2]);
    expect(inGyms(await made.trains.loadRoute(made.party.id, alice, odd.id))).toMatchObject(
      inGyms({ kind: 'ok' }),
    );
    expect(inGyms(made.current().train.route)).toEqual(inGyms([2, 3]));
    expect((await lines(made)).at(-1)).toContain('loaded a saved route without a name: 2 stops.');
  });
});

describe('TrainService: the saved routes of a member', () => {
  it('lists them by name for the region of the train, and forgets one', async () => {
    const made = await boarded();
    const river = made.routes.add(ALICE, WEST, 'River walk', [2, 3]);
    const downtown = made.routes.add(ALICE, WEST, 'downtown loop', [4]);
    made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([downtown, river]);
    expect(await made.trains.forgetRoute(made.party.id, BOB, river.id)).toBeUndefined();
    expect(await made.trains.forgetRoute(made.party.id, ALICE, river.id)).toEqual(river);
    expect(await made.trains.forgetRoute(made.party.id, ALICE, river.id)).toBeUndefined();
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([downtown]);
    expect(made.routes.rows).toHaveLength(2);
  });
});

describe('TrainService.loadRoute as a movement of the train', () => {
  /** The messages in the post that announce a movement: those carry mentions. */
  const announced = async (made: Made): Promise<string[]> => {
    await made.trains.flush();
    await made.attendance.flush();
    return made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.mention)
      .map((message) => (message.message.content ?? '').split('\n')[0] ?? '');
  };

  it('takes the right to move the train: with a conductor only they and staff may load', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    const saved = made.routes.add(BOB, WEST, 'Bob’s', [2, 3]);
    expect(await made.trains.loadRoute(made.party.id, bob, saved.id)).toEqual({
      kind: 'refused',
      reason: 'not-conductor',
    });
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1, 7]));
    expect(await made.trains.loadRoute(made.party.id, bob, saved.id, true)).toMatchObject({
      kind: 'ok',
      moved: true,
    });
    expect(made.current().train).toMatchObject({ route: stops(2, 3), stop: 0, conductorId: ALICE });
  });

  it('puts who is here back to coming and tells the others where the train is', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3]);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Coming);
    expect(await announced(made)).toEqual([
      'The train is moving to [Old Stone Fountain](<https://www.google.com/maps/search/?api=1&query=40.06%2C-80.06>). ' +
        `Moved by **Alice** (<@${ALICE}>).`,
    ]);
  });

  it('says where the train is when a route is loaded right after a move: no "back", no unknown gym', async () => {
    const made = await boarded();
    // The saved route has the gym the train started from further on.
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3, 4]);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    const said = await announced(made);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^The train is moving to \[Old Stone Fountain\]/);
  });

  it('says nothing of a route that begins where the train is', async () => {
    const made = await boarded();
    const saved = made.routes.add(ALICE, WEST, 'Same start', [4, 3]);
    expect(await made.trains.loadRoute(made.party.id, alice, saved.id)).toMatchObject({
      kind: 'ok',
      changed: true,
      moved: false,
    });
    expect(await announced(made)).toEqual([]);
  });
});

describe('TrainService.loadRoute into a train without a route', () => {
  it('is said in a line and announced to nobody, but takes the right to move the train', async () => {
    const made = await createdTrain();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.trains.setConductor(made.party.id, alice);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [2, 3]);
    const mine = made.routes.add(ALICE, WEST, 'Mine', [2, 3]);
    expect(await made.trains.loadRoute(made.party.id, bob, bobs.id)).toEqual({
      kind: 'refused',
      reason: 'not-conductor',
    });
    expect(await made.trains.loadRoute(made.party.id, alice, mine.id)).toMatchObject({
      kind: 'ok',
      changed: true,
      moved: false,
    });
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
    await made.trains.flush();
    expect((await lines(made)).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded the route **Mine**: 2 stops. The train is at the first.`,
    );
    expect(
      made.gateway.messagesIn(made.postId).filter((message) => message.message.mention),
    ).toEqual([]);
  });

  it('says "moving to", not "back", when a Previous is followed by a loaded route', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.flush();
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3, 1]);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    await made.trains.flush();
    const said = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.mention)
      .map((message) => (message.message.content ?? '').split('\n')[0]);
    expect(said.at(-1)).toMatch(/^The train is moving to \[Old Stone Fountain\]/);
  });

  it('says the line of a route without a name as a sentence', async () => {
    const made = await boarded();
    const odd = made.routes.add(ALICE, WEST, '', [2, 3]);
    await made.trains.loadRoute(made.party.id, alice, odd.id);
    expect((await lines(made)).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded a saved route without a name: 2 stops. The train is at the first.`,
    );
  });
});

describe('TrainService.saveRoute with a name that reads like a choice of the list', () => {
  it('refuses `id:` and digits, in any case', async () => {
    const made = await boarded();
    for (const name of ['id:7', 'ID:12', ' Id:0042 ']) {
      expect(await made.trains.saveRoute(made.party.id, alice, name)).toEqual({
        kind: 'refused',
        reason: 'name-like-choice',
      });
    }
    expect(made.routes.rows).toEqual([]);
    // What only looks a little like one is a name.
    for (const name of ['id:', 'id: 7', 'id:7a', 'grid:7']) {
      expect((await made.trains.saveRoute(made.party.id, alice, name)).kind).toBe('saved');
    }
  });
});

describe('TrainService.loadRoute with a route longer than a route may be', () => {
  it('cuts it to fifty stops and says how many did not fit', async () => {
    const made = await boarded();
    // Every gym exists for this service: the invented town has twelve.
    const trains = new TrainService({
      store: made.store,
      gateway: made.gateway,
      posts: made.service,
      splits: made.service,
      lines: made.lines,
      users: made.users,
      gyms: asTestServerGyms({
        get: (id) => ({ ...testGyms()[0], id, name: `Gym ${id}` }),
        regionsOf: () => [WEST_CHANNEL],
      }),
      regions: made.regions,
      routes: made.routes,
      log: made.log,
      now: () => made.clock.now,
      announceDelayMs: 3_600_000,
    });
    const long = Array.from({ length: 53 }, (_, index) => 100 + index);
    const saved = made.routes.add(ALICE, WEST, 'Marathon', long);
    const outcome = await trains.loadRoute(made.party.id, alice, saved.id);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, missing: 0, cut: 3 });
    expect(made.current().train.route).toHaveLength(50);
    expect((await lines(made)).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) loaded the route **Marathon**: 50 stops. The train is at the first. ` +
        '3 more stops did not fit: a route has at most 50.',
    );
    const short = made.routes.add(ALICE, WEST, 'Short', [101, 102]);
    expect(await trains.loadRoute(made.party.id, alice, short.id)).toMatchObject({ cut: 0 });
  });
});

describe('TrainService: gyms that are no stop for the train', () => {
  it('reaches the gyms of every region of the server of the train, and no other', async () => {
    const made = await boarded();
    const party = made.current();
    // West, East, a gym that lies in no region, and none at all.
    expect([1, 8, 10, 999].map((gymId) => made.trains.reaches(party, gym(gymId)))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    // The same gyms are none for a train of another server.
    expect(made.trains.reaches({ ...party, guildId: party.guildId + 1 }, gym(1))).toBe(false);
  });

  it('loadRoute leaves out saved gyms that lie in no region of the server, and counts them', async () => {
    const made = await boarded();
    const saved = made.routes.add(ALICE, WEST, 'Up the hill', [10, 2, 998, 8]);
    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(inGyms(outcome)).toMatchObject(
      inGyms({ kind: 'ok', changed: true, missing: 2, cut: 0 }),
    );
    expect(inGyms(made.current().train.route)).toEqual(inGyms([2, 8]));
    const only = made.routes.add(ALICE, WEST, 'The trailhead', [10]);
    expect(await made.trains.loadRoute(made.party.id, alice, only.id)).toEqual({
      kind: 'refused',
      reason: 'empty-route',
    });
  });

  it('loadRoute says `no-stops` of a route that was saved without any gym, to who may load one', async () => {
    const made = await boarded();
    const empty = made.routes.add(ALICE, WEST, 'Nothing yet', []);
    expect(await made.trains.loadRoute(made.party.id, alice, empty.id)).toEqual({
      kind: 'no-stops',
    });
    const hers = made.routes.add(CAROL, WEST, 'Hers', []);
    expect(await made.trains.loadRoute(made.party.id, carol, hers.id)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(inGyms(made.current().train.route)).toEqual(inGyms([4, 1, 7]));
  });
});
