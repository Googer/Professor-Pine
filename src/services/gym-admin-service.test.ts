import { gymStop } from '../domain/party/stops.js';
import { galleryOf, textDisplays, textOf, v2 } from '../../test/support/messages.js';
import { DiscordAPIError } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import {
  gymAdminWith,
  OTHER_STAFF,
  OTHER_STAFF_PLACE,
  STAFF,
  STAFF_PLACE,
  UPDATES_CHANNEL,
  withOtherServer,
} from '../../test/support/gym-admin.js';
import {
  EAST_CHANNEL,
  NORTH_PLACE,
  OTHER_GUILD_ROW,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { ALICE, asTrain, BOB, REPORTER, gym, inGyms, stops } from '../../test/support/parties.js';
import { Tally } from '../../test/support/tally.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { nearestTo } from '@pine/wayspot-core/distance';
import { PartyStatus } from '../domain/party/status.js';
import { currentStop } from '../domain/party/train.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Member } from './attendance-service.js';
import { REVIEW_SUMMARY_MS, type AddOutcome } from './gym-admin-service.js';
import type { RaidReport } from './party-service.js';
import {
  TEST_SERVER_CHANNELS,
  TestServers,
  testServerValues,
} from '../../test/support/server-values.js';

type Made = Awaited<ReturnType<typeof gymAdminWith>>;

const staff: Member = { id: STAFF, name: 'Morgan' };
const maker: Member = { id: REPORTER, name: 'Rae' };
/** A place in West, far from every invented gym. */
const FREE = { lat: 40.015, lon: -80.015 };

/** The gym an add stored: these tests add where no other gym is. */
function added(outcome: AddOutcome): Gym {
  if (outcome.kind !== 'added') throw new Error(`not added: ${outcome.kind}`);
  return outcome.gym;
}

/** Moves a gym from where it is, with no other gym named: what a move without a question asks. */
function moveNow(made: Made, id: number, point: LatLon) {
  const gym = made.directory.get(id);
  const from = gym ? { lat: gym.lat, lon: gym.lon } : point;
  return made.admin.move(id, point, STAFF_PLACE, { from, nearIds: [] });
}

function gymOf(made: Made, id: number): Gym {
  const gym = made.directory.get(id);
  if (!gym) throw new Error(`no gym ${id}`);
  return gym;
}

const report = (made: Made, gymId: number, more: Partial<RaidReport> = {}): RaidReport => ({
  gym: gymOf(made, gymId),
  reporterId: REPORTER,
  anonymous: false,
  autoStatus: PartyStatus.Interested,
  tier: { level: 'T5', shadow: false },
  boss: null,
  ...more,
});

/** A train of the member who made it, on a route of these gyms. */
async function trainOn(made: Made, route: readonly number[]) {
  const created = await made.service.createTrain({
    name: 'Saturday legendaries',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
  });
  if (created.kind !== 'created') throw new Error('no train');
  for (const gymId of route) await made.trains.addStop(created.party.id, maker, gymStop(gymId));
  await settle(made);
  const postId = created.party.forumPostId ?? '';
  for (const message of made.gateway.messagesIn(postId)) {
    await made.gateway.deleteMessage(postId, message.id);
  }
  return {
    id: created.party.id,
    postId,
    current: () => asTrain(made.store.get(created.party.id)),
    said: () => made.gateway.messagesIn(postId).map((message) => message.message.content ?? ''),
  };
}

/** Lets everything that is under way go out. */
async function settle(made: Made): Promise<void> {
  await made.upkeep.flush();
  await made.admin.flush();
  await made.trains.flush();
  await made.attendance.flush();
  await made.service.flush();
}

const announced = (made: Made) =>
  made.gateway.messagesIn(UPDATES_CHANNEL).map((message) => message.message);

/**
 * Holds the deletion of a gym's row (and nothing else: what reads the gyms goes on), so that a
 * test can do something while a deletion is inside the gym's lock; gives the release.
 */
function heldDelete(made: Made): () => void {
  let release: () => void = () => undefined;
  made.gymStore.holdOn.delete = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    made.gymStore.holdOn = {};
    release();
  };
}

/**
 * Holds the next write of one party (the change is decided, its row is on its way), so that a
 * test can do something meanwhile; gives the release.
 */
function heldSave(made: Made, partyId: string): () => void {
  const save = made.storage.save.bind(made.storage);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  made.storage.save = async (party) => {
    if (party.id === partyId && !held) {
      held = true;
      await gate;
    }
    return save(party);
  };
  return release;
}

const background = watchEachTest();

/** Waits until every timer-less step that is under way is done (`settle`). */
function turns(): Promise<void> {
  return background.settle();
}

describe('GymAdminService: reading a location', () => {
  it('reads coordinates and links without asking anybody', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.readLocation('40.4406, -79.9959')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    // Where a map was centred is only near the place.
    await expect(
      made.admin.readLocation('https://www.google.com/maps/@40.4406,-79.9959,17z'),
    ).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: true,
    });
    await expect(made.admin.readLocation('the library')).resolves.toEqual({ kind: 'unreadable' });
    await expect(made.admin.readLocation('95.5, 10')).resolves.toEqual({ kind: 'out-of-range' });
    expect(made.geo.asked).toEqual([]);
  });

  it('follows a short link to the address it leads to', async () => {
    const made = await gymAdminWith();
    made.geo.links.set(
      'https://maps.app.goo.gl/AbC123',
      'https://www.google.com/maps/place/X/@40.5,-79.9,17z/data=!3d40.4406!4d-79.9959',
    );
    await expect(made.admin.readLocation('https://maps.app.goo.gl/AbC123')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    expect(made.geo.questions('link')).toEqual([
      { what: 'link', url: 'https://maps.app.goo.gl/AbC123' },
    ]);
  });

  it('tells a short link that names no coordinates from one that could not be followed', async () => {
    const made = await gymAdminWith();
    // What many links of the app lead to: a place by its name and Google's own id.
    made.geo.links.set(
      'https://maps.app.goo.gl/Named',
      'https://www.google.com/maps/place/Big+Fountain/data=!4m2!3m1!1s0x8834f1:0x1',
    );
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Named')).resolves.toEqual({
      kind: 'link-nowhere',
    });
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Unknown')).resolves.toEqual({
      kind: 'link-failed',
    });
  });

  it('takes where a map was centred only when the link leads to nothing better', async () => {
    const made = await gymAdminWith();
    // The fake hands every address of the link's way to the reader, as the real one does.
    const centred = 'https://www.google.com/maps/place/Big+Fountain/@40.5,-79.9,17z';
    const pinned = `${centred}/data=!3d40.4406!4d-79.9959`;
    made.geo.followShortLink = (_url, readable) =>
      Promise.resolve([centred, pinned].find((address) => readable(address)));
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Two')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    made.geo.followShortLink = (_url, readable) =>
      Promise.resolve([centred].find((address) => readable(address)));
    await expect(made.admin.readLocation('https://maps.app.goo.gl/One')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.5, lon: -79.9 },
      approximate: true,
    });
  });
});

