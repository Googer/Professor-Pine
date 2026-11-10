import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { at, ALICE, BOB, PARTY_NOW, stops, testTrain } from '../../test/support/parties.js';
import { gymsFixture } from '../../test/support/providers.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import {
  partyWebWith,
  TEST_OWNER_ID,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
import { RAID_LOOK_READS } from '../services/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PartiesView } from '../domain/web/party-data.js';
import type { Settings } from '../config/settings.js';
import type { RaidBossProvider } from '../services/raid-boss-service.js';
import { EggPictures } from '../services/egg-pictures.js';
import { raidLook } from '../render/raid-post.js';

const LIST = `/s/${FAKE_GUILD_ID}/api/parties`;
/** The bot's owner is staff in every server, as the commands' guards have it. */
const STAFF = TEST_OWNER_ID;
const BARRED = '200000000000000084';
const NEWCOMER = '200000000000000085';
const TRAIN = '00000000-0000-4000-8000-0000000000aa';
const EVERYONE = [ALICE, BOB, STAFF, BARRED, NEWCOMER];

/**
 * One server's raid of two groups and a train, and two web servers over them: `web` as the bot has
 * it, and `fresh`, whose store hands out a new object of each party at every read and whose look is
 * built each time, so that nothing of it can come from a cache: what an uncached build answers.
 */
async function bothAnswers() {
  // What the look reads besides the party, for a test to change: a gym's row, the boss list, whether
  // the web server listens.
  const realGyms = gymsFixture();
  const renamed = new Map<number, string>();
  const gyms: typeof realGyms = Object.create(realGyms) as typeof realGyms;
  const kept = new Map<number, ReturnType<typeof realGyms.get>>();
  gyms.get = (id) => {
    const gym = realGyms.get(id);
    const name = renamed.get(id);
    if (!gym || name === undefined) return gym;
    if (!kept.has(id)) kept.set(id, { ...gym, name, nickname: name });
    return kept.get(id);
  };
  let bossesNow: RaidBossProvider = raidBossesFixture();
  const raidBosses: RaidBossProvider = {
    bosses: () => bossesNow.bosses(),
    bossesOf: (tier) => bossesNow.bossesOf(tier),
    autoset: (tier) => bossesNow.autoset(tier),
  };
  const eggPictures = new EggPictures({
    web: { publicUrl: 'https://map.example.test' },
  } as unknown as Pick<Settings, 'web'>);
  const gameData: { catalogue: PokemonCatalogue; icons?: PokemonIcons } = {
    catalogue: catalogueFixture(),
  };
  const made = await reportedRaid(
    { time: { hatch: at('2026-10-13T14:30') } },
    { gyms, raidBosses, eggPictures, gameData },
  );
  await made.attendance.newGroup(made.party.id, { id: BOB, name: 'Bob' });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
    group: 'A',
  });
  const plain = testTrain({ id: TRAIN });
  const routed = { ...plain, train: { ...plain.train, route: stops(1, 2, 3) } };
  await made.store.add({
    ...routed,
    forumChannelId: WEST_FORUM,
    forumPostId: '300000000000000077',
  });
  await made.service.flush();
  made.gateway.barred.set(WEST_FORUM, new Set([BARRED]));
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(STAFF, 'Staff')
    .add(BARRED, 'Barred')
    .add(NEWCOMER, 'Newcomer')
    .standing(STAFF, { roleNames: [], administrator: true });
  const web = webServerWith({ members, parties: partyWebWith(made) });
  const fresh = webServerWith({
    members,
    parties: {
      ...partyWebWith(made),
      store: {
        active: () => made.store.active().map((party): Party => ({ ...party })),
        get: (id) => made.store.get(id),
        raidAt: (guildId, gymId, now) => made.store.raidAt(guildId, gymId, now),
      },
      look: (raid) => raidLook(made.service.view(raid)),
    },
  });
  web.clock.now = PARTY_NOW;
  fresh.clock.now = PARTY_NOW;
  const toTime = (when: number): void => {
    made.clock.now = when;
    web.clock.now = when;
    fresh.clock.now = when;
  };
  const cookies = new Map<string, { web: string; fresh: string }>();
  for (const id of EVERYONE) {
    cookies.set(id, { web: await web.loggedIn(id, id), fresh: await fresh.loggedIn(id, id) });
  }
  const answer = async (server: 'web' | 'fresh', member: string) => {
    const cookie = cookies.get(member)?.[server] ?? '';
    return (server === 'web' ? web : fresh).app.inject({ url: LIST, headers: { cookie } });
  };
  /** Every member's answer as cached and as freshly built: the same bytes, the same ETag. */
  const sameForEveryone = async (): Promise<void> => {
    // Twice: what the first ask left in the cache is the second's to answer from.
    for (const round of [1, 2]) {
      for (const member of EVERYONE) {
        const cached = await answer('web', member);
        const built = await answer('fresh', member);
        expect(cached.statusCode, `${member} in round ${String(round)}`).toBe(200);
        expect(cached.body, `${member} in round ${String(round)}`).toBe(built.body);
        expect(cached.headers.etag).toBe(built.headers.etag);
      }
    }
  };
  return {
    made,
    web,
    fresh,
    toTime,
    answer,
    sameForEveryone,
    eggPictures,
    gameData,
    rename: (id: number, name: string): void => {
      renamed.set(id, name);
    },
    noBosses: (): void => {
      bossesNow = { bosses: () => [], bossesOf: () => [], autoset: () => undefined };
    },
  };
}

