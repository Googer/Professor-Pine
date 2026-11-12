import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATORS_ONLY,
  fileDefaults,
  mapMemberRole,
  moderatorsNamed,
} from '../config/server-settings.js';
import { loadSettings, type Settings } from '../config/settings.js';
import {
  filledRow,
  OTHER_SETTINGS_SERVER,
  SETTINGS_NOW,
  SETTINGS_SERVER,
  SETTINGS_STAFF,
} from '../../test/support/server-settings-cases.js';
import { MemoryServerSettings } from '../../test/support/server-settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { ServerSettings } from './server-settings.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const BOT_LAB = '300000000000000001';
const THIRD_SERVER = '412345678901234569';

/** The test settings with a moderators' channel and a map member role named. */
const naming: Settings = {
  ...settings,
  channels: { ...settings.channels, moderation: 'moderators' },
  web: {
    port: 8080,
    host: '127.0.0.1',
    publicUrl: 'https://map.example.test',
    trustProxy: false,
    tiles: 'stadia',
    memberRole: 'Verified',
  },
};

/** A promise and what settles it, for a step held until the test lets it go. */
function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function servicesWith(rows = [filledRow()], file: Settings = settings) {
  const store = new MemoryServerSettings(rows);
  const { log, entries } = createTestLogger();
  let now = SETTINGS_NOW;
  const servers = new ServerSettings({ store, settings: file, log, now: () => now });
  await servers.load();
  return {
    store,
    servers,
    entries,
    pass: (ms: number) => {
      now += ms;
    },
  };
}