describe('GymAdminService: where a gym is', () => {
  it('finds the gyms within ten meters of a point that a server may touch, nearest first', async () => {
    const made = await gymAdminWith();
    // The Library is at 40.05, -80.05; 0.00005 degrees of latitude are 5.6 metres.
    const near = made.admin.near({ lat: 40.05005, lon: -80.05 }, 1);
    expect(near.map(({ gym }) => gym.id)).toEqual([1]);
    expect(near[0]?.metres).toBeCloseTo(5.56, 1);
    expect(made.admin.near({ lat: 40.0502, lon: -80.05 }, 1)).toEqual([]);
    // The gym that is being moved does not stand in its own way.
    expect(made.admin.near({ lat: 40.05005, lon: -80.05 }, 1, 1)).toEqual([]);
    // Another server's staff are not asked about a gym of this server's regions.
    expect(made.admin.near({ lat: 40.05005, lon: -80.05 }, 2)).toEqual([]);
  });

  it('names the regions of a server a gym or a point lies in', async () => {
    const made = await gymAdminWith();
    expect(made.admin.regionsOf(1, 1).map((region) => region.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.admin.regionsOf(10, 1)).toEqual([]);
    expect(made.admin.regionsOf(1, 2)).toEqual([]);
    expect(made.admin.regionsOf(1, undefined)).toEqual([]);
    expect(made.admin.regionsAt(FREE, 1).map((region) => region.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.admin.regionsAt({ lat: 40.05, lon: -79.95 }, 1).map((r) => r.channelId)).toEqual([
      EAST_CHANNEL,
    ]);
    expect(made.admin.regionsAt({ lat: 41, lon: -80 }, 1)).toEqual([]);
    expect(made.admin.regionsAt(FREE, 2)).toEqual([]);
  });
});

describe('GymAdminService.add', () => {
  it('stores the gym, makes it findable at once and settles the nearest gyms', async () => {
    const made = await gymAdminWith();
    const gym = added(
      await made.admin.add(
        { name: 'Clock Tower', ...FREE, nickname: 'Big Ben', keywords: ['clock'] },
        STAFF_PLACE,
      ),
    );
    expect(gym).toMatchObject({ id: 13, name: 'Clock Tower', nickname: 'Big Ben', ...FREE });
    expect(gym.nearestGym).not.toBeNull();
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', keywords: ['clock'] });
    // Found before anything was fetched: the answer does not wait for Google.
    expect(made.directory.search(WEST_CHANNEL, 'clock tower')[0]?.gym.id).toBe(13);
    expect(made.directory.regionsOf(13)).toEqual([WEST_CHANNEL]);
    expect(made.gymStore.row(13)?.geodata).toBeNull();

    await settle(made);
    expect(made.gymStore.row(13)).toMatchObject({
      geodata: '{"addressComponents":{"route":"Test Road","locality":"Pinewood"}}',
      places: 'Corner Bakery Maple Dental',
    });
    expect(made.directory.get(13)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('tells the channel for bot updates, without a ping', async () => {
    const made = await gymAdminWith();
    await made.admin.add({ name: 'Clock *Tower*', ...FREE, nickname: 'Big Ben' }, STAFF_PLACE);
    await settle(made);
    const [message, ...more] = announced(made);
    expect(more).toEqual([]);
    expect(textDisplays(message)).toEqual([
      'A gym was added to the gym list.',
      '### [Clock \\*Tower\\* (Big Ben)]' +
        '(<https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015>)\n' +
        `It lies in <#${WEST_CHANNEL}>.`,
      '-# Gym #13',
    ]);
    expect(message?.mention).toBeUndefined();
    // Without a map provider, no map.
    expect(galleryOf(message)).toEqual([]);
  });

  it('tells the channel its staff set for bot updates, by its id, and none where unset', async () => {
    const news = '100000000000000039';
    const servers = new TestServers(
      testServerValues({ channels: { ...TEST_SERVER_CHANNELS, 'bot-updates': news } }),
    );
    const made = await gymAdminWith([], undefined, { servers });
    made.gateway.channelNames.set(news, 'pine-news');
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    expect(made.gateway.messagesIn(news)).toHaveLength(1);
    expect(announced(made)).toEqual([]);
    const unset = await gymAdminWith([], undefined, {
      servers: new TestServers(testServerValues({ channels: {} })),
    });
    await unset.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(unset);
    expect(announced(unset)).toEqual([]);
  });

  it('shows the map of a new gym in its announcement, and goes without one that fails', async () => {
    const asked: number[] = [];
    const made = await gymAdminWith([], undefined, {
      maps: {
        gym: (gym) => {
          asked.push(gym.id);
          return Promise.resolve(`var/images/gyms/${gym.id}-abc.png`);
        },
      },
    });
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    const [message] = announced(made);
    expect(asked).toEqual([13]);
    expect(galleryOf(message)).toEqual(['attachment://13-abc.png']);
    expect(v2(message).files).toEqual(['var/images/gyms/13-abc.png']);

    const failing = await gymAdminWith([], undefined, {
      maps: { gym: () => Promise.reject(new Error('disk full')) },
    });
    await failing.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(failing);
    const [plain] = announced(failing);
    expect(textDisplays(plain)[0]).toBe('A gym was added to the gym list.');
    expect(galleryOf(plain)).toEqual([]);
    expect(v2(plain).files).toBeUndefined();
  });

  it('sends the announcement once more without its map when Discord refuses the map', async () => {
    const made = await gymAdminWith([], undefined, {
      maps: { gym: (gym) => Promise.resolve(`var/images/gyms/${gym.id}-abc.png`) },
    });
    // Discord refuses a message with a file where the bot may not attach files.
    made.gateway.refuseFiles = true;
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    const [message, ...more] = announced(made);
    expect(more).toEqual([]);
    expect(textDisplays(message)[0]).toBe('A gym was added to the gym list.');
    expect(galleryOf(message)).toEqual([]);
    expect(v2(message).files).toBeUndefined();
  });

  it.each([
    ['Missing Access', 50001],
    ['a network error', undefined],
  ])('sends an announcement once only when %s refuses it', async (_name, code) => {
    const made = await gymAdminWith([], undefined, {
      maps: { gym: (gym) => Promise.resolve(`var/images/gyms/${gym.id}-abc.png`) },
    });
    const error =
      code === undefined
        ? new Error('socket hang up')
        : new DiscordAPIError({ code, message: 'Missing Access' }, code, 403, 'POST', '/x', {});
    const send = vi.spyOn(made.gateway, 'sendMessage').mockRejectedValue(error);
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      made.entries.some((entry) => entry.msg === 'could not announce a change of the gym list'),
    ).toBe(true);
  });

  it('sends the announcement again without the map when the file cannot be read', async () => {
    const made = await gymAdminWith([], undefined, {
      maps: { gym: (gym) => Promise.resolve(`var/images/gyms/${gym.id}-abc.png`) },
    });
    const real = made.gateway.sendMessage.bind(made.gateway);
    const send = vi
      .spyOn(made.gateway, 'sendMessage')
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    send.mockImplementation(real);
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    expect(send).toHaveBeenCalledTimes(2);
    expect(announced(made)).toHaveLength(1);
  });

  it('fetches no map where there is no channel to announce in', async () => {
    const asked: number[] = [];
    const made = await gymAdminWith([], undefined, {
      maps: {
        gym: (gym) => {
          asked.push(gym.id);
          return Promise.resolve(undefined);
        },
      },
    });
    await made.admin.add({ name: 'Clock Tower', ...FREE }, { ...STAFF_PLACE, channelIds: [] });
    await settle(made);
    expect(asked).toEqual([]);
    expect(announced(made)).toEqual([]);
  });

  it('announces nothing of a gym deleted while its map was fetched', async () => {
    const forget: { gym?: (id: number) => void } = {};
    const made = await gymAdminWith([], undefined, {
      maps: {
        gym: (gym) => {
          forget.gym?.(gym.id);
          return Promise.resolve(`var/images/gyms/${gym.id}-abc.png`);
        },
      },
    });
    forget.gym = (id) => made.directory.forget(id);
    await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    expect(announced(made)).toEqual([]);
  });

  it('says of a gym outside every region of the server that it lies in none', async () => {
    const made = await gymAdminWith();
    await made.admin.add({ name: 'Far Away', lat: 41, lon: -80 }, STAFF_PLACE);
    await settle(made);
    expect(textDisplays(announced(made)[0])[1]?.split('\n')[1]).toBe(
      'It lies in no region of this server.',
    );
  });

  it('announces nothing where the setting is off or the server has no such channel', async () => {
    const off = await gymAdminWith();
    off.settings.postNewGyms = false;
    await off.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(off);
    expect(announced(off)).toEqual([]);

    const none = await gymAdminWith();
    none.gateway.channelNames.delete(UPDATES_CHANNEL);
    await none.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(none);
    expect(none.gateway.messages).toEqual([]);
  });

  it('adds the gym also when the announcement fails, and logs that', async () => {
    const made = await gymAdminWith();
    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
    await expect(
      made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE),
    ).resolves.toMatchObject({ kind: 'added', gym: { id: 13 } });
    await settle(made);
    expect(
      made.entries.some((entry) => entry.msg === 'could not announce a change of the gym list'),
    ).toBe(true);
  });

  it('adds the gym without an API key, with neither address nor places', async () => {
    const made = await gymAdminWith();
    made.geo.enabled = false;
    expect(made.admin.fetches).toBe(false);
    const gym = added(await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE));
    await settle(made);
    expect(made.directory.get(gym.id)).toMatchObject({ geodata: null, places: null });
    expect(made.directory.get(gym.id)?.nearestGym).not.toBeNull();
  });
});

describe('GymAdminService: another gym within ten metres, looked for under the lock', () => {
  it('answers the second of two adds at one place in one moment with the gym that is there', async () => {
    const made = await gymAdminWith();
    const [first, second] = await Promise.all([
      made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE, []),
      made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE, []),
    ]);
    expect(first).toMatchObject({ kind: 'added', gym: { id: 13 } });
    expect(second).toMatchObject({ kind: 'near', near: [{ gym: { id: 13 }, metres: 0 }] });
    expect(made.gymStore.row(14)).toBeUndefined();
    expect(made.gymStore.writes.filter((write) => write.what === 'create')).toHaveLength(1);
    // A gym the question named ("Add anyway") does not stand in the way.
    await expect(
      made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE, [13]),
    ).resolves.toMatchObject({ kind: 'added', gym: { id: 14 } });
  });

  it('adds nothing beside a gym the question did not name, also without a second add', async () => {
    const made = await gymAdminWith();
    // 5.6 metres north of the Library.
    const beside = { name: 'Library Annex', lat: 40.05005, lon: -80.05 };
    await expect(made.admin.add(beside, STAFF_PLACE)).resolves.toMatchObject({
      kind: 'near',
      near: [{ gym: { id: 1 } }],
    });
    expect(made.gymStore.row(13)).toBeUndefined();
    expect(made.entries.filter((entry) => entry.staff === STAFF)).toEqual([]);
  });

  it('answers the second of two moves to one place in one moment with the gym that is there', async () => {
    const made = await gymAdminWith();
    const [first, second] = await Promise.all([moveNow(made, 6, FREE), moveNow(made, 7, FREE)]);
    expect(first).toMatchObject({ kind: 'moved', gym: { id: 6, ...FREE } });
    expect(second).toMatchObject({ kind: 'near', near: [{ gym: { id: 6 }, metres: 0 }] });
    expect(made.gymStore.row(7)).not.toMatchObject(FREE);
    // With the gym named, as "Move anyway" under a question that listed it.
    const seven = gymOf(made, 7);
    await expect(
      made.admin.move(7, FREE, STAFF_PLACE, {
        from: { lat: seven.lat, lon: seven.lon },
        nearIds: [6],
      }),
    ).resolves.toMatchObject({ kind: 'moved' });
  });

  it('does not move a gym that is no longer where the question said it was', async () => {
    const made = await gymAdminWith();
    const from = { lat: 40.03, lon: -80.03 };
    const asked = { from, nearIds: [] };
    const [first, second] = await Promise.all([
      made.admin.move(6, { lat: 40.0301, lon: -80.03 }, STAFF_PLACE, asked),
      made.admin.move(6, FREE, STAFF_PLACE, asked),
    ]);
    expect(first).toMatchObject({ kind: 'moved' });
    expect(second).toMatchObject({ kind: 'elsewhere', gym: { id: 6, lat: 40.0301 } });
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0301, lon: -80.03 });
    // The gym itself is never another gym near its new place.
    await expect(
      made.admin.move(6, { lat: 40.03011, lon: -80.03 }, STAFF_PLACE, {
        from: { lat: 40.0301, lon: -80.03 },
        nearIds: [],
      }),
    ).resolves.toMatchObject({ kind: 'moved' });
  });
});