describe('what a raid’s look reads besides the party', () => {
  /** Records the properties read of an object: a method runs on the object itself. */
  function recording<T extends object>(name: string, target: T, reads: Set<string>): T {
    return new Proxy(target, {
      get(on, property) {
        const value: unknown = Reflect.get(on, property, on);
        if (typeof property === 'string') reads.add(`${name}.${property}`);
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(on)
          : value;
      },
    });
  }

  it('is the named list, so that a new input fails here until somebody decides about it', async () => {
    const reads = new Set<string>();
    const plainly = await reportedRaid();
    const made = await reportedRaid(
      { time: { hatch: at('2026-10-13T14:30') } },
      {
        gameData: recording(
          'gameData',
          { catalogue: catalogueFixture(), icons: iconsFixture() },
          reads,
        ),
        settings: recording('settings', plainly.settings, reads),
        eggPictures: recording('eggPictures', new EggPictures({ web: undefined }), reads),
        gyms: recording('gyms', gymsFixture(), reads),
        raidBosses: recording('raidBosses', raidBossesFixture(), reads),
      },
    );
    reads.clear();
    // An egg, then with its boss hatched: the look's two ways through the boss list.
    raidLook(made.service.view(made.current()));
    made.clock.now = at('2026-10-13T14:31');
    const raid = made.current();
    raidLook(made.service.view({ ...raid, raid: { ...raid.raid, boss: { key: 'yveltal' } } }));
    const named = Object.entries(RAID_LOOK_READS).flatMap(([input, properties]) =>
      Object.keys(properties).map((property) => `${input}.${property}`),
    );
    expect(reads).toEqual(new Set(named));
  });
});