describe('ServerSettings', () => {
  it("gives a server's values from its row, and the file's defaults to a server without one", async () => {
    const { servers } = await servicesWith();
    expect(servers.of(SETTINGS_SERVER).channels).toEqual({ 'bot-lab': BOT_LAB });
    expect(servers.of(SETTINGS_SERVER).distanceUnits).toBe('metric');
    // What the row does not say is the code's default, not the file's.
    expect(servers.of(SETTINGS_SERVER).regionForumSuffix).toBe('-board');
    expect(servers.has(SETTINGS_SERVER)).toBe(true);
    expect(servers.of(OTHER_SETTINGS_SERVER)).toEqual(fileDefaults(settings));
    expect(servers.has(OTHER_SETTINGS_SERVER)).toBe(false);
  });

  it('keeps closed what the file names while a server has no row: the moderators named, the map for administrators (fix round 4, I1)', async () => {
    const { servers } = await servicesWith([], naming);
    const values = servers.of(OTHER_SETTINGS_SERVER);
    expect(values.unmatched).toEqual(['channels.moderation', 'roles.mapMember']);
    expect(moderatorsNamed(values)).toBe(true);
    expect(mapMemberRole(values)).toBe(ADMINISTRATORS_ONLY);
    // A file that names neither keeps nothing closed.
    const plain = (await servicesWith([])).servers.of(OTHER_SETTINGS_SERVER);
    expect(moderatorsNamed(plain)).toBe(false);
    expect(mapMemberRole(plain)).toBeUndefined();
  });

  it('keeps closed what the file names for a server whose row cannot be read (fix round 4, I1)', async () => {
    const { servers } = await servicesWith(
      [filledRow({ settings: { channels: { 'bot-lab': 'the-bot-lab' } } })],
      naming,
    );
    const values = servers.of(SETTINGS_SERVER);
    expect(moderatorsNamed(values)).toBe(true);
    expect(mapMemberRole(values)).toBe(ADMINISTRATORS_ONLY);
  });

  it('says whether the table was empty when it was loaded: the upgrade to 2.1', async () => {
    expect((await servicesWith()).servers.upgrading).toBe(false);
    expect((await servicesWith([])).servers.upgrading).toBe(true);
  });

  it('gives the file defaults to a server whose stored values cannot be read, and logs it', async () => {
    const { servers, entries } = await servicesWith([
      filledRow({ settings: { channels: { 'bot-lab': 'the-bot-lab' } } }),
    ]);
    expect(servers.of(SETTINGS_SERVER)).toEqual(fileDefaults(settings));
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 50,
        server: SETTINGS_SERVER,
        msg: "could not read a server's settings: it has the file's defaults until they are set",
      }),
    );
  });

  it('writes a change first, then has it, with who made it and when', async () => {
    const { servers, store, pass } = await servicesWith();
    pass(60_000);
    const after = await servers.set(
      SETTINGS_SERVER,
      (values) => ({ ...values, flaggedWords: ['garden'] }),
      SETTINGS_STAFF,
    );
    expect(after.flaggedWords).toEqual(['garden']);
    expect(servers.of(SETTINGS_SERVER).flaggedWords).toEqual(['garden']);
    expect(servers.of(SETTINGS_SERVER).channels).toEqual({ 'bot-lab': BOT_LAB });
    const row = store.rows.get(SETTINGS_SERVER);
    expect(row?.updatedBy).toBe(SETTINGS_STAFF);
    expect(row?.updatedAt).toBe(SETTINGS_NOW + 60_000);
    expect(row?.setUpAt).toBe(SETTINGS_NOW);
    expect(row?.settings).toMatchObject({ flaggedWords: ['garden'] });
  });

  it('changes nothing when the write fails, or when the change is not a valid value', async () => {
    const { servers, store } = await servicesWith();
    store.failing.set('write', new Error('database away'));
    await expect(
      servers.set(SETTINGS_SERVER, (values) => ({ ...values, postNewGyms: true }), SETTINGS_STAFF),
    ).rejects.toThrow('database away');
    expect(servers.of(SETTINGS_SERVER).postNewGyms).toBe(false);
    store.failing.delete('write');
    await expect(
      servers.set(
        SETTINGS_SERVER,
        (values) => ({ ...values, channels: { ...values.channels, moderation: BOT_LAB } }),
        SETTINGS_STAFF,
      ),
    ).rejects.toThrow('must be a channel of its own');
    expect(servers.of(SETTINGS_SERVER).channels).toEqual({ 'bot-lab': BOT_LAB });
    expect(store.rows.get(SETTINGS_SERVER)?.updatedBy).toBeNull();
  });

  it('runs changes one at a time, each from what the one before left', async () => {
    const { servers } = await servicesWith();
    await Promise.all([
      servers.set(
        SETTINGS_SERVER,
        (v) => ({ ...v, flaggedWords: [...v.flaggedWords, 'a'] }),
        SETTINGS_STAFF,
      ),
      servers.set(
        SETTINGS_SERVER,
        (v) => ({ ...v, flaggedWords: [...v.flaggedWords, 'b'] }),
        SETTINGS_STAFF,
      ),
    ]);
    expect(servers.of(SETTINGS_SERVER).flaggedWords).toEqual(['a', 'b']);
  });

  it("never holds one server's change or fill behind another's (fix round 4, I3)", async () => {
    const { servers, store } = await servicesWith([filledRow()]);
    // The fill of a new server, its write held.
    const written = held<void>();
    const create = store.create.bind(store);
    store.create = (row) =>
      row.serverId === THIRD_SERVER ? written.promise.then(() => create(row)) : create(row);
    const filling = servers.create(THIRD_SERVER, fileDefaults(settings), false);
    // Another server's change and fill go through meanwhile.
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, postNewGyms: true }), SETTINGS_STAFF);
    expect(servers.of(SETTINGS_SERVER).postNewGyms).toBe(true);
    expect(await servers.create(OTHER_SETTINGS_SERVER, fileDefaults(settings), false)).toBe(true);
    // A change of the held server waits for its fill, then runs.
    const changing = servers.set(
      THIRD_SERVER,
      (v) => ({ ...v, distanceUnits: 'imperial' }),
      SETTINGS_STAFF,
    );
    written.resolve();
    expect(await filling).toBe(true);
    expect((await changing).distanceUnits).toBe('imperial');
  });

  it('gives a server its row at its first change, from the file defaults, not set up', async () => {
    const { servers, store } = await servicesWith([]);
    await servers.set(
      OTHER_SETTINGS_SERVER,
      (values) => ({ ...values, distanceUnits: 'imperial' }),
      SETTINGS_STAFF,
    );
    expect(servers.of(OTHER_SETTINGS_SERVER)).toEqual({
      ...fileDefaults(settings),
      distanceUnits: 'imperial',
    });
    expect(store.rows.get(OTHER_SETTINGS_SERVER)?.setUpAt).toBeNull();
  });
});