describe('GymAdminService: no gym administration across servers', () => {
  it('says whose a gym and a place are by the rows of the regions', async () => {
    const made = await gymAdminWith();
    const north = await withOtherServer(made);
    // A gym in a region of the server, of another server, and of none.
    expect([1, north.id, 10].map((id) => made.admin.mayTouch(id, 1))).toEqual([true, false, true]);
    expect([1, north.id, 10].map((id) => made.admin.mayTouch(id, OTHER_GUILD_ROW))).toEqual([
      false,
      true,
      true,
    ]);
    // A server without a row has only what is nobody's; a gym that is not there is nobody's.
    expect([1, north.id, 10].map((id) => made.admin.mayTouch(id, undefined))).toEqual([
      false,
      false,
      true,
    ]);
    expect(made.admin.mayPlace(FREE, 1)).toBe(true);
    expect(made.admin.mayPlace(FREE, OTHER_GUILD_ROW)).toBe(false);
    expect(made.admin.mayPlace(NORTH_PLACE, 1)).toBe(false);
    expect(made.admin.mayPlace(NORTH_PLACE, OTHER_GUILD_ROW)).toBe(true);
    expect(made.admin.mayPlace({ lat: 41, lon: -80 }, undefined)).toBe(true);
    // A region that belongs to no server keeps nobody out.
    const [west] = made.regions.rows;
    if (west) west.guildId = null;
    expect(made.admin.mayTouch(1, OTHER_GUILD_ROW)).toBe(true);
    expect(made.admin.mayPlace(FREE, OTHER_GUILD_ROW)).toBe(true);
  });

  it('adds no gym at a place in another server’s regions', async () => {
    const made = await gymAdminWith();
    await withOtherServer(made);
    const beside = { name: 'Intruder', lat: 40.26, lon: -80.05 };
    await expect(made.admin.add(beside, STAFF_PLACE)).resolves.toEqual({ kind: 'foreign' });
    expect(made.gymStore.row(14)).toBeUndefined();
    await expect(made.admin.add(beside, OTHER_STAFF_PLACE)).resolves.toMatchObject({
      kind: 'added',
      gym: { id: 14 },
    });
  });

  it('moves no gym of another server, and no gym to a place of another server', async () => {
    const made = await gymAdminWith();
    const north = await withOtherServer(made);
    const asked = (id: number) => {
      const gym = gymOf(made, id);
      return { from: { lat: gym.lat, lon: gym.lon }, nearIds: [] };
    };
    // Another server's gym: as if it were not there.
    await expect(
      made.admin.move(north.id, { lat: 40.2501, lon: -80.05 }, STAFF_PLACE, asked(north.id)),
    ).resolves.toBeUndefined();
    await expect(
      made.admin.move(6, { lat: 40.26, lon: -80.06 }, STAFF_PLACE, asked(6)),
    ).resolves.toEqual({ kind: 'foreign' });
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });
    expect(made.gymStore.row(north.id)).toMatchObject(NORTH_PLACE);
    // Out of every region it may go, and from there into the other server's.
    await expect(
      made.admin.move(6, { lat: 41, lon: -80 }, STAFF_PLACE, asked(6)),
    ).resolves.toMatchObject({ kind: 'moved' });
    await expect(
      made.admin.move(6, { lat: 40.26, lon: -80.06 }, OTHER_STAFF_PLACE, asked(6)),
    ).resolves.toMatchObject({ kind: 'moved' });
    await expect(
      made.admin.move(6, { lat: 40.2601, lon: -80.06 }, STAFF_PLACE, asked(6)),
    ).resolves.toBeUndefined();
  });

  it('deletes no gym of another server: it answers gone, and the gym stays', async () => {
    const made = await gymAdminWith();
    const north = await withOtherServer(made);
    await expect(made.admin.delete(north.id, staff, STAFF_PLACE)).resolves.toEqual({
      kind: 'gone',
    });
    expect(made.gymStore.row(north.id)).toBeDefined();
    expect(made.directory.get(north.id)).toBeDefined();
    await expect(
      made.admin.delete(north.id, { id: OTHER_STAFF }, OTHER_STAFF_PLACE),
    ).resolves.toMatchObject({ kind: 'deleted' });
  });
});

