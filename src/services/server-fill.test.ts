import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMINISTRATORS_ONLY, mapMemberRole, moderatorsNamed } from '../config/server-settings.js';
import { loadSettings, type Settings } from '../config/settings.js';
import { filledRow } from '../../test/support/server-settings-cases.js';
import { MemoryServerSettings } from '../../test/support/server-settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { FILL_TRIES, ServerFill, type ServerNames } from './server-fill.js';
import { ServerNotices } from './server-notices.js';
import { ServerSettings, SETTINGS_LOADING } from './server-settings.js';

const fileSettings = loadSettings(TEST_SETTINGS_PATH);
const SERVER = '412345678901234567';
const JOINED = '412345678901234568';
const NOW = Date.parse('2026-11-12T15:00:00Z');

/**
 * A server of the client's cache, by the names of its channels, categories and roles; a name
 * listed twice is two channels of that name, the first one found.
 */
function serverNamed(
  serverId: string,
  names: { text?: string[]; forum?: string[]; categories?: string[]; roles?: string[] },
): ServerNames {
  const ids = (kind: string, list: string[] = []) => {
    const found = new Map<string, string>();
    list.forEach((name, i) => {
      if (!found.has(name)) {
        found.set(name, `${kind}${String(i).padStart(3, '0')}${serverId.slice(-12)}`);
      }
    });
    return found;
  };
  const text = ids('500', names.text);
  const forum = ids('510', names.forum);
  const categories = ids('520', names.categories);
  const roles = ids(
    '530',
    names.roles?.map((name) => name.toLowerCase()),
  );
  const listed = { text: names.text, forum: names.forum, category: names.categories };
  return {
    serverId,
    channel: (name, kind) => (kind === 'forum' ? forum : text).get(name),
    category: (name) => categories.get(name),
    role: (name) => roles.get(name.trim().toLowerCase()),
    howMany: (name, kind) => (listed[kind] ?? []).filter((one) => one === name).length,
  };
}

/** Pittsburgh's server: every name of the test settings there, but the Unown channel. */
const pittsburgh = serverNamed(SERVER, {
  text: [
    'the-bot-lab',
    'mod-bot-only',
    'elite-gym-raids',
    'remote-raids',
    'rank-checker',
    'bot-updates',
  ],
  categories: ['PVP CHAT AND TOURNAMENTS'],
  roles: ['Unown'],
});

async function fillWith(
  rows = [] as ReturnType<typeof filledRow>[],
  settings: Settings = fileSettings,
  more: Partial<Pick<ConstructorParameters<typeof ServerFill>[0], 'recordedForum'>> & {
    /** What sends a notice into the lab (plan 19B-1, `ServerNotices`); recorded unless given. */
    send?: (channelId: string, text: string) => Promise<void>;
  } = {},
) {
  const store = new MemoryServerSettings(rows);
  const { log, entries } = createTestLogger();
  const servers = new ServerSettings({ store, settings, log, now: () => NOW });
  await servers.load();
  const told: Array<{ channelId: string; text: string }> = [];
  // The staff's notices as the bot sends them (plan 19B-1): into the server's moderators' bot lab.
  const notices = new ServerNotices({
    servers,
    log,
    send:
      more.send ??
      ((channelId, text) => {
        told.push({ channelId, text });
        return Promise.resolve();
      }),
  });
  const fill = new ServerFill({
    servers,
    settings,
    log,
    notices,
    ...(more.recordedForum === undefined ? {} : { recordedForum: more.recordedForum }),
  });
  return { store, servers, fill, told, entries, notices };
}

/** The fills of servers present at the login (`wireServerStart` begins each), until all are done. */
async function fillPresent(fill: ServerFill, all: readonly ServerNames[]): Promise<void> {
  for (const names of all) fill.begin(names, 'present');
  await Promise.all(all.map((names) => fill.whenFilled(names.serverId)));
}

/** The test settings with a moderators' channel, an events forum and a map member role named. */
const namingMore: Settings = {
  ...fileSettings,
  channels: { ...fileSettings.channels, moderation: 'moderators', events: 'events' },
  web: {
    port: 8080,
    host: '127.0.0.1',
    publicUrl: 'https://map.example.test',
    trustProxy: false,
    tiles: 'stadia',
    memberRole: 'Verified',
  },
};

const STAFF = { id: '200000000000000001', name: 'Staff' };

