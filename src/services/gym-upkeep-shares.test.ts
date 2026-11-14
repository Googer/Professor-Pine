import { describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import { OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchEachTest } from '../../test/support/timers.js';
import type { GoogleBudget } from '../domain/geo/google-line.js';
import { GoogleShares, MemoryGoogleShareRaises } from './google-shares.js';
import { MemoryGoogleUse } from './google-use.js';
import { MemoryGymLookups, type QueuedGym } from './gym-lookups.js';
import { GymUpkeep } from './gym-upkeep.js';

const background = watchEachTest();

const HOME = TEST_GUILD_ROW;
const AWAY = OTHER_GUILD_ROW;
const THIRD = 3;
/** Noon in California on October 16: the month resets on November 1. */
const OCTOBER = new Date('2026-10-16T12:00:00-07:00').getTime();
const NOVEMBER = new Date('2026-11-01T00:10:00-07:00').getTime();
const NOVEMBER_FIRST = new Date('2026-11-01T00:00:00-07:00').getTime();
/** Ten places searches above the reserve a month. */
const BUDGET: GoogleBudget = { places: 12, reserve: 2, geocodes: 100, geocodesReserve: 0 };

/**
 * The line in memory; `slow`: its writes land a turn of the event loop after they were asked.
 * `hold()` holds the next write until the function it gives is called (a write that lands after a
 * later one); `failNeeds` makes the readings of the need fail.
 */
class LineLookups extends MemoryGymLookups {
  /** The next write of a server's rows waits for its promise. */
  private readonly holds = new Map<number, Promise<void>>();
  failNeeds = false;

  constructor(private readonly slow: boolean) {
    super();
  }

  /** Holds the next write of a server's rows until the function given is called. */
  hold(guildId: number): () => void {
    let release = () => undefined as void;
    this.holds.set(
      guildId,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return release;
  }

  override add(gyms: readonly QueuedGym[], now: number): Promise<void> {
    const server = gyms.find((gym) => this.holds.has(gym.guildId))?.guildId;
    const held = server === undefined ? undefined : this.holds.get(server);
    if (server !== undefined) this.holds.delete(server);
    if (!this.slow && held === undefined) return super.add(gyms, now);
    return new Promise((resolve) => {
      void (held ?? Promise.resolve()).then(() => {
        setImmediate(() => {
          void super.add(gyms, now).then(resolve);
        });
      });
    });
  }

  override needs() {
    return this.failNeeds ? Promise.reject(new Error('the database is away')) : super.needs();
  }
}

/**
 * The line over no gyms of the fixtures, with Google's month shared between the servers
 * (plan 19B-5): `gymsOf(server, n)` makes a server's gyms, each waiting for its places.
 */
async function sharedLine(
  options: {
    budget?: GoogleBudget;
    byHandPerServer?: number;
    byHandPerMonth?: number;
    /** The servers Pine is in (`Guild` rows), each with its floor of lookups by hand. */
    servers?: readonly number[];
    max?: number;
    /** The line's writes land in a later turn of the event loop, as a database's may. */
    slowWrites?: boolean;
  } = {},
) {
  const budget = options.budget ?? BUDGET;
  const { gyms, directory, answers } = await gymDirectoryWith(new MemoryGyms([]));
  const { log, entries } = createTestLogger();
  const geo = new FakeGeoGateway();
  const lookups = new LineLookups(options.slowWrites === true);
  const use = new MemoryGoogleUse();
  const clock = { now: OCTOBER };
  /** What each server's staff were told, and the owner. */
  const told: { guildId: number; key: string; text: string }[] = [];
  const owner: string[] = [];
  const shares = new GoogleShares({
    budget,
    ...(options.max === undefined ? {} : { max: options.max }),
    use,
    raises: new MemoryGoogleShareRaises(),
    tellServer: (guildId, key, text) => told.push({ guildId, key, text }),
    tellOwner: (text) => owner.push(text),
    log,
    now: () => clock.now,
  });
  const timers: (() => void)[] = [];
  const upkeep = new GymUpkeep({
    gyms,
    directory,
    geo,
    parties: { active: () => [] },
    posts: { changed: () => undefined },
    log,
    setTimer: (run) => {
      timers.push(run);
      return () => {
        const index = timers.indexOf(run);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    lookups,
    use,
    budget,
    byHandPerMonth: options.byHandPerMonth ?? 100,
    ...(options.byHandPerServer === undefined ? {} : { byHandPerServer: options.byHandPerServer }),
    ...(options.servers === undefined ? {} : { servers: () => options.servers ?? [] }),
    shares,
    answers,
    now: () => clock.now,
  });
  let next = 0;
  /** A server's gym, far from the others, not in the line; its id. */
  const gymOf = async (guildId: number) => {
    next += 1;
    const gym = await gyms.create(
      { name: `Gym ${String(next)}`, lat: 41 + next / 100, lon: -79 },
      guildId,
    );
    await directory.refreshGym(gym.id);
    return gym.id;
  };
  /** A server's gyms, far apart, each waiting for its places alone; their ids. */
  const gymsOf = async (guildId: number, n: number, queuedAt: number) => {
    const ids: number[] = [];
    for (let made = 0; made < n; made++) ids.push(await gymOf(guildId));
    await lookups.add(
      ids.map((gymId) => ({ guildId, gymId, address: false, rank: 0 })),
      queuedAt,
    );
    return ids;
  };
  /** How many places questions were asked about a server's gyms. */
  const askedOf = (ids: readonly number[]) =>
    geo
      .questions('places')
      .filter((question) => ids.some((id) => directory.stored(id)?.lat === question.point.lat))
      .length;
  const waiting = async (guildId: number) =>
    (await lookups.list()).filter((row) => row.guildId === guildId).length;
  /** Starts the next turn of the line's timer. */
  const fire = () => {
    timers.shift()?.();
  };
  /** Runs one turn of the line's timer, and what it started. */
  const turn = async () => {
    fire();
    await background.settle();
  };
  return {
    upkeep,
    gyms,
    directory,
    geo,
    lookups,
    use,
    shares,
    clock,
    told,
    owner,
    entries,
    gymsOf,
    gymOf,
    askedOf,
    waiting,
    fire,
    turn,
  };
}

describe('Google’s month shared between servers by need (plan 19B-5)', () => {
  it('serves each server up to its share and leaves none of the month unused: one server’s burst does not hold the other’s gym back, and waits for the 1st', async () => {
    const made = await sharedLine();
    // Home's import came first: fifteen gyms ahead of Away's one in the line.
    const home = await made.gymsOf(HOME, 15, 1_000);
    const away = await made.gymsOf(AWAY, 1, 2_000);
    await made.upkeep.flush();
    // Ten a month above the reserve: Away its one gym, and Home the nine Away leaves, more than
    // half the month (fix round 3, T2: the half binds only so far as the others use the rest).
    expect(made.askedOf(home)).toBe(9);
    expect(made.askedOf(away)).toBe(1);
    expect(await made.waiting(HOME)).toBe(6);
    expect(await made.waiting(AWAY)).toBe(0);
    // What the line asked, counted against the server whose row was served.
    expect(made.use.servers.get(`${String(HOME)}:2026-10-16`)?.places).toBe(9);
    expect(made.use.servers.get(`${String(AWAY)}:2026-10-16`)?.places).toBe(1);
    // Home's staff are told once; the month above the reserve is used, and the owner told.
    expect(made.told).toEqual([
      expect.objectContaining({ guildId: HOME, key: 'google-share:places:2026-10-01' }),
    ]);
    expect(made.told[0]?.text).toBe(
      'This server has used its share of this month’s places searches (9) at Google, which ' +
        'Pine shares between the servers it is in by what each has waiting. Its gyms, ' +
        'PokéStops and Power Spots that still wait for Google stay in line and are asked about ' +
        `again when the month starts again, <t:${String(NOVEMBER_FIRST / 1000)}:f>, or sooner ` +
        'should the shares give it more. `/gym google` shows the line and the share; an ' +
        'operator of this Pine can raise it.',
    );
    expect(made.owner).toHaveLength(1);
    expect(made.shares.of(HOME)).toMatchObject({ share: { places: 9 }, used: { places: 9 } });
    // Nothing more this month, however often the line looks.
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(9);
    expect(made.told).toHaveLength(1);
    // The 1st: Home's rows are asked about again.
    made.clock.now = NOVEMBER;
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(15);
    expect(await made.waiting(HOME)).toBe(0);
  });

  it('tells no server’s staff of a share used when nothing of it waits any more', async () => {
    const made = await sharedLine();
    // Nine and one: the whole month, each server's share exactly what it had waiting.
    const home = await made.gymsOf(HOME, 9, 1_000);
    await made.gymsOf(AWAY, 1, 2_000);
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(9);
    expect(made.told).toEqual([]);
  });

  it('gives a server whose gyms come after the shares were worked out its share at once, and holds the first server to its part', async () => {
    const made = await sharedLine();
    const home = await made.gymsOf(HOME, 20, 1_000);
    await made.upkeep.resume();
    // The first turn works the shares out: Home is alone, and may have the whole month.
    await made.turn();
    expect(made.askedOf(home)).toBe(1);
    const away = await made.gymsOf(AWAY, 1, 2_000);
    await made.upkeep.placed(away[0] ?? 0, { places: 'later' });
    await made.upkeep.flush();
    // Away came: Home is held to what Away leaves of the month, Away's gym is asked about.
    expect(made.askedOf(home)).toBe(9);
    expect(made.askedOf(away)).toBe(1);
    expect(await made.waiting(HOME)).toBe(11);
  });

  it('works out the share of a server new in the line once its row is written, however late the write lands', async () => {
    // The database writes the line in a later turn than it was asked: the shares must not be
    // read before Away's row is there.
    const made = await sharedLine({ slowWrites: true });
    const home = await made.gymsOf(HOME, 20, 1_000);
    await made.upkeep.resume();
    await made.turn();
    const id = await made.gymOf(AWAY);
    const away = [id];
    await made.upkeep.placed(id, { places: 'later' });
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(9);
    expect(made.askedOf(away)).toBe(1);
  });

  it('works the shares out after each writer’s own write: one that lands after another writer’s reading still counts (fix round 3, T1)', async () => {
    const made = await sharedLine();
    const home = await made.gymsOf(HOME, 20, 1_000);
    await made.upkeep.resume();
    // Home is alone in the line: it may have the whole month.
    await made.turn();
    // Away's first gym and another of Home's: Away's write lands after Home's, and after the
    // reading Home's write may start.
    const awayGym = await made.gymOf(AWAY);
    const homeGym = await made.gymOf(HOME);
    const release = made.lookups.hold(AWAY);
    const awayPlaced = made.upkeep.placed(awayGym, { places: 'later' });
    await made.upkeep.placed(homeGym, { places: 'later' });
    await background.settle();
    release();
    await awayPlaced;
    await made.upkeep.flush();
    // Away's gym is asked about this month, though it waited behind Home's.
    expect(made.askedOf([awayGym])).toBe(1);
    expect(made.askedOf([...home, homeGym])).toBe(9);
  });

  it('works the shares out before it serves a row of a server they do not know, however the row came into the line (fix round 3, T1)', async () => {
    const made = await sharedLine();
    const home = await made.gymsOf(HOME, 20, 1_000);
    await made.upkeep.resume();
    await made.turn();
    // Away's six come into the line by no writer of the upkeep's, first in it.
    const away = await made.gymsOf(AWAY, 6, 500);
    await made.upkeep.flush();
    // Each wants more than half the month: each has its half.
    expect(made.askedOf(away)).toBe(5);
    expect(made.askedOf(home)).toBe(5);
  });

  it('reads a server’s share for /gym google in the line’s turn, never half-way through a question (fix round 3, T5)', async () => {
    const made = await sharedLine();
    await made.gymsOf(HOME, 3, 1_000);
    await made.upkeep.resume();
    let release = () => undefined as void;
    made.geo.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The line's turn asks about Home's first gym; Google has not answered yet.
    made.fire();
    const shown = made.upkeep.snapshot(HOME);
    release();
    expect((await shown).server?.share?.used.places).toBe(1);
  });

  it('answers a raise whose shares cannot be worked out now as written, and works them out at the line’s next turn (fix round 3, T10)', async () => {
    const made = await sharedLine({ max: 5 });
    const home = await made.gymsOf(HOME, 9, 1_000);
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(5);
    made.lookups.failNeeds = true;
    await expect(made.upkeep.raiseShare(HOME, 2)).resolves.toBe('later');
    made.lookups.failNeeds = false;
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(7);
  });

  it('tells the owner once a month when the line used the month for every server', async () => {
    const made = await sharedLine({
      budget: { places: 6, reserve: 2, geocodes: 100, geocodesReserve: 0 },
    });
    await made.gymsOf(HOME, 9, 1_000);
    await made.gymsOf(AWAY, 9, 1_000);
    await made.upkeep.flush();
    await made.upkeep.flush();
    expect(made.use.total('places')).toBe(4);
    expect(made.owner).toHaveLength(1);
    expect(made.owner[0]).toContain('Google’s budget for this month is used');
    // Each server's staff were told of their own share.
    expect(made.told.map((one) => one.guildId).toSorted()).toEqual([HOME, AWAY].toSorted());
  });

  it('keeps every other server its floor of lookups by hand when one server’s staff use all they may (fix round 3, T3)', async () => {
    // Ten a month for the instance, a floor of three for each of three servers.
    const made = await sharedLine({
      byHandPerMonth: 10,
      byHandPerServer: 3,
      servers: [HOME, AWAY, THIRD],
    });
    const [home = 0] = await made.gymsOf(HOME, 1, 1_000);
    const [away = 0] = await made.gymsOf(AWAY, 1, 1_000);
    const [third = 0] = await made.gymsOf(THIRD, 1, 1_000);
    /** How many of `n` lookups by hand of a server's gym reached Google. */
    const asked = async (gymId: number, guildId: number, n: number) => {
      let reached = 0;
      for (let made_ = 0; made_ < n; made_++) {
        const refreshed = await made.upkeep.refresh(gymId, guildId);
        if (refreshed?.places !== 'capped') reached++;
      }
      return reached;
    };
    // Home takes what the others' floors leave: four.
    expect(await asked(home, HOME, 6)).toBe(4);
    expect(await asked(away, AWAY, 4)).toBe(3);
    expect(await asked(third, THIRD, 4)).toBe(3);
    expect(made.use.servers.get(`${String(HOME)}:2026-10-16`)?.byHand).toBe(4);
    expect(made.use.servers.get(`${String(AWAY)}:2026-10-16`)?.byHand).toBe(3);
    // A lookup by hand's own questions are the instance's alone: no server's line share.
    expect(made.use.servers.get(`${String(HOME)}:2026-10-16`)?.places ?? 0).toBe(0);
  });

  it('gives a Pine of one server every lookup by hand of the month', async () => {
    const made = await sharedLine({ byHandPerMonth: 10, servers: [HOME] });
    const [home = 0] = await made.gymsOf(HOME, 1, 1_000);
    for (let n = 0; n < 10; n++) {
      expect((await made.upkeep.refresh(home, HOME))?.places).not.toBe('capped');
    }
    expect((await made.upkeep.refresh(home, HOME))?.places).toBe('capped');
  });

  it('serves a server whose share an operator raised past the most of one server', async () => {
    const made = await sharedLine({ max: 5 });
    const home = await made.gymsOf(HOME, 9, 1_000);
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(5);
    // Raised by two: Home's rows are ranked back into the line and two more asked.
    await expect(made.upkeep.raiseShare(HOME, 2)).resolves.toMatchObject({
      share: { places: 7 },
      raise: 2,
    });
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(7);
    expect(made.shares.of(HOME)).toMatchObject({ share: { places: 7 }, used: { places: 7 } });
    expect(await made.waiting(HOME)).toBe(2);
  });

  it('ranks again a row written held while a raise lifted its server meanwhile (fix round 4, R3)', async () => {
    // Twenty a month above the reserve, at most five of one server.
    const made = await sharedLine({
      budget: { places: 22, reserve: 2, geocodes: 100, geocodesReserve: 0 },
      max: 5,
    });
    const home = await made.gymsOf(HOME, 9, 1_000);
    await made.upkeep.flush();
    // Home used its five: its four left are held.
    expect(made.askedOf(home)).toBe(5);
    // Another of Home's gyms is put in the line while Home is held; its write lands only after
    // a raise was read and Home's rows ranked by it.
    const late = await made.gymOf(HOME);
    const release = made.lookups.hold(HOME);
    const placing = made.upkeep.placed(late, { places: 'later', address: false });
    await background.settle();
    await made.upkeep.raiseShare(HOME, 10);
    release();
    await placing;
    await made.upkeep.flush();
    // The late gym is asked about with the others (its gym moved the circles of Home's: they
    // wait again): its row was ranked anew after its write.
    expect(made.askedOf([late])).toBe(1);
    expect(await made.waiting(HOME)).toBe(0);
  });

  it('works the shares out anew each day: a server held to half is given what the other no longer needs', async () => {
    // Twenty a month above the reserve.
    const made = await sharedLine({
      budget: { places: 22, reserve: 2, geocodes: 100, geocodesReserve: 0 },
    });
    const home = await made.gymsOf(HOME, 30, 1_000);
    const away = await made.gymsOf(AWAY, 12, 2_000);
    await made.upkeep.resume();
    await made.turn();
    // Away's gyms leave the line before they are asked about (deleted, say).
    for (const id of away) await made.lookups.remove(id);
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(10);
    // The next day nothing of Away waits: Home may have what is left of the month.
    made.clock.now += 24 * 3_600_000;
    await made.upkeep.flush();
    expect(made.askedOf(home)).toBe(20);
  });
});