describe('GymAdminService.edit and setElite', () => {
  it('writes only the fields that are given', async () => {
    const made = await gymAdminWith();
    made.gymStore.writes.length = 0;
    const gym = await made.admin.edit(1, { nickname: null, notice: 'Closed on Sundays' }, STAFF);
    expect(gym).toMatchObject({
      id: 1,
      name: 'Pinewood Public Library',
      nickname: null,
      notice: 'Closed on Sundays',
      description: 'Mural of readers beside the front doors',
    });
    expect(made.gymStore.writes).toEqual([
      { what: 'update', id: 1, patch: { nickname: null, notice: 'Closed on Sundays' } },
    ]);
    // Found by its new texts and no longer by the old ones.
    expect(made.directory.search(null, 'stacks').some((hit) => hit.gym.id === 1)).toBe(false);
  });

  it('writes nothing for no change, and answers the gym as it is', async () => {
    const made = await gymAdminWith();
    made.gymStore.writes.length = 0;
    await expect(made.admin.edit(1, {}, STAFF)).resolves.toMatchObject({ id: 1 });
    expect(made.gymStore.writes).toEqual([]);
  });

  it('answers undefined for a gym that is not there', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.edit(99, { notice: 'x' }, STAFF)).resolves.toBeUndefined();
    await expect(made.admin.setElite(99, true, STAFF)).resolves.toBeUndefined();
    await expect(moveNow(made, 99, FREE)).resolves.toBeUndefined();
  });

  it('shows a changed gym in the post of a raid there and of a train through it', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [2, 1]);
    await settle(made);

    await made.admin.edit(
      1,
      { name: 'Reading Room', nickname: null, notice: 'Closed on Sundays' },
      STAFF,
    );
    await settle(made);

    const post = made.gateway.posts.get(raid.party.forumPostId ?? '');
    expect(post?.title).toContain('Reading Room');
    expect(JSON.stringify(post?.message)).toContain('Closed on Sundays');
    expect(JSON.stringify(made.gateway.posts.get(train.postId)?.message)).toContain('Reading Room');
  });

  it('makes a gym an elite raid gym by its tag, and clears both flags when it is none', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.setElite(1, true, STAFF)).resolves.toMatchObject({
      taggedEx: true,
      confirmedEx: false,
    });
    // A gym that the legacy bot marked as having hosted such a raid keeps that.
    await made.gymStore.update(2, { confirmedEx: true });
    await expect(made.admin.setElite(2, true, STAFF)).resolves.toMatchObject({
      taggedEx: true,
      confirmedEx: true,
    });
    await expect(made.admin.setElite(2, false, STAFF)).resolves.toMatchObject({
      taggedEx: false,
      confirmedEx: false,
    });
    expect(made.gymStore.row(2)).toMatchObject({ taggedEx: false, confirmedEx: false });
  });
});

describe('GymAdminService: a change that meets a deletion, or a database that cannot be read', () => {
  /**
   * Makes the directory's next read of a gym one that saw the row and gets its answer only on
   * release: a read that was on its way when the gym went. Gives the release and the read's
   * beginning (`begun.reached(1)`).
   */
  function heldRead(made: Made) {
    const read = made.gymStore.get.bind(made.gymStore);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = { begun: new Tally('the held read'), release: () => release() };
    made.gymStore.get = async (id) => {
      const gym = await read(id);
      state.begun.add();
      made.gymStore.get = read;
      await held;
      return gym;
    };
    return state;
  }

  /** Counts the gyms the directory forgets (a deletion), for a test to wait for. */
  function forgetting(made: Made): Tally {
    const forgotten = new Tally('the gyms forgotten');
    const forget = made.directory.forget.bind(made.directory);
    made.directory.forget = (id) => {
      const known = forget(id);
      forgotten.add();
      return known;
    };
    return forgotten;
  }

  it.each([
    ['an edit', (made: Made) => made.admin.edit(6, { notice: 'Closed' }, STAFF)],
    ['an elite flag', (made: Made) => made.admin.setElite(6, true, STAFF)],
  ])(
    'answers undefined for %s whose gym was deleted while it was read again',
    async (_, change) => {
      const made = await gymAdminWith();
      const read = heldRead(made);
      const forgotten = forgetting(made);
      const changing = change(made);
      await read.begun.reached(1);
      // The row is written; now the gym goes, and the directory forgets it.
      const deleting = made.admin.delete(6, staff, STAFF_PLACE);
      await forgotten.reached(1);
      expect(made.directory.get(6)).toBeUndefined();
      read.release();
      // Not "changed" for a gym that no longer exists.
      await expect(changing).resolves.toBeUndefined();
      await expect(deleting).resolves.toMatchObject({ kind: 'deleted' });
      expect(made.directory.get(6)).toBeUndefined();
    },
  );

  it('answers the gym as it was written when the directory cannot read it again, and logs that', async () => {
    const made = await gymAdminWith();
    // The rows are written, and then the directory cannot read them.
    made.gymStore.failingOn.get = new Error('database is down');
    await expect(made.admin.edit(1, { notice: 'Closed on Sundays' }, STAFF)).resolves.toMatchObject(
      { id: 1, notice: 'Closed on Sundays' },
    );
    await expect(made.admin.setElite(1, true, STAFF)).resolves.toMatchObject({
      id: 1,
      taggedEx: true,
    });
    await expect(moveNow(made, 6, FREE)).resolves.toMatchObject({
      kind: 'moved',
      gym: { id: 6, ...FREE },
      from: { lat: 40.03, lon: -80.03 },
    });
    expect(made.gymStore.row(1)).toMatchObject({ notice: 'Closed on Sundays', taggedEx: true });
    expect(made.gymStore.row(6)).toMatchObject(FREE);
    const logged = made.entries.filter(
      (entry) => entry.msg === 'a gym was changed, but not everything after it worked',
    );
    expect(logged.map((entry) => [entry.gym, entry.level])).toEqual([
      [1, 50],
      [1, 50],
      [6, 50],
    ]);
  });
});

