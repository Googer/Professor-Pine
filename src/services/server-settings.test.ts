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
  SETTINGS_ACTOR,
  SETTINGS_STAFF,
} from '../../test/support/server-settings-cases.js';
import { MemoryServerSettings } from '../../test/support/server-settings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { UserError } from '../discord/errors.js';
import { AUDIT_KEEP_MS } from './party-audit.js';
import { ServerSettings, SETTINGS_LOADING } from './server-settings.js';

const settings = loadSettings(TEST_SETTINGS_PATH);
const BOT_LAB = '300000000000000001';
const MODERATION = '300000000000000009';
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
  const servers = new ServerSettings({
    store,
    audit: store.audit,
    settings: file,
    log,
    now: () => now,
  });
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
      SETTINGS_ACTOR,
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
      servers.set(SETTINGS_SERVER, (values) => ({ ...values, postNewGyms: true }), SETTINGS_ACTOR),
    ).rejects.toThrow('database away');
    expect(servers.of(SETTINGS_SERVER).postNewGyms).toBe(false);
    store.failing.delete('write');
    await expect(
      servers.set(
        SETTINGS_SERVER,
        (values) => ({ ...values, channels: { ...values.channels, moderation: BOT_LAB } }),
        SETTINGS_ACTOR,
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
        SETTINGS_ACTOR,
      ),
      servers.set(
        SETTINGS_SERVER,
        (v) => ({ ...v, flaggedWords: [...v.flaggedWords, 'b'] }),
        SETTINGS_ACTOR,
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
    const filling = servers.create(THIRD_SERVER, servers.defaults(), false);
    // Another server's change and fill go through meanwhile.
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, postNewGyms: true }), SETTINGS_ACTOR);
    expect(servers.of(SETTINGS_SERVER).postNewGyms).toBe(true);
    expect(await servers.create(OTHER_SETTINGS_SERVER, servers.defaults(), false)).toBe(true);
    // A change of the held server waits for its fill, then runs.
    const changing = servers.set(
      THIRD_SERVER,
      (v) => ({ ...v, distanceUnits: 'imperial' }),
      SETTINGS_ACTOR,
    );
    written.resolve();
    expect(await filling).toBe(true);
    expect((await changing).distanceUnits).toBe('imperial');
  });

  it('refuses a change of a server without its row: its fill comes first (review F5)', async () => {
    const { servers, store } = await servicesWith([]);
    const refused = servers.set(
      OTHER_SETTINGS_SERVER,
      (values) => ({ ...values, distanceUnits: 'imperial' }),
      SETTINGS_ACTOR,
    );
    await expect(refused).rejects.toThrow(SETTINGS_LOADING);
    await expect(refused).rejects.toBeInstanceOf(UserError);
    expect(store.rows.has(OTHER_SETTINGS_SERVER)).toBe(false);
    expect(servers.of(OTHER_SETTINGS_SERVER)).toEqual(fileDefaults(settings));
  });

  it("logs each setting a change changed in the staff's log, with who and when", async () => {
    const { servers, store, pass } = await servicesWith();
    pass(60_000);
    await servers.set(
      SETTINGS_SERVER,
      (values) => ({
        ...values,
        channels: { ...values.channels, moderation: MODERATION },
        postNewGyms: true,
      }),
      SETTINGS_ACTOR,
    );
    expect(store.audit.rows.map(({ id: _id, ...row }) => row)).toEqual([
      {
        serverId: SETTINGS_SERVER,
        at: SETTINGS_NOW + 60_000,
        actor: SETTINGS_ACTOR,
        key: 'channels.moderation',
        before: null,
        after: MODERATION,
      },
      {
        serverId: SETTINGS_SERVER,
        at: SETTINGS_NOW + 60_000,
        actor: SETTINGS_ACTOR,
        key: 'postNewGyms',
        before: false,
        after: true,
      },
    ]);
  });

  it('writes nothing for a change that changes nothing: no row, no entry of the log', async () => {
    const { servers, store, pass } = await servicesWith();
    pass(60_000);
    const after = await servers.set(SETTINGS_SERVER, (values) => ({ ...values }), SETTINGS_ACTOR);
    expect(after).toEqual(servers.of(SETTINGS_SERVER));
    expect(store.rows.get(SETTINGS_SERVER)).toEqual(filledRow());
    expect(store.audit.rows).toEqual([]);
  });

  it("gives a server's zone from its row, and the instance's default where the row has none (plan 19A-2)", async () => {
    const { servers } = await servicesWith([
      filledRow(),
      filledRow({ serverId: OTHER_SETTINGS_SERVER, settings: { timezone: 'Europe/Berlin' } }),
    ]);
    expect(servers.zoneOf(SETTINGS_SERVER)).toBe('America/New_York');
    expect(servers.zoneOf(OTHER_SETTINGS_SERVER)).toBe('Europe/Berlin');
    // A server without a row: the file's defaults, the instance's zone among them.
    expect(servers.zoneOf(THIRD_SERVER)).toBe('America/New_York');
    expect(servers.defaultZone()).toBe('America/New_York');
  });

  it('gives the zones in use: every server’s, and the instance’s default, each once', async () => {
    const { servers } = await servicesWith([
      filledRow({ settings: { timezone: 'Asia/Kolkata' } }),
      filledRow({ serverId: OTHER_SETTINGS_SERVER, settings: { timezone: 'Asia/Kolkata' } }),
    ]);
    expect([...servers.zonesInUse()].sort()).toEqual(['America/New_York', 'Asia/Kolkata']);
    await servers.set(
      SETTINGS_SERVER,
      (values) => ({ ...values, timezone: 'Europe/Berlin' }),
      SETTINGS_ACTOR,
    );
    expect([...servers.zonesInUse()].sort()).toEqual([
      'America/New_York',
      'Asia/Kolkata',
      'Europe/Berlin',
    ]);
  });

  it('counts each spelling of a zone in use by its own name (fix round 2, P1)', async () => {
    const { servers } = await servicesWith([
      filledRow({ settings: { timezone: 'America/Chicago' } }),
      filledRow({ serverId: OTHER_SETTINGS_SERVER, settings: { timezone: 'Europe/Berlin' } }),
    ]);
    await servers.set(
      OTHER_SETTINGS_SERVER,
      (values) => ({ ...values, timezone: 'US/Central' }),
      SETTINGS_ACTOR,
    );
    // Each server's zone is among them as `zoneOf` gives it: what follows them (a timer, a list
    // per zone) serves the servers of exactly that name.
    expect(servers.zoneOf(OTHER_SETTINGS_SERVER)).toBe('US/Central');
    expect([...servers.zonesInUse()].sort()).toEqual([
      'America/Chicago',
      'America/New_York',
      'US/Central',
    ]);
  });

  it('tells a change of the zones in use when one spelling of a zone takes another’s place (fix round 2, P1)', async () => {
    const store = new MemoryServerSettings([
      filledRow({ settings: { timezone: 'America/Chicago' } }),
      filledRow({ serverId: OTHER_SETTINGS_SERVER, settings: { timezone: 'US/Central' } }),
    ]);
    let present: string[] = [SETTINGS_SERVER];
    const servers = new ServerSettings({
      store,
      settings,
      log: createTestLogger().log,
      present: () => present,
    });
    await servers.load();
    const heard: Array<readonly string[]> = [];
    servers.onZonesInUseChange((zones) => heard.push([...zones].sort()));
    // The server in Chicago leaves as the one in US/Central joins: the zone's name in use is
    // another, so what serves it by name follows.
    present = [OTHER_SETTINGS_SERVER];
    servers.presenceChanged();
    expect(heard).toEqual([['America/New_York', 'US/Central']]);
  });

  it('tells the listeners of a change of a server’s zone after the write, and of nothing else', async () => {
    const { servers, store } = await servicesWith();
    const heard: Array<{ serverId: string; zone: string; was: string; written: boolean }> = [];
    servers.onZoneChange((serverId, zone, was) =>
      heard.push({
        serverId,
        zone,
        was,
        written: (store.rows.get(serverId)?.settings as { timezone?: string }).timezone === zone,
      }),
    );
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, postNewGyms: true }), SETTINGS_ACTOR);
    // The zone the server had (the default) written as its own: no change of zone.
    await servers.set(
      SETTINGS_SERVER,
      (v) => ({ ...v, timezone: 'America/New_York' }),
      SETTINGS_ACTOR,
    );
    expect(heard).toEqual([]);
    store.failing.set('write', new Error('database away'));
    await expect(
      servers.set(SETTINGS_SERVER, (v) => ({ ...v, timezone: 'Europe/Berlin' }), SETTINGS_ACTOR),
    ).rejects.toThrow('database away');
    expect(heard).toEqual([]);
    store.failing.delete('write');
    await servers.set(
      SETTINGS_SERVER,
      (v) => ({ ...v, timezone: 'Europe/Berlin' }),
      SETTINGS_ACTOR,
    );
    expect(heard).toEqual([
      { serverId: SETTINGS_SERVER, zone: 'Europe/Berlin', was: 'America/New_York', written: true },
    ]);
  });

  it('takes another name of the zone a server has for no change of zone (fix round 1, K3)', async () => {
    const { servers, store } = await servicesWith([
      filledRow({ settings: { timezone: 'Asia/Kolkata' } }),
    ]);
    const heard: string[] = [];
    servers.onZoneChange((serverId, zone) => heard.push(zone));
    const kept = await servers.set(
      SETTINGS_SERVER,
      (v) => ({ ...v, timezone: 'Asia/Calcutta' }),
      SETTINGS_ACTOR,
    );
    expect(kept.timezone).toBe('Asia/Kolkata');
    expect(heard).toEqual([]);
    expect(store.audit.rows).toEqual([]);
  });

  it('gives the zones in use of the servers present only, once they are known (fix round 1, K5)', async () => {
    const store = new MemoryServerSettings([
      filledRow({ settings: { timezone: 'Europe/Berlin' } }),
      filledRow({ serverId: OTHER_SETTINGS_SERVER, settings: { timezone: 'Asia/Kolkata' } }),
    ]);
    let present: string[] | undefined;
    const servers = new ServerSettings({
      store,
      settings,
      log: createTestLogger().log,
      present: () => present,
    });
    await servers.load();
    // Before the client is ready: every server with a row.
    expect([...servers.zonesInUse()].sort()).toEqual([
      'America/New_York',
      'Asia/Kolkata',
      'Europe/Berlin',
    ]);
    const heard: Array<readonly string[]> = [];
    servers.onZonesInUseChange((zones) => heard.push([...zones].sort()));
    // The client ready, in one of the two servers: the other's zone is no longer in use.
    present = [SETTINGS_SERVER];
    servers.presenceChanged();
    expect(heard).toEqual([['America/New_York', 'Europe/Berlin']]);
    // A server joining in a zone already in use changes nothing (N5).
    present = [SETTINGS_SERVER, THIRD_SERVER];
    servers.presenceChanged();
    expect(heard).toHaveLength(1);
    // The server in Kolkata joining again brings its zone (N5).
    present = [SETTINGS_SERVER, THIRD_SERVER, OTHER_SETTINGS_SERVER];
    servers.presenceChanged();
    expect(heard[1]).toEqual(['America/New_York', 'Asia/Kolkata', 'Europe/Berlin']);
    // A change of a server's zone is told by `onZoneChange` alone, never twice.
    await servers.set(
      SETTINGS_SERVER,
      (v) => ({ ...v, timezone: 'America/Chicago' }),
      SETTINGS_ACTOR,
    );
    servers.presenceChanged();
    expect(heard).toHaveLength(2);
    expect([...servers.zonesInUse()].sort()).toEqual([
      'America/Chicago',
      'America/New_York',
      'Asia/Kolkata',
    ]);
  });

  it('tells the zones in use when a server without a zone takes another name of the default’s (fix round 3, Q4)', async () => {
    const { servers } = await servicesWith();
    const zones: Array<readonly string[]> = [];
    const changes: string[] = [];
    servers.onZonesInUseChange((inUse) => zones.push([...inUse].sort()));
    servers.onZoneChange((serverId, zone) => changes.push(zone));
    // The row has no zone (the default, America/New_York); its staff set a link name of it.
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, timezone: 'US/Eastern' }), SETTINGS_ACTOR);
    expect(servers.zoneOf(SETTINGS_SERVER)).toBe('US/Eastern');
    // No change of zone, but a name now in use that was not: what is kept per name follows.
    expect(changes).toEqual([]);
    expect(zones).toEqual([['America/New_York', 'US/Eastern']]);
    // Set again to the same name, nothing more is told.
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, timezone: 'US/Eastern' }), SETTINGS_ACTOR);
    expect(zones).toHaveLength(1);
  });

  it('logs a listener of a change of zone that throws, and the change stands', async () => {
    const { servers, entries } = await servicesWith();
    servers.onZoneChange(() => {
      throw new Error('listener broke');
    });
    const after = await servers.set(
      SETTINGS_SERVER,
      (v) => ({ ...v, timezone: 'Europe/Berlin' }),
      SETTINGS_ACTOR,
    );
    expect(after.timezone).toBe('Europe/Berlin');
    expect(servers.zoneOf(SETTINGS_SERVER)).toBe('Europe/Berlin');
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'a listener of a change of time zone failed' }),
    );
  });

  it("deletes the log's entries older than 30 days (the hourly upkeep)", async () => {
    const { servers, store, pass } = await servicesWith();
    await servers.set(SETTINGS_SERVER, (v) => ({ ...v, postNewGyms: true }), SETTINGS_ACTOR);
    pass(AUDIT_KEEP_MS);
    expect(await servers.sweepLog()).toBe(0);
    pass(1);
    expect(await servers.sweepLog()).toBe(1);
    expect(store.audit.rows).toEqual([]);
  });
});