describe('the fill: rows for servers that have none', () => {
  it("gives a server the file's server keys, its names as the ids found in that server", async () => {
    const { servers, fill, store } = await fillWith();
    await fillPresent(fill, [pittsburgh]);
    const values = servers.of(SERVER);
    expect(values.channels).toEqual({
      'bot-lab': pittsburgh.channel('the-bot-lab', 'text'),
      'mod-bot-lab': pittsburgh.channel('mod-bot-only', 'text'),
      'elite-gym-raids': pittsburgh.channel('elite-gym-raids', 'text'),
      'remote-raids': pittsburgh.channel('remote-raids', 'text'),
      pvp: pittsburgh.channel('rank-checker', 'text'),
      'bot-updates': pittsburgh.channel('bot-updates', 'text'),
    });
    expect(values.categories).toEqual({ pvp: pittsburgh.category('PVP CHAT AND TOURNAMENTS') });
    // The role is found as the readers found it: trimmed, whatever its letter case.
    expect(values.roles).toEqual({ unown: pittsburgh.role('unown') });
    expect(values.distanceUnits).toBe('metric');
    expect(values.regionForumSuffix).toBe('-meetups');
    expect(values.timezone).toBe('America/New_York');
    expect(store.rows.get(SERVER)?.updatedBy).toBeNull();
  });

  it("tells the server's moderators' bot lab, in plain words, which names it could not find", async () => {
    const { fill, told } = await fillWith();
    await fillPresent(fill, [pittsburgh]);
    expect(told).toEqual([
      {
        channelId: pittsburgh.channel('mod-bot-only', 'text'),
        text:
          'I could not find these channels and roles of my settings file in this server, so ' +
          'they are not set: the Unown channel #unown-sightings. Staff set them with ' +
          '/admin settings.',
      },
    ]);
  });

  it('tells the bot lab which names matched several channels or categories, and which it kept (fix round 3, H10)', async () => {
    const twice = serverNamed(SERVER, {
      text: [
        'the-bot-lab',
        'the-bot-lab',
        'mod-bot-only',
        'unown-sightings',
        'elite-gym-raids',
        'remote-raids',
        'rank-checker',
        'bot-updates',
      ],
      categories: ['PVP CHAT AND TOURNAMENTS', 'PVP CHAT AND TOURNAMENTS'],
      roles: ['Unown'],
    });
    const { fill, told } = await fillWith();
    await fillPresent(fill, [twice]);
    const lab = twice.channel('the-bot-lab', 'text') ?? '';
    const pvp = twice.category('PVP CHAT AND TOURNAMENTS') ?? '';
    expect(told.map((one) => one.text)).toEqual([
      'These names match more than one channel or category in this server, so I took one of ' +
        `each: <#${lab}> as the bot lab #the-bot-lab, <#${pvp}> as the PvP category PVP ` +
        'CHAT AND TOURNAMENTS. Staff pick others with /admin settings.',
    ]);
  });

  it("logs the names it could not find where the server has no moderators' bot lab", async () => {
    const { fill, told, entries } = await fillWith();
    await fillPresent(fill, [serverNamed(JOINED, { roles: ['unown'] })]);
    expect(told).toEqual([]);
    // Plan 19B-1: said as every notice for a server's staff is, through `ServerNotices`.
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        server: JOINED,
        notice: 'unmatched-settings',
        text: expect.stringContaining('the bot lab #the-bot-lab') as unknown,
        msg: 'a server has no moderators’ bot lab: a notice for its staff is only logged',
      }),
    );
  });

  it('records every server present at the upgrade set up, and a server that joins later not', async () => {
    const { servers, fill } = await fillWith();
    await fillPresent(fill, [pittsburgh]);
    fill.begin(serverNamed(JOINED, {}), 'joined');
    await fill.whenFilled(JOINED);
    expect(servers.setUpAt(SERVER)).toBe(NOW);
    expect(servers.setUpAt(JOINED)).toBeNull();
  });

  it('records no server set up when the table had rows at the start', async () => {
    const { servers, fill } = await fillWith([filledRow({ serverId: JOINED })]);
    await fillPresent(fill, [pittsburgh]);
    expect(servers.has(SERVER)).toBe(true);
    expect(servers.setUpAt(SERVER)).toBeNull();
  });

  it('leaves a server that has its row as it is', async () => {
    const { servers, fill, told } = await fillWith([filledRow({ serverId: SERVER })]);
    await fillPresent(fill, [pittsburgh]);
    expect(servers.of(SERVER).channels).toEqual({ 'bot-lab': '300000000000000001' });
    expect(told).toEqual([]);
  });

  it("has an interaction wait for its server's fill, and nothing else wait", async () => {
    const { servers, fill } = await fillWith();
    const ready = fillPresent(fill, [pittsburgh]);
    const waited = fill.whenFilled(SERVER).then(() => servers.has(SERVER));
    expect(await waited).toBe(true);
    await ready;
    // A server with its row, one never filled, and a DM go on at once.
    await fill.whenFilled(SERVER);
    await fill.whenFilled(JOINED);
    await fill.whenFilled(null);
  });

  it("keeps a member role and a moderators' channel it could not find closed, and says so", async () => {
    const { servers, fill, told } = await fillWith([], namingMore);
    await fillPresent(fill, [pittsburgh]);
    const values = servers.of(SERVER);
    // The map stays for administrators, meetup safety and reports on but unreachable, as when
    // the file's names matched nothing (review F1, F2).
    expect(values.unmatched).toEqual(['channels.moderation', 'roles.mapMember']);
    expect(mapMemberRole(values)).toBe(ADMINISTRATORS_ONLY);
    expect(moderatorsNamed(values)).toBe(true);
    // The two that stay closed are worded apart from those left unset.
    expect(told.map((one) => one.text)).toEqual([
      [
        'I could not find these channels and roles of my settings file in this server, so they ' +
          'are not set: the Unown channel #unown-sightings, the events forum #events. Staff set ' +
          'them with /admin settings.',
        'The moderators’ channel #moderators could not be found, so it stays closed until staff ' +
          'pick one in /admin settings: meetups that need approval and reports are refused until ' +
          'then.',
        'The map’s member role Verified could not be found, so it stays closed until staff pick ' +
          'one in /admin settings: the map shows parties to administrators only until then.',
      ].join('\n'),
    ]);
  });

  it('takes the events forum recorded for the server, its name only without a record', async () => {
    const recorded = '510999000000000001';
    const withForum = serverNamed(SERVER, { text: ['mod-bot-only'], forum: ['events'] });
    const named = withForum.channel('events', 'forum');
    const { servers, fill, told } = await fillWith([], namingMore, {
      recordedForum: (serverId) => Promise.resolve(serverId === SERVER ? recorded : undefined),
    });
    await fillPresent(fill, [withForum, serverNamed(JOINED, { forum: ['events'] })]);
    // A renamed forum, or another of the same name, is not the one the server's posts are in.
    expect(servers.of(SERVER).channels.events).toBe(recorded);
    expect(named).not.toBe(recorded);
    expect(told[0]?.text).not.toContain('the events forum');
    expect(servers.of(JOINED).channels.events).toBe(
      serverNamed(JOINED, { forum: ['events'] }).channel('events', 'forum'),
    );
  });

  it('is done once the row is written, the bot lab told on the side (fix round 3, H4)', async () => {
    let told!: () => void;
    const telling = new Promise<void>((resolve) => {
      told = resolve;
    });
    const { servers, fill } = await fillWith([], fileSettings, {
      // A message that does not go out until the fill is done: awaited, it would never be.
      send: () => {
        told();
        return fill.whenFilled(SERVER);
      },
    });
    fill.begin(pittsburgh, 'present');
    await telling;
    await fill.whenFilled(SERVER);
    expect(servers.has(SERVER)).toBe(true);
  });

  it('takes no events forum, recorded or not, where the file names none (fix round 3, H7)', async () => {
    const { servers, fill } = await fillWith([], fileSettings, {
      recordedForum: () => Promise.resolve('510999000000000001'),
    });
    await fillPresent(fill, [pittsburgh]);
    // The file drew no events forum before 2.1: the server has none until its staff set one.
    expect(fileSettings.channels.events).toBeUndefined();
    expect(servers.of(SERVER).channels.events).toBeUndefined();
  });

  it('takes the name when the record cannot be read, and logs it', async () => {
    const withForum = serverNamed(SERVER, { forum: ['events'] });
    const { servers, fill, entries } = await fillWith([], namingMore, {
      recordedForum: () => Promise.reject(new Error('database away')),
    });
    await fillPresent(fill, [withForum]);
    expect(servers.of(SERVER).channels.events).toBe(withForum.channel('events', 'forum'));
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        server: SERVER,
        msg: 'could not read the events forum recorded for a server: its name is looked for',
      }),
    );
  });

  describe('a row that cannot be written', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("goes on with the file's defaults, and tries again a minute later, saying so each time", async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { servers, fill, store, entries } = await fillWith();
      store.failing.set('create', new Error('database away'));
      await fillPresent(fill, [pittsburgh]);
      expect(servers.has(SERVER)).toBe(false);
      // An interaction meanwhile does not wait a minute for it.
      await fill.whenFilled(SERVER);
      await vi.advanceTimersToNextTimerAsync();
      await fill.whenFilled(SERVER);
      expect(servers.has(SERVER)).toBe(false);
      expect(
        entries.filter(
          (one) =>
            one.level === 40 &&
            one.msg === "could not fill a server's settings: trying again in a minute",
        ),
      ).toHaveLength(2);
      store.failing.delete('create');
      await vi.advanceTimersToNextTimerAsync();
      await fill.whenFilled(SERVER);
      expect(servers.of(SERVER).channels['bot-lab']).toBe(
        pittsburgh.channel('the-bot-lab', 'text'),
      );
      expect(servers.setUpAt(SERVER)).toBe(NOW);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('tries again after a name reader that throws, and never rejects (fix round 3, H5)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { servers, fill, entries } = await fillWith();
      const broken: ServerNames = {
        ...pittsburgh,
        channel: () => {
          throw new Error('the cache is gone');
        },
      };
      fill.begin(broken, 'present');
      await fill.whenFilled(SERVER);
      expect(servers.has(SERVER)).toBe(false);
      expect(entries).toContainEqual(
        expect.objectContaining({
          level: 40,
          server: SERVER,
          msg: "could not fill a server's settings: trying again in a minute",
        }),
      );
      expect(vi.getTimerCount()).toBe(1);
    });

    it('sets no retry once stopped, for a fill under way that fails (fix round 3, H12)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { fill, store } = await fillWith();
      store.failing.set('create', new Error('database away'));
      fill.begin(pittsburgh, 'present');
      // The shutdown, while the row is being written.
      fill.stop();
      await fill.whenFilled(SERVER);
      expect(vi.getTimerCount()).toBe(0);
    });

    it(`gives up after ${String(FILL_TRIES)} tries, and says so`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { servers, fill, store, entries } = await fillWith();
      store.failing.set('create', new Error('database away'));
      await fillPresent(fill, [pittsburgh]);
      while (vi.getTimerCount() > 0) {
        await vi.advanceTimersToNextTimerAsync();
        await fill.whenFilled(SERVER);
      }
      expect(servers.has(SERVER)).toBe(false);
      expect(
        entries.filter(
          (one) => one.msg === "could not fill a server's settings: trying again in a minute",
        ),
      ).toHaveLength(FILL_TRIES - 1);
      expect(entries).toContainEqual(
        expect.objectContaining({
          level: 50,
          server: SERVER,
          msg: "could not fill a server's settings: it has the file's defaults until the bot starts again",
        }),
      );
    });

    it('keeps closed what the file names while it tries again, and after it gives up (fix round 4, I1)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { servers, fill, store } = await fillWith([], namingMore);
      store.failing.set('create', new Error('database away'));
      await fillPresent(fill, [pittsburgh]);
      const closed = () => [moderatorsNamed(servers.of(SERVER)), mapMemberRole(servers.of(SERVER))];
      expect(closed()).toEqual([true, ADMINISTRATORS_ONLY]);
      while (vi.getTimerCount() > 0) {
        await vi.advanceTimersToNextTimerAsync();
        await fill.whenFilled(SERVER);
      }
      expect(servers.has(SERVER)).toBe(false);
      expect(closed()).toEqual([true, ADMINISTRATORS_ONLY]);
    });
  });
});

describe("a change of a server's values and its fill", () => {
  it('waits for the fill under way, and changes the filled values', async () => {
    const { servers, fill } = await fillWith();
    fill.begin(pittsburgh, 'present');
    const changed = await servers.set(
      SERVER,
      (values) => ({ ...values, postNewGyms: false }),
      STAFF,
    );
    expect(changed.postNewGyms).toBe(false);
    // The file's names are not lost to a change that came first (review F5).
    expect(changed.channels['bot-lab']).toBe(pittsburgh.channel('the-bot-lab', 'text'));
    expect(servers.of(SERVER).categories.pvp).toBe(pittsburgh.category('PVP CHAT AND TOURNAMENTS'));
  });

  it('is refused for a server without its row, and the fill afterwards still has its names', async () => {
    const { servers, fill, store } = await fillWith();
    await expect(
      servers.set(SERVER, (values) => ({ ...values, postNewGyms: false }), STAFF),
    ).rejects.toThrow(SETTINGS_LOADING);
    expect(store.rows.has(SERVER)).toBe(false);
    await fillPresent(fill, [pittsburgh]);
    expect(servers.of(SERVER).channels['bot-lab']).toBe(pittsburgh.channel('the-bot-lab', 'text'));
  });
});