describe('GymAdminService.move', () => {
  it('moves the gym, sorts it into its new region and fetches its address again', async () => {
    const made = await gymAdminWith();
    const target = { lat: 40.05, lon: -79.95 };
    const moved = await moveNow(made, 6, target);
    if (moved?.kind !== 'moved') throw new Error('not moved');
    expect(moved.gym).toMatchObject({ id: 6, ...target });
    // Where it was, and how far it went.
    expect(moved.from).toEqual({ lat: 40.03, lon: -80.03 });
    expect(moved.metres).toBeGreaterThan(7_000);
    expect(moved.metres).toBeLessThan(7_500);
    expect(made.directory.regionsOf(6)).toEqual([EAST_CHANNEL]);
    expect(made.directory.search(EAST_CHANNEL, 'maple leaf mosaic')[0]?.place).toBe('local');
    await settle(made);
    expect(made.geo.questions('geocode').map((asked) => asked.point)).toEqual([target]);
    // No gym keeps a nearest gym that the move made wrong.
    const all = made.directory.all();
    for (const gym of all) {
      expect([gym.id, gym.nearestGym]).toEqual([gym.id, nearestTo(gym, all)?.place.id]);
    }
    expect(announced(made)).toEqual([]);
  });

  it('is never refused for a raid at the gym or a train through it: they stay what they are', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 6));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [1, 6]);
    expect(made.admin.shownBy(6)).toMatchObject({
      raids: [{ id: raid.party.id }],
      trains: [{ id: train.id }],
    });
    await expect(moveNow(made, 6, { lat: 40.05, lon: -79.95 })).resolves.toMatchObject({
      kind: 'moved',
    });
    expect(made.store.get(raid.party.id)).toMatchObject({ gymId: 6, regionId: 1 });
    expect(inGyms(train.current().train.route)).toEqual(inGyms([1, 6]));
    expect(made.admin.inAnyRegion(6)).toBe(true);
    await moveNow(made, 6, { lat: 41, lon: -80 });
    expect(made.admin.inAnyRegion(6)).toBe(false);
  });
});

describe('GymAdminService: the log of what staff change', () => {
  it('notes who changed which gym and what, never the texts', async () => {
    const made = await gymAdminWith();
    const gym = added(await made.admin.add({ name: 'Secret Name', ...FREE }, STAFF_PLACE));
    await made.admin.edit(gym.id, { notice: 'Secret notice', nickname: 'Secret nick' }, STAFF);
    await made.admin.setElite(gym.id, true, STAFF);
    await moveNow(made, gym.id, { lat: 40.016, lon: -80.015 });
    await made.admin.delete(gym.id, staff, STAFF_PLACE);
    const noted = made.entries.filter((entry) => entry.staff === STAFF);
    expect(noted.map((entry) => entry.msg)).toEqual([
      'a gym was added',
      'the texts of a gym were changed',
      'the elite flag of a gym was set',
      'a gym was moved',
      'a gym was deleted',
    ]);
    expect(noted.every((entry) => entry.gym === gym.id && entry.level === 30)).toBe(true);
    expect(noted[1]).toMatchObject({ fields: ['notice', 'nickname'] });
    expect(noted[2]).toMatchObject({ elite: true });
    expect(noted[3]).toMatchObject({
      from: { lat: 40.015, lon: -80.015 },
      to: { lat: 40.016, lon: -80.015 },
    });
    expect(JSON.stringify(noted)).not.toContain('Secret');
    // A change that was not made is not noted.
    made.entries.length = 0;
    await made.admin.edit(1, {}, STAFF);
    await made.admin.edit(99, { notice: 'x' }, STAFF);
    expect(made.entries.filter((entry) => entry.staff === STAFF)).toEqual([]);
  });
});

describe('GymAdminService.add when something after the row fails', () => {
  it('answers the gym that was stored, and logs what failed', async () => {
    const made = await gymAdminWith();
    // The row is written, and then the directory cannot read it.
    made.gymStore.failingOn.get = new Error('database is down');
    const gym = added(await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE));
    expect(gym).toMatchObject({ id: 13, name: 'Clock Tower' });
    expect(made.gymStore.row(13)).toBeDefined();
    expect(
      made.entries.some(
        (entry) => entry.msg === 'a gym was added, but not everything after it worked',
      ),
    ).toBe(true);
  });
});