describe('the view of the parties, built once per party', () => {
  const webs: TestWeb[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(webs.splice(0).map((web) => web.app.close()));
  });
  const made = async () => {
    const both = await bothAnswers();
    webs.push(both.web, both.fresh);
    return both;
  };

  it('answers every member as a fresh build does: one kept out, staff, a newcomer, one signed up', async () => {
    const { sameForEveryone } = await made();
    await sameForEveryone();
  });

  it('tells apart who sees what: the cache does not make all answers alike', async () => {
    const { answer } = await made();
    const of = async (member: string) => (await answer('web', member)).json<PartiesView>();
    expect((await of(BARRED)).raids).toEqual([]);
    const [newcomer, signedUp, staff] = [await of(NEWCOMER), await of(ALICE), await of(STAFF)];
    expect(newcomer.raids[0]?.attendance.regroup).toMatchObject({ signedUp: false });
    expect(signedUp.raids[0]?.attendance.regroup).toMatchObject({ signedUp: true });
    expect(signedUp.raids[0]?.attendance.mine).toMatchObject({ group: 'A' });
    expect(newcomer.raids[0]?.attendance.mine).toBeNull();
    expect(staff.raids[0]?.close).toBeDefined();
    expect(newcomer.raids[0]?.close).toBeUndefined();
  });

  it('gives a member who signs up their own Group…, whoever asked before them', async () => {
    const { made: raid, answer, sameForEveryone } = await made();
    // A newcomer's answer in the cache first: the member signed up must not get it.
    await answer('web', NEWCOMER);
    await sameForEveryone();
    await raid.attendance.signUp(raid.party.id, { id: NEWCOMER, name: 'N' }, PartyStatus.Coming, {
      group: 'B',
    });
    await sameForEveryone();
    const them = (await answer('web', NEWCOMER)).json<PartiesView>();
    expect(them.raids[0]?.attendance.regroup).toMatchObject({ signedUp: true });
  });

  it('follows the clock with no change of the party: an egg hatching, then ended', async () => {
    const { toTime, answer, sameForEveryone } = await made();
    await sameForEveryone();
    const egg = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0];
    expect(egg?.stage).toBe('egg');
    toTime(at('2026-10-13T14:31'));
    await sameForEveryone();
    const hatched = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0];
    expect(hatched?.stage).toBe('hatched');
    expect(hatched?.heading).not.toContain('(egg)');
    toTime(at('2026-10-14T14:31'));
    await sameForEveryone();
    expect((await answer('web', NEWCOMER)).json<PartiesView>().raids).toEqual([]);
  });

  it('follows a train to its next stop', async () => {
    const { made: raid, answer, sameForEveryone } = await made();
    await sameForEveryone();
    await raid.store.update(TRAIN, (party) => ({
      party: { ...party, train: { ...(party as ReturnType<typeof testTrain>).train, stop: 1 } },
    }));
    await sameForEveryone();
    expect((await answer('web', NEWCOMER)).json<PartiesView>().trains[0]?.stop).toBe(1);
  });

  it('follows what is not the party: a gym’s row', async () => {
    const { made: raid, answer, sameForEveryone, rename } = await made();
    await sameForEveryone();
    rename(raid.party.gymId ?? 0, 'Renamed');
    await sameForEveryone();
    const place = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0]?.place;
    expect(place?.name).toBe('Renamed');
  });

  it('follows what is not the party: the boss list', async () => {
    const { answer, sameForEveryone, noBosses } = await made();
    await sameForEveryone();
    const before = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0]?.boss;
    noBosses();
    await sameForEveryone();
    const after = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0]?.boss;
    expect(before).not.toBeNull();
    expect(after).toBeNull();
  });

  it('follows what is not the party: the egg’s picture once the web server listens', async () => {
    const { sameForEveryone, eggPictures, answer } = await made();
    await sameForEveryone();
    const before = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0]?.picture;
    eggPictures.serving();
    await sameForEveryone();
    const after = (await answer('web', NEWCOMER)).json<PartiesView>().raids[0]?.picture;
    expect(after).not.toBe(before);
  });

  it('follows what is not the party: the list of icons, which is read apart from the game data', async () => {
    const { made: raid, gameData, toTime } = await made();
    // A boss no feed lists has only an icon for its picture.
    await raid.store.update(raid.party.id, (party) =>
      isRaid(party)
        ? { party: { ...party, raid: { ...party.raid, boss: { key: 'bulbasaur' } } } }
        : {},
    );
    toTime(at('2026-10-13T14:31'));
    const current = (): RaidParty => raid.current();
    expect(raid.service.raidLookOf(current()).picture).toBeUndefined();
    gameData.icons = iconsFixture();
    const look = raid.service.raidLookOf(current());
    expect(look.picture).toBeDefined();
    expect(look).toEqual(raidLook(raid.service.view(current())));
  });

  it('builds a party’s look once, and only the changed party’s again', async () => {
    const { made: raid, answer } = await made();
    const view = vi.spyOn(raid.service, 'view');
    await answer('web', NEWCOMER);
    expect(view).toHaveBeenCalledTimes(1);
    view.mockClear();
    for (const member of EVERYONE) await answer('web', member);
    expect(view).not.toHaveBeenCalled();
    await raid.attendance.signUp(raid.party.id, { id: STAFF, name: 'Staff' }, PartyStatus.Coming, {
      group: 'B',
    });
    await answer('web', NEWCOMER);
    expect(view).toHaveBeenCalledTimes(1);
  });

  it('builds a newcomer’s Group… once per party, and a member’s own each time', async () => {
    const { made: raid, answer } = await made();
    // Group… asks the limits once per party it builds; a train's refusal asks at every ask.
    const limits = vi.spyOn(raid.attendance, 'limits');
    const asks = async (member: string): Promise<number> => {
      limits.mockClear();
      await answer('web', member);
      return limits.mock.calls.length;
    };
    const first = await asks(NEWCOMER);
    const again = await asks(NEWCOMER);
    expect(again).toBeLessThan(first);
    // Another who is not signed up has what the first left; one signed up builds their own.
    expect(await asks(BARRED)).toBeLessThanOrEqual(again);
    expect(await asks(ALICE)).toBeGreaterThan(again);
  });

  it('keeps nothing for a party that was replaced: a WeakMap by its object', async () => {
    const { made: raid, answer, sameForEveryone } = await made();
    await answer('web', NEWCOMER);
    await raid.store.update(raid.party.id, (party) => ({ party: { ...party, updatedAt: 1 } }));
    await sameForEveryone();
  });
});