describe('GymAdminService.delete', () => {
  it('says what refers to a gym', async () => {
    const made = await gymAdminWith();
    await trainOn(made, [4, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 2, 'Other', [6]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    const references = await made.admin.references(6);
    expect(references).toMatchObject({ raids: [], trains: 1, routes: 2, targets: 1 });
    expect(await made.admin.targetCount(6)).toBe(1);
    expect(await made.admin.references(3)).toEqual({ raids: [], trains: 0, routes: 0, targets: 0 });
  });

  it('refuses while an active raid is at the gym, and deletes nothing', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 6));
    if (raid.kind !== 'created') throw new Error('no raid');
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);

    expect(outcome).toMatchObject({ kind: 'raid-there', raid: { id: raid.party.id } });
    expect(made.gymStore.row(6)).toBeDefined();
    expect(made.routes.rows[0]?.stops).toEqual(stops(6, 1));
    expect((await made.admin.references(6)).raids.map((party) => party.id)).toEqual([
      raid.party.id,
    ]);
  });

  it('deletes the gym with everything that refers to it', async () => {
    const made = await gymAdminWith();
    // A train that is at the gym, and one that has it further down its route.
    const at = await trainOn(made, [6, 4]);
    await made.attendance.signUp(at.id, maker, PartyStatus.Present);
    const later = await trainOn(made, [1, 6, 2]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 1, 'Only', [6]);
    // One member in two servers is one member.
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    await made.gymTargets.add(ALICE, '412345678901234568', 6);
    await made.gymTargets.add(BOB, made.gateway.guildId, 6);
    await made.gymTargets.add(BOB, made.gateway.guildId, 4);
    await settle(made);
    for (const train of [at, later]) {
      for (const message of made.gateway.messagesIn(train.postId)) {
        await made.gateway.deleteMessage(train.postId, message.id);
      }
    }
    // A gym right beside it, which has it as its nearest.
    const beside = added(
      await made.admin.add({ name: 'Beside', lat: 40.0302, lon: -80.03 }, STAFF_PLACE),
    );
    await settle(made);
    const pointing = made.directory.all().filter((gym) => gym.nearestGym === 6);
    expect(pointing.map((gym) => gym.id)).toContain(beside.id);

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    await settle(made);

    expect(outcome).toMatchObject({
      kind: 'deleted',
      gym: { id: 6, name: 'Maple Leaf Mosaic' },
      trains: 2,
      routes: 2,
      // Members, not rows.
      targets: 2,
      unmended: [],
    });
    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.get(6)).toBeUndefined();
    expect(made.directory.search(null, 'maple leaf mosaic').some((hit) => hit.gym.id === 6)).toBe(
      false,
    );
    // The train that was there has moved on, as after any removal of its current stop.
    expect(inGyms(at.current().train.route)).toEqual(inGyms([4]));
    expect(inGyms(currentStop(at.current()))).toBe(4);
    expect(at.current().attendees[REPORTER]?.status).toBe(PartyStatus.Coming);
    // The line that says why, and the announcement of where the train is going, which pings
    // the member who is signed up and names the staff member as the one who moved it.
    expect(at.said().sort()).toEqual([
      "**Maple Leaf Mosaic** was removed from Pine's gym list.",
      expect.stringMatching(
        /^The train is moving to \[Veterans Memorial Bridge\].*Moved by \*\*Morgan\*\*.*\n<@200000000000000001>$/s,
      ) as string,
    ]);
    // The other train stays where it is and is told as well.
    expect(inGyms(later.current().train.route)).toEqual(inGyms([1, 2]));
    expect(inGyms(currentStop(later.current()))).toBe(1);
    expect(later.said()).toEqual(["**Maple Leaf Mosaic** was removed from Pine's gym list."]);
    expect(JSON.stringify(made.gateway.posts.get(later.postId)?.message)).not.toContain(
      'Maple Leaf Mosaic',
    );
    // Saved routes and gym targets, of everybody.
    expect(made.routes.rows.map((row) => [row.name, row.stops])).toEqual([['Loop', stops(1)]]);
    expect(made.gymTargets.rows.map((row) => row.gym)).toEqual(['4']);
    // The gyms that had it as their nearest have another.
    for (const gym of pointing) {
      const now = made.directory.get(gym.id)?.nearestGym;
      expect(now).not.toBe(6);
      expect(now).not.toBeNull();
    }
    expect(announced(made).at(-1)).toEqual({
      content: '**Maple Leaf Mosaic** (#6) was removed from the gym list.',
    });
  });

  it('answers gone for a gym that is not there, also the second time', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.delete(99, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'gone' });
    await made.admin.delete(6, staff, STAFF_PLACE);
    await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'gone' });
    await settle(made);
    expect(announced(made)).toHaveLength(1);
  });

  it.each(['routes', 'gymTargets', 'gymStore'] as const)(
    'changes nothing, and tells nobody, when the %s cannot be written',
    async (store) => {
      const made = await gymAdminWith();
      const train = await trainOn(made, [6, 1]);
      await made.attendance.signUp(train.id, maker, PartyStatus.Present);
      made.routes.add(ALICE, 1, 'Loop', [6, 1]);
      await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
      await settle(made);
      const saidBefore = train.said();
      made[store].failing = new Error('database is down');

      await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'failed' });
      made[store].failing = undefined;
      await settle(made);

      // The gym is there, and so is everything that names it.
      expect(made.gymStore.row(6)).toBeDefined();
      expect(made.directory.get(6)).toBeDefined();
      expect(made.routes.rows.map((row) => row.stops)).toEqual([stops(6, 1)]);
      expect(made.gymTargets.rows.map((row) => row.gym)).toEqual(['6']);
      // Nothing visible happened: the train is at the gym, its post was told nothing, nobody
      // was pinged, the channel for updates is silent.
      expect(inGyms(train.current().train.route)).toEqual(inGyms([6, 1]));
      expect(train.current().attendees[REPORTER]?.status).toBe(PartyStatus.Present);
      expect(train.said()).toEqual(saidBefore);
      expect(announced(made)).toEqual([]);
      // And it can be deleted once the database works again.
      await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toMatchObject({
        kind: 'deleted',
        trains: 1,
        routes: 1,
        targets: 1,
      });
    },
  );

  it('leaves no ghost when the directory cannot read the database after the row is gone', async () => {
    const made = await gymAdminWith();
    const gym = report(made, 6);
    // The removal works; every read of a gym after it fails.
    made.gymStore.failingOn.get = new Error('database is down');

    await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toMatchObject({
      kind: 'deleted',
    });

    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.get(6)).toBeUndefined();
    expect(made.directory.search(null, 'maple leaf mosaic').some((hit) => hit.gym.id === 6)).toBe(
      false,
    );
    // A report there answers with a sentence instead of failing on the database's key.
    await expect(made.service.reportRaid(gym)).resolves.toEqual({ kind: 'gym-gone' });
    expect(made.store.active()).toEqual([]);
    await settle(made);
    expect(announced(made)).toHaveLength(1);
  });

  it('answers deleted also when the trains cannot be looked at, and names them', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1, 6]);
    made.trains.gymRemoved = () => Promise.reject(new Error('trains failed'));
    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    expect(outcome).toMatchObject({ kind: 'deleted', trains: 0 });
    expect(outcome.kind === 'deleted' && outcome.unmended.map((left) => left.id)).toEqual([
      train.id,
    ]);
    expect(made.directory.get(6)).toBeUndefined();
    expect(
      made.entries.some(
        (entry) => entry.msg === 'could not take a deleted gym off the routes of trains',
      ),
    ).toBe(true);
  });

  it('has the hourly upkeep take the stop off a train that could not be changed then', async () => {
    const made = await gymAdminWith();
    const broken = await trainOn(made, [6, 1]);
    await made.attendance.signUp(broken.id, maker, PartyStatus.Present);
    await settle(made);
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id) => {
      const counts = await remove(id);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };
    await made.admin.delete(6, staff, STAFF_PLACE);
    made.storage.failing = undefined;
    await settle(made);
    expect(inGyms(broken.current().train.route)).toEqual(inGyms([6, 1]));
    const before = broken.said().length;

    made.clock.now += 3_600_000;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    await settle(made);

    expect(inGyms(broken.current().train.route)).toEqual(inGyms([1]));
    expect(inGyms(currentStop(broken.current()))).toBe(1);
    // The bot's own act: a line in the post, and no ping.
    const said = made.gateway.messagesIn(broken.postId).slice(before);
    expect(said.map((message) => message.message)).toEqual([
      { content: "A stop was removed: its gym is no longer in Pine's gym list." },
    ]);
  });

  it('names a train that could not be changed, and deletes the gym all the same', async () => {
    const made = await gymAdminWith();
    const broken = await trainOn(made, [1, 6]);
    // The removal of the gym works; the train cannot be stored.
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id) => {
      const counts = await remove(id);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    made.storage.failing = undefined;

    expect(outcome).toMatchObject({ kind: 'deleted', trains: 0 });
    if (outcome.kind !== 'deleted') return;
    expect(outcome.unmended.map((train) => train.id)).toEqual([broken.id]);
    expect(made.directory.get(6)).toBeUndefined();
    expect(inGyms(broken.current().train.route)).toEqual(inGyms([1, 6]));
    expect(
      made.entries.filter((entry) => entry.msg === 'a train keeps a deleted gym on its route'),
    ).toHaveLength(1);
  });

  it('lets a report that came first win: the deletion finds the raid', async () => {
    const made = await gymAdminWith();
    // Both at once: the report takes the gym's lock in the same turn it is made.
    const reporting = made.service.reportRaid(report(made, 6));
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    const [reported, deleted] = await Promise.all([reporting, deleting]);
    expect(reported.kind).toBe('created');
    expect(deleted.kind).toBe('raid-there');
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('answers a report that waited for a deletion with a sentence, and stores no raid', async () => {
    const made = await gymAdminWith();
    const gym = report(made, 6);
    const release = heldDelete(made);
    // The deletion is inside the gym's lock, waiting for its row to go.
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    const reporting = made.service.reportRaid(gym);
    await turns();
    release();

    const [deleted, reported] = await Promise.all([deleting, reporting]);
    expect(deleted.kind).toBe('deleted');
    expect(reported).toEqual({ kind: 'gym-gone' });
    expect(made.store.active()).toEqual([]);
    await settle(made);
    expect(made.gateway.posts.size).toBe(0);
  });

  it('refuses to move a raid to a gym that was deleted, and to make it a stop', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [1]);
    // A gym of the raid's own region, and one of the other region.
    for (const gymId of [6, 8]) {
      await made.admin.delete(gymId, staff, STAFF_PLACE);
      await expect(made.raids.setGym(raid.party.id, maker, gymId)).resolves.toEqual({
        kind: 'refused',
        reason: 'gym-gone',
      });
      await expect(made.trains.addStop(train.id, maker, gymStop(gymId))).resolves.toEqual({
        kind: 'refused',
        reason: 'gym-gone',
      });
    }
    expect(inGyms(train.current().train.route)).toEqual(inGyms([1]));
  });

  it('lets a move of a raid to the gym that came first win, and refuses one that waited', async () => {
    const first = await gymAdminWith();
    const raid = await first.service.reportRaid(report(first, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const moving = first.raids.setGym(raid.party.id, maker, 6);
    const deleting = first.admin.delete(6, staff, STAFF_PLACE);
    const [moved, deleted] = await Promise.all([moving, deleting]);
    expect(moved).toMatchObject({ kind: 'ok', changed: true });
    expect(deleted.kind).toBe('raid-there');

    // A gym of the raid's own region, and one of another region (the raid would get a new
    // post there: that is stored under the gym's lock too).
    for (const gymId of [6, 8]) {
      const made = await gymAdminWith();
      const other = await made.service.reportRaid(report(made, 1));
      if (other.kind !== 'created') throw new Error('no raid');
      await settle(made);
      const posts = made.gateway.posts.size;
      const target = gymOf(made, gymId);
      expect(made.raids.gymMove(other.party, target).kind).toBe(gymId === 6 ? 'local' : 'region');
      const release = heldDelete(made);
      const removing = made.admin.delete(gymId, staff, STAFF_PLACE);
      await turns();
      const late = made.raids.setGym(other.party.id, maker, gymId);
      await turns();
      release();
      await expect(removing).resolves.toMatchObject({ kind: 'deleted' });
      await expect(late).resolves.toEqual({ kind: 'refused', reason: 'gym-gone' });
      expect(made.store.get(other.party.id)?.gymId).toBe(1);
      await settle(made);
      expect(made.store.active()).toHaveLength(1);
      expect(made.gateway.posts.size).toBe(posts);
    }
  });

  it('takes the gym off a route it was put on while it was being deleted', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const release = heldDelete(made);
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    // The gym is still in the list: the stop is taken.
    await expect(made.trains.addStop(train.id, maker, gym(6))).resolves.toMatchObject({
      kind: 'ok',
    });
    release();
    await expect(deleting).resolves.toMatchObject({ kind: 'deleted', trains: 1, unmended: [] });
    expect(inGyms(train.current().train.route)).toEqual(inGyms([1]));
    // From here on the stop is refused.
    await expect(made.trains.addStop(train.id, maker, gym(6))).resolves.toEqual({
      kind: 'refused',
      reason: 'gym-gone',
    });
  });

  it('takes the gym off a route whose new stop was being written while the gym went', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const release = heldSave(made, train.id);
    // Decided while the gym exists; the row of the train is on its way.
    const adding = made.trains.addStop(train.id, maker, gym(6));
    await turns();
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    // The gym is gone already, and the train in memory does not have the stop yet.
    expect(made.directory.get(6)).toBeUndefined();
    expect(inGyms(train.current().train.route)).toEqual(inGyms([1]));
    release();

    const [added, deleted] = await Promise.all([adding, deleting]);
    expect(added).toMatchObject({ kind: 'ok' });
    expect(deleted).toMatchObject({ kind: 'deleted', trains: 1, unmended: [] });
    expect(inGyms(train.current().train.route)).toEqual(inGyms([1]));
  });

  it('takes the gym off a route that was being loaded while the gym went', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const saved = made.routes.add(REPORTER, 1, 'Round', [2, 6]);
    const release = heldSave(made, train.id);
    const loading = made.trains.loadRoute(train.id, maker, saved.id);
    await turns();
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    expect(made.directory.get(6)).toBeUndefined();
    release();

    const [loaded, deleted] = await Promise.all([loading, deleting]);
    expect(inGyms(loaded)).toMatchObject(inGyms({ kind: 'ok' }));
    expect(inGyms(deleted)).toMatchObject(inGyms({ kind: 'deleted', trains: 1, unmended: [] }));
    expect(inGyms(train.current().train.route)).toEqual(inGyms([2]));
  });
});

describe('GymAdminService.batch', () => {
  /** A place in West, far from every invented gym, apart from `FREE`. */
  const ELSEWHERE = { lat: 40.015, lon: -80.095 };

  it('adds gyms and announces what changed in one summary once the batch is done', async () => {
    const made = await gymAdminWith();
    const outcome = await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      const first = added(await ops.add({ name: 'Clock Tower', ...FREE, imageUrl: 'https://a/1' }));
      const second = added(await ops.add({ name: 'Bell Tower', ...ELSEWHERE }));
      await settle(made);
      // Nothing is said while the batch runs.
      expect(announced(made)).toEqual([]);
      return [first.id, second.id];
    });
    expect(outcome).toEqual([13, 14]);
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', imageUrl: 'https://a/1' });
    expect(made.directory.regionsOf(14)).toEqual([WEST_CHANNEL]);
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 2 gyms.',
    ]);
  });

  it('counts renames but names only tidied, and moves, and says nothing of nothing', async () => {
    const made = await gymAdminWith();
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      await ops.add({ name: 'Clock Tower', ...FREE });
      await ops.update(1, { name: 'Pinewood Library' });
      await ops.update(2, { name: 'old stone fountain ' });
      await ops.update(3, { imageUrl: 'https://a/3' });
      await ops.move(
        6,
        { lat: gymOf(made, 6).lat + 0.0001, lon: gymOf(made, 6).lon },
        {
          places: false,
        },
      );
    });
    await made.admin.batch(STAFF_PLACE, 'import', () => Promise.resolve());
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 1 gym, renamed 1, and moved 1.',
    ]);
  });

  it('gathers the changes of the review queue into one summary, posted after the last', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const made = await gymAdminWith();
      await made.admin.batch(STAFF_PLACE, 'review', async (ops) => {
        await ops.add({ name: 'Clock Tower', ...FREE });
      });
      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS - 1_000);
      await made.admin.batch(STAFF_PLACE, 'review', async (ops) => {
        await ops.update(1, { name: 'Pinewood Library' });
      });
      expect(
        await made.admin.delete(5, { id: STAFF }, STAFF_PLACE, undefined, 'review'),
      ).toMatchObject({ kind: 'deleted' });
      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS - 1_000);
      expect(announced(made)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      await settle(made);
      expect(announced(made).map((message) => textOf(message))).toEqual([
        '### The gym list changed\nProfessor Pine has added 1 gym, renamed 1, and deleted 1.',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says in its summary the PokéStops and Power Spots the work counted', async () => {
    const made = await gymAdminWith();
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      await ops.add({ name: 'Clock Tower', ...FREE });
      ops.countWayspots({
        stops: { added: 3, changed: 0, gone: 1 },
        powerSpots: { added: 1, changed: 2, gone: 0 },
      });
    });
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      ops.countWayspots({
        stops: { added: 0, changed: 1, gone: 0 },
        powerSpots: { added: 0, changed: 0, gone: 0 },
      });
      return Promise.resolve();
    });
    await settle(made);
    // The second import changed no gym: it posts nothing (8W-3).
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 1 gym. It also added 3 PokéStops and 1 ' +
        'Power Spot, changed 2 Power Spots, and removed 1 PokéStop.',
    ]);
  });

  it('posts the review queue’s gathered counts only when a gym changed among them (8W-3)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const made = await gymAdminWith();
      const stopOnly = {
        stops: { added: 0, changed: 1, gone: 0 },
        powerSpots: { added: 0, changed: 0, gone: 0 },
      };
      await made.admin.batch(STAFF_PLACE, 'review', (ops) => {
        ops.countWayspots(stopOnly);
        return Promise.resolve();
      });
      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS);
      await settle(made);
      expect(announced(made)).toEqual([]);
      // Gathered with a gym's change, the stops are counted in its post.
      await made.admin.batch(STAFF_PLACE, 'review', async (ops) => {
        ops.countWayspots(stopOnly);
        await ops.add({ name: 'Clock Tower', ...FREE });
      });
      await vi.advanceTimersByTimeAsync(REVIEW_SUMMARY_MS);
      await settle(made);
      expect(announced(made).map((message) => textOf(message))).toEqual([
        '### The gym list changed\nProfessor Pine has added 1 gym. It also changed 1 PokéStop.',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds a block of gyms in one transaction, their nearest gyms worked out once for it', async () => {
    const made = await gymAdminWith();
    const library = gymOf(made, 1);
    const beside = { lat: library.lat + 0.00005, lon: library.lon };
    const twin = { lat: FREE.lat + 0.00003, lon: FREE.lon };
    const outcomes = await made.admin.batch(STAFF_PLACE, 'import', (ops) =>
      ops.addBlock([
        { gym: { name: 'Clock Tower', ...FREE, geodata: '{"addressComponents":{}}' } },
        // Within ten metres of a gym it was not told of: not added.
        { gym: { name: 'Mural', ...beside } },
        { gym: { name: 'Mural Too', ...beside }, knownNearIds: [1] },
        // Within ten metres of another gym of the block: added, as one by one (both exist).
        { gym: { name: 'Clock Twin', ...twin } },
        { gym: { name: 'Far', ...NORTH_PLACE }, promoted: true },
      ]),
    );
    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      'added',
      'near',
      'added',
      'added',
      'added',
    ]);
    expect(outcomes[1]).toMatchObject({ near: [{ gym: { id: 1 } }] });
    expect(made.gymStore.blocks).toBe(1);
    const [clock, , muralToo, clockTwin] = outcomes.map((outcome) =>
      outcome.kind === 'added' ? outcome.gym.id : 0,
    );
    expect(made.gymStore.row(clock!)?.nearestGym).toBe(clockTwin);
    expect(made.gymStore.row(clockTwin!)?.nearestGym).toBe(clock);
    // The library's nearest gym is the new mural beside it now.
    expect(made.gymStore.row(1)?.nearestGym).toBe(muralToo);
    expect(made.directory.regionsOf(clock!)).toEqual([WEST_CHANNEL]);
    // In the line: the clock tower for its places, the others for their address too.
    expect(await made.upkeep.waiting()).toBeGreaterThanOrEqual(4);
    expect(made.geo.asked).toEqual([]);
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 4 gyms (1 of them was a PokéStop).',
    ]);
  });

  it('adds a block gym by gym when its transaction fails, so that one bad gym fails alone', async () => {
    const made = await gymAdminWith();
    made.gymStore.refuseNames.add('Bad Gym');
    const outcomes = await made.admin.batch(STAFF_PLACE, 'import', (ops) =>
      ops.addBlock([
        { gym: { name: 'Clock Tower', ...FREE } },
        { gym: { name: 'Bad Gym', lat: 40.02, lon: -80.03 } },
        { gym: { name: 'Far', ...NORTH_PLACE } },
      ]),
    );
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['added', 'failed', 'added']);
    expect(made.gymStore.blocks).toBe(0);
    expect(made.directory.all().filter((gym) => gym.name === 'Bad Gym')).toEqual([]);
  });

  it('adds beside a gym it was told of, and nowhere near another', async () => {
    const made = await gymAdminWith();
    const library = gymOf(made, 1);
    const beside = { lat: library.lat + 0.00005, lon: library.lon };
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      expect(await ops.add({ name: 'Mural', ...beside })).toMatchObject({
        kind: 'near',
        near: [{ gym: { id: 1 } }],
      });
      expect(await ops.add({ name: 'Mural', ...beside }, [1])).toMatchObject({ kind: 'added' });
      expect(await ops.add({ name: 'Far', ...NORTH_PLACE })).toMatchObject({ kind: 'added' });
    });
    await withOtherServer(made);
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      expect(await ops.add({ name: 'Theirs', ...NORTH_PLACE, lat: 40.26 })).toEqual({
        kind: 'foreign',
      });
    });
  });

  it('moves a gym a few metres without asking Google, and further with it', async () => {
    const made = await gymAdminWith();
    await settle(made);
    made.geo.asked.length = 0;
    const mosaic = gymOf(made, 6);
    const near = { lat: mosaic.lat + 0.0001, lon: mosaic.lon };
    const far = { lat: 40.05, lon: -79.95 };
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      const small = await ops.move(6, near, { places: false });
      expect(small).toMatchObject({
        kind: 'moved',
        gym: { id: 6, ...near },
        from: { lat: mosaic.lat, lon: mosaic.lon },
      });
      await settle(made);
      expect(made.geo.asked).toEqual([]);
      expect(await ops.move(2, far, { places: true })).toMatchObject({ kind: 'moved' });
      expect(await ops.move(99, far, { places: true })).toBeUndefined();
    });
    await settle(made);
    expect(made.geo.questions('geocode').map((asked) => asked.point)).toEqual([far]);
    // The nearest gyms follow both moves.
    const all = made.directory.all();
    for (const gym of all) {
      expect([gym.id, gym.nearestGym]).toEqual([gym.id, nearestTo(gym, all)?.place.id]);
    }
    expect(made.directory.regionsOf(2)).toEqual([EAST_CHANNEL]);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has moved 2 gyms.',
    ]);
  });

  it('puts what its adds and moves ask Google in the slow line, not all at once', async () => {
    const made = await gymAdminWith();
    await settle(made);
    made.geo.asked.length = 0;
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      await ops.add({ name: 'Clock Tower', ...FREE });
      await ops.move(2, { lat: 40.05, lon: -79.95 }, { places: true });
    });
    await background.settle();
    expect(made.geo.asked).toEqual([]);
    expect(await made.upkeep.waiting()).toBeGreaterThanOrEqual(2);
    await settle(made);
    expect(made.geo.questions('geocode')).toHaveLength(2);
  });

  it('writes the name, Wayfarer id and picture of a gym, and logs which fields', async () => {
    const made = await gymAdminWith();
    const id = '0123456789abcdef0123456789abcdef.16';
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      const gym = await ops.update(3, {
        name: 'St Mary Church',
        pogoId: id,
        imageUrl: 'https://p',
      });
      expect(gym).toMatchObject({
        id: 3,
        name: 'St Mary Church',
        pogoId: id,
        imageUrl: 'https://p',
      });
      expect(await ops.update(3, {})).toMatchObject({ id: 3 });
      expect(await ops.update(99, { name: 'Nothing' })).toBeUndefined();
    });
    expect(made.directory.search(WEST_CHANNEL, 'st mary church')[0]?.gym.id).toBe(3);
    expect(made.gymStore.written('name')).toEqual([[3, 'St Mary Church']]);
    expect(made.entries.filter((entry) => entry.msg === 'a gym was changed')).toEqual([
      expect.objectContaining({ staff: STAFF, gym: 3, fields: ['name', 'pogoId', 'imageUrl'] }),
    ]);
  });

  it('touches no gym of another server', async () => {
    const made = await gymAdminWith();
    const theirs = await withOtherServer(made);
    await made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      expect(await ops.update(theirs.id, { name: 'Mine now' })).toBeUndefined();
      expect(await ops.move(theirs.id, FREE, { places: false })).toBeUndefined();
      expect(await ops.move(6, NORTH_PLACE, { places: false })).toEqual({ kind: 'foreign' });
    });
    expect(made.gymStore.row(theirs.id)).toMatchObject({ name: 'Northgate Clock' });
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.03, lon: -80.03 });
  });

  it('holds the lock: an add waits until the batch is done', async () => {
    const made = await gymAdminWith();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const batch = made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
      await ops.add({ name: 'Clock Tower', ...FREE });
      await gate;
    });
    const waiting = made.admin.add({ name: 'Bell Tower', ...FREE }, STAFF_PLACE);
    await turns();
    expect(made.gymStore.row(14)).toBeUndefined();
    release();
    await batch;
    // The add looked for gyms near its place after the batch, and found the batch's.
    expect(await waiting).toMatchObject({ kind: 'near', near: [{ gym: { id: 13 } }] });
  });

  it('announces what it added also when the work fails, and rejects', async () => {
    const made = await gymAdminWith();
    await expect(
      made.admin.batch(STAFF_PLACE, 'import', async (ops) => {
        await ops.add({ name: 'Clock Tower', ...FREE });
        made.gymStore.failingOn.update = new Error('database is down');
        await ops.update(1, { name: 'Library' });
      }),
    ).rejects.toThrow('database is down');
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 1 gym.',
    ]);
    expect(made.gymStore.row(1)?.name).toBe('Pinewood Public Library');
  });
});
